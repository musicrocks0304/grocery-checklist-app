# WeeklyGroceryList Architectural Fix — Design

**Date:** 2026-04-19
**Branch target:** `feature/wgl-architectural-fix`
**Author:** Claude (with user direction)

## Background

The In-Store Mode and Plan screens depend on the `WeeklyGroceryList` (WGL) table as the source of truth for what a user is shopping for in a given week. Two user-facing bugs surfaced on 2026-04-19:

1. **Duplicate aisle categories** — In-Store Mode showed both "Pantry" (9 items) and "Pantry staples" (2 items) as separate aisles, plus "Produce" (8) alongside "Fruit & vegetables" (6), "Dairy" (2) alongside "Dairy & eggs" (3), and unmapped legacy values like "General" (3) and "Seasoning" (1).
2. **Premature shopping-done banner** — The "All Done!" celebration triggered before the user finished checking off all items.

A thorough investigation found these are surface symptoms of a deeper architectural anti-pattern. Free-text identity columns (`Category`, `ItemID`, `WeekDateRange`) on WGL are written by uncoordinated writers with no enforcement, no canonical source-of-truth, and no cascade semantics on downstream references.

### Audit results

The investigation found the following pre-existing data corruption across the production database:

| Table | Issue | Affected rows |
|---|---|---|
| `WeeklyGroceryList.Category` | 19 distinct values vs 14 canonical (5 dirty: "Pantry", "Produce", "Dairy", "Seasoning", "General") | ~50 rows across all weeks |
| `WeeklyGroceryList.ItemID` (OneOff) | All `0`, collide on shopping_progress's `UNIQUE(week, item_id)` | 3 rows |
| `WeeklyGroceryList.ItemID` (MealIngredients) | Frontend-local sequential counter — same ingredient gets different IDs each week (e.g. "Flour tortillas" had IDs 1002, 1012, 1013, 1017 across 7 weeks) | ~250 rows |
| `WeeklyGroceryList.WeekDateRange` | One stranded row using short form ("April 19th to April 25th, 2026") instead of long form | 1 row |
| `shopping_progress` orphans | Selection Uncheck and Remove Weekly Grocery Item delete from WGL but leave shopping_progress entries — accumulates as "phantom checks" inflating `checkedItems.size` | 33 orphan rows across 5 weeks (78% orphan rate on week 2026-03-09) |
| `WeeklyGroceryList` meal-ingredient orphans | Remove Weekly Selection deletes from `weekly_selections` but leaves WGL meal-ingredient rows | 19 orphan rows |
| `coupon_matches.grocery_list_id` | Create Grocery List does DELETE-all + INSERT-all → WGL.id values churn weekly → orphans accumulate | 39 of 39 rows orphaned (already-broken, out of scope) |

The premature-done bug is multi-causal: ItemID=0 collisions, plus stale shopping_progress orphans inflating the checked count, plus weekly-unstable MealIngredient IDs.

## Guiding principle

> **Constraints at write boundaries; let cascade do the cleanup.**

Every WGL writer must normalize its inputs to canonical values. Every downstream table that references WGL must either FK-cascade or be cleaned up by the workflow that mutates WGL. No more denormalized free-text fields used as authoritative identifiers.

## Scope

### In scope (this design)

- Canonical category enforcement at the WGL boundary via FK
- Stable, unique-per-week ItemIDs for OneOff and MealIngredient items
- FK cascade from `shopping_progress` to WGL, with one-time orphan cleanup
- Application-level cascade from `weekly_selections` to WGL meal-ingredient rows
- Replace Create Grocery List's DELETE-all+INSERT-all pattern with diff-based upsert (preserves WGL.id stability)
- WeekDateRange format normalization (single canonical long form across all writers)
- Frontend defense-in-depth on `allDone` calculation
- Walk order moves from JS constant to `categories.walk_order` DB column

### Out of scope (future phase)

- FK enforcement on `GroceryItems.Category` (already canonical, no current bug)
- FK enforcement on `ingredients.ingredient_category` (read-only input, normalized at WGL boundary instead)
- Unifying GroceryItems + ingredients + OneOff into a single Items table
- `coupon_matches` orphan cleanup (already broken pre-existing, no user-facing bug)

## Architecture

### New schema entities

**`categories` table** — single source of truth for the canonical 14-category set:

```sql
CREATE TABLE categories (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(50) NOT NULL UNIQUE,
  walk_order  INT NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO categories (name, walk_order) VALUES
  ('Fruit & vegetables',    1),
  ('Bakery & bread',        2),
  ('Deli & prepared food',  3),
  ('Meat & seafood',        4),
  ('Dairy & eggs',          5),
  ('Cereal & breakfast',    6),
  ('Pasta, rice & grains',  7),
  ('Pantry staples',        8),
  ('Condiments & sauces',   9),
  ('Spices & seasonings',  10),
  ('Snacks',               11),
  ('Beverages',            12),
  ('Household & other',    13),
  ('Frozen food',          14);
```

**`oneoff_items` table** — name-keyed unique IDs for one-off additions:

```sql
CREATE TABLE oneoff_items (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) AUTO_INCREMENT = 100000;
```

`name` UNIQUE enforces same-name-same-ID across weeks. Auto-increment starts at 100000 to keep the range visually distinct from GroceryItems (14-999) and MealIngredients (1000-99999).

### Modified relationships

**`WeeklyGroceryList`:**
- Add `category_id INT NOT NULL` with FK to `categories(id)` (replaces `Category` text)
- Add `week_start_date DATE NOT NULL` (replaces `WeekDateRange` as the machine-readable week reference; `WeekDateRange` remains as display-only)
- Add `UNIQUE(week_start_date, ItemID)` enabling shopping_progress FK
- Final state has stable `id` PKs (no more weekly churn) and FK-enforced category

**`shopping_progress`:**
- Change `week_start_date` from `varchar(20)` to `DATE`
- Add composite FK `(week_start_date, item_id) → WGL(week_start_date, ItemID) ON DELETE CASCADE`

**`heb_cart_sessions`:**
- DROP unused `week_date_range` column (NULL in all 12 rows; dead weight)

### ID stability rules

| DataSource | ItemID source | Range | Stability |
|---|---|---|---|
| Staples | `GroceryItems.ItemID` | 14-999 | Stable forever |
| MealIngredients | `ingredients.ingredient_id + 1000` | 1000-99999 | Stable across weeks (was: weekly-arbitrary frontend counter) |
| OneOff | `oneoff_items.id` | 100000+ | Stable forever, name-keyed (was: hardcoded 0) |

After Phase 2, every WGL row's `(week_start_date, ItemID)` is guaranteed unique within a week.

## Cascade architecture

### `shopping_progress` ← cascades from WGL automatically

```sql
ALTER TABLE shopping_progress
  ADD CONSTRAINT fk_sp_wgl
    FOREIGN KEY (week_start_date, item_id)
    REFERENCES WeeklyGroceryList (week_start_date, ItemID)
    ON DELETE CASCADE;
```

Once this FK is in place, **Selection Uncheck and Remove Weekly Grocery Item need no code changes** — DELETE on WGL cascades to shopping_progress.

### `weekly_selections` ← cascades to WGL meal-ingredient rows (application-level)

The chain `weekly_selections → recipe_id → recipe_ingredients → ingredient_id → WGL.ItemID` is too deep for a clean DB-level FK without denormalizing recipe_id into WGL. Instead, Remove Weekly Selection workflow gains an extra cleanup query:

```sql
DELETE wgl FROM WeeklyGroceryList wgl
WHERE wgl.WeekDateRange = '...'
  AND wgl.DataSource = 'MealIngredients'
  AND NOT EXISTS (
    SELECT 1 FROM weekly_selections ws
    JOIN recipe_ingredients ri ON ri.recipe_id = ws.recipe_id
    WHERE ws.WeekDateRange = wgl.WeekDateRange
      AND ri.ingredient_id + 1000 = wgl.ItemID
  );
```

The shopping_progress FK from above then cascade-cleans any checked items for those removed meal-ingredients automatically. Free win.

### One-time orphan backfill (Phase 2 prep)

```sql
-- 1. Clean shopping_progress orphans (~33 rows across 5 weeks)
DELETE sp FROM shopping_progress sp
LEFT JOIN WeeklyGroceryList wgl
  ON wgl.week_start_date = sp.week_start_date AND wgl.ItemID = sp.item_id
WHERE wgl.id IS NULL;

-- 2. Clean WGL meal-ingredient orphans (~19 rows)
DELETE wgl FROM WeeklyGroceryList wgl
WHERE wgl.DataSource = 'MealIngredients'
  AND NOT EXISTS (
    SELECT 1 FROM weekly_selections ws
    JOIN recipe_ingredients ri ON ri.recipe_id = ws.recipe_id
    WHERE ws.WeekDateRange = wgl.WeekDateRange
      AND ri.ingredient_id + 1000 = wgl.ItemID
  );
```

## Writer changes

### Pull Grocery Staples (READ — Phase 1)

JOIN categories so the response uses canonical names regardless of legacy WGL.Category text:

```sql
SELECT ..., c.name AS Category, ...
FROM ... JOIN categories c ON c.id = wgl.category_id
```

After Phase 3 column drop, JOIN becomes the only source.

### Create Grocery List (Phase 2 — switch to upsert)

Stop the DELETE-all + INSERT-all churn. Diff-based upsert preserves WGL.id stability:

```
1. Resolve category_id once per item from incoming category name.
2. INSERT ... ON DUPLICATE KEY UPDATE quantity, unit (using uq_item_week).
3. DELETE FROM WGL WHERE WeekDateRange = ? AND DataSource = 'Staples'
     AND ItemID NOT IN (incoming ItemIDs)
     -- Cascade automatically cleans shopping_progress for removed items.
```

### Add One-Off Grocery Item (Phase 2)

```sql
-- 1. INSERT INTO oneoff_items (name) VALUES (?) ON DUPLICATE KEY UPDATE id=id;
--    SET @oneoff_id = LAST_INSERT_ID();   -- atomic: existing or new id
-- 2. Resolve category_id from incoming category name (default 'Pantry staples').
-- 3. INSERT INTO WGL (..., ItemID=@oneoff_id, ..., category_id, DataSource='OneOff')
--    ON DUPLICATE KEY UPDATE Quantity = VALUES(Quantity);
```

ItemID is now the stable `oneoff_items.id` (100000+). Same name across weeks reuses the same id.

### Selection Check (Phase 2)

Resolve `category_id` from incoming category name. Normalize `WeekDateRange` to long form. Otherwise existing INSERT ... WHERE NOT EXISTS pattern unchanged.

### Selection Uncheck (Phase 2)

No changes to SQL. shopping_progress cascade handles cleanup automatically. Verification test required.

### Remove Weekly Grocery Item (Phase 2)

No changes to SQL. shopping_progress cascade handles cleanup automatically. Verification test required.

### Create Grocery List - Meals (Phase 2)

Stop using the frontend's local sequential counter. Look up real `ingredients.ingredient_id` by name:

- Items found in `ingredients` table: `ItemID = ingredient_id + 1000`
- Items NOT found (rare new ingredient): INSERT into `ingredients` first, then use new id+1000
- Same name across weeks now produces same WGL.ItemID
- Existing `ON DUPLICATE KEY UPDATE` pattern handles re-runs cleanly

### Remove Weekly Selection (Phase 2)

After existing DELETE FROM `weekly_selections`, add the meal-ingredient orphan cleanup query from the Cascade architecture section above.

## Frontend changes

### Defense-in-depth `allDone` ([InStoreMode.js:1195](src/components/InStoreMode.js#L1195))

```js
const allDone = totalItems > 0 && shoppingList.items.every(
  i => checkedItems.has(String(i.ItemID))
);
```

Robust even if ID semantics ever drift again.

### Category mapping fix ([RecipeIngredients.js:240-265](src/components/RecipeIngredients.js#L240-L265))

Replace `capitalizeCategory` + `getCategorySection` with a single `mapToCanonicalCategory` that translates ingredient categories to canonical 14:

```js
const INGREDIENT_TO_CANONICAL = {
  produce: 'Fruit & vegetables', vegetables: 'Fruit & vegetables', fruits: 'Fruit & vegetables',
  protein: 'Meat & seafood', proteins: 'Meat & seafood',
  dairy: 'Dairy & eggs',
  pantry: 'Pantry staples', grains: 'Pasta, rice & grains',
  seasoning: 'Spices & seasonings', spices: 'Spices & seasonings',
  oils: 'Condiments & sauces', condiments: 'Condiments & sauces',
  baking: 'Pantry staples', canned: 'Pantry staples', sweeteners: 'Pantry staples',
  nuts: 'Snacks', frozen: 'Frozen food', other: 'Pantry staples',
};
```

### Hardening note (added during plan-review pass, 2026-04-19)

Verified the actual data flow during the hardening pass. Two important corrections to the v1 design:

1. **Ingredient Agent (`Ingredient Agent` workflow id `UqXlXX5uPWlGvhU6`) has its own CATEGORY_MAP** that produces non-canonical names ("Produce", "Pantry", "Dairy", "Bakery", "Frozen"). This is the upstream root cause of dirty categories reaching WGL via the meal-ingredients flow. **Fix this workflow's CATEGORY_MAP at the source** (canonical 14 names) rather than relying solely on frontend defense.

2. **`ingredient.ingredient_id` is NOT in the Ingredient Agent webhook response.** The response shape is `{name, category, purchaseQuantity, purchaseUnit, recipeNeeds, usedInRecipes}`. So the frontend cannot pass through a stable `ingredient_id`; the stable-ID resolution happens entirely in the backend (`Create Grocery List - Meals` looks up `ingredients.ingredient_id` by name).

Additional data-flow oddity (out of scope, documented for awareness): **Ingredient Agent has a side-effect write to `weekly_selections`** via its "Transform for Weekly Selections" + "Execute SQL" branch. When meal ingredients are generated, the workflow also INSERT IGNOREs the meal selections. This dual-write is benign (uses INSERT IGNORE) but is one of two paths populating `weekly_selections`.

### ID stability (revised by hardening pass)

Originally proposed passing `ingredient.ingredient_id` from frontend. **Withdrawn** — verified the field doesn't exist in the Ingredient Agent webhook response. Instead, stable ID resolution lives entirely in the backend: `Create Grocery List - Meals` looks up `ingredients.ingredient_id` by ingredient name and writes `ingredient_id + 1000` as the WGL.ItemID. The frontend can keep its local sequential counter (which becomes a no-op label that the backend ignores).

### Walk order from DB ([categories.js](src/constants/categories.js), [InStoreMode.js:786-905](src/components/InStoreMode.js#L786-L905))

- New endpoint: `GET /categories` returns `[{id, name, walk_order}, ...]`
- New helper: `useCategories()` hook fetches once, caches in memory + localStorage
- [InStoreMode.js](src/components/InStoreMode.js) replaces `HEB_WALK_ORDER` import with `useCategories()` result
- localStorage user-override layer stays (`inStoreWalkOrder` reorders the DB-provided list per device)
- [categories.js](src/constants/categories.js) keeps `DEFAULT_CATEGORY = 'Pantry staples'` for fallback; drops `GROCERY_CATEGORIES` and `HEB_WALK_ORDER` constants once API integration is verified

### localStorage cache invalidation

[InStoreMode.js:1051](src/components/InStoreMode.js#L1051) caches `inStoreCheckedItems` keyed by ItemID. After the OneOff migration (0 → 100000+), stale cached IDs would be misaligned for ~1 fetch cycle.

Bump `localStorage.setItem('schema_version', '2')` check; if mismatch, clear `inStoreCheckedItems`, `inStoreShoppingList`, `inStoreWalkOrder` once.

### Not changed

- [HebCart.js](src/components/HebCart.js) — keys on `GroceryItems.ItemID`, untouched by this work
- [GroceryChecklist.js](src/components/GroceryChecklist.js), [StaplesScreen.js](src/components/StaplesScreen.js) — read Category as text from API; no changes (response still returns canonical name string after Phase 1's read-side JOIN)

## Phased deploy plan

Three phases, each independently rollback-able. TDD: failing tests written first for each phase's contracts.

### Phase 1 — Foundation (~1 day)

**No behavior changes for users. Backwards-compatible with existing writers.**

**Schema:**
- CREATE TABLE `categories` + seed 14 rows
- CREATE TABLE `oneoff_items` (empty)
- ALTER WGL: ADD `category_id INT NULL`, ADD `week_start_date DATE NULL`
- Backfill `category_id` via legacy mapping
- Backfill `week_start_date` parsed from WeekDateRange long-form
- Normalize the 1 stranded short-form WGL row to long form

**Workflows:**
- New: `/categories` GET endpoint
- Update: Pull Grocery Staples to JOIN categories

**Frontend:**
- `useCategories` hook
- `mapToCanonicalCategory` helper
- localStorage `schema_version` check

**TDD tests:**
- Categories endpoint returns 14 canonical names in walk order
- Pull Grocery Staples returns canonical names for current week (no "Pantry"/"Produce"/"Dairy" anywhere)
- mapToCanonicalCategory covers every value in `ingredients.ingredient_category`
- useCategories falls back to localStorage, then to DEFAULT_CATEGORY

**Rollback:** Drop new columns and tables; revert frontend imports.

### Phase 2 — Writers + Cascade (~1.5 days)

**All writers normalize inputs. shopping_progress cascade goes live.**

**Schema:**
- One-time orphan backfill (delete ~33 shopping_progress + ~19 WGL meal-ingredient orphans)
- ADD `UNIQUE(week_start_date, ItemID)` to WGL
- ADD FK `shopping_progress(week_start_date, item_id) → WGL(week_start_date, ItemID) ON DELETE CASCADE`

**Workflows updated:**
- Add One-Off Grocery Item — uses `oneoff_items` lookup, writes `category_id`
- Selection Check — resolves `category_id`, normalizes WeekDateRange
- Create Grocery List - Meals — uses real `ingredients.ingredient_id`, writes `category_id`
- Remove Weekly Selection — adds meal-ingredient orphan cleanup
- Create Grocery List — diff-based upsert (no more DELETE-all churn)
- Selection Uncheck and Remove Weekly Grocery Item — no code changes, cascade handles cleanup; verification tests added

**Frontend:**
- [InStoreMode.js](src/components/InStoreMode.js) `allDone` defense-in-depth
- [RecipeIngredients.js](src/components/RecipeIngredients.js) passes real `ingredient_id`

**TDD tests:**
- Add One-Off (new name) creates oneoff_items row, returns id ≥ 100000
- Add One-Off (existing name) reuses same id
- DELETE WGL row → shopping_progress row gone (cascade verified)
- Remove Weekly Selection → meal-ingredient WGL rows gone → shopping_progress rows cascade-cleaned
- Create Grocery List rerun with same items → WGL.id values unchanged
- Create Grocery List - Meals rerun for same recipe → WGL.ItemID stable
- Inserting non-canonical category fails FK check
- allDone returns false when items.length > checkedItems.size despite numeric equality

**Rollback:** Drop FK + UNIQUE, revert workflows. Orphan backfill stays applied (harmless).

### Phase 3 — Cleanup (~0.5 day)

**Lock down. Remove dead weight. Deploy ≥1 week after Phase 2 stabilizes.**

**Schema:**
- ALTER WGL: MODIFY `category_id INT NOT NULL`, ADD FK to categories, DROP `Category` column
- ALTER WGL: MODIFY `week_start_date DATE NOT NULL`
- ALTER `heb_cart_sessions`: DROP `week_date_range` column

**Workflows:**
- Remove all references to legacy `WGL.Category` text column

**Frontend:**
- Drop `GROCERY_CATEGORIES` and `HEB_WALK_ORDER` constants from [categories.js](src/constants/categories.js)
- Bump `schema_version` to invalidate any lingering caches

**Rollback:** Re-add Category column and restore from pre-drop backup. Higher friction; do not deploy Phase 3 until Phase 2 has been live ≥ 1 week with no issues.

## Verification gates

| Gate | Check | How |
|---|---|---|
| End of Phase 1 | All 14 categories show single-bucket in In-Store Mode | Manual smoke test |
| End of Phase 1 | Pull Grocery Staples returns only canonical names | curl + jq distinct count |
| End of Phase 2 | Existing users complete shopping with no errors | Manual end-to-end test on current week |
| End of Phase 2 | New One-Offs get IDs ≥ 100000 | DB query after add |
| End of Phase 2 | Orphan check returns 0 across all weeks | DB query in TDD suite |
| End of Phase 3 | No free-text Category column anywhere | Schema introspection |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Phase 1 backfill mis-maps an ambiguous legacy value | Explicit mapping table reviewed in this doc; "General" → "Pantry staples" by convention; review backfill output before lock-down |
| Phase 2 cascade triggers unexpected deletions during deploy | Backfill orphans BEFORE adding FK; verify count = 0 before constraint add |
| Phase 2 upsert refactor in Create Grocery List has edge case | Phase 2 deploy gated on TDD test suite passing; rollback to DELETE+INSERT pattern available |
| Phase 3 column drops are irreversible | Phase 3 only after ≥1 week of Phase 2 stability; pre-drop DB backup |
| Frontend localStorage misalignment after OneOff ID change | `schema_version` bump forces clean cache on first load post-deploy |
| Existing in-flight shopping interrupted | Phase 1 is read-compat; user can keep shopping during deploy. Phase 2 deploy timed for off-shopping window if possible |

## Acceptance criteria

A user opening In-Store Mode for any current or past week sees:

1. Each canonical category appears at most once in the aisle list
2. The aisle list contains only categories from the canonical 14-set
3. Checking off all visible items triggers the success banner exactly once, when (and only when) every item is actually checked
4. Removing a meal from the Plan screen removes its ingredients from the In-Store list and clears any related shopping checks
5. Adding the same one-off item ("Garlic bread") in two different weeks results in the same identity (same `oneoff_items.id`, no collisions)
6. Re-submitting the Plan screen with no changes does not regenerate WGL.id values

## Open questions for design review

None at this time. All Q&A from the brainstorming session captured above:

- Scope: WGL-only (Option A) — confirmed
- OneOff identity: same name = same ID forever (Option A) — confirmed
- Cascade UX: silent (Option A) — confirmed
- Deploy strategy: phased (Option A) — confirmed

## Next step

Hand off to `writing-plans` skill to produce the executable implementation plan with phase-by-phase commits, test scaffolding, and rollback steps per migration.
