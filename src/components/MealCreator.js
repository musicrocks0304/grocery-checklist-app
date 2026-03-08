import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, ChefHat, ArrowLeft, ChevronDown, ChevronUp, Wifi, Clock, Users, Flame, Check, Plus, RotateCcw, BookOpen, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { getWeekDateRange, getWeekDates } from '../utils/weekDates';
import { ENDPOINTS, apiFetch } from '../config/api';

// Generate or retrieve a creator-specific session ID — keyed by week so each grocery week gets fresh history
const getCreatorSessionId = () => {
  const weekStart = getWeekDates().startDate;
  const storageKey = `creatorSessionId_${weekStart}`;
  // Legacy fallback: keep existing random ID for current week
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  // New deterministic format
  const sessionId = `creator_${weekStart}`;
  return sessionId;
};

const PROPOSE_WEBHOOK_URL = ENDPOINTS.mealCreatorPropose;
const BUILD_WEBHOOK_URL = ENDPOINTS.mealCreatorBuild;
const SAVE_WEBHOOK_URL = ENDPOINTS.mealCreatorSave;
const ADD_TO_WEEK_WEBHOOK_URL = ENDPOINTS.callGroceryAgent;

const CHAT_HISTORY_URL = ENDPOINTS.chatHistory;

const MealCreator = ({ onBack, onNavigate, selectedMeals, setSelectedMeals, refreshMeals, debugMode = false }) => {
  const [sessionId] = useState(getCreatorSessionId());
  const [phase, setPhase] = useState(1); // 1=describe, 2=building, 3=preview, 4=saved
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      content: "Hi! I'm your recipe creator. Tell me what you're craving and I'll invent something new for your family. Describe a cuisine, protein, mood, or anything — I'll come up with 2-3 original ideas!",
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [, setProposals] = useState([]);
  const [fullRecipe, setFullRecipe] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [expandedSections, setExpandedSections] = useState(new Set(['ingredients', 'instructions', 'notes']));
  const [debugInfo, setDebugInfo] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef(null);
  const lastProposeRef = useRef(null);

  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, { timestamp, message, data }]);
    console.log(`[Creator ${timestamp}] ${message}`, data || '');
  };

  // Parse AI response for meal creator (handles proposals)
  const parseCreatorAIContent = (contentString) => {
    try {
      const parsed = JSON.parse(contentString);
      if (parsed && parsed.responseType === 'recipe_proposals' && parsed.proposals) {
        return {
          content: parsed.message || "Here are some ideas! Pick one and I'll build the full recipe.",
          proposals: parsed.proposals,
        };
      }
      if (parsed && parsed.message) {
        return { content: parsed.message, proposals: [] };
      }
      return { content: typeof parsed === 'string' ? parsed : JSON.stringify(parsed), proposals: [] };
    } catch {
      return { content: contentString, proposals: [] };
    }
  };

  // Load conversation history from Postgres on mount (same endpoint as ChatBot)
  useEffect(() => {
    const loadCreatorHistory = async () => {
      if (!sessionId) return;
      setIsLoadingHistory(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await apiFetch(
          `${CHAT_HISTORY_URL}?sessionId=${encodeURIComponent(sessionId)}`,
          { headers: { Accept: 'application/json' }, signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
          addDebugLog('Chat history fetch failed:', response.status);
          return;
        }

        const responseText = await response.text();
        if (!responseText || responseText.trim() === '') {
          addDebugLog('No previous creator history found');
          return;
        }

        const historyRows = JSON.parse(responseText);
        if (!Array.isArray(historyRows) || historyRows.length === 0) {
          addDebugLog('No previous creator history found');
          return;
        }

        addDebugLog('Loading creator history:', { rowCount: historyRows.length });

        const restoredMessages = [];
        restoredMessages.push({
          id: 1,
          type: 'bot',
          content: "Hi! I'm your recipe creator. Tell me what you're craving and I'll invent something new for your family. Describe a cuisine, protein, mood, or anything — I'll come up with 2-3 original ideas!",
          timestamp: 'restored',
        });

        let msgId = 1000;
        historyRows.forEach((row) => {
          const msg = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
          if (!msg || !msg.type) return;

          const content = msg.content || (msg.data && msg.data.content) || '';
          msgId++;

          if (msg.type === 'human') {
            restoredMessages.push({
              id: msgId,
              type: 'user',
              content,
              timestamp: 'restored',
            });
          } else if (msg.type === 'ai') {
            let aiContent = content;
            // Unwrap n8n AI Agent output wrapper
            try {
              const wrapper = JSON.parse(aiContent);
              if (wrapper && wrapper.output) {
                aiContent = JSON.stringify(wrapper.output);
              }
            } catch {
              // Not a wrapper, use as-is
            }
            const parsed = parseCreatorAIContent(aiContent);
            restoredMessages.push({
              id: msgId,
              type: 'bot',
              content: parsed.content,
              proposals: parsed.proposals,
              timestamp: 'restored',
            });
          }
        });

        setMessages(restoredMessages);
        toast.success('Previous conversation restored', {
          duration: 2000,
          style: { fontSize: '14px' },
        });
        addDebugLog('Creator history restored:', { messageCount: restoredMessages.length });
      } catch (error) {
        if (error.name === 'AbortError') {
          addDebugLog('Creator history fetch timed out');
        } else {
          addDebugLog('Error loading creator history:', error.message);
        }
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadCreatorHistory();
  }, [sessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const toggleSection = (section) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) newSet.delete(section);
      else newSet.add(section);
      return newSet;
    });
  };

  // ===== PHASE 1: Send message to get proposals =====
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

    // Show typing indicator
    const typingId = Date.now() + Math.random();
    setMessages(prev => [...prev, { id: typingId, type: 'bot', content: '...', isTyping: true, timestamp: '' }]);

    addDebugLog('Sending proposal request...', messageToSend);

    try {
      const weekData = getWeekDates();
      const payload = {
        message: messageToSend,
        sessionId: sessionId,
        context: 'meal_creation',
        weekDateRange: weekData.displayRange,
        timestamp: new Date().toISOString()
      };

      lastProposeRef.current = payload;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await apiFetch(PROPOSE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      const responseText = await response.text();
      addDebugLog('Raw propose response:', responseText);

      let data = JSON.parse(responseText);

      // Handle array wrapper from n8n
      if (Array.isArray(data) && data.length > 0) data = data[0];

      // Unwrap n8n AI Agent output
      let output = data;
      if (data.output && typeof data.output === 'object') output = data.output;
      else if (data.output && typeof data.output === 'string') {
        try { output = JSON.parse(data.output); } catch { output = data; }
      }

      addDebugLog('Parsed output:', output);

      // Remove typing indicator
      setMessages(prev => prev.filter(msg => msg.id !== typingId));

      if (output.responseType === 'recipe_proposals' && output.proposals) {
        setProposals(output.proposals);
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'bot',
          content: output.message || "Here are some ideas! Pick one and I'll build the full recipe.",
          proposals: output.proposals,
          timestamp: new Date().toLocaleTimeString()
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'bot',
          content: output.message || output.text || JSON.stringify(output),
          timestamp: new Date().toLocaleTimeString()
        }]);
      }
    } catch (error) {
      addDebugLog('Error in propose:', error.message);
      setMessages(prev => prev.filter(msg => msg.id !== typingId));
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: 'bot',
        content: error.name === 'AbortError'
          ? "That took too long — please try again with a simpler description."
          : "Something went wrong generating proposals. Please try again!",
        isRetryable: true,
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ===== PHASE 2: Build full recipe from selected proposal =====
  const buildRecipe = async (proposal) => {
    setPhase(2);
    setIsBuilding(true);
    addDebugLog('Building full recipe for:', proposal.name);

    try {
      const weekData = getWeekDates();
      const payload = {
        proposalName: proposal.name,
        proposalDescription: proposal.description,
        userNotes: `Cuisine: ${proposal.cuisineStyle}. Protein: ${proposal.protein}. Kid vehicle: ${proposal.kidVehicle}. Adult twist: ${proposal.adultTwist}.`,
        message: `Build a complete recipe for: ${proposal.name}. ${proposal.description}. Cuisine: ${proposal.cuisineStyle}. Protein: ${proposal.protein}. Kid vehicle: ${proposal.kidVehicle}. Adult twist: ${proposal.adultTwist}.`,
        sessionId: sessionId,
        weekDateRange: weekData.displayRange,
        timestamp: new Date().toISOString()
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min for full build

      const response = await apiFetch(BUILD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      const responseText = await response.text();
      addDebugLog('Raw build response:', responseText);

      let data = JSON.parse(responseText);
      if (Array.isArray(data) && data.length > 0) data = data[0];

      let output = data;
      if (data.output && typeof data.output === 'object') output = data.output;
      else if (data.output && typeof data.output === 'string') {
        try { output = JSON.parse(data.output); } catch { output = data; }
      }

      addDebugLog('Parsed build output:', output);

      if (output.responseType === 'full_recipe' && output.recipe) {
        setFullRecipe(output.recipe);
        setPhase(3);
        toast.success('Recipe built! Review and save it below.');
      } else {
        throw new Error('Unexpected response format from build webhook');
      }
    } catch (error) {
      addDebugLog('Error in build:', error.message);
      toast.error(error.name === 'AbortError' ? 'Recipe build timed out. Try again.' : 'Error building recipe. Please try again.');
      setPhase(1); // Go back to proposals
    } finally {
      setIsBuilding(false);
    }
  };

  // ===== SAVE: Persist to MySQL =====
  const saveRecipe = async () => {
    if (!fullRecipe) return;
    setIsSaving(true);
    addDebugLog('Saving recipe to database:', fullRecipe.recipe_name);

    try {
      const payload = { recipe: fullRecipe };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await apiFetch(SAVE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      const responseText = await response.text();
      addDebugLog('Save response:', responseText);

      let data = JSON.parse(responseText);
      if (Array.isArray(data) && data.length > 0) data = data[0];

      if (data.success) {
        setSaveResult(data);
        setPhase(4);
        toast.success(`"${data.recipeName}" saved to your recipe book!`);
      } else {
        throw new Error(data.message || 'Save failed');
      }
    } catch (error) {
      addDebugLog('Error saving:', error.message);
      toast.error('Error saving recipe. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ===== ADD TO THIS WEEK =====
  const addToThisWeek = async () => {
    if (!saveResult) return;
    const weekData = getWeekDates();

    const newMeal = {
      id: Date.now(),
      name: saveResult.recipeName,
      description: fullRecipe?.recipe_description || '',
      recipeId: String(saveResult.recipeId),
      totalTime: fullRecipe?.total_time_minutes || null,
      servings: fullRecipe?.servings || 4,
      ingredients: []
    };

    // Call the webhook first, then update local state on success
    try {
      const payload = {
        message: `Add recipe to this week: ${saveResult.recipeName}`,
        context: 'add_meal',
        recipeId: String(saveResult.recipeId),
        recipeName: saveResult.recipeName,
        sessionId: sessionId,
        weekStartDate: weekData.startDate,
        weekEndDate: weekData.endDate,
        weekDateRange: weekData.displayRange,
        timestamp: new Date().toISOString()
      };

      const response = await apiFetch(ADD_TO_WEEK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors'
      });

      if (response.ok) {
        if (refreshMeals) await refreshMeals();
        toast.success(`Added to this week's meals!`);
        addDebugLog('Added to weekly_selections:', saveResult.recipeId);

        // Now extract ingredients and insert them into WeeklyGroceryList
        // so they appear under the "Meals" filter on the Grocery Selection screen
        try {
          addDebugLog('Extracting recipe ingredients for grocery list...');
          const recipeId = String(saveResult.recipeId);
          const ingredientPayload = {
            recipe_ids: JSON.stringify([recipeId]),
            session_id: sessionId,
            timestamp: new Date().toISOString(),
            meal_count: '1',
            meals: JSON.stringify([{
              id: recipeId,
              name: saveResult.recipeName,
              description: fullRecipe?.recipe_description || ''
            }]),
            week_start_date: weekData.startDate,
            week_end_date: weekData.endDate,
            week_display_range: weekData.displayRange
          };

          const ingredientResponse = await apiFetch(ENDPOINTS.getRecipeItems, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ingredientPayload),
            mode: 'cors'
          });

          if (ingredientResponse.ok) {
            const ingredientData = await ingredientResponse.json();
            addDebugLog('Got recipe ingredients:', ingredientData);

            // Transform into the format /meal_ingredients expects
            const rawIngredients = ingredientData[0]?.output?.ingredients || ingredientData?.output?.ingredients || [];
            if (rawIngredients.length > 0) {
              let itemId = 1;
              const transformedIngredients = rawIngredients.map(ing => ({
                ItemID: itemId++,
                ItemName: ing.name,
                Category: ing.category || 'General',
                Store: 'HEB',
                GroceryStoreSection: ing.category || 'General',
                IsSelected: 1,
                QuantitySelected: ing.purchaseQuantity || '1'
              }));

              const mealIngredientsPayload = {
                ingredients: JSON.stringify(transformedIngredients),
                totalItems: transformedIngredients.length.toString(),
                selectedMeals: JSON.stringify([{
                  id: recipeId,
                  name: saveResult.recipeName,
                  description: fullRecipe?.recipe_description || ''
                }]),
                weekStartDate: weekData.startDate,
                weekEndDate: weekData.endDate,
                weekDateRange: weekData.displayRange,
                timestamp: new Date().toISOString(),
                source: 'meal_creator_add_to_week'
              };

              const insertResponse = await apiFetch(ENDPOINTS.mealIngredients, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mealIngredientsPayload),
                mode: 'cors'
              });

              if (insertResponse.ok) {
                addDebugLog(`Inserted ${transformedIngredients.length} ingredients into grocery list`);
              } else {
                addDebugLog('Failed to insert meal ingredients:', insertResponse.status);
              }
            } else {
              addDebugLog('No ingredients returned from recipe extraction');
            }
          } else {
            addDebugLog('Failed to extract recipe ingredients:', ingredientResponse.status);
          }
        } catch (ingredientError) {
          // Don't fail the whole operation if ingredient extraction fails
          addDebugLog('Error extracting/inserting ingredients:', ingredientError.message);
          console.error('Ingredient extraction error:', ingredientError);
        }
      } else {
        toast.error('Failed to add meal to this week. Please try again.');
        addDebugLog('Webhook returned non-OK:', response.status);
      }
    } catch (error) {
      addDebugLog('Error adding to week:', error.message);
      toast.error('Failed to add meal. Check your connection.');
    }
  };

  const startOver = () => {
    setPhase(1);
    setProposals([]);
    setFullRecipe(null);
    setSaveResult(null);
    // Create a fresh session ID for new conversation
    const newSessionId = `creator_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const weekStart = getWeekDates().startDate;
    localStorage.setItem(`creatorSessionId_${weekStart}`, newSessionId);
    // Reset messages to initial greeting
    setMessages([{
      id: 1,
      type: 'bot',
      content: "Hi! I'm your recipe creator. Tell me what you're craving and I'll invent something new for your family. Describe a cuisine, protein, mood, or anything — I'll come up with 2-3 original ideas!",
      timestamp: new Date().toLocaleTimeString()
    }]);
    // Reload to pick up the new session ID
    window.location.reload();
  };

  const retryLastPropose = () => {
    if (!lastProposeRef.current) return;
    setInputMessage(lastProposeRef.current.message || lastProposeRef.current.description || '');
    setTimeout(() => sendMessage(), 50);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Group ingredients by category
  const groupedIngredients = fullRecipe?.ingredients?.reduce((acc, ing) => {
    const cat = ing.ingredient_category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ing);
    return acc;
  }, {}) || {};

  // Parse kid plate and make it better from notes
  const parseNotes = (notes) => {
    if (!notes) return { kidPlate: '', makeItBetter: '' };
    const parts = notes.split('|').map(p => p.trim());
    let kidPlate = '';
    let makeItBetter = '';
    for (const part of parts) {
      if (part.toUpperCase().startsWith('KID PLATE:')) kidPlate = part.replace(/^KID PLATE:\s*/i, '');
      if (part.toUpperCase().startsWith('MAKE IT BETTER:')) makeItBetter = part.replace(/^MAKE IT BETTER:\s*/i, '');
    }
    return { kidPlate, makeItBetter };
  };

  return (
    <div className="h-screen flex flex-col lg:max-w-5xl lg:mx-auto lg:p-4">
      {/* Building Overlay */}
      {isBuilding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-2xl p-8 shadow-warm-xl max-w-md mx-4 text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent border-t-transparent"></div>
            </div>
            <h3 className="text-xl font-semibold text-heading font-display mb-2">Building Your Recipe</h3>
            <p className="text-body mb-4">
              The AI is crafting a detailed Blue Apron-style recipe with ingredients, step-by-step instructions, and kid-friendly modifications...
            </p>
            <div className="flex items-center justify-center space-x-1">
              <div className="animate-bounce h-2 w-2 bg-accent rounded-full" style={{animationDelay: '0ms'}}></div>
              <div className="animate-bounce h-2 w-2 bg-accent rounded-full" style={{animationDelay: '150ms'}}></div>
              <div className="animate-bounce h-2 w-2 bg-accent rounded-full" style={{animationDelay: '300ms'}}></div>
            </div>
            <p className="text-sm text-muted mt-4">This usually takes 20-40 seconds</p>
          </div>
        </div>
      )}

      {/* Saving Overlay */}
      {isSaving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-2xl p-8 shadow-warm-xl max-w-md mx-4 text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
            </div>
            <h3 className="text-xl font-semibold text-heading mb-2">Saving to Recipe Book</h3>
            <p className="text-body">Normalizing ingredients, creating database entries...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="bg-surface lg:rounded-2xl lg:shadow-warm overflow-hidden flex flex-col flex-1 transition-colors duration-200">
        {/* Header */}
        <div className="bg-accent text-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 hover:bg-white/20 rounded-xl transition-colors" aria-label="Go back">
                <ArrowLeft size={20} />
              </button>
              <Sparkles size={24} />
              <h1 className="text-xl font-bold font-display">AI Meal Creator</h1>
            </div>
            <div className="flex items-center gap-2">
              {debugMode && (
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  className="flex items-center gap-1 text-sm hover:bg-white/20 px-2 py-1 rounded-xl transition-colors"
                >
                  <Wifi size={16} />
                  <span className="hidden sm:inline">Debug</span>
                </button>
              )}
              <button
                onClick={startOver}
                className="flex items-center gap-1 text-sm hover:bg-white/20 px-2 py-1 rounded-xl transition-colors"
              >
                <RotateCcw size={16} />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </div>

          {/* Phase Indicator */}
          <div className="flex items-center gap-2 text-sm">
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${phase >= 1 ? 'bg-white/30 font-semibold' : 'bg-white/10'}`}>
              <span>1.</span> Describe
            </div>
            <div className="w-4 h-px bg-white/40"></div>
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${phase >= 2 ? 'bg-white/30 font-semibold' : 'bg-white/10'}`}>
              <span>2.</span> Build
            </div>
            <div className="w-4 h-px bg-white/40"></div>
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${phase >= 3 ? 'bg-white/30 font-semibold' : 'bg-white/10'}`}>
              <span>3.</span> Preview
            </div>
            <div className="w-4 h-px bg-white/40"></div>
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${phase >= 4 ? 'bg-white/30 font-semibold' : 'bg-white/10'}`}>
              <span>4.</span> Save
            </div>
          </div>

          <div className="bg-white/20 rounded-lg p-3 mt-3">
            <p className="text-sm font-medium">{getWeekDateRange()}</p>
            <p className="text-xs opacity-90 mt-1">Create brand-new recipes tailored to your family</p>
          </div>
        </div>

        {/* Debug Panel */}
        {showDebug && (
          <div className="p-4 bg-gray-900 text-white">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Wifi size={20} /> Creator Debug
            </h3>
            <div className="space-y-1 text-sm font-mono max-h-60 overflow-y-auto">
              {debugInfo.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-gray-400">[{log.timestamp}]</span>
                  <span className={
                    log.message.includes('✅') ? 'text-green-400' :
                    log.message.includes('❌') ? 'text-red-400' :
                    'text-gray-200'
                  }>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6 bg-background">

          {/* History loading indicator */}
          {isLoadingHistory && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-accent">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-accent"></div>
              Loading conversation history...
            </div>
          )}

          {/* ===== PHASE 1 & 2: Chat Messages ===== */}
          {(phase === 1 || phase === 2) && (
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] lg:max-w-lg px-4 py-3 rounded-2xl ${
                    message.type === 'user'
                      ? 'bg-accent text-white'
                      : 'bg-surface text-heading shadow-md border border-default'
                  }`}>
                    {message.isTyping ? (
                      <div className="flex items-center gap-1">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-muted rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                          <div className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                        </div>
                        <Sparkles size={16} className="text-accent ml-2" />
                      </div>
                    ) : (
                      <div>
                        <div className="whitespace-pre-line">{message.content}</div>

                        {/* Proposal Cards */}
                        {message.proposals && message.proposals.length > 0 && (
                          <div className="mt-3 space-y-3">
                            {message.proposals.map((proposal, index) => (
                              <div key={index} className="bg-accent-light rounded-2xl border border-accent-border p-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h4 className="font-bold text-heading text-base">{proposal.name}</h4>
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                      <span className="text-xs bg-accent-light text-accent px-2 py-0.5 rounded-full">{proposal.cuisineStyle}</span>
                                      <span className="text-xs text-muted flex items-center gap-1"><Clock size={12} /> {proposal.estimatedTotalTime} min</span>
                                    </div>
                                  </div>
                                </div>
                                <p className="text-sm text-body mt-2">{proposal.description}</p>
                                <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted">
                                  <span><strong>Protein:</strong> {proposal.protein}</span>
                                  <span>•</span>
                                  <span><strong>Kid:</strong> {proposal.kidVehicle}</span>
                                  <span>•</span>
                                  <span><strong>Adult twist:</strong> {proposal.adultTwist}</span>
                                </div>
                                <button
                                  onClick={() => buildRecipe(proposal)}
                                  disabled={isBuilding}
                                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-50"
                                >
                                  <ChefHat size={16} />
                                  Build This Recipe
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {message.isRetryable && (
                          <button
                            onClick={retryLastPropose}
                            className="mt-2 text-xs text-primary hover:text-primary-hover underline"
                          >
                            Retry
                          </button>
                        )}

                        <div className={`text-xs mt-2 ${message.type === 'user' ? 'text-accent-light' : 'text-muted'}`}>
                          {message.timestamp}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* ===== PHASE 3: Recipe Preview ===== */}
          {phase === 3 && fullRecipe && (
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Recipe Header */}
              <div className="bg-surface rounded-2xl shadow-warm border border-default p-6 transition-colors duration-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-heading font-display">{fullRecipe.recipe_name}</h2>
                    <p className="text-body mt-1">{fullRecipe.recipe_description}</p>
                  </div>
                  <span className="text-xs bg-accent-light text-accent px-2 py-1 rounded-full font-medium">NEW</span>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-body">
                  <span className="flex items-center gap-1"><Clock size={16} className="text-accent" /> {fullRecipe.total_time_minutes || '—'} min total</span>
                  <span className="flex items-center gap-1"><Flame size={16} className="text-accent" /> {fullRecipe.prep_time_minutes || '—'} min prep</span>
                  <span className="flex items-center gap-1"><Users size={16} className="text-blue-500" /> Serves {fullRecipe.servings || 4}</span>
                  <span className="px-2 py-0.5 bg-background rounded text-xs font-medium capitalize">{fullRecipe.difficulty_level || 'medium'}</span>
                </div>
                {fullRecipe.tags && fullRecipe.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {fullRecipe.tags.map((tag, i) => (
                      <span key={i} className="text-xs bg-background text-body px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Ingredients */}
              <div className="bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
                <button
                  onClick={() => toggleSection('ingredients')}
                  className="w-full flex items-center justify-between p-4 hover:bg-background"
                >
                  <h3 className="text-lg font-semibold text-heading flex items-center gap-2">
                    <BookOpen size={20} className="text-primary" /> Ingredients
                    <span className="text-sm font-normal text-muted">({fullRecipe.ingredients?.length || 0})</span>
                  </h3>
                  {expandedSections.has('ingredients') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.has('ingredients') && (
                  <div className="px-4 pb-4">
                    {Object.entries(groupedIngredients).map(([category, ingredients]) => (
                      <div key={category} className="mb-3">
                        <h4 className="text-sm font-semibold text-accent uppercase tracking-wide mb-1.5">{category}</h4>
                        <ul className="space-y-1">
                          {ingredients.map((ing, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-body">
                              <Check size={14} className="text-primary mt-0.5 flex-shrink-0" />
                              <span>
                                <strong>{ing.quantity} {ing.unit_name}</strong> {ing.ingredient_name}
                                {ing.preparation_notes && <span className="text-muted"> — {ing.preparation_notes}</span>}
                                {ing.optional && <span className="text-muted italic"> (optional)</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
                <button
                  onClick={() => toggleSection('instructions')}
                  className="w-full flex items-center justify-between p-4 hover:bg-background"
                >
                  <h3 className="text-lg font-semibold text-heading flex items-center gap-2">
                    <ChefHat size={20} className="text-accent" /> Instructions
                    <span className="text-sm font-normal text-muted">({fullRecipe.instructions?.length || 0} steps)</span>
                  </h3>
                  {expandedSections.has('instructions') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.has('instructions') && (
                  <div className="px-4 pb-4 space-y-3">
                    {fullRecipe.instructions?.map((step) => (
                      <div key={step.step_number} className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-light text-accent flex items-center justify-center font-bold text-sm">
                          {step.step_number}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-body">{step.instruction_text}</p>
                          {step.time_minutes && (
                            <span className="text-xs text-muted flex items-center gap-1 mt-1">
                              <Clock size={12} /> {step.time_minutes} min
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Kid Plate & Make It Better */}
              {fullRecipe.notes && (
                <div className="bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
                  <button
                    onClick={() => toggleSection('notes')}
                    className="w-full flex items-center justify-between p-4 hover:bg-background"
                  >
                    <h3 className="text-lg font-semibold text-heading">Kid Plate & Tips</h3>
                    {expandedSections.has('notes') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                  {expandedSections.has('notes') && (
                    <div className="px-4 pb-4 space-y-3">
                      {parseNotes(fullRecipe.notes).kidPlate && (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <h4 className="text-sm font-semibold text-blue-700 mb-1">👦 Kid Plate</h4>
                          <p className="text-sm text-blue-800">{parseNotes(fullRecipe.notes).kidPlate}</p>
                        </div>
                      )}
                      {parseNotes(fullRecipe.notes).makeItBetter && (
                        <div className="bg-purple-50 rounded-lg p-3">
                          <h4 className="text-sm font-semibold text-purple-700 mb-1">✨ Make It Better</h4>
                          <p className="text-sm text-purple-800">{parseNotes(fullRecipe.notes).makeItBetter}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={saveRecipe}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-hover transition-colors font-semibold disabled:opacity-50"
                >
                  <Save size={20} />
                  Save to Recipe Book
                </button>
                <button
                  onClick={() => { setPhase(1); setFullRecipe(null); }}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-default text-body rounded-xl hover:bg-background transition-colors"
                >
                  <ArrowLeft size={18} />
                  Back
                </button>
              </div>
            </div>
          )}

          {/* ===== PHASE 4: Save Success ===== */}
          {phase === 4 && saveResult && (
            <div className="max-w-md mx-auto text-center mt-12">
              <div className="bg-surface rounded-2xl shadow-warm border border-default p-8">
                <div className="w-16 h-16 bg-primary-light rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check size={32} className="text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-heading font-display mb-2">Recipe Saved!</h2>
                <p className="text-body mb-1">"{saveResult.recipeName}"</p>
                <p className="text-sm text-muted mb-6">Recipe ID: #{saveResult.recipeId} • {saveResult.ingredientsProcessed} ingredients • {saveResult.instructionsProcessed} steps • {saveResult.tagsProcessed} tags</p>

                <div className="space-y-3">
                  <button
                    onClick={addToThisWeek}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover transition-colors font-semibold"
                  >
                    <Plus size={20} />
                    Add to This Week's Meals
                  </button>
                  <button
                    onClick={startOver}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-background text-body rounded-xl hover:bg-default transition-colors"
                  >
                    <Sparkles size={18} />
                    Create Another Recipe
                  </button>
                  <button
                    onClick={() => onNavigate('chatbot')}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-muted hover:text-body transition-colors"
                  >
                    Go to AI Meal Planner →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area (Phase 1 only) */}
        {phase === 1 && (
          <div className="p-4 lg:p-6 bg-surface border-t border-default">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Describe what you're craving... (e.g., 'quick chicken pasta, Italian vibes, under 30 min')"
                  className="w-full px-4 py-3 border border-default rounded-xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
                  rows="2"
                  disabled={isLoading}
                  aria-label="Describe what you're craving"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputMessage.trim() || isLoading}
                className="px-6 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <Send size={20} />
                Send
              </button>
            </div>
            {isLoading && (
              <div className="flex items-center justify-center gap-2 text-sm text-accent mt-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-accent"></div>
                Inventing recipes...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MealCreator;
