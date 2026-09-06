import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, ChefHat, Wifi, ChevronDown, ChevronUp, Sparkles, Plus, X, ShoppingCart, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { getWeekDates } from '../utils/weekDates';
import { ENDPOINTS, apiFetch, apiJson, userMessage } from '../config/api';

// Generate or retrieve session ID — keyed by week so each grocery week gets fresh history
const getSessionId = () => {
  const weekStart = getWeekDates().startDate;
  const storageKey = `chatSessionId_${weekStart}`;
  // Legacy fallback: if existing random session ID for this week, keep using it
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  // New deterministic format — same on any device
  const sessionId = `chat_${weekStart}`;
  return sessionId;
};

const CHATBOT_WEBHOOK_URL = ENDPOINTS.callGroceryAgent;
const CHAT_HISTORY_URL = ENDPOINTS.chatHistory;

const ChatBot = ({ onBack, onNavigate, selectedMeals: parentSelectedMeals, setSelectedMeals: setParentSelectedMeals, refreshMeals, groceryListData, setGroceryListData, debugMode = false }) => {
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
  const [isGeneratingGroceryList, setIsGeneratingGroceryList] = useState(false);
  const [lastGroceryListRequest, setLastGroceryListRequest] = useState(null);
  const [collapsedCards, setCollapsedCards] = useState(new Set());
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef(null);
  const lastPayloadRef = useRef(null);

  // Debug logging function
  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, { timestamp, message, data }]);
    console.log(`[${timestamp}] ${message}`, data || '');
  };

  // Parse AI response content from structured JSON string into displayable format
  const parseAIResponseContent = (contentString) => {
    try {
      const parsed = JSON.parse(contentString);
      if (parsed && parsed.responseType === 'recipe_list') {
        const suggestedMeals = (parsed.recipes || []).filter(r => r && r.name).map(recipe => ({
          name: recipe.name,
          description: recipe.description || '',
          recipeId: recipe.id || null,
          servings: recipe.servings || 4,
          totalTime: recipe.totalTime || null
        }));
        return {
          content: parsed.message || '',
          suggestedMeals
        };
      }
      if (parsed && parsed.message) {
        return { content: parsed.message, suggestedMeals: [] };
      }
      // If it's JSON but not a recognized format, return the message field or stringify
      return { content: typeof parsed === 'string' ? parsed : JSON.stringify(parsed), suggestedMeals: [] };
    } catch {
      // Not JSON — return as plain text
      return { content: contentString, suggestedMeals: [] };
    }
  };

  // Load conversation history from Postgres on mount
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!sessionId) return;

      setIsLoadingHistory(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // apiFetch on purpose: an empty body is the "no history yet" signal (see webhook-contract spec §2a).
        const response = await apiFetch(
          `${CHAT_HISTORY_URL}?sessionId=${encodeURIComponent(sessionId)}`,
          {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          }
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
          addDebugLog('⚠️ Chat history fetch failed:', response.status);
          return;
        }

        const responseText = await response.text();
        if (!responseText || responseText.trim() === '') {
          addDebugLog('No previous chat history found');
          return;
        }

        const historyRows = JSON.parse(responseText);

        if (!Array.isArray(historyRows) || historyRows.length === 0) {
          addDebugLog('No previous chat history found');
          return;
        }

        addDebugLog('Loading chat history:', { rowCount: historyRows.length });

        // Build messages from history
        const restoredMessages = [];
        // Start with the greeting message
        restoredMessages.push({
          id: 1,
          type: 'bot',
          content: "Hi! I'm your meal planning assistant. I can help you create delicious meal ideas based on your grocery list and preferences. What kind of meals are you looking to plan this week?",
          timestamp: 'restored'
        });

        let msgId = 1000;
        historyRows.forEach(row => {
          let msg;
          try {
            msg = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
          } catch (parseErr) {
            console.warn('[chat-history] Skipping malformed row:', parseErr.message);
            return;
          }
          if (!msg || !msg.type) return;

          // Support both formats: {type, content} (actual) and {type, data: {content}} (legacy)
          const content = msg.content || (msg.data && msg.data.content) || '';

          msgId++;
          if (msg.type === 'human') {
            restoredMessages.push({
              id: msgId,
              type: 'user',
              content: content,
              timestamp: 'restored'
            });
          } else if (msg.type === 'ai') {
            // Prefer raw_content (original structured JSON) over summary for card rendering
            let aiContent = row.raw_content || content;
            // The AI agent wraps its response in {"output": {...}}, so unwrap it
            try {
              const wrapper = JSON.parse(aiContent);
              if (wrapper && wrapper.output) {
                aiContent = JSON.stringify(wrapper.output);
              }
            } catch {
              // Not JSON wrapper, use as-is
            }
            const parsed = parseAIResponseContent(aiContent);
            restoredMessages.push({
              id: msgId,
              type: 'bot',
              content: parsed.content,
              suggestedMeals: parsed.suggestedMeals,
              timestamp: 'restored'
            });
          }
        });

        setMessages(restoredMessages);
        toast.success('Previous conversation restored', {
          duration: 2000,
          style: { fontSize: '14px' }
        });
        addDebugLog('✅ Chat history restored:', { messageCount: restoredMessages.length });
      } catch (error) {
        if (error.name === 'AbortError') {
          addDebugLog('⚠️ Chat history fetch timed out');
        } else {
          addDebugLog('⚠️ Error loading chat history:', error.message);
        }
        // Silently continue with fresh greeting — no disruption
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadChatHistory();
  }, [sessionId]);

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

  // Toggle card collapse state (cards are collapsed by default)
  const toggleCardCollapse = (messageId, mealIndex) => {
    const cardKey = `${messageId}-${mealIndex}`;
    setCollapsedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardKey)) {
        newSet.delete(cardKey);
      } else {
        newSet.add(cardKey);
      }
      return newSet;
    });
  };

  // Recipe IDs with an add request in flight (disables the '+' button)
  const [addingRecipeIds, setAddingRecipeIds] = useState(new Set());

  // Add a meal to the selected meals list
  const addMealToList = async (mealName, mealDescription, recipeId = null, totalTime = null) => {
    if (!recipeId) {
      toast.error(`Can't add "${mealName}" — ask me to suggest it again first.`);
      addDebugLog('⚠️ Cannot add meal without recipeId');
      return;
    }
    if (addingRecipeIds.has(String(recipeId))) return;
    setAddingRecipeIds(prev => new Set(prev).add(String(recipeId)));
    try {
      const weekData = getWeekDates();
      await apiJson(ENDPOINTS.addWeeklySelection, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekDateRange: weekData.displayRange,
          recipeId: Number(recipeId),
          notes: '',
        }),
      });
      toast.success(`Added "${mealName}" to this week!`);
      if (refreshMeals) await refreshMeals();
      addDebugLog('Added meal to DB and refreshed:', mealName);
    } catch (error) {
      toast.error(userMessage(error, `Failed to add "${mealName}".`));
      addDebugLog('Error adding meal:', error.message);
    } finally {
      setAddingRecipeIds(prev => {
        const next = new Set(prev);
        next.delete(String(recipeId));
        return next;
      });
    }
  };

  // Removed ingredient fetching since we're not showing ingredients in side panel

  // Remove meal from planning list
  const removeMeal = async (mealId) => {
    const mealToRemove = selectedMeals.find(meal => meal.id === mealId);
    if (!mealToRemove) return;

    // Optimistic UI — drop the meal immediately so the click feels responsive.
    // If the delete fails, refreshMeals restores the DB truth.
    setSelectedMeals(prev => prev.filter(m => m.id !== mealId));

    try {
      const weekData = getWeekDates();
      await apiJson(ENDPOINTS.removeWeeklySelection, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekDateRange: weekData.displayRange,
          recipeId: Number(mealToRemove.recipeId),
        }),
      });
      if (refreshMeals) await refreshMeals();
    } catch (error) {
      toast.error(`Failed to remove "${mealToRemove.name}". Check your connection.`);
      if (refreshMeals) await refreshMeals();
    }
  };

  // Send message to n8n webhook. `overrideText` lets Retry resend the failed
  // message directly — setting input state then calling sendMessage() read
  // the stale pre-update value and silently no-opped.
  const sendMessage = async (overrideText) => {
    const rawText = typeof overrideText === 'string' ? overrideText : inputMessage;
    if (!rawText.trim()) return;

    const messageToSend = rawText.trim();
    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: messageToSend,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    const typingId = showTypingIndicator();

    addDebugLog('Sending message to n8n chatbot webhook...', messageToSend);

    try {
      addDebugLog('Webhook URL:', CHATBOT_WEBHOOK_URL);

      // Use POST method with JSON body
      const weekData = getWeekDates();

      const payload = {
        message: messageToSend,
        context: 'meal_planning',
        timestamp: new Date().toISOString(),
        sessionId: sessionId,
        weekStartDate: weekData.startDate,
        weekEndDate: weekData.endDate,
        weekDateRange: weekData.displayRange
      };

      addDebugLog('POST payload:', payload);
      lastPayloadRef.current = payload;

      addDebugLog('Making API call to chatbot webhook with POST method...');
      // AI-agent webhook: runs 30-90s on complex asks. Long timeout, no
      // retries — a retry re-runs the whole agent (and re-writes chat memory).
      const response = await apiFetch(CHATBOT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        mode: 'cors',
        timeout: 120000,
        retries: 0,
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
          url: CHATBOT_WEBHOOK_URL
        });

        // For 500 errors, provide a helpful fallback message. Note: the
        // exchange may still have been saved server-side (chat memory writes
        // during the workflow run), so a refresh often shows the real reply.
        if (response.status === 500) {
          removeTypingIndicator(typingId);
          const fallbackMessage = {
            id: Date.now() + Math.random(), // Ensure unique ID
            type: 'bot',
            content: "Sorry — I hit a snag answering that. Try rephrasing, or refresh the page: your message may have gone through anyway.",
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
                  servings: recipe.servings || 4,
                  totalTime: recipe.totalTime || null
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
        id: Date.now() + Math.random(),
        type: 'bot',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        isRetryable: true,
        timestamp: new Date().toLocaleTimeString()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const retryLastMessage = () => {
    if (!lastPayloadRef.current) return;
    sendMessage(lastPayloadRef.current.message);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Generate grocery list from selected meals
  const handleGenerateGroceryList = useCallback(async () => {
    if (isGeneratingGroceryList) {
      addDebugLog('⚠️ Grocery list generation already in progress, ignoring duplicate request');
      return;
    }

    setIsGeneratingGroceryList(true);
    addDebugLog('Generating grocery list for meals:', selectedMeals);

    const recipeIds = selectedMeals
      .map(meal => meal.recipeId)
      .filter(id => id);

    addDebugLog('Recipe IDs to send:', recipeIds);

    const requestKey = JSON.stringify(recipeIds.sort());
    const now = Date.now();
    if (lastGroceryListRequest &&
        lastGroceryListRequest.key === requestKey &&
        (now - lastGroceryListRequest.timestamp) < 120000) {
      addDebugLog('⚠️ Duplicate request detected within 2 minutes, ignoring');
      toast('A grocery list for these same recipes was recently requested. Please wait a moment before trying again.', { icon: '⚠️' });
      setIsGeneratingGroceryList(false);
      return;
    }

    setLastGroceryListRequest({ key: requestKey, timestamp: now });

    if (recipeIds.length === 0) {
      addDebugLog('❌ No recipe IDs found in selected meals');
      toast.error('No recipe IDs found. Please make sure meals were added properly.');
      setIsGeneratingGroceryList(false);
      return;
    }

    try {
      const baseWebhookURL = ENDPOINTS.getRecipeItems;
      const weekInfo = getWeekDates();

      const recipePayload = {
        recipe_ids: JSON.stringify(recipeIds),
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        meal_count: selectedMeals.length.toString(),
        meals: JSON.stringify(selectedMeals.map(meal => ({
          id: meal.recipeId,
          name: meal.name,
          description: meal.description
        }))),
        week_start_date: weekInfo.startDate,
        week_end_date: weekInfo.endDate,
        week_display_range: weekInfo.displayRange
      };

      addDebugLog('Sending POST request to get_recipe_items webhook');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        addDebugLog('⏰ Request timed out after 90 seconds');
      }, 90000);

      const response = await apiFetch(baseWebhookURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(recipePayload),
        mode: 'cors',
        signal: controller.signal,
        retries: 0,
      });

      clearTimeout(timeoutId);
      addDebugLog('Webhook response status:', response.status);

      if (response.ok) {
        const responseData = await response.text();
        addDebugLog('✅ Successfully called get_recipe_items webhook');

        try {
          const parsedData = JSON.parse(responseData);
          setGroceryListData(parsedData);
          addDebugLog('✅ Grocery list data stored successfully');
          onNavigate('recipe-ingredients');
        } catch (parseError) {
          addDebugLog('❌ Error parsing webhook response JSON:', parseError.message);
          toast.error('Received invalid data from the server. Please try again.');
        }
      } else {
        const errorText = await response.text();
        addDebugLog('⚠️ Webhook returned non-OK status:', response.status);
        addDebugLog('Error response:', errorText);
        toast.error('Failed to generate grocery list. The server returned an error. Please try again.');
      }
    } catch (error) {
      addDebugLog('❌ Error calling get_recipe_items webhook:', error.message);
      if (error.name === 'AbortError') {
        toast.error('The grocery list generation timed out. Please try again.');
      } else if (error.message === 'Failed to fetch') {
        toast.error('Could not connect to the server. Please check your connection and try again.');
      } else {
        toast.error('Error generating grocery list. Please try again.');
      }
    } finally {
      setIsGeneratingGroceryList(false);
    }
  }, [isGeneratingGroceryList, selectedMeals, lastGroceryListRequest, sessionId, setGroceryListData, onNavigate]);

  return (
    <div className="h-full flex flex-col lg:flex-row lg:max-w-7xl lg:mx-auto lg:gap-6 lg:p-4 relative">
      {/* Loading Overlay */}
      {isGeneratingGroceryList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-2xl p-8 shadow-warm-xl max-w-md mx-4 text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
            </div>
            <h3 className="text-xl font-semibold text-heading font-display mb-2">Creating Your Grocery List</h3>
            <p className="text-body mb-4">
              Our AI is analyzing your selected meals and aggregating all the ingredients...
            </p>
            <div className="flex items-center justify-center space-x-1">
              <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '0ms'}}></div>
              <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '150ms'}}></div>
              <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '300ms'}}></div>
            </div>
            <p className="text-sm text-muted mt-4">This usually takes 10-15 seconds</p>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className={`bg-surface lg:rounded-2xl lg:shadow-warm overflow-hidden transition-all transition-colors duration-200 flex flex-col flex-1 min-h-0 ${showMealsPanel ? 'lg:flex-1' : 'w-full lg:max-w-4xl lg:mx-auto'} ${showMealsPanel ? 'lg:mr-0' : ''}`}>
        {/* Toolbar — slim contextual bar, Plan tabs already provide navigation */}
        <div className="flex items-center justify-between px-3 py-1.5 lg:px-4 lg:py-2 bg-surface border-b border-default">
          <button
            onClick={() => !isGeneratingGroceryList && setShowMealsPanel(!showMealsPanel)}
            disabled={isGeneratingGroceryList}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg transition-colors ${isGeneratingGroceryList ? 'opacity-50 cursor-not-allowed' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
          >
            <ShoppingCart size={15} />
            <span className="font-medium">Meal Plans</span>
            <span className="bg-primary text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{selectedMeals.length}</span>
          </button>

          <div className="flex items-center gap-1.5">
            {debugMode && (
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="flex items-center gap-1 text-xs text-muted hover:text-body px-2 py-1.5 rounded-lg hover:bg-background transition-colors"
              >
                <Wifi size={14} />
                {showDebug ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
            <button
              onClick={() => {
                if (window.confirm("Start a new chat session? Your current conversation will be cleared.")) {
                  const weekStart = getWeekDates().startDate;
                  const newSessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                  localStorage.setItem(`chatSessionId_${weekStart}`, newSessionId);
                  window.location.reload();
                }
              }}
              className="flex items-center text-xs text-muted hover:text-body px-2 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg hover:bg-background transition-colors"
              title="Start new session"
            >
              New Chat
            </button>
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
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6 bg-background">
          {isLoadingHistory && (
            <div className="flex items-center justify-center gap-2 text-sm text-primary py-4">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              Loading conversation history...
            </div>
          )}
          <div className="space-y-3 lg:space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col ${message.type === 'user' ? 'items-end' : 'items-start'}`}
              >
                {/* Chat bubble — text only */}
                <div
                  className={`max-w-[85%] lg:max-w-md px-3 py-2.5 lg:px-4 lg:py-3 rounded-2xl ${
                    message.type === 'user'
                      ? 'bg-primary text-white'
                      : 'bg-surface text-heading shadow-md border'
                  }`}
                >
                  {message.isTyping ? (
                    <div className="flex items-center gap-1">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-muted rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                      <Sparkles size={16} className="text-primary ml-2" />
                    </div>
                  ) : (
                    <div>
                      <div className="whitespace-pre-line text-[13px] lg:text-sm">{message.content}</div>

                      {message.isRetryable && (
                        <button
                          onClick={retryLastMessage}
                          className="mt-2 text-xs text-primary hover:text-primary-hover underline"
                        >
                          Retry last message
                        </button>
                      )}

                      <div
                        className={`text-xs mt-2 ${
                          message.type === 'user' ? 'text-primary-light' : 'text-muted'
                        }`}
                      >
                        {message.timestamp}
                      </div>
                    </div>
                  )}
                </div>

                {/* Meal suggestion cards — OUTSIDE bubble, full container width */}
                {message.suggestedMeals && message.suggestedMeals.length > 0 && (
                  <div className="w-full mt-2 space-y-2">
                    {message.suggestedMeals.map((meal, index) => {
                      const cardKey = `${message.id}-${index}`;
                      const isExpanded = collapsedCards.has(cardKey); // collapsed by default, click to expand
                      return (
                        <div key={index} className="bg-background rounded-xl border border-default overflow-hidden">
                          {/* Compact row — always visible */}
                          <div className="flex items-center gap-3 p-2.5">
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => toggleCardCollapse(message.id, index)}
                            >
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-heading text-[13px] truncate">{meal.name}</h4>
                                {meal.totalTime && (
                                  <span className="shrink-0 text-[10px] text-muted bg-surface border border-default rounded-full px-1.5 py-0.5">
                                    {meal.totalTime}m
                                  </span>
                                )}
                                <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                addMealToList(meal.name, meal.description, meal.recipeId, meal.totalTime);
                              }}
                              disabled={
                                addingRecipeIds.has(String(meal.recipeId)) ||
                                selectedMeals.some(m => String(m.recipeId) === String(meal.recipeId))
                              }
                              className="shrink-0 w-8 h-8 flex items-center justify-center bg-primary text-white rounded-full hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label={
                                selectedMeals.some(m => String(m.recipeId) === String(meal.recipeId))
                                  ? `${meal.name} already added`
                                  : `Add ${meal.name} to plan`
                              }
                            >
                              {selectedMeals.some(m => String(m.recipeId) === String(meal.recipeId))
                                ? <Check size={16} />
                                : <Plus size={16} />}
                            </button>
                          </div>
                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="px-2.5 pb-2.5 -mt-1">
                              {meal.description && (
                                <p className="text-xs text-body">{meal.description}</p>
                              )}
                              {meal.servings && (
                                <span className="text-[10px] text-muted mt-1 inline-block">Serves {meal.servings}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div ref={messagesEndRef} />
        </div>

        {/* Selected Meals Strip — desktop only */}
        {selectedMeals.length > 0 && (
          <button
            onClick={() => setShowMealsPanel(!showMealsPanel)}
            className="hidden lg:flex w-full transition-colors duration-200 hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #2a2520 0%, #332d28 100%)',
              borderTop: '1px solid rgba(193,120,73,0.3)',
              borderBottom: '1px solid rgba(193,120,73,0.15)',
              padding: '10px 16px',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{
                  background: 'linear-gradient(135deg, #c17849, #d4915e)',
                  boxShadow: '0 2px 8px rgba(193,120,73,0.3)',
                }}
              >
                <ChefHat size={14} className="text-white" />
              </div>
              <div className="text-left">
                <div className="text-[13px] font-semibold text-heading" style={{ letterSpacing: '-0.01em' }}>
                  {selectedMeals.length} meal{selectedMeals.length !== 1 ? 's' : ''} planned
                </div>
                <div className="text-[11px] text-muted">this week</div>
              </div>
            </div>
            <div
              className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg"
              style={{
                background: 'rgba(193,120,73,0.15)',
                border: '1px solid rgba(193,120,73,0.3)',
                color: '#e09565',
                letterSpacing: '0.02em',
              }}
            >
              View All &rarr;
            </div>
          </button>
        )}

        {/* Mobile Floating Meal Badge — left side, above chat input */}
        {selectedMeals.length > 0 && !showMealsPanel && (
          <button
            onClick={() => setShowMealsPanel(true)}
            className="lg:hidden fixed z-30 flex items-center gap-1.5 transition-transform hover:scale-105 active:scale-95"
            style={{
              left: '12px',
              bottom: 'calc(var(--tab-bar-height) + 4.5rem)',
              background: 'linear-gradient(135deg, #c17849, #d4915e)',
              borderRadius: '24px',
              padding: '10px 16px',
              boxShadow: '0 4px 16px rgba(193,120,73,0.4)',
            }}
          >
            <ChefHat size={16} className="text-white" />
            <span className="text-white text-sm font-bold">{selectedMeals.length}</span>
          </button>
        )}

        {/* Input Area */}
        <div className="p-3 lg:p-6 bg-surface border-t border-default">
          <div className="flex items-end gap-2">
            <textarea
              value={inputMessage}
              onChange={(e) => {
                setInputMessage(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={handleKeyPress}
              placeholder="Ask me about meal ideas..."
              className="flex-1 px-4 py-3 border border-default rounded-xl bg-surface text-heading placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent resize-none overflow-hidden"
              rows="1"
              disabled={isLoading}
              aria-label="Type your message"
            />
            <button
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-primary text-white rounded-xl hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </div>
          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-sm text-primary mt-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              Thinking...
            </div>
          )}
        </div>
      </div>

      {/* Meals Panel */}
      <AnimatePresence>
        {showMealsPanel && (
          <>
            {/* Mobile overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowMealsPanel(false)}
            />

            {/* Mobile Bottom Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl shadow-warm-xl flex flex-col"
              style={{ maxHeight: '55vh' }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 bg-default rounded-full" />
              </div>

              {/* Compact header */}
              <div className="flex items-center justify-between px-4 py-2 rounded-t-2xl" style={{ background: 'linear-gradient(135deg, #c17849, #d4915e)' }}>
                <div className="flex items-center gap-2 text-white">
                  <ChefHat size={18} />
                  <h2 className="text-base font-semibold">Selected Meals</h2>
                  <span className="text-sm opacity-90">({selectedMeals.length})</span>
                </div>
                <button onClick={() => setShowMealsPanel(false)} className="p-1.5 hover:bg-white/20 rounded-lg text-white">
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable meal list */}
              <div className="flex-1 overflow-y-auto overscroll-contain p-3">
                {selectedMeals.length === 0 ? (
                  <div className="text-center text-muted py-6">
                    <ChefHat size={36} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No meals selected yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedMeals.map((meal) => (
                      <div key={meal.id} className="flex items-center gap-3 p-2.5 border border-default rounded-xl bg-surface">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-heading text-sm truncate">{meal.name}</h3>
                          {meal.totalTime && <span className="text-[11px] text-muted">{meal.totalTime} min</span>}
                        </div>
                        <button onClick={() => removeMeal(meal.id)} className="shrink-0 text-danger hover:text-danger-hover">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CTA */}
              {selectedMeals.length > 0 && (
                <div className="border-t border-default p-3 bg-background">
                  <button
                    onClick={handleGenerateGroceryList}
                    disabled={isGeneratingGroceryList}
                    className="w-full py-2.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                  >
                    {isGeneratingGroceryList ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Creating Grocery List...
                      </>
                    ) : (
                      <>
                        <ShoppingCart size={16} />
                        Generate Grocery List ({selectedMeals.length})
                      </>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar — rendered outside AnimatePresence so it unmounts
          immediately on close, rather than waiting for the mobile sheet's
          spring exit animation (which blocked click responsiveness). */}
      {showMealsPanel && (
          <div className="hidden lg:flex lg:relative lg:inset-auto lg:w-96 bg-surface lg:rounded-2xl shadow-warm overflow-hidden flex-col z-auto">
              <div className="bg-primary text-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ChefHat size={20} />
                    <h2 className="text-lg font-semibold">Selected Meals</h2>
                  </div>
                  <button
                    onClick={() => setShowMealsPanel(false)}
                    className="p-1 hover:bg-white/20 rounded transition-colors"
                    aria-label="Close meal plans"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm opacity-90">
                    {selectedMeals.length} meal{selectedMeals.length !== 1 ? 's' : ''} selected
                  </p>
                  {selectedMeals.length > 1 && (
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Remove all ${selectedMeals.length} meals from your plan?`)) return;
                        // Delete from the DB too — local-only clear resurrects
                        // every meal on the next refresh (audit finding [43]).
                        const toRemove = [...selectedMeals];
                        setSelectedMeals([]);
                        const weekData = getWeekDates();
                        try {
                          await Promise.all(toRemove.map(m =>
                            apiJson(ENDPOINTS.removeWeeklySelection, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                weekDateRange: weekData.displayRange,
                                recipeId: Number(m.recipeId),
                              }),
                            })
                          ));
                        } catch (err) {
                          toast.error('Some meals could not be removed.');
                        } finally {
                          if (refreshMeals) await refreshMeals();
                        }
                      }}
                      className="text-xs opacity-80 hover:opacity-100 hover:bg-white/20 px-2 py-1 rounded transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain p-4">
                {selectedMeals.length === 0 ? (
                  <div className="text-center text-muted mt-8">
                    <ChefHat size={48} className="mx-auto mb-3 opacity-50" />
                    <p>No meals selected yet</p>
                    <p className="text-sm mt-1">Add meals from chat suggestions to start planning</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedMeals.map((meal) => (
                      <div key={meal.id} className="border border-default rounded-2xl bg-surface transition-colors duration-200">
                        <div className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-heading">{meal.name}</h3>
                              <p className="text-sm text-body mt-1">{meal.description}</p>
                              {(meal.servings || meal.totalTime) && (
                                <div className="flex items-center gap-2 mt-2 text-xs text-muted">
                                  {meal.servings && <span>Serves {meal.servings}</span>}
                                  {meal.totalTime && <span>{meal.servings ? '• ' : ''}{meal.totalTime} min cook time</span>}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => removeMeal(meal.id)}
                              className="text-danger hover:text-danger-hover transition-colors ml-2"
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
                <div className="border-t border-default p-4 bg-background">
                  <div className="text-sm text-body mb-3">
                    {selectedMeals.length} meal{selectedMeals.length !== 1 ? 's' : ''} selected
                  </div>
                  <button
                    onClick={handleGenerateGroceryList}
                    disabled={isGeneratingGroceryList}
                    className={`w-full px-4 py-2 rounded-xl transition-colors flex items-center justify-center gap-2 ${
                      isGeneratingGroceryList
                        ? 'bg-muted cursor-not-allowed'
                        : 'bg-primary hover:bg-primary-hover'
                    } text-white`}
                  >
                    {isGeneratingGroceryList ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Creating Your Grocery List...
                      </>
                    ) : (
                      <>
                        <ShoppingCart size={16} />
                        Generate Grocery List
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
    </div>
  );
};

export default ChatBot;