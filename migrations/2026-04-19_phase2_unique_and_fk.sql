-- 2026-04-19 Phase 2: Add UNIQUE(week_start_date, ItemID) on WGL,
-- change shopping_progress.week_start_date to DATE,
-- add FK shopping_progress -> WGL ON DELETE CASCADE.
-- Run AFTER orphan backfill (otherwise FK creation will fail).
-- Rollback:
--   ALTER TABLE shopping_progress DROP FOREIGN KEY fk_sp_wgl;
--   ALTER TABLE shopping_progress MODIFY COLUMN week_start_date VARCHAR(20) NOT NULL;
--   ALTER TABLE WeeklyGroceryList DROP INDEX uq_week_item;

-- 1. Add UNIQUE on (week_start_date, ItemID) — load-bearing for FK below.
ALTER TABLE WeeklyGroceryList
  ADD UNIQUE KEY uq_week_item (week_start_date, ItemID);

-- 2. Convert shopping_progress.week_start_date to DATE so FK types match.
-- Existing values like '2026-04-19' parse cleanly.
ALTER TABLE shopping_progress
  MODIFY COLUMN week_start_date DATE NOT NULL;

-- 3. Add the FK with ON DELETE CASCADE.
ALTER TABLE shopping_progress
  ADD CONSTRAINT fk_sp_wgl
    FOREIGN KEY (week_start_date, item_id)
    REFERENCES WeeklyGroceryList (week_start_date, ItemID)
    ON DELETE CASCADE;

-- Verification:
-- SHOW CREATE TABLE shopping_progress;
-- Expected: contains FOREIGN KEY (`week_start_date`, `item_id`) REFERENCES `WeeklyGroceryList` ... ON DELETE CASCADE
