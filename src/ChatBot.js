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

const ChatBot = ({ onBack }) => {
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
  const [selectedMeals, setSelectedMeals] = useState([]);
  const [showIngredientsPanel, setShowIngredientsPanel] = useState(false);
  const [selectedIngredients, setSelectedIngredients] = useState(new Set());
  const [loadingIngredients, setLoadingIngredients] = useState(false);
  const [collapsedMeals, setCollapsedMeals] = useState(new Set());
  const messagesEndRef = useRef(null);

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
      id: Date.now(),
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

    // Automatically fetch ingredients for this meal
    fetchIngredientsForMeal(newMeal);

    addDebugLog('Added meal to planning list:', newMeal);
  };

  // Fetch ingredients for a specific meal
  const fetchIngredientsForMeal = async (meal) => {
    setLoadingIngredients(true);
    addDebugLog('Fetching ingredients for meal:', meal.name);

    try {
      // Instead of calling a separate webhook, send a message to the chatbot
      // asking for ingredients for this specific meal, including recipe ID if available
      const ingredientQuery = meal.recipeId 
        ? `What are the ingredients for recipe ID ${meal.recipeId}?`
        : `What are the ingredients for ${meal.name}?`;

      addDebugLog('Sending ingredient query to chatbot:', ingredientQuery);

      const queryParams = new URLSearchParams({
        message: ingredientQuery,
        context: 'get_ingredients',
        recipeId: meal.recipeId || '',
        timestamp: new Date().toISOString(),
        sessionId: sessionId
      });

      const fullURL = `${CHATBOT_WEBHOOK_URL}?${queryParams.toString()}`;

      const response = await fetch(fullURL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      const data = JSON.parse(responseText);

      let ingredients = [];

      if (Array.isArray(data) && data.length > 0) {
        let responseData = data[0];

        // Handle nested webhook response structure
        if (responseData.response && responseData.response.body && Array.isArray(responseData.response.body)) {
          responseData = responseData.response.body[0];
        }

        // Check if it's the new structured format with ingredients_detail
        if (responseData.output && responseData.output.responseType === 'ingredients_detail' && responseData.output.ingredients) {
          let ingredientId = 1;

          responseData.output.ingredients.forEach(categoryGroup => {
            const categoryName = categoryGroup.category || 'General';

            if (categoryGroup.items && Array.isArray(categoryGroup.items)) {
              categoryGroup.items.forEach(item => {
                const quantity = item.quantity && item.unit ? `${item.quantity} ${item.unit}` : (item.quantity || '');
                
                // Extract metric value and unit from amount object if available
                let metricValue = null;
                let metricUnit = null;
                
                if (item.amount && item.amount.metric) {
                  metricValue = item.amount.metric.value;
                  metricUnit = item.amount.metric.unit;
                }

                ingredients.push({
                  id: ingredientId++,
                  name: item.name,
                  quantity: quantity,
                  metricValue: metricValue,
                  metricUnit: metricUnit,
                  category: categoryName,
                  needed: true
                });
              });
            }
          });
        }
        // Fallback to legacy string parsing
        else if (responseData.output && typeof responseData.output === 'string') {
          const botResponse = responseData.output;
          let ingredientId = 1;
          const sections = botResponse.split(/\n(?=[A-Z][^:]+:)/);

          sections.forEach(section => {
            const lines = section.split('\n');
            let currentCategory = 'General';

            lines.forEach(line => {
              if (line.includes(':') && !line.startsWith('-')) {
                currentCategory = line.replace(':', '').trim();
              }
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
        }
      }

      // If no ingredients were parsed, use fallback
      if (ingredients.length === 0) {
        addDebugLog('No ingredients parsed, using generic list');
        ingredients = getFallbackIngredients(meal.name);
      }

      // Update the meal with ingredients
      setSelectedMeals(prev => prev.map(m => 
        m.id === meal.id 
          ? { ...m, ingredients: ingredients }
          : m
      ));

      // Auto-select ingredients that are marked as needed
      const neededIngredientIds = ingredients
        .filter(ing => ing.needed)
        .map(ing => `${meal.id}-${ing.id}`);

      setSelectedIngredients(prev => {
        const newSet = new Set(prev);
        neededIngredientIds.forEach(id => newSet.add(id));
        return newSet;
      });

      addDebugLog('✅ Ingredients fetched successfully:', ingredients);

    } catch (error) {
      addDebugLog('❌ Error fetching ingredients:', error.message);

      // Fallback to local ingredients based on meal name
      const fallbackIngredients = getFallbackIngredients(meal.name);

      setSelectedMeals(prev => prev.map(m => 
        m.id === meal.id 
          ? { ...m, ingredients: fallbackIngredients }
          : m
      ));
    } finally {
      setLoadingIngredients(false);
    }
  };

  // Toggle ingredient selection
  const toggleIngredient = (mealId, ingredientId) => {
    const key = `${mealId}-${ingredientId}`;
    setSelectedIngredients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Toggle meal collapse/expand
  const toggleMealCollapse = (mealId) => {
    setCollapsedMeals(prev => {
      const newSet = new Set(prev);
      if (newSet.has(mealId)) {
        newSet.delete(mealId);
      } else {
        newSet.add(mealId);
      }
      return newSet;
    });
  };

  // Remove meal from planning list
  const removeMeal = (mealId) => {
    setSelectedMeals(prev => prev.filter(m => m.id !== mealId));

    // Remove all ingredients for this meal from selected ingredients
    setSelectedIngredients(prev => {
      const newSet = new Set();
      prev.forEach(key => {
        if (!key.startsWith(`${mealId}-`)) {
          newSet.add(key);
        }
      });
      return newSet;
    });

    // Remove from collapsed meals if it exists
    setCollapsedMeals(prev => {
      const newSet = new Set(prev);
      newSet.delete(mealId);
      return newSet;
    });

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
      const queryParams = new URLSearchParams({
        message: messageToSend,
        context: 'meal_planning',
        timestamp: new Date().toISOString(),
        sessionId: sessionId
      });

      const fullURL = `${CHATBOT_WEBHOOK_URL}?${queryParams.toString()}`;
      addDebugLog('Full GET URL:', fullURL);

      addDebugLog('Making API call to chatbot webhook with GET method...');
      const response = await fetch(fullURL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors'
      });

      addDebugLog('Response received:', {
        status: response.status,
        statusText: response.statusText,
        type: response.type,
      });

      if (!response.ok) {
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
              // Handle ingredients response (for future use)
              if (responseData.output.ingredients && responseData.output.recipeName) {
                // This would be handled here when ingredient responses come in structured format
                botResponse = `Ingredients for ${responseData.output.recipeName}:\n${JSON.stringify(responseData.output.ingredients, null, 2)}`;
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

              // Auto-select all ingredients
              const newSelectedIngredients = ingredients.map(ing => `${mealToUpdate.id}-${ing.id}`);
              setSelectedIngredients(prev => {
                const newSet = new Set(prev);
                newSelectedIngredients.forEach(id => newSet.add(id));
                return newSet;
              });

              addDebugLog('✅ Ingredients parsed and added to meal:', { meal: mealToUpdate.name, ingredients });
            }
          }
        }
      }

      addDebugLog('✅ Real AI agent response:', botResponse);

      removeTypingIndicator(typingId);

      const botMessage = {
        id: Date.now() + 1,
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
        id: Date.now() + 1,
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

  // Helper functions for ingredient parsing
  const getStoreForIngredient = (ingredientName) => {
    const name = ingredientName.toLowerCase();

    if (name.includes('cheese') || name.includes('yogurt') || name.includes('milk')) {
      return 'Whole Foods';
    } else if (name.includes('bread') || name.includes('crust')) {
      return 'Kroger';
    } else if (name.includes('peach') || name.includes('arugula') || name.includes('onion')) {
      return 'Tom Thumb';
    } else if (name.includes('vinegar') || name.includes('oil')) {
      return 'Costco';
    }

    return 'Kroger'; // Default store
  };

  const getSectionForIngredient = (ingredientName, category) => {
    const name = ingredientName.toLowerCase();

    if (category.toLowerCase().includes('cheese') || name.includes('cheese')) {
      return 'Refrigerated';
    } else if (category.toLowerCase().includes('crust') || name.includes('bread')) {
      return 'Bakery';
    } else if (category.toLowerCase().includes('vegetable') || category.toLowerCase().includes('fruit')) {
      return 'Produce';
    } else if (name.includes('vinegar') || name.includes('sauce')) {
      return 'Condiments';
    } else if (name.includes('nut') || name.includes('walnut')) {
      return 'Nuts';
    } else if (category.toLowerCase().includes('seasoning') || name.includes('salt') || name.includes('pepper')) {
      return 'Spices';
    }

    return 'General';
  };

  // Add this helper function for fallback ingredients
  const getFallbackIngredients = (mealName) => {
    const mealLower = mealName.toLowerCase();

    // Return appropriate fallback ingredients based on meal type
    if (mealLower.includes('pizza')) {
      return [
        { id: 1, name: "Pizza Dough", category: "Bakery", metricValue: 1, metricUnit: "piece", needed: true },
        { id: 2, name: "Mozzarella Cheese", category: "Dairy", metricValue: 200, metricUnit: "grams", needed: true },
        { id: 3, name: "Pizza Sauce", category: "Condiments", metricValue: 120, metricUnit: "ml", needed: true },
        { id: 4, name: "Toppings", category: "General", metricValue: null, metricUnit: null, needed: true }
      ];
    }

    // Default fallback
    return [
      { id: 1, name: "Main Ingredient", category: "General", metricValue: null, metricUnit: null, needed: true },
      { id: 2, name: "Seasonings", category: "Spices", metricValue: null, metricUnit: null, needed: true }
    ];
  };

  return (
    <div className="max-w-7xl mx-auto flex gap-6">
      {/* Main Chat Area */}
      <div className={`bg-white rounded-lg shadow-lg overflow-hidden transition-all ${showIngredientsPanel ? 'flex-1' : 'w-full max-w-4xl mx-auto'}`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <ChefHat size={28} />
              <h1 className="text-2xl font-bold">AI Meal Planner</h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Session Info */}
              <div className="text-xs bg-white/20 px-2 py-1 rounded">
                Session: {sessionId.split('_')[2]?.substr(0, 6)}...
              </div>

              {/* Ingredients Panel Toggle */}
              <button
                onClick={() => setShowIngredientsPanel(!showIngredientsPanel)}
                className="flex items-center gap-2 text-sm hover:bg-white/20 px-3 py-2 rounded-lg transition-colors"
              >
                <ShoppingCart size={16} />
                Meal Plans ({selectedMeals.length})
              </button>

              {/* Debug Toggle */}
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="flex items-center gap-2 text-sm hover:bg-white/20 px-3 py-2 rounded-lg transition-colors"
              >
                <Wifi size={16} />
                Debug Info
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
                New Session
              </button>
            </div>
          </div>

          <div className="bg-white/20 rounded-lg p-3">
            <p className="text-sm font-medium">{getWeekDateRange()}</p>
            <p className="text-xs opacity-90 mt-1">Get personalized meal suggestions based on your preferences</p>
            <p className="text-xs opacity-75 mt-1">Session ID: {sessionId}</p>
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
        <div className="h-96 overflow-y-auto p-6 bg-gray-50">
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
                                    setShowIngredientsPanel(true);
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
        <div className="p-6 bg-white border-t border-gray-200">
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

      {/* Ingredients Panel */}
      {showIngredientsPanel && (
        <div className="w-96 bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={20} />
                <h2 className="text-lg font-semibold">Meal Plans & Ingredients</h2>
              </div>
              <button
                onClick={() => setShowIngredientsPanel(false)}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm opacity-90 mt-1">
              {selectedMeals.length} meal{selectedMeals.length !== 1 ? 's' : ''} planned
            </p>
          </div>

          <div className="h-96 overflow-y-auto p-4">
            {selectedMeals.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <ShoppingCart size={48} className="mx-auto mb-3 opacity-50" />
                <p>No meals planned yet</p>
                <p className="text-sm mt-1">Add meals from chat suggestions to see ingredients here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedMeals.map((meal) => {
                  const isCollapsed = collapsedMeals.has(meal.id);

                  return (
                    <div key={meal.id} className="border rounded-lg">
                      <div className="bg-gray-50 p-3 border-b">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-800">{meal.name}</h3>
                            <p className="text-sm text-gray-600 mt-1">{meal.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleMealCollapse(meal.id)}
                              className="text-gray-600 hover:text-gray-800 transition-colors"
                              title={isCollapsed ? "Expand meal" : "Collapse meal"}
                            >
                              {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                            </button>
                            <button
                              onClick={() => removeMeal(meal.id)}
                              className="text-red-600 hover:text-red-800 transition-colors"
                              title="Remove meal"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      </div>

                    {!isCollapsed && (
                        <div className="p-3">
                          {loadingIngredients && meal.ingredients.length === 0 ? (
                            <div className="flex items-center gap-2 text-gray-500">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                              <span className="text-sm">Loading ingredients...</span>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-sm font-medium text-gray-700 mb-2">
                                Ingredients ({meal.ingredients.length}):
                              </div>
                              {meal.ingredients.map((ingredient) => {
                                const ingredientKey = `${meal.id}-${ingredient.id}`;
                                const isSelected = selectedIngredients.has(ingredientKey);

                                return (
                                  <div key={ingredient.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleIngredient(meal.id, ingredient.id)}
                                      className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                                    />
                                    <div className="flex-1">
                                      <div className={`text-sm ${isSelected ? 'font-medium' : ''}`}>
                                        {ingredient.name}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {ingredient.metricValue && ingredient.metricUnit ? 
                                          `${ingredient.metricValue} ${ingredient.metricUnit}` : 
                                          ingredient.quantity || 'As needed'}
                                      </div>
                                    </div>
                                    {ingredient.needed && (
                                      <div className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                                        Recommended
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedMeals.length > 0 && (
            <div className="border-t p-4 bg-gray-50">
              <div className="text-sm text-gray-600 mb-3">
                Selected: {selectedIngredients.size} ingredient{selectedIngredients.size !== 1 ? 's' : ''}
              </div>
              <button
                onClick={() => {
                  const selectedIngredientsList = [];
                  selectedMeals.forEach(meal => {
                    meal.ingredients.forEach(ingredient => {
                      const key = `${meal.id}-${ingredient.id}`;
                      if (selectedIngredients.has(key)) {
                        selectedIngredientsList.push({
                          meal: meal.name,
                          ingredient: ingredient.name,
                          category: ingredient.category,
                          store: ingredient.store,
                          section: ingredient.section
                        });
                      }
                    });
                  });

                  addDebugLog('Selected ingredients ready for main grocery list:', selectedIngredientsList);
                  console.log('Selected ingredients to add to main grocery list:', selectedIngredientsList);

                  // This would integrate with your main grocery list
                  alert(`Ready to add ${selectedIngredients.size} ingredients to your main grocery list!\n\nCheck the debug panel for details.`);
                }}
                disabled={selectedIngredients.size === 0}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Add to Grocery List ({selectedIngredients.size})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatBot;