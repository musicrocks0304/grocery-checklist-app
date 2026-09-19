// `Ingredient Agent` (UqXlXX5uPWlGvhU6, /get_recipe_items) — emit the recipe NEED,
// structured, on every pre-submit ingredient.
// Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md, section 2.
//
// The pre-submit screen renders this; every later screen renders the SQL
// derivation in `Pull Grocery Staples`. One formatter (formatNeed in
// src/utils/formatPurchase.js) renders both, so they must produce the SAME shape
// from the same rules:
//
//   NeedOz, NeedTsp, NeedCount, NeedCountUnit, NeedUnspecified
//
// Three nodes change:
//
// 1. `Fetch Recipe Ingredients` also selects u.unit_type.
// 2. `Aggregate Ingredients` (the only node that sees individual rows) treats a
//    row whose unit_type is 'other' (pinch, dash, to taste) as UNSPECIFIED even
//    with a number beside it — the SQL files it that way, and "2 pinchs" would
//    otherwise be a group here and "as needed" there. It also records
//    `unspecified` (any row with no usable amount) -> NeedUnspecified.
// 3. `Convert to Shopping List` builds the need from rawQuantities with the fold
//    rule, and `toPurchaseQuantity`'s count branch reads the FOLDED need instead
//    of the first number of the joined display string. Otherwise the fold creates
//    a mismatch: Whole wheat pita "4 items + 4 pieces" stored Quantity 4 against a
//    folded need of 8, and lime stored 2 for a need of 4 — and slice 2's bound
//    would cut the correct 4 limes to 2. So a few stored counts RISE (lime, pita):
//    in each case today's count dropped part of the recipe's own need.
//
// Weight/volume branches of toPurchaseQuantity are untouched (slice 2 replaces
// package guessing for the cart; slice 1 only stops showing the guess).
//
// Idempotent. Half-patched state throws.

const BS = String.fromCharCode(92); // \

const FETCH = 'Fetch Recipe Ingredients';
const AGG = 'Aggregate Ingredients';
const CONVERT = 'Convert to Shopping List';

function replaceOnce(text, old, next, label) {
  const first = text.indexOf(old);
  if (first === -1) throw new Error(`purchase_need_agent: anchor not found — ${label}`);
  if (text.indexOf(old, first + old.length) !== -1) {
    throw new Error(`purchase_need_agent: anchor is not unique — ${label}`);
  }
  return text.slice(0, first) + next + text.slice(first + old.length);
}

// --- 1. Fetch Recipe Ingredients -------------------------------------------
const FETCH_EDITS = [
  [',u.unit_name \nFROM recipe_ingredients ri', ',u.unit_name \n,u.unit_type\nFROM recipe_ingredients ri', 'unit_type column'],
];

// --- 2. Aggregate Ingredients ----------------------------------------------
const AGG_EDITS = [
  [
    "  const unit = (row.unit_name || '').toLowerCase().trim();\n",
    "  const unit = (row.unit_name || '').toLowerCase().trim();\n" +
      "  const unitType = (row.unit_type || '').toLowerCase().trim();\n",
    'unitType line',
  ],
  [
    '  const hasQty = Number.isFinite(parsedQty) && parsedQty > 0;\n',
    '  // An `other` unit (pinch, dash, to taste) measures nothing even with a number\n' +
      '  // beside it. `Pull Grocery Staples` files those rows as an unspecified need,\n' +
      '  // so this must too, or the pre-submit screen and the list disagree.\n' +
      "  const hasQty = Number.isFinite(parsedQty) && parsedQty > 0 && unitType !== 'other';\n",
    'hasQty excludes other',
  ],
  [
    '    aggregated[name] = { name, category, quantities: {}, recipes: [] };\n',
    '    aggregated[name] = { name, category, quantities: {}, recipes: [], unspecified: false };\n',
    'unspecified init',
  ],
  [
    '  if (hasQty) {\n    const unitInfo = getBaseUnit(unit);\n',
    '  // Any row without a usable amount -> NeedUnspecified (shown only when\n' +
      '  // nothing else is: a real amount always wins, per TB-3b).\n' +
      '  if (!hasQty) aggregated[name].unspecified = true;\n' +
      '  if (hasQty) {\n    const unitInfo = getBaseUnit(unit);\n',
    'unspecified flag',
  ],
  [
    '    rawQuantities: ing.quantities,\n',
    '    rawQuantities: ing.quantities,\n    unspecified: ing.unspecified,\n',
    'unspecified output',
  ],
];

// --- 3. Convert to Shopping List -------------------------------------------
const TO_NEED = [
  '// The recipe need as structured numbers: the SAME shape `Pull Grocery Staples`',
  '// derives after submit, rendered by one formatter (formatNeed in',
  '// src/utils/formatPurchase.js), so the pre-submit screen and the list cannot',
  '// disagree. rawQuantities groups: `weight` (total oz), `volume` (total tsp), and',
  '// one group per COUNTED unit — a count unit, or a weight/volume unit Aggregate',
  "// Ingredients cannot convert (fluid ounce) — where '' is \"no unit\".",
  "// Fold rule: the no-unit group adopts the ingredient's single named counted unit,",
  "// or is 'piece' when there is none; two or more named counted units -> 'mixed'",
  '// (NeedCount is then not trusted and the screens fall back).',
  'function toNeed(rawQuantities, unspecified) {',
  '  const raw = rawQuantities || {};',
  "  const counted = Object.keys(raw).filter((k) => k !== 'weight' && k !== 'volume');",
  "  const named = counted.filter((k) => k !== '');",
  '  let countTotal = null;',
  '  for (const k of counted) countTotal = (countTotal || 0) + raw[k].total;',
  '  return {',
  '    NeedOz: raw.weight ? raw.weight.total : null,',
  '    NeedTsp: raw.volume ? raw.volume.total : null,',
  '    NeedCount: countTotal,',
  "    NeedCountUnit: counted.length === 0 ? null : named.length === 0 ? 'piece' : named.length === 1 ? named[0] : 'mixed',",
  '    NeedUnspecified: unspecified ? 1 : 0,',
  '  };',
  '}',
  '',
].join('\n');

const CONVERT_EDITS = [
  [
    'function toPurchaseQuantity(totalQty, name, rawQuantities) {',
    'function toPurchaseQuantity(totalQty, name, rawQuantities, need) {',
    'toPurchaseQuantity signature',
  ],
  [
    [
      "  if (!totalQty) return { purchaseQuantity: '1', purchaseUnit: 'item' };",
      `  const match = totalQty.match(/([${BS}d.]+)${BS}s*(.*)/);`,
      '  const val = match ? parseFloat(match[1]) : 1;',
      "  const unit = match ? match[2].trim().toLowerCase() : '';",
      '',
    ].join('\n'),
    [
      "  if (!totalQty) return { purchaseQuantity: '1', purchaseUnit: 'item' };",
      '  // The count branch reads the FOLDED need, never the first number of the',
      '  // joined display string: "4 items + 4 pieces" of Whole wheat pita stored 4',
      '  // while the recipes need 8, and lime (no unit in some recipes, "piece" in',
      "  // others) stored 2 for a need of 4. A 'mixed' need is not trusted and keeps",
      '  // the old parse.',
      "  const folded = !!(need && need.NeedCount > 0 && need.NeedCountUnit && need.NeedCountUnit !== 'mixed');",
      `  const match = folded ? null : totalQty.match(/([${BS}d.]+)${BS}s*(.*)/);`,
      '  const val = folded ? need.NeedCount : (match ? parseFloat(match[1]) : 1);',
      "  const unit = folded ? (need.NeedCountUnit === 'piece' ? '' : need.NeedCountUnit) : (match ? match[2].trim().toLowerCase() : '');",
      '',
    ].join('\n'),
    'count-branch parse',
  ],
  [
    "  return { purchaseQuantity: totalQty, purchaseUnit: 'as needed' };",
    [
      '  if (folded) {',
      "    // Same text formatQuantity gives a single group (\"2 cubes\", \"1 fluid ounce\"),",
      '    // but counting the folded total.',
      `    const n = val % 1 === 0 ? String(val) : val.toFixed(2).replace(/${BS}.?0+$/, '');`,
      "    return { purchaseQuantity: n + ' ' + unit + (val > 1 && !unit.endsWith('s') ? 's' : ''), purchaseUnit: 'as needed' };",
      '  }',
      "  return { purchaseQuantity: totalQty, purchaseUnit: 'as needed' };",
    ].join('\n'),
    'fall-through return',
  ],
  [
    'const ingredients = aggregatedIngredients.map(ing => {\n' +
      '  const purchase = toPurchaseQuantity(ing.totalQuantity, ing.name, ing.rawQuantities);\n',
    TO_NEED +
      'const ingredients = aggregatedIngredients.map(ing => {\n' +
      '  const need = toNeed(ing.rawQuantities, ing.unspecified);\n' +
      '  const purchase = toPurchaseQuantity(ing.totalQuantity, ing.name, ing.rawQuantities, need);\n',
    'toNeed + map head',
  ],
  [
    '    usedInRecipes: ing.recipes\n  };',
    '    usedInRecipes: ing.recipes,\n' +
      '    NeedOz: need.NeedOz,\n' +
      '    NeedTsp: need.NeedTsp,\n' +
      '    NeedCount: need.NeedCount,\n' +
      '    NeedCountUnit: need.NeedCountUnit,\n' +
      '    NeedUnspecified: need.NeedUnspecified\n  };',
    'need fields on each ingredient',
  ],
];

export default function (wf) {
  const fetch = wf.nodes.find((n) => n.name === FETCH);
  const agg = wf.nodes.find((n) => n.name === AGG);
  const conv = wf.nodes.find((n) => n.name === CONVERT);
  if (!fetch || !agg || !conv) throw new Error('purchase_need_agent: expected nodes not found');

  let query = fetch.parameters.query;
  let aggCode = agg.parameters.jsCode;
  let convCode = conv.parameters.jsCode;

  const markers = [
    query.includes(',u.unit_type\n'),
    aggCode.includes("unitType !== 'other'"),
    aggCode.includes('unspecified: ing.unspecified,'),
    convCode.includes('function toNeed(rawQuantities, unspecified) {'),
    convCode.includes('NeedUnspecified: need.NeedUnspecified'),
  ];
  if (markers.every(Boolean)) return wf;
  if (markers.some(Boolean)) {
    throw new Error(
      `purchase_need_agent: half-patched (markers ${markers.map((m) => (m ? 1 : 0)).join('')})` +
        ' — restore from .n8n-backups/pre-save rather than re-running',
    );
  }

  for (const [o, n, l] of FETCH_EDITS) query = replaceOnce(query, o, n, `Fetch: ${l}`);
  for (const [o, n, l] of AGG_EDITS) aggCode = replaceOnce(aggCode, o, n, `Aggregate: ${l}`);
  for (const [o, n, l] of CONVERT_EDITS) convCode = replaceOnce(convCode, o, n, `Convert: ${l}`);

  if (query.includes(String.fromCharCode(96))) throw new Error('purchase_need_agent: backtick in the Fetch query');

  fetch.parameters.query = query;
  agg.parameters.jsCode = aggCode;
  conv.parameters.jsCode = convCode;

  const tag = ' (purchase-need slice 1, 2026-09-18)';
  const addNote = (node, text) => {
    if (!(node.notes || '').includes('purchase-need slice 1')) node.notes = (node.notes || '') + ' ' + text + tag;
  };
  addNote(fetch, 'Selects u.unit_type so Aggregate Ingredients can treat other-typed units as unspecified, exactly as the SQL need derivation does.');
  addNote(agg, "Rows whose unit_type is 'other' are unspecified even with a number; `unspecified` (any row with no usable amount) becomes NeedUnspecified.");
  addNote(conv, "Emits NeedOz/NeedTsp/NeedCount/NeedCountUnit/NeedUnspecified per ingredient (toNeed, fold rule), the same shape Pull Grocery Staples derives; toPurchaseQuantity's count branch reads the folded need.");
  return wf;
}
