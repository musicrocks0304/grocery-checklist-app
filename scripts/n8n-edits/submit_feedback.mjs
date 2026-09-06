// Add client_id to the INSERT and make it INSERT IGNORE, so a client that
// retries a submission (apiFetch retries POSTs) cannot create duplicate rows.
// The unique key is uq_app_feedback_client_id (docs/migrations/2026-09-05-app-feedback-client-id.sql).
//
// The value is sanitised to UUID characters only and capped at the column width
// (VARCHAR(36)). A missing — or wholly non-UUID — client_id becomes SQL NULL:
// NULLs do not collide under a MySQL unique key, so unkeyed submissions still
// insert, and a junk client_id can never park an empty string on the unique key
// and silently swallow every later report.
const CLIENT_ID_EXPR =
  "{{ (() => { const c = String($json.body.client_id || '').replace(/[^0-9a-fA-F-]/g, '').slice(0, 36); return c ? \"'\" + c + \"'\" : 'NULL'; })() }}";

export default function (wf) {
  const node = wf.nodes.find((n) => n.name === 'Insert Feedback');
  if (!node) throw new Error('node "Insert Feedback" not found');
  let q = node.parameters.query;
  if (!q.includes('client_id')) {
    const before = q;
    q = q.replace(/^\s*INSERT INTO app_feedback \(/i, () => 'INSERT IGNORE INTO app_feedback (client_id, ');
    if (q === before) throw new Error('could not find the "INSERT INTO app_feedback (" prefix');
    const withValues = q.replace(/VALUES \(\s*/i, () => `VALUES (\n  ${CLIENT_ID_EXPR},\n  `);
    if (withValues === q) throw new Error('could not find the VALUES list');
    q = withValues;
  }
  node.parameters.query = q;
  return wf;
}
