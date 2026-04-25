# Skip meal-ingredient items via `is_skipped` flag

**Date:** 2026-04-25
**Author:** Claude Opus 4.7 (1M context) + Corey Brosam
**Bug:** [`app_feedback` #40](file:///hsa/app_feedback) — "no way to just confirm the edits this weeks list. Like if I want to uncheck 'salt', 'sugar', and 'brown rice'"

---

## Problem

User unchecks an item in the Plan / Grocery Staples view (e.g. Sugar). The optimistic UI shows it unchecked, but on reload the item returns checked. Two layered causes:

1. **Date drift bug** (already fixed in `weekDates.js` earlier today): `formatDateForSQL` used `toISOString()` which shifted dates forward in evening hours. The `selection_uncheck` payload sent `weekStartDate=2026-04-27` while the WGL row had `week_start_date=2026-04-26`. DELETE matched 0 rows. Fixed in [src/utils/weekDates.js:86-94](src/utils/weekDates.js#L86-L94).

2. **DataSource semantic gap** (this design addresses): even with the date fix, items where `DataSource='MealIngredients'` (added by recipes) cannot be unchecked. `Selection Uncheck` only targets `DataSource='Staples'` rows. The user wants to skip purchasing Sugar (already has it on hand) without removing the recipe that needs it.

## Goal

Let the user soft-remove any item from this week's shopping list — Staples, MealIngredients, or OneOff — without losing the recipe→ingredient relationship. Recipe view still shows the ingredient. Shopping list (Plan / In-Store / HEB Cart) excludes it.

## Approach: `is_skipped` flag (chosen)

Add a soft-delete flag to `WeeklyGroceryList`. Uncheck sets `is_skipped=1`. Reader treats skipped rows as IsSelected=0. Re-checking flips back to 0.

### Why not alternatives

- **Hard delete with auto-revert** (uncheck deletes; meal pipeline re-adds next time): unintuitive — items vanish then reappear. Bad UX.
- **UI-only "stuck to meal" badge** (no data change): doesn't actually let the user skip the purchase.

## Schema migration

```sql
ALTER TABLE WeeklyGroceryList
  ADD COLUMN is_skipped TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'User soft-removed from this week''s shopping list (already has on hand). Recipe link stays intact.',
  ADD COLUMN skipped_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'Timestamp when is_skipped was last set to 1.',
  ADD INDEX idx_week_skipped (week_start_date, is_skipped);
```

Additive, default 0 — all existing rows behave as before.

## Affected components

| Component | Type | Change |
|---|---|---|
| `Pull Grocery Staples` (JoaR6klT950hwSLB) | n8n workflow (reader) | Filter `is_skipped=1` from `IsSelected` derivation |
| `Selection Uncheck` (IgQIsJCu5RZ9TYKJ) | n8n workflow (writer) | DELETE → UPDATE `is_skipped=1` (uniform across DataSource) |
| `Selection Check` (DIOBZkmtBz543RLN) | n8n workflow (writer) | Add UPDATE `is_skipped=0` step before INSERT |
| `heb-cart-routes.js` `/api/heb/weekly-items` | clip-server route | Filter `is_skipped=0` (also fix latent bug below) |

### Latent bug found during audit

The clip-server `/api/heb/weekly-items` route currently selects `wgl.Category`, but that column was **dropped in WGL-Fix Phase 3**. The route is currently broken (would error on any request that reaches the SELECT). Plan to fix incidentally: replace `wgl.Category` with `LEFT JOIN categories c ON c.id = wgl.category_id` and select `c.name AS Category`.

### Confirmed independent (no change needed)

- `Smart Deals - Match Frequent to Coupons` (PSRbvFrHGRHdBjdf) — reads `heb_frequent_products` + `heb_coupons`, not WGL.
- `Match Coupons AI` (CuaKAgmacIOTN6vW) — receives items from request body; frontend already filters by `IsSelected===1` (which the updated reader will compute correctly).
- `Smart Match Grocery Items` / `hebSmartMatch` — receives items from request body, not WGL.
- Recipe Ingredients screen — reads `recipe_ingredient_list`, unaffected.
- Cook screen — reads `recipe_summary`/`recipe_instructions`, unaffected.

## SQL changes

### `Pull Grocery Staples` reader

LEFT JOIN subquery: add `is_skipped` aggregate.

```sql
LEFT JOIN (
  SELECT TRIM(LOWER(ItemName)) AS item_key,
         MAX(Quantity) AS MaxQuantity,
         MAX(Unit) AS Unit,
         CASE WHEN SUM(CASE WHEN DataSource='Staples' THEN 1 ELSE 0 END) > 0
              THEN 'Staples' ELSE MAX(DataSource) END AS DataSource,
         MIN(is_skipped) AS is_skipped
  FROM WeeklyGroceryList
  WHERE WeekDateRange = ?
  GROUP BY TRIM(LOWER(ItemName))
) AS CW ON TRIM(LOWER(GI.ItemName)) = CW.item_key
```

`MIN(is_skipped)` = 0 if any matching row is not skipped. Multi-row case (rare) falls back to "visible" if any source row is active.

IsSelected derivation:

```sql
CASE
  WHEN CW.item_key IS NOT NULL
   AND COALESCE(CW.is_skipped, 0) = 0
  THEN 1 ELSE 0
END AS IsSelected
```

The UNION branch (OneOff items not in catalog): same pattern, `MIN(COALESCE(WGL.is_skipped, 0)) = 0` controls IsSelected. Skipped OneOffs still appear in the list with IsSelected=0 so user can re-check; phase 2 could hide them.

### `Selection Uncheck` writer

Replace current `DELETE FROM WeeklyGroceryList WHERE LOWER(TRIM(ItemName))=? AND week_start_date=? AND DataSource='Staples'` with:

```sql
UPDATE WeeklyGroceryList
SET is_skipped = 1, skipped_at = NOW()
WHERE LOWER(TRIM(ItemName)) = LOWER(TRIM(?))
  AND week_start_date = ?
```

Removes the `DataSource='Staples'` filter — uniform soft-delete across all sources.

### `Selection Check` writer

Two MySQL nodes connected serially. **Step 1: clear flag if row exists.**

```sql
UPDATE WeeklyGroceryList
SET is_skipped = 0, skipped_at = NULL
WHERE LOWER(TRIM(ItemName)) = LOWER(TRIM(?))
  AND week_start_date = ?
```

**Step 2: insert if missing** (existing logic, unchanged).

```sql
INSERT INTO WeeklyGroceryList (...)
SELECT ... FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM WeeklyGroceryList
  WHERE LOWER(TRIM(ItemName)) = LOWER(TRIM(?))
    AND WeekDateRange = ?
)
```

Race-safe even without explicit transaction: UPDATE matches existing rows (sets flag=0); if no match, INSERT fires. If another writer adds the row between steps, INSERT's NOT EXISTS check skips. End state: row exists with `is_skipped=0`. ✓

### Clip-server `/api/heb/weekly-items` route

Two changes in one PR:

1. **Add `is_skipped` filter:** `WHERE wgl.WeekDateRange = ? AND wgl.is_skipped = 0`
2. **Fix dropped Category column:** replace `wgl.Category` with `LEFT JOIN categories c ON c.id = wgl.category_id` + select `c.name AS Category`

```sql
SELECT wgl.id, wgl.ItemID, wgl.ItemName, c.name AS Category, wgl.Store, wgl.Quantity,
       wgl.Unit, wgl.WeekDateRange,
       cm.coupon_hash_id, cm.confidence AS coupon_confidence, cm.user_accepted AS coupon_user_accepted,
       hc.product_name AS coupon_product_name, hc.savings_amount AS coupon_savings,
       hc.discount AS coupon_discount, hc.image_url AS coupon_image_url,
       hc.clipped_status AS coupon_clipped, hc.brand AS coupon_brand
FROM WeeklyGroceryList wgl
LEFT JOIN categories c ON c.id = wgl.category_id
LEFT JOIN coupon_matches cm ON cm.grocery_list_id = wgl.id
LEFT JOIN heb_coupons hc ON hc.hash_id = cm.coupon_hash_id AND hc.is_active = 1
WHERE wgl.WeekDateRange = ?
  AND wgl.is_skipped = 0
ORDER BY c.name, wgl.ItemName
```

## Frontend changes

**None.** `useWeekStaples.toggle()` keeps its current shape: optimistic UI flip + POST `selection_check`/`selection_uncheck`. The DB semantics change server-side; the UI sees IsSelected=0 vs 1 the same way.

Phase 2 could add a tooltip on meal-ingredient items: "From: Shawarma Bowls — uncheck to skip purchase." Out of scope here.

## Rollout sequence

Order matters because reader and writer must agree on the column's semantics.

1. **Migration** — `ADD COLUMN is_skipped` (additive; all existing rows default to 0; current behavior preserved).
2. **Reader** — update `Pull Grocery Staples` to consider `is_skipped` (still works with all-zeros — no behavior change yet).
3. **Reader** — update clip-server `/api/heb/weekly-items` route (combined with the dropped-Category fix; deploy clip-server container).
4. **Writers** — update `Selection Uncheck` + `Selection Check` (now soft-delete + flag-clear).
5. **Behavioral verification:** uncheck Sugar → reload → Sugar absent from Plan staples list, In-Store Mode, HEB Cart Builder.

If the writer ships before the reader, soft-deleted items would still appear as IsSelected=1 — worse than today. The migration → reader → writer order prevents this.

## Rollback path

`ALTER TABLE WeeklyGroceryList DROP COLUMN is_skipped, DROP COLUMN skipped_at, DROP INDEX idx_week_skipped`. All readers/writers fall back to the prior behavior. No data loss because no rows are deleted in the new flow — they're just flagged.

## Limitations (accepted for v1)

1. **Skip is lost on meal remove-and-readd.** The `Remove Weekly Selection` workflow's "Cleanup Orphan Meal Ingredients" hard-deletes the row entirely on meal removal. Re-adding the meal recreates a fresh row with `is_skipped=0`. The user's prior "I have it on hand" decision is forgotten. Document in release notes; could be addressed by also soft-deleting the meal-ingredient row in the cleanup step.

2. **Stale `shopping_progress` rows for skipped items.** Soft-delete bypasses the FK CASCADE that hard-delete would trigger. Harmless because In-Store Mode hides skipped items via the updated reader. Could add a periodic cleanup later.

3. **Skipped OneOffs stay visible** with IsSelected=0. Allows user to re-check to recover. Phase 2 could add a "permanently delete" affordance.

## Tests

- Add `useWeekStaples.test.js` test: toggle on a meal-ingredient item produces `selection_uncheck` POST (existing test) — verify the backend response succeeds (current test only checks the URL).
- Manual behavioral: uncheck Sugar (a MealIngredient) → reload Plan → Sugar gone. Verify Recipe Ingredients screen still shows Sugar. Verify In-Store Mode list doesn't include Sugar. Verify HEB Cart Builder list doesn't include Sugar.

## Risks

- **Atomicity between reader/writer deploys.** Migration → reader → writer order eliminates the bad window. If a deploy is interrupted between reader and writer, behavior is identical to current state (all rows visible).
- **Index choice.** `idx_week_skipped (week_start_date, is_skipped)` matches the writer's lookup pattern. Doesn't help the reader's `WeekDateRange` lookup (separate string column). Acceptable — reader query already uses existing indexes effectively.

## Decisions deferred

- UI affordance for meal-ingredient items (tooltip / source badge).
- Cleanup pass for stale `shopping_progress`.
- "Permanent delete" path for OneOffs.
- Whether to soft-delete the meal-ingredient row in `Remove Weekly Selection` cleanup (would preserve skip across meal remove-and-readd cycles).

## References

- [WGL Architectural Fix design](2026-04-19-wgl-architectural-fix-design.md) — context for WGL schema
- [src/utils/weekDates.js:86-94](../../../src/utils/weekDates.js#L86-L94) — date drift fix already applied
- [src/components/HebCart.js:545-560](../../../src/components/HebCart.js#L545-L560) — `loadGroceryItems` call site
- [heb-cart-routes.js:981](../../../../heb-coupon-scraper/src/heb-cart-routes.js#L981) — `/api/heb/weekly-items` route
