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
  grabInstructionsFast: `${API_BASE_URL}/grab_instructions_fast`,

  // Meal Creator
  mealCreatorPropose: `${API_BASE_URL}/meal_creator_propose`,
  mealCreatorBuild: `${API_BASE_URL}/meal_creator_build`,
  mealCreatorSave: `${API_BASE_URL}/meal_creator_save`,

  // Clip Server
  clipServerApi: `${CLIP_SERVER_URL}/api/clip`,
  clipServerProgress: `${CLIP_SERVER_URL}/api/clip-progress`,

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
};

/**
 * Authenticated fetch wrapper. Adds X-API-Key header to every request.
 * Drop-in replacement for window.fetch — same signature, same return value.
 */
export function apiFetch(url, options = {}) {
  const apiKey = process.env.REACT_APP_API_KEY;
  const headers = {
    ...(options.headers || {}),
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
  };
  return fetch(url, { ...options, headers });
}

export { API_BASE_URL, CLIP_SERVER_URL };
