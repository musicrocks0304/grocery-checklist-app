import { findBestMatch } from './InStoreMode';

const items = [
  { ItemID: 1, ItemName: 'Milk' },
  { ItemID: 2, ItemName: 'Almond milk' },
  { ItemID: 3, ItemName: 'Cinnamon Toast Crunch' },
  { ItemID: 4, ItemName: 'Sugar' },
];

describe('findBestMatch', () => {
  test('returns null for empty transcript', () => {
    expect(findBestMatch('', items)).toBeNull();
    expect(findBestMatch(null, items)).toBeNull();
    expect(findBestMatch(undefined, items)).toBeNull();
    expect(findBestMatch('   ', items)).toBeNull();
  });

  test('returns null for empty or missing item list', () => {
    expect(findBestMatch('milk', [])).toBeNull();
    // The function spreads `uncheckedItems` so it should not crash on a falsy
    // list if the caller forgot to default to []. Defensive: treat as no-match.
    expect(findBestMatch('milk', null)).toBeNull();
    expect(findBestMatch('milk', undefined)).toBeNull();
  });

  test('returns null when no item matches', () => {
    expect(findBestMatch('asparagus', items)).toBeNull();
  });

  test('phrase containing an item name matches that item (multi-item heard, first one wins)', () => {
    // Spec non-goal: multi-item matching. Documented behavior is that the
    // longest-matching item wins. "milk and eggs" against [Milk, Almond milk]
    // — neither item name is a substring of "milk and eggs" exactly, but the
    // word "milk" is a substring of "milk and eggs" via reverse-substring
    // (the transcript contains the item name). Longest-name-first ordering
    // means "Almond milk" is checked before "Milk" — but "milk and eggs"
    // doesn't include "almond". So Milk wins.
    const noEggs = [
      { ItemID: 1, ItemName: 'Milk' },
      { ItemID: 2, ItemName: 'Almond milk' },
    ];
    expect(findBestMatch('milk and eggs', noEggs).ItemID).toBe(1);
  });

  test('exact-name match returns the item (case-insensitive)', () => {
    expect(findBestMatch('milk', items).ItemID).toBe(1);
    expect(findBestMatch('MILK', items).ItemID).toBe(1);
  });

  test('longer name wins when both substring-match the transcript', () => {
    // transcript "almond milk" matches both "Almond milk" (full) and "Milk" (substring).
    // The longer name should win — order matches deterministic.
    expect(findBestMatch('almond milk', items).ItemID).toBe(2);
  });

  test('reverse-substring match (item name contains transcript)', () => {
    expect(findBestMatch('cinnamon', items).ItemID).toBe(3);
  });

  test('word-overlap fallback fires when no direct substring match', () => {
    // "I need cinnamon toast" — no item NAME is a substring of transcript and
    // no item is a superstring of transcript. Word-overlap on "cinnamon" or
    // "toast" should hit "Cinnamon Toast Crunch".
    // (Note this also passes via direct substring "cinnamon" — both paths
    // converge on the same item; that's fine.)
    expect(findBestMatch('I need cinnamon toast', items).ItemID).toBe(3);
  });

  test('two-character word does not trigger word-overlap fallback', () => {
    // The fallback only considers words of length >= 3, to avoid false
    // positives like "we" matching "Watermelon".
    const onlyShort = [{ ItemID: 99, ItemName: 'Watermelon' }];
    expect(findBestMatch('we are out', onlyShort)).toBeNull();
  });
});
