-- 2026-09-18 — remove recipe 36's double-saved ingredient rows
--
-- Recipe 36 ("Pork Chorizo Meatballs & Pepper Rice") held every one of its 10
-- ingredients twice: recipe_ingredient_id 350-359 are exact copies of 340-349 —
-- same ingredient, quantity, unit, preparation_notes (NULL on nine, 'mini' on one,
-- matching its original), optional flag and ingredient_order 1-10, checked null-safe
-- column by column before deleting.
-- Both need producers sum every row, so the recipe asked for 20 oz of chorizo and
-- 1 cup of jasmine rice for a recipe that needs half of each — and In-Store Mode
-- is where that would be bought.
--
-- NOT the same as recipe 59, whose 3 duplicated pairs are genuine ("first dump
-- seasoning" / "second dump seasoning") and are deliberately left alone.
--
-- Safe to delete: no foreign key references recipe_ingredients, and recipe 36 was
-- in no weekly_selections row, so no WeeklyGroceryList row changes.
--
-- Found by the second adversarial review of
-- docs/superpowers/specs/2026-09-18-purchase-need-design.md. Approved by Corey
-- 2026-09-18.
--
-- There is no unique key that would have prevented this. A key on
-- (recipe_id, ingredient_id) would also reject recipe 59's legitimate rows, so any
-- such key needs ingredient_order or preparation_notes in it — a separate decision.

DELETE FROM recipe_ingredients
WHERE recipe_id = 36 AND recipe_ingredient_id BETWEEN 350 AND 359;

-- Verify: expect rows = 10, dup_pairs = 0.
-- SELECT COUNT(*) AS rows_,
--        COUNT(*) - COUNT(DISTINCT ingredient_id) AS dup_pairs
-- FROM recipe_ingredients WHERE recipe_id = 36;

-- ROLLBACK — restores the exact rows, original ids included:
-- INSERT INTO `recipe_ingredients` VALUES (350,36,361,10.000,11,NULL,0,1);
-- INSERT INTO `recipe_ingredients` VALUES (351,36,31,0.500,1,NULL,0,2);
-- INSERT INTO `recipe_ingredients` VALUES (352,36,244,1.000,14,NULL,0,3);
-- INSERT INTO `recipe_ingredients` VALUES (353,36,14,2.000,14,'mini',0,4);
-- INSERT INTO `recipe_ingredients` VALUES (354,36,222,0.250,1,NULL,0,5);
-- INSERT INTO `recipe_ingredients` VALUES (355,36,8,2.000,2,NULL,0,6);
-- INSERT INTO `recipe_ingredients` VALUES (356,36,159,0.250,1,NULL,0,7);
-- INSERT INTO `recipe_ingredients` VALUES (357,36,362,1.000,2,NULL,0,8);
-- INSERT INTO `recipe_ingredients` VALUES (358,36,363,1.000,2,NULL,0,9);
-- INSERT INTO `recipe_ingredients` VALUES (359,36,364,2.000,2,NULL,0,10);
