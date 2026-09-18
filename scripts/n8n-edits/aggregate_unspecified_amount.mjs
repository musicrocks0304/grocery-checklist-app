// TB-3b — found while shipping TB-3, and a prerequisite for it.
//
// 95 of 898 `recipe_ingredients` rows across 37 recipes have a NULL quantity:
// 88 carry the unit "to taste", 2 "pinch", 5 no unit at all. The recipe is not
// missing data — it genuinely does not specify an amount. `Aggregate
// Ingredients` read them as `parseFloat(null) || 0`, so:
//
//   salt, quantity NULL, unit "to taste"
//     -> quantities['to taste'] = { total: 0, baseUnit: 'to taste' }
//     -> formatQuantity(0, 'to taste', 'to taste')  ===  "0 to taste"
//     -> toPurchaseQuantity("0 to taste", ...)      ===  purchaseQuantity "0 to taste"
//     -> QuantitySelected "0 to taste" -> Math.ceil(0) -> WeeklyGroceryList.Quantity = 0
//
// "Salt — Buy: 0 to taste as needed", and a row the H-E-B Cart Builder cannot
// spend. It has never landed in the database (0 WeeklyGroceryList rows with
// Quantity = 0, across all history) for two reasons that both happen to hold:
// the pantry names that dominate the NULL rows (salt 30, black pepper 30, olive
// oil 12 — 72 of the 95) were removed by TB-3's hardcoded exclusion, and most of
// the remaining names (sour cream, shredded cheese, avocado, cilantro, green
// onions, onion, mayonnaise) exist as GroceryItems staples and get dropped by
// the week's staple filter instead.
//
// Dropping the exclusion (TB-3) removes the first of those two accidents, so
// this must be fixed in the same breath or TB-3 ships "0 to taste" onto the real
// list for 36 recipes — recipe 3, the one planned for the current week, has
// exactly three such rows.
//
// The fix is to stop pretending an unspecified amount is the number zero:
//
//  1. A row with no positive numeric quantity contributes NO bucket. A 0 must
//     not be summed into a real total, and must not create a "to taste" group
//     that then formats as "0 to taste".
//  2. An ingredient left with no numeric part at all reports "as needed".
//     That string carries no digits, so `toPurchaseQuantity`'s
//     /([\d.]+)\s*(.*)/ does not match, `val` defaults to 1, and it falls into
//     the countable branch — "buy 1 item", i.e. one container of salt. Which is
//     the right answer, and is what a shopper would write down.
//
// An ingredient with a real amount in one recipe and "to taste" in another keeps
// the real amount and loses nothing: "1 tsp" rather than "1 tsp + 0 to taste".
//
// Idempotent: re-applying is a no-op.

const NODE = 'Aggregate Ingredients';

// --- anchor 1: the quantity parse ----------------------------------------
const QTY_OLD = '  const qty = parseFloat(row.quantity) || 0;';
const QTY_NEW = [
  '  // A row with no numeric amount ("to taste", "pinch", or a NULL quantity —',
  '  // 95 of 898 rows across 37 recipes) does not specify how much. Treating it',
  '  // as the number 0 put "0 to taste" on the list and stored Quantity 0.',
  '  const parsedQty = parseFloat(row.quantity);',
  '  const hasQty = Number.isFinite(parsedQty) && parsedQty > 0;',
  '  const qty = hasQty ? parsedQty : 0;',
].join('\n');

// --- anchor 2: the bucket accumulation -----------------------------------
const BUCKET_OLD = [
  '  const unitInfo = getBaseUnit(unit);',
  '  const baseQty = qty * unitInfo.factor;',
  '  const groupKey = unitInfo.group;',
  '  if (!aggregated[name].quantities[groupKey]) {',
  '    aggregated[name].quantities[groupKey] = { total: 0, baseUnit: unitInfo.base, group: groupKey };',
  '  }',
  '  aggregated[name].quantities[groupKey].total += baseQty;',
].join('\n');

const BUCKET_NEW = [
  '  // No bucket for an unspecified amount: a 0 must not be summed into a real',
  '  // total, and must not create a "to taste" group that formats as "0 to taste".',
  '  if (hasQty) {',
  '    const unitInfo = getBaseUnit(unit);',
  '    const baseQty = qty * unitInfo.factor;',
  '    const groupKey = unitInfo.group;',
  '    if (!aggregated[name].quantities[groupKey]) {',
  '      aggregated[name].quantities[groupKey] = { total: 0, baseUnit: unitInfo.base, group: groupKey };',
  '    }',
  '    aggregated[name].quantities[groupKey].total += baseQty;',
  '  }',
].join('\n');

// --- anchor 3: the per-ingredient output ---------------------------------
const OUT_OLD = [
  '  aggregatedIngredients.push({',
  '    name: ing.name,',
].join('\n');

const OUT_NEW = [
  '  // Salt whose every row is "to taste" has no numeric part at all. "as needed"',
  '  // carries no digits, so toPurchaseQuantity falls through to its countable',
  '  // branch and asks for 1 item — one container — instead of 0 (TB-3b).',
  "  if (qtyParts.length === 0) qtyParts.push('as needed');",
  '  aggregatedIngredients.push({',
  '    name: ing.name,',
].join('\n');

function replaceOnce(code, old, next, label) {
  const first = code.indexOf(old);
  if (first === -1) {
    throw new Error(`aggregate_unspecified_amount: anchor not found — ${label}`);
  }
  if (code.indexOf(old, first + old.length) !== -1) {
    throw new Error(`aggregate_unspecified_amount: anchor is not unique — ${label}`);
  }
  return code.slice(0, first) + next + code.slice(first + old.length);
}

export default function (wf) {
  const node = wf.nodes.find((n) => n.name === NODE);
  if (!node) throw new Error(`aggregate_unspecified_amount: "${NODE}" not found`);

  let code = node.parameters.jsCode;
  if (typeof code !== 'string') {
    throw new Error(`aggregate_unspecified_amount: "${NODE}" has no jsCode string`);
  }

  const hasParse = code.includes('const hasQty');
  const hasFallback = code.includes("qtyParts.push('as needed')");
  if (hasParse !== hasFallback) {
    throw new Error(
      'aggregate_unspecified_amount: node is half-patched ' +
        `(parse=${hasParse}, fallback=${hasFallback}) — restore from .n8n-backups/pre-save`,
    );
  }

  if (!hasParse) {
    code = replaceOnce(code, QTY_OLD, QTY_NEW, 'quantity parse');
    code = replaceOnce(code, BUCKET_OLD, BUCKET_NEW, 'bucket accumulation');
    code = replaceOnce(code, OUT_OLD, OUT_NEW, 'per-ingredient output');
    node.parameters.jsCode = code;
  }

  const note =
    'A recipe row with no numeric quantity ("to taste", "pinch", NULL — 95 of 898 rows across 37 ' +
    'recipes) is an UNSPECIFIED amount, not the number zero. It contributes no bucket, and an ' +
    'ingredient left with no numeric part reports "as needed", which carries no digits so ' +
    'toPurchaseQuantity asks for 1 item (one container) rather than 0. Before this, salt came out ' +
    'as "0 to taste" and stored WeeklyGroceryList.Quantity = 0 — a line the shopper sees and the ' +
    'cart cannot spend (TB-3b). It had never landed only because TB-3\'s hardcoded exclusion hid ' +
    'salt/black pepper/olive oil (72 of the 95) and the week staple filter hid most of the rest; ' +
    'dropping that exclusion removes the first accident, so the two changes ship together.';
  node.notes = node.notes && node.notes.includes('UNSPECIFIED amount') ? node.notes : note;

  return wf;
}
