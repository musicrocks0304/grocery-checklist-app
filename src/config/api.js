import toast from 'react-hot-toast';

/**
 * Centralized API configuration.
 * All webhook URLs and API endpoints are defined here.
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://n8n-grocery.needexcelexpert.com/webhook';

const CLIP_SERVER_URL = process.env.REACT_APP_CLIP_SERVER_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:3847' : 'https://clip.needexcelexpert.com');

/**
 * All n8n webhook endpoint paths, keyed by a descriptive name.
 * Usage: ENDPOINTS.fetchGroceryItems => full URL
 */
export const ENDPOINTS = {
  // Grocery
  fetchGroceryItems: `${API_BASE_URL}/fetch_grocery_items`,
  deactivateGroceryItem: `${API_BASE_URL}/deactivate_grocery_item`,
  addGroceryItems: `${API_BASE_URL}/add_grocery_items`,
  createGroceryList: `${API_BASE_URL}/create_grocery_list`,
  removeWeeklyItem: `${API_BASE_URL}/remove_weekly_item`,

  // Coupons
  matchCoupons: `${API_BASE_URL}/match_coupons`,
  fetchHebCoupons: `${API_BASE_URL}/fetch_heb_coupons`,

  // Chatbot
  callGroceryAgent: `${API_BASE_URL}/call_grocery_agent`,
  chatHistory: `${API_BASE_URL}/chat_history`,
  getRecipeItems: `${API_BASE_URL}/get_recipe_items`,

  // Recipes
  mealIngredients: `${API_BASE_URL}/meal_ingredients`,
  chooseRecipeInstructions: `${API_BASE_URL}/choose_recipe_instructions`,

  // Weekly meal selections (DB-backed)
  fetchWeeklyMeals: `${API_BASE_URL}/fetch_weekly_meals`,
  fetchWeeklyMealIngredients: `${API_BASE_URL}/fetch_weekly_meal_ingredients`,
  addWeeklySelection: `${API_BASE_URL}/add_weekly_selection`,
  removeWeeklySelection: `${API_BASE_URL}/remove_weekly_selection`,

  // Shopping progress (DB-backed)
  shoppingProgress: `${API_BASE_URL}/shopping_progress`,
  shoppingProgressCheck: `${API_BASE_URL}/shopping_progress_check`,
  shoppingProgressUncheck: `${API_BASE_URL}/shopping_progress_uncheck`,

  // Per-tap selection persistence (DB-backed)
  selectionCheck: `${API_BASE_URL}/selection_check`,
  selectionUncheck: `${API_BASE_URL}/selection_uncheck`,

  // Partner shopping sessions (invite + live polling)
  createSession: `${API_BASE_URL}/create_session`,
  joinSession: `${API_BASE_URL}/join_session`,

  grabInstructionsFast: `${API_BASE_URL}/grab_instructions_fast`,

  // Meal Creator
  mealCreatorPropose: `${API_BASE_URL}/meal_creator_propose`,
  mealCreatorBuild: `${API_BASE_URL}/meal_creator_build`,
  mealCreatorSave: `${API_BASE_URL}/meal_creator_save`,

  // Clip Server
  clipServerApi: `${CLIP_SERVER_URL}/api/clip`,
  clipServerProgress: `${CLIP_SERVER_URL}/api/clip-progress`,
  clipServerHealth: `${CLIP_SERVER_URL}/api/health`,

  // HEB Cart Builder — session management
  hebSessionStart: `${CLIP_SERVER_URL}/api/heb/session/start`,
  hebSessionStatus: `${CLIP_SERVER_URL}/api/heb/session/status`,
  hebSessionEnd: `${CLIP_SERVER_URL}/api/heb/session/end`,

  // HEB Cart Builder — product search & cart
  hebSearch: `${CLIP_SERVER_URL}/api/heb/search`,
  hebSearchBatch: `${CLIP_SERVER_URL}/api/heb/search-batch`,
  hebFrequent: `${CLIP_SERVER_URL}/api/heb/frequent`,
  hebFrequentCached: `${CLIP_SERVER_URL}/api/heb/frequent-cached`,
  hebCart: `${CLIP_SERVER_URL}/api/heb/cart`,
  hebAddToCart: `${CLIP_SERVER_URL}/api/heb/add-to-cart`,
  hebProduct: `${CLIP_SERVER_URL}/api/heb/product`,
  hebBuildCart: `${CLIP_SERVER_URL}/api/heb/build-cart`,
  hebBuildProgress: `${CLIP_SERVER_URL}/api/heb/build-progress`,

  // HEB Cart Builder — product matches
  hebMatchesAll: `${CLIP_SERVER_URL}/api/heb/matches/all`,
  hebMatches: `${CLIP_SERVER_URL}/api/heb/matches`,
  hebMatchConfirm: `${CLIP_SERVER_URL}/api/heb/matches/confirm`,
  hebMatchReject: `${CLIP_SERVER_URL}/api/heb/matches/reject`,

  // HEB Cart Builder — AI smart matching (n8n)
  hebSmartMatch: `${API_BASE_URL}/smart_match_grocery`,

  // HEB Cart Builder — weekly list + coupon data
  hebWeeklyItems: `${CLIP_SERVER_URL}/api/heb/weekly-items`,

  // Coupon match persistence (n8n)
  saveCouponMatches: `${API_BASE_URL}/save_coupon_matches`,

  // Smart Deals — frequent products vs active coupons (n8n)
  smartDeals: `${API_BASE_URL}/smart_deals`,

  // Add item to weekly list (clip server)
  hebAddWeeklyItem: `${CLIP_SERVER_URL}/api/heb/add-weekly-item`,

  // One-off items (n8n) — adds directly to WeeklyGroceryList, no catalog entry
  addOneOffItem: `${API_BASE_URL}/add_oneoff_item`,

  // Feedback
  submitFeedback: `${API_BASE_URL}/submit_feedback`,
  fetchFeedback: `${API_BASE_URL}/fetch_feedback`,

  // Grocery Prep
  groceryPrep: `${API_BASE_URL}/grocery_prep`,
  groceryPrepStatus: `${API_BASE_URL}/grocery_prep_status`,
};

/**
 * Authenticated fetch wrapper with retry and timeout.
 *
 * Options (in addition to standard fetch options):
 *   retries:  number of retries on 5xx/network errors (default: 2)
 *   timeout:  request timeout in ms (default: 30000)
 *
 * Retries use exponential backoff: 1s, 2s, 4s, ...
 * 4xx responses are NOT retried (client errors).
 */
export async function apiFetch(url, options = {}) {
  const { retries = 2, timeout = 30000, ...fetchOptions } = options;
  const apiKey = process.env.REACT_APP_API_KEY;
  const headers = {
    ...(fetchOptions.headers || {}),
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
  };

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Wait before retry (skip first attempt)
    if (attempt > 0) {
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Don't retry client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry server errors (5xx)
      if (!response.ok && attempt < retries) {
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        continue;
      }

      return response;
    } catch (err) {
      lastError = err;
      if (attempt >= retries) {
        throw err;
      }
    }
  }

  throw lastError;
}

/**
 * Show an error toast with optional retry. Call from components after apiFetch fails.
 *
 * Usage:
 *   try { await apiFetch(url); }
 *   catch (err) { showApiError(err, () => loadData()); }
 */
export function showApiError(error, onRetry) {
  const isTimeout = error.name === 'AbortError';
  const isNetwork = error.message === 'Failed to fetch';

  let message = 'Something went wrong';
  if (isTimeout) message = 'Request timed out';
  else if (isNetwork) message = 'Network error — check your connection';

  if (onRetry) {
    toast.error(
      (t) => (
        <span>
          {message}{' '}
          <button
            onClick={() => { toast.dismiss(t.id); onRetry(); }}
            style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            Retry
          </button>
        </span>
      ),
      { duration: 6000 }
    );
  } else {
    toast.error(message, { duration: 4000 });
  }
}

/**
 * Normalize DB meal response to match the component prop interface.
 * DB returns: { selection_id, recipe_id, recipe_name, recipe_description, ... }
 * Components expect: { id, name, recipeId, description, ... }
 */
export function normalizeDbMeals(dbRows) {
  if (!Array.isArray(dbRows)) return [];
  return dbRows.map(row => ({
    id: row.selection_id,
    name: row.recipe_name,
    recipeId: String(row.recipe_id),
    description: row.recipe_description || row.notes || '',
    prepTime: row.prep_time_minutes,
    cookTime: row.cook_time_minutes,
    totalTime: row.total_time_minutes,
    servings: row.servings,
    difficulty: row.difficulty_level,
    tags: row.tags,
    ingredients: [],
  }));
}

export { API_BASE_URL, CLIP_SERVER_URL };
