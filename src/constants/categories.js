// The 14 canonical grocery categories now live in the database (table: categories).
// Components should fetch them via the useCategories hook (src/hooks/useCategories.js).
// The constants below are retained as a compat shim for legacy consumers
// (GroceryChecklist, StaplesScreen, ReviewScreen). TODO: migrate those consumers
// to useCategories, then remove these exports.

export const GROCERY_CATEGORIES = [
  'Bakery & bread',
  'Beverages',
  'Cereal & breakfast',
  'Condiments & sauces',
  'Dairy & eggs',
  'Deli & prepared food',
  'Frozen food',
  'Fruit & vegetables',
  'Meat & seafood',
  'Pasta, rice & grains',
  'Pantry staples',
  'Snacks',
  'Spices & seasonings',
  'Household & other',
];

export const DEFAULT_CATEGORY = 'Pantry staples';

export const HEB_WALK_ORDER = [
  'Fruit & vegetables',
  'Bakery & bread',
  'Deli & prepared food',
  'Meat & seafood',
  'Dairy & eggs',
  'Cereal & breakfast',
  'Pasta, rice & grains',
  'Pantry staples',
  'Condiments & sauces',
  'Spices & seasonings',
  'Snacks',
  'Beverages',
  'Household & other',
  'Frozen food',
];
