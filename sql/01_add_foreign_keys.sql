-- ============================================================
-- 01: Add Missing Foreign Keys
-- REVIEW CAREFULLY before running. Back up the database first.
-- ============================================================

-- ISSUE: WeeklyGroceryList.ItemID is BIGINT but GroceryItems.ItemID is INT.
-- Foreign keys require matching types. Fix the type mismatch first.
ALTER TABLE WeeklyGroceryList MODIFY COLUMN ItemID INT NOT NULL;

-- NOTE: There are currently 237 rows in WeeklyGroceryList that reference
-- GroceryItems that no longer exist (deactivated/deleted). The FK below
-- will fail unless you first clean up orphaned rows. Two options:
--
-- Option A: Delete orphaned rows (data loss - those historical entries are gone)
--   DELETE FROM WeeklyGroceryList WHERE ItemID NOT IN (SELECT ItemID FROM GroceryItems);
--
-- Option B: Skip this FK (recommended for now - historical data is still useful)
--   Just skip the ALTER TABLE below.
--
-- Recommendation: Skip Option A. The orphaned rows are historical grocery list
-- entries where the item was later deactivated. They're still meaningful data.
-- Add the FK only if you want to enforce integrity going forward and are OK
-- losing those 237 historical rows.

-- Uncomment the line below only after resolving orphaned rows:
-- ALTER TABLE WeeklyGroceryList
--   ADD CONSTRAINT fk_weekly_grocery_item
--   FOREIGN KEY (ItemID) REFERENCES GroceryItems(ItemID)
--   ON DELETE RESTRICT;

-- coupon_matches.grocery_list_id -> WeeklyGroceryList.id
-- (coupon_matches table is currently empty, so this is safe to add now)
ALTER TABLE coupon_matches
  ADD CONSTRAINT fk_coupon_match_grocery_list
  FOREIGN KEY (grocery_list_id) REFERENCES WeeklyGroceryList(id)
  ON DELETE SET NULL;

-- coupon_matches.coupon_hash_id -> heb_coupons.hash_id
ALTER TABLE coupon_matches
  ADD CONSTRAINT fk_coupon_match_coupon
  FOREIGN KEY (coupon_hash_id) REFERENCES heb_coupons(hash_id)
  ON DELETE SET NULL;
