// F4 — the review screen offers a ×1…×10 quantity selector per ingredient, and
// `RecipeIngredients.js:68-72` has always sent it in the payload as
// `quantity`. `Transform for DB Input` never read it. It derived the stored
// quantity solely from `QuantitySelected`, so setting a tortilla pack to ×3
// changed precisely nothing in the database — a visible control with no effect.
//
// Corey's decision (2026-09-18): make it live rather than remove the control.
//
// WHY THIS IS SAFE TO MAKE LIVE ONLY NOW: until F3b shipped, both toggle paths
// in `RecipeIngredients.js` re-seeded the multiplier from `QuantitySelected`,
// so an ordinary deselect + re-select silently set it to 4 while displaying
// "= 4 × 4 items". Reading `item.quantity` then would have turned a display bug
// into a real 4× over-purchase. F3b seeds 1 in every path, so the value the
// payload carries is now the value the shopper actually chose.
//
// The multiplier is clamped to the 1-10 the control offers and rounded to an
// integer. That is not defensive theatre: `quantity` arrives from the browser
// and is multiplied into `Quantity`, which the H-E-B Cart Builder spends. A
// missing, non-numeric or out-of-range value falls back to ×1 — the previous
// behaviour — so an old cached bundle that omits the field is unaffected.
//
// Note it multiplies the ALREADY-CEILED base: `QuantitySelected` "1.5 lb
// package" ceils to 2 and ×3 gives 6, not ceil(4.5) = 5. Ceiling first is
// correct here because the base is a count of PURCHASE units (packages, heads,
// items) — you cannot buy 1.5 packages, so three of them is three whole ones.
//
// Idempotent: re-applying is a no-op.

const NODE = 'Transform for DB Input';

const OLD = [
  '    const qs = String(item.QuantitySelected || \'1\');',
  '    const qtyMatch = qs.match(/^([\\d.]+)/);',
  '    const quantity = qtyMatch ? Math.ceil(parseFloat(qtyMatch[1])) : 1;',
].join('\n');

const NEW = [
  '    const qs = String(item.QuantitySelected || \'1\');',
  '    const qtyMatch = qs.match(/^([\\d.]+)/);',
  '    const baseQuantity = qtyMatch ? Math.ceil(parseFloat(qtyMatch[1])) : 1;',
  "    // The review screen's x1-x10 selector. It was always in the payload as",
  '    // `quantity` and was never read here, so the control did nothing (F4).',
  '    // Clamped to the range the control offers and rounded, because this value',
  '    // comes from the browser and is multiplied into a quantity the H-E-B Cart',
  '    // Builder spends; anything missing or malformed falls back to x1, which is',
  '    // exactly the old behaviour.',
  '    const rawMultiplier = Number(item.quantity);',
  '    const multiplier = Number.isFinite(rawMultiplier)',
  '      ? Math.min(10, Math.max(1, Math.round(rawMultiplier)))',
  '      : 1;',
  '    // Multiplies the already-ceiled base on purpose: the base counts PURCHASE',
  '    // units (packages, heads, items), so three of a 1.5-package need is three',
  '    // whole packages, not ceil(4.5).',
  '    //',
  '    // Floored at 1 because a row that exists on the list is a row being',
  '    // bought: an ingredient a recipe specifies no amount for ("to taste")',
  '    // reaches here as QuantitySelected "0 ..." and stored Quantity 0, which',
  '    // is a line the shopper sees and the cart cannot spend. The aggregator',
  '    // now reports those as "as needed" instead, and this is the backstop.',
  '    const quantity = Math.max(1, baseQuantity * multiplier);',
].join('\n');

export default function (wf) {
  const node = wf.nodes.find((n) => n.name === NODE);
  if (!node) throw new Error(`meal_ingredients_multiplier: "${NODE}" not found`);

  const code = node.parameters.jsCode;
  if (typeof code !== 'string') {
    throw new Error(`meal_ingredients_multiplier: "${NODE}" has no jsCode string`);
  }

  if (!code.includes('rawMultiplier')) {
    const first = code.indexOf(OLD);
    if (first === -1) {
      throw new Error(
        'meal_ingredients_multiplier: quantity derivation not found in its expected form — ' +
          'reconcile the node against .n8n-backups/pre-save before re-applying',
      );
    }
    if (code.indexOf(OLD, first + OLD.length) !== -1) {
      throw new Error('meal_ingredients_multiplier: quantity derivation is not unique');
    }
    node.parameters.jsCode = code.slice(0, first) + NEW + code.slice(first + OLD.length);
  }

  // Appended rather than replaced: this node already carries the F7/F9 note and
  // both explanations need to survive.
  const note =
    'Quantity = the ceiled leading number of QuantitySelected multiplied by the review screen\'s ' +
    'x1-x10 selector, which is sent as `quantity` and was ignored here entirely until 2026-09-18 ' +
    '(F4 — a visible control with no effect). Safe to honour only because F3b stopped the toggle ' +
    'paths re-seeding that selector from QuantitySelected; before that, reading it would have ' +
    'turned a display bug into a real 4x over-purchase. Clamped to 1-10 and rounded because the ' +
    'value comes from the browser and is spent by the H-E-B Cart Builder.';
  node.notes = node.notes && !node.notes.includes('x1-x10 selector')
    ? `${node.notes}\n\n${note}`
    : node.notes || note;

  return wf;
}
