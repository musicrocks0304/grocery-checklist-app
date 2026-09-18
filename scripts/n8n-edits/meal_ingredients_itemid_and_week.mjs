// Two independent hardening fixes to `Transform for DB Input` in
// `Create Grocery List - Meals` (webhook path `meal_ingredients`) — the node
// that decides what actually lands in WeeklyGroceryList.
//
// ── F7: unmatched ingredient names all collapsed onto ItemID 1000 ──────────
// A meal row's identity is `ItemID = ingredient_id + 1000`. That convention is
// load-bearing downstream: `Pull Grocery Staples` derives meal attribution and
// optionality from `ItemID - 1000 = ingredients.ingredient_id`, and the orphan
// cleanup prunes by the same key.
//
// A name the `ingredients` catalogue does not know fell through
// `(ingredientIdByName[name] || 0) + 1000` to the single id **1000** — for
// every such name. `uq_week_item (week_start_date, ItemID)` permits exactly one
// row per ItemID per week and the INSERT is `ON DUPLICATE KEY UPDATE
// ItemName = VALUES(ItemName)`, so the second unmatched name in a week
// silently REPLACED the first, the third the second, and the shopper lost rows
// with nothing written anywhere to say so.
//
// It has never fired: `SELECT COUNT(*) FROM WeeklyGroceryList WHERE
// ItemID = 1000` is 0 across the table's entire history, because
// `get_recipe_items` sources its names from the same `ingredients` table they
// are looked up against. That is the only thing protecting it. One rename, or
// any future free-text ingredient path, and it fires silently.
//
// Each distinct unmatched name now gets its own id in the 900000-999999 band.
// Nothing else uses it: WeeklyGroceryList holds 14-344 (the GroceryItems
// catalogue), 1001-1888 (ingredient_id + 1000) and 100000-100053 (one-offs);
// one-offs are identified by `DataSource = 'OneOff'` rather than by range; and
// no active n8n workflow and no frontend file keys off an ItemID range
// (checked across all 84 workflows — only two INACTIVE migration workflows
// mention 100000 at all).
//
// The id is a hash of the name, so it is stable: re-submitting the same week
// upserts the same row instead of accumulating duplicates. `ItemID - 1000` for
// a banded id resolves to no ingredient, so such a row is simply unattributed
// and buckets under "Other meal ingredients" — which is safe only because the
// list screen no longer drops unattributed rows (TB-4). The names are also
// reported back on the response, so an unmatched name stops being invisible.
//
// ── F9: week_start_date was re-derived by regex from the display string ────
// `parseWeekStart()` parsed the week back out of
// "For the week of September 20th to September 26th, 2026" — a second source
// of truth that returns `null` on any copy change to that string. The frontend
// already sends `weekStartDate` as an ISO date in the same payload
// (`RecipeIngredients.js:88`), and `Lookup Existing Staples` in THIS SAME
// workflow already trusts it with exactly the validation used below. Getting
// null here is not a missing value: `Insert Meal Ingredients` interpolates the
// result straight into `week_start_date`, so it is a broken INSERT.
//
// The regex parse is kept as a fallback rather than deleted — it costs nothing
// and covers a caller that omits the field.
//
// Idempotent: re-applying is a no-op. Refuses to half-edit a node that already
// carries one marker but not the other.

const NODE = 'Transform for DB Input';

// --- F7 -------------------------------------------------------------------

const ID_OLD = '    const stableId = (ingredientIdByName[itemNameNorm] || 0) + 1000;';
const ID_NEW = [
  '    // An unknown name must NOT share an id with every other unknown name —',
  '    // uq_week_item would make each new one overwrite the last (F7).',
  '    const matchedId = ingredientIdByName[itemNameNorm];',
  '    const stableId =',
  "      typeof matchedId === 'number' && matchedId > 0",
  '        ? matchedId + 1000',
  '        : unmatchedItemId(itemNameNorm);',
].join('\n');

// Both F7's helpers and F9's hoisted declaration land immediately above the
// transform pipeline, where `ingredientIdByName` is already built.
const ANCHOR = 'const droppedAsStaple = [];';

const HELPERS = [
  '// Ids for ingredient names the catalogue does not know. See the header of',
  '// scripts/n8n-edits/meal_ingredients_itemid_and_week.mjs for why this band.',
  'const UNMATCHED_BAND_START = 900000;',
  'const UNMATCHED_BAND_SIZE = 100000;',
  'const unmatchedIngredients = [];',
  'const unmatchedIdByName = {};',
  'const usedUnmatchedSlots = new Set();',
  '',
  'function hashName(str) {',
  '  // FNV-1a, 32-bit. Any stable hash does; this one is short and dependency-free.',
  '  let h = 0x811c9dc5;',
  '  for (let i = 0; i < str.length; i++) {',
  '    h ^= str.charCodeAt(i);',
  '    h = Math.imul(h, 0x01000193) >>> 0;',
  '  }',
  '  return h;',
  '}',
  '',
  'function unmatchedItemId(nameNorm) {',
  '  if (unmatchedIdByName[nameNorm] !== undefined) return unmatchedIdByName[nameNorm];',
  '  // Deterministic from the name, so the same week re-submitted upserts the same',
  '  // row; probed only on an actual collision, so two names never share an id.',
  '  let slot = hashName(nameNorm) % UNMATCHED_BAND_SIZE;',
  '  while (usedUnmatchedSlots.has(slot)) slot = (slot + 1) % UNMATCHED_BAND_SIZE;',
  '  usedUnmatchedSlots.add(slot);',
  '  const id = UNMATCHED_BAND_START + slot;',
  '  unmatchedIdByName[nameNorm] = id;',
  '  unmatchedIngredients.push({ name: nameNorm, ItemID: id });',
  '  return id;',
  '}',
  '',
  ANCHOR,
].join('\n');

// --- F9 -------------------------------------------------------------------

// `weekStart` was computed inside the .map(), once per item, from the display
// string. Drop that and hoist a single declaration that prefers the ISO date.
const WEEKSTART_DECL_OLD = '    const weekStart = parseWeekStart(weekDateRange);\n';

const WEEKSTART_HOIST = [
  '// The caller already sends the week as an ISO date, and `Lookup Existing',
  '// Staples` in this workflow already trusts it with this exact validation.',
  '// Re-deriving it from the human-readable display string was a second source',
  '// of truth that yields null on any copy change — and null is interpolated',
  '// straight into week_start_date by the INSERT (F9).',
  "const bodyWeekStart = String(webhookData.body.weekStartDate || '');",
  'const weekStart = /^\\d{4}-\\d{2}-\\d{2}$/.test(bodyWeekStart)',
  '  ? bodyWeekStart',
  '  : parseWeekStart(weekDateRange);',
  '',
  ANCHOR,
].join('\n');

// --- reporting ------------------------------------------------------------

const REPORT_OLD = [
  'if (transformedItems.length === 0) {',
  '  return [{ json: { hasItems: false, droppedAsStaple } }];',
  '}',
  'transformedItems[0].json.droppedAsStaple = droppedAsStaple;',
].join('\n');

const REPORT_NEW = [
  'if (transformedItems.length === 0) {',
  '  return [{ json: { hasItems: false, droppedAsStaple, unmatchedIngredients } }];',
  '}',
  'transformedItems[0].json.droppedAsStaple = droppedAsStaple;',
  '// Surfaced so an ingredient name the catalogue does not know stops being',
  '// invisible — the old behaviour was to silently overwrite the previous one.',
  'transformedItems[0].json.unmatchedIngredients = unmatchedIngredients;',
].join('\n');

function replaceOnce(code, old, next, label) {
  const first = code.indexOf(old);
  if (first === -1) {
    throw new Error(`meal_ingredients_itemid_and_week: anchor not found — ${label}`);
  }
  if (code.indexOf(old, first + old.length) !== -1) {
    throw new Error(`meal_ingredients_itemid_and_week: anchor is not unique — ${label}`);
  }
  return code.slice(0, first) + next + code.slice(first + old.length);
}

export default function (wf) {
  const node = wf.nodes.find((n) => n.name === NODE);
  if (!node) throw new Error(`meal_ingredients_itemid_and_week: "${NODE}" not found`);

  let code = node.parameters.jsCode;
  if (typeof code !== 'string') {
    throw new Error(`meal_ingredients_itemid_and_week: "${NODE}" has no jsCode string`);
  }

  const hasF7 = code.includes('UNMATCHED_BAND_START');
  const hasF9 = code.includes('bodyWeekStart');

  if (hasF7 !== hasF9) {
    // The two ship together, so one without the other means a partially applied
    // or hand-edited node. Restore from .n8n-backups rather than patch blind.
    throw new Error(
      'meal_ingredients_itemid_and_week: node is half-patched ' +
        `(F7=${hasF7}, F9=${hasF9}) — restore from .n8n-backups/pre-save and re-apply`,
    );
  }

  if (!hasF7) {
    // F9's hoist consumes the shared anchor first, then F7's helpers are
    // inserted above the copy of the anchor it re-emitted. Order is cosmetic.
    code = replaceOnce(code, WEEKSTART_DECL_OLD, '', 'per-item weekStart declaration');
    code = replaceOnce(code, ANCHOR, WEEKSTART_HOIST, 'weekStart hoist point');
    code = replaceOnce(code, ANCHOR, HELPERS, 'unmatched-id helper insertion point');
    code = replaceOnce(code, ID_OLD, ID_NEW, 'stableId derivation');
    code = replaceOnce(code, REPORT_OLD, REPORT_NEW, 'response reporting');
    node.parameters.jsCode = code;
  }

  node.notes =
    'ItemID = ingredient_id + 1000 for a matched name. A name the ingredients catalogue does ' +
    'not know gets its own deterministic id in the 900000-999999 band instead of collapsing ' +
    'onto 1000 — uq_week_item (week_start_date, ItemID) allows one row per ItemID per week and ' +
    'the INSERT is ON DUPLICATE KEY UPDATE, so every unmatched name after the first used to ' +
    'silently overwrite its predecessor (F7; latent, 0 rows at ItemID 1000 across all history, ' +
    'protected only by get_recipe_items sourcing names from the same table). The band is free: ' +
    'WGL uses 14-344, 1001-1888 and 100000-100053, one-offs are identified by DataSource and ' +
    'not by range, and no active workflow keys off an ItemID range. Such rows resolve to no ' +
    'ingredient at ItemID - 1000, so they bucket under "Other meal ingredients" — safe only ' +
    'because the list screen no longer drops unattributed rows (TB-4). ' +
    'week_start_date comes from the ISO date the caller sends (as Lookup Existing Staples ' +
    'already does) rather than from a regex over the human-readable display string, which ' +
    'returned null on any copy change and is interpolated straight into the INSERT (F9).';

  return wf;
}
