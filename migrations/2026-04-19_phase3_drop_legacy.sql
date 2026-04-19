-- 2026-04-19 Phase 3: Lock down — make new columns NOT NULL, add FK to categories,
-- drop legacy WGL.Category text column, drop unused heb_cart_sessions.week_date_range.
-- Run only AFTER Phase 2 has been live ≥ 1 week with no issues AND all writers
-- have been updated to stop writing the legacy `Category` column.
-- Rollback: re-add columns from backup; restore data from pre-phase3 dump.

-- 1. Lock down WGL.category_id
ALTER TABLE WeeklyGroceryList
  MODIFY COLUMN category_id INT NOT NULL,
  ADD CONSTRAINT fk_wgl_category FOREIGN KEY (category_id) REFERENCES categories(id);

-- 2. Lock down WGL.week_start_date
ALTER TABLE WeeklyGroceryList
  MODIFY COLUMN week_start_date DATE NOT NULL;

-- 3. Drop legacy free-text Category column
ALTER TABLE WeeklyGroceryList
  DROP COLUMN Category;

-- 4. Drop unused heb_cart_sessions.week_date_range column
ALTER TABLE heb_cart_sessions
  DROP COLUMN week_date_range;

-- Verification:
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='WeeklyGroceryList' AND COLUMN_NAME='Category';
-- Expected: empty result (column dropped)
-- SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
--   WHERE CONSTRAINT_SCHEMA='hsa' AND CONSTRAINT_NAME='fk_wgl_category';
-- Expected: 1 row
