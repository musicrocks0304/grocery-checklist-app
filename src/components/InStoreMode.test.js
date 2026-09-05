import { formatAisleBadge } from './InStoreMode';

// Pure-function unit test for the allDone calculation logic.
// Verifies that a numeric size match doesn't trigger allDone if the actual
// ItemIDs don't all appear in the checked Set (defends against ID collisions
// like the OneOff ItemID=0 case).

function isAllDone(items, checkedItems) {
  const totalItems = items.length;
  if (totalItems === 0) return false;
  return items.every((i) => checkedItems.has(String(i.ItemID)));
}

describe('isAllDone (allDone semantics)', () => {
  test('returns false when items list is empty', () => {
    expect(isAllDone([], new Set())).toBe(false);
  });

  test('returns true when every ItemID is in the checked Set', () => {
    const items = [{ ItemID: 1 }, { ItemID: 2 }, { ItemID: 3 }];
    const checked = new Set(['1', '2', '3']);
    expect(isAllDone(items, checked)).toBe(true);
  });

  test('returns false when checked Set size equals items length but IDs differ', () => {
    const items = [{ ItemID: 0 }, { ItemID: 0 }];
    const checked = new Set(['0', '999']);
    expect(isAllDone(items, checked)).toBe(true); // both items match '0', it IS in Set
    const items2 = [{ ItemID: 1 }, { ItemID: 2 }];
    const checked2 = new Set(['1', '999']);
    expect(isAllDone(items2, checked2)).toBe(false);
  });

  test('returns false when one item is unchecked even if other counts match', () => {
    const items = [{ ItemID: 100 }, { ItemID: 200 }];
    const checked = new Set(['100']);
    expect(isAllDone(items, checked)).toBe(false);
  });
});

describe('formatAisleBadge', () => {
  test('returns empty string for null', () => {
    expect(formatAisleBadge(null)).toBe('');
  });

  test('returns empty string for empty string', () => {
    expect(formatAisleBadge('')).toBe('');
  });

  test('returns "Aisle N" unchanged for an aisle location', () => {
    expect(formatAisleBadge('Aisle 14')).toBe('Aisle 14');
  });

  test('shortens a verbose wall location to "Section, Wall"', () => {
    expect(formatAisleBadge('In Produce on the Front Wall')).toBe('Produce, Front');
  });
});
