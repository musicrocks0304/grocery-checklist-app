import { DEFAULT_CATEGORY } from '../constants/categories';

export const INGREDIENT_TO_CANONICAL = {
  produce: 'Fruit & vegetables',
  vegetables: 'Fruit & vegetables',
  fruits: 'Fruit & vegetables',
  protein: 'Meat & seafood',
  proteins: 'Meat & seafood',
  dairy: 'Dairy & eggs',
  pantry: 'Pantry staples',
  grains: 'Pasta, rice & grains',
  seasoning: 'Spices & seasonings',
  spices: 'Spices & seasonings',
  oils: 'Condiments & sauces',
  condiments: 'Condiments & sauces',
  baking: 'Pantry staples',
  canned: 'Pantry staples',
  sweeteners: 'Pantry staples',
  nuts: 'Snacks',
  frozen: 'Frozen food',
  other: 'Pantry staples',
};

const CANONICAL_NAMES = new Set(Object.values(INGREDIENT_TO_CANONICAL));

export function mapToCanonicalCategory(value) {
  if (!value || typeof value !== 'string') return DEFAULT_CATEGORY;
  if (CANONICAL_NAMES.has(value)) return value;
  const key = value.toLowerCase().trim();
  return INGREDIENT_TO_CANONICAL[key] || DEFAULT_CATEGORY;
}
