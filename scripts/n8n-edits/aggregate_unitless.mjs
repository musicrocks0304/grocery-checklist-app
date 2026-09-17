// TB-2: an unrecognised unit rendered as the literal text "2 s".
//
// The `units` table holds only 23 rows. When the Create Recipe agent writes a
// prose quantity — "2 medium carrots" — "medium" is not among them, so the save
// stores unit_id = NULL. That reaches `Aggregate Ingredients` as `''`, and
// formatQuantity's final branch pluralised it:
//
//     2 + ' ' + '' + ('' .endsWith('s') ? '' : 's')   ===   "2 s"
//
// Reproduced live 2026-09-17: the review screen read
//   carrots — Recipe needs: 2 s — 2 s as needed
//
// An empty unit now falls back to a countable noun. 40 recipe_ingredients rows
// across 9 recipes already have a NULL unit, so this is not limited to
// AI-created recipes — the Create Recipe path just reaches it far more often.
//
// Idempotent: re-applying is a no-op.

const OLD_BRANCH = [
  '  } else {',
  "    return (qty % 1 === 0 ? qty : qty.toFixed(2).replace(/\\.?0+$/, '')) + ' ' + baseUnit + (qty > 1 && !baseUnit.endsWith('s') ? 's' : '');",
  '  }',
].join('\n');

const NEW_BRANCH = [
  '  } else {',
  "    const n = (qty % 1 === 0 ? qty : qty.toFixed(2).replace(/\\.?0+$/, ''));",
  '    // A unit the `units` table does not know (the AI writes "2 medium carrots")',
  "    // is stored as NULL and arrives here as ''. Pluralising '' produced the",
  '    // literal text "2 s" on the shopping list, so fall back to a countable noun.',
  "    if (!baseUnit) return n + (qty > 1 ? ' items' : ' item');",
  "    return n + ' ' + baseUnit + (qty > 1 && !baseUnit.endsWith('s') ? 's' : '');",
  '  }',
].join('\n');

export default function (wf) {
  const node = wf.nodes.find((n) => n.name === 'Aggregate Ingredients');
  if (!node) throw new Error('aggregate_unitless: "Aggregate Ingredients" not found');

  const code = node.parameters.jsCode;
  if (code.includes(NEW_BRANCH)) return wf; // already applied
  if (!code.includes(OLD_BRANCH)) {
    throw new Error('aggregate_unitless: formatQuantity fallback branch not recognised');
  }

  node.parameters.jsCode = code.replace(OLD_BRANCH, NEW_BRANCH);
  node.notes =
    'formatQuantity: an empty baseUnit means the units table had no row for what the ' +
    'recipe said (e.g. "medium"), so unit_id is NULL. Never pluralise it — appending ' +
    '"s" to "" put the literal text "2 s" on the shopping list (TB-2).';

  return wf;
}
