// Two defects that made the meal-planning grocery list quietly wrong.
//
// 1. Ingredients were SILENTLY DELETED. `Lookup Existing Staples` selected every
//    active GroceryItems row, and `Transform for DB Input` dropped any recipe
//    ingredient whose name matched one — regardless of whether that staple was
//    actually checked for the week. Reproduced 2026-09-17: 23 ingredients
//    selected, 21 stored; `carrots` and `avocado` vanished from "Roasted Carrot
//    & Avocado Salad", and the UI then rendered "21/21" so nothing looked wrong.
//    Scope the lookup to staples on THIS week's list and not skipped.
//
//    The UNION ALL sentinel matters: a week with zero checked staples would
//    otherwise return 0 rows, and a 0-row MySQL node stops the flow
//    (alwaysOutputData is unreliable on mySql typeVersion 2.4). The sentinel
//    can never equal a real ingredient name.
//
// 2. Quantities could never DECREASE. The conflict clause used
//    `Quantity = GREATEST(Quantity, VALUES(Quantity))` while
//    `Unit = COALESCE(VALUES(Unit), Unit)`. Remove a meal and the app correctly
//    displayed "needs 10 oz, buy 1 lb" while the row stayed at 2; worse, the two
//    rules disagreed, so a row could hold run A's quantity beside run B's unit
//    (observed: Lime = 2 "item"). get_recipe_items recomputes across ALL
//    selected meals, so every submit is an authoritative full recompute —
//    replace is the correct semantics, not a ratchet.
//
// Idempotent: re-applying is a no-op.

const GUARDED_DATE =
  "{{ /^\\d{4}-\\d{2}-\\d{2}$/.test($json.body.weekStartDate) ? $json.body.weekStartDate : '1900-01-01' }}";

const STAPLES_QUERY = [
  'SELECT w.ItemName',
  'FROM WeeklyGroceryList w',
  `WHERE w.week_start_date = '${GUARDED_DATE}'`,
  "  AND w.DataSource = 'Staples'",
  '  AND w.is_skipped = 0',
  'UNION ALL',
  "SELECT '__no_staples_sentinel__'",
].join('\n');

const OLD_FILTER = [
  'const transformedItems = ingredients',
  '  .filter((item) => item.IsSelected === 1)',
  '  .filter((item) => {',
  "    const itemName = (item.ItemName || '').trim().toLowerCase();",
  '    return !stapleNames[itemName];',
  '  })',
].join('\n');

const NEW_FILTER = [
  'const droppedAsStaple = [];',
  'const transformedItems = ingredients',
  '  .filter((item) => item.IsSelected === 1)',
  '  .filter((item) => {',
  "    const itemName = (item.ItemName || '').trim().toLowerCase();",
  '    if (stapleNames[itemName]) { droppedAsStaple.push(item.ItemName); return false; }',
  '    return true;',
  '  })',
].join('\n');

const OLD_TAIL = [
  'if (transformedItems.length === 0) {',
  '  return [{ json: { hasItems: false } }];',
  '}',
  'return transformedItems;',
].join('\n');

const NEW_TAIL = [
  'if (transformedItems.length === 0) {',
  '  return [{ json: { hasItems: false, droppedAsStaple } }];',
  '}',
  'transformedItems[0].json.droppedAsStaple = droppedAsStaple;',
  'return transformedItems;',
].join('\n');

const OLD_CONFLICT =
  'ON DUPLICATE KEY UPDATE ItemName = VALUES(ItemName), category_id = VALUES(category_id), ' +
  'Quantity = GREATEST(Quantity, VALUES(Quantity)), Unit = COALESCE(VALUES(Unit), Unit)';

const NEW_CONFLICT =
  'ON DUPLICATE KEY UPDATE ItemName = VALUES(ItemName), category_id = VALUES(category_id), ' +
  'Quantity = VALUES(Quantity), Unit = VALUES(Unit)';

export default function (wf) {
  // --- 1a. Scope the staples lookup to this week -------------------------
  const staples = wf.nodes.find((n) => n.name === 'Lookup Existing Staples');
  if (!staples) throw new Error('meal_ingredients: "Lookup Existing Staples" not found');
  staples.parameters.query = STAPLES_QUERY;

  // --- 1b. Make the drop visible instead of silent -----------------------
  const transform = wf.nodes.find((n) => n.name === 'Transform for DB Input');
  if (!transform) throw new Error('meal_ingredients: "Transform for DB Input" not found');

  let code = transform.parameters.jsCode;
  if (code.includes(OLD_FILTER)) code = code.replace(OLD_FILTER, NEW_FILTER);
  else if (!code.includes(NEW_FILTER)) throw new Error('meal_ingredients: filter block not recognised');

  if (code.includes(OLD_TAIL)) code = code.replace(OLD_TAIL, NEW_TAIL);
  else if (!code.includes(NEW_TAIL)) throw new Error('meal_ingredients: tail block not recognised');

  transform.parameters.jsCode = code;

  // --- 2. Replace the quantity ratchet with a full recompute -------------
  const insert = wf.nodes.find((n) => n.name === 'Insert Meal Ingredients');
  if (!insert) throw new Error('meal_ingredients: "Insert Meal Ingredients" not found');

  if (insert.parameters.query.includes(OLD_CONFLICT)) {
    insert.parameters.query = insert.parameters.query.replace(OLD_CONFLICT, NEW_CONFLICT);
  } else if (!insert.parameters.query.includes(NEW_CONFLICT)) {
    throw new Error('meal_ingredients: conflict clause not recognised');
  }

  insert.notes =
    'get_recipe_items recomputes across ALL selected meals, so every submit is an ' +
    'authoritative full recompute — replace, do not ratchet. GREATEST made quantities ' +
    'one-way (removing a meal left them inflated) and pairing it with COALESCE on Unit ' +
    'let one row hold run A quantity + run B unit.';

  return wf;
}
