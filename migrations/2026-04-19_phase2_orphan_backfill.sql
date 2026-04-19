-- 2026-04-19 Phase 2: Clean shopping_progress and WGL meal-ingredient orphans
-- MUST run before adding the FK constraint in the next migration.
-- Affects ~40 shopping_progress rows + ~169 WGL meal-ingredient rows
-- (orphan counts higher than originally estimated due to historical accumulation).
-- Rollback: irreversible without backup; take a dump first (see Task 2.2).

-- 1. Delete shopping_progress entries that don't match any current WGL row.
DELETE sp FROM shopping_progress sp
LEFT JOIN WeeklyGroceryList wgl
  ON wgl.week_start_date = sp.week_start_date
  AND wgl.ItemID = sp.item_id
WHERE wgl.id IS NULL;

-- 2. Delete WGL meal-ingredient rows that no longer have a matching meal selection.
DELETE wgl FROM WeeklyGroceryList wgl
WHERE wgl.DataSource = 'MealIngredients'
  AND NOT EXISTS (
    SELECT 1 FROM weekly_selections ws
    JOIN recipe_ingredients ri ON ri.recipe_id = ws.recipe_id
    WHERE ws.WeekDateRange = wgl.WeekDateRange
      AND ri.ingredient_id + 1000 = wgl.ItemID
  );

-- Verification:
-- SELECT 'sp_orphans' AS chk, COUNT(*) AS n
-- FROM shopping_progress sp
-- LEFT JOIN WeeklyGroceryList wgl ON wgl.week_start_date=sp.week_start_date AND wgl.ItemID=sp.item_id
-- WHERE wgl.id IS NULL
-- UNION ALL
-- SELECT 'wgl_meal_orphans', COUNT(*)
-- FROM WeeklyGroceryList wgl
-- WHERE wgl.DataSource='MealIngredients' AND NOT EXISTS (
--   SELECT 1 FROM weekly_selections ws JOIN recipe_ingredients ri ON ri.recipe_id=ws.recipe_id
--   WHERE ws.WeekDateRange=wgl.WeekDateRange AND ri.ingredient_id+1000=wgl.ItemID
-- );
-- Expected: both counts = 0
