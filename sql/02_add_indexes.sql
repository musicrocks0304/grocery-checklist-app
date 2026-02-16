-- ============================================================
-- 02: Add Indexes on Frequently Queried Columns
-- Safe to run — indexes don't modify data.
-- ============================================================

-- heb_coupons: product_name is searched via LIKE in the AI coupon matching
-- sub-workflow (Search HEB Coupons Tool). A full-text index helps LIKE queries.
-- Note: Regular B-tree indexes don't help with LIKE '%keyword%' queries.
-- Full-text index enables MATCH...AGAINST if you want to optimize further.
ALTER TABLE heb_coupons ADD FULLTEXT INDEX idx_product_name_ft (product_name);

-- heb_coupons: expiration_date is used for cleanup queries
ALTER TABLE heb_coupons ADD INDEX idx_expiration_date (expiration_date);

-- heb_coupons: clipped_status is filtered in coupon display/clip workflows
ALTER TABLE heb_coupons ADD INDEX idx_clipped_status (clipped_status);

-- GroceryItems: IsActive is filtered on every grocery list fetch
ALTER TABLE GroceryItems ADD INDEX idx_is_active (IsActive);

-- GroceryItems: Category is used for grouping in the UI
ALTER TABLE GroceryItems ADD INDEX idx_category (Category);

-- weekly_selections: already has idx_week and idx_recipe — good.
-- WeeklyGroceryList: already has idx_week and idx_item — good.
-- coupon_matches: already has idx_list and idx_coupon — good.

-- NOTE: Existing indexes that are already present (no action needed):
-- WeeklyGroceryList: PRIMARY(id), idx_item(ItemID), idx_week(WeekDateRange), uq_item_week(WeekDateRange,ItemID)
-- heb_coupons: PRIMARY(id), idx_hash_id_unique(hash_id), idx_heb_coupon_id, idx_category, idx_is_active, idx_scraped_at
-- weekly_selections: PRIMARY(selection_id), idx_recipe, idx_week, uq_week_recipe
-- coupon_matches: PRIMARY(id), idx_list, idx_coupon
