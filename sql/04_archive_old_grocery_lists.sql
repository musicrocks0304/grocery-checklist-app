-- ============================================================
-- 04: Archive / Purge Old WeeklyGroceryList Entries
-- Retention policy: Keep last 12 weeks of data.
-- ============================================================

-- IMPORTANT: WeekDateRange is a free-text string like "Feb 16 - Feb 22"
-- or "For the week of September 7th to September 13th, 2025".
-- There's no reliable date parsing for these inconsistent formats.
-- Instead, we use the auto-increment id as a proxy for age.

-- Preview: Count rows by WeekDateRange to see the data distribution
SELECT WeekDateRange, COUNT(*) AS item_count, MIN(id) AS first_id, MAX(id) AS last_id
FROM WeeklyGroceryList
GROUP BY WeekDateRange
ORDER BY first_id DESC;

-- Step 1 (optional): Create archive table to preserve old data
CREATE TABLE IF NOT EXISTS WeeklyGroceryList_archive LIKE WeeklyGroceryList;

-- Step 2: Move old entries to archive (keep last 12 weeks)
-- First, find the cutoff: identify the 12th most recent WeekDateRange
-- Then archive everything older.

-- This query finds the cutoff id. Adjust the LIMIT to change retention.
-- LIMIT 12 = keep the 12 most recent distinct weeks.
SET @cutoff_id = (
  SELECT MIN(min_id) FROM (
    SELECT MIN(id) AS min_id
    FROM WeeklyGroceryList
    GROUP BY WeekDateRange
    ORDER BY MIN(id) DESC
    LIMIT 12
  ) recent_weeks
);

-- Preview what would be archived
SELECT COUNT(*) AS rows_to_archive
FROM WeeklyGroceryList
WHERE id < @cutoff_id;

-- Archive old rows (copy then delete)
-- Uncomment when ready:
-- INSERT INTO WeeklyGroceryList_archive SELECT * FROM WeeklyGroceryList WHERE id < @cutoff_id;
-- DELETE FROM WeeklyGroceryList WHERE id < @cutoff_id;

-- ============================================================
-- RECOMMENDATION: Consider adding a proper DATE column to
-- WeeklyGroceryList (e.g., week_start DATE) so future queries
-- can filter by actual dates instead of parsing free-text strings.
-- ============================================================
