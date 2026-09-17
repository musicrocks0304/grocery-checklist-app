# Meal Planning Workflow — Findings & Remediation Plan

> **Status: FINDINGS + PLAN ONLY. Nothing has been fixed.** Every finding below was
> reproduced against the live production system on 2026-09-17. All test data written
> during the investigation has been reverted; the database is at baseline.

**Investigator note:** this is an end-to-end review of the meal-planning workflow driven
through the real UI (Playwright against `grocery-checklist-app.netlify.app`), from the
persona of the shopper who will stand in an H-E-B aisle holding the resulting list.

---

## Executive summary

The workflow **feels** good. Meal selection is fast, "already added" states are correct,
the confirm dialog before writing the list is a nice touch, and the AI ingredient
aggregation is genuinely impressive — it converted `0.25 cup` to `4 tbsp` and summed it
with `2 tbsp` to get sour cream's 6 tbsp correctly.

The problem is that **information degrades silently between the last screen and the
database.** Three defects compound into a shopping list that is quietly wrong:

1. Ingredients are **silently deleted** on the way to the list (F1).
2. Quantities **can never decrease**, so editing a plan permanently inflates them (F2).
3. The review screen **squares the quantity** it shows you (F3).

None of these announce themselves. The UI reports success and a self-consistent count
every time. A shopper discovers F1 only when standing in the kitchen without the carrots.

### Verified-correct (do not "fix" these)

Falsification checks that came back negative are worth recording, because two of the
handoff's stated hypotheses were wrong:

- **MealCreator's "Add to This Week's Meals" is NOT a DB no-op.** `MealCreator.js:333`
  posts directly to `addWeeklySelection`, with a comment documenting the FB#39 fix.
  The memory file `ai_chat_meals.md` still lists this as unfixed — **it is stale.**
- **The AI aggregates shared ingredients correctly within one submit.** Ground beef across
  two recipes: `needs 1 lb 4 oz` (10 oz + 10 oz), `buy 2 lbs`. Correct.
- **`GREATEST` is not wrong because it fails to sum.** WGL units are *purchase* units —
  one head of garlic legitimately covers 8 cloves across three recipes. Summing would be
  a bug. The defect is subtler; see F2.
- **The `ItemID = 1000` collision has never actually fired** (0 rows in the entire table's
  history). It is latent, not active. See F7.
- **Hash routing works.** `useHashRoute.js` listens to both `popstate` and `hashchange`.

---

## Reproductions

**Setup used:** week `2026-09-20` (current planning week — the week flipped Thursday
00:00 today). Recipes 3 (Cheesy Beef Enchiladas), 20 (Beef Tacos & Radish Salsa),
47 (Spicy Black Bean Quesadillas) — chosen because they share ingredients including two
pairs with *incompatible* units (sour cream 2 tbsp vs 0.25 cup; radishes 3 piece vs 3 oz).

---

### F1 — CRITICAL: recipe ingredients are silently deleted if their name matches a staple

**Severity: Critical.** Silent data loss. The shopper cannot detect it.

**Reproduction (exact):**

1. Plan recipes 3, 20, 47 for the week.
2. Generate Grocery List → the screen says **"Selected: 23 ingredients from 3 meals"**.
3. Click *Add to Main Grocery List* → confirm dialog says **"add these 23 ingredients"**.
4. Browser console logs `📊 Total items: 23` then `✅ Successfully added ingredients`.
5. Query the database:

```sql
SELECT COUNT(*) FROM WeeklyGroceryList
WHERE week_start_date='2026-09-20' AND DataSource='MealIngredients';
-- 21
```

**23 selected, 21 stored. `carrots` and `avocado` are gone.** Confirmed absent from the
week under *any* DataSource:

```sql
SELECT (SELECT COUNT(*) FROM WeeklyGroceryList
        WHERE week_start_date='2026-09-20' AND ItemName LIKE '%arrot%') AS carrots,
       (SELECT COUNT(*) FROM WeeklyGroceryList
        WHERE week_start_date='2026-09-20' AND ItemName LIKE '%vocado%') AS avocado;
-- 0, 0
```

The recipe is literally **"Spicy Black Bean Quesadillas with Roasted Carrot & Avocado
Salad."** Both named components of the salad are missing from the shopping list.

**Why it is undetectable:** the Grocery List screen then renders **"FROM YOUR MEALS
21/21"** — not 21/23. The count renormalises to the survivors, so the list looks complete
and internally consistent.

**Root cause** — n8n workflow `Create Grocery List - Meals` (`CkLhcFEM9Tfc5uxO`), node
`Transform for DB Input`:

```js
const stapleRows = $('Lookup Existing Staples').all();   // SELECT ItemName FROM GroceryItems WHERE IsActive = TRUE
for (const row of stapleRows) stapleNames[name.trim().toLowerCase()] = true;

const transformedItems = ingredients
  .filter((item) => item.IsSelected === 1)
  .filter((item) => !stapleNames[(item.ItemName || '').trim().toLowerCase()])   // <-- DROPS IT
```

The intent was reasonable: "you already buy olive oil weekly, don't duplicate it." The
flaw is that **a staple existing in the catalogue does not mean it is checked for this
week.** Carrots and avocado were both *unchecked* in the week's staples during the
reproduction, so the ingredient was removed from the meal list and never added anywhere.

**Blast radius** — exactly 6 catalogue ingredients currently collide by name:

```sql
SELECT i.ingredient_name, COUNT(DISTINCT ri.recipe_id) AS used_in_recipes
FROM ingredients i JOIN recipe_ingredients ri ON ri.ingredient_id = i.ingredient_id
WHERE EXISTS (SELECT 1 FROM GroceryItems g
              WHERE g.IsActive = TRUE
                AND LOWER(TRIM(g.ItemName)) = LOWER(TRIM(i.ingredient_name)))
GROUP BY i.ingredient_name ORDER BY used_in_recipes DESC;
```

| ingredient | recipes affected | reasonable as an always-on-hand staple? |
|---|---|---|
| olive oil | 45 | yes |
| **carrots** | **8** | **no — perishable** |
| **avocado** | **6** | **no — perishable** |
| honey | 5 | yes |
| **kale** | **1** | **no — perishable** |
| oregano | 1 | yes |

**Note the coupling:** this set grows silently whenever a staple is added to `GroceryItems`
whose name happens to match an ingredient. Adding "Chicken breast" as a staple would
silently remove chicken from every meal list.

---

### F2 — HIGH: quantities can never decrease, and quantity/unit are updated by different rules

**Severity: High.** Produces confident, plausible, wrong numbers that drive the HEB cart.

**Reproduction (exact):**

1. With recipes 3, 20, 47 planned and submitted, ground beef is stored as
   `Quantity=2, Unit='1 lb package'` — correct for 20 oz of need.
2. Remove **Beef Tacos** (recipe 20) from the plan. Orphan cleanup correctly deletes the
   3 rows unique to it (21 → 18 rows).
3. Regenerate the grocery list. **The app itself now displays: `ground beef — Recipe needs:
   10 oz — 1 lb / 1 lb package`.** The frontend and the AI are both correct.
4. Submit. Query the database:

```sql
SELECT ItemName, Quantity, Unit FROM WeeklyGroceryList
WHERE week_start_date='2026-09-20' AND DataSource='MealIngredients'
  AND ItemName IN ('Ground beef','Lime','Green onions');
```

| ItemName | app displayed | **stored** | correct |
|---|---|---|---|
| Ground beef | buy 1 lb | **2** × 1 lb package | 1 |
| Lime | 1 piece | **2 × "item"** | 1 |
| Green onions | 2 pieces | **4** items | 2 |

**Lime is the clearest evidence of the second half of this bug.** It now reads
`Quantity=2, Unit='item'`. The quantity `2` is from the *first* run (3 meals); the unit
`'item'` (singular) is from the *second* run (2 meals). The two halves of one row come
from different computations.

**Root cause** — same workflow, node `Insert Meal Ingredients`:

```sql
INSERT INTO WeeklyGroceryList (...) VALUES (...)
ON DUPLICATE KEY UPDATE
  ItemName    = VALUES(ItemName),
  category_id = VALUES(category_id),
  Quantity    = GREATEST(Quantity, VALUES(Quantity)),   -- ratchet: never decreases
  Unit        = COALESCE(VALUES(Unit), Unit)            -- last write wins
```

`Quantity` uses a monotonic ratchet while `Unit` uses last-write-wins. They disagree, so a
re-run can pair an old quantity with a new unit.

**Why `GREATEST` is the wrong operator here — the key insight for the fix:**
`get_recipe_items` recomputes the ingredient set across **all currently selected meals**
on every generation. Each submit is therefore an *authoritative full recomputation*, not
an increment. The correct semantics for a full recompute is **replace**, not max:

```sql
Quantity = VALUES(Quantity),
Unit     = VALUES(Unit)
```

`GREATEST` was presumably chosen to stop a second meal from shrinking a shared item — but
that scenario cannot occur, because the AI already aggregates every selected meal in one
pass (verified: mexican spice blend correctly reported 2 tbsp = 1 + 1 across two recipes).

**Open design question for Corey (do not decide this unilaterally):** if the user
*deselects* an ingredient before submitting, it is simply absent from the payload, so its
existing row survives untouched with a stale quantity. A true full-recompute would delete
meal-ingredient rows for the week that are absent from the new payload. That is a
behaviour change with its own risk (it would discard manual edits), so it is scoped as a
separate task below and gated on approval.

---

### F3 — HIGH: the review screen squares the quantity it displays

**Severity: High.** The last screen before commit shows alarming, wrong numbers.

**Reproduction:** on the *Recipe Grocery List* review screen with recipes 3, 20, 47:

| item | recipe needs | **displayed** |
|---|---|---|
| flour tortillas | 8 pieces | **8 × 8 items** |
| corn tortillas | 6 pieces | **6 × 6 items** |
| green onions | 4 pieces | **4 × 4 items** |
| lime | 2 pieces | **2 × 2 items** |
| carrots | 2 pieces | **2 × 2 items** |

**Root cause** — `src/components/RecipeIngredients.js`. The per-item multiplier is
initialised to the *purchase quantity* rather than to 1:

```js
// :208-210
const quantity = item.QuantitySelected || 1;
preSelectedQuantities.set(item.ItemID.toString(), quantity);
```

and then rendered as multiplier × purchase quantity:

```js
// :400-402
{item.quantity > 1
  ? `${item.quantity} \u00d7 ${item.QuantitySelected}${...}`
  : `${item.QuantitySelected}${...}`}
```

Items whose `purchaseQuantity` is a bare number (`"8"`) parse to a multiplier of 8 and
render `8 × 8`. Items whose `purchaseQuantity` carries a unit word (`"1 lb"`, `"1 small
jar"`) parse to 1 and render normally — which is why the bug only hits unit-less items and
has gone unnoticed.

The stored value is correct (8), so this is display-only — but it is displayed on the
confirmation screen, which is the worst place to be wrong.

---

### F4 — MEDIUM: the quantity multiplier control does nothing

**Severity: Medium.** A visible control with no effect.

The review screen offers a `×1 … ×10` selector per ingredient, and the payload does send
it — `handleAddToMainList` includes `quantity: itemQuantities.get(...)` per item
(`RecipeIngredients.js:68-72`). But the n8n `Transform for DB Input` node **never reads
`item.quantity`**. It derives the stored quantity solely from `QuantitySelected`:

```js
const qs = String(item.QuantitySelected || '1');
const qtyMatch = qs.match(/^([\d.]+)/);
const quantity = qtyMatch ? Math.ceil(parseFloat(qtyMatch[1])) : 1;
```

Setting a tortilla pack to ×3 changes nothing in the database. Combined with F3, this is a
control that both displays a wrong value and has no effect.

---

### F5 — MEDIUM: synonym ingredients never merge, so the shopper buys twice

**Severity: Medium.** Real over-purchasing, visible in historical data.

Ingredient identity is `ItemID = ingredient_id + 1000`, and the `ingredients` catalogue
contains synonym rows that are distinct IDs. They therefore never collide and never merge.

**Evidence from live historical data**, week `2026-04-26`:

| ItemID | ItemName | Quantity | Unit |
|---|---|---|---|
| 1274 | Chicken thighs | 2 | 1 lb package |
| 1802 | **Boneless chicken thighs** | 2 | 1 lb package |
| 1285 | Onion | 1 | item |
| 1244 | **Red onion** | 1 | item |

Two separate lines for chicken thighs — 4 lb bought against 2 lb of need. Week
`2026-06-14` similarly carries both `Onion` and `Yellow onion`.

Catalogue synonyms confirmed present: `bell pepper` / `bell peppers`; `chicken breast` /
`boneless chicken breast` / `boneless skinless chicken breasts` / `chopped chicken breast`.

---

### F6 — MEDIUM: purchase quantity and unit are concatenated, producing garbled text

**Severity: Medium.** Cosmetic but pervasive and confusing at shelf-side.

The AI returns `purchaseQuantity` already containing a unit noun, and the UI appends
`purchaseUnit` to it. Observed verbatim on the review screen:

- `Buy: 1 lb 1 lb package`
- `Buy: 1 small jar small jar`
- `Buy: 1 small can 6 oz can`
- `Buy: 1 head whole head`

Raw agent output confirming the duplication:

```
tomato paste          | buy: 1 lb        + 1 lb package | needs: 6 oz
chipotle chile paste  | buy: 1 small can + 6 oz can     | needs: 2 tsp
garlic                | buy: 1 head      + whole head   | needs: 2 cloves
```

---

### F7 — LOW (latent, high blast radius): unmatched ingredient names all collapse to ItemID 1000

**Severity: Low today, Critical if triggered.** Currently dormant — verified 0 occurrences.

```js
const stableId = (ingredientIdByName[itemNameNorm] || 0) + 1000;
```

Any ingredient name not found in the `ingredients` table gets `ItemID = 1000`. Because
`uq_week_item (week_start_date, ItemID)` permits exactly one row per ItemID per week, the
*second* unmatched ingredient in a week overwrites the first (`ItemName = VALUES(ItemName)`),
the third overwrites the second, and so on — silently.

**Falsification check performed:** `SELECT ... WHERE ItemID = 1000` returns **zero rows
across the entire table history**, so this has never fired. It is currently protected only
by the fact that `get_recipe_items` sources names from the same `ingredients` table. A
single AI rename, or any future free-text ingredient path, triggers silent data loss.

---

### F8 — LOW: the Grocery List screen shows no quantities at all

The screen the shopper actually shops from lists ingredient *names* grouped by meal, with
no quantity or unit. The inflated values from F2 are therefore invisible at the point of
use — they only materialise downstream in the HEB Cart Builder, which adds real quantities
to a real cart.

---

### F9 — LOW: `week_start_date` is re-derived by regex from the display string

`Transform for DB Input` parses the week back out of the human-readable string:

```js
function parseWeekStart(rangeStr) {
  const m = rangeStr.match(/For the week of (\w+) (\w+) to .* (\d{4})/);
  ...
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}
```

The frontend already sends `weekStartDate` in the same payload
(`RecipeIngredients.js:88`). This is a second source of truth that returns `null` on any
copy change to the display string, and `weekly_selections` is keyed by that same display
varchar (`uq_week_recipe (WeekDateRange, recipe_id)`) rather than by a date.

---

### F10 — LOW (a11y): "remove meal" buttons have no accessible name

In the Selected Meals panel the remove buttons are icon-only with `aria-label = null` and
empty text content. Given sub-project G delivered accessibility work, this looks like a
regression or a gap.

---

## Not tested this session

Stated honestly so no one assumes coverage:

- The chat-turn apostrophe bug (audit 146) — not exercised.
- "No recipes found" → 500 with CORS-jargon bubble (FB#11) — not exercised.
- Skip-state (`is_skipped`) survival across meal remove/re-add — known-documented; not re-verified.
- Staple + meal-ingredient `ItemID` collision within one week.
- One-off items (ItemID 100000+) interaction with meal ingredients.

---

## Prioritised remediation plan

Ordered by *shopper harm per unit of fix effort*. **Nothing below is approved; F1 and F2
change live shopping behaviour and should be confirmed before implementation.**

| # | Finding | Severity | Effort | Risk of fix |
|---|---|---|---|---|
| 1 | F1 silent ingredient drop | Critical | S | Medium — changes list contents |
| 2 | F3 squared quantity display | High | XS | Very low — display only |
| 3 | F2 quantity ratchet | High | S | Medium — changes stored numbers |
| 4 | F6 garbled unit text | Medium | XS | Very low |
| 5 | F4 dead multiplier control | Medium | S | Low |
| 6 | F7 ItemID 1000 guard | Low/latent | XS | Very low |
| 7 | F5 synonym merging | Medium | L | High — data modelling |
| 8 | F9 / F10 / F8 | Low | S | Low |

**Recommended first slice: items 1–3.** They are the three defects that make the list
wrong, they are independent of each other, and together they are roughly a day of work.

---

# Implementation Plan — Slice 1 (F3, F1, F2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the meal-planning grocery list faithfully reflect the meals that are
planned — no silently dropped ingredients, no inflated quantities, no squared display.

**Architecture:** Two of the three fixes live in the n8n workflow `Create Grocery List -
Meals` (`CkLhcFEM9Tfc5uxO`) — one in its `Transform for DB Input` Code node and one in the
`Insert Meal Ingredients` SQL. The third is a two-line change in `RecipeIngredients.js`
plus a Jest test. Frontend and workflow changes are independent and can ship separately.

**Tech Stack:** React 18 + CRA (`react-scripts`), Jest via react-scripts, Playwright for
e2e, n8n workflows edited via REST API or `scripts/n8n-wave.mjs`, MySQL 8 (`hsa` on
localhost:3307).

**Spec:** this document, sections F1–F3.

## Global Constraints

- App tests run through **react-scripts, never bare jest**:
  `CI=true npx.cmd react-scripts test --testPathPattern="X" --watchAll=false`.
  A multi-pattern `"A|B"` is broken through the `.cmd` shim — use
  `node node_modules/react-scripts/bin/react-scripts.js test ...`.
- Gates before merging: `npm run lint` → Jest **439 passing** → `npm run test:e2e`
  hermetic **124 passing** (foreground, ~1.7–2.4 min).
- Netlify CI treats ESLint warnings as errors — no unused imports.
- Tailwind JIT: no dynamic class names. `surface-alt` is **not** a token.
- MySQL MCP is read-only. Writes go through
  `docker exec hsa-mysql bash -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 hsa -e "..."'`
  with `MSYS_NO_PATHCONV=1`.
- Every n8n REST call needs **both** `X-N8N-API-KEY` and `Origin` headers. API key lives in
  `C:\hsa-automation\.env` as `N8N_API_KEY`. n8n runs at `http://localhost:5679`.
- `n8n_update_partial_workflow` fails on this n8n version — use `n8n_update_full_workflow`
  (needs `name` + `settings`) or REST `PUT` with settings filtered to known keys.
- **n8n-mcp is working as of 2026-09-17** (`n8n_health_check` → ok). Prior memory saying it
  was broken is stale.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

### Task 1: Fix the squared quantity display (F3)

Smallest, safest, display-only. Ship it first to build confidence in the test loop.

**Files:**
- Modify: `src/components/RecipeIngredients.js:208-210`
- Test: `src/components/RecipeIngredients.test.js` (create if absent)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

```js
// src/components/RecipeIngredients.test.js
import { render, screen } from '@testing-library/react';
import RecipeIngredients from './RecipeIngredients';

const groceryListData = [{
  output: {
    ingredients: [
      { name: 'flour tortillas', category: 'grains',
        purchaseQuantity: '8', purchaseUnit: 'items',
        recipeNeeds: '8 pieces', usedInRecipes: ['Test Recipe'] },
    ],
  },
}];

test('multiplier defaults to 1 so an 8-pack renders as "8 items", not "8 × 8 items"', async () => {
  render(
    <RecipeIngredients
      selectedMeals={[{ id: 1, name: 'Test Recipe', description: '' }]}
      groceryListData={groceryListData}
      onNavigate={() => {}}
      debugMode={false}
    />
  );
  expect(await screen.findByText(/8 items/)).toBeInTheDocument();
  expect(screen.queryByText(/8 × 8/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `CI=true npx.cmd react-scripts test --testPathPattern="RecipeIngredients" --watchAll=false`

Expected: FAIL — the rendered text is `8 × 8 items`.

- [ ] **Step 3: Initialise the multiplier to 1**

In `src/components/RecipeIngredients.js`, replace lines 208-210:

```js
          // Use QuantitySelected from payload, fallback to 1 if not present
          const quantity = item.QuantitySelected || 1;
          preSelectedQuantities.set(item.ItemID.toString(), quantity);
```

with:

```js
          // The multiplier is "how many of the suggested purchase amount to buy".
          // It must start at 1 — seeding it with QuantitySelected made the review
          // screen render `8 × 8 items` for an 8-pack of tortillas (F3).
          preSelectedQuantities.set(item.ItemID.toString(), 1);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `CI=true npx.cmd react-scripts test --testPathPattern="RecipeIngredients" --watchAll=false`

Expected: PASS.

- [ ] **Step 5: Check the sibling render site**

Read `src/components/RecipeIngredients.js:737` — it reads
`itemQuantities.get(...) || item.QuantitySelected || 1`. With the multiplier now always
set to a number, the `|| item.QuantitySelected` fallback can resurrect the bug if the map
ever misses. Change it to:

```js
                const quantity = itemQuantities.get(item.ItemID.toString()) || 1;
```

- [ ] **Step 6: Run the full app suite**

Run: `CI=true npx.cmd react-scripts test --watchAll=false`

Expected: 439 passing (plus the new test).

- [ ] **Step 7: Commit**

```bash
git add src/components/RecipeIngredients.js src/components/RecipeIngredients.test.js
git commit -m "fix(meals): stop squaring the purchase quantity on the review screen

The per-item multiplier was seeded with QuantitySelected instead of 1, so
any ingredient whose purchase quantity was a bare number rendered as N x N —
an 8-pack of tortillas displayed as '8 x 8 items' on the confirmation screen.
Stored values were always correct; this was display-only.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Stop silently dropping recipe ingredients that match a staple name (F1)

**Decision required from Corey before starting.** Three viable behaviours:

- **(a) Keep the ingredient, drop the filter.** Meal ingredients always land in the list.
  Risk: if the matching staple is *also* checked this week, the shopper sees the item twice
  (once under FROM YOUR MEALS, once under its staple category) — though with distinct
  ItemIDs, so no collision.
- **(b) Keep the filter, but only when the staple is actually checked this week.** Most
  faithful to intent. Requires the node to query this week's WGL staples rather than the
  whole catalogue.
- **(c) Keep the filter, but surface it.** Return the dropped names and show
  "2 ingredients are already on your staples list" on the review screen.

**Recommendation: (b), plus the honest count from (c).** It preserves the original intent
(don't duplicate olive oil you always have) while guaranteeing that an unchecked perishable
never vanishes.

**Files:**
- Modify: n8n workflow `CkLhcFEM9Tfc5uxO`, node `Lookup Existing Staples` (SQL) and node
  `Transform for DB Input` (JS).

**Interfaces:**
- Consumes: `$('Webhook').first().json.body.weekStartDate` — already sent by
  `RecipeIngredients.js:88`.
- Produces: unchanged insert payload shape; adds a `droppedAsStaple` count to the response.

- [ ] **Step 1: Capture the current workflow as a rollback artifact**

```bash
source /c/hsa-automation/.env && curl -s \
  -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Origin: http://localhost:5679" \
  "http://localhost:5679/api/v1/workflows/CkLhcFEM9Tfc5uxO" \
  -o "$SCRATCH/CkLhcFEM9Tfc5uxO.before.json"
```

Verify the file is non-empty and contains `"Insert Meal Ingredients"` before proceeding.

- [ ] **Step 2: Write a failing end-to-end assertion (manual, against a scratch week)**

Do **not** test against the live week. Insert a probe row for a future week and assert the
current broken behaviour first, so the fix is provably the thing that changed:

```sql
-- Confirms carrots is a name-colliding staple today
SELECT i.ingredient_name
FROM ingredients i
WHERE EXISTS (SELECT 1 FROM GroceryItems g
              WHERE g.IsActive = TRUE
                AND LOWER(TRIM(g.ItemName)) = LOWER(TRIM(i.ingredient_name)))
  AND i.ingredient_name = 'carrots';
-- expect 1 row
```

- [ ] **Step 3: Change `Lookup Existing Staples` to scope by this week**

Replace that node's query:

```sql
SELECT ItemName FROM GroceryItems WHERE IsActive = TRUE
```

with a query returning only staples actually on this week's list and not skipped:

```sql
SELECT w.ItemName
FROM WeeklyGroceryList w
WHERE w.week_start_date = '{{ $json.body.weekStartDate }}'
  AND w.DataSource = 'Staples'
  AND w.is_skipped = 0
```

- [ ] **Step 4: Make the drop visible in `Transform for DB Input`**

Replace the silent filter with one that counts what it removed:

```js
const droppedAsStaple = [];
const transformedItems = ingredients
  .filter((item) => item.IsSelected === 1)
  .filter((item) => {
    const itemName = (item.ItemName || '').trim().toLowerCase();
    if (stapleNames[itemName]) { droppedAsStaple.push(item.ItemName); return false; }
    return true;
  })
  .map((item) => { /* unchanged */ });

if (transformedItems.length === 0) {
  return [{ json: { hasItems: false, droppedAsStaple } }];
}
transformedItems[0].json.droppedAsStaple = droppedAsStaple;
return transformedItems;
```

- [ ] **Step 5: Push the workflow update**

Use `n8n_update_full_workflow` (needs `name` + `settings`), or REST `PUT` with settings
filtered to known keys. `n8n_update_partial_workflow` does not work on this n8n version.

- [ ] **Step 6: Re-run the reproduction and assert the fix**

Plan recipes 3, 20, 47 for a week, generate, submit, then:

```sql
SELECT COUNT(*) FROM WeeklyGroceryList
WHERE week_start_date = '<test week>' AND DataSource = 'MealIngredients';
-- expect 23, not 21

SELECT ItemName FROM WeeklyGroceryList
WHERE week_start_date = '<test week>' AND ItemName IN ('Carrots','Avocado');
-- expect both present
```

**Clean up the test week afterwards** — record the `id` watermark before writing.

- [ ] **Step 7: Commit the workflow snapshot**

```bash
git add docs/n8n/CkLhcFEM9Tfc5uxO.json
git commit -m "fix(n8n): only suppress meal ingredients that are actually on this week's staples

The staples filter compared recipe ingredients against the whole active
GroceryItems catalogue, so 'carrots' and 'avocado' were deleted from every
meal list even when unchecked for the week — 23 selected, 21 stored, and the
UI reported '21/21' so nothing looked wrong.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Let quantities decrease (F2)

**Files:**
- Modify: n8n workflow `CkLhcFEM9Tfc5uxO`, node `Insert Meal Ingredients` (SQL).

**Interfaces:**
- Consumes: the transformed item shape from Task 2 (unchanged fields
  `ItemID, ItemName, Category, Store, Quantity, Unit, WeekDateRange, WeekStartDate, DataSource`).
- Produces: unchanged.

- [ ] **Step 1: Record the current broken behaviour**

Against a scratch week with two beef recipes planned and submitted, then one removed and
resubmitted:

```sql
SELECT ItemName, Quantity, Unit FROM WeeklyGroceryList
WHERE week_start_date = '<test week>' AND ItemName = 'Ground beef';
-- current (broken): Quantity = 2 after the plan shrank to one 10 oz recipe
```

- [ ] **Step 2: Replace the ratchet with a full-recompute replace**

In node `Insert Meal Ingredients`, change the conflict clause from:

```sql
ON DUPLICATE KEY UPDATE
  ItemName    = VALUES(ItemName),
  category_id = VALUES(category_id),
  Quantity    = GREATEST(Quantity, VALUES(Quantity)),
  Unit        = COALESCE(VALUES(Unit), Unit)
```

to:

```sql
ON DUPLICATE KEY UPDATE
  ItemName    = VALUES(ItemName),
  category_id = VALUES(category_id),
  Quantity    = VALUES(Quantity),
  Unit        = VALUES(Unit)
```

Rationale to keep in the node's notes: `get_recipe_items` recomputes across **all**
selected meals on every generation, so each submit is authoritative. `GREATEST` made the
quantity a one-way ratchet, and pairing it with `COALESCE` on the unit let one row hold a
quantity from run A and a unit from run B (observed: `Lime → 2 "item"`).

- [ ] **Step 3: Verify the decrease now lands**

Repeat the Step 1 scenario:

```sql
SELECT ItemName, Quantity, Unit FROM WeeklyGroceryList
WHERE week_start_date = '<test week>' AND ItemName IN ('Ground beef','Lime','Green onions');
-- expect Ground beef = 1 '1 lb package', Lime = 1 'item', Green onions = 2 'items'
```

- [ ] **Step 4: Verify the increase still lands (regression guard)**

Add a meal back, regenerate, resubmit, and confirm ground beef returns to 2. This proves
replace did not simply invert the bug.

- [ ] **Step 5: Clean up the scratch week and commit**

```bash
git add docs/n8n/CkLhcFEM9Tfc5uxO.json
git commit -m "fix(n8n): let meal-ingredient quantities decrease when the plan shrinks

Quantity used GREATEST while Unit used COALESCE, so quantities were a one-way
ratchet and a row could pair run A's quantity with run B's unit. Because
get_recipe_items recomputes across every selected meal, each submit is
authoritative — replace is the correct semantics.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full gate run before merge

- [ ] **Step 1: Lint**

Run: `npm.cmd run lint` — expect clean (Netlify treats warnings as errors).

- [ ] **Step 2: Jest**

Run: `CI=true npx.cmd react-scripts test --watchAll=false` — expect 439 + new tests passing.

- [ ] **Step 3: Playwright e2e (foreground, ~2 min)**

Run: `npm.cmd run test:e2e` — expect 124 passing.

- [ ] **Step 4: Confirm the live week is clean**

```sql
SELECT id, ItemName, DataSource FROM WeeklyGroceryList
WHERE week_start_date = '2026-09-20' ORDER BY id;
-- expect exactly ids 3688-3693, all DataSource='Staples'
SELECT selection_id, recipe_id FROM weekly_selections
WHERE WeekDateRange = 'For the week of September 20th to September 26th, 2026';
-- expect exactly selection_id 173, recipe_id 3
```

---

## Appendix: test-data ledger for this investigation

All rows below were created during the review and have been **deleted**; verified restored
to baseline.

| table | rows created | disposition |
|---|---|---|
| `weekly_selections` | `selection_id` 174 (recipe 20), 175 (recipe 47) | 174 removed via UI, 175 deleted — verified gone |
| `WeeklyGroceryList` | `id` 3694–3714 (21 MealIngredients rows) | 18 survivors deleted — verified gone |

Baseline restored and confirmed: WGL week `2026-09-20` holds exactly ids 3688–3693 (6
Staples rows); `weekly_selections` holds exactly `selection_id` 173 (recipe 3, Corey's
enchiladas, created 2026-09-17 21:23:06Z). `client_errors` still holds exactly 1 row
(the permanent sentinel). `shopping_progress` for the week: 0 rows.

Revert statements used:

```sql
DELETE FROM WeeklyGroceryList WHERE id >= 3694 AND week_start_date = '2026-09-20';
DELETE FROM weekly_selections WHERE selection_id >= 174
  AND WeekDateRange = 'For the week of September 20th to September 26th, 2026';
```
