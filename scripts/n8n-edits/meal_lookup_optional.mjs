// `Fetch Weekly Meal Ingredients` (node `Get Ingredients`) existed to LABEL
// grocery-list rows with a meal name. The Grocery List screen used it as an
// inner join instead: any row whose ItemName failed to match a name this
// lookup returned was DROPPED from the list entirely, while the H-E-B cart
// still bought it. `AND (ri.optional IS NULL OR ri.optional = 0)` meant every
// optional ingredient (Fritos or corn chips on recipe 59, butter lettuce on
// recipe 55, ...) was excluded here and so vanished from the list.
//
// Two earlier tasks fixed the real path: the grocery-list query now derives
// RecipeNames/IsOptional directly (scripts/n8n-edits/grocery_list_provenance.mjs)
// and the frontend no longer drops unmatched rows. This lookup is now only a
// fallback for attribution text, so excluding optional ingredients here no
// longer hides anything from the list — it just makes the fallback wrong
// (an optional ingredient's meal name would be missing from ingredientNames).
// Deleting the predicate makes the fallback match the same "every contributing
// ingredient, optional or not" semantics as the real path.
//
// Do NOT touch `UNION ALL SELECT '__SENTINEL__', NULL`: a 0-row MySQL result
// halts this n8n flow, and `alwaysOutputData` is unreliable on mySql
// typeVersion 2.4 in this install. Removing the optional predicate makes a
// 0-row result rarer, not impossible, so the sentinel stays exactly as is.
//
// Idempotent: no-op once the predicate is gone (checked by absence of
// `ri.optional` anywhere in the query, not just at this anchor).

const NODE_NAME = 'Get Ingredients';

// Anchor includes the closing quote of the WeekDateRange filter and the
// following UNION ALL so the match is unique even though `ri.optional`
// elsewhere in the query (there is nowhere else) could not collide anyway.
const OLD =
  "'\n  AND (ri.optional IS NULL OR ri.optional = 0)\nUNION ALL";
const NEW = "'\nUNION ALL";

export default function (wf) {
  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error(`meal_lookup_optional: "${NODE_NAME}" not found`);

  const query = node.parameters?.query;
  if (typeof query !== 'string') throw new Error('meal_lookup_optional: node has no query string');

  if (!query.includes('ri.optional')) return wf; // already applied

  const first = query.indexOf(OLD);
  if (first === -1) {
    throw new Error(
      `meal_lookup_optional: predicate anchor not found in "${NODE_NAME}" — query text has drifted, ` +
        'update the anchor after re-reading the live node',
    );
  }
  if (query.indexOf(OLD, first + OLD.length) !== -1) {
    throw new Error(`meal_lookup_optional: predicate anchor is not unique in "${NODE_NAME}"`);
  }

  node.parameters.query = query.slice(0, first) + NEW + query.slice(first + OLD.length);
  node.notes =
    'This lookup only labels grocery-list rows with a meal name now (fallback path — the real ' +
    'attribution comes from the grocery list query itself, scripts/n8n-edits/grocery_list_provenance.mjs). ' +
    'It used to exclude optional ingredients, which mattered when the frontend used it as an inner ' +
    'join and dropped any unmatched row from the list while the cart still bought it. That join is ' +
    'gone, so the predicate only made this fallback silently omit optional ingredient names. Keep ' +
    "the `UNION ALL SELECT '__SENTINEL__', NULL` — it prevents a 0-row result from halting the flow " +
    '(alwaysOutputData is unreliable on mySql typeVersion 2.4 here).';

  return wf;
}
