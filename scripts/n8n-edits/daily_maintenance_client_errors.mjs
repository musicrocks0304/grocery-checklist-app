// Hardening sub-project E: 90-day retention for client_errors, appended to the
// Daily Maintenance workflow (NGvnsYXF8cpFTHA1) after "Purge Old Deals Cache".
// Apply with: node scripts/n8n-wave.mjs apply-id NGvnsYXF8cpFTHA1 scripts/n8n-edits/daily_maintenance_client_errors.mjs
const NAME = 'Purge Old Client Errors';
const AFTER = 'Purge Old Deals Cache';

export default function (wf) {
  if (wf.nodes.some((n) => n.name === NAME)) return wf;
  const anchor = wf.nodes.find((n) => n.name === AFTER);
  if (!anchor) throw new Error(`node "${AFTER}" not found`);
  wf.nodes.push({
    id: 'purge-client-errors',
    name: NAME,
    type: 'n8n-nodes-base.mySql',
    typeVersion: 2.4,
    position: [anchor.position[0] + 220, anchor.position[1]],
    parameters: { operation: 'executeQuery', query: 'DELETE FROM client_errors\nWHERE created_at < NOW() - INTERVAL 90 DAY;', options: {} },
    credentials: { mySql: { id: 'lqIXlvVVqfE4v7DF', name: 'MySQL account' } },
  });
  const conns = (wf.connections[AFTER] ||= { main: [] });
  if (conns.main[0] && conns.main[0].length) throw new Error(`"${AFTER}" already has a downstream node: ${conns.main[0].map((c) => c.node).join('+')}`);
  conns.main[0] = [{ node: NAME, type: 'main', index: 0 }];
  return wf;
}
