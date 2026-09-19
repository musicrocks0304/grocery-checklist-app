// `Create Grocery List - Meals` (CkLhcFEM9Tfc5uxO, /meal_ingredients) — store the
// review screen's xN multiplier on each meal row as RecipeMultiplier.
// Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md, section 1.
//
// `Transform for DB Input` already computes `multiplier` (clamped 1-10, rounded,
// missing -> 1) and threw it away after folding it into Quantity. The need is
// DERIVED at read time as recipe need x RecipeMultiplier (decision 4: store the
// multiplier, not a need string — removing a meal never resubmits, so a stored
// need would go stale), so the multiplier has to be stored.
//
// `Insert Meal Ingredients` writes it in BOTH places: the INSERT column list AND
// ON DUPLICATE KEY UPDATE. Missing the second is a known bug class here — a
// resubmit would keep the old multiplier beside a new Quantity.
//
// A value that is not an integer lands as NULL, which the derivation reads as x1
// (COALESCE(MAX(w2.RecipeMultiplier), 1)) — never as the literal text
// "undefined" in a numeric slot, which would 500 every submit.
//
// Quantity is untouched: ceil(base) x N is still a valid UPPER bound for N times
// the need, which slice 2 relies on.
//
// Idempotent. Half-patched state throws.

const TRANSFORM = 'Transform for DB Input';
const INSERT = 'Insert Meal Ingredients';

const T_OLD = '        Quantity: quantity,\n';
const T_NEW =
  '        Quantity: quantity,\n' +
  '        // Stored so the need can be derived as recipe need x N at read time\n' +
  '        // (`Pull Grocery Staples`); Quantity keeps ceil(base) x N as the upper bound.\n' +
  '        RecipeMultiplier: multiplier,\n';

const I_EDITS = [
  [
    'week_start_date, DataSource) VALUES (',
    'week_start_date, DataSource, RecipeMultiplier) VALUES (',
    'INSERT column list',
  ],
  [
    "'{{ $json.DataSource }}') ON DUPLICATE KEY UPDATE",
    "'{{ $json.DataSource }}', {{ Number.isInteger($json.RecipeMultiplier) ? $json.RecipeMultiplier : \"NULL\" }}) ON DUPLICATE KEY UPDATE",
    'VALUES list',
  ],
  [
    'Quantity = VALUES(Quantity), Unit = VALUES(Unit)',
    'Quantity = VALUES(Quantity), Unit = VALUES(Unit), RecipeMultiplier = VALUES(RecipeMultiplier)',
    'ON DUPLICATE KEY UPDATE list',
  ],
];

function replaceOnce(text, old, next, label) {
  const first = text.indexOf(old);
  if (first === -1) throw new Error(`purchase_need_multiplier: anchor not found — ${label}`);
  if (text.indexOf(old, first + old.length) !== -1) {
    throw new Error(`purchase_need_multiplier: anchor is not unique — ${label}`);
  }
  return text.slice(0, first) + next + text.slice(first + old.length);
}

export default function (wf) {
  const t = wf.nodes.find((n) => n.name === TRANSFORM);
  const ins = wf.nodes.find((n) => n.name === INSERT);
  if (!t) throw new Error(`purchase_need_multiplier: "${TRANSFORM}" not found`);
  if (!ins) throw new Error(`purchase_need_multiplier: "${INSERT}" not found`);

  let code = t.parameters.jsCode;
  let query = ins.parameters.query;

  const markers = [
    code.includes('RecipeMultiplier: multiplier,'),
    query.includes('DataSource, RecipeMultiplier) VALUES ('),
    query.includes('$json.RecipeMultiplier : "NULL" }}) ON DUPLICATE KEY UPDATE'),
    query.includes('RecipeMultiplier = VALUES(RecipeMultiplier)'),
  ];
  if (markers.every(Boolean)) return wf;
  if (markers.some(Boolean)) {
    throw new Error(
      `purchase_need_multiplier: half-patched (markers ${markers.map((m) => (m ? 1 : 0)).join('')})` +
        ' — restore from .n8n-backups/pre-save rather than re-running',
    );
  }

  code = replaceOnce(code, T_OLD, T_NEW, 'Transform output Quantity line');
  for (const [old, next, label] of I_EDITS) query = replaceOnce(query, old, next, label);

  t.parameters.jsCode = code;
  ins.parameters.query = query;

  const note =
    ' RecipeMultiplier (purchase-need slice 1, 2026-09-18) is written in the column list AND in ' +
    'ON DUPLICATE KEY UPDATE, so a resubmit at a different xN updates it. Non-integer -> NULL (= x1).';
  if (!(ins.notes || '').includes('RecipeMultiplier (purchase-need')) ins.notes = (ins.notes || '') + note;
  return wf;
}
