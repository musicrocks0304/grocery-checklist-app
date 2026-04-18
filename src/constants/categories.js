// The 14 HEB-aligned grocery categories
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

// Default walk order through an HEB store — roughly produce → deli → meat →
// dairy → center store → frozen. Users can reorder this per-session via the
// In-Store Mode walk-order editor; the chosen order is persisted to
// localStorage ('inStoreWalkOrder'). A future improvement is per-user/per-store
// persistence in the backend.
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
