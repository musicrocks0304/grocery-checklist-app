// Zero rows from Postgres left the Respond node unreached → empty 200.
// Pattern: data node alwaysOutputData → Aggregate → Respond (json, drop empty rows).
export default function (wf) {
  const data = wf.nodes.find((n) => n.name === 'Query Active Coupons');
  const respond = wf.nodes.find((n) => n.type === 'n8n-nodes-base.respondToWebhook' && n.name !== 'Respond 500');
  data.alwaysOutputData = true;
  if (!wf.nodes.some((n) => n.name === 'Aggregate')) {
    wf.nodes.push({ id: 'aggregate-rows', name: 'Aggregate', type: 'n8n-nodes-base.aggregate', typeVersion: 1,
      position: [respond.position[0] - 220, respond.position[1]], parameters: { aggregate: 'aggregateAllItemData', options: {} } });
  }
  respond.parameters.respondWith = 'json';
  respond.parameters.responseBody = "={{ JSON.stringify(($json.data || []).filter((r) => r && r.hash_id != null)) }}";
  respond.parameters.options = { ...(respond.parameters.options || {}), responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Content-Type', value: 'application/json' }] } };
  wf.connections[data.name] = { main: [[{ node: 'Aggregate', type: 'main', index: 0 }]] };
  wf.connections['Aggregate'] = { main: [[{ node: respond.name, type: 'main', index: 0 }]] };
  return wf;
}
