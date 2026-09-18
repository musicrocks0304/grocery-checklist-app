// TB-3 — `Ingredient Agent` (webhook path `get_recipe_items`), node
// `Fetch Recipe Ingredients`, silently removed ingredients by hardcoded name:
//
//   And i.ingredient_name NOT IN ('salt', 'pepper', 'water', 'black pepper', 'olive oil')
//
// The intent was sound — you always have salt and oil — but the execution had
// three problems:
//
//  1. **It was inconsistent by name.** `salt` (38 recipes) was excluded while
//     `kosher salt` (11) was not, so whether you were told to buy pantry salt
//     depended purely on which string the recipe happened to use. One invented
//     recipe's kosher salt reached the shopping list while its black pepper
//     vanished from the same list.
//  2. **It was silent.** The item count renormalises to the survivors, exactly
//     like F1 — 16 ingredients went in, 14 came out, and the screen said
//     "22 ingredients from 2 meals" with no hint that two had been removed.
//  3. **It was in SQL**, so the household's pantry could only be changed by
//     editing a workflow.
//
// Corey's decision (2026-09-18): drop the exclusion and let the staples system
// do this job — that is what it is for. A staple the shopper has checked for the
// week is already suppressed from meal ingredients by `Lookup Existing Staples`
// in `Create Grocery List - Meals`, visibly and per-week, which is strictly
// better than an invisible permanent list.
//
// That only works for names that EXIST as a GroceryItems staple row, and of the
// five only `Olive oil` did (ItemID 79, Type=Periodic). So this change ships
// with three seeded staple rows — `Salt`, `Black pepper`, `Kosher salt` — see
// the commit for the INSERT. `pepper` on its own is not used by any recipe in
// the catalogue, so it needs no row.
//
// `water` KEEPS its exclusion. Tap water is a recipe instruction, not a
// grocery: there is no version of the staples flow where putting `Water` on an
// H-E-B list is the right answer, and making the shopper uncheck it every week
// would be worse than the bug. It stays as a one-name list with the reason
// written next to it, rather than an unexplained five.
//
// Idempotent: re-applying is a no-op.

const NODE = 'Fetch Recipe Ingredients';

const OLD =
  "And i.ingredient_name NOT IN ('salt', 'pepper', 'water', 'black pepper', 'olive oil')";

// NO SQL COMMENT HERE, DELIBERATELY. An n8n node query field is an EXPRESSION
// TEMPLATE, not a plain string: n8n compiles it as a JS template literal in
// order to resolve the `{{ ... }}` this query already contains. A first attempt
// at this edit explained the surviving name in a `-- ...` SQL comment, and that
// comment contained backticks around the node and ingredient names. Backticks
// are the template-literal delimiter, so n8n mangled the SQL — and the failure
// mode is SILENT: `Fetch Recipe Ingredients` returned `{ success: true }` with no
// result set, the workflow reported success, and the webhook answered 200 with
// "0 ingredients" instead of erroring to Respond 500. The same query run
// verbatim against MySQL returned all 11 rows, which is what proved the fault
// was n8n's parsing and not the SQL.
//
// The reasoning lives in `node.notes` below instead, which n8n shows in the
// editor and which no parser touches. Never put backticks — and preferably no
// comment at all — in an n8n query field.
const NEW = "And i.ingredient_name NOT IN ('water')";

export default function (wf) {
  const node = wf.nodes.find((n) => n.name === NODE);
  if (!node) throw new Error(`recipe_ingredients_pantry_exclusion: "${NODE}" not found`);

  let query = node.parameters.query;
  if (typeof query !== 'string') {
    throw new Error(`recipe_ingredients_pantry_exclusion: "${NODE}" has no query string`);
  }

  // Repair path for the first attempt at this edit, which left a `-- ...` SQL
  // comment in the query. Backticks inside it are template-literal delimiters to
  // n8n's expression engine, so the resolved SQL was mangled and the node
  // returned no result set without erroring. Strip the comment wherever it is
  // still present, rather than reporting the node as already-correct.
  const COMMENT_RE = /\n?-- Pantry items are suppressed[\s\S]*?belongs on an H-E-B list\.\n?/;
  if (COMMENT_RE.test(query)) {
    node.parameters.query = query.replace(COMMENT_RE, '\n');
    query = node.parameters.query;
    if (/^\s*--/m.test(query)) {
      throw new Error(
        'recipe_ingredients_pantry_exclusion: a SQL comment survived the strip — an n8n query ' +
          'field is an expression template and comments there are unsafe; reconcile by hand',
      );
    }
  }

  if (query.includes("NOT IN ('water')")) {
    // Already applied.
    if (query.includes("'black pepper'")) {
      throw new Error(
        'recipe_ingredients_pantry_exclusion: query carries BOTH the new one-name list and the ' +
          'old names — restore from .n8n-backups/pre-save and re-apply',
      );
    }
  } else {
    const first = query.indexOf(OLD);
    if (first === -1) {
      throw new Error(
        'recipe_ingredients_pantry_exclusion: exclusion list not found in its expected form — ' +
          'the query has been hand-edited; reconcile it before re-applying',
      );
    }
    if (query.indexOf(OLD, first + OLD.length) !== -1) {
      throw new Error('recipe_ingredients_pantry_exclusion: exclusion list is not unique');
    }
    node.parameters.query = query.slice(0, first) + NEW + query.slice(first + OLD.length);
  }

  node.notes =
    'Only `water` is excluded by name, and only because tap water is a recipe instruction rather ' +
    'than a grocery. The other four names (salt, pepper, black pepper, olive oil) used to be ' +
    'removed here permanently and silently, and inconsistently — `salt` was on the list and ' +
    '`kosher salt` was not, so whether you were told to buy pantry salt depended on which string ' +
    'the recipe used, and the item count renormalised so nothing looked wrong (TB-3). Pantry ' +
    'suppression is the staples system\'s job: Salt, Black pepper, Kosher salt and Olive oil all ' +
    'exist as GroceryItems staple rows, and `Lookup Existing Staples` in ' +
    '`Create Grocery List - Meals` drops a meal ingredient whose name matches a staple the ' +
    'shopper checked THIS WEEK — visible, per-week and reversible, which a hardcoded list is not.';

  return wf;
}
