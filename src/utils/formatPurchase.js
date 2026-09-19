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

/**
 * The recipe NEED as one string a shopper reads (purchase-need slice 1).
 * Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md, section 2.
 *
 * WHY. `toPurchaseQuantity` guesses a package for every meal ingredient and the
 * guess is poor: 43% of weight rows need 8 oz or less and all read "1 lb", 90%
 * of volume rows read "1 small jar". Corey shops IN PERSON (385 In-Store
 * check-offs against 3 cart builds), where the label IS the purchase
 * instruction — "Sweet peppers · 1 lb package" at the shelf means a 1 lb bag
 * for a 4 oz need. So every screen a human reads now shows what the recipes
 * actually need.
 *
 * ONE SHAPE, ONE RENDERER. Two producers hand this function the same fields:
 *   before submit  `Convert to Shopping List` (Ingredient Agent) — JS numbers
 *   after submit   `Pull Grocery Staples` — MySQL DECIMALs, which the n8n MySQL
 *                  node returns as STRINGS ("12.0000000", execution 27542)
 * Every amount is coerced with Number() and rounded to 3 dp before formatting,
 * so "12.0000000" reads "12" and float noise (0.30000000000000004) reads 0.3.
 * The two producers apply the same counted-unit set and fold rule, so the same
 * ingredient reads identically before and after submit.
 *
 *   NeedOz          ounces        "10 oz"; at 16+ "1 lb", "2 lbs", "1 lb 4 oz"
 *   NeedTsp         teaspoons     under 3 "2 tsp"; under 48 "3 tbsp"; "1.5 cups"
 *   NeedCount       counted amount, in NeedCountUnit:
 *   NeedCountUnit     'piece' alone -> a bare number ("Corn tortillas · 12");
 *                     otherwise worded ("3 cloves", "2 cans", "1 fluid ounce")
 *   NeedUnspecified 1 when a recipe gave no amount -> "as needed", but ONLY when
 *                   nothing else is known (a real amount wins, per TB-3b)
 *
 * Several groups join with " + " in a fixed order — weight, volume, count —
 * "1 lb + 1.5 cups". Decimals are trimmed the way `Aggregate Ingredients`'
 * formatQuantity trims them. NeedCountUnit 'mixed' means two counted units
 * could not be folded, so NeedCount is not trustworthy and the WHOLE row falls
 * back rather than show part of the need.
 *
 * `multiplier` is the pre-submit xN selector: xN is N times the need
 * (decision 5), so x3 of 4 oz reads "12 oz". After submit the SQL has already
 * applied RecipeMultiplier, so callers there pass nothing.
 *
 * Returns '' when there is nothing to say: no need fields at all (staples,
 * one-offs, pre-2026-04-26 weeks, F7's unmatched rows, and a frontend deployed
 * before the n8n change) or 'mixed'. Every render site then falls back to the
 * purchase text it showed before — never to blank.
 */
const toAmount = (value, multiplier) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value) * multiplier;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000) / 1000;
};

const trimDecimals = (n) => (n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

const formatOunces = (oz) => {
  if (oz < 16) return `${trimDecimals(oz)} oz`;
  const lbs = Math.floor(oz / 16);
  const rest = Math.round((oz - lbs * 16) * 1000) / 1000;
  const lbText = `${lbs} lb${lbs > 1 ? 's' : ''}`;
  return rest === 0 ? lbText : `${lbText} ${trimDecimals(rest)} oz`;
};

const formatTeaspoons = (tsp) => {
  if (tsp >= 48) {
    const cups = tsp / 48;
    return cups % 1 === 0 ? `${cups} cup${cups > 1 ? 's' : ''}` : `${trimDecimals(cups)} cups`;
  }
  if (tsp >= 3) return `${trimDecimals(tsp / 3)} tbsp`;
  return `${tsp} tsp`;
};

// "2 bunches", not formatQuantity's "2 bunchs"; "dozen" does not pluralise.
const pluralUnit = (unit, n) => {
  if (n <= 1 || unit === 'dozen') return unit;
  return /(s|x|z|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`;
};

export const formatNeed = (need, multiplier = 1) => {
  if (!need || typeof need !== 'object') return '';
  if (need.NeedCountUnit === 'mixed') return '';
  const m = Number.isFinite(Number(multiplier)) && Number(multiplier) > 0 ? Number(multiplier) : 1;

  const parts = [];
  const oz = toAmount(need.NeedOz, m);
  if (oz !== null) parts.push(formatOunces(oz));
  const tsp = toAmount(need.NeedTsp, m);
  if (tsp !== null) parts.push(formatTeaspoons(tsp));
  const count = need.NeedCountUnit ? toAmount(need.NeedCount, m) : null;
  if (count !== null) {
    const unit = String(need.NeedCountUnit);
    parts.push(unit === 'piece' && parts.length === 0
      ? trimDecimals(count)
      : `${trimDecimals(count)} ${pluralUnit(unit, count)}`);
  }
  if (parts.length) return parts.join(' + ');
  return Number(need.NeedUnspecified) === 1 ? 'as needed' : '';
};
