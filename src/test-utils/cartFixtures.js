export const activeSession = { active: true, loginSessionValid: true, idleSeconds: 0, sessionId: 'original-session' };
export const idleSession = { active: false, loginSessionValid: true, idleSeconds: 0 };
export const expiredSession = { active: false, loginSessionValid: false };
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
