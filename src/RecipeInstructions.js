import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeft, Clock, CheckCircle, AlertCircle, Wifi, ChevronDown, ChevronUp, ChefHat, Utensils, Play } from 'lucide-react';
import { getWeekDates } from './utils/weekDates';

const RecipeInstructions = ({ onNavigate, recipeId, selectedMeals = [], debugMode = false }) => {
  // Your n8n webhook URLs following the same pattern as other webhooks in the app
  const CHOOSE_RECIPE_WEBHOOK_URL = 'https://n8n-grocery.needexcelexpert.com/webhook/choose_recipe_instructions';
  const GRAB_INSTRUCTIONS_WEBHOOK_URL = 'https://n8n-grocery.needexcelexpert.com/webhook/grab_instructions';

  // State management
  const [recipeData, setRecipeData] = useState(null);
  const [availableRecipes, setAvailableRecipes] = useState([]);
  const [isLoading, setIsLoading] = useState(false); // Only true when loading recipe instructions
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(true); // True when loading available recipes
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [showRecipeSelection, setShowRecipeSelection] = useState(true);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);

  // Use useRef to prevent double calls (more reliable than useState for React Strict Mode)
  const hasInitialized = useRef(false);
  const componentId = useRef(Math.random().toString(36).substr(2, 9));

  // Debug logging function (following the same pattern as other components)
  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, { timestamp, message, data }]);
    console.log(`[${timestamp}] ${message}`, data || '');
  };

  // Sample data based on the provided schema and screenshot (fallback)
  const sampleRecipeData = {
    recipe_id: 123,
    name: "Delicious Pasta with Tomato Sauce",
    recipe_name: "Delicious Pasta with Tomato Sauce",
    instructions: [
      {
        instruction_id: 1,
        recipe_id: 123,
        step_number: 1,
        instruction_text: "Prepare the ingredients: Wash and dry the fresh produce. Heat a large pot of salted water to boiling on high. Peel and mince the garlic. Cut off and discard the stem of the bell pepper. Halve lengthwise; remove the ribs and seeds, then medium dice. Cut off and discard the root end of the scallion; thinly slice, separating the white bottoms and hollow green tops.",
        time_minutes: 15
      },
      {
        instruction_id: 2,
        recipe_id: 123,
        step_number: 2,
        instruction_text: "Cook the aromatics: In a large, high-sided pan (or pot), heat a drizzle of olive oil on medium until hot. Add the garlic and cook, stirring frequently, 30 seconds to 1 minute, or until fragrant.",
        time_minutes: 4
      },
      {
        instruction_id: 3,
        recipe_id: 123,
        step_number: 3,
        instruction_text: "Add the tomato paste: Add the tomato paste to the pan; season with salt and pepper. Cook, stirring frequently, 2 to 3 minutes, or until dark red and fragrant.",
        time_minutes: 3
      },
      {
        instruction_id: 4,
        recipe_id: 123,
        step_number: 4,
        instruction_text: "Add the beef: Add the ground beef to the pan; season with salt and pepper. Cook, frequently breaking the meat apart with a spoon, 7 to 9 minutes, or until browned and cooked through.",
        time_minutes: 8
      },
      {
        instruction_id: 5,
        recipe_id: 123,
        step_number: 5,
        instruction_text: "Cook the pasta: While the beef cooks, add the pasta to the pot of boiling water. Cook, stirring occasionally, 8 to 10 minutes, or until just shy of al dente (still slightly firm to the bite). Turn off the heat. Reserving 1/2 cup of the pasta cooking water, drain thoroughly and rinse under cold water to prevent sticking.",
        time_minutes: 9
      },
      {
        instruction_id: 6,
        recipe_id: 123,
        step_number: 6,
        instruction_text: "Finish the pasta & plate your dish: Add the Brussels sprouts and 1/2 of the reserved pasta cooking water to the pan; season with salt and pepper. Cook, stirring frequently, 2 to 3 minutes, or until the Brussels sprouts are slightly softened. Add the cooked pasta and cook, stirring frequently, 1 to 2 minutes, or until the pasta is coated (if the sauce seems dry, gradually add the remaining cooking water to achieve your desired consistency). Turn off the heat. Taste, then season with salt and pepper if desired. Serve the finished pasta garnished with the Parmesan cheese. Enjoy!",
        time_minutes: 4
      },
      {
        instruction_id: 7,
        recipe_id: 123,
        step_number: 7,
        instruction_text: "Prepare the ingredients: Meanwhile, wash and dry the peppers; cut into 1-inch pieces. Remove the cores; halve lengthwise, then cut crosswise into 1/2-inch pieces. Add 2 tablespoons of olive oil to a large pan and heat on medium-high until hot.",
        time_minutes: 5
      },
      {
        instruction_id: 8,
        recipe_id: 123,
        step_number: 8,
        instruction_text: "Make the filling: In a medium bowl, combine the ground turkey, breadcrumbs, and egg. Season with salt and pepper; stir to combine. Using your hands, form the mixture into 1-inch meatballs (you should have 12 to 14 meatballs).",
        time_minutes: 5
      },
      {
        instruction_id: 9,
        recipe_id: 123,
        step_number: 9,
        instruction_text: "Assemble & bake the enchiladas: Add 2 tablespoons of the tomato paste (you will have extra), 1/4 teaspoon of the spice blend, and as much of the chile paste as you'd like, depending on how spicy you'd like the dish to be. Season with salt and pepper; stir to combine. Cook, stirring constantly, 30 seconds to 1 minute, or until fragrant.",
        time_minutes: 12
      },
      {
        instruction_id: 10,
        recipe_id: 123,
        step_number: 10,
        instruction_text: "Season the yogurt & serve your dish: Meanwhile, season the remaining yogurt with salt and pepper. Serve the baked enchiladas with the seasoned yogurt on the side. Enjoy!",
        time_minutes: 2
      }
    ]
  };

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  // Log component initialization and fetch available recipes
  useEffect(() => {
    addDebugLog('🎯 RecipeInstructions component mounted', {
      recipeId: recipeId || 'none provided',
      componentId: componentId.current,
      port: window.location.port
    });

    // Fetch available recipes from choose_recipe_instructions webhook
    const fetchAvailableRecipes = async () => {
      try {
        setIsLoadingRecipes(true);
        addDebugLog('🍽️ Fetching available recipes from choose_recipe_instructions webhook...');

        // Get week date information
        const weekData = getWeekDates();
        addDebugLog('📅 Week information for recipe selection:', weekData);

        // Build query parameters
        const queryParams = new URLSearchParams({
          weekStartDate: weekData.startDate,
          weekEndDate: weekData.endDate,
          weekDateRange: weekData.displayRange,
          timestamp: new Date().toISOString(),
        });

        const webhookURL = `${CHOOSE_RECIPE_WEBHOOK_URL}?${queryParams.toString()}`;
        addDebugLog('🌐 Choose recipes webhook URL:', webhookURL);

        const response = await fetch(webhookURL, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          mode: 'cors'
        });

        addDebugLog('📡 Choose recipes response received:', {
          status: response.status,
          statusText: response.statusText,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        addDebugLog('✅ Available recipes data received:', data);

        // Handle the webhook response - expecting array of recipe objects
        if (data && Array.isArray(data) && data.length > 0) {
          // Transform the webhook data to match our component's expected format
          const transformedRecipes = data.map(recipe => ({
            id: recipe.recipe_id,
            recipeId: recipe.recipe_id,
            name: recipe.recipe_name,
            selectionId: recipe.selection_id,
            weekDateRange: recipe.WeekDateRange,
            notes: recipe.notes,
            createdAt: recipe.created_at,
            // Add some default values for UI display
            description: recipe.notes || `Delicious ${recipe.recipe_name.toLowerCase()} recipe`,
            totalTime: '30-45 mins' // Default time, could be enhanced later
          }));

          setAvailableRecipes(transformedRecipes);
          addDebugLog('✅ Available recipes loaded and transformed from webhook:', transformedRecipes);
        } else {
          // Fallback to selectedMeals from props
          setAvailableRecipes(selectedMeals);
          addDebugLog('⚠️ Using selectedMeals as fallback - webhook returned empty or invalid data');
        }

      } catch (error) {
        addDebugLog('❌ Error fetching available recipes:', error.message);
        // Fallback to selectedMeals from props
        setAvailableRecipes(selectedMeals);
        addDebugLog('Using selectedMeals as fallback due to error');
      } finally {
        setIsLoadingRecipes(false);
      }
    };

    fetchAvailableRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Handle recipe selection
  const handleRecipeSelect = (recipeId) => {
    const selectedRecipe = availableRecipes.find(recipe => recipe.recipeId === recipeId || recipe.id === recipeId);
    setSelectedRecipeId(recipeId);
    setShowRecipeSelection(false);
    addDebugLog('🎯 Recipe selected for instructions', {
      recipeId,
      recipeName: selectedRecipe?.name || 'Unknown',
      selectionId: selectedRecipe?.selectionId
    });
  };

  // Handle back to recipe selection
  const handleBackToSelection = () => {
    setShowRecipeSelection(true);
    setSelectedRecipeId(null);
    setRecipeData(null);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    hasInitialized.current = false; // Reset for new recipe
    addDebugLog('🔙 Returning to recipe selection');
  };

  // Fetch recipe instructions from webhook (only when recipe is selected)
  useEffect(() => {
    // Only fetch if we have a selected recipe and not showing selection screen
    if (showRecipeSelection || !selectedRecipeId) {
      return;
    }

    // Prevent double calls in React Strict Mode and multiple instances
    if (hasInitialized.current) {
      addDebugLog('⚠️ Skipping duplicate useEffect call', {
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
        addDebugLog('🔒 Marking component as initialized', {
          componentId: componentId.current,
          port: window.location.port
        });
        setIsLoading(true);
        setError(null);
        const selectedRecipe = availableRecipes.find(recipe => recipe.recipeId === selectedRecipeId || recipe.id === selectedRecipeId);
        addDebugLog('🚀 Fetching recipe instructions from n8n webhook...');
        addDebugLog('📋 Selected recipe details:', {
          recipeId: selectedRecipeId,
          recipeName: selectedRecipe?.name || 'Unknown',
          selectionId: selectedRecipe?.selectionId
        });

        // Get week date information (following the same pattern as other webhooks)
        const weekData = getWeekDates();
        addDebugLog('📅 Week information:', weekData);

        // Build query parameters following the same pattern as other webhooks
        const queryParams = new URLSearchParams({
          recipe_id: selectedRecipeId,
          weekStartDate: weekData.startDate,
          weekEndDate: weekData.endDate,
          weekDateRange: weekData.displayRange,
          timestamp: new Date().toISOString(),
        });

        const webhookURL = `${GRAB_INSTRUCTIONS_WEBHOOK_URL}?${queryParams.toString()}`;
        addDebugLog('🍳 Grab instructions webhook URL:', webhookURL);

        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch(webhookURL, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
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
        addDebugLog('✅ Recipe instructions data received:', data);
        addDebugLog('📊 Data structure analysis:', {
          isArray: Array.isArray(data),
          hasOutput: data && data[0] && data[0].output,
          outputIsArray: data && data[0] && data[0].output && Array.isArray(data[0].output),
          dataKeys: data ? Object.keys(data) : 'null',
          firstItemKeys: data && data[0] ? Object.keys(data[0]) : 'null',
          dataType: typeof data
        });

        // Transform the webhook data to match our expected format
        if (data && Array.isArray(data) && data[0] && data[0].output && Array.isArray(data[0].output)) {
          // Filter instructions for the selected recipe only (handle both string and number recipe_id)
          const recipeInstructions = data[0].output.filter(step =>
            step.recipe_id === selectedRecipeId || step.recipe_id === parseInt(selectedRecipeId)
          );

          addDebugLog('🔍 Recipe filtering details:', {
            selectedRecipeId,
            selectedRecipeIdType: typeof selectedRecipeId,
            totalStepsInWebhook: data[0].output.length,
            filteredSteps: recipeInstructions.length,
            firstStepRecipeId: data[0].output[0]?.recipe_id,
            firstStepRecipeIdType: typeof data[0].output[0]?.recipe_id
          });

          // Transform to our expected format
          const transformedData = {
            id: selectedRecipeId,
            name: selectedRecipe?.name || 'Recipe Instructions',
            recipe_name: selectedRecipe?.name || 'Recipe Instructions',
            description: `Step-by-step cooking instructions for ${selectedRecipe?.name || 'your recipe'}`,
            totalTime: `${recipeInstructions.reduce((total, step) => total + (step.time_minutes || 0), 0)} mins`,
            instructions: recipeInstructions.map(step => ({
              id: step.step_number,
              step: step.step_number,
              instruction: step.instruction_text,
              time: step.time_minutes ? `${step.time_minutes} mins` : 'As needed',
              ingredients: step.ingredients_used || []
            }))
          };

          setRecipeData(transformedData);
          addDebugLog('✅ Recipe instructions loaded and transformed from webhook:', {
            recipeId: selectedRecipeId,
            totalSteps: transformedData.instructions.length,
            totalTime: transformedData.totalTime,
            transformedData: transformedData
          });
        } else {
          // Fallback to sample data if webhook doesn't return expected format
          addDebugLog('⚠️ Webhook data format unexpected, using sample data as fallback');
          addDebugLog('Expected format: [{ output: [...] }], received:', data);
          setRecipeData(sampleRecipeData);
        }

      } catch (error) {
        let errorMessage = error.message;
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out after 30 seconds';
          addDebugLog('⏰ Webhook request timed out');
        } else {
          addDebugLog('❌ Error fetching recipe instructions:', error.message);
        }

        setError(errorMessage);
        // Fallback to sample data on error
        setRecipeData(sampleRecipeData);
        addDebugLog('🔄 Using sample data as fallback due to error');
      } finally {
        setIsLoading(false);
        addDebugLog('🏁 Loading state set to false');
      }
    };

    fetchRecipeInstructions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipeId, showRecipeSelection]); // Re-fetch if selectedRecipeId changes

  // Use fetched data or fallback to sample data
  const activeRecipeData = recipeData || sampleRecipeData;
  const currentInstruction = activeRecipeData.instructions[currentStep];
  const totalSteps = activeRecipeData.instructions.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleStepComplete = () => {
    const newCompleted = new Set(completedSteps);
    if (completedSteps.has(currentStep)) {
      newCompleted.delete(currentStep);
    } else {
      newCompleted.add(currentStep);
    }
    setCompletedSteps(newCompleted);
  };

  const handleBackToApp = () => {
    onNavigate('grocery');
  };

  const handleJumpToStep = (stepIndex) => {
    setCurrentStep(stepIndex);
  };

  // Loading state for recipe instructions (when a recipe is selected)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md mx-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Loading Recipe Instructions</h2>
          <p className="text-gray-600">Fetching cooking steps from your database...</p>
          {debugInfo.length > 0 && (
            <div className="mt-4 text-left">
              <p className="text-xs text-gray-500 mb-2">Debug Info:</p>
              <div className="bg-gray-50 rounded p-2 text-xs text-gray-600 max-h-32 overflow-y-auto">
                {debugInfo.slice(-3).map((log, index) => (
                  <div key={index}>
                    <span className="text-gray-400">[{log.timestamp}]</span> {log.message}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handleBackToSelection}
            className="mt-4 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Loading state for available recipes (initial load)
  if (isLoadingRecipes) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md mx-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Loading Available Recipes</h2>
          <p className="text-gray-600">Fetching your selected meals for this week...</p>
          {debugInfo.length > 0 && (
            <div className="mt-4 text-left">
              <p className="text-xs text-gray-500 mb-2">Debug Info:</p>
              <div className="bg-gray-50 rounded p-2 text-xs text-gray-600 max-h-32 overflow-y-auto">
                {debugInfo.slice(-3).map((log, index) => (
                  <div key={index}>
                    <span className="text-gray-400">[{log.timestamp}]</span> {log.message}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handleBackToApp}
            className="mt-4 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Error state (still shows sample data as fallback)
  if (error && !recipeData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md mx-4">
          <div className="text-red-500 mb-4">
            <AlertCircle size={48} className="mx-auto" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Unable to Load Recipe</h2>
          <p className="text-gray-600 mb-4">There was an error loading the recipe instructions from the webhook.</p>
          <button
            onClick={handleBackToApp}
            className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
          >
            Back to Grocery List
          </button>
        </div>
      </div>
    );
  }

  // Recipe Selection Screen
  if (showRecipeSelection) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={handleBackToApp}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft size={20} />
                <span className="font-medium">Back to Grocery List</span>
              </button>
              <div className="text-center">
                <h1 className="text-lg font-bold text-gray-800">
                  Select Recipe for Instructions
                </h1>
                <p className="text-sm text-gray-500">
                  Choose which recipe you'd like to cook
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Debug Toggle - only visible with ?debug=true */}
                {debugMode && (
                  <button
                    onClick={() => setShowDebug(!showDebug)}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
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
          <div className="bg-gray-900 text-white border-b border-gray-200">
            <div className="max-w-4xl mx-auto px-4 py-4">
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
                <Wifi size={20} />
                Recipe Selection Debug Information
              </h3>
              <div className="space-y-1 text-sm font-mono max-h-60 overflow-y-auto">
                {debugInfo.map((log, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="text-gray-400">[{log.timestamp}]</span>
                    <span className={
                      log.message.includes('✅') ? 'text-green-400' :
                      log.message.includes('❌') ? 'text-red-400' :
                      log.message.includes('⚠️') ? 'text-yellow-400' :
                      log.message.includes('🚀') ? 'text-blue-400' :
                      log.message.includes('📋') ? 'text-cyan-400' :
                      log.message.includes('🎯') ? 'text-purple-400' :
                      'text-gray-200'
                    }>
                      {log.message}
                    </span>
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
          {isLoadingRecipes ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Loading Available Recipes</h2>
              <p className="text-gray-500">
                Fetching recipes from your meal planner...
              </p>
            </div>
          ) : availableRecipes.length === 0 ? (
            <div className="text-center py-12">
              <ChefHat size={64} className="mx-auto text-gray-400 mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">No Recipes Available</h2>
              <p className="text-gray-500 mb-6">
                You need to select some meals first from the AI Meal Planner.
              </p>
              <button
                onClick={() => onNavigate('chatbot')}
                className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
              >
                Go to Meal Planner
              </button>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Available Recipes</h2>
                <p className="text-gray-600">
                  Select a recipe to view step-by-step cooking instructions
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {availableRecipes.map((meal, index) => (
                  <div key={meal.id || index} className="bg-white rounded-xl shadow-lg border border-gray-200 hover:shadow-xl transition-shadow">
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <Utensils className="text-orange-500 flex-shrink-0" size={24} />
                        {meal.totalTime && (
                          <div className="flex items-center gap-1 text-sm text-gray-500">
                            <Clock size={16} />
                            {meal.totalTime}
                          </div>
                        )}
                      </div>

                      <h3 className="text-lg font-semibold text-gray-800 mb-2">
                        {meal.name}
                      </h3>

                      {meal.description && (
                        <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                          {meal.description}
                        </p>
                      )}

                      <button
                        onClick={() => handleRecipeSelect(meal.recipeId || meal.id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-colors font-medium"
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBackToSelection}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft size={20} />
                <span className="font-medium">Back to Recipes</span>
              </button>
            </div>
            <div className="text-center">
              <h1 className="text-lg font-bold text-gray-800 truncate max-w-xs">
                {activeRecipeData.recipe_name}
              </h1>
              <p className="text-sm text-gray-500">
                Step {currentStep + 1} of {totalSteps}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Debug Toggle - only visible with ?debug=true */}
              {debugMode && (
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
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
                  <span className={
                    log.message.includes('✅') ? 'text-green-400' :
                    log.message.includes('❌') ? 'text-red-400' :
                    log.message.includes('⚠️') ? 'text-yellow-400' :
                    log.message.includes('🚀') ? 'text-blue-400' :
                    log.message.includes('📋') ? 'text-cyan-400' :
                    'text-gray-200'
                  }>
                    {log.message}
                  </span>
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

      {/* Progress Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Step Numbers Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex flex-wrap gap-2 justify-center">
            {activeRecipeData.instructions.map((_, index) => (
              <button
                key={index}
                onClick={() => handleJumpToStep(index)}
                className={`w-10 h-10 rounded-full font-bold text-sm transition-all duration-200 ${
                  index === currentStep
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg scale-110'
                    : completedSteps.has(index)
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
                title={`Jump to step ${index + 1}`}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-gray-500 mt-2">
            Tap any number to jump to that step
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Step Header */}
          <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Step {currentStep + 1}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <Clock size={16} />
                  <span className="text-orange-100">
                    {currentInstruction.time}
                  </span>
                </div>
              </div>
              <button
                onClick={handleStepComplete}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  completedSteps.has(currentStep)
                    ? 'bg-green-500 text-white'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                <CheckCircle size={16} />
                {completedSteps.has(currentStep) ? 'Completed' : 'Mark Complete'}
              </button>
            </div>
          </div>

          {/* Instruction Text */}
          <div className="p-6">
            <p className="text-lg leading-relaxed text-gray-700 font-medium">
              {currentInstruction.instruction}
            </p>
          </div>

          {/* Ingredients for this step */}
          {currentInstruction.ingredients && currentInstruction.ingredients.length > 0 && (
            <div className="px-6 pb-6">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-orange-800 mb-3 flex items-center gap-2">
                  <ChefHat size={16} />
                  Ingredients for this step:
                </h3>
                <div className="flex flex-wrap gap-2">
                  {currentInstruction.ingredients.map((ingredient, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800 border border-orange-200"
                    >
                      {ingredient}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
            <button
              onClick={handlePrevious}
              disabled={isFirstStep}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                isFirstStep
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
            >
              <ChevronLeft size={20} />
              Previous
            </button>

            <div className="text-center">
              <p className="text-sm text-gray-500">
                {completedSteps.size} of {totalSteps} steps completed
              </p>
            </div>

            <button
              onClick={handleNext}
              disabled={isLastStep}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                isLastStep
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600'
              }`}
            >
              Next
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Recipe Complete Message */}
        {isLastStep && completedSteps.has(currentStep) && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-green-800 mb-2">Recipe Complete!</h3>
            <p className="text-green-700">
              Congratulations! You've finished preparing {activeRecipeData.recipe_name}.
            </p>
            <button
              onClick={handleBackToApp}
              className="mt-4 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Back to Grocery List
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipeInstructions;
