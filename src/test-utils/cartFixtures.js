export const activeSession = { active: true, loginSessionValid: true, idleSeconds: 0, sessionId: 'original-session' };
export const idleSession = { active: false, loginSessionValid: true, idleSeconds: 0 };
export const expiredSession = { active: false, loginSessionValid: false };
// `/api/health` payloads — the shared session state's only input. Note the
// healthy one carries `storeId: '794'` with `storeExpected: '794'`; a real live
// session usually reports `storeId: null` (HEB resolves the curbside store
// server-side), which deriveState also treats as healthy.
export const healthySessionHealth = { sessionAuthenticated: true, storeId: '794', storeSource: 'curr', storeExpected: '794', authExpiresAt: null };
export const expiredSessionHealth = { sessionAuthenticated: false, sessionReason: 'no_auth_cookies', storeId: null, storeSource: null, storeExpected: '794', authExpiresAt: null };
export const cartItems = [
  { ItemID: 23, ItemName: 'Bread', Category: 'Groceries', Quantity: 2 },
  { ItemID: 31, ItemName: 'Milk', Category: 'Groceries', Quantity: 0 },
  { ItemID: 44, ItemName: 'Rice', Category: 'Groceries', Quantity: 1 },
  { ItemID: 55, ItemName: 'Salt', Category: 'Groceries', Quantity: 1 },
];
export const savedMatches = cartItems.map((item, index) => ({
  grocery_item_id: item.ItemID,
  heb_product_id: `product-${item.ItemID}`,
  heb_sku_id: index === 0 ? 'sku-bread' : null,
  heb_product_name: `HEB ${item.ItemName}`,
  heb_product_url: index === 3 ? null : `https://www.heb.com/product-${item.ItemID}`,
  heb_price: 2,
  confidence: 'high',
  match_source: 'manual',
  user_confirmed: index === 2 ? 0 : 1,
}));
export function cartFetchMap(overrides = {}) {
  return {
    // Cart reads the shared session state from the clip server's /api/health;
    // without it every Cart suite would log an unmocked request.
    '/api/health': healthySessionHealth,
    '/api/heb/session/status': activeSession,
    '/api/heb/session/start': { sessionId: 'reconnected-session' },
    '/api/heb/session/end': { success: true },
    '/api/heb/weekly-items': { items: cartItems },
    '/api/heb/matches/all': { matches: savedMatches },
    '/api/heb/matches/confirm': { success: true },
    '/api/heb/matches/reject': { success: true },
    '/api/heb/matches': { success: true },
    '/api/heb/build-cart': { jobId: 'job-1' },
    ...overrides,
  };
}
