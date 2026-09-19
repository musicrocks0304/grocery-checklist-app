-- =============================================================================
-- 2026-09-18 -- purchase-need slice 1: units.to_base + WeeklyGroceryList.RecipeMultiplier
-- Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md, section 1
-- Plan: docs/superpowers/plans/2026-09-18-purchase-need-slice-1.md, Task 3
--
-- PURPOSE
--   units.to_base DECIMAL(10,4) NULL
--       Factor to the base unit, seeded with EXACT parity to the only conversion
--       the pipeline has, `Aggregate Ingredients` in the Ingredient Agent:
--         TO_TSP = { teaspoon 1, tablespoon 3, cup 48, pint 96, quart 192 }  (volume)
--         TO_OZ  = { ounce 1, pound 16 }                                    (weight)
--       Every other unit stays NULL and is a COUNTED unit (fluid ounce, gram,
--       piece, clove, ...). Parity beats completeness: the pre-submit screen
--       renders from the JS conversion and every later screen from this column.
--   WeeklyGroceryList.RecipeMultiplier TINYINT UNSIGNED NULL
--       The review screen's xN, stored so the recipe need is DERIVED at read time
--       as need x N (`Pull Grocery Staples`). NULL = x1, so every existing row is
--       already correct.
--
-- EXECUTION
--   Not run from here. The statements below (without these comments -- an n8n
--   query field is a JS template literal) live in the one-shot workflow
--   scripts/n8n-workflows/migration-purchase-need-columns.json, which is created,
--   activated, called ONCE, and deactivated. See migrations/README.md.
--
-- ROLLBACK -- ORDER MATTERS
--   1. FIRST restore these n8n workflows from the .n8n-backups/pre-save/ files
--      written when the purchase_need_* edits were applied (plan Tasks 4-6):
--        CkLhcFEM9Tfc5uxO  Create Grocery List - Meals  (writes RecipeMultiplier)
--        JoaR6klT950hwSLB  Pull Grocery Staples         (reads RecipeMultiplier AND to_base)
--      A query that names a dropped column fails EVERY list load / meal submit.
--   2. THEN:
--        ALTER TABLE WeeklyGroceryList DROP COLUMN RecipeMultiplier;
--        ALTER TABLE units DROP COLUMN to_base;
--   Pre-migration copy of `units`: .n8n-backups/db/2026-09-18-units-before-purchase-need.sql
-- =============================================================================

ALTER TABLE units ADD COLUMN to_base DECIMAL(10,4) NULL DEFAULT NULL;

UPDATE units SET to_base = CASE unit_name
  WHEN 'teaspoon' THEN 1
  WHEN 'tablespoon' THEN 3
  WHEN 'cup' THEN 48
  WHEN 'pint' THEN 96
  WHEN 'quart' THEN 192
  WHEN 'ounce' THEN 1
  WHEN 'pound' THEN 16
  ELSE NULL
END;

ALTER TABLE WeeklyGroceryList ADD COLUMN RecipeMultiplier TINYINT UNSIGNED NULL DEFAULT NULL AFTER Unit;

-- VERIFY (run separately)
--   SHOW COLUMNS FROM units LIKE 'to_base';                       -- decimal(10,4), YES (nullable)
--   SHOW COLUMNS FROM WeeklyGroceryList LIKE 'RecipeMultiplier';  -- tinyint unsigned, YES
--   SELECT unit_name, unit_type, to_base FROM units WHERE to_base IS NOT NULL ORDER BY unit_type, to_base;
--     exactly 7 rows: teaspoon 1, tablespoon 3, cup 48, pint 96, quart 192 (volume);
--                     ounce 1, pound 16 (weight)
--   SELECT COUNT(*) FROM WeeklyGroceryList WHERE RecipeMultiplier IS NOT NULL;  -- 0 right after
--   Full parity: node scripts/purchase-need/check-to-base.mjs
