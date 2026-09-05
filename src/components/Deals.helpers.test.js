import { isAlreadyOnList } from './Deals';

describe('isAlreadyOnList', () => {
  const items = [
    { ItemName: 'Bananas', IsSelected: 1 },
    { ItemName: 'Oat Milk', IsSelected: 0 },
    { ItemName: '  Greek Yogurt  ', IsSelected: 1 },
  ];

  test('matches an item that is on this week\u2019s list', () => {
    expect(isAlreadyOnList(items, 'Bananas')).toBe(true);
  });

  test('is case- and whitespace-insensitive', () => {
    expect(isAlreadyOnList(items, 'greek yogurt')).toBe(true);
    expect(isAlreadyOnList(items, '  BANANAS ')).toBe(true);
  });

  test('ignores catalog staples that are not selected for this week', () => {
    expect(isAlreadyOnList(items, 'Oat Milk')).toBe(false);
  });

  test('returns false for an unknown item', () => {
    expect(isAlreadyOnList(items, 'Sourdough')).toBe(false);
  });

  test('treats a non-array body as an empty list instead of throwing', () => {
    expect(isAlreadyOnList(null, 'Bananas')).toBe(false);
    expect(isAlreadyOnList(undefined, 'Bananas')).toBe(false);
    expect(isAlreadyOnList({ message: 'no rows' }, 'Bananas')).toBe(false);
    expect(isAlreadyOnList('', 'Bananas')).toBe(false);
  });

  test('tolerates null rows and blank names', () => {
    expect(isAlreadyOnList([null, { IsSelected: 1 }], 'Bananas')).toBe(false);
    expect(isAlreadyOnList(items, '')).toBe(false);
    expect(isAlreadyOnList(items, undefined)).toBe(false);
  });
});
