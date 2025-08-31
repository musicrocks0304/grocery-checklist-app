import React, { useState, useRef, useEffect } from 'react';
import { Send, ChefHat, Wifi, ChevronDown, ChevronUp, ArrowLeft, Sparkles, Plus, X, ShoppingCart } from 'lucide-react';

// Generate or retrieve session ID
const getSessionId = () => {
  let sessionId = localStorage.getItem('chatSessionId');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('chatSessionId', sessionId);
  }
  return sessionId;
};

const ChatBot = ({ onBack, onNavigate, onToggleSidebar, selectedMeals: parentSelectedMeals, setSelectedMeals: setParentSelectedMeals }) => {
  // Session management
  const [sessionId] = useState(getSessionId());

  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      content: "Hi! I'm your meal planning assistant. I can help you create delicious meal ideas based on your grocery list and preferences. What kind of meals are you looking to plan this week?",
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  // Use parent's selectedMeals state if provided, otherwise use local state
  const [localSelectedMeals, setLocalSelectedMeals] = useState([]);
  const selectedMeals = parentSelectedMeals || localSelectedMeals;
  const setSelectedMeals = setParentSelectedMeals || setLocalSelectedMeals;
  const [showMealsPanel, setShowMealsPanel] = useState(false);
  const messagesEndRef = useRef(null);

  // Navigation items


  // Your n8n webhook URL for the chatbot - using the actual webhook from your n8n flow
  const CHATBOT_WEBHOOK_URL = 'https://n8n-grocery.needexcelexpert.com/webhook/call_grocery_agent';

  // Debug logging function
  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, { timestamp, message, data }]);
    console.log(`[${timestamp}] ${message}`, data || '');
  };

  // Log session info on component mount
  useEffect(() => {
    addDebugLog('Chat session initialized', { sessionId });
  }, [sessionId]);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Simulate typing indicator
  const showTypingIndicator = () => {
    const typingMessage = {
      id: Date.now() + Math.random(), // Ensure unique ID
      type: 'bot',
      content: '...',
      isTyping: true,
      timestamp: new Date().toLocaleTimeString()
    };
    setMessages(prev => [...prev, typingMessage]);
    return typingMessage.id;
  };

  // Remove typing indicator
  const removeTypingIndicator = (typingId) => {
    setMessages(prev => prev.filter(msg => msg.id !== typingId));
  };

  // Add a meal to the selected meals list
  const addMealToList = (mealName, mealDescription, recipeId = null) => {
    const newMeal = {
      id: Date.now(),
      name: mealName,
      description: mealDescription,
      recipeId: recipeId,
      ingredients: []
    };

    setSelectedMeals(prev => [...prev, newMeal]);

    // Removed automatic ingredient fetching since we're not showing ingredients in side panel

    addDebugLog('Added meal to planning list:', newMeal);
  };

  // Removed ingredient fetching since we're not showing ingredients in side panel

  // Remove meal from planning list
  const removeMeal = async (mealId) => {
    // Find the meal to get its details for the webhook call
    const mealToRemove = selectedMeals.find(meal => meal.id === mealId);

    if (!mealToRemove) {
      addDebugLog('❌ Meal not found for removal:', mealId);
      return;
    }

    addDebugLog('Calling webhook to delete meal:', mealToRemove.name);

    try {
      // Call the webhook with delete context
      const weekData = getWeekDates();

      const queryParams = new URLSearchParams({
        message: `Delete meal: ${mealToRemove.name}`,
        context: 'delete_meal',
        deleteFlag: 'true',
        recipeId: mealToRemove.recipeId || '',
        recipeName: mealToRemove.name,
        timestamp: new Date().toISOString(),
        sessionId: sessionId,
        weekStartDate: weekData.startDate,
        weekEndDate: weekData.endDate,
        weekDateRange: weekData.displayRange
      });

      const fullURL = `${CHATBOT_WEBHOOK_URL}?${queryParams.toString()}`;
      addDebugLog('Delete meal webhook URL:', fullURL);

      const response = await fetch(fullURL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors'
      });

      if (response.ok) {
        addDebugLog('✅ Delete meal webhook call successful');
      } else {
        addDebugLog('⚠️ Delete meal webhook call failed:', response.status);
      }
    } catch (error) {
      addDebugLog('❌ Error calling delete meal webhook:', error.message);
    }

    // Remove meal from local state regardless of webhook success
    setSelectedMeals(prev => prev.filter(m => m.id !== mealId));

    addDebugLog('Removed meal from planning list:', mealId);
  };

  // Send message to n8n webhook
  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage.trim(),
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageToSend = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);

    const typingId = showTypingIndicator();

    addDebugLog('Sending message to n8n chatbot webhook...', messageToSend);

    try {
      // Test connectivity first
      addDebugLog('Testing connectivity...');
      const testResponse = await fetch('https://api.github.com/zen', {
        method: 'GET',
        mode: 'cors'
      });

      if (testResponse.ok) {
        addDebugLog('✅ External connectivity working');
      }

      addDebugLog('Webhook URL:', CHATBOT_WEBHOOK_URL);

      // Use GET method to match n8n webhook configuration
      const weekData = getWeekDates();

      const queryParams = new URLSearchParams({
        message: messageToSend,
        context: 'meal_planning',
        timestamp: new Date().toISOString(),
        sessionId: sessionId,
        weekStartDate: weekData.startDate,
        weekEndDate: weekData.endDate,
        weekDateRange: weekData.displayRange
      });

      const fullURL = `${CHATBOT_WEBHOOK_URL}?${queryParams.toString()}`;
      addDebugLog('Full GET URL:', fullURL);

      addDebugLog('Making API call to chatbot webhook with GET method...');
      const response = await fetch(fullURL, {
        method: 'GET',
        mode: 'cors'
      });

      addDebugLog('Response received:', {
        status: response.status,
        statusText: response.statusText,
        type: response.type,
      });

      if (!response.ok) {
        // Log the error response for debugging
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = 'Could not read error response';
        }

        addDebugLog('❌ Server error response:', { 
          status: response.status, 
          statusText: response.statusText, 
          body: errorText,
          url: fullURL 
        });

        // For 500 errors, provide a helpful fallback message
        if (response.status === 500) {
          removeTypingIndicator(typingId);
          const fallbackMessage = {
            id: Date.now() + Math.random(), // Ensure unique ID
            type: 'bot',
            content: "I'm experiencing a temporary server issue, but your n8n webhook is working correctly. This might be a CORS or header issue. Please try again in a moment!",
            timestamp: new Date().toLocaleTimeString()
          };
          setMessages(prev => [...prev, fallbackMessage]);
          setIsLoading(false);
          return;
        }

        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      addDebugLog('Raw response:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
        addDebugLog('Parsed JSON data:', data);
      } catch (parseError) {
        addDebugLog('❌ JSON parse error:', parseError.message);
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}...`);
      }

      // Handle the AI Agent response format
      let botResponse = "I received your message but couldn't process it properly. Please try again!";
      let suggestedMeals = [];

      if (Array.isArray(data) && data.length > 0) {
        let responseData = data[0];

        // Handle nested webhook response structure
        if (responseData.response && responseData.response.body && Array.isArray(responseData.response.body)) {
          responseData = responseData.response.body[0];
        }

        // Check if it's the new structured format
        if (responseData.output && typeof responseData.output === 'object' && responseData.output.responseType) {
          // Handle structured response
          botResponse = responseData.output.message || "";

          switch (responseData.output.responseType) {
            case "recipe_list":
              // Convert recipes to meal suggestions
              if (responseData.output.recipes && Array.isArray(responseData.output.recipes)) {
                suggestedMeals = responseData.output.recipes.map(recipe => ({
                  name: recipe.name,
                  description: recipe.description,
                  recipeId: recipe.id,
                  servings: recipe.servings || 4
                }));
              }
              break;

            case "ingredients_detail":
              if (responseData.output.ingredients && responseData.output.recipeName) {
                const targetMeal = selectedMeals.find(meal => 
                  meal.name.toLowerCase().includes(responseData.output.recipeName.toLowerCase()) ||
                  responseData.output.recipeName.toLowerCase().includes(meal.name.toLowerCase())
                );

                if (targetMeal) {
                  // Update the meal with recipe ID if it wasn't already set
                  if (responseData.output.recipeId && !targetMeal.recipeId) {
                    targetMeal.recipeId = responseData.output.recipeId;
                  }

                  // Convert structured ingredients to flat list
                  const ingredients = [];
                  let ingredientId = 1;

                  responseData.output.ingredients.forEach(category => {
                    const categoryName = category.category || 'General';

                    if (category.items && Array.isArray(category.items)) {
                      category.items.forEach(item => {
                        const quantity = item.quantity && item.unit ? `${item.quantity} ${item.unit}` : (item.quantity || '');

                        ingredients.push({
                          id: ingredientId++,
                          name: item.name,
                          quantity: quantity,
                          metricValue: item.amount && item.amount.metric ? item.amount.metric.value : null,
                          metricUnit: item.amount && item.amount.metric ? item.amount.metric.unit : null,
                          category: categoryName,
                          needed: true,
                          recipeId: responseData.output.recipeId || targetMeal.recipeId // Include recipe ID with each ingredient
                        });
                      });
                    }
                  });

                  // Update the meal with ingredients
                  setSelectedMeals(prev => prev.map(m => 
                    m.id === targetMeal.id 
                      ? { ...m, ingredients: ingredients, recipeId: responseData.output.recipeId || targetMeal.recipeId }
                      : m
                  ));

                  // Removed ingredient selection since we're not showing ingredients in side panel

                  addDebugLog('✅ Structured ingredients added to meal:', { 
                    meal: targetMeal.name, 
                    recipeId: responseData.output.recipeId || targetMeal.recipeId,
                    ingredientCount: ingredients.length 
                  });

                  botResponse = `Ingredients for ${responseData.output.recipeName} have been added to your meal plan.`;
                } else {
                  botResponse = `Ingredients for ${responseData.output.recipeName}:\n${JSON.stringify(responseData.output.ingredients, null, 2)}`;
                }
              }
              break;
            default:
              // Handle any other response types or do nothing
              break;
          }
        }
        // Handle legacy string format
        else if (responseData.output && typeof responseData.output === 'string') {
          botResponse = responseData.output;
        } else if (responseData.text) {
          botResponse = responseData.text;
        } else if (typeof responseData === 'string') {
          botResponse = responseData;
        }

        // Parse recipe suggestions from the AI response (legacy format)
        const responseText = typeof botResponse === 'string' ? botResponse : JSON.stringify(botResponse);

        // Extract numbered recipe lists (e.g., "1. Recipe Name")
        const numberedRecipePattern = /(\d+)\.\s*\*\*([^*]+)\*\*(?:\s*\(ID:\s*(\d+)\))?[^\n]*/g;
        let match;

        while ((match = numberedRecipePattern.exec(responseText)) !== null) {
          const recipeName = match[2].trim();
          const recipeId = match[3] || null;

          // Extract description after the recipe name
          const fullMatch = match[0];
          const descriptionMatch = fullMatch.match(/\*\*[^*]+\*\*(?:\s*\([^)]+\))?\s*-\s*(.+)/);
          const description = descriptionMatch ? descriptionMatch[1].trim() : '';

          suggestedMeals.push({
            name: recipeName,
            description: description || `Recipe ID: ${recipeId || 'N/A'}`,
            recipeId: recipeId
          });
        }

        // Also check for bullet points without numbers
        if (suggestedMeals.length === 0) {
          const bulletRecipePattern = /[-•]\s*\*\*([^*]+)\*\*(?:\s*\((?:ID:|Recipe ID:)\s*(\d+)\))?[^\n]*/g;

          while ((match = bulletRecipePattern.exec(responseText)) !== null) {
            const recipeName = match[1].trim();
            const recipeId = match[2] || null;

            suggestedMeals.push({
              name: recipeName,
              description: `Recipe ID: ${recipeId || 'N/A'}`,
              recipeId: recipeId
            });
          }
        }

        // Check if this is an ingredients response
        if (typeof responseText === 'string' && (responseText.includes('ingredients needed for') || 
            responseText.includes('Crust & Cheese:') || 
            responseText.includes('Fruits & Vegetables:'))) {

          // Extract the recipe name from the response
          const recipeNameMatch = responseText.match(/ingredients needed for (?:the\s+)?([^(]+)/i);
          const recipeName = recipeNameMatch ? recipeNameMatch[1].trim() : 'Current Recipe';

          // Parse ingredients from the formatted response
          const ingredients = [];
          let ingredientId = 1;

          // Parse sectioned ingredients (e.g., "Crust & Cheese:", "Fruits & Vegetables:")
          const sections = responseText.split(/\n(?=[A-Z][^:]+:)/);

          sections.forEach(section => {
            const lines = section.split('\n');
            let currentCategory = 'General';

            lines.forEach(line => {
              // Check if this is a category header
              if (line.includes(':') && !line.startsWith('-')) {
                currentCategory = line.replace(':', '').trim();
              }
              // Check if this is an ingredient line
              else if (line.startsWith('-') || line.match(/^\s*\d+/)) {
                const ingredientMatch = line.match(/[-\d.]+\s*(.+)/);
                if (ingredientMatch) {
                  const fullIngredient = ingredientMatch[1].trim();

                  // Parse quantity and name
                  const quantityMatch = fullIngredient.match(/^([\d./]+\s*\w+)?\s*(.+)/);
                  const quantity = quantityMatch[1] || '';
                  const name = quantityMatch[2] || fullIngredient;

                  ingredients.push({
                    id: ingredientId++,
                    name: name,
                    quantity: quantity,
                    metricValue: null,
                    metricUnit: null,
                    category: currentCategory,
                    needed: true
                  });
                }
              }
            });
          });

          // If ingredients were found, update the most recent meal in the selected meals
          if (ingredients.length > 0 && selectedMeals.length > 0) {
            // Find the meal that matches this recipe name
            const mealToUpdate = selectedMeals.find(meal => 
              meal.name.toLowerCase().includes(recipeName.toLowerCase()) ||
              recipeName.toLowerCase().includes(meal.name.toLowerCase())
            );

            if (mealToUpdate) {
              setSelectedMeals(prev => prev.map(m => 
                m.id === mealToUpdate.id 
                  ? { ...m, ingredients: ingredients }
                  : m
              ));

              // Removed ingredient selection since we're not showing ingredients in side panel

              addDebugLog('✅ Ingredients parsed and added to meal:', { meal: mealToUpdate.name, ingredients });
            }
          }
        }
      }

      addDebugLog('✅ Real AI agent response:', botResponse);

      removeTypingIndicator(typingId);

      const botMessage = {
        id: Date.now() + Math.random(), // Ensure unique ID
        type: 'bot',
        content: botResponse,
        suggestedMeals: suggestedMeals,
        timestamp: new Date().toLocaleTimeString()
      };

      setMessages(prev => [...prev, botMessage]);
      addDebugLog('✅ Message exchange completed');

    } catch (error) {
      addDebugLog('❌ Error in sendMessage:', error.message);
      removeTypingIndicator(typingId);

      const errorMessage = {
        id: Date.now() + Math.random(), // Ensure unique ID
        type: 'bot',
        content: "I'm having trouble connecting to my meal planning brain right now! 🧠💭 But I can still help with some basic suggestions. What type of meals are you thinking about?",
        timestamp: new Date().toLocaleTimeString()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getWeekDateRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const showNextWeek = dayOfWeek >= 4;

    const daysToSunday = dayOfWeek;
    const currentWeekSunday = new Date(today);
    currentWeekSunday.setDate(today.getDate() - daysToSunday);

    const targetSunday = new Date(currentWeekSunday);
    if (showNextWeek) {
      targetSunday.setDate(targetSunday.getDate() + 7);
    }

    const targetSaturday = new Date(targetSunday);
    targetSaturday.setDate(targetSunday.getDate() + 6);

    const formatDate = (date) => {
      const day = date.getDate();
      const month = date.toLocaleDateString('en-US', { month: 'long' });
      return `${month} ${day}${getOrdinalSuffix(day)}`;
    };

    const getOrdinalSuffix = (day) => {
      if (day > 3 && day < 21) return 'th';
      switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    const year = targetSunday.getFullYear();
    return `Meal planning for ${formatDate(targetSunday)} to ${formatDate(targetSaturday)}, ${year}`;
  };

  // Add this helper function to get the actual dates for database storage
  const getWeekDates = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const showNextWeek = dayOfWeek >= 4;

    const daysToSunday = dayOfWeek;
    const currentWeekSunday = new Date(today);
    currentWeekSunday.setDate(today.getDate() - daysToSunday);

    const targetSunday = new Date(currentWeekSunday);
    if (showNextWeek) {
      targetSunday.setDate(targetSunday.getDate() + 7);
    }

    const targetSaturday = new Date(targetSunday);
    targetSaturday.setDate(targetSunday.getDate() + 6);

    // Format dates for SQL (YYYY-MM-DD)
    const formatDateForSQL = (date) => {
      return date.toISOString().split('T')[0];
    };

    return {
      startDate: formatDateForSQL(targetSunday),
      endDate: formatDateForSQL(targetSaturday),
      displayRange: getWeekDateRange() // Uses the existing function
    };
  };

  // Removed getFallbackIngredients function since we're not using it anymore

  return (
    <div className="h-screen flex flex-col lg:flex-row lg:max-w-7xl lg:mx-auto lg:gap-6 lg:p-4">
      {/* Main Chat Area */}
      <div className={`bg-white lg:rounded-lg lg:shadow-lg overflow-hidden transition-all flex flex-col ${showMealsPanel ? 'flex-1' : 'w-full lg:max-w-4xl lg:mx-auto'}`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <ChefHat size={24} />
              <h1 className="text-xl font-bold">AI Meal Planner</h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Meals Panel Toggle */}
              <button
                onClick={() => setShowMealsPanel(!showMealsPanel)}
                className="flex items-center gap-1 text-sm hover:bg-white/20 px-2 py-1 rounded-lg transition-colors"
              >
                <ShoppingCart size={16} />
                <span className="hidden sm:inline">Meal Plans</span> ({selectedMeals.length})
              </button>

              {/* Debug Toggle */}
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="flex items-center gap-1 text-sm hover:bg-white/20 px-2 py-1 rounded-lg transition-colors"
              >
                <Wifi size={16} />
                <span className="hidden sm:inline">Debug</span>
                {showDebug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {/* New Session Button */}
              <button
                onClick={() => {
                  localStorage.removeItem('chatSessionId');
                  window.location.reload();
                }}
                className="text-xs hover:bg-white/20 px-2 py-1 rounded transition-colors"
                title="Start new session"
              >
                New
              </button>
            </div>
          </div>

          {/* Session Info on separate line */}
          <div className="text-xs bg-white/20 px-3 py-1 rounded mb-3 inline-block min-w-48">
            Session: {sessionId.split('_')[2]?.substr(0, 12)}...
          </div>

          <div className="bg-white/20 rounded-lg p-3">
            <p className="text-sm font-medium">{getWeekDateRange()}</p>
            <p className="text-xs opacity-90 mt-1">Get personalized meal suggestions based on your preferences</p>
          </div>
        </div>

        {/* Debug Panel */}
        {showDebug && (
          <div className="p-4 bg-gray-900 text-white">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Wifi size={20} />
              Chatbot Debug Information
            </h3>
            <div className="space-y-1 text-sm font-mono max-h-60 overflow-y-auto">
              {debugInfo.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-gray-400">[{log.timestamp}]</span>
                  <span className={
                    log.message.includes('✅') ? 'text-green-400' :
                    log.message.includes('❌') ? 'text-red-400' :
                    log.message.includes('⚠️') ? 'text-yellow-400' :
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
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 bg-gray-50">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                    message.type === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-800 shadow-md border'
                  }`}
                >
                  {message.isTyping ? (
                    <div className="flex items-center gap-1">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                      <Sparkles size={16} className="text-purple-500 ml-2" />
                    </div>
                  ) : (
                    <div>
                      <div className="whitespace-pre-line">{message.content}</div>

                      {/* Meal Suggestion Buttons */}
                      {message.suggestedMeals && message.suggestedMeals.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {message.suggestedMeals.map((meal, index) => (
                            <div key={index} className="bg-gray-50 p-3 rounded-lg border">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-gray-800">{meal.name}</h4>
                                  <p className="text-sm text-gray-600 mt-1">{meal.description}</p>
                                </div>
                                <button
                                  onClick={() => {
                                    addMealToList(meal.name, meal.description, meal.recipeId);
                                    setShowMealsPanel(true);
                                  }}
                                  className="ml-3 flex items-center gap-1 px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                                >
                                  <Plus size={14} />
                                  Add to Plan
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div
                        className={`text-xs mt-2 ${
                          message.type === 'user' ? 'text-blue-200' : 'text-gray-500'
                        }`}
                      >
                        {message.timestamp}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 lg:p-6 bg-white border-t border-gray-200">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me about meal ideas, recipes, or cooking tips..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows="2"
                disabled={isLoading}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <Send size={20} />
              Send
            </button>
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="text-sm text-gray-500">
              💡 Try asking about breakfast ideas, lunch prep, or dinner suggestions!
            </div>
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-purple-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                Thinking...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Meals Panel */}
      {showMealsPanel && (
        <div className="w-full lg:w-96 bg-white lg:rounded-lg lg:shadow-lg overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChefHat size={20} />
                <h2 className="text-lg font-semibold">Selected Meals</h2>
              </div>
              <button
                onClick={() => setShowMealsPanel(false)}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm opacity-90 mt-1">
              {selectedMeals.length} meal{selectedMeals.length !== 1 ? 's' : ''} selected
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {selectedMeals.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <ChefHat size={48} className="mx-auto mb-3 opacity-50" />
                <p>No meals selected yet</p>
                <p className="text-sm mt-1">Add meals from chat suggestions to start planning</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedMeals.map((meal) => (
                  <div key={meal.id} className="border rounded-lg bg-white">
                    <div className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800">{meal.name}</h3>
                          <p className="text-sm text-gray-600 mt-1">{meal.description}</p>
                          {meal.servings && (
                            <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                              <span>Serves {meal.servings}</span>
                              {meal.prepTime && <span>• {meal.prepTime} min</span>}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeMeal(meal.id)}
                          className="text-red-600 hover:text-red-800 transition-colors ml-2"
                          title="Remove meal"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedMeals.length > 0 && (
            <div className="border-t p-4 bg-gray-50">
              <div className="text-sm text-gray-600 mb-3">
                {selectedMeals.length} meal{selectedMeals.length !== 1 ? 's' : ''} selected
              </div>
              <button
                onClick={async () => {
                  addDebugLog('Generating grocery list for meals:', selectedMeals);

                  // Extract recipe IDs from selected meals
                  const recipeIds = selectedMeals
                    .map(meal => meal.recipeId)
                    .filter(id => id); // Remove any undefined/null IDs

                  addDebugLog('Recipe IDs to send:', recipeIds);

                  if (recipeIds.length === 0) {
                    addDebugLog('❌ No recipe IDs found in selected meals');
                    alert('No recipe IDs found. Please make sure meals were added properly.');
                    return;
                  }

                  try {
                    // Call your new webhook with the recipe IDs
                    const webhookURL = 'https://n8n-grocery.needexcelexpert.com/webhook/get_recipe_items';

                    const payload = {
                      recipe_ids: recipeIds,
                      session_id: sessionId,
                      timestamp: new Date().toISOString(),
                      meal_count: selectedMeals.length,
                      meals: selectedMeals.map(meal => ({
                        id: meal.recipeId,
                        name: meal.name,
                        description: meal.description
                      }))
                    };

                    addDebugLog('Sending payload to get_recipe_items webhook:', payload);
                    addDebugLog('Webhook URL:', webhookURL);

                    const response = await fetch(webhookURL, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                      },
                      mode: 'cors',
                      body: JSON.stringify(payload)
                    });

                    addDebugLog('Webhook response status:', response.status);
                    addDebugLog('Webhook response headers:', Object.fromEntries(response.headers.entries()));

                    if (response.ok) {
                      const responseData = await response.text();
                      addDebugLog('✅ Successfully called get_recipe_items webhook');
                      addDebugLog('Response data:', responseData);

                      // Navigate to the Recipe Ingredients page
                      onNavigate('recipe-ingredients');
                    } else {
                      const errorText = await response.text();
                      addDebugLog('⚠️ Webhook returned non-OK status:', response.status);
                      addDebugLog('Error response:', errorText);
                      // Still navigate to the page, but show a warning
                      alert('Warning: There was an issue calling the recipe items webhook, but proceeding anyway.');
                      onNavigate('recipe-ingredients');
                    }

                  } catch (error) {
                    addDebugLog('❌ Error calling get_recipe_items webhook:', error.message);
                    addDebugLog('Error details:', error);

                    // Check if it's a CORS error
                    if (error.message === 'Failed to fetch') {
                      addDebugLog('🚨 This looks like a CORS error. The webhook may need CORS headers.');
                      alert('CORS Error: The webhook needs to allow cross-origin requests. Check debug logs for details.');
                    } else {
                      alert('Error calling recipe items webhook. Check debug logs for details.');
                    }

                    // Still navigate to show the page with mock data
                    onNavigate('recipe-ingredients');
                  }
                }}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
              >
                <ShoppingCart size={16} />
                Generate Grocery List
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatBot;