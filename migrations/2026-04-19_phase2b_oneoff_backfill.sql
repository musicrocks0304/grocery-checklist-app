-- 2026-04-19 Phase 2b: Backfill oneoff_items to match pre-existing WGL OneOff ItemIDs.
-- Purpose: The Phase 2 migration created oneoff_items with AUTO_INCREMENT starting at 100000,
-- but existing WGL OneOff rows already use ItemIDs in that range (assigned by the OLD dynamic
-- MAX(ItemID)+1 counter in the pre-Phase-2 Add One-Off workflow). Without this backfill,
-- new OneOff inserts via the NEW workflow collide with existing rows on uq_week_item, and
-- the ON DUPLICATE KEY UPDATE clause silently suppresses the new row.
--
-- Fix: seed oneoff_items with (id, name) pairs matching existing WGL OneOff rows so future
-- Add One-Off calls return stable, non-colliding IDs. Bump AUTO_INCREMENT past the max
-- existing WGL OneOff ItemID to keep new names collision-free.
--
-- Rollback: DELETE the seeded rows; ALTER TABLE oneoff_items AUTO_INCREMENT = 100003.

-- 1. Remove the orphan test row from review-verify check
DELETE FROM oneoff_items WHERE name = 'Review-Verify-Test';

-- 2. Seed oneoff_items with the distinct (ItemID, ItemName) pairs observed in WGL.
-- Using INSERT IGNORE in case any of these already exist (re-run safety).
-- The duplicate Garlic bread at ItemID=100003 is intentionally NOT seeded — it is legacy
-- and should be removed by the user on next Plan interaction. New Garlic bread writes
-- will match oneoff_items.id=100002.
INSERT IGNORE INTO oneoff_items (id, name) VALUES
  (100000, 'Birthday Card'),
  (100001, 'cornbbread'),
  (100002, 'Garlic bread');

-- 3. Bump AUTO_INCREMENT past max existing WGL OneOff ItemID (100003) with a small buffer
ALTER TABLE oneoff_items AUTO_INCREMENT = 100010;

-- Verification:
-- SELECT id, name FROM oneoff_items ORDER BY id;
-- Expected: 3 rows (100000 Birthday Card, 100001 cornbbread, 100002 Garlic bread)
-- SELECT AUTO_INCREMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='oneoff_items';
-- Expected: 100010
