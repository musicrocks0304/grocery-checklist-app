# Purchase-Need Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the recipe need ("4 oz", "10 cloves", "36") instead of the package guess ("1 lb package") on the Grocery List, Review screen, In-Store Mode and the pre-submit meal screen. The need is derived at read time from a stored ×N multiplier.

**Architecture:** One migration adds `units.to_base`, seeded with exact parity to `Aggregate Ingredients`' `TO_TSP`/`TO_OZ`, and `WeeklyGroceryList.RecipeMultiplier`. Three n8n edits make two producers emit the same structured need, `{NeedOz, NeedTsp, NeedCount, NeedCountUnit, NeedUnspecified}`:
- `Pull Grocery Staples` derives it in SQL after submit.
- `Ingredient Agent` emits it in JS before submit.
- `Create Grocery List - Meals` stores the multiplier.

One pure function, `formatNeed()` in `src/utils/formatPurchase.js`, renders the need on every screen. A row with no need falls back to today's text, never to blank.

**Tech Stack:**
- React 18 (Create React App / `react-scripts`), tested with Jest, React Testing Library and hermetic Playwright e2e.
- n8n 1.121 workflows, edited over REST with `scripts/n8n-wave.mjs`.
- MySQL 8.0.43 in Docker `hsa-mysql`, running `ONLY_FULL_GROUP_BY`.
- Node 22.17.

**Spec:** `docs/superpowers/specs/2026-09-18-purchase-need-design.md`. Read "Decisions", sections 1–3, "Rollout and verification" and "Review history". **Slice 2 (the Cart Builder) is out of scope.** It starts only after slice 1 is verified live and Corey says go.

## Global Constraints

Every task's requirements include this section.

**Deploy order and rendering**
- **Deploy order: migration → n8n → frontend.** The branch merges to `main` only after Tasks 3–6 are live and verified; Netlify auto-deploys `main`. The n8n queries must not reference `RecipeMultiplier`/`to_base` before the columns exist, or every list load fails.
- **Render rule:** a row shows its need when `formatNeed(item)` returns text. Otherwise it shows exactly today's text. `formatNeed()` of absent fields is `''`, which is what makes a frontend-before-n8n deploy harmless.

**n8n and SQL traps**
- **An n8n query field is a JS template literal.** No backticks and no SQL comments in any query; reasoning goes in `node.notes`. The failure is silent: `{success:true}`, 0 rows, HTTP 200, execution logged "success".
- **`ONLY_FULL_GROUP_BY` is on.** Wrap every `w2.*` column inside a `GROUP BY w2.ItemID` subquery in `MAX()`: `COALESCE(MAX(w2.RecipeMultiplier), 1)`. A bare column is ERROR 1055, and that query feeds every Grocery List, Review and In-Store load.
- **`Pull Current Week Grocery List` is a UNION.** The need is derived in both `ATTR` (inside `CW`) and `ATTR2`.
- **The n8n MySQL node returns DECIMAL as a string** (`"10.000"`). `formatNeed()` coerces with `Number()` and rounds to 3 dp.
- **`RecipeMultiplier` goes in the INSERT column list and in `ON DUPLICATE KEY UPDATE`.**
- **An execution logged "success" can still have answered HTTP 500.** Read node data (`?includeData=true`), not the status.

**Live data** (there is no sandbox: localhost hits the n8n and MySQL Corey shops from)
- Re-watermark with `MAX(id)` at the start of every live step. **The handoff's baseline table is stale:** `WeeklyGroceryList` has moved past 1,046 rows / MAX id 3,693 because Corey was building his week on the evening of 2026-09-18, so never assert against fixed numbers.
- Prove the revert with a no-op DELETE before writing anything.
- Write only to the throwaway week `2026-05-17` / `For the week of May 17th to May 23rd, 2026` (Decision A below).
- Delete by `id > watermark`, then confirm every pre-existing row is intact. `scripts/purchase-need/verify-live.mjs` does all of this.
- **Never add anything to Corey's real HEB cart.**

**Tooling**
- n8n REST: `source /c/hsa-automation/.env`, then send both `-H "X-N8N-API-KEY: $N8N_API_KEY"` and `-H "Origin: http://localhost:5679"` to `http://localhost:5679/api/v1/...`. App webhooks take `X-API-Key: <REACT_APP_API_KEY from .env>`.
- The Bash heredoc collapses `\\`. Write files with the Write tool, not heredocs, and build backslashes in code with `String.fromCharCode(92)`. Commit messages go in a file: `git commit -F <file>`.
- App tests run **through react-scripts, never bare jest**. For one file: `CI=true npx.cmd react-scripts test --testPathPattern="X" --watchAll=false`. For a multi-pattern `"A|B"`, use `CI=true node node_modules/react-scripts/bin/react-scripts.js test --testPathPattern="A|B" --watchAll=false` (cmd.exe eats the pipe).
- e2e: **kill whatever holds port 3000 first.** The hermetic suite builds a production bundle on every run.

**Gates and commits**
- Gates: `npm.cmd run lint` clean · Jest ≥ 531 / 53 suites plus this plan's new tests · e2e ≥ 128 plus the new tests (+2 project-gated skips).
- Every commit message ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Decisions this plan makes that the spec did not (Corey: confirm at checkpoint 1)

**A. Live verification uses the empty past week 2026-05-17, not a 2020 week.**
- **Why 2020 can't work:** both attribution subqueries filter `w2.week_start_date >= '2026-04-26'` (the ItemID-convention guard). A 2020 week therefore derives *no* need at all, every row falls back, and the spec's parity checks can't run.
- **Why 2026-05-17:** it is empty in `WeeklyGroceryList`, `weekly_selections` and `shopping_progress` (checked before every write). It's in the past, so it's never the week Corey shops and the Thursday flip can't reach it, and it's never "the latest week". The protocol is otherwise unchanged.

**B. Folding changes some stored values.** Measured over all 61 recipes, each selected alone and all at once (1,153 ingredient rows):
- **14 `Quantity` rises.** This is the spec's stated exception: today's count read only the first half of a split need (celery 3→5, lime 11→17, egg 1→2, pita 4→8, and so on).
- **One decrease the spec doesn't name:** unitless-only garlic, recipe 56 alone, goes **4 → 1**. The count branch now applies its 10-cloves-per-head rule to the folded need. Today the cart would add 4 heads for 4 cloves.
- **37 rows change only `Unit`** (`as needed` → `item`/`items`), with `Quantity` identical. The only visible effect is the Cart Builder badge: "×4" becomes "4 items".
- **Recommendation: accept all three.** Each moves stored data toward the recipe need, and none can raise a count above the need.

**C. `formatNeed()` details the spec left open:**
- `NeedCountUnit = 'mixed'` makes the whole row fall back; the spec lists the mixed guard among no-need rows, and there are zero live instances.
- Correct plurals: "2 bunches" and "2 dozen", where `formatQuantity` would print "2 bunchs".
- A fractional-ounce remainder is rounded: "1 lb 4.8 oz", where `formatQuantity` prints float noise.
- Every screen uses `formatNeed()`, so no two screens can disagree.

**D. A unit whose `unit_type` is NULL counts as a counted unit.** The JS producer already treats such a unit as its own group; zero live units have a NULL type. This makes the two producers' parity total.

## Already proven during planning (read-only, 2026-09-18)

- **Dry run** (`dryrun.mjs`, saved workflow exports): all three edit scripts apply, a second application is a no-op, a half-patched workflow is refused, every patched Code node compiles, and no query has a backtick.
- **Pre-flight** (`preflight.mjs`, live MySQL, week 2026-07-05, emulated columns): the patched `Pull Current Week Grocery List` returns **120 rows whose 14 original columns are identical** to the unpatched query, with no ERROR 1055. **All 32 meal rows derive a need that matches the patched JS producer field by field.**
- **The `formatNeed()` test block below** passes against the implementation below: 67 cases under a Jest shim.
- **`verify-live.mjs`** passed its `dry` phase (the no-op DELETE removed 0+0 rows) and its read-only `snapshot` phase. **`restore_from_backup.mjs`** returns each patched workflow exactly to pristine and refuses another workflow's backup.
- Scratch copies of every file are in the session scratchpad under `pn/repo/`. The code blocks below are those files, byte for byte.

## File structure

**Create**

| file | responsibility |
|---|---|
| `scripts/purchase-need/mysql.mjs` | MySQL over `docker exec -i`, SQL on stdin (no shell quoting) |
| `scripts/purchase-need/code-node.mjs` | run an n8n Code node's jsCode locally with stubbed `$input`/`$()` |
| `scripts/purchase-need/dryrun.mjs` | apply each edit script to saved exports: idempotency, half-patch, compile |
| `scripts/purchase-need/preflight.mjs` | patched SQL vs unpatched SQL vs patched JS, read-only |
| `scripts/purchase-need/check-to-base.mjs` | `units.to_base` vs the live `TO_TSP`/`TO_OZ` |
| `scripts/purchase-need/verify-live.mjs` | the live-verification phases and the protocol |
| `scripts/n8n-edits/purchase_need_multiplier.mjs` | `Create Grocery List - Meals`: store `RecipeMultiplier` |
| `scripts/n8n-edits/purchase_need_derivation.mjs` | `Pull Grocery Staples`: derive the need in both halves |
| `scripts/n8n-edits/purchase_need_agent.mjs` | `Ingredient Agent`: `unit_type`, `unspecified`, `toNeed`, folded count |
| `scripts/n8n-edits/restore_from_backup.mjs` | rollback for any of the three |
| `scripts/n8n-workflows/migration-purchase-need-columns.json` | the one-shot migration workflow |
| `migrations/2026-09-18_purchase_need_columns.sql` | forward SQL, rollback (order matters), verification |
| `src/components/instore/ShoppingItems.test.js` | the In-Store pill |

**Modify**

| file | change |
|---|---|
| `src/utils/formatPurchase.js` (+ `.test.js`) | add `formatNeed()` |
| `src/components/staples/ItemRow.js` (+ test) | the need first, then `summarizePurchase` |
| `src/components/staples/ReviewScreen.js` (+ test) | same, in `ReviewRow` |
| `src/components/instore/ShoppingItems.js` | `QuantityPill` takes `need` |
| `src/components/RecipeIngredients.js` (+ test) | carry need fields; selection list, ×N hint, confirmation list, `Notes` |
| `e2e/fixtures/n8n/fetch_grocery_items.json` | every row gains the five need keys; one need row; one need-less digit-unit row |
| `e2e/plan.spec.js`, `e2e/shop.spec.js` | need assertions; F6/F8 checks move to need-less rows |

**Who executes what:** subagents (sonnet) take Tasks 1, 2, 7, 8 and 9. **The controller runs Tasks 0, 3, 4, 5, 6, 10 and 12 itself**, because they write to production. Task 11 is an opus reviewer.

---

### Task 0: Branch, baseline gates, preconditions

**Files:** none (plus committing this plan).

- [ ] **Step 1: Confirm the starting state**

```bash
cd "/c/New Grocery App/grocery-checklist-app" && git status --short && git log --oneline -3
```
Expected: `main` at `7dab838` (or a later docs-only commit), with only this plan file untracked.

- [ ] **Step 2: Branch and commit the plan**

```bash
git checkout -b feat/purchase-need-slice-1
git add docs/superpowers/plans/2026-09-18-purchase-need-slice-1.md
```
Write the message to a file with the Write tool, then run `git commit -F <file>`:
```
docs: implementation plan for purchase-need slice 1

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

- [ ] **Step 3: Baseline gates**

```bash
npm.cmd run lint
CI=true npx.cmd react-scripts test --watchAll=false 2>&1 | tail -6
```
Expected: lint clean, and `Tests: 531 passed`, `Test Suites: 53 passed`. Record the exact numbers; they are the floor for Task 12.

- [ ] **Step 4: Preconditions (read-only)**

```bash
MSYS_NO_PATHCONV=1 docker exec hsa-mysql bash -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" hsa -e "SHOW COLUMNS FROM units LIKE \"to_base\"; SHOW COLUMNS FROM WeeklyGroceryList LIKE \"RecipeMultiplier\"; SELECT COUNT(*) FROM WeeklyGroceryList WHERE week_start_date = \"2026-05-17\"; SELECT COUNT(*) FROM weekly_selections WHERE WeekDateRange = \"For the week of May 17th to May 23rd, 2026\";" 2>&1 | grep -v "Using a password"'
```
Expected: no column rows, then `0` and `0`. If either column already exists, **stop**: someone ran the migration, so read its state before doing anything.

---

### Task 1: Verification tooling and the three n8n edit scripts, dry-run and pre-flight (read-only)

**Files (all Create):** the six `scripts/purchase-need/*.mjs` files and the four `scripts/n8n-edits/*.mjs` files listed in File structure.

**Interfaces:**
- Produces `sql(query) → rows[]` (strings, `NULL` → `null`, one result set per call) and `q(value) → a quoted SQL literal`, both from `scripts/purchase-need/mysql.mjs`.
- Produces `runCodeNode(jsCode, { input, nodes }) → items` and `nodeByName(wf, name)` from `scripts/purchase-need/code-node.mjs`.
- Each edit script exports `default (wf) => wf`: idempotent, and it throws `half-patched` rather than guessing.
- `verify-live.mjs` phases: `dry | multiplier | snapshot <file> | derivation <file> | agent | full`.

- [ ] **Step 1: Create the files exactly as below** (use the Write tool; they contain backslashes and backticks)

`scripts/purchase-need/mysql.mjs`
```js
// Read-only-by-convention MySQL access for verification scripts.
// SQL goes in on stdin, so no shell quoting is involved at any layer.
// One statement per call: --batch prints one header per result set.
import { spawnSync } from 'node:child_process';

export function sql(query) {
  const r = spawnSync(
    'docker',
    ['exec', '-i', 'hsa-mysql', 'bash', '-c',
      'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --batch --default-character-set=utf8mb4 hsa'],
    { input: query, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const stderr = (r.stderr || '').split('\n').filter((l) => l && !/Using a password/.test(l)).join('\n');
  if (r.status !== 0 || stderr) throw new Error(`mysql failed (${r.status}): ${stderr}\n--- query ---\n${query.slice(0, 600)}`);
  const lines = r.stdout.split('\n').filter((l) => l.length);
  if (!lines.length) return [];
  const header = lines[0].split('\t');
  return lines.slice(1).map((l) => {
    const cells = l.split('\t');
    return Object.fromEntries(header.map((h, i) => [h, cells[i] === 'NULL' ? null : cells[i]]));
  });
}

// For single-quoted SQL literals.
export const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
```

`scripts/purchase-need/code-node.mjs`
```js
// Run an n8n Code node's jsCode ("run once for all items" mode) outside n8n,
// with $input / $('Node') stubbed from plain objects. Lets an edited node be
// exercised against real rows BEFORE it is deployed.
// It EXECUTES the node's code, by design — only ever feed it our own workflow
// JSON (a saved export or the n8n REST API on localhost), never outside input.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const wrap = (rows) => {
  const items = rows.map((json) => ({ json }));
  return {
    all: () => items,
    first: () => items[0],
    last: () => items[items.length - 1],
    item: items[0],
  };
};

export async function runCodeNode(jsCode, { input = [], nodes = {} } = {}) {
  const $input = wrap(input);
  const $ = (name) => {
    if (!(name in nodes)) throw new Error(`runCodeNode: node "${name}" not stubbed`);
    return wrap(nodes[name]);
  };
  const fn = new AsyncFunction('$input', '$', jsCode);
  return fn($input, $);
}

export const nodeByName = (wf, name) => {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`node "${name}" not found in ${wf.name}`);
  return n;
};
```

`scripts/purchase-need/dryrun.mjs`
```js
// Dry-run every purchase-need edit script against a SAVED workflow JSON.
// Nothing here talks to n8n.
// Usage: node scripts/purchase-need/dryrun.mjs <dir holding the exported <workflowId>.json files>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const wfDir = process.argv[2];
if (!wfDir) throw new Error('usage: node dryrun.mjs <dir holding <workflowId>.json>');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const CASES = [
  ['purchase_need_multiplier.mjs', 'CkLhcFEM9Tfc5uxO'],
  ['purchase_need_derivation.mjs', 'JoaR6klT950hwSLB'],
  ['purchase_need_agent.mjs', 'UqXlXX5uPWlGvhU6'],
];

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

for (const [script, id] of CASES) {
  const edit = (await import(pathToFileURL(join(here, '..', 'n8n-edits', script)).href)).default;
  const pristine = readFileSync(join(wfDir, `${id}.json`), 'utf8');

  const once = edit(JSON.parse(pristine));
  const onceText = JSON.stringify(once);
  ok(onceText !== JSON.stringify(JSON.parse(pristine)), `${script}: changes the workflow`);

  const twice = edit(JSON.parse(onceText));
  ok(JSON.stringify(twice) === onceText, `${script}: idempotent (second apply is a no-op)`);

  for (const n of once.nodes) {
    if (n.type === 'n8n-nodes-base.code') {
      let compiled = true;
      try { new AsyncFunction('$input', '$', n.parameters.jsCode); } catch (e) { compiled = false; console.log(e.message); }
      ok(compiled, `${script}: Code node "${n.name}" compiles`);
    }
    const qry = n.parameters && n.parameters.query;
    if (typeof qry === 'string') ok(!qry.includes(String.fromCharCode(96)), `${script}: "${n.name}" query has no backtick`);
  }

  // Half-patch: take the patched workflow and revert ONE node to pristine.
  const pristineWf = JSON.parse(pristine);
  const changed = once.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(pristineWf.nodes.find((p) => p.name === n.name)));
  if (changed.length > 1) {
    const half = JSON.parse(onceText);
    const idx = half.nodes.findIndex((n) => n.name === changed[0].name);
    half.nodes[idx] = pristineWf.nodes.find((p) => p.name === changed[0].name);
    let threw = false;
    try { edit(half); } catch (e) { threw = /half-patched/.test(e.message); }
    ok(threw, `${script}: refuses a half-patched workflow (reverted "${changed[0].name}")`);
  }

  writeFileSync(join(wfDir, `${id}.patched.json`), JSON.stringify(once, null, 1));
  console.log(`      wrote ${id}.patched.json (${changed.length} node(s) changed: ${changed.map((n) => n.name).join(', ')})`);
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL DRY-RUN CHECKS PASS');
process.exit(failures ? 1 : 0);
```

`scripts/purchase-need/preflight.mjs`
```js
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
```

`scripts/purchase-need/check-to-base.mjs`
```js
#!/usr/bin/env node
// The spec's parity check: units.to_base must agree with the TO_TSP / TO_OZ
// constants in the LIVE `Aggregate Ingredients` node (Ingredient Agent,
// UqXlXX5uPWlGvhU6) for EVERY unit — the pre-submit screen renders from the JS
// conversion and every later screen from this column, so any disagreement makes
// one ingredient read differently on adjacent screens.
// READ-ONLY. Usage: node scripts/purchase-need/check-to-base.mjs [workflow.json]
//   (with a file argument it reads the node code from a saved workflow instead of n8n)
import { readFileSync } from 'node:fs';
import { sql } from './mysql.mjs';

async function aggregateCode() {
  const file = process.argv[2];
  let wf;
  if (file) {
    wf = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    const env = readFileSync('C:\\hsa-automation\\.env', 'utf8');
    const key = (env.match(/^N8N_API_KEY=(.*)$/m) || [])[1]?.trim();
    const res = await fetch('http://localhost:5679/api/v1/workflows/UqXlXX5uPWlGvhU6', {
      headers: { 'X-N8N-API-KEY': key, Origin: 'http://localhost:5679' },
    });
    if (!res.ok) throw new Error(`n8n GET workflow -> HTTP ${res.status}`);
    wf = await res.json();
  }
  const node = wf.nodes.find((n) => n.name === 'Aggregate Ingredients');
  if (!node) throw new Error('Aggregate Ingredients node not found');
  return node.parameters.jsCode;
}

const code = await aggregateCode();
// Parse `const TO_TSP = { 'teaspoon': 1, ... };` as data — no eval.
const grab = (name) => {
  const m = code.match(new RegExp(`const ${name} = \\{([^}]*)\\};`));
  if (!m) throw new Error(`${name} not found in Aggregate Ingredients`);
  const out = {};
  for (const [, key, value] of m[1].matchAll(/'([^']+)'\s*:\s*([\d.]+)/g)) out[key] = Number(value);
  if (!Object.keys(out).length) throw new Error(`${name} parsed to nothing`);
  return out;
};
const TO_TSP = grab('TO_TSP');
const TO_OZ = grab('TO_OZ');
console.log(`JS constants: TO_TSP ${JSON.stringify(TO_TSP)}  TO_OZ ${JSON.stringify(TO_OZ)}`);
if (process.argv.includes('--constants-only')) process.exit(0);

const units = sql('SELECT unit_id, unit_name, unit_type, to_base FROM units ORDER BY unit_id');
let bad = 0;
for (const u of units) {
  const inTsp = Object.prototype.hasOwnProperty.call(TO_TSP, u.unit_name);
  const inOz = Object.prototype.hasOwnProperty.call(TO_OZ, u.unit_name);
  const expected = inTsp ? TO_TSP[u.unit_name] : inOz ? TO_OZ[u.unit_name] : null;
  const expectedType = inTsp ? 'volume' : inOz ? 'weight' : u.unit_type;
  const actual = u.to_base === null ? null : Number(u.to_base);
  const ok = actual === expected && u.unit_type === expectedType;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'}  ${String(u.unit_id).padStart(2)} ${u.unit_name.padEnd(12)} ${String(u.unit_type).padEnd(7)} to_base=${u.to_base}  expected=${expected}`);
}
for (const k of [...Object.keys(TO_TSP), ...Object.keys(TO_OZ)]) {
  if (!units.some((u) => u.unit_name === k)) { bad++; console.log(`BAD  "${k}" is converted by the JS but is not a unit`); }
}
console.log(bad ? `\n${bad} MISMATCH(ES)` : `\nPARITY OK: ${units.length} units agree with TO_TSP / TO_OZ`);
process.exit(bad ? 1 : 0);
```

`scripts/purchase-need/verify-live.mjs`
```js
#!/usr/bin/env node
// LIVE verification for purchase-need slice 1.
// Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md, "Slice 1 verification".
//
// Talks to the PRODUCTION webhooks and MySQL — there is no sandbox. Every phase
// that writes works only on a THROWAWAY week that must be empty before it starts,
// watermarks with MAX(id), proves the revert path with a no-op DELETE first,
// and reverts in `finally` (children first is moot: nothing references these
// rows). It never touches Corey's shopping week and never the HEB cart.
//
// Rows it can create, and how they are removed:
//   weekly_selections  get_recipe_items INSERT IGNOREs every recipe for the week
//   WeeklyGroceryList  meal_ingredients writes the list
// Both are deleted by (throwaway week AND id > watermark).
//
// Phases (node scripts/purchase-need/verify-live.mjs <phase> [file]):
//   dry                  preconditions + watermarks + no-op DELETE proof only
//   multiplier           Task 3: RecipeMultiplier written, and updated on resubmit
//   snapshot <file>      Task 4, BEFORE applying: record fetch_grocery_items (read-only)
//   derivation <file>    Task 4, AFTER applying: compare against the snapshot (read-only)
//   agent                Task 5: get_recipe_items emits the structured need
//   full                 Task 10: the spec's whole slice-1 verification list
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sql, q } from './mysql.mjs';

const ROOT = process.env.REPO_ROOT ? pathToFileURL(`${process.env.REPO_ROOT}/`) : new URL('../../', import.meta.url);
const env = readFileSync(new URL('.env', ROOT), 'utf8');
const API_KEY = (env.match(/^REACT_APP_API_KEY=(.*)$/m) || [])[1]?.trim();
const BASE = (env.match(/^REACT_APP_API_BASE_URL=(.*)$/m) || [])[1]?.trim() || 'https://n8n-grocery.needexcelexpert.com/webhook';
if (!API_KEY) throw new Error('REACT_APP_API_KEY not found in .env');
const { formatNeed } = await import(new URL('src/utils/formatPurchase.js', ROOT).href);
const { getWeekDates } = await import(new URL('src/utils/weekDates.js', ROOT).href);

// The throwaway week. 2026-05-17 holds no WeeklyGroceryList, weekly_selections
// or shopping_progress rows (checked below before every write), is in the past so
// it can never be the week Corey shops and the Thursday flip cannot reach it, and
// it is on or after 2026-04-26 — the need derivation's ItemID-convention guard,
// which makes a 2020 week derive NOTHING.
const WEEK = { start: '2026-05-17', end: '2026-05-23', display: 'For the week of May 17th to May 23rd, 2026' };
const PAST_MEAL_WEEK = { start: '2026-07-05', end: '2026-07-11', display: 'For the week of July 5th to July 11th, 2026' };
const EMPTY_WEEK = { start: '2019-01-06', end: '2019-01-12', display: 'For the week of January 6th to January 12th, 2019' };

// Recipes chosen for coverage (see the plan's Task 10 table): 24 teriyaki glaze
// 1 fluid ounce (counted-unit set); 56 garlic with NO unit (the fold); 59 Frito
// Chili Pie, genuine duplicated rows; 61 lime with no unit + 68 lime in pieces
// (the fold that raises stored Quantity); 68 corn tortillas 12 pieces.
const RECIPES = [24, 56, 59, 61, 68];
const REMOVE = 56; // a garlic recipe
const MULT = { 'corn tortillas': 3, 'ground turkey': 2, 'black pepper': 2 };
const NEED = ['NeedOz', 'NeedTsp', 'NeedCount', 'NeedCountUnit', 'NeedUnspecified'];
const ORIGINAL_KEYS = ['ItemID', 'ItemName', 'Category', 'Store', 'GroceryStoreSection', 'Type', 'IsActive', 'DataSource', 'QuantitySelected', 'IsSelected', 'Unit', 'store_location', 'RecipeNames', 'IsOptional'];

const failures = [];
const expect = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures.push(msg); };
const r3 = (v) => (v === null || v === undefined || v === '' ? null : Math.round(Number(v) * 1000) / 1000);
const lc = (s) => String(s || '').trim().toLowerCase();

async function call(path, { method = 'GET', body, query } = {}) {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.append(k, v);
  const res = await fetch(url, {
    method,
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const fetchList = async (week) => {
  const rows = await call('fetch_grocery_items', {
    query: { weekStartDate: week.start, weekEndDate: week.end, weekDateRange: week.display, timestamp: new Date().toISOString() },
  });
  if (!Array.isArray(rows) || rows.length === 0 || !('ItemName' in rows[0])) {
    throw new Error(`fetch_grocery_items returned no rows for ${week.start}: ${JSON.stringify(rows).slice(0, 200)}`);
  }
  return rows;
};

// ---- protocol --------------------------------------------------------------
function snapshotCounts() {
  const n = (x) => Number(x || 0);
  const [w] = sql(`SELECT COUNT(*) n, COALESCE(MAX(id), 0) mx, SUM(week_start_date = ${q(WEEK.start)} OR WeekDateRange = ${q(WEEK.display)}) wk FROM WeeklyGroceryList`);
  const [s] = sql(`SELECT COUNT(*) n, COALESCE(MAX(selection_id), 0) mx, SUM(WeekDateRange = ${q(WEEK.display)}) wk FROM weekly_selections`);
  const [p] = sql(`SELECT COUNT(*) n, SUM(week_start_date = ${q(WEEK.start)}) wk FROM shopping_progress`);
  return {
    wgl: { n: n(w.n), mx: n(w.mx), wk: n(w.wk) },
    ws: { n: n(s.n), mx: n(s.mx), wk: n(s.wk) },
    sp: { n: n(p.n), wk: n(p.wk) },
  };
}
function revert(wm) {
  const [a] = sql(`DELETE FROM WeeklyGroceryList WHERE week_start_date = ${q(WEEK.start)} AND WeekDateRange = ${q(WEEK.display)} AND id > ${wm.wgl}; SELECT ROW_COUNT() AS affected`);
  const [b] = sql(`DELETE FROM weekly_selections WHERE WeekDateRange = ${q(WEEK.display)} AND selection_id > ${wm.ws}; SELECT ROW_COUNT() AS affected`);
  return { wgl: Number(a.affected), ws: Number(b.affected) };
}
function begin() {
  const before = snapshotCounts();
  console.log(`baseline: WGL ${before.wgl.n} rows (MAX id ${before.wgl.mx}); weekly_selections ${before.ws.n} (MAX ${before.ws.mx}); shopping_progress ${before.sp.n}`);
  if (before.wgl.wk || before.ws.wk || before.sp.wk) {
    throw new Error(`throwaway week ${WEEK.start} is NOT empty (WGL ${before.wgl.wk}, ws ${before.ws.wk}, sp ${before.sp.wk}) — refusing to write; investigate first`);
  }
  const wm = { wgl: before.wgl.mx, ws: before.ws.mx };
  const noop = revert(wm);
  expect(noop.wgl === 0 && noop.ws === 0, `revert path proven: no-op DELETE removed ${noop.wgl}+${noop.ws} rows`);
  if (noop.wgl || noop.ws) throw new Error('the no-op DELETE removed rows — STOP');
  return { before, wm };
}
function finish({ before, wm }) {
  const removed = revert(wm);
  const after = snapshotCounts();
  console.log(`reverted: ${removed.wgl} WeeklyGroceryList + ${removed.ws} weekly_selections rows`);
  // Totals can move if Corey uses the app meanwhile, so prove the two things
  // that matter: every row that existed before is still there, and the
  // throwaway week is empty again.
  const [w] = sql(`SELECT COUNT(*) n FROM WeeklyGroceryList WHERE id <= ${wm.wgl}`);
  const [s] = sql(`SELECT COUNT(*) n FROM weekly_selections WHERE selection_id <= ${wm.ws}`);
  expect(Number(w.n) === before.wgl.n && Number(s.n) === before.ws.n,
    `every pre-existing row intact: WGL ${w.n}/${before.wgl.n}, weekly_selections ${s.n}/${before.ws.n}`);
  expect(after.wgl.wk === 0 && after.ws.wk === 0 && after.sp.wk === 0,
    `throwaway week empty again (WGL ${after.wgl.wk}, ws ${after.ws.wk}, shopping_progress ${after.sp.wk})`);
  console.log(`now: WGL ${after.wgl.n} rows (MAX id ${after.wgl.mx}); weekly_selections ${after.ws.n}; shopping_progress ${after.sp.n}`);
}

// ---- the app's own calls, shaped exactly as the app sends them -------------
async function recipeItems(ids, week = WEEK) {
  const meals = sql(`SELECT recipe_id, recipe_name FROM recipes WHERE recipe_id IN (${ids.map(Number).join(',')})`);
  const res = await call('get_recipe_items', {
    method: 'POST',
    body: { // useGenerateGroceryList.js
      recipe_ids: JSON.stringify(ids),
      session_id: `purchase-need-verify-${Date.now()}`,
      timestamp: new Date().toISOString(),
      meal_count: String(ids.length),
      meals: JSON.stringify(meals.map((m) => ({ id: Number(m.recipe_id), name: m.recipe_name, description: '' }))),
      week_start_date: week.start,
      week_end_date: week.end,
      week_display_range: week.display,
    },
  });
  const ings = (Array.isArray(res) ? res[0] : res)?.output?.ingredients;
  if (!Array.isArray(ings) || ings.length === 0) throw new Error(`get_recipe_items returned no ingredients: ${JSON.stringify(res).slice(0, 300)}`);
  return ings;
}
// RecipeIngredients.js: transform (:177-194) + handleAddToMainList (:69-95).
async function submit(ingredients, mult) {
  let id = 1;
  const selected = ingredients.map((ing) => ({
    ItemID: id++,
    ItemName: ing.name,
    Category: ing.category,
    Store: 'HEB',
    GroceryStoreSection: ing.category,
    Type: 'Basic',
    IsActive: 1,
    IsSelected: 1,
    QuantitySelected: ing.purchaseQuantity || '1',
    Unit: ing.purchaseUnit || 'item',
    RecipeNeeds: ing.recipeNeeds || '',
    FromMeals: ing.usedInRecipes || [],
    quantity: mult[lc(ing.name)] || 1,
  }));
  await call('meal_ingredients', {
    method: 'POST',
    body: {
      ingredients: JSON.stringify(selected),
      totalItems: String(selected.length),
      selectedMeals: JSON.stringify([]),
      weekStartDate: WEEK.start,
      weekEndDate: WEEK.end,
      weekDateRange: WEEK.display,
      timestamp: new Date().toISOString(),
      source: 'purchase_need_verify',
    },
  });
  return selected;
}
const storedRows = () => new Map(
  sql(`SELECT ItemName, Quantity, Unit, RecipeMultiplier FROM WeeklyGroceryList WHERE week_start_date = ${q(WEEK.start)} AND WeekDateRange = ${q(WEEK.display)}`)
    .map((r) => [lc(r.ItemName), r]),
);

// ---- phases ------------------------------------------------------------------
async function phaseMultiplier() {
  const items = [
    { name: 'Corn tortillas', category: 'Pasta, rice & grains', purchaseQuantity: '12', purchaseUnit: 'items' },
    { name: 'Garlic', category: 'Fruit & vegetables', purchaseQuantity: '1 head', purchaseUnit: 'whole head' },
  ];
  await submit(items, { 'corn tortillas': 3 });
  let s = storedRows();
  expect(s.size === 2, `2 rows written (got ${s.size})`);
  expect(s.get('corn tortillas')?.RecipeMultiplier === '3', `Corn tortillas RecipeMultiplier 3 (got ${s.get('corn tortillas')?.RecipeMultiplier})`);
  expect(s.get('corn tortillas')?.Quantity === '36', `Corn tortillas Quantity 36 (got ${s.get('corn tortillas')?.Quantity})`);
  expect(s.get('garlic')?.RecipeMultiplier === '1', `Garlic RecipeMultiplier 1 (got ${s.get('garlic')?.RecipeMultiplier})`);
  await submit(items, {});
  s = storedRows();
  expect(s.get('corn tortillas')?.RecipeMultiplier === '1', `resubmit at x1 UPDATES RecipeMultiplier to 1 (got ${s.get('corn tortillas')?.RecipeMultiplier})`);
  expect(s.get('corn tortillas')?.Quantity === '12', `resubmit at x1 Quantity 12 (got ${s.get('corn tortillas')?.Quantity})`);
}

const weeksForDerivation = () => [PAST_MEAL_WEEK, getWeekDatesAsWeek(), EMPTY_WEEK];
function getWeekDatesAsWeek() {
  const w = getWeekDates();
  return { start: w.startDate, end: w.endDate, display: w.displayRange };
}
async function phaseSnapshot(file) {
  const out = {};
  for (const w of weeksForDerivation()) out[w.start] = await fetchList(w);
  writeFileSync(file, JSON.stringify(out));
  for (const [k, rows] of Object.entries(out)) console.log(`snapshot ${k}: ${rows.length} rows`);
}
async function phaseDerivation(file) {
  const before = JSON.parse(readFileSync(file, 'utf8'));
  const [past, current, empty] = weeksForDerivation();
  for (const w of [past, current, empty]) {
    const after = await fetchList(w);
    const old = before[w.start];
    if (w === current) {
      // Corey edits his own week while we work, so it is a smoke check only:
      // it still loads, and every row carries the new keys.
      console.log(`      ${w.start} is the live shopping week: smoke check only (${old.length} -> ${after.length} rows)`);
    } else {
      expect(after.length === old.length, `${w.start}: same row count (${old.length} -> ${after.length})`);
      const key = (r) => ORIGINAL_KEYS.map((k) => JSON.stringify(r[k])).join('|');
      const oldKeys = new Set(old.map(key));
      const drifted = after.filter((r) => !oldKeys.has(key(r)));
      expect(drifted.length === 0, `${w.start}: the 14 original columns are unchanged (${drifted.length} drifted)`);
    }
    expect(after.every((r) => NEED.every((k) => k in r)), `${w.start}: every row carries all five need keys`);
    // A need may only appear on a name that has a MealIngredients row that week.
    // (CW can label a name group 'Staples' while carrying its meal row's need —
    // the spec's render rule keys on the rendered need for exactly that reason.)
    const mealNames = new Set(sql(`SELECT DISTINCT LOWER(TRIM(ItemName)) AS n FROM WeeklyGroceryList WHERE WeekDateRange = ${q(w.display)} AND DataSource = 'MealIngredients'`).map((r) => r.n));
    const stray = after.filter((r) => NEED.some((k) => r[k] !== null) && !mealNames.has(lc(r.ItemName)));
    expect(stray.length === 0, `${w.start}: only names with a meal row carry a need (${stray.map((r) => r.ItemName).join(', ')})`);
    if (w === empty) expect(after.every((r) => NEED.every((k) => r[k] === null)), `${w.start} (clean slate): all need keys NULL`);
    if (w === past) {
      const meal = after.filter((r) => r.DataSource === 'MealIngredients');
      const withText = meal.filter((r) => formatNeed(r) !== '');
      expect(meal.length > 0 && withText.length === meal.length, `${w.start}: every meal row renders a need (${withText.length}/${meal.length})`);
      const decimals = after.filter((r) => typeof r.NeedOz === 'string' || typeof r.NeedTsp === 'string' || typeof r.NeedCount === 'string');
      console.log(`      wire types: ${decimals.length} row(s) carry DECIMAL strings (e.g. ${JSON.stringify(Object.fromEntries(NEED.map((k) => [k, (decimals[0] || {})[k]])))})`);
      expect(withText.every((r) => !/\d\.\d{4,}/.test(formatNeed(r))), `${w.start}: no rendered need leaks DECIMAL padding`);
      for (const r of withText.slice(0, 6)) console.log(`      ${r.ItemName}: "${formatNeed(r)}"`);
    }
  }
}

async function phaseAgent() {
  const ings = await recipeItems(RECIPES);
  const by = new Map(ings.map((i) => [lc(i.name), i]));
  expect(ings.every((i) => NEED.every((k) => k in i)), `all ${ings.length} ingredients carry the five need fields`);
  expect(ings.every((i) => formatNeed(i) !== ''), 'every ingredient renders a need');
  const want = {
    garlic: '10 cloves', lime: '5', 'black pepper': '1.375 tsp', 'corn tortillas': '12',
    'teriyaki glaze': '1 fluid ounce', 'fritos or corn chips': 'as needed', 'chicken broth': '1 lb + 1.5 cups',
    'ground turkey': '2 lbs 8 oz', 'beef bouillon': '2 cubes', 'chili powder': '7.5 tbsp',
  };
  for (const [name, text] of Object.entries(want)) expect(formatNeed(by.get(name)) === text, `${name}: "${formatNeed(by.get(name))}" === "${text}"`);
  expect(String(by.get('lime')?.purchaseQuantity) === '5', `lime purchaseQuantity follows the folded need: "${by.get('lime')?.purchaseQuantity}" (was "3")`);
}

async function phaseFull() {
  // 1. pre-submit list, then submit exactly as the app does
  const pre = await recipeItems(RECIPES);
  const preBy = new Map(pre.map((i) => [lc(i.name), i]));
  await submit(pre, MULT);

  // 2. every ingredient stored, none dropped (no staples in this week), multiplier stored
  let stored = storedRows();
  expect(stored.size === pre.length, `every submitted ingredient stored: ${stored.size}/${pre.length} (no staple drops in an empty week)`);
  for (const [name, m] of Object.entries(MULT)) {
    expect(stored.get(name)?.RecipeMultiplier === String(m), `${name}: RecipeMultiplier ${m} stored (got ${stored.get(name)?.RecipeMultiplier})`);
  }
  expect([...stored.entries()].filter(([n]) => !(n in MULT)).every(([, r]) => r.RecipeMultiplier === '1'), 'every other row stored RecipeMultiplier 1');
  expect(stored.get('lime')?.Quantity === '5', `lime stored Quantity equals the folded need 5 (got ${stored.get('lime')?.Quantity})`);

  // 3. derived need == pre-submit need x multiplier, as NUMBERS and as RENDERED TEXT
  let list = await fetchList(WEEK);
  const listBy = new Map(list.filter((r) => preBy.has(lc(r.ItemName))).map((r) => [lc(r.ItemName), r]));
  expect(listBy.size === pre.length, `every ingredient comes back from fetch_grocery_items (${listBy.size}/${pre.length})`);
  let numberMismatch = 0;
  let textMismatch = 0;
  for (const [name, p] of preBy) {
    const r = listBy.get(name);
    if (!r) continue;
    const m = MULT[name] || 1;
    for (const f of ['NeedOz', 'NeedTsp', 'NeedCount']) {
      const want = p[f] === null || p[f] === undefined ? null : r3(p[f] * m);
      if (r3(r[f]) !== want) { numberMismatch++; console.log(`      ${name}.${f}: list ${r[f]} vs pre ${p[f]} x${m}`); }
    }
    if ((r.NeedCountUnit || null) !== (p.NeedCountUnit || null)) { numberMismatch++; console.log(`      ${name}.NeedCountUnit: ${r.NeedCountUnit} vs ${p.NeedCountUnit}`); }
    if (Number(r.NeedUnspecified) !== Number(p.NeedUnspecified)) { numberMismatch++; console.log(`      ${name}.NeedUnspecified: ${r.NeedUnspecified} vs ${p.NeedUnspecified}`); }
    if (formatNeed(r) !== formatNeed(p, m)) { textMismatch++; console.log(`      ${name}: list "${formatNeed(r)}" vs pre-submit "${formatNeed(p, m)}"`); }
  }
  expect(numberMismatch === 0, `derived need == pre-submit need x multiplier, field by field, for all ${listBy.size} ingredients`);
  expect(textMismatch === 0, `rendered text identical before and after submit for all ${listBy.size} ingredients`);
  const text = (n) => formatNeed(listBy.get(n));
  expect(text('corn tortillas') === '36', `count row x3 renders "36" (got "${text('corn tortillas')}")`);
  expect(text('black pepper') === '2.75 tsp', `sub-3-tsp row x2 renders "2.75 tsp" (got "${text('black pepper')}")`);
  expect(Number(listBy.get('black pepper')?.ItemID) === 348, `black pepper came through the GroceryItems half (CW/ATTR): ItemID ${listBy.get('black pepper')?.ItemID}`);
  expect(text('garlic') === '10 cloves', `garlic (not in GroceryItems -> ATTR2) folds its no-unit 4 into cloves: "${text('garlic')}"`);
  expect(text('lime') === '5', `lime renders "5" (got "${text('lime')}")`);
  expect(text('teriyaki glaze') === '1 fluid ounce', `unconvertible volume keeps its unit: "${text('teriyaki glaze')}"`);
  expect(text('ground turkey') === '5 lbs', `weight x2 renders "5 lbs" (got "${text('ground turkey')}")`);
  expect(text('fritos or corn chips') === 'as needed', `unspecified-only renders "as needed" (got "${text('fritos or corn chips')}")`);

  // 4. remove one garlic recipe: the need recalculates on the next read
  await call('remove_weekly_selection', { method: 'POST', body: { weekDateRange: WEEK.display, recipeId: REMOVE } });
  list = await fetchList(WEEK);
  const garlic = list.find((r) => lc(r.ItemName) === 'garlic');
  expect(formatNeed(garlic) === '6 cloves', `after removing recipe ${REMOVE}, garlic recalculates to "6 cloves" (got "${formatNeed(garlic)}")`);
  stored = storedRows();
  expect(!stored.has('whole wheat rigatoni'), 'a recipe-56-only row was cleaned up by Cleanup Orphan Meal Ingredients');

  // 5. resubmit at x1: the upsert updates the multiplier
  const pre2 = await recipeItems(RECIPES.filter((id) => id !== REMOVE));
  await submit(pre2, {});
  stored = storedRows();
  expect(stored.get('corn tortillas')?.RecipeMultiplier === '1', `resubmit x1: corn tortillas RecipeMultiplier 3 -> 1 (got ${stored.get('corn tortillas')?.RecipeMultiplier})`);
  expect(stored.get('corn tortillas')?.Quantity === '12', `resubmit x1: corn tortillas Quantity 36 -> 12 (got ${stored.get('corn tortillas')?.Quantity})`);
  list = await fetchList(WEEK);
  expect(formatNeed(list.find((r) => lc(r.ItemName) === 'corn tortillas')) === '12', 'resubmit x1: corn tortillas renders "12"');
}

// ---- main --------------------------------------------------------------------
const [phase, file] = process.argv.slice(2);
const WRITES = { multiplier: phaseMultiplier, agent: phaseAgent, full: phaseFull };
try {
  if (phase === 'dry') {
    const ctx = begin();
    finish(ctx);
  } else if (phase in WRITES) {
    const ctx = begin();
    try { await WRITES[phase](); } finally { finish(ctx); }
  } else if (phase === 'snapshot' && file) {
    await phaseSnapshot(file);
  } else if (phase === 'derivation' && file) {
    await phaseDerivation(file);
  } else {
    console.log('usage: verify-live.mjs dry | multiplier | snapshot <file> | derivation <file> | agent | full');
    process.exit(2);
  }
} catch (e) {
  failures.push(e.message);
  console.error(`ERROR  ${e.message}`);
}
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : `\nALL CHECKS PASS (${phase})`);
process.exit(failures.length ? 1 : 0);
```

`scripts/n8n-edits/purchase_need_multiplier.mjs`
```js
// `Create Grocery List - Meals` (CkLhcFEM9Tfc5uxO, /meal_ingredients) — store the
// review screen's xN multiplier on each meal row as RecipeMultiplier.
// Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md, section 1.
//
// `Transform for DB Input` already computes `multiplier` (clamped 1-10, rounded,
// missing -> 1) and threw it away after folding it into Quantity. The need is
// DERIVED at read time as recipe need x RecipeMultiplier (decision 4: store the
// multiplier, not a need string — removing a meal never resubmits, so a stored
// need would go stale), so the multiplier has to be stored.
//
// `Insert Meal Ingredients` writes it in BOTH places: the INSERT column list AND
// ON DUPLICATE KEY UPDATE. Missing the second is a known bug class here — a
// resubmit would keep the old multiplier beside a new Quantity.
//
// A value that is not an integer lands as NULL, which the derivation reads as x1
// (COALESCE(MAX(w2.RecipeMultiplier), 1)) — never as the literal text
// "undefined" in a numeric slot, which would 500 every submit.
//
// Quantity is untouched: ceil(base) x N is still a valid UPPER bound for N times
// the need, which slice 2 relies on.
//
// Idempotent. Half-patched state throws.

const TRANSFORM = 'Transform for DB Input';
const INSERT = 'Insert Meal Ingredients';

const T_OLD = '        Quantity: quantity,\n';
const T_NEW =
  '        Quantity: quantity,\n' +
  '        // Stored so the need can be derived as recipe need x N at read time\n' +
  '        // (`Pull Grocery Staples`); Quantity keeps ceil(base) x N as the upper bound.\n' +
  '        RecipeMultiplier: multiplier,\n';

const I_EDITS = [
  [
    'week_start_date, DataSource) VALUES (',
    'week_start_date, DataSource, RecipeMultiplier) VALUES (',
    'INSERT column list',
  ],
  [
    "'{{ $json.DataSource }}') ON DUPLICATE KEY UPDATE",
    "'{{ $json.DataSource }}', {{ Number.isInteger($json.RecipeMultiplier) ? $json.RecipeMultiplier : \"NULL\" }}) ON DUPLICATE KEY UPDATE",
    'VALUES list',
  ],
  [
    'Quantity = VALUES(Quantity), Unit = VALUES(Unit)',
    'Quantity = VALUES(Quantity), Unit = VALUES(Unit), RecipeMultiplier = VALUES(RecipeMultiplier)',
    'ON DUPLICATE KEY UPDATE list',
  ],
];

function replaceOnce(text, old, next, label) {
  const first = text.indexOf(old);
  if (first === -1) throw new Error(`purchase_need_multiplier: anchor not found — ${label}`);
  if (text.indexOf(old, first + old.length) !== -1) {
    throw new Error(`purchase_need_multiplier: anchor is not unique — ${label}`);
  }
  return text.slice(0, first) + next + text.slice(first + old.length);
}

export default function (wf) {
  const t = wf.nodes.find((n) => n.name === TRANSFORM);
  const ins = wf.nodes.find((n) => n.name === INSERT);
  if (!t) throw new Error(`purchase_need_multiplier: "${TRANSFORM}" not found`);
  if (!ins) throw new Error(`purchase_need_multiplier: "${INSERT}" not found`);

  let code = t.parameters.jsCode;
  let query = ins.parameters.query;

  const markers = [
    code.includes('RecipeMultiplier: multiplier,'),
    query.includes('DataSource, RecipeMultiplier) VALUES ('),
    query.includes('$json.RecipeMultiplier : "NULL" }}) ON DUPLICATE KEY UPDATE'),
    query.includes('RecipeMultiplier = VALUES(RecipeMultiplier)'),
  ];
  if (markers.every(Boolean)) return wf;
  if (markers.some(Boolean)) {
    throw new Error(
      `purchase_need_multiplier: half-patched (markers ${markers.map((m) => (m ? 1 : 0)).join('')})` +
        ' — restore from .n8n-backups/pre-save rather than re-running',
    );
  }

  code = replaceOnce(code, T_OLD, T_NEW, 'Transform output Quantity line');
  for (const [old, next, label] of I_EDITS) query = replaceOnce(query, old, next, label);

  t.parameters.jsCode = code;
  ins.parameters.query = query;

  const note =
    ' RecipeMultiplier (purchase-need slice 1, 2026-09-18) is written in the column list AND in ' +
    'ON DUPLICATE KEY UPDATE, so a resubmit at a different xN updates it. Non-integer -> NULL (= x1).';
  if (!(ins.notes || '').includes('RecipeMultiplier (purchase-need')) ins.notes = (ins.notes || '') + note;
  return wf;
}
```

`scripts/n8n-edits/purchase_need_derivation.mjs`
```js
// `Pull Grocery Staples` (JoaR6klT950hwSLB, /fetch_grocery_items) — derive the
// recipe NEED at read time, on every week-list row that came from a recipe.
// Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md, section 1.
//
// Five new columns on every row of BOTH branches:
//
//   NeedOz          weight total in ounces        SUM(quantity * to_base)
//   NeedTsp         volume total in teaspoons     SUM(quantity * to_base)
//   NeedCount       counted total                 SUM(quantity)
//   NeedCountUnit   the fold rule's unit          'piece' | a counted unit | 'mixed'
//   NeedUnspecified any row with no usable amount 1 / 0
//
// each multiplied by COALESCE(MAX(w2.RecipeMultiplier), 1). Staples, one-offs,
// pre-2026-04-26 weeks and F7's 900000-band rows get NULLs and the screens fall
// back to today's text.
//
// WHERE: `Pull Current Week Grocery List` is a UNION of two halves, each with its
// own attribution subquery — ATTR (inside CW, for rows whose name matches a
// GroceryItems catalogue row) and ATTR2 (week rows not in the catalogue). They
// are byte-identical, so the need is added to BOTH with one replacement that must
// match exactly twice. CW and the second half then carry it up with MAX(), and
// the outer SELECT lists it. `Pull Clean Slate Grocery List` returns the same five
// columns as NULL so the two branches' column sets cannot drift apart again.
//
// ONLY_FULL_GROUP_BY is ON on this server. ATTR/ATTR2 are GROUP BY w2.ItemID and
// RecipeMultiplier is not provably dependent on it, so it MUST be wrapped:
// a bare COALESCE(w2.RecipeMultiplier, 1) is ERROR 1055, and this query feeds
// every Grocery List, Review and In-Store load. MAX() over the one row per ItemID
// per week is that row's value.
//
// THE COUNTED-UNIT SET, defined once and used in NeedCount, the fold and the mixed
// guard: no unit, unit_type 'count', a unit with NULL unit_type, or a
// weight/volume unit with NULL to_base (fluid ounce). That is exactly the set the
// JS producer (`Aggregate Ingredients` -> `Convert to Shopping List`) puts in its
// own group, which is what makes the pre-submit screen and the list agree.
//
// An n8n query field is compiled as a JS template literal: no backticks, no SQL
// comments. Reasoning lives in node.notes.
//
// Idempotent. A half-patched query throws instead of guessing.

const PULL = 'Pull Current Week Grocery List';
const CLEAN = 'Pull Clean Slate Grocery List';
const BT = String.fromCharCode(96);

const COUNTED = "(u.unit_type IS NULL OR u.unit_type = 'count' OR (u.unit_type IN ('weight', 'volume') AND u.to_base IS NULL))";
const NAMED_COUNTED = `ri.quantity > 0 AND u.unit_id IS NOT NULL AND ${COUNTED}`;
const MULT = 'COALESCE(MAX(w2.RecipeMultiplier), 1)';

const NEED_SELECT = [
  `SUM(CASE WHEN ri.quantity > 0 AND u.unit_type = 'weight' AND u.to_base IS NOT NULL THEN ri.quantity * u.to_base END) * ${MULT} AS NeedOz`,
  `SUM(CASE WHEN ri.quantity > 0 AND u.unit_type = 'volume' AND u.to_base IS NOT NULL THEN ri.quantity * u.to_base END) * ${MULT} AS NeedTsp`,
  `SUM(CASE WHEN ri.quantity > 0 AND ${COUNTED} THEN ri.quantity END) * ${MULT} AS NeedCount`,
  `CASE WHEN COUNT(DISTINCT CASE WHEN ${NAMED_COUNTED} THEN u.unit_id END) > 1 THEN 'mixed'` +
    ` WHEN COUNT(DISTINCT CASE WHEN ${NAMED_COUNTED} THEN u.unit_id END) = 1 THEN MAX(CASE WHEN ${NAMED_COUNTED} THEN u.unit_name END)` +
    ` WHEN SUM(CASE WHEN ri.quantity > 0 AND ${COUNTED} THEN 1 ELSE 0 END) > 0 THEN 'piece' END AS NeedCountUnit`,
  "MAX(CASE WHEN ri.quantity IS NULL OR ri.quantity <= 0 OR u.unit_type = 'other' THEN 1 ELSE 0 END) AS NeedUnspecified",
].join(', ');

const NEED_COLS = ['NeedOz', 'NeedTsp', 'NeedCount', 'NeedCountUnit', 'NeedUnspecified'];
const carry = (alias) => NEED_COLS.map((c) => `MAX(${alias}.${c}) AS ${c}`).join(', ');

// [old, new, expected occurrences, label]
const PULL_EDITS = [
  [
    'store_location, RecipeNames, IsOptional FROM ( SELECT GI.ItemID,',
    `store_location, RecipeNames, IsOptional, ${NEED_COLS.join(', ')} FROM ( SELECT GI.ItemID,`,
    1, 'outer SELECT list',
  ],
  [
    'CW.RecipeNames, COALESCE(CW.IsOptional, 0) AS IsOptional FROM GroceryItems AS GI',
    `CW.RecipeNames, COALESCE(CW.IsOptional, 0) AS IsOptional, ${NEED_COLS.map((c) => `CW.${c}`).join(', ')} FROM GroceryItems AS GI`,
    1, 'first half SELECT',
  ],
  [
    'MAX(ATTR.RecipeNames) AS RecipeNames, MIN(ATTR.IsOptional) AS IsOptional FROM WeeklyGroceryList LEFT JOIN (',
    `MAX(ATTR.RecipeNames) AS RecipeNames, MIN(ATTR.IsOptional) AS IsOptional, ${carry('ATTR')} FROM WeeklyGroceryList LEFT JOIN (`,
    1, 'CW aggregates',
  ],
  [
    'MIN(ri.optional) AS IsOptional FROM WeeklyGroceryList w2',
    `MIN(ri.optional) AS IsOptional, ${NEED_SELECT} FROM WeeklyGroceryList w2`,
    2, 'ATTR + ATTR2 need columns',
  ],
  [
    'JOIN recipes r ON r.recipe_id = ws.recipe_id WHERE w2.WeekDateRange',
    'JOIN recipes r ON r.recipe_id = ws.recipe_id LEFT JOIN units u ON u.unit_id = ri.unit_id WHERE w2.WeekDateRange',
    2, 'ATTR + ATTR2 units join',
  ],
  [
    'MAX(ATTR2.RecipeNames) AS RecipeNames, COALESCE(MIN(ATTR2.IsOptional), 0) AS IsOptional FROM WeeklyGroceryList AS WGL',
    `MAX(ATTR2.RecipeNames) AS RecipeNames, COALESCE(MIN(ATTR2.IsOptional), 0) AS IsOptional, ${carry('ATTR2')} FROM WeeklyGroceryList AS WGL`,
    1, 'second half SELECT',
  ],
];

const CLEAN_OLD = '  0 AS IsOptional\n  FROM GroceryItems';
const CLEAN_NEW = `  0 AS IsOptional,\n${NEED_COLS.map((c) => `  NULL AS ${c}`).join(',\n')}\n  FROM GroceryItems`;

const count = (s, sub) => s.split(sub).length - 1;

function replaceExactly(text, old, next, times, label) {
  const n = count(text, old);
  if (n !== times) {
    throw new Error(`purchase_need_derivation: anchor matched ${n} time(s), expected ${times} — ${label}`);
  }
  return text.split(old).join(next);
}

export default function (wf) {
  const pull = wf.nodes.find((n) => n.name === PULL);
  const clean = wf.nodes.find((n) => n.name === CLEAN);
  if (!pull) throw new Error(`purchase_need_derivation: "${PULL}" not found`);
  if (!clean) throw new Error(`purchase_need_derivation: "${CLEAN}" not found`);

  let query = pull.parameters && pull.parameters.query;
  let cleanQuery = clean.parameters && clean.parameters.query;
  if (typeof query !== 'string') throw new Error(`purchase_need_derivation: "${PULL}" has no query string`);
  if (typeof cleanQuery !== 'string') throw new Error(`purchase_need_derivation: "${CLEAN}" has no query string`);

  // Done-markers, one per edit: all present = already applied; some = half-patched.
  const markers = [
    count(query, `IsOptional, ${NEED_COLS.join(', ')} FROM ( SELECT`) === 1,
    count(query, `COALESCE(CW.IsOptional, 0) AS IsOptional, CW.NeedOz`) === 1,
    count(query, carry('ATTR') + ' FROM WeeklyGroceryList LEFT JOIN') === 1,
    count(query, `IsOptional, ${NEED_SELECT} FROM WeeklyGroceryList w2`) === 2,
    count(query, 'LEFT JOIN units u ON u.unit_id = ri.unit_id WHERE w2.WeekDateRange') === 2,
    count(query, carry('ATTR2') + ' FROM WeeklyGroceryList AS WGL') === 1,
    cleanQuery.includes('  NULL AS NeedUnspecified\n'),
  ];
  const alreadyAny = /Need(Oz|Tsp|Count|CountUnit|Unspecified)|RecipeMultiplier|to_base/.test(query + cleanQuery);
  if (markers.every(Boolean)) return wf; // already applied — no-op
  if (markers.some(Boolean) || alreadyAny) {
    throw new Error(
      `purchase_need_derivation: half-patched (markers ${markers.map((m) => (m ? 1 : 0)).join('')})` +
        ' — restore the workflow from .n8n-backups/pre-save rather than re-running',
    );
  }

  for (const [old, next, times, label] of PULL_EDITS) query = replaceExactly(query, old, next, times, label);
  cleanQuery = replaceExactly(cleanQuery, CLEAN_OLD, CLEAN_NEW, 1, 'clean-slate NULL columns');

  if (query.includes(BT) || cleanQuery.includes(BT)) {
    throw new Error('purchase_need_derivation: refusing to save a query containing a backtick');
  }
  if (/--|\/\*/.test(query) || /--|\/\*/.test(cleanQuery)) {
    throw new Error('purchase_need_derivation: refusing to save a query containing a SQL comment');
  }

  pull.parameters.query = query;
  clean.parameters.query = cleanQuery;

  const note =
    ' NEED (purchase-need slice 1, 2026-09-18): NeedOz / NeedTsp / NeedCount / NeedCountUnit / ' +
    'NeedUnspecified are derived in BOTH attribution subqueries (ATTR inside CW, and ATTR2) by ' +
    'conditional aggregation over LEFT JOIN units u, times COALESCE(MAX(w2.RecipeMultiplier), 1). ' +
    'The MAX() is mandatory: ONLY_FULL_GROUP_BY is on, a bare w2 column in a GROUP BY w2.ItemID ' +
    'subquery is ERROR 1055, and this query feeds every list load. Counted-unit set (NeedCount, fold, ' +
    'mixed guard): no unit, unit_type count, NULL unit_type, or weight/volume with NULL to_base ' +
    '(fluid ounce) — the same set the JS producer groups, so pre-submit and list agree. Fold: no-unit ' +
    'rows adopt the single named counted unit, else piece; two named counted units -> mixed (the ' +
    'screens then fall back). DECIMAL columns arrive as STRINGS ("10.0000000"): formatNeed() coerces. ' +
    'Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md.';
  if (!(pull.notes || '').includes('NEED (purchase-need slice 1')) pull.notes = (pull.notes || '') + note;
  const cleanNote =
    ' Returns NeedOz/NeedTsp/NeedCount/NeedCountUnit/NeedUnspecified as NULL so both branches ' +
    'carry the same columns (purchase-need slice 1).';
  if (!(clean.notes || '').includes('purchase-need slice 1')) clean.notes = (clean.notes || '') + cleanNote;

  return wf;
}
```

`scripts/n8n-edits/purchase_need_agent.mjs`
```js
// `Ingredient Agent` (UqXlXX5uPWlGvhU6, /get_recipe_items) — emit the recipe NEED,
// structured, on every pre-submit ingredient.
// Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md, section 2.
//
// The pre-submit screen renders this; every later screen renders the SQL
// derivation in `Pull Grocery Staples`. One formatter (formatNeed in
// src/utils/formatPurchase.js) renders both, so they must produce the SAME shape
// from the same rules:
//
//   NeedOz, NeedTsp, NeedCount, NeedCountUnit, NeedUnspecified
//
// Three nodes change:
//
// 1. `Fetch Recipe Ingredients` also selects u.unit_type.
// 2. `Aggregate Ingredients` (the only node that sees individual rows) treats a
//    row whose unit_type is 'other' (pinch, dash, to taste) as UNSPECIFIED even
//    with a number beside it — the SQL files it that way, and "2 pinchs" would
//    otherwise be a group here and "as needed" there. It also records
//    `unspecified` (any row with no usable amount) -> NeedUnspecified.
// 3. `Convert to Shopping List` builds the need from rawQuantities with the fold
//    rule, and `toPurchaseQuantity`'s count branch reads the FOLDED need instead
//    of the first number of the joined display string. Otherwise the fold creates
//    a mismatch: Whole wheat pita "4 items + 4 pieces" stored Quantity 4 against a
//    folded need of 8, and lime stored 2 for a need of 4 — and slice 2's bound
//    would cut the correct 4 limes to 2. So a few stored counts RISE (lime, pita):
//    in each case today's count dropped part of the recipe's own need.
//
// Weight/volume branches of toPurchaseQuantity are untouched (slice 2 replaces
// package guessing for the cart; slice 1 only stops showing the guess).
//
// Idempotent. Half-patched state throws.

const BS = String.fromCharCode(92); // \

const FETCH = 'Fetch Recipe Ingredients';
const AGG = 'Aggregate Ingredients';
const CONVERT = 'Convert to Shopping List';

function replaceOnce(text, old, next, label) {
  const first = text.indexOf(old);
  if (first === -1) throw new Error(`purchase_need_agent: anchor not found — ${label}`);
  if (text.indexOf(old, first + old.length) !== -1) {
    throw new Error(`purchase_need_agent: anchor is not unique — ${label}`);
  }
  return text.slice(0, first) + next + text.slice(first + old.length);
}

// --- 1. Fetch Recipe Ingredients -------------------------------------------
const FETCH_EDITS = [
  [',u.unit_name \nFROM recipe_ingredients ri', ',u.unit_name \n,u.unit_type\nFROM recipe_ingredients ri', 'unit_type column'],
];

// --- 2. Aggregate Ingredients ----------------------------------------------
const AGG_EDITS = [
  [
    "  const unit = (row.unit_name || '').toLowerCase().trim();\n",
    "  const unit = (row.unit_name || '').toLowerCase().trim();\n" +
      "  const unitType = (row.unit_type || '').toLowerCase().trim();\n",
    'unitType line',
  ],
  [
    '  const hasQty = Number.isFinite(parsedQty) && parsedQty > 0;\n',
    '  // An `other` unit (pinch, dash, to taste) measures nothing even with a number\n' +
      '  // beside it. `Pull Grocery Staples` files those rows as an unspecified need,\n' +
      '  // so this must too, or the pre-submit screen and the list disagree.\n' +
      "  const hasQty = Number.isFinite(parsedQty) && parsedQty > 0 && unitType !== 'other';\n",
    'hasQty excludes other',
  ],
  [
    '    aggregated[name] = { name, category, quantities: {}, recipes: [] };\n',
    '    aggregated[name] = { name, category, quantities: {}, recipes: [], unspecified: false };\n',
    'unspecified init',
  ],
  [
    '  if (hasQty) {\n    const unitInfo = getBaseUnit(unit);\n',
    '  // Any row without a usable amount -> NeedUnspecified (shown only when\n' +
      '  // nothing else is: a real amount always wins, per TB-3b).\n' +
      '  if (!hasQty) aggregated[name].unspecified = true;\n' +
      '  if (hasQty) {\n    const unitInfo = getBaseUnit(unit);\n',
    'unspecified flag',
  ],
  [
    '    rawQuantities: ing.quantities,\n',
    '    rawQuantities: ing.quantities,\n    unspecified: ing.unspecified,\n',
    'unspecified output',
  ],
];

// --- 3. Convert to Shopping List -------------------------------------------
const TO_NEED = [
  '// The recipe need as structured numbers: the SAME shape `Pull Grocery Staples`',
  '// derives after submit, rendered by one formatter (formatNeed in',
  '// src/utils/formatPurchase.js), so the pre-submit screen and the list cannot',
  '// disagree. rawQuantities groups: `weight` (total oz), `volume` (total tsp), and',
  '// one group per COUNTED unit — a count unit, or a weight/volume unit Aggregate',
  "// Ingredients cannot convert (fluid ounce) — where '' is \"no unit\".",
  "// Fold rule: the no-unit group adopts the ingredient's single named counted unit,",
  "// or is 'piece' when there is none; two or more named counted units -> 'mixed'",
  '// (NeedCount is then not trusted and the screens fall back).',
  'function toNeed(rawQuantities, unspecified) {',
  '  const raw = rawQuantities || {};',
  "  const counted = Object.keys(raw).filter((k) => k !== 'weight' && k !== 'volume');",
  "  const named = counted.filter((k) => k !== '');",
  '  let countTotal = null;',
  '  for (const k of counted) countTotal = (countTotal || 0) + raw[k].total;',
  '  return {',
  '    NeedOz: raw.weight ? raw.weight.total : null,',
  '    NeedTsp: raw.volume ? raw.volume.total : null,',
  '    NeedCount: countTotal,',
  "    NeedCountUnit: counted.length === 0 ? null : named.length === 0 ? 'piece' : named.length === 1 ? named[0] : 'mixed',",
  '    NeedUnspecified: unspecified ? 1 : 0,',
  '  };',
  '}',
  '',
].join('\n');

const CONVERT_EDITS = [
  [
    'function toPurchaseQuantity(totalQty, name, rawQuantities) {',
    'function toPurchaseQuantity(totalQty, name, rawQuantities, need) {',
    'toPurchaseQuantity signature',
  ],
  [
    [
      "  if (!totalQty) return { purchaseQuantity: '1', purchaseUnit: 'item' };",
      `  const match = totalQty.match(/([${BS}d.]+)${BS}s*(.*)/);`,
      '  const val = match ? parseFloat(match[1]) : 1;',
      "  const unit = match ? match[2].trim().toLowerCase() : '';",
      '',
    ].join('\n'),
    [
      "  if (!totalQty) return { purchaseQuantity: '1', purchaseUnit: 'item' };",
      '  // The count branch reads the FOLDED need, never the first number of the',
      '  // joined display string: "4 items + 4 pieces" of Whole wheat pita stored 4',
      '  // while the recipes need 8, and lime (no unit in some recipes, "piece" in',
      "  // others) stored 2 for a need of 4. A 'mixed' need is not trusted and keeps",
      '  // the old parse.',
      "  const folded = !!(need && need.NeedCount > 0 && need.NeedCountUnit && need.NeedCountUnit !== 'mixed');",
      `  const match = folded ? null : totalQty.match(/([${BS}d.]+)${BS}s*(.*)/);`,
      '  const val = folded ? need.NeedCount : (match ? parseFloat(match[1]) : 1);',
      "  const unit = folded ? (need.NeedCountUnit === 'piece' ? '' : need.NeedCountUnit) : (match ? match[2].trim().toLowerCase() : '');",
      '',
    ].join('\n'),
    'count-branch parse',
  ],
  [
    "  return { purchaseQuantity: totalQty, purchaseUnit: 'as needed' };",
    [
      '  if (folded) {',
      "    // Same text formatQuantity gives a single group (\"2 cubes\", \"1 fluid ounce\"),",
      '    // but counting the folded total.',
      `    const n = val % 1 === 0 ? String(val) : val.toFixed(2).replace(/${BS}.?0+$/, '');`,
      "    return { purchaseQuantity: n + ' ' + unit + (val > 1 && !unit.endsWith('s') ? 's' : ''), purchaseUnit: 'as needed' };",
      '  }',
      "  return { purchaseQuantity: totalQty, purchaseUnit: 'as needed' };",
    ].join('\n'),
    'fall-through return',
  ],
  [
    'const ingredients = aggregatedIngredients.map(ing => {\n' +
      '  const purchase = toPurchaseQuantity(ing.totalQuantity, ing.name, ing.rawQuantities);\n',
    TO_NEED +
      'const ingredients = aggregatedIngredients.map(ing => {\n' +
      '  const need = toNeed(ing.rawQuantities, ing.unspecified);\n' +
      '  const purchase = toPurchaseQuantity(ing.totalQuantity, ing.name, ing.rawQuantities, need);\n',
    'toNeed + map head',
  ],
  [
    '    usedInRecipes: ing.recipes\n  };',
    '    usedInRecipes: ing.recipes,\n' +
      '    NeedOz: need.NeedOz,\n' +
      '    NeedTsp: need.NeedTsp,\n' +
      '    NeedCount: need.NeedCount,\n' +
      '    NeedCountUnit: need.NeedCountUnit,\n' +
      '    NeedUnspecified: need.NeedUnspecified\n  };',
    'need fields on each ingredient',
  ],
];

export default function (wf) {
  const fetch = wf.nodes.find((n) => n.name === FETCH);
  const agg = wf.nodes.find((n) => n.name === AGG);
  const conv = wf.nodes.find((n) => n.name === CONVERT);
  if (!fetch || !agg || !conv) throw new Error('purchase_need_agent: expected nodes not found');

  let query = fetch.parameters.query;
  let aggCode = agg.parameters.jsCode;
  let convCode = conv.parameters.jsCode;

  const markers = [
    query.includes(',u.unit_type\n'),
    aggCode.includes("unitType !== 'other'"),
    aggCode.includes('unspecified: ing.unspecified,'),
    convCode.includes('function toNeed(rawQuantities, unspecified) {'),
    convCode.includes('NeedUnspecified: need.NeedUnspecified'),
  ];
  if (markers.every(Boolean)) return wf;
  if (markers.some(Boolean)) {
    throw new Error(
      `purchase_need_agent: half-patched (markers ${markers.map((m) => (m ? 1 : 0)).join('')})` +
        ' — restore from .n8n-backups/pre-save rather than re-running',
    );
  }

  for (const [o, n, l] of FETCH_EDITS) query = replaceOnce(query, o, n, `Fetch: ${l}`);
  for (const [o, n, l] of AGG_EDITS) aggCode = replaceOnce(aggCode, o, n, `Aggregate: ${l}`);
  for (const [o, n, l] of CONVERT_EDITS) convCode = replaceOnce(convCode, o, n, `Convert: ${l}`);

  if (query.includes(String.fromCharCode(96))) throw new Error('purchase_need_agent: backtick in the Fetch query');

  fetch.parameters.query = query;
  agg.parameters.jsCode = aggCode;
  conv.parameters.jsCode = convCode;

  const tag = ' (purchase-need slice 1, 2026-09-18)';
  const addNote = (node, text) => {
    if (!(node.notes || '').includes('purchase-need slice 1')) node.notes = (node.notes || '') + ' ' + text + tag;
  };
  addNote(fetch, 'Selects u.unit_type so Aggregate Ingredients can treat other-typed units as unspecified, exactly as the SQL need derivation does.');
  addNote(agg, "Rows whose unit_type is 'other' are unspecified even with a number; `unspecified` (any row with no usable amount) becomes NeedUnspecified.");
  addNote(conv, "Emits NeedOz/NeedTsp/NeedCount/NeedCountUnit/NeedUnspecified per ingredient (toNeed, fold rule), the same shape Pull Grocery Staples derives; toPurchaseQuantity's count branch reads the folded need.");
  return wf;
}
```

`scripts/n8n-edits/restore_from_backup.mjs`
```js
// Restore a workflow's nodes and connections from an n8n-wave pre-save backup.
// The rollback path for every purchase-need edit:
//   RESTORE_FROM=<backup.json> node scripts/n8n-wave.mjs apply <webhookPath> scripts/n8n-edits/restore_from_backup.mjs
// (or `apply-id <workflowId>` if the workflow is no longer active). n8n-wave's
// own save still writes a fresh pre-save backup first, so a restore is itself
// reversible.
import { readFileSync } from 'node:fs';

export default function (wf) {
  const file = process.env.RESTORE_FROM;
  if (!file) throw new Error('restore_from_backup: set RESTORE_FROM to the backup JSON');
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  if (backup.id !== wf.id) throw new Error(`restore_from_backup: backup is for ${backup.id}, not ${wf.id}`);
  wf.nodes = backup.nodes;
  wf.connections = backup.connections;
  return wf;
}
```

- [ ] **Step 2: Export the three live workflows for the dry run** (`.n8n-backups/` is gitignored)

```bash
cd "/c/New Grocery App/grocery-checklist-app" && source /c/hsa-automation/.env && mkdir -p .n8n-backups/purchase-need && for id in CkLhcFEM9Tfc5uxO JoaR6klT950hwSLB UqXlXX5uPWlGvhU6; do curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Origin: http://localhost:5679" "http://localhost:5679/api/v1/workflows/$id" -o ".n8n-backups/purchase-need/$id.json"; echo "$id $(wc -c < .n8n-backups/purchase-need/$id.json) bytes"; done
```
Expected: three files of roughly 15–23 KB each.

- [ ] **Step 3: Dry-run every edit script**

```bash
node scripts/purchase-need/dryrun.mjs .n8n-backups/purchase-need
```
Expected ends with `ALL DRY-RUN CHECKS PASS`: 2 nodes changed in `CkLhcFEM9Tfc5uxO`, 2 in `JoaR6klT950hwSLB`, and 3 in `UqXlXX5uPWlGvhU6`.
If an anchor is not found, **stop**: the live workflow changed since planning. Diff the export against the anchors, then fix the anchor in the edit script. Never loosen the half-patch check.

- [ ] **Step 4: Read-only pre-flight**

The `to_base` and `RecipeMultiplier` columns don't exist yet, hence `--emulate`.
```bash
node scripts/purchase-need/preflight.mjs .n8n-backups/purchase-need "For the week of July 5th to July 11th, 2026" --emulate
```
Expected:
```
A. 120 rows; original 14 columns identical: true
B. recipes [33, 40, 41, 68]; 32 meal rows; 32 rows carry a need; 32 compared field-by-field with the JS producer

PRE-FLIGHT PASS
```
(The row count can differ if catalogue rows were added since. What matters is `identical: true` and `PRE-FLIGHT PASS`.)

- [ ] **Step 5: Protocol dry run against production**

This touches nothing: the no-op DELETE's `id > MAX(id)` scope can't match a row.
```bash
node scripts/purchase-need/verify-live.mjs dry
```
Expected: `PASS  revert path proven: no-op DELETE removed 0+0 rows`, `PASS  every pre-existing row intact`, `PASS  throwaway week empty again`, then `ALL CHECKS PASS (dry)`.

- [ ] **Step 6: Commit**

```bash
git add scripts/purchase-need scripts/n8n-edits/purchase_need_multiplier.mjs scripts/n8n-edits/purchase_need_derivation.mjs scripts/n8n-edits/purchase_need_agent.mjs scripts/n8n-edits/restore_from_backup.mjs
```
Message via `git commit -F`:
```
chore(n8n): purchase-need edit scripts and live-verification tooling

Three idempotent edit scripts (multiplier, derivation, agent) with
half-patch detection, a rollback script, and read-only dry-run and
pre-flight tooling. Dry-run and pre-flight pass against the live
2026-07-05 week: 120 rows unchanged, 32/32 meal needs match the JS.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 2: `formatNeed()`, test-first

**Files:** Modify `src/utils/formatPurchase.js` (append) and `src/utils/formatPurchase.test.js` (import line, then append).

**Interfaces:** Produces `formatNeed(need, multiplier = 1) → string`. `need` is any object carrying `NeedOz`, `NeedTsp`, `NeedCount`, `NeedCountUnit`, `NeedUnspecified` (numbers or DECIMAL strings), such as a `fetch_grocery_items` row or a pre-submit ingredient. It returns `''` when there is nothing to say.

- [ ] **Step 1: Import the function in the test file**

In `src/utils/formatPurchase.test.js`, change line 1:
```js
import { formatPurchase, formatPurchaseBadge, summarizePurchase } from './formatPurchase';
```
to
```js
import { formatNeed, formatPurchase, formatPurchaseBadge, summarizePurchase } from './formatPurchase';
```

- [ ] **Step 2: Append the failing tests to the end of `src/utils/formatPurchase.test.js`**

```js
// ---------------------------------------------------------------------------
// formatNeed — purchase-need slice 1. Two producers feed one renderer:
// `Convert to Shopping List` before submit (JS numbers) and `Pull Grocery
// Staples` after submit (MySQL DECIMALs that the n8n MySQL node returns as
// STRINGS). Every amount below is a need observed in live recipe data on
// 2026-09-18 (recipes 24, 56, 59, 61, 68 and the 2026-07-05 week).
// ---------------------------------------------------------------------------
const need = (fields) => ({
  NeedOz: null, NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: 0, ...fields,
});

describe('formatNeed — weight, in ounces', () => {
  test.each([
    [4, '4 oz'],
    [0.5, '0.5 oz'],
    [12, '12 oz'],
    [16, '1 lb'],
    [20, '1 lb 4 oz'],
    [24, '1 lb 8 oz'],
    [28, '1 lb 12 oz'],
    [32, '2 lbs'],
    [36, '2 lbs 4 oz'],
    [40, '2 lbs 8 oz'],
    [80, '5 lbs'],
  ])('%s oz -> %s', (oz, expected) => {
    expect(formatNeed(need({ NeedOz: oz }))).toBe(expected);
  });
});

describe('formatNeed — volume, in teaspoons', () => {
  test.each([
    [0.125, '0.125 tsp'],
    [0.5, '0.5 tsp'],
    [1.375, '1.375 tsp'],
    [2.75, '2.75 tsp'],
    [3, '1 tbsp'],
    [5.5, '1.83 tbsp'],
    [21, '7 tbsp'],
    [22.5, '7.5 tbsp'],
    [24, '8 tbsp'],
    [48, '1 cup'],
    [72, '1.5 cups'],
    [84, '1.75 cups'],
    [96, '2 cups'],
  ])('%s tsp -> %s', (tsp, expected) => {
    expect(formatNeed(need({ NeedTsp: tsp }))).toBe(expected);
  });
});

describe('formatNeed — counted units', () => {
  test.each([
    [12, 'piece', '12'], // pieces alone read as a bare number: Corn tortillas · 12
    [1, 'piece', '1'],
    [1.5, 'piece', '1.5'],
    [1, 'clove', '1 clove'],
    [10, 'clove', '10 cloves'],
    [2, 'can', '2 cans'],
    [1, 'bunch', '1 bunch'],
    [2, 'bunch', '2 bunches'],
    [0.25, 'bunch', '0.25 bunch'],
    [2, 'cube', '2 cubes'],
    [1, 'fluid ounce', '1 fluid ounce'], // an unconvertible volume keeps its own name
    [2, 'fluid ounce', '2 fluid ounces'],
    [2, 'dozen', '2 dozen'],
  ])('%s %s -> %s', (n, unit, expected) => {
    expect(formatNeed(need({ NeedCount: n, NeedCountUnit: unit }))).toBe(expected);
  });
});

describe('formatNeed — several groups', () => {
  test('pieces are worded once they are not alone', () => {
    expect(formatNeed(need({ NeedOz: 24, NeedCount: 2, NeedCountUnit: 'piece' }))).toBe('1 lb 8 oz + 2 pieces');
  });

  test('weight, then volume, then count — a fixed order', () => {
    expect(formatNeed(need({ NeedTsp: 72, NeedOz: 16 }))).toBe('1 lb + 1.5 cups');
    expect(formatNeed(need({ NeedOz: 28, NeedCount: 1, NeedCountUnit: 'can' }))).toBe('1 lb 12 oz + 1 can');
  });
});

describe('formatNeed — an unspecified amount', () => {
  test('alone, it reads "as needed"', () => {
    expect(formatNeed(need({ NeedUnspecified: 1 }))).toBe('as needed');
    expect(formatNeed(need({ NeedUnspecified: '1' }))).toBe('as needed');
  });

  test('beside a real amount, the amount wins (TB-3b)', () => {
    expect(formatNeed(need({ NeedTsp: 1.375, NeedUnspecified: 1 }))).toBe('1.375 tsp');
  });
});

describe('formatNeed — nothing to say, so the row falls back', () => {
  test.each([
    [undefined],
    [null],
    ['12'],
    [{}],
    [need({})],
    // a staple row: no need keys at all (and a frontend deployed before n8n)
    [{ ItemID: 23, ItemName: 'Bread', QuantitySelected: 1, Unit: null }],
    // the clean-slate branch and every staple row: all five NULL on the wire
    [{ NeedOz: null, NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: null }],
  ])('%j -> ""', (value) => {
    expect(formatNeed(value)).toBe('');
  });

  test('"mixed" counted units are not trusted: the whole row falls back', () => {
    expect(formatNeed(need({ NeedCount: 5, NeedCountUnit: 'mixed' }))).toBe('');
    expect(formatNeed(need({ NeedOz: 4, NeedCount: 5, NeedCountUnit: 'mixed' }))).toBe('');
  });

  test('a zero amount says nothing', () => {
    expect(formatNeed(need({ NeedOz: 0 }))).toBe('');
    expect(formatNeed(need({ NeedOz: '0.0000000', NeedUnspecified: 1 }))).toBe('as needed');
  });
});

describe('formatNeed — the wire shapes', () => {
  // execution 27542: DECIMAL came back as "10.000" (typeof string), and so does
  // SUM(DECIMAL). Printed raw that is "12.0000000" or "0.5000000 tsp".
  test.each([
    [need({ NeedCount: '12.000', NeedCountUnit: 'piece' }), '12'],
    [need({ NeedOz: '4.0000000' }), '4 oz'],
    [need({ NeedTsp: '0.5000000' }), '0.5 tsp'],
    [need({ NeedTsp: '2.7500000' }), '2.75 tsp'],
    [need({ NeedOz: '40.0000000' }), '2 lbs 8 oz'],
  ])('%j -> %s', (value, expected) => {
    expect(formatNeed(value)).toBe(expected);
  });

  test('a need as numbers and the same need as DECIMAL strings read identically', () => {
    const pairs = [
      [need({ NeedTsp: 15.84 }), need({ NeedTsp: '15.8400000' })],
      [need({ NeedCount: 10, NeedCountUnit: 'clove' }), need({ NeedCount: '10.000', NeedCountUnit: 'clove' })],
      [need({ NeedOz: 16, NeedTsp: 72 }), need({ NeedOz: '16.0000000', NeedTsp: '72.0000000' })],
    ];
    for (const [asNumbers, asStrings] of pairs) {
      expect(formatNeed(asStrings)).toBe(formatNeed(asNumbers));
    }
  });

  test('float noise from summing in JS is rounded away', () => {
    expect(formatNeed(need({ NeedTsp: 0.1 + 0.2 }))).toBe('0.3 tsp');
    expect(formatNeed(need({ NeedTsp: 0.33 * 48 }))).toBe('5.28 tbsp');
    expect(formatNeed(need({ NeedOz: 20.8 }))).toBe('1 lb 4.8 oz');
  });
});

describe('formatNeed — the xN multiplier is N times the need (decision 5)', () => {
  test.each([
    [need({ NeedOz: 4 }), 3, '12 oz'],
    [need({ NeedCount: 12, NeedCountUnit: 'piece' }), 3, '36'],
    [need({ NeedTsp: 1.375 }), 2, '2.75 tsp'],
    [need({ NeedOz: 40 }), 2, '5 lbs'],
    [need({ NeedUnspecified: 1 }), 3, 'as needed'],
  ])('%j x%s -> %s', (value, m, expected) => {
    expect(formatNeed(value, m)).toBe(expected);
  });

  test.each([[undefined], [0], [-2], ['x'], [NaN]])('a meaningless multiplier (%s) reads as x1', (m) => {
    expect(formatNeed(need({ NeedOz: 4 }), m)).toBe('4 oz');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
CI=true npx.cmd react-scripts test --testPathPattern="formatPurchase" --watchAll=false
```
Expected: the new tests FAIL with `TypeError: (0 , _formatPurchase.formatNeed) is not a function` (or similar), and the existing formatPurchase tests still pass.

- [ ] **Step 4: Append the implementation to the end of `src/utils/formatPurchase.js`**

```js
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
```

- [ ] **Step 5: Run it and watch it pass**

```bash
CI=true npx.cmd react-scripts test --testPathPattern="formatPurchase" --watchAll=false
```
Expected: every test PASSES, 67 of them new.

- [ ] **Step 6: Lint**

```bash
npm.cmd run lint
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/utils/formatPurchase.js src/utils/formatPurchase.test.js
```
Message:
```
feat(list): formatNeed renders the structured recipe need

One renderer for both producers (the Ingredient Agent before submit,
Pull Grocery Staples after). Coerces the DECIMAL strings the n8n MySQL
node returns, rounds to 3 dp, applies the xN multiplier, and returns ''
when there is nothing to say so every screen falls back to its old text.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 3: Migration (controller, live)

**Files:** Create `migrations/2026-09-18_purchase_need_columns.sql` and `scripts/n8n-workflows/migration-purchase-need-columns.json`.

- [ ] **Step 1: Create both files exactly as below**

`migrations/2026-09-18_purchase_need_columns.sql`
```sql
-- =============================================================================
-- 2026-09-18 -- purchase-need slice 1: units.to_base + WeeklyGroceryList.RecipeMultiplier
-- Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md, section 1
-- Plan: docs/superpowers/plans/2026-09-18-purchase-need-slice-1.md, Task 3
--
-- PURPOSE
--   units.to_base DECIMAL(10,4) NULL
--       Factor to the base unit, seeded with EXACT parity to the only conversion
--       the pipeline has, `Aggregate Ingredients` in the Ingredient Agent:
--         TO_TSP = { teaspoon 1, tablespoon 3, cup 48, pint 96, quart 192 }  (volume)
--         TO_OZ  = { ounce 1, pound 16 }                                    (weight)
--       Every other unit stays NULL and is a COUNTED unit (fluid ounce, gram,
--       piece, clove, ...). Parity beats completeness: the pre-submit screen
--       renders from the JS conversion and every later screen from this column.
--   WeeklyGroceryList.RecipeMultiplier TINYINT UNSIGNED NULL
--       The review screen's xN, stored so the recipe need is DERIVED at read time
--       as need x N (`Pull Grocery Staples`). NULL = x1, so every existing row is
--       already correct.
--
-- EXECUTION
--   Not run from here. The statements below (without these comments -- an n8n
--   query field is a JS template literal) live in the one-shot workflow
--   scripts/n8n-workflows/migration-purchase-need-columns.json, which is created,
--   activated, called ONCE, and deactivated. See migrations/README.md.
--
-- ROLLBACK -- ORDER MATTERS
--   1. FIRST restore these n8n workflows from the .n8n-backups/pre-save/ files
--      written when the purchase_need_* edits were applied (plan Tasks 4-6):
--        CkLhcFEM9Tfc5uxO  Create Grocery List - Meals  (writes RecipeMultiplier)
--        JoaR6klT950hwSLB  Pull Grocery Staples         (reads RecipeMultiplier AND to_base)
--      A query that names a dropped column fails EVERY list load / meal submit.
--   2. THEN:
--        ALTER TABLE WeeklyGroceryList DROP COLUMN RecipeMultiplier;
--        ALTER TABLE units DROP COLUMN to_base;
--   Pre-migration copy of `units`: .n8n-backups/db/2026-09-18-units-before-purchase-need.sql
-- =============================================================================

ALTER TABLE units ADD COLUMN to_base DECIMAL(10,4) NULL DEFAULT NULL;

UPDATE units SET to_base = CASE unit_name
  WHEN 'teaspoon' THEN 1
  WHEN 'tablespoon' THEN 3
  WHEN 'cup' THEN 48
  WHEN 'pint' THEN 96
  WHEN 'quart' THEN 192
  WHEN 'ounce' THEN 1
  WHEN 'pound' THEN 16
  ELSE NULL
END;

ALTER TABLE WeeklyGroceryList ADD COLUMN RecipeMultiplier TINYINT UNSIGNED NULL DEFAULT NULL AFTER Unit;

-- VERIFY (run separately)
--   SHOW COLUMNS FROM units LIKE 'to_base';                       -- decimal(10,4), YES (nullable)
--   SHOW COLUMNS FROM WeeklyGroceryList LIKE 'RecipeMultiplier';  -- tinyint unsigned, YES
--   SELECT unit_name, unit_type, to_base FROM units WHERE to_base IS NOT NULL ORDER BY unit_type, to_base;
--     exactly 7 rows: teaspoon 1, tablespoon 3, cup 48, pint 96, quart 192 (volume);
--                     ounce 1, pound 16 (weight)
--   SELECT COUNT(*) FROM WeeklyGroceryList WHERE RecipeMultiplier IS NOT NULL;  -- 0 right after
--   Full parity: node scripts/purchase-need/check-to-base.mjs
```

`scripts/n8n-workflows/migration-purchase-need-columns.json`
```json
{
 "name": "Migration: purchase-need columns (units.to_base, WeeklyGroceryList.RecipeMultiplier)",
 "nodes": [
  {
   "id": "webhook",
   "name": "Webhook",
   "type": "n8n-nodes-base.webhook",
   "typeVersion": 2,
   "position": [0, 0],
   "webhookId": "b61e4eb3-63dd-4bd5-9a28-3fb0cb3a38ae",
   "parameters": {
    "httpMethod": "GET",
    "path": "migration_purchase_need_columns",
    "responseMode": "responseNode",
    "authentication": "headerAuth",
    "options": {}
   },
   "credentials": { "httpHeaderAuth": { "id": "OzxeppJmnYuJpXbO", "name": "Grocery App API Key" } }
  },
  {
   "id": "add-to-base",
   "name": "Add units.to_base",
   "type": "n8n-nodes-base.mySql",
   "typeVersion": 2.4,
   "position": [220, 0],
   "parameters": {
    "operation": "executeQuery",
    "query": "ALTER TABLE units ADD COLUMN to_base DECIMAL(10,4) NULL DEFAULT NULL",
    "options": {}
   },
   "credentials": { "mySql": { "id": "lqIXlvVVqfE4v7DF", "name": "MySQL account" } }
  },
  {
   "id": "seed-to-base",
   "name": "Seed units.to_base",
   "type": "n8n-nodes-base.mySql",
   "typeVersion": 2.4,
   "position": [440, 0],
   "parameters": {
    "operation": "executeQuery",
    "query": "UPDATE units SET to_base = CASE unit_name WHEN 'teaspoon' THEN 1 WHEN 'tablespoon' THEN 3 WHEN 'cup' THEN 48 WHEN 'pint' THEN 96 WHEN 'quart' THEN 192 WHEN 'ounce' THEN 1 WHEN 'pound' THEN 16 ELSE NULL END",
    "options": {}
   },
   "credentials": { "mySql": { "id": "lqIXlvVVqfE4v7DF", "name": "MySQL account" } }
  },
  {
   "id": "add-multiplier",
   "name": "Add WeeklyGroceryList.RecipeMultiplier",
   "type": "n8n-nodes-base.mySql",
   "typeVersion": 2.4,
   "position": [660, 0],
   "parameters": {
    "operation": "executeQuery",
    "query": "ALTER TABLE WeeklyGroceryList ADD COLUMN RecipeMultiplier TINYINT UNSIGNED NULL DEFAULT NULL AFTER Unit",
    "options": {}
   },
   "credentials": { "mySql": { "id": "lqIXlvVVqfE4v7DF", "name": "MySQL account" } }
  },
  {
   "id": "verify",
   "name": "Verify",
   "type": "n8n-nodes-base.mySql",
   "typeVersion": 2.4,
   "position": [880, 0],
   "parameters": {
    "operation": "executeQuery",
    "query": "SELECT unit_id, unit_name, unit_type, to_base FROM units ORDER BY unit_id",
    "options": {}
   },
   "credentials": { "mySql": { "id": "lqIXlvVVqfE4v7DF", "name": "MySQL account" } }
  },
  {
   "id": "respond",
   "name": "Respond",
   "type": "n8n-nodes-base.respondToWebhook",
   "typeVersion": 1.4,
   "position": [1100, 0],
   "parameters": { "respondWith": "allIncomingItems", "options": {} }
  }
 ],
 "connections": {
  "Webhook": { "main": [[{ "node": "Add units.to_base", "type": "main", "index": 0 }]] },
  "Add units.to_base": { "main": [[{ "node": "Seed units.to_base", "type": "main", "index": 0 }]] },
  "Seed units.to_base": { "main": [[{ "node": "Add WeeklyGroceryList.RecipeMultiplier", "type": "main", "index": 0 }]] },
  "Add WeeklyGroceryList.RecipeMultiplier": { "main": [[{ "node": "Verify", "type": "main", "index": 0 }]] },
  "Verify": { "main": [[{ "node": "Respond", "type": "main", "index": 0 }]] }
 },
 "settings": { "executionOrder": "v1" }
}
```

- [ ] **Step 2: Re-check that neither column exists**

Use the Task 0 Step 4 command. Expected: no column rows. If a column exists, stop.

- [ ] **Step 3: Back up `units`**

```bash
cd "/c/New Grocery App/grocery-checklist-app" && mkdir -p .n8n-backups/db && MSYS_NO_PATHCONV=1 docker exec hsa-mysql bash -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 hsa units 2>/dev/null' > .n8n-backups/db/2026-09-18-units-before-purchase-need.sql && grep -c "INSERT INTO \`units\`" .n8n-backups/db/2026-09-18-units-before-purchase-need.sql && wc -c .n8n-backups/db/2026-09-18-units-before-purchase-need.sql
```
Expected: at least one `INSERT INTO` line, and a non-trivial file size.

- [ ] **Step 4: Create and activate the one-shot workflow**

```bash
node scripts/n8n-wave.mjs create scripts/n8n-workflows/migration-purchase-need-columns.json
```
Expected: `created Migration: purchase-need columns (...) (<ID>) and activated`. **Record `<ID>`.** The command refuses if the webhook has no `webhookId` or if the path is already served.

- [ ] **Step 5: Call it once**

```bash
KEY=$(grep '^REACT_APP_API_KEY=' .env | cut -d= -f2- | tr -d '\r') && curl -s -m 60 -H "X-API-Key: $KEY" "http://localhost:5679/webhook/migration_purchase_need_columns" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(Array.isArray(r)?r.length+" units":s.slice(0,300));for(const u of [].concat(r))if(u.to_base!==null&&u.to_base!==undefined)console.log(u.unit_name,u.unit_type,u.to_base)})'
```
Expected: `23 units`, then exactly 7 converted lines, in unit_id order: `cup volume 48.0000`, `tablespoon volume 3.0000`, `teaspoon volume 1.0000`, `quart volume 192.0000`, `pint volume 96.0000`, `pound weight 16.0000`, `ounce weight 1.0000`.

If this errors partway through, run `SHOW COLUMNS` to see what applied. Use the rollback statements in the SQL file only for the part that applied, and deactivate the workflow before any retry.

- [ ] **Step 6: Deactivate immediately**

```bash
source /c/hsa-automation/.env && curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Origin: http://localhost:5679" "http://localhost:5679/api/v1/workflows/<ID>/deactivate" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log("active:",JSON.parse(s).active))'
```
Expected: `active: false`.

- [ ] **Step 7: Verify the schema and full parity**

```bash
MSYS_NO_PATHCONV=1 docker exec hsa-mysql bash -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" hsa -e "SHOW COLUMNS FROM units LIKE \"to_base\"; SHOW COLUMNS FROM WeeklyGroceryList LIKE \"RecipeMultiplier\"; SELECT COUNT(*) AS with_multiplier FROM WeeklyGroceryList WHERE RecipeMultiplier IS NOT NULL;" 2>&1 | grep -v "Using a password"'
node scripts/purchase-need/check-to-base.mjs
```
Expected:
- `to_base decimal(10,4) YES` and `RecipeMultiplier tinyint unsigned YES`
- `with_multiplier 0`
- `PARITY OK: 23 units agree with TO_TSP / TO_OZ`, with the constants read from the LIVE `Aggregate Ingredients` node

- [ ] **Step 8: Pre-flight against the real columns**

```bash
node scripts/purchase-need/preflight.mjs .n8n-backups/purchase-need "For the week of July 5th to July 11th, 2026"
```
Expected: `PRE-FLIGHT PASS` with the same A/B lines as Task 1 Step 4. This time no emulation is used; the real `units.to_base` and `w2.RecipeMultiplier` are read.

- [ ] **Step 9: The live list still loads** (nothing reads the new columns yet)

```bash
node scripts/purchase-need/verify-live.mjs dry
```
Expected: `ALL CHECKS PASS (dry)`.

- [ ] **Step 10: Commit**

```bash
git add migrations/2026-09-18_purchase_need_columns.sql scripts/n8n-workflows/migration-purchase-need-columns.json
```
Message:
```
feat(db): units.to_base and WeeklyGroceryList.RecipeMultiplier

to_base is seeded with exact parity to Aggregate Ingredients' TO_TSP and
TO_OZ (7 units; every other unit NULL = counted). RecipeMultiplier NULL
means x1, so every existing row is already correct. Run once through a
one-shot n8n workflow, now deactivated. Rollback order is in the file.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 4: Store the multiplier: `Create Grocery List - Meals` (controller, live)

**Files:** none new; this applies `scripts/n8n-edits/purchase_need_multiplier.mjs` to workflow `CkLhcFEM9Tfc5uxO`.

- [ ] **Step 1: Fresh export and dry run** (the live workflow may have changed)

Re-run Task 1 Steps 2–3. Expected: `ALL DRY-RUN CHECKS PASS`.

- [ ] **Step 2: Back up every active workflow**

```bash
node scripts/n8n-wave.mjs export
```
Expected: `exported to .n8n-backups/<timestamp>`.

- [ ] **Step 3: Apply**

```bash
node scripts/n8n-wave.mjs apply meal_ingredients scripts/n8n-edits/purchase_need_multiplier.mjs
```
Expected:
- `pre-save backup: .n8n-backups/pre-save/CkLhcFEM9Tfc5uxO-<ts>.json`. **Record this path**; it's the rollback.
- `cycled CkLhcFEM9Tfc5uxO`
- the node list

- [ ] **Step 4: Live verification**

```bash
node scripts/purchase-need/verify-live.mjs multiplier
```
Expected, all PASS:
- revert path proven
- `2 rows written`
- `Corn tortillas RecipeMultiplier 3`, `Corn tortillas Quantity 36`, `Garlic RecipeMultiplier 1`
- `resubmit at x1 UPDATES RecipeMultiplier to 1`, `resubmit at x1 Quantity 12`
- `every pre-existing row intact`, `throwaway week empty again`
- `ALL CHECKS PASS (multiplier)`

- [ ] **Step 5: Read the node data, not the status**

```bash
source /c/hsa-automation/.env && curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Origin: http://localhost:5679" "http://localhost:5679/api/v1/executions?workflowId=CkLhcFEM9Tfc5uxO&limit=2&includeData=true" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const e of JSON.parse(s).data){const rd=e.data.resultData.runData;console.log(e.id,e.status,"Respond 500 ran:",!!rd["Respond 500"],"insert:",JSON.stringify(rd["Insert Meal Ingredients"]?.[0]?.data?.main?.[0]?.[0]?.json))}})'
```
Expected: both executions show `Respond 500 ran: false` and `insert: {"success":true}`.

- [ ] **If anything fails, roll back at once**

```bash
RESTORE_FROM=<pre-save path from Step 3> node scripts/n8n-wave.mjs apply meal_ingredients scripts/n8n-edits/restore_from_backup.mjs
```
If the workflow is no longer active, run `node scripts/n8n-wave.mjs apply-id CkLhcFEM9Tfc5uxO scripts/n8n-edits/restore_from_backup.mjs` with the same `RESTORE_FROM`. Then go through `superpowers:systematic-debugging` before retrying.

---

### Task 5: Derive the need: `Pull Grocery Staples` (controller, live, highest risk)

**Files:** none new; this applies `scripts/n8n-edits/purchase_need_derivation.mjs` to workflow `JoaR6klT950hwSLB`. **Every Grocery List, Review and In-Store load runs this query.**

- [ ] **Step 1: Fresh export, dry run, and pre-flight against the real columns**

Re-run Task 1 Steps 2–3, then Task 3 Step 8. Expected: `ALL DRY-RUN CHECKS PASS` and `PRE-FLIGHT PASS`.

- [ ] **Step 2: Snapshot before applying** (read-only)

```bash
node scripts/purchase-need/verify-live.mjs snapshot .n8n-backups/purchase-need/snapshot-before-derivation.json
```
Expected: `snapshot 2026-07-05: 120 rows` (or the Task 1 count), a count for the current planning week, `snapshot 2019-01-06: <catalogue size> rows`, and `ALL CHECKS PASS (snapshot)`.

- [ ] **Step 3: Apply**

```bash
node scripts/n8n-wave.mjs apply fetch_grocery_items scripts/n8n-edits/purchase_need_derivation.mjs
```
**Record the `pre-save backup:` path.**

- [ ] **Step 4: Verify** (read-only)

```bash
node scripts/purchase-need/verify-live.mjs derivation .n8n-backups/purchase-need/snapshot-before-derivation.json
```
Expected, all PASS:
- **2026-07-05:** same row count; the 14 original columns unchanged; every row carries all five need keys; only names with a meal row carry a need; every meal row renders a need; no rendered need leaks DECIMAL padding. A `wire types:` line shows the DECIMAL strings; **copy that line into the task report**, because Task 9's fixture must match it.
- **The current week:** a smoke-check line. Corey edits it live.
- **2019-01-06 (clean slate):** same row count, and all need keys NULL.

- [ ] **Step 5: Read the node data**

```bash
source /c/hsa-automation/.env && curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Origin: http://localhost:5679" "http://localhost:5679/api/v1/executions?workflowId=JoaR6klT950hwSLB&limit=3&includeData=true" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const e of JSON.parse(s).data){const rd=e.data.resultData.runData;const pull=rd["Pull Current Week Grocery List"]||rd["Pull Clean Slate Grocery List"];console.log(e.id,e.status,"Respond 500 ran:",!!rd["Respond 500"],"rows:",pull?.[0]?.data?.main?.[0]?.length)}})'
```
Expected: `Respond 500 ran: false`, with row counts matching Step 4. A 1-row `{success:true}` output means the query was mangled (the template-literal trap): **roll back immediately**.

- [ ] **If anything fails, roll back at once**

```bash
RESTORE_FROM=<pre-save path from Step 3> node scripts/n8n-wave.mjs apply fetch_grocery_items scripts/n8n-edits/restore_from_backup.mjs
```
Then use `superpowers:systematic-debugging`.

---

### Task 6: Emit the need before submit: `Ingredient Agent` (controller, live)

**Files:** none new; this applies `scripts/n8n-edits/purchase_need_agent.mjs` to workflow `UqXlXX5uPWlGvhU6`.

- [ ] **Step 1: Fresh export and dry run**

Re-run Task 1 Steps 2–3. Expected: `ALL DRY-RUN CHECKS PASS`.

- [ ] **Step 2: Apply**

```bash
node scripts/n8n-wave.mjs apply get_recipe_items scripts/n8n-edits/purchase_need_agent.mjs
```
**Record the `pre-save backup:` path.**

- [ ] **Step 3: Live verification**

`get_recipe_items` writes `weekly_selections` for the throwaway week; the script reverts them.
```bash
node scripts/purchase-need/verify-live.mjs agent
```
Expected, all PASS:
- all ingredients carry the five need fields, and every one renders
- `garlic: "10 cloves"`, `lime: "5"`, `black pepper: "1.375 tsp"`, `corn tortillas: "12"`, `teriyaki glaze: "1 fluid ounce"`, `fritos or corn chips: "as needed"`, `chicken broth: "1 lb + 1.5 cups"`, `ground turkey: "2 lbs 8 oz"`, `beef bouillon: "2 cubes"`, `chili powder: "7.5 tbsp"`
- `lime purchaseQuantity follows the folded need: "5" (was "3")`
- reverted; pre-existing rows intact; `ALL CHECKS PASS (agent)`

- [ ] **Step 4: Read the node data**

```bash
source /c/hsa-automation/.env && curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Origin: http://localhost:5679" "http://localhost:5679/api/v1/executions?workflowId=UqXlXX5uPWlGvhU6&limit=1&includeData=true" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const e=JSON.parse(s).data[0];const rd=e.data.resultData.runData;const out=rd["Convert to Shopping List"]?.[0]?.data?.main?.[0]?.[0]?.json?.output;console.log(e.id,e.status,"Respond 500 ran:",!!rd["Respond 500"],"ingredients:",out?.ingredients?.length,"sample:",JSON.stringify(out?.ingredients?.find(i=>i.name==="lime")))})'
```
Expected: `Respond 500 ran: false`, 69 ingredients, and the lime sample carrying `"NeedCount":5,"NeedCountUnit":"piece"`.

- [ ] **If anything fails:** `RESTORE_FROM=<path> node scripts/n8n-wave.mjs apply get_recipe_items scripts/n8n-edits/restore_from_backup.mjs`.

---

### Task 7: The post-submit screens (Grocery List, Review, In-Store), test-first

**Files:**
- Modify: `src/components/staples/ItemRow.js`, `src/components/staples/ItemRow.test.js`, `src/components/staples/ReviewScreen.js`, `src/components/staples/ReviewScreen.test.js`, `src/components/instore/ShoppingItems.js`
- Create: `src/components/instore/ShoppingItems.test.js`

**Interfaces:** Consumes `formatNeed(item)` from Task 2.

- [ ] **Step 1: Append failing tests to `src/components/staples/ItemRow.test.js`**

```js
// Purchase-need slice 1: the Grocery List shows what the recipes NEED. The
// package guess ("1 lb package") was wrong for 43-90% of meal rows, and in the
// store the label IS the purchase instruction.
describe('slice 1 — a meal row shows the recipe need', () => {
  const mealRow = (fields) => ({
    ItemID: 1084,
    ItemName: 'Sweet peppers',
    DataSource: 'MealIngredients',
    QuantitySelected: 1,
    Unit: '1 lb package',
    NeedOz: null,
    NeedTsp: null,
    NeedCount: null,
    NeedCountUnit: null,
    NeedUnspecified: 0,
    ...fields,
  });

  test('the need replaces the package guess', () => {
    render(<ItemRow item={mealRow({ NeedOz: '4.0000000' })} checked={false} onToggle={() => {}} />);
    const box = screen.getByRole('checkbox', { name: /Sweet peppers/ });
    expect(box).toHaveAccessibleName(expect.stringContaining('4 oz'));
    expect(box).not.toHaveAccessibleName(expect.stringContaining('lb package'));
  });

  test('a count arriving as a DECIMAL string reads as a clean number', () => {
    render(
      <ItemRow
        item={mealRow({ ItemName: 'Corn tortillas', QuantitySelected: 36, Unit: 'items', NeedCount: '36.000', NeedCountUnit: 'piece' })}
        checked={false}
        onToggle={() => {}}
      />
    );
    const box = screen.getByRole('checkbox', { name: /Corn tortillas/ });
    expect(box).toHaveAccessibleName(expect.stringContaining('36'));
    expect(box).not.toHaveAccessibleName(expect.stringMatching(/36\.0|36 items/));
  });

  test('a row with no need keys (frontend shipped before n8n) keeps its old text', () => {
    render(
      <ItemRow item={{ ItemID: 11, ItemName: 'Ground beef', QuantitySelected: 2, Unit: '1 lb package' }} checked={false} onToggle={() => {}} />
    );
    expect(screen.getByRole('checkbox', { name: /Ground beef/ })).toHaveAccessibleName(
      expect.stringContaining('2 × 1 lb package')
    );
  });

  test('a "mixed" need falls back to the purchase text, never to blank', () => {
    render(
      <ItemRow item={mealRow({ QuantitySelected: 2, NeedCount: '5.000', NeedCountUnit: 'mixed' })} checked={false} onToggle={() => {}} />
    );
    expect(screen.getByRole('checkbox', { name: /Sweet peppers/ })).toHaveAccessibleName(
      expect.stringContaining('2 × 1 lb package')
    );
  });
});
```

- [ ] **Step 2: Add a failing test inside the existing `describe('ReviewScreen', ...)` in `src/components/staples/ReviewScreen.test.js`**

Put it just after the test `'a plain staple at quantity 1 gains no noise'`, before the file's final `});`.
```js
  test('slice 1: a meal row shows its recipe need, not the package guess', () => {
    render(
      <ReviewScreen
        items={[
          { ItemID: 1203, ItemName: 'Sweet peppers', Category: 'Fruit & vegetables',
            DataSource: 'MealIngredients', RecipeNames: 'Beef tacos',
            QuantitySelected: 1, Unit: '1 lb package',
            NeedOz: '4.0000000', NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: 0 },
        ]}
        selected={new Set([1203])}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText('4 oz')).toBeInTheDocument();
    expect(screen.queryByText(/lb package/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Create `src/components/instore/ShoppingItems.test.js`, failing**

```js
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AisleSection } from './ShoppingItems';

// Purchase-need slice 1 — In-Store Mode is where Corey actually shops (385
// check-offs against 3 cart builds), so this pill IS the purchase
// instruction. It read "×1 · 1 lb package" for 4 oz of peppers.
const renderSection = (items) =>
  render(
    <AisleSection
      section={{ name: 'Produce', items, totalCount: items.length, checkedCount: 0 }}
      collapsed={false}
      onToggle={() => {}}
      checkedItems={new Set()}
      couponLookup={{}}
      onItemToggle={() => {}}
    />
  );
const need = { NeedOz: null, NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: 0 };

describe('In-Store quantity pill', () => {
  test('a meal row shows the recipe need, not the package guess', () => {
    renderSection([{ ...need, ItemID: 1084, ItemName: 'Sweet peppers', quantity: 1, Unit: '1 lb package', store_location: null, NeedOz: '4.0000000' }]);
    const row = screen.getByRole('checkbox', { name: /Sweet peppers/ });
    expect(row).toHaveTextContent('4 oz');
    expect(row).not.toHaveTextContent('lb package');
  });

  test('a count need is the bare number of pieces, not a ×N badge', () => {
    renderSection([{ ...need, ItemID: 1158, ItemName: 'Corn tortillas', quantity: 36, Unit: 'items', store_location: null, NeedCount: '36.000', NeedCountUnit: 'piece' }]);
    const row = screen.getByRole('checkbox', { name: /Corn tortillas/ });
    expect(row).toHaveTextContent('36');
    expect(row).not.toHaveTextContent('×36');
    expect(row).not.toHaveTextContent('36 items');
  });

  test('a staple keeps its badge exactly as before', () => {
    renderSection([{ ItemID: 23, ItemName: 'Bread', quantity: 3, Unit: null, store_location: null }]);
    expect(screen.getByRole('checkbox', { name: /Bread/ })).toHaveTextContent('×3');
  });

  test('a meal row with no need keeps the F6 text', () => {
    renderSection([{ ItemID: 1201, ItemName: 'Ground beef', quantity: 2, Unit: '1 lb package', store_location: null }]);
    expect(screen.getByRole('checkbox', { name: /Ground beef/ })).toHaveTextContent('2 × 1 lb package');
  });
});
```

- [ ] **Step 4: Run and watch the new tests fail**

```bash
CI=true node node_modules/react-scripts/bin/react-scripts.js test --testPathPattern="ItemRow|ReviewScreen|ShoppingItems" --watchAll=false
```
Expected FAILs:
- ItemRow `the need replaces the package guess`
- ItemRow `a count arriving as a DECIMAL string...`
- ReviewScreen `slice 1: ...`
- In-Store `a meal row shows the recipe need...`
- In-Store `a count need is the bare number...`

The fallback tests (`no need keys`, `mixed`, the staple, and the F6 text) already PASS. That is the point of the fallback.

- [ ] **Step 5: Implement `src/components/staples/ItemRow.js`**

Replace
```js
import { summarizePurchase } from '../../utils/formatPurchase';
```
with
```js
import { formatNeed, summarizePurchase } from '../../utils/formatPurchase';
```
and replace
```js
  // summarizePurchase returns '' for a bare 1, so plain staples stay clean.
  const purchase = summarizePurchase(item);
```
with
```js
  // summarizePurchase returns '' for a bare 1, so plain staples stay clean.
  // Purchase-need slice 1: a row with a recipe need shows THE NEED ("4 oz"),
  // not the package guess ("1 lb package"). formatNeed is '' for staples and
  // one-offs, which keep F8's text.
  const purchase = formatNeed(item) || summarizePurchase(item);
```

- [ ] **Step 6: Implement `src/components/staples/ReviewScreen.js`**

Replace
```js
import { summarizePurchase } from '../../utils/formatPurchase';
```
with
```js
import { formatNeed, summarizePurchase } from '../../utils/formatPurchase';
```
and replace
```js
  // the same shared formatter — otherwise the two screens drift again.
  const purchase = summarizePurchase(item);
```
with
```js
  // the same shared formatter — otherwise the two screens drift again. Slice 1:
  // the recipe need first, exactly as ItemRow does.
  const purchase = formatNeed(item) || summarizePurchase(item);
```

- [ ] **Step 7: Implement `src/components/instore/ShoppingItems.js`**

Replace
```js
import { formatPurchaseBadge } from "../../utils/formatPurchase";
```
with
```js
import { formatNeed, formatPurchaseBadge } from "../../utils/formatPurchase";
```
Replace
```js
const QuantityPill = React.memo(({ quantity, unit, dim }) => {
  // Shared formatter: this pill used to glue a bare count to a unit that can
  // itself start with a number, printing "2 1 lb package" in the aisle (F6).
  const label = formatPurchaseBadge(quantity || 1, unit);
```
with
```js
const QuantityPill = React.memo(({ quantity, unit, need, dim }) => {
  // Shared formatter: this pill used to glue a bare count to a unit that can
  // itself start with a number, printing "2 1 lb package" in the aisle (F6).
  // Slice 1: a meal row shows the recipe NEED — in the aisle the pill IS the
  // purchase instruction. Staples and one-offs keep their badge.
  const label = need || formatPurchaseBadge(quantity || 1, unit);
```
Replace
```js
      <QuantityPill quantity={item.quantity} unit={item.Unit} dim={isChecked} />
```
with
```js
      <QuantityPill quantity={item.quantity} unit={item.Unit} need={formatNeed(item)} dim={isChecked} />
```

- [ ] **Step 8: Run and watch everything pass**

Re-run the Step 4 command. Expected: all PASS.

- [ ] **Step 9: Lint, then commit**

```bash
npm.cmd run lint
git add src/components/staples/ItemRow.js src/components/staples/ItemRow.test.js src/components/staples/ReviewScreen.js src/components/staples/ReviewScreen.test.js src/components/instore/ShoppingItems.js src/components/instore/ShoppingItems.test.js
```
Message:
```
feat(list): Grocery List, Review and In-Store show the recipe need

A meal row now reads "4 oz", not "1 lb package". Staples, one-offs and any
row without a derived need fall back to the text they always showed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 8: The pre-submit meal screen (`RecipeIngredients.js`), test-first

**Files:** Modify `src/components/RecipeIngredients.js` and `src/components/RecipeIngredients.test.js`.

**Interfaces:** Consumes `formatNeed(item, multiplier)` from Task 2. The pre-submit ingredient carries the five fields that `Convert to Shopping List` emits (Task 6).

- [ ] **Step 1: Append failing tests to `src/components/RecipeIngredients.test.js`**

```js
// Purchase-need slice 1: the pre-submit screen shows the recipe NEED, from the
// structured fields `Convert to Shopping List` emits (JS numbers here). Both
// items sit in one category so they render in one tab.
const needListData = [
  {
    output: {
      ingredients: [
        {
          name: 'sweet peppers',
          category: 'grains',
          purchaseQuantity: '1 lb',
          purchaseUnit: '1 lb package',
          recipeNeeds: '4 oz',
          usedInRecipes: ['Test Recipe'],
          NeedOz: 4, NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: 0,
        },
        {
          name: 'corn tortillas',
          category: 'grains',
          purchaseQuantity: '12',
          purchaseUnit: 'items',
          recipeNeeds: '12 pieces',
          usedInRecipes: ['Test Recipe'],
          NeedOz: null, NeedTsp: null, NeedCount: 12, NeedCountUnit: 'piece', NeedUnspecified: 0,
        },
      ],
    },
  },
];

const renderNeedScreen = () =>
  render(
    <RecipeIngredients
      selectedMeals={selectedMeals}
      groceryListData={needListData}
      onNavigate={() => {}}
      debugMode={false}
    />,
  );

describe('RecipeIngredients — slice 1 shows the recipe need', () => {
  test('the selection list reads "Need: 4 oz", not the package guess', async () => {
    renderNeedScreen();
    expect(await screen.findByText('sweet peppers')).toBeInTheDocument();
    expect(screen.getByText('4 oz')).toBeInTheDocument();
    expect(screen.getAllByText(/^Need:/)).toHaveLength(2);
    expect(screen.queryByText(/Buy:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/lb package/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recipe needs:/)).not.toBeInTheDocument();
  });

  test('x3 reads as three times the need', async () => {
    renderNeedScreen();
    expect(await screen.findByText('sweet peppers')).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '3' } });
    expect(screen.getByText('= 12 oz')).toBeInTheDocument();
    expect(screen.queryByText(/lb package/)).not.toBeInTheDocument();
  });

  test('the confirmation list shows the need times the multiplier', async () => {
    renderNeedScreen();
    expect(await screen.findByText('sweet peppers')).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Review List/i }));
    expect(await screen.findByText(/Recipe Grocery List/i)).toBeInTheDocument();
    expect(screen.getByText('12 oz')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recipe needs:/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```bash
CI=true npx.cmd react-scripts test --testPathPattern="RecipeIngredients" --watchAll=false
```
Expected: the 3 new tests FAIL. The 6 existing tests PASS, since their data carries no need fields and so exercises the fallback.

- [ ] **Step 3: Implement the import**

In `src/components/RecipeIngredients.js`, replace
```js
import { formatPurchase } from '../utils/formatPurchase';
```
with
```js
import { formatNeed, formatPurchase } from '../utils/formatPurchase';
```

- [ ] **Step 4: Implement the transform, which carries the need and fixes the `Notes` string**

Replace
```js
        webhookResponse[0].output.ingredients.forEach(ingredient => {
          transformedIngredients.push({
```
with
```js
        webhookResponse[0].output.ingredients.forEach(ingredient => {
          // The structured recipe need (purchase-need slice 1), emitted by
          // `Convert to Shopping List`. An older Ingredient Agent sends none:
          // formatNeed() of absent fields is '' and every render site below
          // falls back to the purchase text it always showed.
          const need = {
            NeedOz: ingredient.NeedOz,
            NeedTsp: ingredient.NeedTsp,
            NeedCount: ingredient.NeedCount,
            NeedCountUnit: ingredient.NeedCountUnit,
            NeedUnspecified: ingredient.NeedUnspecified,
          };
          const needText = formatNeed(need);
          transformedIngredients.push({
```
Then replace
```js
            RecipeNeeds: ingredient.recipeNeeds || '',
            FromMeals: ingredient.usedInRecipes || selectedMeals.map(m => m.name),
            Notes: ingredient.recipeNeeds ? `Recipe needs: ${ingredient.recipeNeeds}` : ''
          });
```
with
```js
            RecipeNeeds: ingredient.recipeNeeds || '',
            ...need,
            FromMeals: ingredient.usedInRecipes || selectedMeals.map(m => m.name),
            Notes: needText
              ? `Recipe needs: ${needText}`
              : (ingredient.recipeNeeds ? `Recipe needs: ${ingredient.recipeNeeds}` : '')
          });
```

- [ ] **Step 5: Implement the confirmation list**

The block below is exactly the original, including the literal `×` escape in the source. Replace
```js
                {items.map((item, index) => (
                  <div
                    key={item.ItemID}
                    className={`p-4 flex items-center justify-between ${
                      index !== items.length - 1 ? 'border-b border-default' : ''
                    } hover:bg-background transition-colors`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-heading mb-1">
                        {item.ItemName}
                      </div>
                      {item.RecipeNeeds && (
                        <div className="text-sm text-body">
                          Recipe needs: {item.RecipeNeeds}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-primary bg-primary-light px-3 py-1 rounded-full">
                        {item.quantity > 1
                          ? `${item.quantity} × ${formatPurchase(item.QuantitySelected, item.Unit)}`
                          : formatPurchase(item.QuantitySelected, item.Unit)}
                      </span>
                    </div>
                  </div>
                ))}
```
with
```js
                {items.map((item, index) => {
                  // Slice 1: the need times the xN multiplier ("12 oz"), or ''
                  // when the agent sent none — then the old purchase text.
                  const need = formatNeed(item, item.quantity);
                  return (
                  <div
                    key={item.ItemID}
                    className={`p-4 flex items-center justify-between ${
                      index !== items.length - 1 ? 'border-b border-default' : ''
                    } hover:bg-background transition-colors`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-heading mb-1">
                        {item.ItemName}
                      </div>
                      {!need && item.RecipeNeeds && (
                        <div className="text-sm text-body">
                          Recipe needs: {item.RecipeNeeds}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-primary bg-primary-light px-3 py-1 rounded-full">
                        {need || (item.quantity > 1
                          ? `${item.quantity} × ${formatPurchase(item.QuantitySelected, item.Unit)}`
                          : formatPurchase(item.QuantitySelected, item.Unit))}
                      </span>
                    </div>
                  </div>
                  );
                })}
```

- [ ] **Step 6: Implement the selection list and the ×N hint**

Replace
```js
                const quantity = itemQuantities.get(item.ItemID.toString()) || 1;

                return (
```
with
```js
                const quantity = itemQuantities.get(item.ItemID.toString()) || 1;
                // Slice 1: the recipe NEED ("4 oz"), not the package guess ("1 lb
                // package"). '' when the agent sent none — fall back below.
                const need = formatNeed(item);

                return (
```
Replace
```js
                            <div className="mt-1 space-y-1">
                              <div className="text-sm text-primary font-medium">
                                Buy: <span className="text-primary">{formatPurchase(item.QuantitySelected, item.Unit)}</span>
                              </div>
                              {item.RecipeNeeds && (
                                <div className="text-xs text-body">
                                  Recipe needs: <span className="font-medium">{item.RecipeNeeds}</span>
                                </div>
                              )}
                            </div>
```
with
```js
                            <div className="mt-1 space-y-1">
                              {need ? (
                                <div className="text-sm text-primary font-medium">
                                  Need: <span className="text-primary">{need}</span>
                                </div>
                              ) : (
                                <>
                                  <div className="text-sm text-primary font-medium">
                                    Buy: <span className="text-primary">{formatPurchase(item.QuantitySelected, item.Unit)}</span>
                                  </div>
                                  {item.RecipeNeeds && (
                                    <div className="text-xs text-body">
                                      Recipe needs: <span className="font-medium">{item.RecipeNeeds}</span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
```
Replace
```js
                                {quantity > 1 ? `= ${quantity} × ${formatPurchase(item.QuantitySelected, item.Unit)}` : ""}
```
with
```js
                                {quantity > 1
                                  ? `= ${need ? formatNeed(item, quantity) : `${quantity} × ${formatPurchase(item.QuantitySelected, item.Unit)}`}`
                                  : ""}
```

- [ ] **Step 7: Run and watch everything pass**

Re-run the Step 2 command. Expected: all 9 PASS.

- [ ] **Step 8: Lint, then commit**

```bash
npm.cmd run lint
git add src/components/RecipeIngredients.js src/components/RecipeIngredients.test.js
```
Message:
```
feat(meals): the pre-submit screen shows the recipe need

"Need: 4 oz" replaces "Buy: 1 lb package"; x3 reads "= 12 oz" and the
confirmation list "12 oz" (xN is N times the need). Rows without need
fields keep the old Buy / Recipe needs text.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 9: e2e fixture and specs

**Files:** Modify `e2e/fixtures/n8n/fetch_grocery_items.json`, `e2e/plan.spec.js` and `e2e/shop.spec.js`.

- [ ] **Step 1: Give the fixture the real wire shape**

Write this to `<scratchpad>/fixture-need-fields.mjs` with the Write tool, then run `node <scratchpad>/fixture-need-fields.mjs` from the repo root. If Task 5 Step 4's `wire types:` line showed different types (a number instead of a DECIMAL string, say), use those types instead and note it in the task report.
```js
// One-off: add the purchase-need fields to the fetch_grocery_items fixture with
// the wire shapes Pull Grocery Staples returns: DECIMAL columns as STRINGS,
// NeedUnspecified as a number, all five NULL on staple / one-off / unresolved rows.
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'e2e/fixtures/n8n/fetch_grocery_items.json';
const rows = JSON.parse(readFileSync(path, 'utf8'));
const NEED = ['NeedOz', 'NeedTsp', 'NeedCount', 'NeedCountUnit', 'NeedUnspecified'];
if (rows.some((r) => 'NeedOz' in r)) throw new Error('fixture already carries need fields');
for (const r of rows) for (const k of NEED) r[k] = null;

const sriracha = rows.find((r) => r.ItemName === 'Sriracha');
const fishSauce = rows.find((r) => r.ItemName === 'Fish sauce');
if (!sriracha || sriracha.DataSource !== 'MealIngredients' || !fishSauce) {
  throw new Error('expected the Sriracha and Fish sauce MealIngredients rows');
}
// A meal row the derivation resolved: 4 oz, as the DECIMAL string MySQL sends.
Object.assign(sriracha, { NeedOz: '4.0000000', NeedUnspecified: 0 });
// Fish sauce stays need-less (a row the derivation cannot resolve). A need-less
// row with a digit-leading Unit keeps F6's "2 × 1 lb package" guard covered.
rows.push({
  ItemID: 953021, ItemName: 'Harissa', Category: 'Condiments & sauces', Store: 'HEB',
  GroceryStoreSection: 'Condiments & sauces', Type: 'Basic', IsActive: 1,
  DataSource: 'MealIngredients', QuantitySelected: 2, IsSelected: 0, Unit: '1 lb package',
  store_location: 'Aisle 7', RecipeNames: null, IsOptional: 0,
  NeedOz: null, NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: null,
});
writeFileSync(path, JSON.stringify(rows, null, 1) + '\n');
console.log(`fixture: ${rows.length} rows; Sriracha NeedOz ${sriracha.NeedOz}; Harissa appended`);
```
Expected: `fixture: 43 rows; Sriracha NeedOz 4.0000000; Harissa appended`.

- [ ] **Step 2: Update `e2e/plan.spec.js`'s row picks**

Replace
```js
// F6/F8: a meal row whose Unit starts with a digit, to prove the shared
// formatter puts a '×' between the count and the unit instead of printing
// "2 1 lb package", and that the quantity reaches the list screen at all.
const digitUnit = items.find(
  (i) => i.DataSource === 'MealIngredients' && /^\d/.test(String(i.Unit || ''))
);
const wordUnit = items.find(
  (i) => i.DataSource === 'MealIngredients' && /^[a-z]/i.test(String(i.Unit || ''))
);

if (!selected || !unselected || !oneoff || !digitUnit || !wordUnit) {
  throw new Error(
    'plan.spec fixture assumption broken after re-record: need a selected staple, an unselected staple in the same category, a one-off row, a MealIngredients row whose Unit starts with a digit, and one whose Unit starts with a letter, in e2e/fixtures/n8n/fetch_grocery_items.json'
  );
}
```
with
```js
// Purchase-need slice 1: a meal row with a derived need shows THE NEED; one
// without (a week before 2026-04-26, F7's 900000 band) keeps its purchase text.
const hasNeed = (i) =>
  ['NeedOz', 'NeedTsp', 'NeedCount'].some((k) => i[k] !== null && i[k] !== undefined) ||
  Number(i.NeedUnspecified) === 1;
const needRow = items.find(
  (i) => i.DataSource === 'MealIngredients' && i.NeedOz !== null && i.NeedOz !== undefined
);
// F6/F8: a need-less meal row whose Unit starts with a digit, to prove the
// shared formatter puts a '×' between the count and the unit instead of
// printing "2 1 lb package", and that the quantity reaches the list at all.
const digitUnit = items.find(
  (i) => i.DataSource === 'MealIngredients' && !hasNeed(i) && /^\d/.test(String(i.Unit || ''))
);
const wordUnit = items.find(
  (i) => i.DataSource === 'MealIngredients' && !hasNeed(i) && /^[a-z]/i.test(String(i.Unit || ''))
);

if (!selected || !unselected || !oneoff || !digitUnit || !wordUnit || !needRow) {
  throw new Error(
    'plan.spec fixture assumption broken after re-record: need a selected staple, an unselected staple in the same category, a one-off row, need-less MealIngredients rows whose Unit starts with a digit and with a letter, and a MealIngredients row carrying NeedOz, in e2e/fixtures/n8n/fetch_grocery_items.json'
  );
}
```

- [ ] **Step 3: Add the need test to `e2e/plan.spec.js`**

Insert it immediately before `  test('toggling a staple posts selection_check with the full row', async ({ page, backend }) => {`.
```js
  // Purchase-need slice 1: the list shows what the recipe NEEDS. The fixture
  // carries NeedOz as the DECIMAL STRING the n8n MySQL node really returns
  // ("4.0000000") — a number here would hide the "4.0000000 oz" trap.
  test('a meal row shows its recipe need, not the package guess', async ({ page, backend }) => {
    await open(page, 'plan');
    await expect(main(page).getByText('Grocery Staples')).toBeVisible();
    const box = main(page).getByRole('checkbox', { name: new RegExp(`^${needRow.ItemName}`) });
    await expect(box).toBeVisible();
    await expect(box).toHaveAccessibleName(/4 oz/);
    await expect(box).not.toHaveAccessibleName(/lb package|4\.0000000/);
  });

```

- [ ] **Step 4: Add the In-Store test to `e2e/shop.spec.js`**

Insert it immediately before `  test('the ⋯ menu opens Feedback', async ({ page, backend }) => {`.
```js
  // Purchase-need slice 1 — In-Store Mode is how Corey actually shops, so the
  // pill IS the instruction. Injected rather than added to the shared fixture,
  // so the other Shop tests keep their exact counts.
  test('a meal row pill shows the recipe need, not the package guess', async ({ page, backend }) => {
    const needRow = {
      ItemID: 1196, ItemName: 'Ground turkey', Category: 'Meat & seafood', Store: 'HEB',
      GroceryStoreSection: 'Meat & seafood', Type: 'Basic', IsActive: 1,
      DataSource: 'MealIngredients', QuantitySelected: 3, IsSelected: 1, Unit: '1 lb package',
      store_location: null, RecipeNames: 'Classic Turkey Taco Night with All the Fixings', IsOptional: 0,
      NeedOz: '40.0000000', NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: 0,
    };
    backend.set('fetch_grocery_items', { body: [...items, needRow], times: 3 });
    await seedIfNeeded(backend);
    await open(page, 'shop');
    const row = page.getByRole('checkbox', { name: nameRe(needRow.ItemName) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('2 lbs 8 oz');
    await expect(row).not.toContainText('lb package');
  });

```

- [ ] **Step 5: Prove the new e2e tests fail without the fix**

Free port 3000 first:
```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```
Then:
Task 7's changes are committed by now, so swap in `main`'s versions of the two render sites for one build, then restore them:
```bash
git checkout main -- src/components/staples/ItemRow.js src/components/instore/ShoppingItems.js
npx.cmd playwright test e2e/plan.spec.js e2e/shop.spec.js --reporter=line -g "recipe need"
git checkout HEAD -- src/components/staples/ItemRow.js src/components/instore/ShoppingItems.js
git status --short src/components
```
Expected: the 2 new tests FAIL on both projects, 4 failures in all, because the pill and row show the package text. Afterwards `git status` shows nothing under `src/components`.

- [ ] **Step 6: Run them with the fix**

Free port 3000 again, then:
```bash
npx.cmd playwright test e2e/plan.spec.js e2e/shop.spec.js --reporter=line
```
Expected: all PASS on both projects.

- [ ] **Step 7: Run the full e2e suite**

Free port 3000 again, then:
```bash
npm.cmd run test:e2e
```
Expected: `132 passed` (128 + 2 new tests × 2 projects), `2 skipped`. Record the exact numbers.

- [ ] **Step 8: Commit**

```bash
git add e2e/fixtures/n8n/fetch_grocery_items.json e2e/plan.spec.js e2e/shop.spec.js
```
Message:
```
test(e2e): the list and In-Store pill show the recipe need

The fixture now carries the five need fields in their real wire shape
(DECIMAL strings, NULL on staples); F6/F8's digit-unit guard moves to a
need-less meal row so the fallback stays covered.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 10: The spec's slice-1 verification, live (controller)

- [ ] **Step 1: Parity check, again**

```bash
node scripts/purchase-need/check-to-base.mjs
```
Expected: `PARITY OK: 23 units agree with TO_TSP / TO_OZ`. The constants are read from the now-patched live node; they must be untouched.

- [ ] **Step 2: Full verification on the throwaway week**

```bash
node scripts/purchase-need/verify-live.mjs full
```
Expected, all PASS:
- **The submit:**
  - `every submitted ingredient stored: 69/69`
  - `RecipeMultiplier 3/2/2 stored` for corn tortillas, ground turkey and black pepper
  - `every other row stored RecipeMultiplier 1`
  - `lime stored Quantity equals the folded need 5`
- **Parity:**
  - `derived need == pre-submit need x multiplier, field by field, for all 69`
  - `rendered text identical before and after submit for all 69`
- **Specific rows:**
  - `count row x3 renders "36"`
  - `sub-3-tsp row x2 renders "2.75 tsp"`
  - `black pepper came through the GroceryItems half (CW/ATTR): ItemID 348`
  - `garlic (... ATTR2) ... "10 cloves"`
  - `lime renders "5"`
  - `"1 fluid ounce"`, `"5 lbs"`, `"as needed"`
- **Removal:**
  - `after removing recipe 56, garlic recalculates to "6 cloves"`
  - `a recipe-56-only row was cleaned up`
- **Resubmit:**
  - `resubmit x1: corn tortillas RecipeMultiplier 3 -> 1`, `Quantity 36 -> 12`, and it renders `"12"`
- **Revert:**
  - `every pre-existing row intact`, `throwaway week empty again`
  - `ALL CHECKS PASS (full)`

Paste the complete output into the Task 12 report.

- [ ] **Step 3: If any check fails**

The script has already reverted in `finally`. Confirm that with `node scripts/purchase-need/verify-live.mjs dry`, then use `superpowers:systematic-debugging`. **Reproduce before changing anything**, and check your own payload first: a wrong week string or item shape has looked like a production bug before.

---

### Task 11: Whole-branch review (opus)

- [ ] **Step 1:** Use `superpowers:requesting-code-review` on `git diff main...feat/purchase-need-slice-1`.
  - Hand the reviewer this plan, the spec, and the Task 3–6 and Task 10 outputs.
  - Ask specifically about: the SQL under `ONLY_FULL_GROUP_BY`; both UNION halves; the fold rule's parity between SQL and JS; `formatNeed()`'s coercion; every render site's fallback; and the fixture's wire shape.
- [ ] **Step 2:** Handle findings with `superpowers:receiving-code-review`. **Verify each claim before acting on it.**
  - Fix frontend findings test-first.
  - Any n8n change goes through a new edit script plus dry run, pre-flight, apply and the matching `verify-live` phase.
  - Re-run the affected task's verification.

---

### Task 12: Gates, merge, deploy, verify (controller)

- [ ] **Step 1: Gates on the branch**

```bash
npm.cmd run lint
CI=true npx.cmd react-scripts test --watchAll=false 2>&1 | tail -6
```
Free port 3000, then run `npm.cmd run test:e2e`.

Expected:
- lint clean
- Jest at least `531 + 67 + 4 + 1 + 4 + 3 = 610` tests, in 54 suites
- e2e at least 132 passed, 2 skipped

Record the exact numbers.

- [ ] **Step 2: Merge and push**

```bash
git checkout main && git pull --ff-only
git merge --no-ff feat/purchase-need-slice-1 -F <message file>
git push origin main
```
Message:
```
Merge purchase-need slice 1: show the recipe need

The Grocery List, Review, In-Store Mode and the pre-submit meal screen
show what the recipes need ("4 oz", "10 cloves", "36") instead of the
package guess ("1 lb package"). The need is derived at read time from
a stored xN multiplier (units.to_base + WeeklyGroceryList.RecipeMultiplier;
Pull Grocery Staples, Ingredient Agent and Create Grocery List - Meals
already live and verified on a throwaway week).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

- [ ] **Step 3: Netlify**

Load the Netlify MCP tools via ToolSearch (`netlify-project-services-reader`, `netlify-deploy-services-reader`); `selectSchema` takes an object.
- Call `get-project` with `siteId: 21615b0f-a4e5-451d-8495-6365c5fff8c1` for the current deploy id.
- Call `get-deploy-for-site` for that id.

Expected: `commit_ref` equals the merge commit and `state: ready`. Wait about 30 s and re-check once if it is still building.

- [ ] **Step 4: Check the artefact, not the hash**

```bash
B=$(curl -s "https://grocery-checklist-app.netlify.app/?cachebust=$(date +%s)" | grep -o 'static/js/main\.[a-f0-9]*\.js' | head -1) && echo "$B" && curl -s "https://grocery-checklist-app.netlify.app/$B" | grep -o 'NeedCountUnit\|NeedUnspecified' | sort | uniq -c
```
Expected:
- a new `main.<hash>.js` (not `main.0372eb6b.js`)
- `NeedCountUnit` and `NeedUnspecified` each present. Both are new in this slice; `as needed` was already in the bundle, so it proves nothing.

---

### Task 13: Memory, then checkpoint 2

- [ ] **Step 1: Update memory**
  - `purchase_need_design.md`: slice 1 SHIPPED, the merge commit, the new gates, verification week 2026-05-17 and why, the Decision B numbers, and that slice 2 needs Corey's go.
  - `MEMORY.md`: the index line, and the gates baseline in the hardening line.
  - Any new trap the execution hit.
- [ ] **Step 2: Report to Corey and STOP.**
  - Include what shipped and the live verification output.
  - Include the gates, and the Netlify `commit_ref` and bundle.
  - **Do not start slice 2 without his explicit go-ahead.**

---

## Self-review against the spec

| spec requirement | task |
|---|---|
| `RecipeMultiplier TINYINT UNSIGNED NULL`, NULL = ×1 | 3 |
| `to_base DECIMAL(10,4)`, exact parity with `TO_TSP`/`TO_OZ`; the parity check | 3 (Steps 5, 7), 10 (Step 1) |
| `Transform for DB Input` emits `RecipeMultiplier`; INSERT list **and** ON DUPLICATE KEY UPDATE | 1 (script), 4 |
| the need derived in **both** ATTR and ATTR2, `COALESCE(MAX(w2.RecipeMultiplier), 1)` | 1 (script, pre-flight), 5 |
| counted-unit set, fold rule, mixed guard, the same on both producers | 1 (both scripts; pre-flight B), 6, 10 |
| the clean-slate branch returns the need columns as NULL | 1, 5 (Step 4, 2019 week) |
| `Fetch Recipe Ingredients` selects `u.unit_type`; the JS treats `other` as unspecified | 1 (agent script), 6 |
| `Convert to Shopping List` emits the structured need; the count branch consumes the folded need | 1, 6 (lime "5"), 10 |
| `formatNeed()`: `Number()`, 3 dp, rules, `''` for absent fields (a unit test) | 2 |
| render sites: ItemRow, ReviewRow, In-Store pill, `RecipeIngredients` `:404-405`, `:761`, `:782`, `:193` | 7, 8 |
| render condition = `formatNeed()` text; fallback never blank | 2, 7, 8 (fallback tests) |
| e2e fixture carries need fields, with assertions (`4 oz`, not `1 lb package`) | 9 |
| verification: recipe 59, the garlic pair, a lime fold, tortillas ×3, stored multiplier, parity in numbers **and text**, a count row and a sub-3-tsp row, pita/lime `Quantity`, removal recalculates, resubmit updates | 10 (`full`) |
| deploy order migration → n8n → frontend; Netlify `commit_ref` and bundle | 3–6 before 12 |
| unchanged: the Cart Builder, and a checked staple shadowing a recipe ingredient | no task touches `cart/`, `HebCart.js`, or `Transform`'s `droppedAsStaple` |
