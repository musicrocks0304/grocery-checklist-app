# Create Recipe Workflow — Findings & Remediation Plan

> **Status: FINDINGS + PLAN ONLY. Nothing has been fixed.** Every finding below was
> reproduced against the live production system on 2026-09-17. All test data written
> during the investigation has been reverted; the database is at baseline.

**Investigator note:** this is the companion to
`2026-09-17-meal-planning-workflow-findings.md`, which covered the **AI Planner** path.
This one walks the **Create Recipe** agent through the identical chain — Meal Planning →
Create Recipe → add recipes → Generate Grocery List → review → add to the main grocery
list — from the persona of the shopper who will stand in an H-E-B aisle holding the result.

**What was driven:** one invented recipe, *"Soy-Ginger Roasted Chicken Thighs with
Broccolini & Sesame Rice"* (16 ingredients), created from the prompt *"Something cozy for a
weeknight — roasted chicken thighs with vegetables, nothing fancy."* It was saved, added to
week `2026-09-20`, combined with the week's existing meal (recipe 3, Cheesy Beef
Enchiladas), generated, reviewed, and committed to the main list. Then reverted.

---

## Executive summary

**It feels good.** Three genuinely original recipes arrived in ~30 seconds, tailored to the
household (kid portions, LDL-conscious protein choices) without being asked. The 4-step
wizard (Describe → Build → Preview → Save) is clear, the save confirmation is concrete
("Recipe ID: #71 • 16 ingredients • 9 steps • 16 tags"), and the invented recipe drops into
the Selected Meals panel indistinguishable from a Blue Apron import.

**Fidelity from the agent to the database is excellent.** All 16 ingredients were stored
with correct quantities, units, preparation notes, and optional flags. The unit maths is
right again: `0.33 cup` soy sauce surfaced as `5.28 tbsp`, `0.25 cup` sesame seeds as
`4 tbsp`, `1.5 lb` chicken as `1 lb 8 oz`, and garlic merged correctly across both recipes.

**The damage happens after the agent is done.** Four defects, and the most serious is not
specific to Create Recipe at all — it was simply invisible until an agent that marks
"adults only" extras as *optional* walked through it:

1. **Optional ingredients are bought but never shown** (TB-4). 22 rows were stored and will
   be spent by the HEB Cart Builder; the Grocery List screen shows **18**, and labels it
   "18/18".
2. A NULL unit renders as the literal string **`2 s`** (TB-2).
3. A hardcoded SQL exclusion list silently removes olive oil, salt and black pepper (TB-3).
4. The Create Recipe path cannot generate a grocery list without switching tabs (TB-1).

### Verified-correct (do not "fix" these)

- **F7's `ItemID = 1000` collapse did NOT fire, and the hypothesis that it would was
  wrong.** All 16 invented ingredient names already existed in the `ingredients`
  catalogue — `broccolini`(61), `scallions`(631), `sriracha`(537), `rice vinegar`(88),
  `sesame oil`(78), `kosher salt`(275), `fresh ginger`(632) and the rest. The catalogue
  holds 291 rows and the agent generates conventional names, so it lands on them. `SELECT
  COUNT(*) FROM WeeklyGroceryList WHERE ItemID = 1000` is still **0** across all history.
  Zero new `ingredients` rows were created by this walk.
- **FB#39 works.** "Add to This Week's Meals" wrote `weekly_selections` row 205 for the
  correct week.
- **Save fidelity is exact.** 16 of 16 `recipe_ingredients` rows, with `preparation_notes`
  ("bone-in, skin removed") and `optional` flags preserved.
- **F1's staple filter did not misfire on this path.** No ingredient collided with a staple
  actually checked for the week, and nothing was dropped for that reason.
- **F6 is unchanged** — `Buy: 1 small jar small jar` appeared verbatim, as expected.

---

## Reproductions

**Setup:** week `2026-09-20`. The app has no week picker — every screen targets the current
planning week — so the test necessarily ran on the live week, with `MAX(id)` watermarks
taken first and the revert path proven as a no-op before anything was written.

**Ground truth — the 16 ingredients the agent invented:**

| # | ingredient | qty | unit | optional |
|---|---|---|---|---|
| 1 | chicken thighs | 1.5 | pound | |
| 2 | soy sauce | 0.33 | cup | |
| 3 | fresh ginger | 2 | tablespoon | |
| 4 | rice vinegar | 2 | tablespoon | |
| 5 | honey | 1 | tablespoon | |
| 6 | garlic | 2 | clove | |
| 7 | broccolini | 1 | pound | |
| 8 | **carrots** | 2 | **NULL** | |
| 9 | **olive oil** | 2 | tablespoon | |
| 10 | **black pepper** | 0.25 | teaspoon | |
| 11 | kosher salt | 0.5 | teaspoon | |
| 12 | brown rice | 2 | cup | |
| 13 | **sesame seeds** | 0.25 | cup | **yes** |
| 14 | **scallions** | 4 | piece | **yes** |
| 15 | **sesame oil** | 1 | tablespoon | **yes** |
| 16 | **sriracha** | 2 | teaspoon | **yes** |

---

### TB-4 — HIGH: optional ingredients are stored and bought, but never appear on the list you shop from

**Severity: High.** The shopping list and the cart disagree. Silent, and the count
renormalises so nothing looks wrong.

**Reproduction (exact):**

1. Plan recipe 3 + the invented recipe 71 for the week.
2. Generate → review screen says **"Items selected: 22 • From 2 meals"**.
3. Submit. The database holds **22** `MealIngredients` rows — verified.
4. Open the **Grocery List** screen — the one the shopper actually shops from:

```
FROM YOUR MEALS   18/18
```

**22 stored, 18 shown.** Missing from the display: `Sesame oil`, `Sesame seeds`,
`Sriracha`, `Scallions` — exactly the four rows flagged `optional = 1`.

**Why it is undetectable:** the header reads **"18/18"**, not 18/22. Identical to F1's
renormalisation, but inverted — F1 lost rows *before* the database, this hides rows that
*are* in the database.

**Why it matters more than a display bug:** the HEB Cart Builder spends from
`WeeklyGroceryList`, not from this screen. So the four hidden items are **purchased**. The
shopper never sees them on the list, cannot check them off in In-Store Mode, and discovers
them on the receipt.

**Root cause** — two data paths disagree about `optional`.

`Fetch Weekly Meal Ingredients` (`xgk2OMFwQFjkSWaL`), node `Get Ingredients` — what the
Grocery List screen renders:

```sql
JOIN recipe_ingredients ri ON ws.recipe_id = ri.recipe_id
...
  AND (ri.optional IS NULL OR ri.optional = 0)     -- <-- hides them
```

`Ingredient Agent` (`UqXlXX5uPWlGvhU6`), node `Fetch Recipe Ingredients` — what is reviewed
and then **stored**: no `optional` predicate at all.

**Blast radius — this is not a Create Recipe bug, it is a whole-catalogue bug:**

```sql
SELECT COUNT(*) AS optional_rows, COUNT(DISTINCT recipe_id) AS recipes_with_optional
FROM recipe_ingredients WHERE optional = 1;
-- 63 rows across 20 recipes (of 62 total — 32%)
```

| recipe | optional ingredients |
|---|---|
| Chicken Thigh & Black Bean Enchilada Casserole | 7 |
| Healthy Butternut Squash & Turkey Chili | 6 |
| Frito Chili Pie | 5 |
| Slow Cooker Golden Coconut Chicken Curry | 5 |
| Sesame-Ginger Turkey Lettuce Cup Rice Bowls | 5 |

Create Recipe merely makes it *likely*: the agent marks "adults only" extras optional, so
**4 of 16 (25%)** of one invented recipe was affected in a single pass.

**Open design question for Corey (do not decide unilaterally):** should optional
ingredients be (a) bought and shown, (b) not bought at all, or (c) shown in a distinct
"optional" group the shopper can skip? They cannot stay as they are — bought but hidden.

---

### TB-2 — HIGH: an unrecognised unit becomes NULL, and NULL renders as the literal text "2 s"

**Severity: High.** Nonsense on the shopping list, and a lost quantity unit.

**Reproduction:** the agent wrote *"2 medium carrots"*. On the review screen:

```
carrots
Recipe needs: 2 s
2 s as needed
```

Stored as `Quantity = 2, Unit = 'as needed'`.

**Root cause — a three-step chain:**

1. The agent emits the unit `medium`. The `units` table holds only **23** rows and has no
   `medium`, so the save maps it to `unit_id = NULL`.
2. `Ingredient Agent` → `Aggregate Ingredients` reads `(row.unit_name || '')` → `''`, and
   `getBaseUnit('')` returns `{ group: '', factor: 1, base: '' }`.
3. `formatQuantity` falls to its final branch:

```js
return (qty % 1 === 0 ? qty : ...) + ' ' + baseUnit + (qty > 1 && !baseUnit.endsWith('s') ? 's' : '');
// 2 + ' ' + '' + 's'  ===  "2 s"
```

`''.endsWith('s')` is `false`, so the pluraliser appends `s` to an empty unit.

**Blast radius:** 40 `recipe_ingredients` rows across **9 recipes** already have a NULL
unit, so this is not new — but the Create Recipe path reaches it far more often, because an
AI inventing prose quantities ("2 medium", "1 large", "a handful") will keep producing units
that are not among the 23 known ones. Nothing creates missing units; they are silently
nulled.

---

### TB-3 — MEDIUM: a hardcoded SQL exclusion list silently removes ingredients, inconsistently

**Severity: Medium.** Silent removal, invisible count, arbitrary by name.

**Reproduction:** the invented recipe's `olive oil` (2 tbsp) and `black pepper` (0.25 tsp)
never reached the review screen. 16 ingredients went in, 14 came out; the screen said
"22 ingredients from 2 meals" with no indication two had been removed.

**Root cause** — `Ingredient Agent` (`UqXlXX5uPWlGvhU6`), node `Fetch Recipe Ingredients`:

```sql
WHERE r.recipe_id IN ( ... )
And i.ingredient_name NOT IN ('salt', 'pepper', 'water', 'black pepper', 'olive oil')
```

The intent is reasonable — you always have salt and oil. Three problems:

1. **It is inconsistent by name.** `salt` (38 recipes) is excluded; **`kosher salt`
   (12 recipes) is not**. The invented recipe's kosher salt landed on the shopping list
   while its black pepper did not. Whether you are told to buy pantry salt depends purely
   on which string the recipe happens to use.
2. **It is silent.** Same class as F1 — the count renormalises to the survivors.
3. **It is hardcoded in SQL**, so changing it means editing a workflow rather than data,
   and it cannot be per-household.

**Blast radius:** `black pepper` 49 recipes, `olive oil` 46, `salt` 38, `water` 20.

---

### TB-1 — MEDIUM: the Create Recipe path cannot generate a grocery list

**Severity: Medium.** A dead end in the middle of the advertised chain.

**Reproduction:** from the Create Recipe tab, save a recipe → "Add to This Week's Meals" →
open the Selected Meals panel. The panel lists the meals correctly and offers per-meal
**Remove**, but has **no "Generate Grocery List" button** and no "Clear All". Opening the
same panel from the AI Planner tab has both.

| control | AI Planner panel | Create Recipe panel |
|---|---|---|
| Generate Grocery List | yes | **no** |
| Clear All | yes | **no** |
| Remove meal | yes | yes |

**Root cause:** `MealCreator.js` renders its own copy of the Selected Meals panel (a mobile
sheet and a `hidden lg:flex` desktop variant). `"Generate Grocery List"` exists only in
`ChatBot.js` (lines 814 and 942) — `grep` finds no occurrence in `MealCreator.js`.

**Mitigation that already exists:** the save-confirmation screen offers
"Go to AI Meal Planner →", so the shopper is nudged across. It is a detour, not a trap —
but it is the one place the two paths visibly diverge.

---

## Not tested this session

Stated honestly so no one assumes coverage:

- An ingredient name that is genuinely absent from the catalogue (F7 remains unprobed —
  every name this agent invented already existed).
- The chat-turn apostrophe bug (audit 146).
- "No recipes found" → 500 (FB#11).
- `is_skipped` survival across meal remove/re-add.
- One-off items (ItemID 100000+) interacting with AI-created meal ingredients.
- The "Create Another Recipe" and "Start Over" branches of the wizard.
- Mobile viewport (<1024px), where `MealCreator` renders its sheet variant instead.

---

## Prioritised remediation plan

Ordered by *shopper harm per unit of fix effort*. **Nothing below is approved.** TB-4 and
TB-3 change what lands on a real shopping list and must be confirmed before implementation.

| # | Finding | Severity | Effort | Risk of fix |
|---|---|---|---|---|
| 1 | TB-2 `"2 s"` from a NULL unit | High | XS | Very low — display/format only |
| 2 | TB-4 optional bought but hidden | High | S | Medium — changes list contents |
| 3 | TB-1 no Generate button on Create Recipe | Medium | XS | Very low |
| 4 | TB-3 hardcoded exclusion list | Medium | S | Medium — changes list contents |

**Recommended first slice: items 1 and 3.** Both are contained, neither changes what gets
bought, and together they remove the two things a shopper would actually notice as broken.
TB-4 needs Corey's design decision first; TB-3 needs a policy decision about pantry items.

---

# Implementation Plan — Slice 1 (TB-2, TB-1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the meal-planning surfaces from printing nonsense units, and let the Create
Recipe path finish the chain it starts without switching tabs.

**Architecture:** TB-2 is a two-line change in one n8n Code node (`Aggregate Ingredients`)
plus a defensive guard where units are saved. TB-1 is a UI change in `MealCreator.js` that
reuses the handler `ChatBot.js` already calls. The two are independent and can ship
separately.

**Tech Stack:** React 18 + CRA (`react-scripts`), Jest via react-scripts, Playwright for
e2e, n8n workflows edited via REST API or `scripts/n8n-wave.mjs`, MySQL 8 (`hsa` on
localhost:3307).

**Spec:** this document, sections TB-1 and TB-2.

## Global Constraints

- App tests run through **react-scripts, never bare jest**:
  `CI=true npx.cmd react-scripts test --testPathPattern="X" --watchAll=false`.
  A multi-pattern `"A|B"` is broken through the `.cmd` shim — use
  `node node_modules/react-scripts/bin/react-scripts.js test ...`.
- Gates before merging: `npm run lint` → Jest **445 passing** → `npm run test:e2e`
  hermetic **124 passing**. Kill any dev server on **port 3000** first — the hermetic suite
  starts its own server there and may otherwise reuse one pointed at the real backend.
- Netlify CI treats ESLint warnings as errors — no unused imports, and
  `testing-library/no-node-access` is enforced in tests.
- Tailwind JIT: no dynamic class names. `surface-alt` is **not** a token.
- MySQL MCP is read-only. Writes go through
  `docker exec hsa-mysql bash -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 hsa -e "..."'`
  with `MSYS_NO_PATHCONV=1`.
- Every n8n REST call needs **both** `X-N8N-API-KEY` and `Origin` headers. API key lives in
  `C:\hsa-automation\.env` as `N8N_API_KEY`. n8n runs at `http://localhost:5679`.
- `n8n_update_partial_workflow` fails on this n8n version — use `n8n_update_full_workflow`
  (needs `name` + `settings`) or REST `PUT` with settings filtered to known keys.
- Live-data rule: watermark with **`MAX(id)`**, never `information_schema.AUTO_INCREMENT`
  (it is cached and was observed stale by 66 rows on 2026-09-17). Prove the revert path as
  a no-op DELETE *before* writing anything.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

### Task 1: Stop rendering a NULL unit as "s" (TB-2)

**Files:**
- Modify: n8n workflow `UqXlXX5uPWlGvhU6` (`Ingredient Agent`), node `Aggregate Ingredients`
- Create: `scripts/n8n-edits/aggregate_unitless.mjs`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Capture the current workflow as a rollback artifact**

```bash
source /c/hsa-automation/.env && curl -s \
  -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Origin: http://localhost:5679" \
  "http://localhost:5679/api/v1/workflows/UqXlXX5uPWlGvhU6" \
  -o "$SCRATCH/UqXlXX5uPWlGvhU6.before.json"
```

Verify the file is non-empty and contains `"Aggregate Ingredients"` before proceeding.

- [ ] **Step 2: Record the current broken behaviour**

Confirm a unitless row exists to exercise the path:

```sql
SELECT r.recipe_name, i.ingredient_name, ri.quantity
FROM recipe_ingredients ri
JOIN ingredients i ON i.ingredient_id = ri.ingredient_id
JOIN recipes r ON r.recipe_id = ri.recipe_id
WHERE ri.unit_id IS NULL
LIMIT 5;
-- expect rows; these are the ones that render as "N s"
```

- [ ] **Step 3: Make the formatter handle an empty unit**

In node `Aggregate Ingredients`, replace the final branch of `formatQuantity`:

```js
  } else {
    return (qty % 1 === 0 ? qty : qty.toFixed(2).replace(/\.?0+$/, '')) + ' ' + baseUnit + (qty > 1 && !baseUnit.endsWith('s') ? 's' : '');
  }
```

with:

```js
  } else {
    const n = (qty % 1 === 0 ? qty : qty.toFixed(2).replace(/\.?0+$/, ''));
    // A unit the `units` table does not know (the AI writes "2 medium carrots")
    // is stored as NULL and arrives here as ''. Pluralising '' produced the
    // literal text "2 s" on the shopping list, so fall back to a countable noun.
    if (!baseUnit) return n + (qty > 1 ? ' items' : ' item');
    return n + ' ' + baseUnit + (qty > 1 && !baseUnit.endsWith('s') ? 's' : '');
  }
```

- [ ] **Step 4: Push the workflow update**

Use `n8n_update_full_workflow` (needs `name` + `settings`), or REST `PUT` with settings
filtered to known keys. `n8n_update_partial_workflow` does not work on this n8n version.

- [ ] **Step 5: Verify against a real generation**

Watermark first (`MAX(id)` on `WeeklyGroceryList` and `weekly_selections`), prove the
revert as a no-op, then plan a recipe containing a NULL-unit ingredient, generate, and read
the review screen.

Expected: `carrots — Recipe needs: 2 items` (was `2 s`).
Expected: no occurrence of the regex `/\d+ s\b/` anywhere on the review screen.

Then revert by `id >` / `selection_id >` the watermarks and confirm baseline.

- [ ] **Step 6: Commit**

```bash
git add scripts/n8n-edits/aggregate_unitless.mjs
git commit -m "fix(n8n): stop rendering an unknown unit as the literal text \"2 s\"

The units table holds 23 rows, so a unit the AI invents (\"2 medium carrots\")
is saved as NULL and reaches the aggregator as an empty string. The pluraliser
appended 's' to it, putting \"Recipe needs: 2 s\" on the shopping list. Empty
units now fall back to item/items. 40 recipe_ingredients rows across 9 recipes
were affected.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Let the Create Recipe panel generate the grocery list (TB-1)

**Files:**
- Modify: `src/components/MealCreator.js` (both panel variants: the mobile sheet near
  line 952 and the `hidden lg:flex` desktop panel near line 1022)
- Test: `src/components/MealCreator.test.js` (create if absent)

**Interfaces:**
- Consumes: `MealCreator` is declared at `src/components/MealCreator.js:27` as
  `({ onBack, onNavigate, selectedMeals, setSelectedMeals, refreshMeals, debugMode = false })`.
  The generation logic is `handleGenerateGroceryList`, a `useCallback` local to
  `ChatBot.js:311` (~100 lines) that POSTs to the `get_recipe_items` webhook with a 90s
  AbortController timeout and then navigates to `#recipe-ingredients`. It reads
  `selectedMeals`, `weekInfo`, `apiFetch`, `addDebugLog` and `setIsGeneratingGroceryList`,
  and **maps each meal as `{ id: meal.recipeId, name, description }` — note `recipeId`,
  not `id`**.
- Produces: `src/hooks/useGenerateGroceryList.js` exporting
  `useGenerateGroceryList({ selectedMeals, onNavigate, addDebugLog })` and returning
  `{ generate, isGenerating }`. `ChatBot.js` and `MealCreator.js` both call it. Do not copy
  the handler into `MealCreator` — two copies of a 90-second webhook call will drift.

- [ ] **Step 1: Write the failing test**

```js
// src/components/MealCreator.test.js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MealCreator from './MealCreator';

const selectedMeals = [
  { id: 71, recipeId: 71, name: 'Test Invented Recipe', description: 'x', servings: 4 },
];

const renderCreator = () =>
  render(
    <MealCreator
      onBack={() => {}}
      onNavigate={() => {}}
      selectedMeals={selectedMeals}
      setSelectedMeals={() => {}}
      refreshMeals={() => {}}
      debugMode={false}
    />,
  );

test('the selected-meals panel offers Generate Grocery List', async () => {
  renderCreator();

  fireEvent.click(await screen.findByRole('button', { name: /meals? planned/i }));

  expect(screen.getByRole('button', { name: /Generate Grocery List/i })).toBeInTheDocument();
});
```

The desktop panel is `hidden lg:flex`, but jsdom applies no CSS, so both variants render and
`getByRole` would match twice once the button is added to each. Assert with
`getAllByRole('button', { name: /Generate Grocery List/i }).length` being 2 if that happens,
or scope the query with `within()` to one panel — do not delete one variant to make the
test pass.

- [ ] **Step 2: Run the test to verify it fails**

Run: `CI=true npx.cmd react-scripts test --testPathPattern="MealCreator" --watchAll=false`

Expected: FAIL — no button with that name.

- [ ] **Step 3: Add the button to both panel variants**

In the desktop panel (`hidden lg:flex`, near line 1022) add a footer below the scrolling
meal list, mirroring `ChatBot.js`:

```jsx
              {selectedMeals.length > 0 && (
                <div className="p-4 border-t border-default">
                  <p className="text-sm text-body mb-2">
                    {selectedMeals.length} meal{selectedMeals.length !== 1 ? 's' : ''} selected
                  </p>
                  <button
                    onClick={handleGenerateGroceryList}
                    className="w-full px-4 py-2 rounded-xl transition-colors flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white"
                  >
                    Generate Grocery List
                  </button>
                </div>
              )}
```

Add the same footer to the mobile sheet variant near line 952. Do not invent a second
generation code path — wire `handleGenerateGroceryList` to the shared helper from the
Interfaces block above.

- [ ] **Step 4: Run the test to verify it passes**

Run: `CI=true npx.cmd react-scripts test --testPathPattern="MealCreator" --watchAll=false`

Expected: PASS.

- [ ] **Step 5: Run lint and the full app suite**

Run: `npm.cmd run lint` — expect clean.
Run: `CI=true npx.cmd react-scripts test --watchAll=false` — expect 445 + the new test.

- [ ] **Step 6: Verify in the real app at both widths**

Load the app, go to Meal Planning → Create Recipe, open the Selected Meals panel, and
confirm the button appears and navigates to the review screen. Repeat at a viewport
narrower than 1024px so the mobile sheet variant is exercised. **Assert the loaded bundle
before trusting the result** — `document.querySelector('script[src*="main."]').src` — and
load with a `?cachebust=` query, or you may be testing the previous build.

- [ ] **Step 7: Commit**

```bash
git add src/components/MealCreator.js src/components/MealCreator.test.js
git commit -m "feat(meals): let the Create Recipe panel generate the grocery list

Create Recipe walks the shopper all the way to \"Add to This Week's Meals\" and
then stops: its Selected Meals panel had no Generate Grocery List button, so the
chain could only be finished by noticing the \"Go to AI Meal Planner\" link or
switching tabs by hand. The button lives in ChatBot.js; MealCreator renders its
own panel and never had one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Full gate run before merge

- [ ] **Step 1: Lint**

Run: `npm.cmd run lint` — expect clean (Netlify treats warnings as errors).

- [ ] **Step 2: Jest**

Run: `CI=true npx.cmd react-scripts test --watchAll=false` — expect 445 + new tests passing.

- [ ] **Step 3: Playwright e2e**

Kill any dev server on port 3000 first, then run `npm.cmd run test:e2e` — expect 124 passing.

- [ ] **Step 4: Confirm the live week is clean**

```sql
SELECT id, ItemName, DataSource FROM WeeklyGroceryList WHERE week_start_date = '2026-09-20' ORDER BY id;
-- expect exactly ids 3688-3693, all DataSource='Staples'
SELECT selection_id, recipe_id FROM weekly_selections
WHERE WeekDateRange = 'For the week of September 20th to September 26th, 2026';
-- expect exactly selection_id 173, recipe_id 3
SELECT MAX(recipe_id) FROM recipes;            -- expect 70
SELECT MAX(recipe_ingredient_id) FROM recipe_ingredients;  -- expect 910
SELECT MAX(ingredient_id) FROM ingredients;    -- expect 888
```

---

## Deferred pending Corey's decision

### TB-4 — optional ingredients

Needs a product decision before any code. The three viable behaviours:

- **(a) Buy and show them.** Drop `AND (ri.optional IS NULL OR ri.optional = 0)` from
  `Fetch Weekly Meal Ingredients`. The list then matches the database and the cart.
  Risk: the shopper sees "adults only" extras they did not intend to buy.
- **(b) Neither buy nor show.** Add an `optional` filter to `Ingredient Agent` →
  `Fetch Recipe Ingredients` so they never enter `WeeklyGroceryList`.
  Risk: a recipe silently loses ingredients its author marked merely "nice to have".
- **(c) Show them in their own group.** Carry `optional` through to `WeeklyGroceryList` and
  render an "Optional extras" section the shopper can skip.
  Most faithful; largest change (needs a column on `WeeklyGroceryList`).

**Recommendation: (c), with (a) as the cheap interim** — (a) makes the list honest in one
line of SQL, and nothing is bought that is not shown.

### TB-3 — the hardcoded exclusion list

Needs a policy decision. At minimum the inconsistency should go: `salt` is excluded while
`kosher salt` is not. Options are to normalise names before comparison, move the list into
a table the household can edit, or drop the exclusion and let the staples system handle it —
which is arguably what the (now week-scoped) staples filter in `Create Grocery List - Meals`
is already for.

---

## Appendix: test-data ledger for this investigation

All rows below were created during the review and have been **deleted**; baseline verified
restored.

| table | rows created | disposition |
|---|---|---|
| `recipes` | `recipe_id` 71 | deleted — `MAX(recipe_id)` back to 70 |
| `recipe_ingredients` | 16 rows, `recipe_ingredient_id` 911-926 | deleted — `MAX` back to 910 |
| `ingredients` | none (all 16 names already existed) | n/a |
| `weekly_selections` | `selection_id` 205 | deleted — `MAX` back to 181 |
| `WeeklyGroceryList` | 22 `MealIngredients` rows | deleted — `MAX(id)` back to 3693 |

Baseline restored and confirmed: WGL week `2026-09-20` holds exactly ids 3688-3693 (6
Staples rows); `weekly_selections` holds exactly `selection_id` 173 (recipe 3);
`client_errors` still holds exactly 1 row (the permanent sentinel).

Revert statements used:

```sql
DELETE FROM WeeklyGroceryList  WHERE id > 3693 AND week_start_date = '2026-09-20';
DELETE FROM weekly_selections  WHERE selection_id > 181;
DELETE FROM recipe_ingredients WHERE recipe_ingredient_id > 910;
DELETE FROM recipes            WHERE recipe_id > 70;
DELETE FROM ingredients        WHERE ingredient_id > 888;
```

**Watermark warning learned here:** `information_schema.TABLES.AUTO_INCREMENT` reported
`3807` for `WeeklyGroceryList` when rows up to `3873` had already been written and deleted —
the value is cached and can be stale. Watermark with `MAX(id)`; deleting by a stale
AUTO_INCREMENT could reach real rows.
