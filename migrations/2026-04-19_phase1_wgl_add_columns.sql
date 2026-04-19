-- 2026-04-19 Phase 1: Add nullable category_id and week_start_date to WGL
-- Purpose: Additive migration to allow Phase 1 backfill before Phase 3 lock-down.
-- Both columns are nullable now; Phase 3 will MODIFY to NOT NULL after backfill.
-- Rollback:
--   ALTER TABLE WeeklyGroceryList DROP COLUMN category_id;
--   ALTER TABLE WeeklyGroceryList DROP COLUMN week_start_date;

ALTER TABLE WeeklyGroceryList
  ADD COLUMN category_id INT NULL AFTER Category,
  ADD COLUMN week_start_date DATE NULL AFTER WeekDateRange,
  ADD INDEX idx_category_id (category_id),
  ADD INDEX idx_week_start_date (week_start_date);

-- Verification:
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
--   FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='WeeklyGroceryList'
--     AND COLUMN_NAME IN ('category_id','week_start_date');
-- Expected: 2 rows, both nullable
