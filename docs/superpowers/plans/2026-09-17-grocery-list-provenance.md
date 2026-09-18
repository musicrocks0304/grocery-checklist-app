# Grocery List Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `MealIngredients` row in the week's `WeeklyGroceryList` appears on the Grocery List screen, with optional items marked rather than hidden.

**Architecture:** Meal attribution and optionality are **derived on read** inside the n8n workflow `Pull Grocery Staples`, by joining `WeeklyGroceryList.ItemID - 1000` through `weekly_selections` → `recipe_ingredients` → `recipes` — the same id join the orphan cleanup already trusts. No DDL, no migration, no backfill. The frontend then groups by the returned recipe names and stops discarding rows whose name fails a lookup.

**Tech Stack:** React 18 + CRA (`react-scripts`), Jest via react-scripts, Playwright for e2e, n8n workflows edited via REST API or `scripts/n8n-wave.mjs`, MySQL 8 (`hsa` on localhost:3307).

**Spec:** `docs/superpowers/specs/2026-09-17-grocery-list-provenance-design.md`

## Global Constraints

- App tests run through **react-scripts, never bare jest**:
  `CI=true npx.cmd react-scripts test --testPathPattern="X" --watchAll=false`.
  A multi-pattern `"A|B"` is broken through the `.cmd` shim — use
  `node node_modules/react-scripts/bin/react-scripts.js test ...`.
- Gates before merging: `npm run lint` → Jest (**confirm the current baseline first**; it was 447 on 2026-09-17) → `npm run test:e2e` (**124**). Kill any dev server on **port 3000** first, or the hermetic suite may reuse one pointed at the real backend.
- Netlify CI treats ESLint warnings as errors. `testing-library/no-node-access` is enforced in tests — do not reach for DOM nodes.
- Tailwind JIT: no dynamic class names. **`surface-alt` is not a token**; only `surface` and `surface-elevated`. An unknown token renders nothing and no test catches it.
- MySQL MCP is read-only. Writes go through
  `docker exec hsa-mysql bash -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 hsa -e "..."'` with `MSYS_NO_PATHCONV=1`.
- Every n8n REST call needs **both** `X-N8N-API-KEY` and `Origin` headers. API key is in `C:\hsa-automation\.env` as `N8N_API_KEY`. n8n is at `http://localhost:5679`.
- `n8n_update_partial_workflow` fails on this n8n version — use `n8n_update_full_workflow` (needs `name` + `settings`) or REST `PUT` with settings filtered to known keys. `scripts/n8n-wave.mjs apply <webhookPath> <file.mjs>` is the established route.
- **Live-data rule:** watermark with `MAX(id)`, never `information_schema.AUTO_INCREMENT` (observed stale by 66 rows on 2026-09-17). Prove the revert path with a no-op DELETE *before* writing anything.
- **Verifying anything in the deployed app:** load with a `?cachebust=` query and assert `document.querySelector('script[src*="main."]').src` before trusting the result — Playwright will otherwise serve cached HTML and you will test the previous build.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

### Task 1: Derive meal attribution and optionality in `Pull Grocery Staples`

Purely additive to the response: two new fields, no removals, no changed semantics. Ship it before any frontend change so the fields exist when the UI looks for them.

**Files:**
- Modify: n8n workflow `JoaR6klT950hwSLB` (`Pull Grocery Staples`), node `Pull Current Week Grocery List`
- Create: `scripts/n8n-edits/grocery_list_provenance.mjs`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: two new fields on every row of the `fetch_grocery_items` response, consumed by Task 2 —
  - `RecipeNames` — `TEXT`, `'||'`-separated contributing recipe names, or `NULL`
  - `IsOptional` — `0` or `1`; `1` only when the ingredient is optional in **every** contributing recipe

- [ ] **Step 1: Capture the current workflow as a rollback artifact**

```bash
source /c/hsa-automation/.env && curl -s \
  -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Origin: http://localhost:5679" \
  "http://localhost:5679/api/v1/workflows/JoaR6klT950hwSLB" \
  -o "$SCRATCH/JoaR6klT950hwSLB.before.json"
```

Verify the file is non-empty and contains `"Pull Current Week Grocery List"` before proceeding.

- [ ] **Step 2: Prove the derivation in raw SQL before touching the workflow**

Run this against a week that has meal ingredients. It is the exact subquery the node will embed:

```sql
SELECT w2.ItemID,
       GROUP_CONCAT(DISTINCT r.recipe_name ORDER BY r.recipe_name SEPARATOR '||') AS RecipeNames,
       MIN(ri.optional) AS IsOptional
FROM WeeklyGroceryList w2
JOIN weekly_selections ws  ON ws.WeekDateRange = w2.WeekDateRange
JOIN recipe_ingredients ri ON ri.recipe_id = ws.recipe_id
                          AND ri.ingredient_id = w2.ItemID - 1000
JOIN recipes r             ON r.recipe_id = ws.recipe_id
WHERE w2.WeekDateRange = 'For the week of July 26th to August 1st, 2026'
  AND w2.DataSource = 'MealIngredients'
GROUP BY w2.ItemID;
```

Expected: rows come back; at least one has two recipes in `RecipeNames` (a shared ingredient); `IsOptional` is `0` for an ingredient that any contributing recipe requires. Record the output — Step 5 compares against it.

- [ ] **Step 3: Write the edit script**

The node's query is one long string with two UNION branches inside `SELECT ... FROM ( ... ) AS CombinedList`. Three edits, all additive:

1. **Outer column list** — add the two fields so they survive the wrapper:

```
SELECT ItemID, ItemName, Category, Store, GroceryStoreSection, Type, IsActive, DataSource, QuantitySelected, IsSelected, Unit, store_location FROM (
```
becomes
```
SELECT ItemID, ItemName, Category, Store, GroceryStoreSection, Type, IsActive, DataSource, QuantitySelected, IsSelected, Unit, store_location, RecipeNames, IsOptional FROM (
```

2. **Branch 1 (`GroceryItems` side).** Its `CW` subquery aggregates WGL by name. Add the ATTR join *inside* `CW` and expose the two fields, then select them in branch 1's column list.

`CW`'s `SELECT` gains:
```sql
, MAX(ATTR.RecipeNames) AS RecipeNames, MIN(ATTR.IsOptional) AS IsOptional
```
`CW`'s `FROM WeeklyGroceryList` gains:
```sql
LEFT JOIN (
  SELECT w2.ItemID AS attr_item_id,
         GROUP_CONCAT(DISTINCT r.recipe_name ORDER BY r.recipe_name SEPARATOR '||') AS RecipeNames,
         MIN(ri.optional) AS IsOptional
  FROM WeeklyGroceryList w2
  JOIN weekly_selections ws  ON ws.WeekDateRange = w2.WeekDateRange
  JOIN recipe_ingredients ri ON ri.recipe_id = ws.recipe_id
                            AND ri.ingredient_id = w2.ItemID - 1000
  JOIN recipes r             ON r.recipe_id = ws.recipe_id
  WHERE w2.WeekDateRange = '{{ String($('Webhook').item.json.query.weekDateRange).replace(/'/g, "''") }}'
    AND w2.DataSource = 'MealIngredients'
  GROUP BY w2.ItemID
) AS ATTR ON ATTR.attr_item_id = WeeklyGroceryList.ItemID
```
and branch 1's outer column list gains:
```sql
, CW.RecipeNames, COALESCE(CW.IsOptional, 0) AS IsOptional
```

**Why this cannot corrupt `CW`'s existing `SUM(CASE WHEN DataSource = 'Staples' ...)`:** `ATTR` is grouped by `ItemID` and `uq_week_item (week_start_date, ItemID)` guarantees at most one WGL row per ItemID per week, so the join is 1:1 and multiplies no rows. Confirm this reasoning holds by re-running Step 2's counts after the edit.

3. **Branch 2 (WGL-only side).** It already joins the catalogue by id (`LEFT JOIN ingredients ing ON ing.ingredient_id = WGL.ItemID - 1000`). Add the same subquery again, aliased `ATTR2`:
```sql
LEFT JOIN (
  SELECT w2.ItemID AS attr_item_id,
         GROUP_CONCAT(DISTINCT r.recipe_name ORDER BY r.recipe_name SEPARATOR '||') AS RecipeNames,
         MIN(ri.optional) AS IsOptional
  FROM WeeklyGroceryList w2
  JOIN weekly_selections ws  ON ws.WeekDateRange = w2.WeekDateRange
  JOIN recipe_ingredients ri ON ri.recipe_id = ws.recipe_id
                            AND ri.ingredient_id = w2.ItemID - 1000
  JOIN recipes r             ON r.recipe_id = ws.recipe_id
  WHERE w2.WeekDateRange = '{{ String($('Webhook').item.json.query.weekDateRange).replace(/'/g, "''") }}'
    AND w2.DataSource = 'MealIngredients'
  GROUP BY w2.ItemID
) AS ATTR2 ON ATTR2.attr_item_id = WGL.ItemID
```
and to its column list:
```sql
, MAX(ATTR2.RecipeNames) AS RecipeNames, COALESCE(MIN(ATTR2.IsOptional), 0) AS IsOptional
```

Both branches must derive from the **WGL row's own ItemID**, not from `GroceryItems.ItemID`. Branch 1 exists precisely for names that collide with the catalogue (6 today: Avocado, Carrots, Honey, Kale, Olive oil, Oregano), and for those the outer row carries `GI.ItemID` (Carrots = 22), not the meal ItemID (1084). Deriving inside `CW`, where the real WGL row is still in scope, is what makes those six work.

Both embedded subqueries take the same week expression the node already uses:
```
'{{ String($('Webhook').item.json.query.weekDateRange).replace(/'/g, "''") }}'
```

Write this as `scripts/n8n-edits/grocery_list_provenance.mjs` exporting a default function that takes the workflow, finds the node by name, performs the string replacements, throws if any anchor is not found, and is a no-op when already applied (check for `RecipeNames` in the query first).

- [ ] **Step 4: Apply it**

Run: `node scripts/n8n-wave.mjs apply fetch_grocery_items scripts/n8n-edits/grocery_list_provenance.mjs`

- [ ] **Step 5: Verify the live response carries the fields**

```bash
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/fetch_grocery_items?weekDateRange=<week>&weekStartDate=<start>&weekEndDate=<end>" \
  -H "X-API-Key: $APP_API_KEY"
```

The webhook uses header auth; if the key is not to hand, run the node's final SQL directly against MySQL instead and compare.

Expected: every row has `RecipeNames` and `IsOptional` keys. Meal rows for planned recipes carry names; staples carry `NULL`/`0`. A shared ingredient shows both recipe names separated by `||`. Counts of rows returned are **unchanged** from before the edit — verify that explicitly, because a join that accidentally multiplied rows would show up here.

- [ ] **Step 6: Commit**

```bash
git add scripts/n8n-edits/grocery_list_provenance.mjs
git commit -m "feat(n8n): derive meal attribution and optionality in the grocery list query

The Grocery List screen reconstructed which meal each item came from by
matching ItemName strings, and dropped any row that failed the match. This
returns the answer from the query instead, via the ItemID - 1000 -> ingredient_id
join that Pull Grocery Staples and the orphan cleanup already rely on.

RecipeNames is '||'-separated; IsOptional is MIN(optional) across contributing
recipes, so an item is only optional when every recipe that wants it says so.
Both are additive fields -- no existing column or filter changed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Render every meal row, and mark the optional ones

**Files:**
- Modify: `src/components/StaplesScreen.js:38-46`
- Modify: `src/components/staples/ItemRow.js`
- Test: `src/components/StaplesScreen.test.js` (exists), `src/components/staples/MealsCard.test.js` (exists)

**Interfaces:**
- Consumes: `RecipeNames` and `IsOptional` from Task 1.
- Produces: items carrying `MealName` (never `null`) and `IsOptional` (boolean).
- **`MealsCard.js` needs no source change.** The optional marker goes in `ItemRow.js`, which renders the name, and the header count corrects itself once nothing is filtered out. Its test file still gains a guard.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/StaplesScreen.test.js`. It already defines `baseHook` and `mealsHookBase` at the top — reuse them:

```js
test('a meal ingredient that matches no recipe still renders, under Other meal ingredients', () => {
  const hook = {
    ...baseHook,
    items: [
      ...baseHook.items,
      { ItemID: 102, ItemName: 'Sriracha', Category: 'Condiments & sauces',
        DataSource: 'MealIngredients', RecipeNames: null, IsOptional: 1 },
    ],
  };
  render(<StaplesScreen onReview={() => {}} staplesHook={hook} mealsHook={mealsHookBase} />);

  expect(screen.getByText('Sriracha')).toBeInTheDocument();
  expect(screen.getByText('OTHER MEAL INGREDIENTS')).toBeInTheDocument();
});

test('an optional meal ingredient is rendered and marked, not hidden', () => {
  const hook = {
    ...baseHook,
    items: [
      ...baseHook.items,
      { ItemID: 103, ItemName: 'Sesame oil', Category: 'Condiments & sauces',
        DataSource: 'MealIngredients', RecipeNames: 'Chicken tacos', IsOptional: 1 },
    ],
  };
  render(<StaplesScreen onReview={() => {}} staplesHook={hook} mealsHook={mealsHookBase} />);

  expect(screen.getByText('Sesame oil')).toBeInTheDocument();
  expect(screen.getByText(/optional/i)).toBeInTheDocument();
});

test('RecipeNames wins over the legacy name lookup for grouping', () => {
  const hook = {
    ...baseHook,
    items: [
      { ItemID: 100, ItemName: 'Chicken thighs', Category: 'Meat & seafood',
        DataSource: 'MealIngredients', RecipeNames: 'Sheet pan chicken', IsOptional: 0 },
    ],
  };
  render(<StaplesScreen onReview={() => {}} staplesHook={hook} mealsHook={mealsHookBase} />);

  expect(screen.getByText('SHEET PAN CHICKEN')).toBeInTheDocument();
});
```

Add to `src/components/staples/MealsCard.test.js`:

```js
test('the header count includes optional items', () => {
  const withOptional = [
    ...items,
    { ItemID: 5, ItemName: 'Sriracha', MealName: 'Chicken tacos', IsOptional: true },
  ];
  render(
    <MealsCard activeMeal={null} items={withOptional} selected={new Set()} onToggle={() => {}} />
  );
  expect(screen.getByText('0/5')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node node_modules/react-scripts/bin/react-scripts.js test --testPathPattern="StaplesScreen|MealsCard" --watchAll=false`
(with `CI=true` set; the `.cmd` shim eats the `|`)

Expected: the first three FAIL — `Sriracha` and `Sesame oil` are absent (dropped by the `MealName !== null` filter), and grouping still uses the name lookup. The MealsCard count test fails `0/5` vs `0/4` only once `IsOptional` items are passed through — if it passes already, that is fine and it stands as a regression guard.

- [ ] **Step 3: Replace the client-side name join**

In `src/components/StaplesScreen.js`, replace lines 38-46:

```js
    // MealIngredients items that matched a known meal get a MealName injected.
    // Drop unmatched ones (can't attribute to any meal).
    const enrichedMealItems = items
      .filter((i) => i.DataSource === 'MealIngredients')
      .map((i) => ({
        ...i,
        MealName: itemNameToMeal[i.ItemName.trim().toLowerCase()] || null,
      }))
      .filter((i) => i.MealName !== null);
```

with:

```js
    // Attribution comes from the query (RecipeNames), derived via
    // ItemID - 1000 -> ingredient_id. The old name lookup is kept only as a
    // fallback for rows the derivation cannot resolve.
    //
    // NOTHING IS FILTERED OUT HERE. A row in WeeklyGroceryList is a row the
    // shopper is buying, so it must appear on the list. Dropping unattributed
    // rows is what hid every optional ingredient while the cart still bought
    // them (TB-4).
    const enrichedMealItems = items
      .filter((i) => i.DataSource === 'MealIngredients')
      .map((i) => {
        const derived = String(i.RecipeNames || '').split('||').filter(Boolean);
        const fallback = itemNameToMeal[i.ItemName.trim().toLowerCase()];
        return {
          ...i,
          MealName: derived[0] || fallback || 'Other meal ingredients',
          IsOptional: i.IsOptional === 1 || i.IsOptional === '1' || i.IsOptional === true,
        };
      });
```

- [ ] **Step 4: Mark optional rows**

In `src/components/staples/ItemRow.js`, replace the label's contents:

```jsx
        {item.ItemName}
```

with:

```jsx
        {item.ItemName}
        {item.IsOptional && (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">
            optional
          </span>
        )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node node_modules/react-scripts/bin/react-scripts.js test --testPathPattern="StaplesScreen|MealsCard" --watchAll=false`

Expected: PASS.

- [ ] **Step 6: Run lint and the full app suite**

Run: `npm.cmd run lint` — expect clean.
Run: `CI=true npx.cmd react-scripts test --watchAll=false` — expect the baseline plus the new tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/StaplesScreen.js src/components/staples/ItemRow.js src/components/StaplesScreen.test.js src/components/staples/MealsCard.test.js
git commit -m "fix(list): stop dropping meal ingredients the name lookup could not attribute

The grocery list inner-joined WeeklyGroceryList rows against a recipe-derived
name lookup to label each row with a meal, and discarded any row that failed the
match. Because that lookup excluded optional ingredients, four items per planned
recipe could sit in the database -- and in the H-E-B cart -- while never
appearing on the list the shopper checks off. Observed: 22 stored, '18/18' shown.

Attribution now comes from the query. Rows that still resolve to nothing land in
'Other meal ingredients' instead of vanishing, and optional items render with a
marker rather than being hidden.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Stop the meal-ingredient lookup hiding optional rows

**Files:**
- Modify: n8n workflow `xgk2OMFwQFjkSWaL` (`Fetch Weekly Meal Ingredients`), node `Get Ingredients`
- Create: `scripts/n8n-edits/meal_lookup_optional.mjs`

**Interfaces:**
- Consumes: nothing. Independent of Tasks 1 and 2, but only safe to ship *after* Task 2, because until then this lookup still gates what renders.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Capture the workflow as a rollback artifact**

```bash
source /c/hsa-automation/.env && curl -s \
  -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Origin: http://localhost:5679" \
  "http://localhost:5679/api/v1/workflows/xgk2OMFwQFjkSWaL" \
  -o "$SCRATCH/xgk2OMFwQFjkSWaL.before.json"
```

- [ ] **Step 2: Remove the predicate**

In node `Get Ingredients`, delete this line:

```sql
  AND (ri.optional IS NULL OR ri.optional = 0)
```

Leave the `UNION ALL SELECT '__SENTINEL__', NULL` in place — it stops a 0-row result halting the flow, which `alwaysOutputData` does not reliably prevent on mySql typeVersion 2.4.

Write `scripts/n8n-edits/meal_lookup_optional.mjs` as an idempotent edit (no-op if the predicate is already gone) and apply with
`node scripts/n8n-wave.mjs apply fetch_weekly_meal_ingredients scripts/n8n-edits/meal_lookup_optional.mjs`.

- [ ] **Step 3: Verify**

Call the endpoint for a week with a planned recipe that has optional ingredients, and confirm the optional names now appear in `ingredientNames`. This lookup no longer decides membership, so the only visible effect should be better fallback attribution.

- [ ] **Step 4: Commit**

```bash
git add scripts/n8n-edits/meal_lookup_optional.mjs
git commit -m "fix(n8n): stop the meal lookup excluding optional ingredients

This lookup existed to label grocery-list rows with a meal name, but it filtered
out optional ingredients, so those rows failed the client-side name join and
were dropped from the list entirely while remaining in the cart. Attribution now
comes from the grocery list query; this predicate only made the fallback wrong.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full gate run and live end-to-end verification

- [ ] **Step 1: Lint**

Run: `npm.cmd run lint` — expect clean.

- [ ] **Step 2: Jest**

Run: `CI=true npx.cmd react-scripts test --watchAll=false` — expect the baseline plus new tests.

- [ ] **Step 3: Playwright e2e**

Kill any dev server on port 3000 first. Run: `npm.cmd run test:e2e` — expect **124 passing**.

- [ ] **Step 4: Watermark and prove the revert path**

```sql
SELECT MAX(id) FROM WeeklyGroceryList;              -- record
SELECT MAX(selection_id) FROM weekly_selections;    -- record
```

Then run the deletes as no-ops and confirm they report 0 rows before creating anything:

```sql
DELETE FROM WeeklyGroceryList WHERE id > <wgl_max> AND week_start_date = '<test week>';
DELETE FROM weekly_selections WHERE selection_id > <sel_max>;
```

- [ ] **Step 5: Live end-to-end**

Plan a recipe that has optional ingredients (recipe 59 "Frito Chili Pie" has 5, including `Fritos or corn chips`; recipe 55 has 5 including `butter lettuce`). Generate, submit, then compare:

```sql
SELECT COUNT(*) FROM WeeklyGroceryList
WHERE week_start_date = '<test week>' AND DataSource = 'MealIngredients';
```

against the `FROM YOUR MEALS` header count on the Grocery List screen. **They must be equal** — that equality is the whole point of this change. Confirm the optional items are present and carry the marker.

Load the deployed app with a `?cachebust=` query and assert the bundle hash before trusting what you see.

- [ ] **Step 6: Verify the shared-ingredient and meal-removal cases**

Plan two recipes that share an ingredient. Confirm the query's `RecipeNames` for that row contains **both** recipe names separated by `||`, and that `IsOptional` is 0 when either recipe requires it (real pairs exist: sour cream is optional in 4 recipes and required in 5; lime in 2 and 10).

Remove one of the two meals, reload, and confirm the surviving row re-attributes to the remaining recipe. This is the staleness case the rejected stored-column design would have failed.

- [ ] **Step 7: Revert the test data and confirm baseline**

```sql
DELETE FROM WeeklyGroceryList WHERE id > <wgl_max> AND week_start_date = '<test week>';
DELETE FROM weekly_selections WHERE selection_id > <sel_max>;
SELECT MAX(id) FROM WeeklyGroceryList;            -- back to <wgl_max>
SELECT MAX(selection_id) FROM weekly_selections;  -- back to <sel_max>
SELECT COUNT(*) FROM client_errors;               -- expect 1 (the permanent sentinel)
```
