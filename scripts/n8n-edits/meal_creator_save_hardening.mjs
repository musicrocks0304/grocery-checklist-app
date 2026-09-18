// Hardening `AI Meal Creator - Save to DB` (n4lUGlBwxX34tpj7).
// Spec: docs/superpowers/specs/2026-09-18-meal-creator-save-hardening.md
//
// THE PREMISE THIS STARTED FROM WAS FALSE, which is why this script does not
// simply "add escaping". The session opened believing that `Process
// Ingredients, Instructions & Tags` — which concatenates five INSERTs by raw
// string interpolation and genuinely has no sqlEscape of its own — must break
// on an apostrophe in LLM-written instruction_text. It does not. Escaping
// already happens one node earlier: `Validate & Parse Recipe` defines esc()
// and applies it to EVERY string field before this node ever runs. A live
// reproduction (recipe 72, apostrophes in all six string fields) returned
// HTTP 200 and stored correct single apostrophes in all six tables.
//
// So adding a second sqlEscape on top of esc() would DOUBLE-ESCAPE and store
// `Corey''s` as literal text across six tables — turning a non-bug into data
// corruption. The fix is to move escaping to the point of use instead:
//
//   `Validate & Parse Recipe` emits CLEAN data.
//   Every node that builds SQL escapes its own values as it builds them.
//
// That is the pattern the rest of this codebase already settled on (the other
// active workflows escape inline at the SQL node; `Transform for DB Input` in
// `Create Grocery List - Meals` has a local sqlEscape), so this brings the
// outlier into line, and it fixes two defects at once:
//
//   D1 — the save response echoed the ESCAPED name. `Aggregate Results` reads
//        recipe_name out of the escaped Validate output, so the live response
//        carried "recipeName":"ZZTest Corey''s Apostrophe Probe". That string
//        is shown to the user in a toast (MealCreator.js:323), on the save
//        confirmation screen (:843) and as the meal name pushed into the
//        week's selected-meals panel (:373, :410). Clean data upstream fixes
//        all four sites with no frontend change.
//   D4 — the escaping invariant lived in a different node from the
//        concatenation, documented nowhere and enforced nowhere. Any field
//        added to this node in future was unprotected by default, and the
//        failure mode is a silent SQL break, not a test failure.
//
// D2 — `ingredient_order` and `step_number` were the only interpolated
//      numbers with no coercion (`x || (idx + 1)`), while quantity, optional
//      and time_minutes all had it. Reproduced live: ingredient_order
//      "NOT_A_NUMBER" -> HTTP 500. The LLM supplies these fields.
//
// D2b — found by adversarial review of the spec: fractionToDecimal has no
//       zero-denominator guard, so quantity "5/0" returns Infinity and "0/0"
//       returns NaN. Both interpolate as the literal text `Infinity` / `NaN`
//       into a bare numeric SQL slot — the same 500 as D2, same class, and
//       not covered by D2's fix. Guarded here because it is one line and
//       leaving a known crash in a node being hardened for exactly this would
//       be indefensible.
//
// Escaping correctness was verified against the live server, not assumed:
// `SELECT @@global.sql_mode` does NOT contain NO_BACKSLASH_ESCAPES, so `\\`
// is the correct escape for one literal backslash here.
//
// NOT DONE HERE: the orphaned-recipe cleanup (D3) touches the error path and
// the response contract, so it is a separate edit.
//
// Idempotent: re-applying is a no-op. Half-patched state throws rather than
// guessing.

// Built with fromCharCode because this file's own anchors must contain literal
// backslashes and a literal backtick (the `optional` column is backquoted in
// the SQL). Writing those inline is how anchors silently stop matching.
const BS = String.fromCharCode(92); // \
const BT = String.fromCharCode(96); // `

const VALIDATE = 'Validate & Parse Recipe';
const PROCESS = 'Process Ingredients, Instructions & Tags';
const INSERT_RECIPE = 'Insert Recipe';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function replaceOnce(code, old, next, label) {
  const first = code.indexOf(old);
  if (first === -1) {
    throw new Error(`meal_creator_save_hardening: anchor not found — ${label}`);
  }
  if (code.indexOf(old, first + old.length) !== -1) {
    throw new Error(`meal_creator_save_hardening: anchor is not unique — ${label}`);
  }
  return code.slice(0, first) + next + code.slice(first + old.length);
}

// ---------------------------------------------------------------------------
// Change 1 — `Validate & Parse Recipe`: stop escaping, and coerce the numbers
// ---------------------------------------------------------------------------

// The existing helper, exactly as it appears in the live node.
const ESC_OLD = [
  'function esc(str) {',
  "  if (!str) return '';",
  `  return String(str).replace(/'/g, "''").replace(/${BS}${BS}/g, '${BS}${BS}${BS}${BS}');`,
  '}',
].join('\n');

// Escaping moves to the nodes that build SQL. This one only normalises.
const ESC_NEW = [
  '// Escaping deliberately does NOT happen here any more. It now happens in the',
  '// nodes that actually build SQL (`Insert Recipe` and `Process Ingredients,',
  '// Instructions & Tags`), so that a value is escaped exactly once, by the code',
  '// that knows it is about to be interpolated. Escaping here meant the SAVE',
  '// RESPONSE carried the escaped form and the user saw "Corey\'\'s" in the',
  '// success toast, the confirmation screen and the week\'s meal panel (D1).',
  'function clean(str) {',
  "  if (!str) return '';",
  '  return String(str);',
  '}',
  '',
  '// The LLM supplies ingredient_order and step_number. They were the only',
  '// interpolated numbers with no coercion, so a non-numeric value reached the',
  '// SQL parser verbatim and 500ed the save (D2).',
  'function posInt(val, fallback) {',
  '  const n = parseInt(val, 10);',
  '  return Number.isFinite(n) && n > 0 ? n : fallback;',
  '}',
  '',
  '// recipe_instructions carries UNIQUE KEY unique_recipe_step (recipe_id,',
  '// step_number), so a duplicate step number is not a display glitch, it is a',
  '// failed INSERT and a 500. Two ways to collide: the LLM emits the same number',
  '// twice, or posInt\'s idx+1 fallback lands on a number a sibling already',
  '// claimed. Taking the next free integer removes the class instead of relying',
  '// on the error path. ingredient_order has no such constraint and needs none.',
  'const usedSteps = new Set();',
  'function uniqueStep(val, idx) {',
  '  let n = posInt(val, idx + 1);',
  '  while (usedSteps.has(n)) n++;',
  '  usedSteps.add(n);',
  '  return n;',
  '}',
].join('\n');

// D2b: "5/0" -> Infinity and "0/0" -> NaN both interpolate as literal text.
const FRACTION_OLD =
  '  if (fractionMatch) return parseInt(fractionMatch[1]) / parseInt(fractionMatch[2]);';
const FRACTION_NEW = [
  '  if (fractionMatch) {',
  '    // A zero denominator yields Infinity (or NaN for 0/0), and both reach the',
  '    // SQL as the literal text "Infinity"/"NaN" in a numeric slot.',
  '    const num = parseInt(fractionMatch[1]);',
  '    const den = parseInt(fractionMatch[2]);',
  '    const ratio = den === 0 ? 0 : num / den;',
  '    return Number.isFinite(ratio) ? ratio : 0;',
  '  }',
].join('\n');

const ORDER_OLD = '    ingredient_order: ing.ingredient_order || (idx + 1)';
const ORDER_NEW = '    ingredient_order: posInt(ing.ingredient_order, idx + 1)';

const STEP_OLD = '    step_number: inst.step_number || (idx + 1),';
const STEP_NEW = '    step_number: uniqueStep(inst.step_number, idx + 1),';

// ---------------------------------------------------------------------------
// Change 2 — `Process Ingredients`: escape at the point of use
// ---------------------------------------------------------------------------

const SQLESCAPE_ANCHOR = 'const insertResult = $input.item.json;';
const SQLESCAPE_NEW = [
  '// This node builds SQL by string concatenation, so it escapes its own values.',
  '// It used to rely on `Validate & Parse Recipe` having escaped them for it — an',
  '// invariant that lived in another node, was written down nowhere, and left any',
  '// newly added field unprotected by default (D4). Same escape as',
  '// `Transform for DB Input` in `Create Grocery List - Meals`. Verified against',
  '// the live server: @@global.sql_mode has no NO_BACKSLASH_ESCAPES, so doubling',
  '// the backslash is correct here.',
  'function sqlEscape(val) {',
  "  if (val === null || val === undefined) return '';",
  `  return String(val).replace(/${BS}${BS}/g, '${BS}${BS}${BS}${BS}').replace(/'/g, "''");`,
  '}',
  '',
  SQLESCAPE_ANCHOR,
].join('\n');

// Each statement below escapes inline at every SQL slot, and leaves the
// reporting metadata (`ingredient_name`, `tag_name`) referencing the RAW value.
// Adversarial review flagged the tempting shortcut of hoisting one escaped
// local per field and reusing it for both — that would quietly put the escaped
// form back into the metadata, which is the shape D1 was about.

const ING_MASTER_OLD =
  `  sqlStatements.push({ type: 'ingredient_master', sql: "INSERT IGNORE INTO ingredients (ingredient_name, ingredient_category) VALUES ('" + ing.ingredient_name + "', '" + ing.ingredient_category + "')", ingredient_name: ing.ingredient_name });`;
const ING_MASTER_NEW =
  `  sqlStatements.push({ type: 'ingredient_master', sql: "INSERT IGNORE INTO ingredients (ingredient_name, ingredient_category) VALUES ('" + sqlEscape(ing.ingredient_name) + "', '" + sqlEscape(ing.ingredient_category) + "')", ingredient_name: ing.ingredient_name });`;

// The WHERE clause matches the row the statement above just created, so both
// sides must go through the same escape or the SELECT finds nothing and the
// INSERT silently writes ZERO rows while the workflow reports success.
const ING_ROW_OLD =
  `  sqlStatements.push({ type: 'recipe_ingredient', sql: "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, preparation_notes, ${BT}optional${BT}, ingredient_order) SELECT " + recipeId + ", i.ingredient_id, " + ing.quantity + ", u.unit_id, '" + ing.preparation_notes + "', " + ing.optional + ", " + ing.ingredient_order + " FROM ingredients i LEFT JOIN units u ON (LOWER(u.unit_name) = '" + ing.unit_name + "' OR LOWER(u.unit_abbreviation) = '" + ing.unit_name + "') WHERE LOWER(i.ingredient_name) = '" + ing.ingredient_name + "' LIMIT 1", ingredient_name: ing.ingredient_name });`;
const ING_ROW_NEW =
  `  sqlStatements.push({ type: 'recipe_ingredient', sql: "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, preparation_notes, ${BT}optional${BT}, ingredient_order) SELECT " + recipeId + ", i.ingredient_id, " + ing.quantity + ", u.unit_id, '" + sqlEscape(ing.preparation_notes) + "', " + ing.optional + ", " + ing.ingredient_order + " FROM ingredients i LEFT JOIN units u ON (LOWER(u.unit_name) = '" + sqlEscape(ing.unit_name) + "' OR LOWER(u.unit_abbreviation) = '" + sqlEscape(ing.unit_name) + "') WHERE LOWER(i.ingredient_name) = '" + sqlEscape(ing.ingredient_name) + "' LIMIT 1", ingredient_name: ing.ingredient_name });`;

const INSTR_OLD =
  `  sqlStatements.push({ type: 'instruction', sql: "INSERT INTO recipe_instructions (recipe_id, step_number, instruction_text, time_minutes) VALUES (" + recipeId + ", " + inst.step_number + ", '" + inst.instruction_text + "', " + (inst.time_minutes || 'NULL') + ")", step_number: inst.step_number });`;
const INSTR_NEW =
  `  sqlStatements.push({ type: 'instruction', sql: "INSERT INTO recipe_instructions (recipe_id, step_number, instruction_text, time_minutes) VALUES (" + recipeId + ", " + inst.step_number + ", '" + sqlEscape(inst.instruction_text) + "', " + (inst.time_minutes || 'NULL') + ")", step_number: inst.step_number });`;

const TAG_MASTER_OLD =
  `  sqlStatements.push({ type: 'tag_master', sql: "INSERT IGNORE INTO tags (tag_name) VALUES ('" + tagName + "')", tag_name: tagName });`;
const TAG_MASTER_NEW =
  `  sqlStatements.push({ type: 'tag_master', sql: "INSERT IGNORE INTO tags (tag_name) VALUES ('" + sqlEscape(tagName) + "')", tag_name: tagName });`;

const TAG_ROW_OLD =
  `  sqlStatements.push({ type: 'recipe_tag', sql: "INSERT IGNORE INTO recipe_tags (recipe_id, tag_id) SELECT " + recipeId + ", tag_id FROM tags WHERE LOWER(tag_name) = '" + tagName + "' LIMIT 1", tag_name: tagName });`;
const TAG_ROW_NEW =
  `  sqlStatements.push({ type: 'recipe_tag', sql: "INSERT IGNORE INTO recipe_tags (recipe_id, tag_id) SELECT " + recipeId + ", tag_id FROM tags WHERE LOWER(tag_name) = '" + sqlEscape(tagName) + "' LIMIT 1", tag_name: tagName });`;

// ---------------------------------------------------------------------------
// Change 3 — `Insert Recipe`: escape inline, now that Validate does not
// ---------------------------------------------------------------------------
//
// An n8n query field is compiled as a JS TEMPLATE LITERAL to resolve the
// {{ }} it contains, so it must contain no backticks and no comments — a
// backtick in a SQL comment once mangled a query and failed SILENTLY with
// {success:true}, 0 rows, HTTP 200 and an execution logged as "success".
// Reasoning goes in node.notes.
//
// This exact expression shape is already running in production: `Grocery Prep
// Orchestrator` (SgEykcbXCexjTe6l, active), nodes `Update: Docker` and five
// siblings, use the identical
//   '{{ ... .replace(/\\/g, '\\\\').replace(/'/g, "''") }}'
// nesting inside a single-quoted SQL literal.

function escExpr(path) {
  return `{{ String(${path}).replace(/${BS}${BS}/g, '${BS}${BS}${BS}${BS}').replace(/'/g, "''") }}`;
}

const RECIPE_FIELDS = [
  ['recipe_name', '$json.recipe_name'],
  ['recipe_description', '$json.recipe_description'],
  ['notes', '$json.notes'],
];

// ---------------------------------------------------------------------------
// Change 4 — D3: a failed save must not leave an orphaned `recipes` row
// ---------------------------------------------------------------------------
//
// `Insert Recipe` commits before `Execute SQL Statements` runs and there is no
// transaction, so the D2 reproduction left recipe 73 behind with 0 ingredients,
// 0 instructions and 0 tags. The statements are fail-fast, so everything after
// the failing one never runs either.
//
// recipeId is NOT available on the error branch: live execution 27532 shows
// $json there is the n8n error object, with no recipeId anywhere, so
// {{ $json.recipeId }} resolves to undefined and would make THIS node throw.
// Every item `Process Ingredients` emits carries recipeId, and `Aggregate
// Results` already reads it exactly this way in production. `|| -1` matches no
// row, so a missing value can never widen the DELETE.
//
// The guard covers all FIVE tables that reference recipes.recipe_id ON DELETE
// CASCADE — recipe_ingredients, recipe_instructions, recipe_tags,
// weekly_selections and ratings (verified against
// information_schema.REFERENTIAL_CONSTRAINTS). It deletes ONLY a recipe with no
// children at all: a partially saved recipe is left in place and still reported
// as a failure, because silently deleting rows that did land is worse than
// leaving a visible mess. Verified syntactically against the live server with
// recipe_id = -1 (0 rows affected) — MySQL allows correlating to the delete
// target as long as no subquery reads it.
//
// No backticks and no SQL comments in this string: n8n compiles a query field as
// a JS template literal, and a backtick mangles it and fails SILENTLY.

const CLEANUP_NODE = 'Cleanup Failed Recipe';

const CLEANUP_ID =
  `{{ Number($('${PROCESS}').first().json.recipeId) || -1 }}`;

const CLEANUP_SQL = [
  'DELETE FROM recipes',
  `WHERE recipe_id = ${CLEANUP_ID}`,
  '  AND NOT EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id = recipes.recipe_id)',
  '  AND NOT EXISTS (SELECT 1 FROM recipe_instructions rin WHERE rin.recipe_id = recipes.recipe_id)',
  '  AND NOT EXISTS (SELECT 1 FROM recipe_tags rt WHERE rt.recipe_id = recipes.recipe_id)',
  '  AND NOT EXISTS (SELECT 1 FROM weekly_selections ws WHERE ws.recipe_id = recipes.recipe_id)',
  '  AND NOT EXISTS (SELECT 1 FROM ratings ra WHERE ra.recipe_id = recipes.recipe_id)',
].join('\n');

const CLEANUP_NOTE =
  'D3. `Insert Recipe` commits before the statements run and there is no transaction, so a ' +
  'failed save used to leave a recipes row with no ingredients, instructions or tags (observed: ' +
  'recipe 73). Deletes ONLY a childless recipe — a partially saved one is left alone and still ' +
  'reported as a failure, because deleting rows that DID land would be worse. The id comes from ' +
  '`Process Ingredients`, not from $json: on this error branch $json is the n8n error object and ' +
  'has no recipeId, so $json.recipeId would be undefined and this node would throw. Both outputs ' +
  'go to `Respond 500` so the caller always gets a CORS-bearing 500, matching ' +
  '`Remove Weekly Selection` -> `Cleanup Orphan Meal Ingredients`. A 0-row DELETE emits ' +
  '{success:true} and does not stop the flow (unlike a 0-row SELECT), so the common ' +
  'nothing-to-clean case is safe. NOT covered: the `DB ok?` false -> Respond 503 branch, ' +
  'deliberately — that state means the database cannot be trusted, which is the worst moment to ' +
  'fire another DELETE. Sweep those later from daily maintenance.';

function buildCleanupNode() {
  return {
    parameters: { operation: 'executeQuery', query: CLEANUP_SQL, options: {} },
    type: 'n8n-nodes-base.mySql',
    typeVersion: 2.4,
    position: [850, 700],
    id: 'cleanup-failed-recipe',
    name: CLEANUP_NODE,
    // Node level on purpose: inside parameters.options it does nothing, which is
    // a recurring bug class in this project.
    alwaysOutputData: true,
    onError: 'continueErrorOutput',
    credentials: { mySql: { id: 'lqIXlvVVqfE4v7DF', name: 'MySQL account' } },
    notes: CLEANUP_NOTE,
  };
}

// ---------------------------------------------------------------------------

export default function (wf) {
  const validate = wf.nodes.find((n) => n.name === VALIDATE);
  const process = wf.nodes.find((n) => n.name === PROCESS);
  const insertRecipe = wf.nodes.find((n) => n.name === INSERT_RECIPE);
  if (!validate) throw new Error(`meal_creator_save_hardening: "${VALIDATE}" not found`);
  if (!process) throw new Error(`meal_creator_save_hardening: "${PROCESS}" not found`);
  if (!insertRecipe) throw new Error(`meal_creator_save_hardening: "${INSERT_RECIPE}" not found`);

  let vCode = validate.parameters.jsCode;
  let pCode = process.parameters.jsCode;
  let query = insertRecipe.parameters.query;
  if (typeof vCode !== 'string') throw new Error(`meal_creator_save_hardening: "${VALIDATE}" has no jsCode`);
  if (typeof pCode !== 'string') throw new Error(`meal_creator_save_hardening: "${PROCESS}" has no jsCode`);
  if (typeof query !== 'string') throw new Error(`meal_creator_save_hardening: "${INSERT_RECIPE}" has no query`);

  // --- half-patch detection, across all three nodes -----------------------
  const vDone =
    vCode.includes('function clean(str)') &&
    vCode.includes('function posInt(') &&
    vCode.includes('function uniqueStep(');
  const pDone = pCode.includes('function sqlEscape(val)');
  const qDone = query.includes(`replace(/'/g, "''")`);
  const cDone = wf.nodes.some((n) => n.name === CLEANUP_NODE);
  const states = [vDone, pDone, qDone, cDone];
  if (states.some(Boolean) && !states.every(Boolean)) {
    throw new Error(
      'meal_creator_save_hardening: half-patched ' +
        `(validate=${vDone}, process=${pDone}, insertRecipe=${qDone}, cleanup=${cDone}) — ` +
        'restore from .n8n-backups/pre-save. Escaping must move in ONE step: with ' +
        'Validate patched but the SQL nodes not, apostrophes break; with the SQL ' +
        'nodes patched but Validate not, every value is DOUBLE-escaped.',
    );
  }

  if (!vDone) {
    // Change 1
    vCode = replaceOnce(vCode, ESC_OLD, ESC_NEW, 'esc -> clean + posInt');
    vCode = replaceOnce(vCode, FRACTION_OLD, FRACTION_NEW, 'fractionToDecimal zero denominator');
    vCode = replaceOnce(vCode, ORDER_OLD, ORDER_NEW, 'ingredient_order coercion');
    vCode = replaceOnce(vCode, STEP_OLD, STEP_NEW, 'step_number coercion');
    // Rename every call site. `esc(` occurs 10 times: the definition (already
    // rewritten above) plus 9 call sites.
    const callSites = vCode.split('esc(').length - 1;
    if (callSites !== 9) {
      throw new Error(
        `meal_creator_save_hardening: expected 9 esc( call sites after rewriting the helper, found ${callSites}`,
      );
    }
    vCode = vCode.split('esc(').join('clean(');
    validate.parameters.jsCode = vCode;

    // Change 2
    pCode = replaceOnce(pCode, SQLESCAPE_ANCHOR, SQLESCAPE_NEW, 'sqlEscape helper');
    pCode = replaceOnce(pCode, ING_MASTER_OLD, ING_MASTER_NEW, 'ingredient_master statement');
    pCode = replaceOnce(pCode, ING_ROW_OLD, ING_ROW_NEW, 'recipe_ingredient statement');
    pCode = replaceOnce(pCode, INSTR_OLD, INSTR_NEW, 'instruction statement');
    pCode = replaceOnce(pCode, TAG_MASTER_OLD, TAG_MASTER_NEW, 'tag_master statement');
    pCode = replaceOnce(pCode, TAG_ROW_OLD, TAG_ROW_NEW, 'recipe_tag statement');
    process.parameters.jsCode = pCode;

    // Change 3
    for (const [field, path] of RECIPE_FIELDS) {
      query = replaceOnce(query, `{{ ${path} }}`, escExpr(path), `Insert Recipe ${field}`);
    }
    if (query.includes(BT)) {
      throw new Error(
        'meal_creator_save_hardening: refusing to save a query containing a backtick — ' +
          'n8n compiles the query field as a template literal and would mangle it silently',
      );
    }
    insertRecipe.parameters.query = query;

    // Change 4 — insert the cleanup node on the Execute SQL Statements error
    // branch, between it and Respond 500.
    const RESPOND_500 = 'Respond 500';
    if (!wf.nodes.some((n) => n.name === RESPOND_500)) {
      throw new Error(`meal_creator_save_hardening: "${RESPOND_500}" not found`);
    }
    if (CLEANUP_SQL.includes(BT)) {
      throw new Error(
        'meal_creator_save_hardening: refusing to save a cleanup query containing a backtick',
      );
    }
    wf.nodes.push(buildCleanupNode());

    const execConn = wf.connections['Execute SQL Statements'];
    if (!execConn || !Array.isArray(execConn.main) || execConn.main.length < 2) {
      throw new Error(
        'meal_creator_save_hardening: "Execute SQL Statements" has no error output to rewire — ' +
          'expected main[1] to exist (onError: continueErrorOutput)',
      );
    }
    const errBranch = execConn.main[1] || [];
    const wentTo500 = errBranch.some((c) => c.node === RESPOND_500);
    if (!wentTo500) {
      throw new Error(
        'meal_creator_save_hardening: expected "Execute SQL Statements" main[1] -> ' +
          `"${RESPOND_500}", found ${JSON.stringify(errBranch.map((c) => c.node))} — ` +
          'the error path is not what this edit assumes',
      );
    }
    // The error branch now lands on cleanup first; cleanup answers on BOTH of its
    // own outputs so a failure to clean up still returns a proper 500.
    execConn.main[1] = [{ node: CLEANUP_NODE, type: 'main', index: 0 }];
    wf.connections[CLEANUP_NODE] = {
      main: [
        [{ node: RESPOND_500, type: 'main', index: 0 }],
        [{ node: RESPOND_500, type: 'main', index: 0 }],
      ],
    };
  }

  // --- notes --------------------------------------------------------------
  const vNote =
    'Emits CLEAN data. SQL escaping deliberately lives in the nodes that build SQL ' +
    '(`Insert Recipe`, `Process Ingredients, Instructions & Tags`) so a value is escaped ' +
    'exactly once, by the code that interpolates it. Escaping here also leaked into the ' +
    'save RESPONSE, so the user saw a doubled apostrophe in the success toast, the ' +
    'confirmation screen and the week meal panel (D1). posInt() coerces ingredient_order ' +
    'and step_number, which the LLM supplies and which were the only interpolated numbers ' +
    'with no coercion — a non-numeric value 500ed the save (D2). fractionToDecimal now ' +
    'guards a zero denominator, which returned Infinity/NaN and reached SQL as literal text.';
  validate.notes = validate.notes && validate.notes.includes('Emits CLEAN data') ? validate.notes : vNote;

  const pNote =
    'Builds SQL by concatenation, so it escapes its own values with a local sqlEscape(). ' +
    'It previously depended on `Validate & Parse Recipe` having escaped them, an invariant ' +
    'stated nowhere and enforced nowhere, so any newly added field was unprotected by ' +
    'default (D4). The ingredient name is escaped on BOTH sides of the master INSERT and ' +
    'the WHERE that matches it — if they ever disagree the SELECT matches nothing and the ' +
    'INSERT writes zero rows while the workflow still reports success. The ingredient_name ' +
    'and tag_name fields on each emitted item are REPORTING metadata and stay unescaped.';
  process.notes = process.notes && process.notes.includes('local sqlEscape') ? process.notes : pNote;

  const iNote =
    'Escapes inline because `Validate & Parse Recipe` no longer escapes. Same expression ' +
    'shape as the `Update: *` nodes in `Grocery Prep Orchestrator`. Never put a backtick ' +
    'or a SQL comment in this field: n8n compiles it as a JS template literal to resolve ' +
    'the {{ }}, and a backtick mangles the query and fails silently with {success:true}, ' +
    '0 rows and HTTP 200.';
  insertRecipe.notes =
    insertRecipe.notes && insertRecipe.notes.includes('template literal') ? insertRecipe.notes : iNote;

  return wf;
}
