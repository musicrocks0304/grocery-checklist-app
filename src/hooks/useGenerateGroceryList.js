import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getWeekDates } from '../utils/weekDates';
import { ENDPOINTS, apiFetch } from '../config/api';

/**
 * Generates the grocery list for the week's selected meals.
 *
 * Lifted out of ChatBot so the Create Recipe tab can finish the chain it starts
 * (TB-1). MealCreator used to walk the shopper as far as "Add to This Week's
 * Meals" and then stop, because this button existed only in ChatBot — the only
 * way on was to notice the "Go to AI Meal Planner" link or switch tabs by hand.
 *
 * Deliberately one implementation rather than two: this posts to a webhook with
 * a 90-second timeout and a 2-minute duplicate guard, and a second copy would
 * drift.
 *
 * @param {object}   opts
 * @param {Array}    opts.selectedMeals      meals for the week; ids come from `recipeId`
 * @param {string}   opts.sessionId          caller's session id (chat or creator)
 * @param {Function} opts.setGroceryListData receives the parsed webhook payload
 * @param {Function} opts.onNavigate         called with 'recipe-ingredients' on success
 * @param {Function} [opts.addDebugLog]      optional logger
 * @returns {{ generate: Function, isGenerating: boolean }}
 */
export default function useGenerateGroceryList({
  selectedMeals,
  sessionId,
  setGroceryListData,
  onNavigate,
  addDebugLog = () => {},
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastRequest, setLastRequest] = useState(null);

  const generate = useCallback(async () => {
    if (isGenerating) {
      addDebugLog('⚠️ Grocery list generation already in progress, ignoring duplicate request');
      return;
    }

    setIsGenerating(true);
    addDebugLog('Generating grocery list for meals:', selectedMeals);

    const recipeIds = selectedMeals
      .map(meal => meal.recipeId)
      .filter(id => id);

    addDebugLog('Recipe IDs to send:', recipeIds);

    const requestKey = JSON.stringify(recipeIds.sort());
    const now = Date.now();
    if (lastRequest &&
        lastRequest.key === requestKey &&
        (now - lastRequest.timestamp) < 120000) {
      addDebugLog('⚠️ Duplicate request detected within 2 minutes, ignoring');
      toast('A grocery list for these same recipes was recently requested. Please wait a moment before trying again.', { icon: '⚠️' });
      setIsGenerating(false);
      return;
    }

    setLastRequest({ key: requestKey, timestamp: now });

    if (recipeIds.length === 0) {
      addDebugLog('❌ No recipe IDs found in selected meals');
      toast.error('No recipe IDs found. Please make sure meals were added properly.');
      setIsGenerating(false);
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
      setIsGenerating(false);
    }
  }, [isGenerating, selectedMeals, lastRequest, sessionId, setGroceryListData, onNavigate, addDebugLog]);

  return { generate, isGenerating };
}
