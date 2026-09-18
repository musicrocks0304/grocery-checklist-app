// The Grocery List screen had no idea which meal an item came from. It guessed,
// client-side, by matching each row's ItemName against the ingredient names of
// the week's selected recipes — and any row whose name failed that match was
// DROPPED from the screen entirely. Optional ingredients were the common
// casualty: invisible on the list, still bought by the H-E-B cart.
//
// The database already knows the answer. WeeklyGroceryList meal rows carry
// ItemID = ingredient_id + 1000 (the same offset `Pull Grocery Staples` and the
// orphan-cleanup workflow already rely on), so the recipes that contributed an
// item are one join away. This returns that from the query instead of guessing:
//
//   RecipeNames — '||'-separated contributing recipe names, NULL for staples
//   IsOptional  — MIN(optional) across contributing recipes, so an item is only
//                 optional when EVERY recipe that wants it says it is optional
//
// Both fields are purely additive: no existing column, filter, GROUP BY or
// ordering changes, so a client that does not know about them sees no difference.
//
// WHY THE JOIN GOES INSIDE `CW` (branch 1) RATHER THAN ON THE OUTER ROW:
// branch 1 exists for meal ingredients whose names collide with the GroceryItems
// catalogue (Avocado, Carrots, Honey, Kale, Olive oil, Oregano). Those rows
// surface carrying GI.ItemID (Carrots = 22), NOT the WeeklyGroceryList ItemID
// (1084) that encodes the ingredient. Deriving inside `CW`, where the real WGL
// row is still in scope, is the only place both branches can key off the WGL
// row's OWN ItemID.
//
// WHY THIS CANNOT MULTIPLY ROWS (and so cannot corrupt `CW`'s existing
// SUM(CASE WHEN DataSource = 'Staples' ...) or any MAX()): ATTR is GROUPed BY
// ItemID and filtered to one week, and uq_week_item (week_start_date, ItemID)
// guarantees at most one WGL row per ItemID per week, so the LEFT JOIN is 1:1.
// Verified empirically: row counts are identical before and after, per week.
//
// Idempotent: re-applying is a no-op.

const NODE = 'Pull Current Week Grocery List';

// The week literal is lifted verbatim out of the existing query rather than
// retyped, so the two new subqueries can never drift from the filter the node
// already uses (it is an n8n expression with embedded quotes and a regex).
const WEEK_RE = /WeekDateRange = ('\{\{[^{}]*\}\}')/;

const attr = (week) =>
  'SELECT w2.ItemID AS attr_item_id, ' +
  "GROUP_CONCAT(DISTINCT r.recipe_name ORDER BY r.recipe_name SEPARATOR '||') AS RecipeNames, " +
  'MIN(ri.optional) AS IsOptional ' +
  'FROM WeeklyGroceryList w2 ' +
  'JOIN weekly_selections ws ON ws.WeekDateRange = w2.WeekDateRange ' +
  'JOIN recipe_ingredients ri ON ri.recipe_id = ws.recipe_id AND ri.ingredient_id = w2.ItemID - 1000 ' +
  'JOIN recipes r ON r.recipe_id = ws.recipe_id ' +
  `WHERE w2.WeekDateRange = ${week} AND w2.DataSource = 'MealIngredients' ` +
  'GROUP BY w2.ItemID';

// --- anchor 1: the outer wrapper's column list ----------------------------
const OUTER_OLD =
  'SELECT ItemID, ItemName, Category, Store, GroceryStoreSection, Type, IsActive, ' +
  'DataSource, QuantitySelected, IsSelected, Unit, store_location FROM (';
const OUTER_NEW =
  'SELECT ItemID, ItemName, Category, Store, GroceryStoreSection, Type, IsActive, ' +
  'DataSource, QuantitySelected, IsSelected, Unit, store_location, RecipeNames, IsOptional FROM (';

// --- anchor 2: branch 1's CW subquery (SELECT list + FROM) ----------------
const CW_OLD = 'MIN(is_skipped) AS is_skipped FROM WeeklyGroceryList WHERE WeekDateRange = ';
const cwNew = (week) =>
  'MIN(is_skipped) AS is_skipped, MAX(ATTR.RecipeNames) AS RecipeNames, MIN(ATTR.IsOptional) AS IsOptional ' +
  'FROM WeeklyGroceryList ' +
  `LEFT JOIN ( ${attr(week)} ) AS ATTR ON ATTR.attr_item_id = WeeklyGroceryList.ItemID ` +
  'WHERE WeekDateRange = ';

// --- anchor 3: branch 1's outer column list -------------------------------
const B1_OLD = 'CW.Unit, GI.store_location FROM GroceryItems AS GI';
const B1_NEW =
  'CW.Unit, GI.store_location, CW.RecipeNames, COALESCE(CW.IsOptional, 0) AS IsOptional ' +
  'FROM GroceryItems AS GI';

// --- anchor 4: branch 2 (WGL-only side) -----------------------------------
const B2_OLD =
  'MAX(ing.store_location) AS store_location FROM WeeklyGroceryList AS WGL ' +
  'LEFT JOIN categories c2 ON c2.id = WGL.category_id ' +
  'LEFT JOIN ingredients ing ON ing.ingredient_id = WGL.ItemID - 1000 WHERE';
const b2New = (week) =>
  'MAX(ing.store_location) AS store_location, MAX(ATTR2.RecipeNames) AS RecipeNames, ' +
  'COALESCE(MIN(ATTR2.IsOptional), 0) AS IsOptional ' +
  'FROM WeeklyGroceryList AS WGL ' +
  'LEFT JOIN categories c2 ON c2.id = WGL.category_id ' +
  'LEFT JOIN ingredients ing ON ing.ingredient_id = WGL.ItemID - 1000 ' +
  `LEFT JOIN ( ${attr(week)} ) AS ATTR2 ON ATTR2.attr_item_id = WGL.ItemID WHERE`;

function replaceOnce(query, old, next, label) {
  const first = query.indexOf(old);
  if (first === -1) throw new Error(`grocery_list_provenance: anchor not found — ${label}`);
  if (query.indexOf(old, first + old.length) !== -1) {
    throw new Error(`grocery_list_provenance: anchor is not unique — ${label}`);
  }
  return query.slice(0, first) + next + query.slice(first + old.length);
}

export default function (wf) {
  const node = wf.nodes.find((n) => n.name === NODE);
  if (!node) throw new Error(`grocery_list_provenance: "${NODE}" not found`);

  let query = node.parameters.query;
  if (typeof query !== 'string') throw new Error('grocery_list_provenance: node has no query string');
  if (query.includes('RecipeNames')) return wf; // already applied

  const week = (query.match(WEEK_RE) || [])[1];
  if (!week) throw new Error('grocery_list_provenance: week expression not found in query');

  query = replaceOnce(query, OUTER_OLD, OUTER_NEW, 'outer column list');
  query = replaceOnce(query, CW_OLD, cwNew(week), 'CW subquery (branch 1)');
  query = replaceOnce(query, B1_OLD, B1_NEW, 'branch 1 column list');
  query = replaceOnce(query, B2_OLD, b2New(week), 'branch 2 FROM/column list');

  node.parameters.query = query;
  node.notes =
    'RecipeNames/IsOptional are derived here, not guessed client-side: the screen used to ' +
    'match ItemName against recipe ingredient names and silently drop every row that failed ' +
    '(optional ingredients vanished while the H-E-B cart still bought them). Both branches ' +
    'key off the WeeklyGroceryList row\'s OWN ItemID (ItemID - 1000 = ingredient_id) — in ' +
    'branch 1 that means joining inside CW, because rows whose name collides with ' +
    'GroceryItems surface with GI.ItemID (Carrots = 22), not the meal ItemID (1084). ' +
    'IsOptional = MIN(optional), so an item is optional only if every contributing recipe ' +
    'says so. uq_week_item makes the ATTR join 1:1 — it multiplies no rows.';

  return wf;
}
