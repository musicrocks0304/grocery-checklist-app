-- 2026-09-18 — seed the pantry items TB-3 stopped excluding, so the staples
-- system can actually suppress them.
--
-- TB-3 removed a hardcoded SQL exclusion in `Ingredient Agent` ->
-- `Fetch Recipe Ingredients`:
--
--   AND i.ingredient_name NOT IN ('salt','pepper','water','black pepper','olive oil')
--
-- which silently and permanently dropped those ingredients from every meal
-- list, and did so inconsistently: `salt` (38 recipes) was excluded while
-- `kosher salt` (11) was not, so whether the shopper was told to buy pantry
-- salt depended purely on which string a recipe happened to use.
--
-- The replacement is the staples system: `Lookup Existing Staples` in
-- `Create Grocery List - Meals` drops a meal ingredient whose name matches a
-- staple the shopper has checked FOR THAT WEEK — visible, per-week, reversible.
--
-- That mechanism can only suppress a name that EXISTS as a GroceryItems staple
-- row, and of the five excluded names only `Olive oil` did (ItemID 79,
-- Type = 'Periodic'). These three rows close that gap. `pepper` on its own is
-- used by no recipe in the catalogue, so it needs no row; `water` keeps its
-- exclusion in SQL because tap water is a recipe instruction, not a grocery.
--
-- Type = 'Periodic' matches `Olive oil`: bought occasionally, not every week.
-- Category/category_id 10 ('Spices & seasonings') matches `Oregano`.
--
-- NOTE — expected side effect. `Pull Grocery Staples` joins GroceryItems to
-- WeeklyGroceryList on TRIM(LOWER(ItemName)), so these three names now collide
-- with the `ingredients` rows of the same name, exactly as Avocado, Carrots,
-- Honey, Kale, Olive oil and Oregano already do. Meal attribution survives the
-- collision because it is derived INSIDE the CW subquery from the
-- WeeklyGroceryList row's own ItemID (ItemID - 1000 = ingredient_id) rather than
-- from the surfaced GroceryItems ItemID — verified live on 2026-09-18: a meal
-- row "Salt" (ItemID 1011) surfaced as GroceryItems ItemID 347 and was still
-- filed under its recipe on both the list and the review screen.
--
-- Rollback:  DELETE FROM GroceryItems WHERE ItemID > 344;
-- (Watermark taken before applying: MAX(ItemID) = 344, 83 rows. After: 349, 86
-- rows — 347 Salt, 348 Black pepper, 349 Kosher salt. The revert was proven as
-- a no-op DELETE before anything was inserted.)

INSERT INTO GroceryItems
  (ItemName, Category, category_id, Type, IsActive, Store, GroceryStoreSection)
VALUES
  ('Salt',         'Spices & seasonings', 10, 'Periodic', 1, 'HEB', 'Spices & seasonings'),
  ('Black pepper', 'Spices & seasonings', 10, 'Periodic', 1, 'HEB', 'Spices & seasonings'),
  ('Kosher salt',  'Spices & seasonings', 10, 'Periodic', 1, 'HEB', 'Spices & seasonings');
