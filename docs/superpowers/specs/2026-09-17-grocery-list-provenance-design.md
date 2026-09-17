# Grocery List Provenance — Design

**Status:** design, revised after adversarial review. Nothing implemented.
**Problem source:** TB-4 in `docs/superpowers/plans/2026-09-17-create-recipe-workflow-findings.md`.

> **Revision note (2026-09-17).** The first draft proposed two new `WeeklyGroceryList`
> columns (`recipe_ids JSON`, `is_optional`) populated by the client round-trip. An
> adversarial review killed it, correctly, on evidence:
> - It missed `Pull Grocery Staples` (`JoaR6klT950hwSLB`) — the workflow that actually
>   delivers rows to the screen. New columns would never have reached the client.
> - The data it assumed was "already in hand" is not: `Ingredient Agent` never selects
>   `ri.optional` or `recipe_id`, and `MealCreator.js:393-401` strips `usedInRecipes`
>   before submit.
> - Attribution by id **already exists and is already trusted**: `ItemID = ingredient_id
>   + 1000`, which `Pull Grocery Staples` and `Remove Weekly Selection`'s orphan cleanup
>   both join on. 231/231 current `MealIngredients` rows resolve by that id join; only
>   207/231 resolve by name.
> - Stored columns would go stale on meal removal, because `Remove Weekly Selection`
>   deletes orphans without rewriting survivors.
>
> This design therefore **derives** attribution on read instead of storing it. No DDL.

## The problem, precisely

`WeeklyGroceryList` (WGL) is what the shopper buys. The Grocery List screen does not
render it directly: `useWeekStaples` → `fetch_grocery_items` → `Pull Grocery Staples`
returns the week's rows, and then `src/components/StaplesScreen.js:38-46` performs a
**client-side inner join by lowercased name** against a recipe-derived list, purely to
label each row with a meal for grouping:

```js
// MealIngredients items that matched a known meal get a MealName injected.
// Drop unmatched ones (can't attribute to any meal).
.map((i) => ({ ...i, MealName: itemNameToMeal[i.ItemName.trim().toLowerCase()] || null }))
.filter((i) => i.MealName !== null);
```

The lookup comes from `fetch_weekly_meal_ingredients` (`xgk2OMFwQFjkSWaL`), whose
`Get Ingredients` node excludes optional rows (`AND (ri.optional IS NULL OR ri.optional =
0)`). Optional ingredients are therefore absent from the lookup, the join fails, and the
rows are **dropped from the display while remaining in WGL and in the cart**.

**Reproduced live 2026-09-17**, week `2026-09-20`: 22 rows stored, screen rendered
`FROM YOUR MEALS 18/18`. Hidden: `Sesame oil`, `Sesame seeds`, `Sriracha`, `Scallions`.

**Root cause:** display membership is decided by a name lookup whose only job is grouping.
Optional is one way to fail it; a renamed ingredient or a synonym pair fails it identically.

**Scale (live, after test data was reverted):** 59 optional rows across 19 of 61 recipes.
Several are structural rather than garnish — `Fritos or corn chips` (recipe 59),
`butter lettuce` (55), `baby potatoes` + `zucchini` (30).

### Correction to the findings doc

TB-4 states the hidden items "cannot be checked off in In-Store Mode". **That is wrong.**
`InStoreMode.js:135` builds its list from `fetch_grocery_items`, not
`/api/heb/weekly-items` (line 210 uses that only for coupon chips), and it does not run
StaplesScreen's name join — so In-Store Mode already shows these rows. The Plan/Grocery
List screen is the only surface that hides them. The cart consequence is unchanged.

## Goals

1. **Display membership of a WGL row never depends on a string match.** Every
   `MealIngredients` row for the week is rendered, attributed or not.
2. The UI knows which items are optional and marks them, without hiding them.
3. Optional items are **shown and bought by default** (Corey's decision, 2026-09-17); the
   shopper unticks what they don't want.
4. No behaviour change for the Cart Builder, and none for In-Store Mode beyond what it
   already shows.

## Non-goals

- Changing `is_skipped` semantics, or the name-matched toggle path (`Selection Check` /
  `Selection Uncheck` / `Remove Weekly Grocery Item` all match on `LOWER(TRIM(ItemName))`).
  Those name matches survive this change and are explicitly out of scope.
- The write-path name matches: the `droppedAsStaple` staple filter and
  `ItemID = (ingredientIdByName[name] || 0) + 1000`. Out of scope (F1/F7).
- TB-3's hardcoded ingredient exclusion list, and F5 synonym merging.
- Backfill or history: no screen renders a past week (`StaplesScreen`, `Home` and
  `InStoreMode` all derive the week from `getWeekDates()`).

## Approach: derive attribution, store nothing

`ItemID - 1000 = ingredients.ingredient_id` for every `MealIngredients` row written since
April 2026, and the system already relies on it in two places. Joining that through
`weekly_selections` → `recipe_ingredients` for the requested week yields both facts the UI
needs, recomputed on every read:

- **which recipes contributed** the item (many-to-many, so an aggregate)
- **whether it is optional in all of them** — `MIN(ri.optional)` over contributors, which
  is exactly the AND semantics we want: buy it unless every recipe calls it optional

Deriving rather than storing removes three problems the stored design had: no DDL, no
staleness after `Remove Weekly Selection` (which already prunes by the same id join), and
no divergence between what the cleanup believes and what the row claims.

### Why the unique constraint forces an aggregate

```
uq_week_item  UNIQUE (week_start_date, ItemID)
```

One row per ingredient per week — garlic used by two planned recipes is a single row. A
scalar attribution is impossible; the derivation must aggregate (`JSON_ARRAYAGG` or
`GROUP_CONCAT`) over contributing recipes.

`uq_item_week (ItemID, ItemName, WeekDateRange)` also exists but is strictly weaker: all
1,046 rows have a 1:1 `WeekDateRange` ↔ `week_start_date` mapping, so it can never be the
deciding key. Verified.

## Component changes

**n8n `Pull Grocery Staples` (`JoaR6klT950hwSLB`), node `Pull Current Week Grocery List`**
— the load-bearing change, and the one the first draft missed.

Its second UNION branch already reads WGL and joins the catalogue by id:

```sql
LEFT JOIN ingredients ing ON ing.ingredient_id = WGL.ItemID - 1000
```

Extend that branch to also resolve contributing recipes for the requested week, and add two
fields to **both** UNION branches' column lists (the outer `SELECT` is an explicit list, so
every branch must supply them; the staples branch supplies `NULL`/`0`):

- `RecipeNames` — aggregated names of contributing recipes, or NULL
- `IsOptional` — `MIN(ri.optional)` over contributors, `COALESCE`d to 0

Returning **names** rather than ids keeps the client from needing a second lookup, and the
grouping key stays stable. The join must be constrained to the week's `weekly_selections`
and to `DataSource = 'MealIngredients'`, so that the 7 legacy pre-April-2026 rows written
under an older ItemID scheme (where `ItemID - 1000` resolves to an unrelated ingredient)
cannot be mis-attributed. Note the existing branch aggregates with `GROUP BY` and `MAX()`,
so the new fields must be aggregate-safe.

**`src/components/StaplesScreen.js`**
- Attribute each `MealIngredients` row from `RecipeNames` returned by the query.
- **Delete `.filter((i) => i.MealName !== null)`** — the defect.
- Any row that resolves to nothing buckets under **"Other meal ingredients"** rather than
  disappearing. `ReviewScreen.js:70` already uses that exact label.
- The `useWeekMeals` name lookup is no longer needed for membership. Keep or remove per
  what `ReviewScreen` still needs; it must no longer gate what renders.

**`src/components/staples/MealsCard.js`**
- Render an "optional" marker on rows with `IsOptional = 1`.
- Header count covers every row (`22/22`, not `18/18`).

**n8n `Fetch Weekly Meal Ingredients` (`xgk2OMFwQFjkSWaL`)**
- Drop `AND (ri.optional IS NULL OR ri.optional = 0)`. Once membership no longer depends on
  this lookup the predicate is merely wrong; while anything still consults it, it hides rows.

**No change:** `Create Grocery List - Meals`, `Ingredient Agent`, the client submit
payloads, and the scraper. `/api/heb/weekly-items`
(`heb-coupon-scraper/src/heb-cart-routes.js:1067-1083`) selects explicit columns filtered
only by `is_skipped = 0` and is unaffected. Verified that no other reader of WGL exists in
either repo beyond `shopping_progress` (a JOIN) and `remove_weekly_item`.

## Blast radius

`fetch_grocery_items` also feeds `Home.js:95` (counts), `InStoreMode.js:135` (the in-store
list) and `Deals.js:589`. The change is **additive** — two new fields, no removals, no
changed semantics for existing ones — so those consumers are unaffected, but the response
shape is shared and must be treated as a contract.

## Testing

- **Jest `StaplesScreen`**: a `MealIngredients` row that resolves to no recipe still
  renders, under "Other meal ingredients" — the regression test for the deleted filter.
- **Jest `StaplesScreen`**: a row with `IsOptional = 1` renders, is counted, and is
  **not** filtered — the guard against reintroducing TB-4 by using the hint as a filter.
- **Jest `MealsCard`**: header count equals total rows including optional ones.
- **Contract test** for the `fetch_grocery_items` response shape, since four screens share
  it.
- **SQL-level**: on a scratch week, an ingredient shared by two planned recipes reports
  both recipes, and reports `IsOptional = 0` when either recipe requires it (real
  counterexamples exist: sour cream is optional in 4 recipes and required in 5; lime 2 and
  10).
- **Meal-removal case**: plan two recipes sharing an ingredient, remove one, and confirm
  the surviving row re-attributes to the remaining recipe on the next load — the staleness
  bug the stored design would have had.
- **Live end-to-end**, watermarked with `MAX(id)` (never
  `information_schema.AUTO_INCREMENT` — observed stale by 66 rows on 2026-09-17), revert
  path proven as a no-op DELETE first: stored row count equals displayed count.
- Gates: `npm run lint`, Jest (447 at time of writing — confirm the baseline before
  trusting it), `npm run test:e2e` (124), with any dev server on port 3000 killed first.

## Rollback

No DDL, so rollback is per-artifact and order-independent in principle. In practice revert
in this order to avoid a window where the client expects fields the query no longer
returns:

1. Revert `StaplesScreen.js` / `MealsCard.js` (redeploy).
2. Revert `Pull Grocery Staples` and `Fetch Weekly Meal Ingredients` via REST `PUT`.

Capture both workflows to JSON before editing. n8n has no atomic multi-workflow revert, so
each is restored individually.

## Risks

1. **`IsOptional` gets used as a filter later**, reintroducing TB-4 exactly. Mitigated by
   the Jest test asserting an optional row renders and counts, and by naming it a hint.
2. **The derivation join mis-attributes legacy rows.** Mitigated by constraining to the
   week's `weekly_selections` and `DataSource = 'MealIngredients'`; the "Other meal
   ingredients" bucket catches the rest instead of dropping them.
3. **Query cost.** `Pull Grocery Staples` is on the critical path for four screens and this
   adds a two-table join inside an aggregate. Measure before and after; the week's row
   count is small (tens), so this should be noise, but it should be measured rather than
   assumed.
4. **Goal 1 is narrow by design.** Name matching survives on the write path and in the
   toggle endpoints. Listed as non-goals so nobody reads Goal 1 as a stronger promise than
   it is.
