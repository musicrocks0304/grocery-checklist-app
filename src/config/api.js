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
  categories: `${API_BASE_URL}/categories`,
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

  // Voice check-off v2 (server-side Whisper transcription)
  transcribeGroceryItem: `${API_BASE_URL}/transcribe_grocery_item`,

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
 *   signal:   caller AbortSignal — honored alongside the timeout; a
 *             caller abort is never retried
 *
 * Retries use exponential backoff: 1s, 2s, 4s, ...
 * 4xx responses are NOT retried (client errors).
 * Timeouts and aborts are NOT retried — retrying a timed-out call to a
 * slow AI-agent webhook triples its cost and never helps (bug FB#28).
 * AI-agent callers should use apiJson (retries default to 0 on POST) with an explicit long timeout.
 */
export async function apiFetch(url, options = {}) {
  const { retries = 2, timeout = 30000, signal: callerSignal, ...fetchOptions } = options;
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

    if (callerSignal?.aborted) {
      const err = new DOMException('Aborted by caller', 'AbortError');
      throw err;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const onCallerAbort = () => controller.abort();
      callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

      let response;
      try {
        response = await fetch(url, {
          ...fetchOptions,
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', onCallerAbort);
      }

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
      // Never retry aborts: a timeout abort just repeats the timeout against
      // a slow endpoint, and a caller abort means the caller moved on.
      if (err.name === 'AbortError') {
        throw err;
      }
      lastError = err;
      if (attempt >= retries) {
        throw err;
      }
    }
  }

  throw lastError;
}

/**
 * Error thrown by apiJson. `code` is one of:
 *   http         non-2xx response (message from the JSON error/message field when present)
 *   forbidden    403 — the key was rejected (stale bundle)
 *   empty        2xx with no body — n8n finished without a Respond node firing
 *   invalid_json 2xx with a body that is not JSON
 *   network      fetch threw (DNS, offline, CORS-blocked 500 text/html)
 *   timeout      the apiFetch timeout fired
 */
export class ApiError extends Error {
  constructor(code, message, { status = 0, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

const MUTATING_METHODS = ['POST', 'PUT', 'DELETE'];
const FORBIDDEN_MESSAGE = "This app version can't reach the server. Reload and try again.";

/**
 * apiFetch + JSON contract. Returns the parsed body on 2xx; throws ApiError
 * otherwise. Mutations (POST/PUT/DELETE) default to retries: 0 — retrying a
 * mutation duplicates data or multiplies AI cost; reads keep retries: 2.
 * A caller-aborted request rethrows the original AbortError.
 */
export async function apiJson(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const retries = options.retries ?? (MUTATING_METHODS.includes(method) ? 0 : 2);

  let response;
  try {
    response = await apiFetch(url, { ...options, retries });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      if (options.signal?.aborted) throw err;
      throw new ApiError('timeout', 'Request timed out');
    }
    if (err instanceof TypeError || err instanceof DOMException || err?.name === 'TypeError') {
      throw new ApiError('network', 'Network error — check your connection');
    }
    throw err;
  }

  let text;
  try {
    text = await response.text();
  } catch {
    throw new ApiError('network', 'Network error — check your connection', { status: response.status });
  }
  const trimmed = text.trim();
  let body = null;
  let parsed = false;
  if (trimmed !== '') {
    try { body = JSON.parse(text); parsed = true; } catch { /* not JSON */ }
  }

  if (response.status === 403) {
    throw new ApiError('forbidden', FORBIDDEN_MESSAGE, { status: 403, body: parsed ? body : text });
  }
  if (!response.ok) {
    const field = parsed && body && typeof body === 'object' ? (body.error ?? body.message) : undefined;
    const message = typeof field === 'string' && field.trim()
      ? field
      : `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
    throw new ApiError('http', message, { status: response.status, body: parsed ? body : text });
  }
  if (trimmed === '') {
    throw new ApiError('empty', 'The server sent an empty response', { status: response.status });
  }
  if (!parsed) {
    throw new ApiError('invalid_json', 'The server sent an unreadable response', { status: response.status, body: text });
  }
  return body;
}

/**
 * Pick a user-facing message for a caught error: the ApiError's own message
 * when it is one of the codes known to be safe to show verbatim
 * (forbidden/timeout/network — never a server-supplied string), otherwise a
 * caller-supplied fallback. Use this at toast sites that currently
 * concatenate a raw `error.message` into a sentence.
 */
export function userMessage(err, fallback = 'Something went wrong') {
  if (err instanceof ApiError && ['forbidden', 'timeout', 'network'].includes(err.code)) {
    return err.message;
  }
  return fallback;
}

/**
 * Show an error toast with optional retry. Call from components after apiFetch fails.
 *
 * Usage:
 *   try { await apiFetch(url); }
 *   catch (err) { showApiError(err, () => loadData()); }
 */
export function showApiError(error, onRetry) {
  let message = 'Something went wrong';
  if (error instanceof ApiError) {
    message = error.message;
  } else if (error?.name === 'AbortError') {
    message = 'Request timed out';
  } else if (error?.message === 'Failed to fetch') {
    message = 'Network error — check your connection';
  }

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
