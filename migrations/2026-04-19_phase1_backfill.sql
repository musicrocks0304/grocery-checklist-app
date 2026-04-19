-- 2026-04-19 Phase 1: Backfill category_id, week_start_date, normalize stranded rows.
-- Run AFTER Tasks 1.3, 1.5, 1.7 are complete.
-- Idempotent: rerunning produces same end state (UPDATE WHERE clauses are conditional).
-- Rollback:
--   UPDATE WeeklyGroceryList SET category_id = NULL;
--   UPDATE WeeklyGroceryList SET week_start_date = NULL;

-- 1. Normalize the 1 stranded short-form WeekDateRange row.
UPDATE WeeklyGroceryList
SET WeekDateRange = 'For the week of April 19th to April 25th, 2026'
WHERE WeekDateRange = 'April 19th to April 25th, 2026';

-- 2. Backfill category_id with legacy mapping.
UPDATE WeeklyGroceryList wgl
JOIN categories c ON c.name = (
  CASE wgl.Category
    WHEN 'Pantry'    THEN 'Pantry staples'
    WHEN 'Produce'   THEN 'Fruit & vegetables'
    WHEN 'Dairy'     THEN 'Dairy & eggs'
    WHEN 'Seasoning' THEN 'Spices & seasonings'
    WHEN 'General'   THEN 'Pantry staples'
    ELSE wgl.Category
  END
)
SET wgl.category_id = c.id
WHERE wgl.category_id IS NULL;

-- 3. Backfill week_start_date by parsing WeekDateRange.
UPDATE WeeklyGroceryList
SET week_start_date = STR_TO_DATE(
  CONCAT(
    SUBSTRING_INDEX(SUBSTRING_INDEX(WeekDateRange, ' to ', 1), 'For the week of ', -1),
    ', ',
    SUBSTRING_INDEX(WeekDateRange, ', ', -1)
  ),
  '%M %D, %Y'
)
WHERE week_start_date IS NULL;

-- Verification:
-- SELECT COUNT(*) AS total, SUM(category_id IS NULL) AS missing_cat, SUM(week_start_date IS NULL) AS missing_date FROM WeeklyGroceryList;
-- Expected: total=800, missing_cat=0, missing_date=0
