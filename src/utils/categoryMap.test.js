import { mapToCanonicalCategory, INGREDIENT_TO_CANONICAL } from './categoryMap';

describe('mapToCanonicalCategory', () => {
  test('maps lowercase ingredient categories to canonical names', () => {
    expect(mapToCanonicalCategory('produce')).toBe('Fruit & vegetables');
    expect(mapToCanonicalCategory('protein')).toBe('Meat & seafood');
    expect(mapToCanonicalCategory('dairy')).toBe('Dairy & eggs');
    expect(mapToCanonicalCategory('pantry')).toBe('Pantry staples');
    expect(mapToCanonicalCategory('seasoning')).toBe('Spices & seasonings');
  });

  test('is case-insensitive', () => {
    expect(mapToCanonicalCategory('PRODUCE')).toBe('Fruit & vegetables');
    expect(mapToCanonicalCategory('Produce')).toBe('Fruit & vegetables');
  });

  test('passes through canonical names unchanged', () => {
    expect(mapToCanonicalCategory('Fruit & vegetables')).toBe('Fruit & vegetables');
    expect(mapToCanonicalCategory('Pantry staples')).toBe('Pantry staples');
  });

  test('returns DEFAULT_CATEGORY for unknown values', () => {
    expect(mapToCanonicalCategory('unknown_thing')).toBe('Pantry staples');
    expect(mapToCanonicalCategory('')).toBe('Pantry staples');
    expect(mapToCanonicalCategory(null)).toBe('Pantry staples');
    expect(mapToCanonicalCategory(undefined)).toBe('Pantry staples');
  });

  test('covers every ingredient_category value present in production', () => {
    const productionValues = [
      'baking', 'canned', 'condiments', 'dairy', 'frozen', 'grains',
      'nuts', 'oils', 'other', 'produce', 'protein', 'seasoning',
      'spices', 'sweeteners',
    ];
    productionValues.forEach((v) => {
      expect(INGREDIENT_TO_CANONICAL[v]).toBeDefined();
    });
  });
});
