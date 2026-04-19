-- 2026-04-19 Phase 1: Create canonical categories table
-- Purpose: Single source of truth for the 14 grocery categories used across the app.
-- Replaces hardcoded GROCERY_CATEGORIES + HEB_WALK_ORDER frontend constants.
-- Rollback: DROP TABLE categories;

CREATE TABLE categories (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(50) NOT NULL UNIQUE,
  walk_order  INT NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO categories (name, walk_order) VALUES
  ('Fruit & vegetables',    1),
  ('Bakery & bread',        2),
  ('Deli & prepared food',  3),
  ('Meat & seafood',        4),
  ('Dairy & eggs',          5),
  ('Cereal & breakfast',    6),
  ('Pasta, rice & grains',  7),
  ('Pantry staples',        8),
  ('Condiments & sauces',   9),
  ('Spices & seasonings',  10),
  ('Snacks',               11),
  ('Beverages',            12),
  ('Household & other',    13),
  ('Frozen food',          14);

-- Verification:
-- SELECT id, name, walk_order FROM categories ORDER BY walk_order;
-- Expected: 14 rows in walk_order sequence 1-14
