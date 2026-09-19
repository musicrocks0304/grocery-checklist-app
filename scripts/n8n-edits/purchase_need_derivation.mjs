// `Pull Grocery Staples` (JoaR6klT950hwSLB, /fetch_grocery_items) — derive the
// recipe NEED at read time, on every week-list row that came from a recipe.
// Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md, section 1.
//
// Five new columns on every row of BOTH branches:
//
//   NeedOz          weight total in ounces        SUM(quantity * to_base)
//   NeedTsp         volume total in teaspoons     SUM(quantity * to_base)
//   NeedCount       counted total                 SUM(quantity)
//   NeedCountUnit   the fold rule's unit          'piece' | a counted unit | 'mixed'
//   NeedUnspecified any row with no usable amount 1 / 0
//
// each multiplied by COALESCE(MAX(w2.RecipeMultiplier), 1). Staples, one-offs,
// pre-2026-04-26 weeks and F7's 900000-band rows get NULLs and the screens fall
// back to today's text.
//
// WHERE: `Pull Current Week Grocery List` is a UNION of two halves, each with its
// own attribution subquery — ATTR (inside CW, for rows whose name matches a
// GroceryItems catalogue row) and ATTR2 (week rows not in the catalogue). They
// are byte-identical, so the need is added to BOTH with one replacement that must
// match exactly twice. CW and the second half then carry it up with MAX(), and
// the outer SELECT lists it. `Pull Clean Slate Grocery List` returns the same five
// columns as NULL so the two branches' column sets cannot drift apart again.
//
// ONLY_FULL_GROUP_BY is ON on this server. ATTR/ATTR2 are GROUP BY w2.ItemID and
// RecipeMultiplier is not provably dependent on it, so it MUST be wrapped:
// a bare COALESCE(w2.RecipeMultiplier, 1) is ERROR 1055, and this query feeds
// every Grocery List, Review and In-Store load. MAX() over the one row per ItemID
// per week is that row's value.
//
// THE COUNTED-UNIT SET, defined once and used in NeedCount, the fold and the mixed
// guard: no unit, unit_type 'count', a unit with NULL unit_type, or a
// weight/volume unit with NULL to_base (fluid ounce). That is exactly the set the
// JS producer (`Aggregate Ingredients` -> `Convert to Shopping List`) puts in its
// own group, which is what makes the pre-submit screen and the list agree.
//
// An n8n query field is compiled as a JS template literal: no backticks, no SQL
// comments. Reasoning lives in node.notes.
//
// Idempotent. A half-patched query throws instead of guessing.

const PULL = 'Pull Current Week Grocery List';
const CLEAN = 'Pull Clean Slate Grocery List';
const BT = String.fromCharCode(96);

const COUNTED = "(u.unit_type IS NULL OR u.unit_type = 'count' OR (u.unit_type IN ('weight', 'volume') AND u.to_base IS NULL))";
const NAMED_COUNTED = `ri.quantity > 0 AND u.unit_id IS NOT NULL AND ${COUNTED}`;
const MULT = 'COALESCE(MAX(w2.RecipeMultiplier), 1)';

const NEED_SELECT = [
  `SUM(CASE WHEN ri.quantity > 0 AND u.unit_type = 'weight' AND u.to_base IS NOT NULL THEN ri.quantity * u.to_base END) * ${MULT} AS NeedOz`,
  `SUM(CASE WHEN ri.quantity > 0 AND u.unit_type = 'volume' AND u.to_base IS NOT NULL THEN ri.quantity * u.to_base END) * ${MULT} AS NeedTsp`,
  `SUM(CASE WHEN ri.quantity > 0 AND ${COUNTED} THEN ri.quantity END) * ${MULT} AS NeedCount`,
  `CASE WHEN COUNT(DISTINCT CASE WHEN ${NAMED_COUNTED} THEN u.unit_id END) > 1 THEN 'mixed'` +
    ` WHEN COUNT(DISTINCT CASE WHEN ${NAMED_COUNTED} THEN u.unit_id END) = 1 THEN MAX(CASE WHEN ${NAMED_COUNTED} THEN u.unit_name END)` +
    ` WHEN SUM(CASE WHEN ri.quantity > 0 AND ${COUNTED} THEN 1 ELSE 0 END) > 0 THEN 'piece' END AS NeedCountUnit`,
  "MAX(CASE WHEN ri.quantity IS NULL OR ri.quantity <= 0 OR u.unit_type = 'other' THEN 1 ELSE 0 END) AS NeedUnspecified",
].join(', ');

const NEED_COLS = ['NeedOz', 'NeedTsp', 'NeedCount', 'NeedCountUnit', 'NeedUnspecified'];
const carry = (alias) => NEED_COLS.map((c) => `MAX(${alias}.${c}) AS ${c}`).join(', ');

// [old, new, expected occurrences, label]
const PULL_EDITS = [
  [
    'store_location, RecipeNames, IsOptional FROM ( SELECT GI.ItemID,',
    `store_location, RecipeNames, IsOptional, ${NEED_COLS.join(', ')} FROM ( SELECT GI.ItemID,`,
    1, 'outer SELECT list',
  ],
  [
    'CW.RecipeNames, COALESCE(CW.IsOptional, 0) AS IsOptional FROM GroceryItems AS GI',
    `CW.RecipeNames, COALESCE(CW.IsOptional, 0) AS IsOptional, ${NEED_COLS.map((c) => `CW.${c}`).join(', ')} FROM GroceryItems AS GI`,
    1, 'first half SELECT',
  ],
  [
    'MAX(ATTR.RecipeNames) AS RecipeNames, MIN(ATTR.IsOptional) AS IsOptional FROM WeeklyGroceryList LEFT JOIN (',
    `MAX(ATTR.RecipeNames) AS RecipeNames, MIN(ATTR.IsOptional) AS IsOptional, ${carry('ATTR')} FROM WeeklyGroceryList LEFT JOIN (`,
    1, 'CW aggregates',
  ],
  [
    'MIN(ri.optional) AS IsOptional FROM WeeklyGroceryList w2',
    `MIN(ri.optional) AS IsOptional, ${NEED_SELECT} FROM WeeklyGroceryList w2`,
    2, 'ATTR + ATTR2 need columns',
  ],
  [
    'JOIN recipes r ON r.recipe_id = ws.recipe_id WHERE w2.WeekDateRange',
    'JOIN recipes r ON r.recipe_id = ws.recipe_id LEFT JOIN units u ON u.unit_id = ri.unit_id WHERE w2.WeekDateRange',
    2, 'ATTR + ATTR2 units join',
  ],
  [
    'MAX(ATTR2.RecipeNames) AS RecipeNames, COALESCE(MIN(ATTR2.IsOptional), 0) AS IsOptional FROM WeeklyGroceryList AS WGL',
    `MAX(ATTR2.RecipeNames) AS RecipeNames, COALESCE(MIN(ATTR2.IsOptional), 0) AS IsOptional, ${carry('ATTR2')} FROM WeeklyGroceryList AS WGL`,
    1, 'second half SELECT',
  ],
];

const CLEAN_OLD = '  0 AS IsOptional\n  FROM GroceryItems';
const CLEAN_NEW = `  0 AS IsOptional,\n${NEED_COLS.map((c) => `  NULL AS ${c}`).join(',\n')}\n  FROM GroceryItems`;

const count = (s, sub) => s.split(sub).length - 1;

function replaceExactly(text, old, next, times, label) {
  const n = count(text, old);
  if (n !== times) {
    throw new Error(`purchase_need_derivation: anchor matched ${n} time(s), expected ${times} — ${label}`);
  }
  return text.split(old).join(next);
}

export default function (wf) {
  const pull = wf.nodes.find((n) => n.name === PULL);
  const clean = wf.nodes.find((n) => n.name === CLEAN);
  if (!pull) throw new Error(`purchase_need_derivation: "${PULL}" not found`);
  if (!clean) throw new Error(`purchase_need_derivation: "${CLEAN}" not found`);

  let query = pull.parameters && pull.parameters.query;
  let cleanQuery = clean.parameters && clean.parameters.query;
  if (typeof query !== 'string') throw new Error(`purchase_need_derivation: "${PULL}" has no query string`);
  if (typeof cleanQuery !== 'string') throw new Error(`purchase_need_derivation: "${CLEAN}" has no query string`);

  // Done-markers, one per edit: all present = already applied; some = half-patched.
  const markers = [
    count(query, `IsOptional, ${NEED_COLS.join(', ')} FROM ( SELECT`) === 1,
    count(query, `COALESCE(CW.IsOptional, 0) AS IsOptional, CW.NeedOz`) === 1,
    count(query, carry('ATTR') + ' FROM WeeklyGroceryList LEFT JOIN') === 1,
    count(query, `IsOptional, ${NEED_SELECT} FROM WeeklyGroceryList w2`) === 2,
    count(query, 'LEFT JOIN units u ON u.unit_id = ri.unit_id WHERE w2.WeekDateRange') === 2,
    count(query, carry('ATTR2') + ' FROM WeeklyGroceryList AS WGL') === 1,
    cleanQuery.includes('  NULL AS NeedUnspecified\n'),
  ];
  const alreadyAny = /Need(Oz|Tsp|Count|CountUnit|Unspecified)|RecipeMultiplier|to_base/.test(query + cleanQuery);
  if (markers.every(Boolean)) return wf; // already applied — no-op
  if (markers.some(Boolean) || alreadyAny) {
    throw new Error(
      `purchase_need_derivation: half-patched (markers ${markers.map((m) => (m ? 1 : 0)).join('')})` +
        ' — restore the workflow from .n8n-backups/pre-save rather than re-running',
    );
  }

  for (const [old, next, times, label] of PULL_EDITS) query = replaceExactly(query, old, next, times, label);
  cleanQuery = replaceExactly(cleanQuery, CLEAN_OLD, CLEAN_NEW, 1, 'clean-slate NULL columns');

  if (query.includes(BT) || cleanQuery.includes(BT)) {
    throw new Error('purchase_need_derivation: refusing to save a query containing a backtick');
  }
  if (/--|\/\*/.test(query) || /--|\/\*/.test(cleanQuery)) {
    throw new Error('purchase_need_derivation: refusing to save a query containing a SQL comment');
  }

  pull.parameters.query = query;
  clean.parameters.query = cleanQuery;

  const note =
    ' NEED (purchase-need slice 1, 2026-09-18): NeedOz / NeedTsp / NeedCount / NeedCountUnit / ' +
    'NeedUnspecified are derived in BOTH attribution subqueries (ATTR inside CW, and ATTR2) by ' +
    'conditional aggregation over LEFT JOIN units u, times COALESCE(MAX(w2.RecipeMultiplier), 1). ' +
    'The MAX() is mandatory: ONLY_FULL_GROUP_BY is on, a bare w2 column in a GROUP BY w2.ItemID ' +
    'subquery is ERROR 1055, and this query feeds every list load. Counted-unit set (NeedCount, fold, ' +
    'mixed guard): no unit, unit_type count, NULL unit_type, or weight/volume with NULL to_base ' +
    '(fluid ounce) — the same set the JS producer groups, so pre-submit and list agree. Fold: no-unit ' +
    'rows adopt the single named counted unit, else piece; two named counted units -> mixed (the ' +
    'screens then fall back). DECIMAL columns arrive as STRINGS ("10.0000000"): formatNeed() coerces. ' +
    'Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md.';
  if (!(pull.notes || '').includes('NEED (purchase-need slice 1')) pull.notes = (pull.notes || '') + note;
  const cleanNote =
    ' Returns NeedOz/NeedTsp/NeedCount/NeedCountUnit/NeedUnspecified as NULL so both branches ' +
    'carry the same columns (purchase-need slice 1).';
  if (!(clean.notes || '').includes('purchase-need slice 1')) clean.notes = (clean.notes || '') + cleanNote;

  return wf;
}
