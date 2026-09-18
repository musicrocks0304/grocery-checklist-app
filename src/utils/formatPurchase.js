/**
 * How a quantity and a unit become one string a shopper reads in an aisle.
 * Canonical source — do not re-implement at a render site.
 *
 * WHY THIS EXISTS (F6). `Ingredient Agent` → `Convert to Shopping List` returns
 * two fields whose jobs overlap: `purchaseQuantity` ALREADY carries a unit noun
 * ("1 small jar", "1 lb", "2 cans") and `purchaseUnit` names the package
 * ("small jar", "1 lb package"). Six render sites each concatenated them by
 * hand, so the shopper read:
 *
 *     Buy: 1 small jar small jar
 *     Buy: 1 lb 1 lb package
 *     Buy: 1 head whole head
 *
 * Three of those sites had no guard at all, and two of those three are the
 * screens where a wrong string costs money or a wasted trip — the H-E-B Cart
 * Builder (`cart/MatchCard.js`) and In-Store Mode (`instore/ShoppingItems.js`).
 * On those the value arrives as a bare INT from `WeeklyGroceryList.Quantity`
 * with `Unit` alongside, which produced the other half of the defect:
 *
 *     2 1 lb package        (two numbers jammed together)
 *
 * NOTHING STORED CHANGES. An earlier design pluralised `purchaseUnit` into
 * "1 lb packages" so a bare count could be appended. An adversarial review
 * killed it: that value is written to `WeeklyGroceryList.Unit`, which the
 * scraper reads directly (`heb-cart-routes.js`, `GET /api/heb/weekly-items`),
 * and the two unguarded screens would then have rendered "2 1 lb packages"
 * verbatim. Fixing this purely at render time has no blast radius at all.
 *
 * The rules, in order:
 *
 *  1. No usable quantity  -> '' (never "0", "NaN" or "undefined").
 *  2. The quantity already contains a word -> show it alone. It has said
 *     everything the shopper needs; appending the unit is the duplication bug.
 *     Secondary package detail ("6 oz" of "6 oz can") is lost on purpose —
 *     `toPurchaseQuantity` picks it arbitrarily anyway (4 oz of sweet peppers
 *     becomes "1 lb package"), so it is not information worth garbling for.
 *  3. A unit that says nothing -> drop it. '' / null / 'item' (already
 *     suppressed by every previous render site) and 'as needed', which is not a
 *     unit but the aggregator's fallback for an unrecognised one — live data
 *     pairs it with real counts of 2-4, so "4 as needed" was reachable.
 *  4. A bare count with a unit starting with a digit -> join with '×', so two
 *     numbers never sit side by side.
 *  5. Otherwise -> "<count> <unit>".
 */

// Units that carry no information for a shopper. 'items' (plural) IS kept:
// "4 items" is exactly right.
const EMPTY_UNITS = new Set(['', 'item', 'as needed']);

export const formatPurchase = (quantity, unit) => {
  const q = quantity === null || quantity === undefined ? '' : String(quantity).trim();
  // '' covers absent; '0' covers a row that should not exist since a stored
  // Quantity is floored at 1 (TB-3b), but a "0" on a shopping list is worse than
  // no number at all.
  if (!q || q === '0' || q === 'NaN') return '';

  const u = (unit === null || unit === undefined ? '' : String(unit).trim());
  const uKey = u.toLowerCase();

  // The quantity already names its own unit ("1 small jar", "2 lbs", "8 tbsp").
  if (/[a-z]/i.test(q)) return q;

  if (EMPTY_UNITS.has(uKey)) return q;

  // "2 1 lb package" -> "2 × 1 lb package".
  if (/^\d/.test(u)) return `${q} × ${u}`;

  return `${q} ${u}`;
};

/**
 * The same string, for the small multiplicity badge used by the H-E-B Cart
 * Builder (`cart/MatchCard.js`) and In-Store Mode (`instore/ShoppingItems.js`).
 *
 * Identical to `formatPurchase` except that a count with no meaningful unit
 * keeps the `×N` prefix those two pills have always shown. Preserving it means
 * the F6 fix changes ONLY the broken strings on those screens — "2 1 lb package"
 * becomes "2 × 1 lb package" — and leaves every row the shopper is used to
 * looking exactly as before. Most rows are a NULL unit (708 Staples and 75
 * MealIngredients rows live), so changing "×1" to "1" would have been a visible
 * churn on nearly every line for no benefit.
 */
export const formatPurchaseBadge = (quantity, unit) => {
  const text = formatPurchase(quantity, unit);
  if (!text) return '';
  // A bare count came back unchanged, i.e. there was no unit worth showing.
  return /^\d+$/.test(text) ? `×${text}` : text;
};

/**
 * The suffix shown after an item name on the Grocery List and Review screens
 * (F8 — those screens showed no quantity at all, so an inflated one stayed
 * invisible until the H-E-B Cart Builder spent it).
 *
 * Reads `QuantitySelected` OR `Quantity` deliberately: the two branches of
 * `fetch_grocery_items` disagree. `Pull Current Week Grocery List` aliases the
 * column `QuantitySelected`; `Pull Clean Slate Grocery List` — the branch taken
 * when the week has no rows yet — returns `1 AS Quantity` and has no
 * `QuantitySelected` at all. Accepting either is what makes a fresh week render
 * correctly instead of by accident.
 *
 * Returns '' when the answer is just "1", which says nothing a checkbox has not
 * already said. 708 live Staples rows are Quantity 1 with a NULL unit and must
 * stay clean; the 31 rows a shopper has genuinely set to 2-10 still show.
 */
export const summarizePurchase = (item) => {
  if (!item) return '';
  const raw = item.QuantitySelected !== undefined && item.QuantitySelected !== null
    ? item.QuantitySelected
    : item.Quantity;
  const text = formatPurchase(raw, item.Unit);
  return text === '1' ? '' : text;
};
