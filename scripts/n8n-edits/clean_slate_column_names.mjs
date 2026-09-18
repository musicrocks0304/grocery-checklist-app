// `Pull Grocery Staples` (JoaR6klT950hwSLB) — make the clean-slate branch agree
// with its sibling on column names.
//
// `fetch_grocery_items` has two branches. `Pull Current Week Grocery List` (taken
// when the week already has rows) returns:
//
//   ItemID, ItemName, Category, Store, GroceryStoreSection, Type, IsActive,
//   DataSource, QuantitySelected, IsSelected, Unit, store_location,
//   RecipeNames, IsOptional
//
// `Pull Clean Slate Grocery List` (taken on a fresh week) returned `Isactive`
// (lowercase a) and `1 AS Quantity` instead of `QuantitySelected`. MySQL column
// names are case-insensitive, so `SELECT Isactive` succeeds and simply LABELS the
// JSON key `Isactive` — the disagreement is invisible until a client reads it.
//
// `summarizePurchase` absorbs it today (src/utils/formatPurchase.js reads
// QuantitySelected and falls back to Quantity precisely because these two
// branches disagree — see the F6/F8 spec), so there is no user-visible bug to
// fix. This is removing the trap, at the source, so the next person to write a
// consumer of this endpoint does not have to know about it.
//
// VERIFIED SAFE, not assumed: every `item.Quantity` reader in src/ either
// defaults it (`item.Quantity || 1` in HebCart.js:236,320,505,514 and
// useCartBuild.js:21) or compares it (`item.Quantity > 1` in
// cart/MatchCard.js:31). The clean-slate branch returns the literal 1, so after
// the rename those readers see undefined, fall back to 1, and land on the same
// value they had before. Nothing in src/ reads `IsActive`/`Isactive` from this
// response at all. The e2e fixture already models the sibling's shape, so it
// becomes MORE representative, not less.
//
// DELIBERATELY NOT DONE: the clean-slate branch also lacks `DataSource` and
// `IsSelected` entirely, which the sibling returns. That is a real gap but it is
// entangled with audit 2.4 (a one-row week misclassified as a clean slate), so
// it belongs to that fix, not to a rename.
//
// An n8n query field is compiled as a JS template literal — no backticks, no
// comments in it. Reasoning goes in node.notes.
//
// Idempotent: re-applying is a no-op.

const NODE = 'Pull Clean Slate Grocery List';
const BT = String.fromCharCode(96);

const RENAMES = [
  // [old, new, label]
  ['  Isactive,', '  IsActive,', 'IsActive casing'],
  ['  1 AS Quantity,', '  1 AS QuantitySelected,', 'QuantitySelected alias'],
];

export default function (wf) {
  const node = wf.nodes.find((n) => n.name === NODE);
  if (!node) throw new Error(`clean_slate_column_names: "${NODE}" not found`);

  let query = node.parameters && node.parameters.query;
  if (typeof query !== 'string') {
    throw new Error(`clean_slate_column_names: "${NODE}" has no query string`);
  }

  const done = RENAMES.map(([, next]) => query.includes(next));
  if (done.some(Boolean) && !done.every(Boolean)) {
    throw new Error(
      `clean_slate_column_names: half-patched (${RENAMES.map(([, n], i) => n.trim() + '=' + done[i]).join(', ')})` +
        ' — restore from the backup rather than re-running',
    );
  }

  if (!done.every(Boolean)) {
    for (const [old, next, label] of RENAMES) {
      const first = query.indexOf(old);
      if (first === -1) throw new Error(`clean_slate_column_names: anchor not found — ${label}`);
      if (query.indexOf(old, first + old.length) !== -1) {
        throw new Error(`clean_slate_column_names: anchor is not unique — ${label}`);
      }
      query = query.slice(0, first) + next + query.slice(first + old.length);
    }
    if (query.includes(BT)) {
      throw new Error('clean_slate_column_names: refusing to save a query containing a backtick');
    }
    node.parameters.query = query;
  }

  const note =
    'The clean-slate branch (fresh week, no WeeklyGroceryList rows yet) must return the SAME column ' +
    'names as its sibling `Pull Current Week Grocery List`, or a client has to know which branch it ' +
    'got. It used to return Isactive (lowercase a) and "1 AS Quantity" instead of QuantitySelected. ' +
    'MySQL column names are case-insensitive so the wrong casing never errored — it just mislabelled ' +
    'the JSON key. summarizePurchase still reads QuantitySelected OR Quantity because of this ' +
    'history. Note this branch STILL omits DataSource and IsSelected, which the sibling returns; ' +
    'that gap belongs to audit 2.4 (a one-row week misread as a clean slate), not here.';
  node.notes = node.notes && node.notes.includes('SAME column names') ? node.notes : note;

  return wf;
}
