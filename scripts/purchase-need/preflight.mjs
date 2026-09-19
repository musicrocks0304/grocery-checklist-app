// READ-ONLY pre-flight for purchase-need slice 1.
// Runs the PATCHED `Pull Current Week Grocery List` query verbatim against live
// MySQL for a real week, and the PATCHED Ingredient Agent code on the same
// recipes, then checks:
//   A. the 14 original columns are byte-identical to the unpatched query's output
//   B. the 5 need columns equal the JS producer's need for every meal row
// Usage: node preflight.mjs <wfDir> "<WeekDateRange>" [--emulate]
//   --emulate: to_base / RecipeMultiplier do not exist yet (pre-migration), so
//   stand-ins are substituted: units -> derived table carrying the TO_TSP/TO_OZ
//   parity values; MAX(w2.RecipeMultiplier) -> an always-NULL aggregate over a w2
//   column (keeps the ONLY_FULL_GROUP_BY shape honest).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql, q } from './mysql.mjs';
import { runCodeNode, nodeByName } from './code-node.mjs';

const [wfDir, week] = process.argv.slice(2);
const emulate = process.argv.includes('--emulate');
if (!wfDir || !week) throw new Error('usage: node preflight.mjs <wfDir> "<WeekDateRange>" [--emulate]');

const load = (f) => JSON.parse(readFileSync(join(wfDir, f), 'utf8'));
const staplesOld = load('JoaR6klT950hwSLB.json');
const staplesNew = load('JoaR6klT950hwSLB.patched.json');
const agentNew = load('UqXlXX5uPWlGvhU6.patched.json');

const bindWeek = (query) => query.replace(/\{\{[\s\S]*?\}\}/g, () => String(week).replace(/'/g, "''"));
const UNITS_STANDIN =
  "(SELECT unit_id, unit_name, unit_type, CASE unit_name WHEN 'teaspoon' THEN 1 WHEN 'tablespoon' THEN 3 " +
  "WHEN 'cup' THEN 48 WHEN 'pint' THEN 96 WHEN 'quart' THEN 192 WHEN 'ounce' THEN 1 WHEN 'pound' THEN 16 END AS to_base FROM units)";
const emulateCols = (query) =>
  query
    .split('LEFT JOIN units u ON').join(`LEFT JOIN ${UNITS_STANDIN} u ON`)
    .split('MAX(w2.RecipeMultiplier)').join('MAX(CASE WHEN w2.id < 0 THEN w2.Quantity END)');

const oldQ = bindWeek(nodeByName(staplesOld, 'Pull Current Week Grocery List').parameters.query);
let newQ = bindWeek(nodeByName(staplesNew, 'Pull Current Week Grocery List').parameters.query);
if (emulate) newQ = emulateCols(newQ);

const oldRows = sql(oldQ);
const newRows = sql(newQ);
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log(`FAIL  ${msg}`); } };

// ---- A. nothing else changed ----------------------------------------------
const ORIG = Object.keys(oldRows[0] || {});
check(oldRows.length === newRows.length, `row count ${oldRows.length} (old) vs ${newRows.length} (new)`);
const key = (r) => ORIG.map((c) => r[c]).join('');
const oldSet = new Set(oldRows.map(key));
const drift = newRows.filter((r) => !oldSet.has(key(r)));
check(drift.length === 0, `${drift.length} row(s) differ in the 14 original columns`);
console.log(`A. ${newRows.length} rows; original ${ORIG.length} columns identical: ${drift.length === 0}`);

// ---- B. need columns equal the JS producer --------------------------------
const recipeIds = sql(`SELECT recipe_id FROM weekly_selections WHERE WeekDateRange = ${q(week)}`).map((r) => r.recipe_id);
const fetchQ = nodeByName(agentNew, 'Fetch Recipe Ingredients').parameters.query
  .replace(/\{\{[\s\S]*?\}\}/g, recipeIds.join(','));
const rows = sql(fetchQ);
const agg = await runCodeNode(nodeByName(agentNew, 'Aggregate Ingredients').parameters.jsCode, {
  input: rows, nodes: { 'Transform for SQL': [{}] },
});
const conv = await runCodeNode(nodeByName(agentNew, 'Convert to Shopping List').parameters.jsCode, {
  input: agg.map((i) => i.json),
});
const jsByName = new Map(conv[0].json.output.ingredients.map((i) => [i.name.trim().toLowerCase(), i]));

const r3 = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 1000) / 1000);
const withNeed = newRows.filter((r) => r.NeedOz !== null || r.NeedTsp !== null || r.NeedCount !== null || r.NeedUnspecified !== null);
let compared = 0;
for (const r of withNeed) {
  const js = jsByName.get(r.ItemName.trim().toLowerCase());
  if (!js) { check(false, `${r.ItemName}: derived a need but the JS producer has no such ingredient`); continue; }
  compared++;
  for (const f of ['NeedOz', 'NeedTsp', 'NeedCount']) {
    check(r3(r[f]) === r3(js[f]), `${r.ItemName}.${f}: sql ${r[f]} vs js ${js[f]}`);
  }
  check((r.NeedCountUnit || null) === (js.NeedCountUnit || null), `${r.ItemName}.NeedCountUnit: sql ${r.NeedCountUnit} vs js ${js.NeedCountUnit}`);
  check(Number(r.NeedUnspecified) === Number(js.NeedUnspecified), `${r.ItemName}.NeedUnspecified: sql ${r.NeedUnspecified} vs js ${js.NeedUnspecified}`);
}
const mealRows = newRows.filter((r) => r.DataSource === 'MealIngredients').length;
console.log(`B. recipes [${recipeIds.join(', ')}]; ${mealRows} meal rows; ${withNeed.length} rows carry a need; ${compared} compared field-by-field with the JS producer`);
if (process.argv.includes('--show')) {
  for (const r of withNeed) {
    const js = jsByName.get(r.ItemName.trim().toLowerCase()) || {};
    console.log(`   ${r.ItemName.padEnd(28)} oz=${r3(r.NeedOz)} tsp=${r3(r.NeedTsp)} n=${r3(r.NeedCount)} u=${r.NeedCountUnit} unspec=${r.NeedUnspecified} | stored Q=${r.QuantitySelected} ${r.Unit} | js purchase=${js.purchaseQuantity}`);
  }
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nPRE-FLIGHT PASS');
process.exit(failures ? 1 : 0);
