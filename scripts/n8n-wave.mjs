#!/usr/bin/env node
// n8n rollout tool for hardening sub-project A. See plan Task 9 for the command list.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ENV_FILE = process.env.N8N_ENV_FILE || 'C:\\hsa-automation\\.env';
const BASE = process.env.N8N_API_BASE || 'http://localhost:5679/api/v1';
const KEY = (readFileSync(ENV_FILE, 'utf8').match(/^N8N_API_KEY=(.*)$/m) || [])[1]?.trim();
if (!KEY) { console.error(`N8N_API_KEY not found in ${ENV_FILE}`); process.exit(1); }

const SETTINGS_KEYS = ['executionOrder', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveManualExecutions', 'saveExecutionProgress', 'executionTimeout', 'errorWorkflow', 'timezone'];
const CRED = { id: 'OzxeppJmnYuJpXbO', name: 'Grocery App API Key' };
const DATA_TYPES = ['n8n-nodes-base.mySql', 'n8n-nodes-base.postgres', 'n8n-nodes-base.httpRequest', 'n8n-nodes-base.code'];
export const RESPOND_500_BODY = "={{ (() => { const e = $json.error; const raw = typeof e === 'string' ? e : ((e && e.message) || $json.message || 'Workflow error'); const safe = String(raw).split(/\\bnear\\b|\\bSELECT\\b|\\bINSERT\\b|\\bUPDATE\\b|\\bDELETE\\b/i)[0].replace(/host\\.docker\\.internal|hsa-[a-z0-9_-]+/gi, 'db').trim().slice(0, 200); return JSON.stringify({ success: false, error: safe || 'Workflow error' }); })() }}";

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const webhookNode = (wf) => wf.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
async function listActive() { return (await api('GET', '/workflows?active=true&limit=100')).data; }
async function byPath(path) {
  const wf = (await listActive()).find((w) => webhookNode(w)?.parameters?.path === path);
  if (!wf) throw new Error(`no active workflow with webhook path "${path}"`);
  return api('GET', `/workflows/${wf.id}`);
}

function show(wf) {
  const wh = webhookNode(wf);
  console.log(`${wf.name} (${wf.id}) ${wh.parameters.httpMethod || 'GET'} /${wh.parameters.path} auth=${wh.parameters.authentication || 'none'} cred=${wh.credentials?.httpHeaderAuth?.id || '-'} webhookId=${wh.webhookId}`);
  for (const n of wf.nodes) {
    if (n.type === 'n8n-nodes-base.stickyNote') continue;
    const flags = [n.onError && `onError=${n.onError}`, n.continueOnFail && 'continueOnFail', n.alwaysOutputData && 'alwaysOutputData'].filter(Boolean).join(',');
    const outs = (wf.connections[n.name]?.main || []).map((o, i) => `[${i}]→${(o || []).map((x) => x.node).join('+') || '∅'}`).join(' ');
    console.log(`  - ${n.name} <${n.type.split('.').pop()} v${n.typeVersion}> ${flags} | ${outs}`);
  }
}

async function save(wf) {
  const wh = webhookNode(wf);
  if (!wh?.webhookId) throw new Error('refusing to save: Webhook node has no webhookId');
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => SETTINGS_KEYS.includes(k)));
  await api('PUT', `/workflows/${wf.id}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
  await cycle(wf.id);
  show(await api('GET', `/workflows/${wf.id}`));
}
async function cycle(id) {
  await api('POST', `/workflows/${id}/deactivate`);
  await api('POST', `/workflows/${id}/activate`);
  console.log(`cycled ${id}`);
}

function ensureRespond500(wf) {
  let node = wf.nodes.find((n) => n.name === 'Respond 500');
  if (node) return node;
  const anyRespond = wf.nodes.find((n) => n.type === 'n8n-nodes-base.respondToWebhook');
  const position = anyRespond ? [anyRespond.position[0], anyRespond.position[1] + 260] : [900, 500];
  node = { id: 'respond-500', name: 'Respond 500', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.4, position,
    parameters: { respondWith: 'json', responseBody: RESPOND_500_BODY, options: { responseCode: 500, responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } } };
  wf.nodes.push(node);
  return node;
}
function errorBranch(wf, names) {
  ensureRespond500(wf);
  for (const name of names) {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`node "${name}" not found`);
    if (!DATA_TYPES.includes(n.type)) throw new Error(`node "${name}" is ${n.type}; error outputs only work on MySQL/Postgres/HTTP Request/Code`);
    n.onError = 'continueErrorOutput';
    delete n.continueOnFail;
    const main = (wf.connections[name] ||= { main: [] }).main;
    main[0] ||= [];
    main[1] = [{ node: 'Respond 500', type: 'main', index: 0 }];
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : null; };
const paths = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--nodes' && rest[i - 1] !== '--nodes-json');
// --nodes "A,B" for simple names; --nodes-json '["A, with comma","B"]' when a node name contains a comma.
const nodeList = () => (opt('--nodes-json') ? JSON.parse(opt('--nodes-json')) : opt('--nodes').split(',').map((s) => s.trim()));

(async () => {
  switch (cmd) {
    case 'export': {
      const dir = `.n8n-backups/${new Date().toISOString().replace(/[:.]/g, '-')}`;
      mkdirSync(dir, { recursive: true });
      for (const w of await listActive()) writeFileSync(`${dir}/${w.id}.json`, JSON.stringify(await api('GET', `/workflows/${w.id}`), null, 1));
      console.log(`exported to ${dir}`); break;
    }
    case 'show': show(await byPath(paths[0])); break;
    case 'auth': for (const p of paths) { const wf = await byPath(p); const wh = webhookNode(wf); wh.parameters.authentication = 'headerAuth'; wh.credentials = { ...(wh.credentials || {}), httpHeaderAuth: CRED }; await save(wf); } break;
    case 'error-branch': { const wf = await byPath(paths[0]); errorBranch(wf, nodeList()); await save(wf); break; }
    case 'unswallow': { const wf = await byPath(paths[0]); for (const name of nodeList()) { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`node "${name}" not found`); delete n.continueOnFail; delete n.onError; } await save(wf); break; }
    case 'apply': { const wf = await byPath(paths[0]); const mod = await import(pathToFileURL(paths[1]).href); const edited = mod.default(wf, { ensureRespond500, errorBranch, RESPOND_500_BODY }); await save(edited || wf); break; }
    case 'cycle': { const wf = await byPath(paths[0]); await cycle(wf.id); break; }
    default: console.log('usage: n8n-wave.mjs export | show <path> | auth <path…> | error-branch <path> --nodes "A,B" | unswallow <path> --nodes "A,B" | apply <path> <file.mjs> | cycle <path>'); process.exit(1);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
