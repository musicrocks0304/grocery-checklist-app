import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeft, Clock, CheckCircle, AlertCircle, Wifi, ChevronDown, ChevronUp, ChefHat, Utensils, Play, Smartphone, Sun, Moon, Timer, Pause, X, List } from 'lucide-react';
import { getWeekDates } from '../utils/weekDates';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { ENDPOINTS, apiFetch } from '../config/api';
import { RECIPE_INSTRUCTIONS_SAMPLE_DATA } from '../utils/fallbackData';

const CHOOSE_RECIPE_WEBHOOK_URL = ENDPOINTS.chooseRecipeInstructions;
const GRAB_INSTRUCTIONS_WEBHOOK_URL = ENDPOINTS.grabInstructionsFast;

const RecipeInstructions = ({ onNavigate, recipeId, selectedMeals = [], debugMode = false }) => {
  // State management
  const [recipeData, setRecipeData] = useState(null);
  const [availableRecipes, setAvailableRecipes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(true);
  const [error, setError] = useState(null);
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

  // Step Navigation Menu (full list with previews)
  const [showStepMenu, setShowStepMenu] = useState(false);

  // Feature 6: Timer
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStepIndex, setTimerStepIndex] = useState(null);
  const timerIntervalRef = useRef(null);

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

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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

        const response = await apiFetch(webhookURL, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          mode: 'cors'
        });

        addDebugLog('Choose recipes response received:', {
          status: response.status,
          statusText: response.statusText,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
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

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await apiFetch(webhookURL, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          mode: 'cors',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        addDebugLog('Response received:', {
          status: response.status,
          statusText: response.statusText,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
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

        if (outputSteps && Array.isArray(outputSteps)) {
          const recipeInstructions = outputSteps.filter(step =>
            step.recipe_id === selectedRecipeId || step.recipe_id === parseInt(selectedRecipeId)
          );
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
        if (error.name === 'AbortError') {
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
  }, [selectedRecipeId, showRecipeSelection]);

  // Derived values
  const activeRecipeData = recipeData || sampleRecipeData;
  const currentInstruction = activeRecipeData.instructions[currentStep];
  const totalSteps = activeRecipeData.instructions.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

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

  // Feature 6: Timer countdown
  useEffect(() => {
    if (timerRunning && timerSeconds > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            setTimerRunning(false);
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
            toast.success('Timer complete! This step is done.', {
              duration: 6000,
              style: { fontSize: '16px', fontWeight: 'bold' },
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

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
      setTimerRunning(false);
      setTimerSeconds(0);
      setTimerStepIndex(null);
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
    onNavigate('grocery');
  };

  const handleJumpToStep = (stepIndex) => {
    setCurrentStep(stepIndex);
  };

  // Feature 6: Timer handlers
  const handleStartTimer = () => {
    const minutes = parseTimeMinutes(currentInstruction);
    if (minutes <= 0) return;

    if (timerRunning) {
      const confirmed = window.confirm('A timer is already running. Replace it?');
      if (!confirmed) return;
    }

    setTimerSeconds(minutes * 60);
    setTimerStepIndex(currentStep);
    setTimerRunning(true);
    toast(`Timer started: ${minutes} minute${minutes !== 1 ? 's' : ''}`, {
      duration: 2000,
    });
  };

  const handlePauseResumeTimer = () => {
    setTimerRunning(prev => !prev);
  };

  const handleCancelTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(0);
    setTimerStepIndex(null);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
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
      setTimerSeconds(savedSessionData.timerSeconds);
      setTimerStepIndex(savedSessionData.timerStepIndex);
      setTimerRunning(false);
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
              onClick={() => { hasInitialized.current = false; setError(null); }}
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
    return (
      <div className="min-h-screen bg-background transition-colors duration-200">
        {/* Header */}
        <div className="bg-surface shadow-sm border-b border-default">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={handleBackToApp}
                className="flex items-center gap-2 text-body hover:text-heading transition-colors"
              >
                <ArrowLeft size={20} />
                <span className="font-medium">Back to Grocery List</span>
              </button>
              <div className="text-center">
                <h1 className="text-lg font-display font-bold text-heading">
                  Select Recipe for Instructions
                </h1>
                <p className="text-sm text-muted">
                  Choose which recipe you'd like to cook
                </p>
              </div>
              <div className="flex items-center gap-2">
                {debugMode && (
                  <button
                    onClick={() => setShowDebug(!showDebug)}
                    className="flex items-center gap-1 text-sm text-body hover:text-heading transition-colors"
                  >
                    <Wifi size={16} />
                    <span className="hidden sm:inline">Debug</span>
                    {showDebug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Debug Panel */}
        {debugMode && showDebug && (
          <div className="bg-gray-900 text-white border-b border-default">
            <div className="max-w-4xl mx-auto px-4 py-4">
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
                <Wifi size={20} />
                Recipe Selection Debug Information
              </h3>
              <div className="space-y-1 text-sm font-mono max-h-60 overflow-y-auto">
                {debugInfo.map((log, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="text-gray-400">[{log.timestamp}]</span>
                    <span className="text-gray-200">{log.message}</span>
                    {log.data && (
                      <span className="text-gray-500">
                        {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data}
                      </span>
                    )}
                  </div>
                ))}
                {debugInfo.length === 0 && (
                  <div className="text-gray-400">No debug information yet...</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recipe Selection Content */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Feature 7: Resume cooking banner */}
          {showResumePrompt && savedSessionData && (
            <div className="mb-6 bg-accent-light border border-accent rounded-2xl p-4 transition-colors duration-200">
              <div className="flex items-start gap-3">
                <ChefHat size={24} className="text-accent flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-bold text-heading">Continue cooking?</h3>
                  <p className="text-sm text-body mt-1">
                    You were on step {(savedSessionData.currentStep || 0) + 1} of{' '}
                    {savedSessionData.recipeName || 'your recipe'}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleResumeSession}
                      className="flex-1 px-4 py-2.5 bg-accent text-white rounded-xl font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
                    >
                      Resume
                    </button>
                    <button
                      onClick={handleDismissResume}
                      className="px-4 py-2.5 bg-background text-body rounded-xl font-medium hover:bg-background transition-colors active:scale-[0.98]"
                    >
                      Start Fresh
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {availableRecipes.length === 0 ? (
            <div className="text-center py-12">
              <ChefHat size={64} className="mx-auto text-muted mb-4" />
              <h2 className="text-xl font-semibold text-body mb-2">No Recipes Available</h2>
              <p className="text-muted mb-6">
                You need to select some meals first from the AI Meal Planner.
              </p>
              <button
                onClick={() => onNavigate('chatbot')}
                className="px-6 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover transition-colors font-medium"
              >
                Go to Meal Planner
              </button>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-display font-bold text-heading mb-2">Available Recipes</h2>
                <p className="text-body">
                  Select a recipe to view step-by-step cooking instructions
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {availableRecipes.map((meal, index) => (
                  <div key={meal.id || index} className="bg-surface rounded-2xl shadow-warm border border-default hover:shadow-warm-lg transition-shadow transition-colors duration-200">
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <Utensils className="text-accent flex-shrink-0" size={24} />
                        {meal.totalTime && (
                          <div className="flex items-center gap-1 text-sm text-muted">
                            <Clock size={16} />
                            {meal.totalTime}
                          </div>
                        )}
                      </div>

                      <h3 className="text-lg font-semibold text-heading mb-2">
                        {meal.name}
                      </h3>

                      {meal.description && (
                        <p className="text-body text-sm mb-4 line-clamp-3">
                          {meal.description}
                        </p>
                      )}

                      <button
                        onClick={() => handleRecipeSelect(meal.recipeId || meal.id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover transition-colors font-medium"
                      >
                        <Play size={18} />
                        Start Cooking
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Render: Step-by-Step Instruction View (Kitchen-Friendly) ---

  return (
    <div className={`min-h-screen transition-colors duration-200 ${kitchenMode ? 'bg-gray-900' : 'bg-background'}`}>
      {/* Simplified Sticky Header (Feature 8) */}
      <div className={`sticky top-0 z-20 shadow-sm border-b ${
        kitchenMode ? 'bg-gray-800 border-gray-700' : 'bg-surface border-default'
      }`}>
        <div className="max-w-4xl mx-auto px-3 h-14 flex items-center gap-3">
          {/* Back arrow only */}
          <button
            onClick={handleBackToSelection}
            className={`p-2 -ml-1 rounded-xl transition-colors ${
              kitchenMode ? 'text-gray-300 hover:bg-gray-700' : 'text-body hover:bg-background'
            }`}
            aria-label="Go back"
          >
            <ArrowLeft size={22} />
          </button>

          {/* Recipe name + step indicator */}
          <div className="flex-1 min-w-0">
            <h1 className={`font-bold truncate ${
              kitchenMode ? 'text-white text-base' : 'text-heading text-sm'
            }`}>
              {activeRecipeData.recipe_name}
            </h1>
            <p className={`text-xs ${kitchenMode ? 'text-gray-400' : 'text-muted'}`}>
              Step {currentStep + 1} of {totalSteps}
              {usingSampleData && <span className="ml-2 text-amber-500 font-medium">(Sample)</span>}
            </p>
          </div>

          {/* Wake lock indicator */}
          {wakeLockActive && (
            <Smartphone size={16} className="text-primary flex-shrink-0" title="Screen stays on" />
          )}

          {/* Step menu toggle */}
          <button
            onClick={() => setShowStepMenu(prev => !prev)}
            className={`p-2 rounded-xl transition-colors ${
              showStepMenu
                ? (kitchenMode ? 'text-amber-400 bg-gray-700' : 'text-accent bg-accent-light')
                : (kitchenMode ? 'text-gray-300 hover:bg-gray-700' : 'text-muted hover:bg-background')
            }`}
            title="All Steps"
            aria-label="All steps"
          >
            <List size={20} />
          </button>

          {/* Kitchen mode toggle (Feature 9) */}
          <button
            onClick={handleToggleKitchenMode}
            className={`p-2 rounded-xl transition-colors ${
              kitchenMode
                ? 'text-amber-400 bg-gray-700 hover:bg-gray-600'
                : 'text-muted hover:bg-background'
            }`}
            title={kitchenMode ? 'Exit Kitchen Mode' : 'Kitchen Mode'}
            aria-label={kitchenMode ? 'Exit kitchen mode' : 'Enter kitchen mode'}
          >
            {kitchenMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* Debug toggle */}
          {debugMode && (
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="flex items-center gap-1 text-sm text-muted hover:text-body"
            >
              <Wifi size={16} />
              {showDebug ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Debug Panel */}
      {debugMode && showDebug && (
        <div className="bg-gray-900 text-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Wifi size={20} />
              Recipe Instructions Debug Information
            </h3>
            <div className="space-y-1 text-sm font-mono max-h-60 overflow-y-auto">
              {debugInfo.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-gray-400">[{log.timestamp}]</span>
                  <span className="text-gray-200">{log.message}</span>
                  {log.data && (
                    <span className="text-gray-500">
                      {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data}
                    </span>
                  )}
                </div>
              ))}
              {debugInfo.length === 0 && (
                <div className="text-gray-400">No debug information yet...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step Navigation Menu (slide-down panel with all steps) */}
      {showStepMenu && (
        <div className={`border-b ${kitchenMode ? 'bg-gray-800 border-gray-700' : 'bg-surface border-default'}`}>
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-bold text-sm ${kitchenMode ? 'text-gray-300' : 'text-body'}`}>
                All Steps
              </h3>
              <span className={`text-xs ${kitchenMode ? 'text-gray-500' : 'text-muted'}`}>
                {completedSteps.size}/{totalSteps} done
              </span>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {activeRecipeData.instructions.map((step, index) => (
                <button
                  key={index}
                  onClick={() => { handleJumpToStep(index); setShowStepMenu(false); }}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all
                    min-h-[48px] active:scale-[0.98] ${
                    index === currentStep
                      ? (kitchenMode
                          ? 'bg-amber-500/20 border border-amber-500/40'
                          : 'bg-accent-light border border-accent')
                      : completedSteps.has(index)
                        ? (kitchenMode
                            ? 'bg-gray-700/50 border border-gray-600'
                            : 'bg-primary-light border border-primary-border')
                        : (kitchenMode
                            ? 'bg-gray-700/30 border border-gray-700 hover:bg-gray-700/50'
                            : 'bg-background border border-default hover:bg-background')
                  }`}
                >
                  {/* Step number circle */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 ${
                    index === currentStep
                      ? (kitchenMode ? 'bg-amber-400 text-gray-900' : 'bg-accent text-white')
                      : completedSteps.has(index)
                        ? 'bg-primary text-white'
                        : (kitchenMode ? 'bg-gray-600 text-gray-400' : 'bg-default text-body')
                  }`}>
                    {completedSteps.has(index) ? <CheckCircle size={14} /> : index + 1}
                  </div>

                  {/* Step preview text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      index === currentStep
                        ? (kitchenMode ? 'text-amber-400' : 'text-accent')
                        : completedSteps.has(index)
                          ? (kitchenMode ? 'text-gray-500 line-through' : 'text-muted line-through')
                          : (kitchenMode ? 'text-gray-300' : 'text-body')
                    }`}>
                      {step.instruction.length > 60 ? step.instruction.substring(0, 60) + '...' : step.instruction}
                    </p>
                    <p className={`text-xs mt-0.5 ${kitchenMode ? 'text-gray-500' : 'text-muted'}`}>
                      {step.time}
                    </p>
                  </div>

                  {/* Current indicator */}
                  {index === currentStep && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                      kitchenMode ? 'bg-amber-400/20 text-amber-400' : 'bg-accent-light text-accent'
                    }`}>
                      Current
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Compact Progress Bar with Expandable Drawer (Feature 5) */}
      <div className={`border-b ${kitchenMode ? 'bg-gray-800 border-gray-700' : 'bg-surface border-default'}`}>
        <div className="max-w-4xl mx-auto px-4 py-2">
          {/* Thin progress bar */}
          <div className={`h-1.5 rounded-full overflow-hidden ${kitchenMode ? 'bg-gray-700' : 'bg-default'}`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                kitchenMode ? 'bg-amber-400' : 'bg-accent'
              }`}
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>

          {/* Step counter + expand toggle */}
          <button
            onClick={handleToggleStepDrawer}
            className={`w-full flex items-center justify-center gap-2 mt-1.5 py-1 text-sm font-medium transition-colors ${
              kitchenMode ? 'text-gray-400' : 'text-muted'
            }`}
          >
            <span>Step {currentStep + 1} of {totalSteps}</span>
            <span className="text-xs">({completedSteps.size} done)</span>
            {showStepDrawer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* Expandable step drawer */}
          {showStepDrawer && (
            <div className="pb-2 pt-1">
              <div className="flex flex-wrap gap-1.5 justify-center">
                {activeRecipeData.instructions.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => { handleJumpToStep(index); setShowStepDrawer(false); }}
                    className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                      index === currentStep
                        ? (kitchenMode
                            ? 'bg-amber-400 text-gray-900 scale-110'
                            : 'bg-accent text-white shadow-warm scale-110')
                        : completedSteps.has(index)
                          ? 'bg-primary text-white'
                          : (kitchenMode
                              ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                              : 'bg-default text-body hover:bg-default')
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Swipe hint overlay (Feature 3) */}
      {showSwipeHint && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="bg-white/90 rounded-2xl px-6 py-3 shadow-warm text-center">
            <p className="text-body font-medium flex items-center gap-2">
              <ChevronLeft size={20} /> Swipe left or right to navigate <ChevronRight size={20} />
            </p>
          </div>
        </div>
      )}

      {/* Main Content - Swipeable area (Features 2, 3) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="max-w-4xl mx-auto px-4 py-4"
      >
        <div className={`rounded-2xl shadow-warm overflow-hidden transition-colors duration-200 ${
          kitchenMode ? 'bg-gray-800 border border-gray-700' : 'bg-surface'
        }`}>
          {/* Step Header */}
          <div className={`p-5 ${
            kitchenMode
              ? 'bg-gray-800 border-b border-gray-700'
              : 'bg-accent'
          } text-white`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className={`font-bold ${kitchenMode ? 'text-2xl text-amber-400' : 'text-xl'}`}>
                  Step {currentStep + 1}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <Clock size={16} className={kitchenMode ? 'text-gray-400' : 'text-white/70'} />
                  <span className={`text-sm ${kitchenMode ? 'text-gray-400' : 'text-white/70'}`}>
                    {currentInstruction.time}
                  </span>
                </div>
              </div>

              <button
                onClick={handleStepComplete}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all
                  min-h-[48px] active:scale-[0.98] ${
                  completedSteps.has(currentStep)
                    ? 'bg-primary text-white'
                    : (kitchenMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-white/20 text-white hover:bg-white/30')
                }`}
              >
                <CheckCircle size={18} />
                {completedSteps.has(currentStep) ? 'Done' : 'Complete'}
              </button>
            </div>

            {/* Timer button (Feature 6) - only if step has time > 0 */}
            {parseTimeMinutes(currentInstruction) > 0 && (
              <button
                onClick={handleStartTimer}
                className={`mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                  font-medium min-h-[48px] active:scale-[0.98] transition-all ${
                  kitchenMode
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-white/20 text-white border border-white/30 hover:bg-white/30'
                }`}
              >
                <Timer size={18} />
                Start {currentInstruction.time} Timer
              </button>
            )}
          </div>

          {/* Instruction Text (Feature 2: Larger Text) */}
          <div className={`p-5 ${kitchenMode ? 'bg-gray-800' : ''}`}>
            <p className={`leading-relaxed font-medium ${
              kitchenMode
                ? 'text-2xl md:text-3xl text-white'
                : 'text-xl md:text-2xl text-body'
            }`}>
              {currentInstruction.instruction}
            </p>
          </div>

          {/* Ingredients for this step */}
          {currentInstruction.ingredients && currentInstruction.ingredients.length > 0 && (
            <div className="px-5 pb-5">
              <div className={`rounded-xl p-4 ${
                kitchenMode
                  ? 'bg-gray-700 border border-gray-600'
                  : 'bg-accent-light border border-accent'
              }`}>
                <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${
                  kitchenMode ? 'text-amber-400' : 'text-accent'
                }`}>
                  <ChefHat size={16} />
                  Ingredients for this step:
                </h3>
                <div className="flex flex-wrap gap-2">
                  {currentInstruction.ingredients.map((ingredient, index) => (
                    <span
                      key={index}
                      className={`inline-flex items-center px-3 py-1.5 rounded-full font-medium ${
                        kitchenMode
                          ? 'text-sm bg-gray-600 text-gray-200 border border-gray-500'
                          : 'text-sm bg-accent-light text-accent border border-accent'
                      }`}
                    >
                      {ingredient}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Navigation - Stacked vertically (Feature 2: Large Touch Targets) */}
          <div className={`px-5 py-4 space-y-3 ${
            kitchenMode ? 'bg-gray-900' : 'bg-background'
          }`}>
            {/* Next button (primary, on top) */}
            <button
              onClick={handleNext}
              disabled={isLastStep}
              className={`w-full flex items-center justify-center gap-2 min-h-[56px] rounded-xl
                font-bold text-lg transition-all active:scale-[0.98] ${
                isLastStep
                  ? (kitchenMode ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-default text-muted cursor-not-allowed')
                  : (kitchenMode
                      ? 'bg-amber-500 text-gray-900 hover:bg-amber-400'
                      : 'bg-accent text-white hover:bg-accent-hover')
              }`}
            >
              Next Step
              <ChevronRight size={22} />
            </button>

            {/* Previous button (secondary, below) */}
            <button
              onClick={handlePrevious}
              disabled={isFirstStep}
              className={`w-full flex items-center justify-center gap-2 min-h-[56px] rounded-xl
                font-medium text-lg transition-all active:scale-[0.98] ${
                isFirstStep
                  ? (kitchenMode ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-default text-muted cursor-not-allowed')
                  : (kitchenMode
                      ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                      : 'bg-heading text-white hover:bg-heading')
              }`}
            >
              <ChevronLeft size={22} />
              Previous Step
            </button>
          </div>
        </div>

        {/* Recipe Complete */}
        {completedSteps.size === totalSteps && totalSteps > 0 && (
          <div className={`mt-4 rounded-2xl p-6 text-center transition-colors duration-200 ${
            kitchenMode
              ? 'bg-gray-800 border border-green-500/30'
              : 'bg-primary-light border border-primary-border'
          }`}>
            <CheckCircle size={48} className="text-primary mx-auto mb-4" />
            <h3 className={`text-xl font-display font-bold mb-2 ${kitchenMode ? 'text-green-400' : 'text-primary'}`}>
              Recipe Complete!
            </h3>
            <p className={kitchenMode ? 'text-gray-400' : 'text-primary'}>
              You've finished preparing {activeRecipeData.recipe_name}. Enjoy your meal!
            </p>
            <button
              onClick={() => {
                try { localStorage.removeItem('recipeInstructionState'); } catch {}
                handleBackToApp();
              }}
              className="mt-4 w-full min-h-[56px] px-6 py-3 bg-primary text-white rounded-xl
                hover:bg-primary-hover transition-colors font-bold text-lg active:scale-[0.98]"
            >
              Back to Grocery List
            </button>
          </div>
        )}
      </div>

      {/* Floating Timer Pill (Feature 6) */}
      {(timerRunning || timerSeconds > 0) && (
        <div className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-30 flex items-center gap-3
          px-4 py-3 rounded-full shadow-warm-lg ${
          kitchenMode ? 'bg-gray-800 border border-amber-500/50' : 'bg-surface border border-accent'
        }`}>
          {/* Timer display */}
          <span className={`font-mono text-xl font-bold ${
            timerSeconds <= 30 && timerSeconds > 0
              ? 'text-danger animate-pulse'
              : (kitchenMode ? 'text-amber-400' : 'text-accent')
          }`}>
            {formatTimer(timerSeconds)}
          </span>

          {/* Step label (only if not on timer step) */}
          {timerStepIndex !== null && timerStepIndex !== currentStep && (
            <button
              onClick={() => setCurrentStep(timerStepIndex)}
              className={`text-xs font-medium underline ${
                kitchenMode ? 'text-gray-400' : 'text-muted'
              }`}
            >
              Step {timerStepIndex + 1}
            </button>
          )}

          {/* Pause/Resume */}
          <button
            onClick={handlePauseResumeTimer}
            className={`p-1.5 rounded-full transition-colors ${
              kitchenMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-background text-body'
            }`}
          >
            {timerRunning ? <Pause size={18} /> : <Play size={18} />}
          </button>

          {/* Cancel */}
          <button
            onClick={handleCancelTimer}
            className={`p-1.5 rounded-full transition-colors ${
              kitchenMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-background text-muted'
            }`}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default RecipeInstructions;
