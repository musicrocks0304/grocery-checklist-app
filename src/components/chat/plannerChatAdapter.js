import { ENDPOINTS } from '../../config/api';
import { getWeekDates } from '../../utils/weekDates';

const CHATBOT_WEBHOOK_URL = ENDPOINTS.callGroceryAgent;

export function createPlannerChatAdapter({ sessionId, selectedMeals, setSelectedMeals, setMessages, setIsLoading, addDebugLog }) {
  return {
    endpoint: CHATBOT_WEBHOOK_URL,
    createTypingMessage() {
      return {
        id: Date.now() + Math.random(), // Ensure unique ID
        type: 'bot',
        content: '...',
        isTyping: true,
        timestamp: new Date().toLocaleTimeString()
      };
    },
    onSend(messageToSend) {
      addDebugLog('Sending message to n8n chatbot webhook...', messageToSend);
    },
    buildPayload(messageToSend) {
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
      return payload;
    },
    beforeRequest() {
      addDebugLog('Making API call to chatbot webhook with POST method...');
    },
    async handleResponse(response, { typingId, removeTypingIndicator }) {
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
    },
    handleError(error, { typingId, removeTypingIndicator }) {
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
    },
    retryText(payload) {
      return payload.message;
    },
  };
}
