// `Search Recipes by Keyword` (sTXl58QGulCKbPcC) — escape the keyword.
// Spec: docs/superpowers/specs/2026-09-18-meal-creator-save-hardening.md, "Companion: the sweep".
//
// Node `Search Recipes` splices the keyword raw into THREE LIKE clauses:
//
//   ... WHERE R.recipe_name LIKE CONCAT('%', '{{ $json.keyword }}', '%')
//        OR R.recipe_description LIKE CONCAT('%', '{{ $json.keyword }}', '%')
//        OR t.tag_name LIKE CONCAT('%', '{{ $json.keyword }}', '%')
//
// THIS WORKFLOW IS MARKED INACTIVE AND THAT DOES NOT PROTECT IT. It is
// registered as an AI tool of the ACTIVE `Blue Apron API Agent`
// (UsrnHCWpe6zfIbcn) — node "Search Recipes by Keyword", with
// parameters.workflowId.value = "sTXl58QGulCKbPcC" — and a sub-workflow invoked
// as a tool does not need to be active. The LLM fills `keyword` from whatever
// the user typed in chat, so "shepherd's pie" breaks the query.
//
// Its two sibling tools on the same agent already handle this correctly:
// `Search Recipes by Filters` escapes with f.replace(/'/g, "''") and
// `Get Recipe Details` whitelists with /^\d+$/. So this is a lone oversight,
// not a pattern, and matching the sibling's escape is the right shape.
//
// SCOPE, stated honestly: escaping the apostrophe does NOT neutralise %, _ or
// backslash as LIKE metacharacters, so a keyword containing % still behaves as a
// wildcard. That is unchanged here and identical to what `Search Recipes by
// Filters` already accepts. This cannot regress a working search: the escape is
// a no-op on any keyword without an apostrophe, and a keyword with one does not
// work today.
//
// An n8n query field is compiled as a JS template literal, so this must contain
// no backtick and no SQL comment — a backtick mangles the query and fails
// SILENTLY with {success:true} and 0 rows. Reasoning lives in node.notes.
//
// Idempotent: re-applying is a no-op.

const NODE = 'Search Recipes';
const BT = String.fromCharCode(96);

const OLD = "'{{ $json.keyword }}'";
const NEW = `'{{ String($json.keyword).replace(/'/g, "''") }}'`;
const EXPECTED = 3;

export default function (wf) {
  const node = wf.nodes.find((n) => n.name === NODE);
  if (!node) throw new Error(`search_recipes_keyword_escape: "${NODE}" not found`);

  let query = node.parameters && node.parameters.query;
  if (typeof query !== 'string') {
    throw new Error(`search_recipes_keyword_escape: "${NODE}" has no query string`);
  }

  const already = query.split(NEW).length - 1;
  const remaining = query.split(OLD).length - 1;

  if (already > 0 && remaining > 0) {
    throw new Error(
      `search_recipes_keyword_escape: half-patched (${already} escaped, ${remaining} raw) — ` +
        'restore from the backup rather than re-running',
    );
  }

  if (already === 0) {
    if (remaining !== EXPECTED) {
      throw new Error(
        `search_recipes_keyword_escape: expected ${EXPECTED} raw keyword interpolations, found ${remaining}`,
      );
    }
    query = query.split(OLD).join(NEW);
    if (query.includes(BT)) {
      throw new Error(
        'search_recipes_keyword_escape: refusing to save a query containing a backtick — ' +
          'n8n compiles the query field as a template literal and would mangle it silently',
      );
    }
    node.parameters.query = query;
  } else if (already !== EXPECTED) {
    throw new Error(
      `search_recipes_keyword_escape: already patched but found ${already} of ${EXPECTED} sites`,
    );
  }

  const note =
    'The keyword is LLM-supplied from user chat and is spliced into three LIKE clauses, so it is ' +
    'escaped here the same way the sibling tool `Search Recipes by Filters` escapes its filter ' +
    'terms. "shepherd\'s pie" used to break this query. NOTE: this workflow being marked inactive ' +
    'does NOT make it unreachable — it runs as an AI tool of the ACTIVE `Blue Apron API Agent`, ' +
    'and sub-workflow tools do not require activation. Escaping the apostrophe does not neutralise ' +
    '% or _ as LIKE wildcards; that is pre-existing and matches the sibling. Never put a backtick ' +
    'or SQL comment in this field: n8n compiles it as a JS template literal and a backtick makes ' +
    'the query fail silently with 0 rows.';
  node.notes = node.notes && node.notes.includes('LLM-supplied from user chat') ? node.notes : note;

  return wf;
}
