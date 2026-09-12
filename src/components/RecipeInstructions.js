import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import { getWeekDates } from '../utils/weekDates';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { ENDPOINTS, apiJson, ApiError } from '../config/api';
import { RECIPE_INSTRUCTIONS_SAMPLE_DATA } from '../utils/fallbackData';
import useCookingTimer from '../hooks/useCookingTimer';
import RecipeSelectionView from './cook/RecipeSelectionView';
import CookingView from './cook/CookingView';

const CHOOSE_RECIPE_WEBHOOK_URL = ENDPOINTS.chooseRecipeInstructions;
const GRAB_INSTRUCTIONS_WEBHOOK_URL = ENDPOINTS.grabInstructionsFast;

const RecipeInstructions = ({ onNavigate, recipeId, selectedMeals = [], debugMode = false }) => {
  // State management
  const [recipeData, setRecipeData] = useState(null);
  const [availableRecipes, setAvailableRecipes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(true);
  const [error, setError] = useState(null);
  // Bumped by the Retry button so the fetch effect actually re-runs — its
  // other deps don't change on retry, so the old button was a no-op that
  // silently dropped the user into the sample recipe.
  const [fetchNonce, setFetchNonce] = useState(0);
  const [debugInfo, setDebugInfo] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [showRecipeSelection, setShowRecipeSelection] = useState(true);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [usingSampleData, setUsingSampleData] = useState(false);

  // Feature 1: Wake Lock
  const wakeLockRef = useRef(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Feature 3: Swipe Navigation
  const touchStartRef = useRef({ x: 0, y: 0 });
  const swipeHintShownRef = useRef(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  // Feature 5: Compact Progress
  const [showStepDrawer, setShowStepDrawer] = useState(false);
  const [showAllIngredients, setShowAllIngredients] = useState(false);

  // Step Navigation Menu (full list with previews)
  const [showStepMenu, setShowStepMenu] = useState(false);

  // Feature 4: Auto-advance
  const autoAdvanceTimeoutRef = useRef(null);

  // Feature 7: State Persistence
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [savedSessionData, setSavedSessionData] = useState(null);

  // Feature 9: Kitchen Mode
  const [kitchenMode, setKitchenMode] = useState(() => {
    try {
      return localStorage.getItem('recipeKitchenMode') === 'true';
    } catch { return false; }
  });

  // Confetti
  const celebratedRef = useRef(false);

  // Use useRef to prevent double calls (more reliable than useState for React Strict Mode)
  const hasInitialized = useRef(false);
  const componentId = useRef(Math.random().toString(36).substr(2, 9));

  // Debug logging function (following the same pattern as other components)
  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, { timestamp, message, data }]);
    console.log(`[${timestamp}] ${message}`, data || '');
  };

  const sampleRecipeData = RECIPE_INSTRUCTIONS_SAMPLE_DATA;

  // --- Utility Functions ---

  const parseTimeMinutes = (instruction) => {
    if (instruction.time_minutes && typeof instruction.time_minutes === 'number' && instruction.time_minutes > 0) {
      return instruction.time_minutes;
    }
    if (instruction.time && typeof instruction.time === 'string') {
      const match = instruction.time.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    }
    return 0;
  };

  // --- Data Fetching (unchanged) ---

  // Log component initialization and fetch available recipes
  useEffect(() => {
    addDebugLog('RecipeInstructions component mounted', {
      recipeId: recipeId || 'none provided',
      componentId: componentId.current,
      port: window.location.port
    });

    const fetchAvailableRecipes = async () => {
      try {
        setIsLoadingRecipes(true);

        // Prioritize selectedMeals from Plan screen (if available)
        if (selectedMeals && selectedMeals.length > 0) {
          setAvailableRecipes(selectedMeals);
          addDebugLog('Using selectedMeals from Plan screen:', selectedMeals);
          setIsLoadingRecipes(false);
          return;
        }

        addDebugLog('No selectedMeals — fetching from choose_recipe_instructions webhook...');

        const weekData = getWeekDates();
        addDebugLog('Week information for recipe selection:', weekData);

        const queryParams = new URLSearchParams({
          weekStartDate: weekData.startDate,
          weekEndDate: weekData.endDate,
          weekDateRange: weekData.displayRange,
          timestamp: new Date().toISOString(),
        });

        const webhookURL = `${CHOOSE_RECIPE_WEBHOOK_URL}?${queryParams.toString()}`;
        addDebugLog('Choose recipes webhook URL:', webhookURL);

        const data = await apiJson(webhookURL, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          mode: 'cors'
        });

        addDebugLog('Choose recipes response received:', { ok: true });
        addDebugLog('Available recipes data received:', data);

        if (data && Array.isArray(data) && data.length > 0) {
          const transformedRecipes = data.map(recipe => ({
            id: recipe.recipe_id,
            recipeId: recipe.recipe_id,
            name: recipe.recipe_name,
            selectionId: recipe.selection_id,
            weekDateRange: recipe.WeekDateRange,
            notes: recipe.notes,
            createdAt: recipe.created_at,
            description: recipe.notes || `Delicious ${recipe.recipe_name.toLowerCase()} recipe`,
            totalTime: '30-45 mins'
          }));

          setAvailableRecipes(transformedRecipes);
          addDebugLog('Available recipes loaded and transformed from webhook:', transformedRecipes);
        } else {
          setAvailableRecipes(selectedMeals);
          addDebugLog('Using selectedMeals as fallback - webhook returned empty or invalid data');
        }

      } catch (error) {
        addDebugLog('Error fetching available recipes:', error.message);
        setAvailableRecipes(selectedMeals);
        addDebugLog('Using selectedMeals as fallback due to error');
      } finally {
        setIsLoadingRecipes(false);
      }
    };

    fetchAvailableRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle recipe selection
  const handleRecipeSelect = (recipeId) => {
    const selectedRecipe = availableRecipes.find(recipe => recipe.recipeId === recipeId || recipe.id === recipeId);
    setSelectedRecipeId(recipeId);
    setShowRecipeSelection(false);
    addDebugLog('Recipe selected for instructions', {
      recipeId,
      recipeName: selectedRecipe?.name || 'Unknown',
      selectionId: selectedRecipe?.selectionId
    });
  };

  // Fetch recipe instructions from webhook (only when recipe is selected)
  useEffect(() => {
    if (showRecipeSelection || !selectedRecipeId) return;

    if (hasInitialized.current) {
      addDebugLog('Skipping duplicate useEffect call', {
        reason: 'Already initialized',
        componentId: componentId.current,
        port: window.location.port,
        selectedRecipeId
      });
      return;
    }

    const fetchRecipeInstructions = async () => {
      try {
        hasInitialized.current = true;
        addDebugLog('Marking component as initialized', {
          componentId: componentId.current,
          port: window.location.port
        });
        setIsLoading(true);
        setError(null);
        const selectedRecipe = availableRecipes.find(recipe => recipe.recipeId === selectedRecipeId || recipe.id === selectedRecipeId);
        addDebugLog('Fetching recipe instructions from n8n webhook...');
        addDebugLog('Selected recipe details:', {
          recipeId: selectedRecipeId,
          recipeName: selectedRecipe?.name || 'Unknown',
          selectionId: selectedRecipe?.selectionId
        });

        const weekData = getWeekDates();
        addDebugLog('Week information:', weekData);

        const queryParams = new URLSearchParams({
          recipe_id: selectedRecipeId,
          weekStartDate: weekData.startDate,
          weekEndDate: weekData.endDate,
          weekDateRange: weekData.displayRange,
          timestamp: new Date().toISOString(),
        });

        const webhookURL = `${GRAB_INSTRUCTIONS_WEBHOOK_URL}?${queryParams.toString()}`;
        addDebugLog('Grab instructions webhook URL:', webhookURL);

        const data = await apiJson(webhookURL, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          mode: 'cors',
          timeout: 30000
        });

        addDebugLog('Response received:', { ok: true });
        addDebugLog('Recipe instructions data received:', data);
        addDebugLog('Data structure analysis:', {
          isArray: Array.isArray(data),
          hasOutput: data && data[0] && data[0].output,
          outputIsArray: data && data[0] && data[0].output && Array.isArray(data[0].output),
          dataKeys: data ? Object.keys(data) : 'null',
          firstItemKeys: data && data[0] ? Object.keys(data[0]) : 'null',
          dataType: typeof data
        });

        // Handle response: [{ output: [...], all_ingredients: [...] }]
        const responseObj = Array.isArray(data) ? data[0] : data;
        const outputSteps = responseObj?.output;

        const recipeInstructions = (Array.isArray(outputSteps) ? outputSteps : []).filter(step =>
          step.recipe_id === selectedRecipeId || step.recipe_id === parseInt(selectedRecipeId)
        );

        // An empty step list would crash the step renderer (instructions[0]
        // undefined) — treat it like an unexpected payload instead.
        if (recipeInstructions.length > 0) {
          const allIngredients = responseObj.all_ingredients || [];

          addDebugLog('Recipe data received:', {
            totalSteps: recipeInstructions.length,
            totalIngredients: allIngredients.length,
          });

          const transformedData = {
            id: selectedRecipeId,
            name: selectedRecipe?.name || 'Recipe Instructions',
            recipe_name: selectedRecipe?.name || 'Recipe Instructions',
            description: `Step-by-step cooking instructions for ${selectedRecipe?.name || 'your recipe'}`,
            totalTime: `${recipeInstructions.reduce((total, step) => total + (step.time_minutes || 0), 0)} mins`,
            allIngredients,
            instructions: recipeInstructions.map(step => ({
              id: step.step_number,
              step: step.step_number,
              instruction: step.instruction_text,
              time: step.time_minutes ? `${step.time_minutes} mins` : 'As needed',
              time_minutes: step.time_minutes || 0,
              ingredients: step.ingredients_used || []
            }))
          };

          setRecipeData(transformedData);
          addDebugLog('Recipe instructions loaded and transformed from webhook:', {
            recipeId: selectedRecipeId,
            totalSteps: transformedData.instructions.length,
            totalTime: transformedData.totalTime,
            transformedData: transformedData
          });
        } else {
          addDebugLog('Webhook data format unexpected, using sample data as fallback');
          addDebugLog('Expected format: [{ output: [...] }], received:', data);
          setRecipeData(sampleRecipeData);
          setUsingSampleData(true);
          toast.error('Could not load recipe instructions — showing sample recipe instead', { duration: 5000 });
        }

      } catch (error) {
        let errorMessage = error.message;
        const timedOut = error?.name === 'AbortError' || (error instanceof ApiError && error.code === 'timeout');
        if (timedOut) {
          errorMessage = 'Request timed out after 30 seconds';
          addDebugLog('Webhook request timed out');
        } else {
          addDebugLog('Error fetching recipe instructions:', error.message);
        }

        setError(errorMessage);
        addDebugLog('Error loading recipe instructions');
      } finally {
        setIsLoading(false);
        addDebugLog('Loading state set to false');
      }
    };

    fetchRecipeInstructions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipeId, showRecipeSelection, fetchNonce]);

  // Derived values
  const activeRecipeData = recipeData || sampleRecipeData;
  const totalSteps = activeRecipeData.instructions.length;
  // Clamped read: the normalizing effect below runs one render later, and a
  // resumed out-of-range index must not crash that first render.
  const currentInstruction = activeRecipeData.instructions[Math.min(currentStep, Math.max(0, totalSteps - 1))];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep >= totalSteps - 1;

  // A resumed step index can exceed the step count when the recipe data
  // changed since the session was saved — clamp instead of crashing.
  useEffect(() => {
    if (totalSteps > 0 && currentStep >= totalSteps) {
      setCurrentStep(totalSteps - 1);
    }
  }, [totalSteps, currentStep]);

  // --- Feature Effects ---

  // Feature 1: Wake Lock (only when viewing instructions)
  useEffect(() => {
    if (showRecipeSelection || !selectedRecipeId) return;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          setWakeLockActive(true);
          wakeLockRef.current.addEventListener('release', () => {
            setWakeLockActive(false);
          });
        }
      } catch { /* Wake Lock not supported or denied */ }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [showRecipeSelection, selectedRecipeId]);

  // Feature 9: Kitchen Mode persistence
  useEffect(() => {
    try {
      localStorage.setItem('recipeKitchenMode', kitchenMode.toString());
    } catch { /* localStorage full or unavailable */ }
  }, [kitchenMode]);

  const {
    timerSeconds, timerRunning, timerStepIndex,
    startTimer, pauseResumeTimer: handlePauseResumeTimer,
    cancelTimer: handleCancelTimer, resetTimerState, restorePausedTimer,
  } = useCookingTimer();

  // Feature 7: State persistence - save
  useEffect(() => {
    if (!selectedRecipeId || showRecipeSelection) return;

    try {
      const stateToSave = {
        selectedRecipeId,
        currentStep,
        completedSteps: Array.from(completedSteps),
        timerSeconds,
        timerStepIndex,
        savedAt: Date.now(),
        recipeName: activeRecipeData?.recipe_name || '',
      };
      localStorage.setItem('recipeInstructionState', JSON.stringify(stateToSave));
    } catch { /* localStorage full */ }
  }, [currentStep, completedSteps, selectedRecipeId, timerSeconds, timerStepIndex, showRecipeSelection, activeRecipeData]);

  // Feature 7: State persistence - load on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('recipeInstructionState');
      if (saved) {
        const parsed = JSON.parse(saved);
        const ageHours = (Date.now() - parsed.savedAt) / (1000 * 60 * 60);
        if (ageHours < 24 && parsed.selectedRecipeId) {
          setSavedSessionData(parsed);
          setShowResumePrompt(true);
        } else {
          localStorage.removeItem('recipeInstructionState');
        }
      }
    } catch {
      localStorage.removeItem('recipeInstructionState');
    }
  }, []);

  // Feature 3: Swipe hint (once per session)
  useEffect(() => {
    if (showRecipeSelection || swipeHintShownRef.current) return;
    if (!recipeData) return;

    const hintShown = localStorage.getItem('recipeSwipeHintShown');
    if (!hintShown) {
      setShowSwipeHint(true);
      swipeHintShownRef.current = true;
      localStorage.setItem('recipeSwipeHintShown', 'true');
      const timeout = setTimeout(() => setShowSwipeHint(false), 3000);
      return () => clearTimeout(timeout);
    }
  }, [showRecipeSelection, recipeData]);

  // Confetti celebration when all steps complete
  useEffect(() => {
    const allComplete = completedSteps.size === totalSteps && totalSteps > 0;

    if (allComplete && !celebratedRef.current) {
      celebratedRef.current = true;

      const colors = ['#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'];
      const fireConfetti = () => {
        confetti({ particleCount: 80, spread: 70, origin: { x: 0.1, y: 0.6 }, colors });
        confetti({ particleCount: 80, spread: 70, origin: { x: 0.9, y: 0.6 }, colors });
      };
      fireConfetti();
      setTimeout(fireConfetti, 300);
      setTimeout(() => {
        confetti({ particleCount: 120, spread: 100, origin: { x: 0.5, y: 0.4 }, colors });
      }, 600);

      toast.success('Recipe complete! Time to eat!', {
        duration: 5000,
        style: { fontSize: '16px', fontWeight: 'bold' },
      });
    }

    if (!allComplete) {
      celebratedRef.current = false;
    }
  }, [completedSteps.size, totalSteps]);

  // --- Handler Functions ---

  const handlePrevious = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    if (!isFirstStep) setCurrentStep(currentStep - 1);
  };

  const handleNext = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    if (!isLastStep) setCurrentStep(currentStep + 1);
  };

  // Feature 4: Auto-advance on step complete
  const handleStepComplete = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const newCompleted = new Set(completedSteps);
    const wasCompleted = completedSteps.has(currentStep);

    if (wasCompleted) {
      newCompleted.delete(currentStep);
    } else {
      newCompleted.add(currentStep);
    }
    setCompletedSteps(newCompleted);

    // Auto-advance only when marking complete (not un-marking) and not the last step
    if (!wasCompleted && !isLastStep) {
      const nextStepNum = currentStep + 2;
      toast(`Moving to step ${nextStepNum}...`, {
        duration: 1000,
        style: { fontSize: '14px' },
      });
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        setCurrentStep(prev => Math.min(prev + 1, totalSteps - 1));
        autoAdvanceTimeoutRef.current = null;
      }, 500);
    }
  };

  // Handle back to recipe selection
  const handleBackToSelection = () => {
    if (completedSteps.size > 0 && completedSteps.size < totalSteps) {
      const confirmed = window.confirm(
        `You have ${completedSteps.size} of ${totalSteps} steps completed. Leave this recipe?`
      );
      if (!confirmed) return;
    }

    // Cancel running timer
    if (timerRunning) {
      resetTimerState();
    }

    // Cancel pending auto-advance
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    // Clear persistence
    try { localStorage.removeItem('recipeInstructionState'); } catch {}

    // Reset state
    setShowRecipeSelection(true);
    setSelectedRecipeId(null);
    setRecipeData(null);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setShowStepDrawer(false);
    setShowStepMenu(false);
    hasInitialized.current = false;
    celebratedRef.current = false;
    setUsingSampleData(false);
    addDebugLog('Back to recipe selection (state cleared)');
  };

  const handleBackToApp = () => {
    onNavigate('plan');
  };

  const handleJumpToStep = (stepIndex) => {
    setCurrentStep(stepIndex);
  };

  // Feature 6: Timer handlers
  const handleStartTimer = () => {
    startTimer(parseTimeMinutes(currentInstruction), currentStep);
  };

  // Feature 3: Swipe handlers
  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && currentStep < totalSteps - 1) {
        setCurrentStep(prev => prev + 1);
      } else if (deltaX > 0 && currentStep > 0) {
        setCurrentStep(prev => prev - 1);
      }
    }
  }, [currentStep, totalSteps]);

  // Feature 9: Kitchen mode toggle
  const handleToggleKitchenMode = () => {
    setKitchenMode(prev => !prev);
  };

  // Feature 7: Resume session handlers
  const handleResumeSession = () => {
    if (!savedSessionData) return;

    setSelectedRecipeId(savedSessionData.selectedRecipeId);
    setShowRecipeSelection(false);
    setCurrentStep(savedSessionData.currentStep || 0);
    setCompletedSteps(new Set(savedSessionData.completedSteps || []));

    if (savedSessionData.timerSeconds > 0) {
      restorePausedTimer(savedSessionData.timerSeconds, savedSessionData.timerStepIndex);
    }

    setShowResumePrompt(false);
    setSavedSessionData(null);
    toast('Session resumed!', { duration: 2000 });
  };

  const handleDismissResume = () => {
    setShowResumePrompt(false);
    setSavedSessionData(null);
    try { localStorage.removeItem('recipeInstructionState'); } catch {}
  };

  // Feature 5: Step drawer toggle
  const handleToggleStepDrawer = () => {
    setShowStepDrawer(prev => !prev);
  };

  const handleRecipeCompleteBack = () => {
    try { localStorage.removeItem('recipeInstructionState'); } catch {}
    handleBackToApp();
  };

  // --- Render: Loading States ---

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center transition-colors duration-200">
        <div className="bg-surface rounded-2xl shadow-warm p-8 text-center max-w-md mx-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <h2 className="text-xl font-display font-bold text-heading mb-2">Loading Recipe Instructions</h2>
          <p className="text-body">Fetching cooking steps...</p>
          <button
            onClick={() => { setShowRecipeSelection(true); setSelectedRecipeId(null); setRecipeData(null); setCurrentStep(0); setCompletedSteps(new Set()); hasInitialized.current = false; }}
            className="mt-4 px-4 py-2 text-body bg-background rounded-xl hover:bg-background transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (isLoadingRecipes) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center transition-colors duration-200">
        <div className="bg-surface rounded-2xl shadow-warm p-8 text-center max-w-md mx-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <h2 className="text-xl font-display font-bold text-heading mb-2">Loading Available Recipes</h2>
          <p className="text-body">Fetching your selected meals for this week...</p>
          <button
            onClick={handleBackToApp}
            className="mt-4 px-4 py-2 text-body bg-background rounded-xl hover:bg-background transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (error && !recipeData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center transition-colors duration-200">
        <div className="bg-surface rounded-2xl shadow-warm p-8 text-center max-w-md mx-4">
          <div className="text-danger mb-4">
            <AlertCircle size={48} className="mx-auto" />
          </div>
          <h2 className="text-xl font-display font-bold text-heading mb-2">Unable to Load Recipe</h2>
          <p className="text-body mb-4">There was an error loading the recipe instructions.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { hasInitialized.current = false; setError(null); setShowRecipeSelection(true); setSelectedRecipeId(null); }}
              className="px-5 py-3 bg-background text-body rounded-xl hover:bg-background transition-colors font-medium"
            >
              Back to Recipes
            </button>
            <button
              onClick={() => { hasInitialized.current = false; setError(null); setFetchNonce(n => n + 1); }}
              className="px-5 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover transition-colors font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render: Recipe Selection Screen ---

  if (showRecipeSelection) {
    return <RecipeSelectionView
      availableRecipes={availableRecipes} debugMode={debugMode}
      showDebug={showDebug} setShowDebug={setShowDebug} debugInfo={debugInfo}
      showResumePrompt={showResumePrompt} savedSessionData={savedSessionData}
      handleResumeSession={handleResumeSession} handleDismissResume={handleDismissResume}
      handleBackToApp={handleBackToApp} onNavigate={onNavigate}
      handleRecipeSelect={handleRecipeSelect}
    />;
  }

  // --- Render: Step-by-Step Instruction View (Kitchen-Friendly) ---

  return <CookingView
    kitchenMode={kitchenMode} handleBackToSelection={handleBackToSelection}
    activeRecipeData={activeRecipeData} currentStep={currentStep} totalSteps={totalSteps}
    usingSampleData={usingSampleData} wakeLockActive={wakeLockActive}
    showStepMenu={showStepMenu} setShowStepMenu={setShowStepMenu}
    handleToggleKitchenMode={handleToggleKitchenMode} debugMode={debugMode}
    showDebug={showDebug} setShowDebug={setShowDebug} debugInfo={debugInfo}
    completedSteps={completedSteps} handleJumpToStep={handleJumpToStep}
    handleToggleStepDrawer={handleToggleStepDrawer} showStepDrawer={showStepDrawer}
    setShowStepDrawer={setShowStepDrawer} showAllIngredients={showAllIngredients}
    setShowAllIngredients={setShowAllIngredients} showSwipeHint={showSwipeHint}
    handleTouchStart={handleTouchStart} handleTouchEnd={handleTouchEnd}
    handleStepComplete={handleStepComplete} currentInstruction={currentInstruction}
    parseTimeMinutes={parseTimeMinutes} handleStartTimer={handleStartTimer}
    handleNext={handleNext} isLastStep={isLastStep} handlePrevious={handlePrevious}
    isFirstStep={isFirstStep} handleRecipeCompleteBack={handleRecipeCompleteBack}
    timerRunning={timerRunning} timerSeconds={timerSeconds} timerStepIndex={timerStepIndex}
    setCurrentStep={setCurrentStep} handlePauseResumeTimer={handlePauseResumeTimer}
    handleCancelTimer={handleCancelTimer}
  />;
};

export default RecipeInstructions;
