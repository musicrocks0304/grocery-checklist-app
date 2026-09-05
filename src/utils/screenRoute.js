// Hash-route resolution for the SPA. Kept as a pure module (no window access)
// so it can be unit tested and reused by both the initial-render path and the
// popstate/hashchange listeners in App.js.

// New primary screen IDs + legacy IDs still routable during transition
export const VALID_SCREENS = [
  // New flow screens
  "home", "plan", "meals", "deals", "cart", "shop", "cook",
  // Legacy IDs — still routable for internal navigation during phased migration
  "grocery", "chatbot", "meal-creator", "recipe-ingredients", "recipe-instructions",
  "in-store", "coupons", "heb-cart", "smart-deals",
];

// Map legacy hash IDs to new screen IDs for URL normalization
export const LEGACY_REDIRECT = {
  grocery: "plan",
  "smart-deals": "deals",
  "heb-cart": "cart",
  "in-store": "shop",
  "recipe-instructions": "cook",
};

const JOIN_PREFIX = "join/";

/**
 * Resolve a location hash to a route.
 *
 * @param {string} hash - e.g. "#deals", "deals", "#join/GS62", "" (leading # optional)
 * @returns {{ screen: string } | { join: string }} `{ join }` for a partner
 *   invite link, otherwise `{ screen }` — always a valid new-flow screen ID,
 *   defaulting to "home" for empty/unknown hashes.
 */
export function resolveScreenFromHash(hash) {
  const raw = typeof hash === "string" ? hash.replace(/^#/, "") : "";
  if (!raw) return { screen: "home" };

  if (raw.startsWith(JOIN_PREFIX)) {
    const code = raw.slice(JOIN_PREFIX.length).trim().toUpperCase();
    return code ? { join: code } : { screen: "home" };
  }

  const redirected = LEGACY_REDIRECT[raw];
  if (redirected) return { screen: redirected };

  return { screen: VALID_SCREENS.includes(raw) ? raw : "home" };
}
