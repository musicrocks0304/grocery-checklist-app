import { formatPurchase, formatPurchaseBadge, summarizePurchase } from './formatPurchase';

// F6: `Convert to Shopping List` returns a purchaseQuantity that ALREADY carries
// a unit noun ("1 small jar") and the UI appended purchaseUnit ("small jar"), so
// the shopper read "Buy: 1 small jar small jar". Six render sites did their own
// concatenation, three of them with no guard at all — including the H-E-B Cart
// Builder and In-Store Mode, where the value arrives as a bare INT from
// WeeklyGroceryList.Quantity and produced "2 1 lb package".
//
// Every pair below is a real shape observed either in `toPurchaseQuantity` or in
// live WeeklyGroceryList data on 2026-09-18.

describe('formatPurchase — purchase strings that carry their own noun', () => {
  // The unit adds nothing the quantity has not already said, or adds only
  // secondary package detail. The quantity wins; nothing is doubled up.
  test.each([
    ['1 lb', '1 lb package', '1 lb'],
    ['2 lbs', '1 lb package', '2 lbs'],
    ['3 lbs', '1 lb package', '3 lbs'],
    ['1 small jar', 'small jar', '1 small jar'],
    ['1 small can', '6 oz can', '1 small can'],
    ['1 container', 'small container', '1 container'],
    ['1 quart', '32 oz container', '1 quart'],
    ['1 head', 'whole head', '1 head'],
    ['2 heads', 'whole head', '2 heads'],
    ['2 cans', '14.5 oz can', '2 cans'],
    ['8 tbsp', 'as needed', '8 tbsp'],
  ])('%s + %s -> %s', (q, u, expected) => {
    expect(formatPurchase(q, u)).toBe(expected);
  });

  test('no output ever repeats the unit noun', () => {
    expect(formatPurchase('1 small jar', 'small jar')).not.toMatch(/jar.*jar/);
    expect(formatPurchase('1 lb', '1 lb package')).not.toMatch(/lb.*lb/);
  });
});

describe('formatPurchase — a bare count needs the unit appended', () => {
  test.each([
    ['4', 'items', '4 items'],
    [4, 'items', '4 items'],
    [12, 'items', '12 items'],
    [2, 'small jar', '2 small jar'],
    [2, 'whole head', '2 whole head'],
  ])('%s + %s -> %s', (q, u, expected) => {
    expect(formatPurchase(q, u)).toBe(expected);
  });

  // The digit collision. A bare count followed by a unit that itself starts with
  // a number read as "2 1 lb package" on the Cart Builder and In-Store Mode.
  test.each([
    [2, '1 lb package', '2 × 1 lb package'],
    [1, '1 lb package', '1 × 1 lb package'],
    [16, '1 lb package', '16 × 1 lb package'],
    [2, '14.5 oz can', '2 × 14.5 oz can'],
    [1, '32 oz container', '1 × 32 oz container'],
    [3, '6 oz can', '3 × 6 oz can'],
  ])('%s + %s -> %s (never two numbers side by side)', (q, u, expected) => {
    expect(formatPurchase(q, u)).toBe(expected);
    expect(formatPurchase(q, u)).not.toMatch(/^\d+\s+\d/);
  });
});

describe('formatPurchase — units that carry no information', () => {
  // 'item' singular was already suppressed by every existing render site; keep
  // that. 'as needed' is not a unit at all — it is the aggregator's fallback for
  // an unrecognised one, and live data pairs it with real counts of 2-4.
  test.each([
    [1, 'item', '1'],
    [3, 'item', '3'],
    [2, 'as needed', '2'],
    [4, 'as needed', '4'],
    [3, null, '3'],
    [3, undefined, '3'],
    [3, '', '3'],
    [3, '   ', '3'],
    [10, null, '10'],
  ])('%s + %s -> %s', (q, u, expected) => {
    expect(formatPurchase(q, u)).toBe(expected);
  });
});

describe('formatPurchase — absent or meaningless quantity', () => {
  test.each([
    [undefined, 'items'],
    [null, 'items'],
    ['', 'items'],
    ['   ', 'items'],
    [0, 'items'],
    ['0', '1 lb package'],
  ])('%s yields the empty string, never "0" or "undefined"', (q, u) => {
    expect(formatPurchase(q, u)).toBe('');
  });

  test('a NaN-ish quantity does not leak "NaN"', () => {
    expect(formatPurchase(NaN, 'items')).toBe('');
  });
});

describe('summarizePurchase — the Grocery List / Review row suffix', () => {
  // The clean-slate branch of fetch_grocery_items (an empty week) returns
  // `1 AS Quantity` and has NO QuantitySelected column at all, so the reader
  // must accept either name rather than assume one.
  test('reads QuantitySelected when present', () => {
    expect(summarizePurchase({ QuantitySelected: 4, Unit: 'items' })).toBe('4 items');
  });

  test('falls back to Quantity, which is what the empty-week branch sends', () => {
    expect(summarizePurchase({ Quantity: 4, Unit: 'items' })).toBe('4 items');
  });

  test('QuantitySelected wins when both are present', () => {
    expect(summarizePurchase({ QuantitySelected: 4, Quantity: 9, Unit: 'items' })).toBe('4 items');
  });

  // Suppression: a bare "1" says nothing a checkbox does not already say. 708
  // live Staples rows are Quantity 1 with a NULL unit and must stay clean.
  test.each([
    [{ QuantitySelected: 1, Unit: null }, ''],
    [{ QuantitySelected: 1, Unit: 'item' }, ''],
    [{ QuantitySelected: '1', Unit: '' }, ''],
    [{ Quantity: 1, Unit: null }, ''],
    [{}, ''],
  ])('%j is suppressed entirely', (item, expected) => {
    expect(summarizePurchase(item)).toBe(expected);
  });

  // ...but a staple the shopper genuinely set to more than one must show it.
  // 31 live Staples rows have a NULL unit and Quantity 2-10.
  test.each([
    [{ QuantitySelected: 3, Unit: null }, '3'],
    [{ QuantitySelected: 10, Unit: null }, '10'],
    [{ QuantitySelected: 2, Unit: 'as needed' }, '2'],
    [{ QuantitySelected: 2, Unit: '1 lb package' }, '2 × 1 lb package'],
    [{ QuantitySelected: 1, Unit: '1 lb package' }, '1 × 1 lb package'],
  ])('%j -> %s', (item, expected) => {
    expect(summarizePurchase(item)).toBe(expected);
  });
});

describe('formatPurchaseBadge — the Cart Builder / In-Store pill', () => {
  // Those two sites render a small multiplicity badge and already prefixed a
  // unitless count with x/×. Keeping that means the F6 fix changes ONLY the
  // broken strings on those screens and nothing else the shopper is used to.
  test.each([
    [1, null, '\u00d71'],
    [3, null, '\u00d73'],
    [3, 'item', '\u00d73'],
    [2, 'as needed', '\u00d72'],
  ])('%s + %s -> %s (a unitless count keeps its badge prefix)', (q, u, expected) => {
    expect(formatPurchaseBadge(q, u)).toBe(expected);
  });

  test.each([
    [2, '1 lb package', '2 \u00d7 1 lb package'],
    [1, '1 lb package', '1 \u00d7 1 lb package'],
    [12, 'items', '12 items'],
    [2, 'small jar', '2 small jar'],
  ])('%s + %s -> %s (a real unit reads the same as everywhere else)', (q, u, expected) => {
    expect(formatPurchaseBadge(q, u)).toBe(expected);
  });

  test('an absent quantity still yields nothing, not a bare prefix', () => {
    expect(formatPurchaseBadge(null, null)).toBe('');
    expect(formatPurchaseBadge(0, 'items')).toBe('');
  });
});
