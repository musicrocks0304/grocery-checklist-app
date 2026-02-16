-- ============================================================
-- 03: Clean Up Expired Coupons
-- Run periodically (e.g., after each scrape) to prune stale data.
-- ============================================================

-- Preview: See how many coupons are expired
SELECT COUNT(*) AS expired_count
FROM heb_coupons
WHERE expiration_date IS NOT NULL
  AND expiration_date < CURDATE();

-- Soft-delete: Mark expired coupons as inactive (preserves data)
UPDATE heb_coupons
SET is_active = 0
WHERE expiration_date IS NOT NULL
  AND expiration_date < CURDATE()
  AND is_active = 1;

-- Hard-delete (optional): Remove coupons expired more than 30 days ago
-- Uncomment only if you want to permanently remove old coupon data.
-- DELETE FROM heb_coupons
-- WHERE expiration_date IS NOT NULL
--   AND expiration_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY);
