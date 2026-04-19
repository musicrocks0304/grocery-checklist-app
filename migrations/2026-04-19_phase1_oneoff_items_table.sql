-- 2026-04-19 Phase 1: Create oneoff_items lookup table
-- Purpose: Stable, name-keyed unique IDs for one-off grocery additions.
-- Replaces the hardcoded ItemID=0 used by Add One-Off Grocery Item workflow.
-- Auto-increment starts at 100000 to keep range distinct from GroceryItems (14-999)
-- and MealIngredients (1000-99999).
-- Rollback: DROP TABLE oneoff_items;

CREATE TABLE oneoff_items (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT = 100000;

-- Verification:
-- SELECT AUTO_INCREMENT FROM INFORMATION_SCHEMA.TABLES
--   WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='oneoff_items';
-- Expected: 100000
