import { formatNeed, formatPurchase, formatPurchaseBadge, summarizePurchase } from './formatPurchase';

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

// ---------------------------------------------------------------------------
// formatNeed — purchase-need slice 1. Two producers feed one renderer:
// `Convert to Shopping List` before submit (JS numbers) and `Pull Grocery
// Staples` after submit (MySQL DECIMALs that the n8n MySQL node returns as
// STRINGS). Every amount below is a need observed in live recipe data on
// 2026-09-18 (recipes 24, 56, 59, 61, 68 and the 2026-07-05 week).
// ---------------------------------------------------------------------------
const need = (fields) => ({
  NeedOz: null, NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: 0, ...fields,
});

describe('formatNeed — weight, in ounces', () => {
  test.each([
    [4, '4 oz'],
    [0.5, '0.5 oz'],
    [12, '12 oz'],
    [16, '1 lb'],
    [20, '1 lb 4 oz'],
    [24, '1 lb 8 oz'],
    [28, '1 lb 12 oz'],
    [32, '2 lbs'],
    [36, '2 lbs 4 oz'],
    [40, '2 lbs 8 oz'],
    [80, '5 lbs'],
  ])('%s oz -> %s', (oz, expected) => {
    expect(formatNeed(need({ NeedOz: oz }))).toBe(expected);
  });
});

describe('formatNeed — volume, in teaspoons', () => {
  test.each([
    [0.125, '0.125 tsp'],
    [0.5, '0.5 tsp'],
    [1.375, '1.375 tsp'],
    [2.75, '2.75 tsp'],
    [3, '1 tbsp'],
    [5.5, '1.83 tbsp'],
    [21, '7 tbsp'],
    [22.5, '7.5 tbsp'],
    [24, '8 tbsp'],
    [48, '1 cup'],
    [72, '1.5 cups'],
    [84, '1.75 cups'],
    [96, '2 cups'],
  ])('%s tsp -> %s', (tsp, expected) => {
    expect(formatNeed(need({ NeedTsp: tsp }))).toBe(expected);
  });
});

describe('formatNeed — counted units', () => {
  test.each([
    [12, 'piece', '12'], // pieces alone read as a bare number: Corn tortillas · 12
    [1, 'piece', '1'],
    [1.5, 'piece', '1.5'],
    [1, 'clove', '1 clove'],
    [10, 'clove', '10 cloves'],
    [2, 'can', '2 cans'],
    [1, 'bunch', '1 bunch'],
    [2, 'bunch', '2 bunches'],
    [0.25, 'bunch', '0.25 bunch'],
    [2, 'cube', '2 cubes'],
    [1, 'fluid ounce', '1 fluid ounce'], // an unconvertible volume keeps its own name
    [2, 'fluid ounce', '2 fluid ounces'],
    [2, 'dozen', '2 dozen'],
  ])('%s %s -> %s', (n, unit, expected) => {
    expect(formatNeed(need({ NeedCount: n, NeedCountUnit: unit }))).toBe(expected);
  });
});

describe('formatNeed — several groups', () => {
  test('pieces are worded once they are not alone', () => {
    expect(formatNeed(need({ NeedOz: 24, NeedCount: 2, NeedCountUnit: 'piece' }))).toBe('1 lb 8 oz + 2 pieces');
  });

  test('weight, then volume, then count — a fixed order', () => {
    expect(formatNeed(need({ NeedTsp: 72, NeedOz: 16 }))).toBe('1 lb + 1.5 cups');
    expect(formatNeed(need({ NeedOz: 28, NeedCount: 1, NeedCountUnit: 'can' }))).toBe('1 lb 12 oz + 1 can');
  });
});

describe('formatNeed — an unspecified amount', () => {
  test('alone, it reads "as needed"', () => {
    expect(formatNeed(need({ NeedUnspecified: 1 }))).toBe('as needed');
    expect(formatNeed(need({ NeedUnspecified: '1' }))).toBe('as needed');
  });

  test('beside a real amount, the amount wins (TB-3b)', () => {
    expect(formatNeed(need({ NeedTsp: 1.375, NeedUnspecified: 1 }))).toBe('1.375 tsp');
  });
});

describe('formatNeed — nothing to say, so the row falls back', () => {
  test.each([
    [undefined],
    [null],
    ['12'],
    [{}],
    [need({})],
    // a staple row: no need keys at all (and a frontend deployed before n8n)
    [{ ItemID: 23, ItemName: 'Bread', QuantitySelected: 1, Unit: null }],
    // the clean-slate branch and every staple row: all five NULL on the wire
    [{ NeedOz: null, NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: null }],
  ])('%j -> ""', (value) => {
    expect(formatNeed(value)).toBe('');
  });

  test('"mixed" counted units are not trusted: the whole row falls back', () => {
    expect(formatNeed(need({ NeedCount: 5, NeedCountUnit: 'mixed' }))).toBe('');
    expect(formatNeed(need({ NeedOz: 4, NeedCount: 5, NeedCountUnit: 'mixed' }))).toBe('');
  });

  test('a zero amount says nothing', () => {
    expect(formatNeed(need({ NeedOz: 0 }))).toBe('');
    expect(formatNeed(need({ NeedOz: '0.0000000', NeedUnspecified: 1 }))).toBe('as needed');
  });
});

describe('formatNeed — the wire shapes', () => {
  // execution 27542: DECIMAL came back as "10.000" (typeof string), and so does
  // SUM(DECIMAL). Printed raw that is "12.0000000" or "0.5000000 tsp".
  test.each([
    [need({ NeedCount: '12.000', NeedCountUnit: 'piece' }), '12'],
    [need({ NeedOz: '4.0000000' }), '4 oz'],
    [need({ NeedTsp: '0.5000000' }), '0.5 tsp'],
    [need({ NeedTsp: '2.7500000' }), '2.75 tsp'],
    [need({ NeedOz: '40.0000000' }), '2 lbs 8 oz'],
  ])('%j -> %s', (value, expected) => {
    expect(formatNeed(value)).toBe(expected);
  });

  test('a need as numbers and the same need as DECIMAL strings read identically', () => {
    const pairs = [
      [need({ NeedTsp: 15.84 }), need({ NeedTsp: '15.8400000' })],
      [need({ NeedCount: 10, NeedCountUnit: 'clove' }), need({ NeedCount: '10.000', NeedCountUnit: 'clove' })],
      [need({ NeedOz: 16, NeedTsp: 72 }), need({ NeedOz: '16.0000000', NeedTsp: '72.0000000' })],
    ];
    for (const [asNumbers, asStrings] of pairs) {
      expect(formatNeed(asStrings)).toBe(formatNeed(asNumbers));
    }
  });

  test('float noise from summing in JS is rounded away', () => {
    expect(formatNeed(need({ NeedTsp: 0.1 + 0.2 }))).toBe('0.3 tsp');
    expect(formatNeed(need({ NeedTsp: 0.33 * 48 }))).toBe('5.28 tbsp');
    expect(formatNeed(need({ NeedOz: 20.8 }))).toBe('1 lb 4.8 oz');
  });
});

describe('formatNeed — the xN multiplier is N times the need (decision 5)', () => {
  test.each([
    [need({ NeedOz: 4 }), 3, '12 oz'],
    [need({ NeedCount: 12, NeedCountUnit: 'piece' }), 3, '36'],
    [need({ NeedTsp: 1.375 }), 2, '2.75 tsp'],
    [need({ NeedOz: 40 }), 2, '5 lbs'],
    [need({ NeedUnspecified: 1 }), 3, 'as needed'],
  ])('%j x%s -> %s', (value, m, expected) => {
    expect(formatNeed(value, m)).toBe(expected);
  });

  test.each([[undefined], [0], [-2], ['x'], [NaN]])('a meaningless multiplier (%s) reads as x1', (m) => {
    expect(formatNeed(need({ NeedOz: 4 }), m)).toBe('4 oz');
  });
});
