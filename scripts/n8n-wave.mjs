#!/usr/bin/env node
// n8n rollout tool for hardening sub-project A. See plan Task 9 for the command list.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ENV_FILE = process.env.N8N_ENV_FILE || 'C:\\hsa-automation\\.env';
const BASE = process.env.N8N_API_BASE || 'http://localhost:5679/api/v1';
const KEY = (readFileSync(ENV_FILE, 'utf8').match(/^N8N_API_KEY=(.*)$/m) || [])[1]?.trim();
if (!KEY) { console.error(`N8N_API_KEY not found in ${ENV_FILE}`); process.exit(1); }

const SETTINGS_KEYS = ['executionOrder', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveManualExecutions', 'saveExecutionProgress', 'executionTimeout', 'errorWorkflow', 'timezone', 'callerPolicy', 'availableInMCP'];
const CRED = { id: 'OzxeppJmnYuJpXbO', name: 'Grocery App API Key' };
const DATA_TYPES = ['n8n-nodes-base.mySql', 'n8n-nodes-base.postgres', 'n8n-nodes-base.httpRequest', 'n8n-nodes-base.code'];
export const RESPOND_503_BODY = '={{ JSON.stringify({ success: false, error: "Database unavailable — please try again" }) }}';
export const RESPOND_500_BODY ="={{ (() => { const e = $json.error; const raw = typeof e === 'string' ? e : ((e && e.message) || 'Workflow error'); const safe = String(raw).split(/\\bnear\\b|\\bSELECT\\b|\\bINSERT\\b|\\bUPDATE\\b|\\bDELETE\\b/i)[0].replace(/host\\.docker\\.internal|hsa-[a-z0-9_-]+/gi, 'db').trim().slice(0, 200); return JSON.stringify({ success: false, error: safe || 'Workflow error' }); })() }}";

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
  const pristine = await api('GET', `/workflows/${wf.id}`);
  const backupDir = '.n8n-backups/pre-save';
  mkdirSync(backupDir, { recursive: true });
  const backupPath = `${backupDir}/${wf.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(backupPath, JSON.stringify(pristine, null, 1));
  console.log(`pre-save backup: ${backupPath}`);
  const dropped = Object.keys(wf.settings || {}).filter((k) => !SETTINGS_KEYS.includes(k));
  if (dropped.length) console.warn(`dropping settings keys: ${dropped.join(', ')}`);
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => SETTINGS_KEYS.includes(k)));
  await api('PUT', `/workflows/${wf.id}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
  await cycle(wf.id, wf.name);
  show(await api('GET', `/workflows/${wf.id}`));
}
async function cycle(id, name) {
  await api('POST', `/workflows/${id}/deactivate`);
  try {
    await api('POST', `/workflows/${id}/activate`);
  } catch (e) {
    console.error(`WORKFLOW ${name || ''} (${id}) IS NOW INACTIVE — fix the error and run: node scripts/n8n-wave.mjs cycle <path>`);
    throw e;
  }
  console.log(`cycled ${id}`);
}

function ensureRespond500(wf) {
  const canonicalParams = { respondWith: 'json', responseBody: RESPOND_500_BODY, options: { responseCode: 500, responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } };
  let node = wf.nodes.find((n) => n.name === 'Respond 500');
  if (node) {
    if (node.type !== 'n8n-nodes-base.respondToWebhook') throw new Error(`node "Respond 500" exists but is ${node.type}, expected n8n-nodes-base.respondToWebhook`);
    node.typeVersion = 1.4;
    node.parameters = canonicalParams;
    return node;
  }
  const anyRespond = wf.nodes.find((n) => n.type === 'n8n-nodes-base.respondToWebhook');
  const position = anyRespond ? [anyRespond.position[0], anyRespond.position[1] + 260] : [900, 500];
  node = { id: 'respond-500', name: 'Respond 500', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.4, position, parameters: canonicalParams };
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
    if (main[1] && main[1].length && !(main[1].length === 1 && main[1][0].node === 'Respond 500')) {
      throw new Error(`node "${name}" already has an error output wired to ${main[1].map((x) => x.node).join('+')}`);
    }
    main[1] = [{ node: 'Respond 500', type: 'main', index: 0 }];
  }
}

// --- Task 12b: database-outage guards -------------------------------------
// n8n 1.121.3 does NOT route a connection-level DB failure (`connect ETIMEDOUT`
// while MySQL is down) to `onError: continueErrorOutput`; it passes the node's
// INPUT item down output 0 and the success chain keeps running, so a mutation
// endpoint answers 200 {"success":true} without having written anything.
// `DB ok?` re-checks each data node's output just before the success Respond:
// the Webhook item is recognisable by its `webhookUrl` key, and a node that ran
// but produced nothing (or only an `alwaysOutputData` `{}` placeholder) is a
// failure too for a node that must have produced a row.
function ensureRespond503(wf, successRespond) {
  const canonicalParams = { respondWith: 'json', responseBody: RESPOND_503_BODY, options: { responseCode: 503, responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } };
  let node = wf.nodes.find((n) => n.name === 'Respond 503');
  if (node) {
    if (node.type !== 'n8n-nodes-base.respondToWebhook') throw new Error(`node "Respond 503" exists but is ${node.type}, expected n8n-nodes-base.respondToWebhook`);
    node.typeVersion = 1.4;
    node.parameters = canonicalParams;
    return node;
  }
  node = { id: 'respond-503', name: 'Respond 503', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.4, position: [successRespond.position[0], successRespond.position[1] + 520], parameters: canonicalParams };
  wf.nodes.push(node);
  return node;
}

// `null` from get() = the node never ran on this execution (e.g. the untaken
// branch of an IF) and is skipped; `undefined` = it ran and produced nothing.
const guardExpression = (strict, lenient) => `={{ (() => { const S = ${JSON.stringify(strict)}; const L = ${JSON.stringify(lenient)}; const get = (n) => { try { const it = $(n).first(); return it ? (it.json || {}) : undefined; } catch (e) { return null; } }; for (const n of S) { const j = get(n); if (j === null) continue; if (j === undefined || 'webhookUrl' in j || Object.keys(j).length === 0) return false; } for (const n of L) { const j = get(n); if (j === null || j === undefined) continue; if ('webhookUrl' in j) return false; } return true; })() }}`;

const guardNode = (id, name, position, expression) => ({
  id,
  name,
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position,
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: `${id}-cond`, leftValue: expression, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and',
    },
    options: {},
  },
});

function dbGuard(wf, { strict = [], lenient = [], respond = null, first = null }) {
  const responds = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.respondToWebhook');
  let success;
  if (respond) {
    success = responds.find((n) => n.name === respond);
    if (!success) throw new Error(`--respond node "${respond}" is not a respondToWebhook node in this workflow`);
  } else {
    const candidates = responds.filter((n) => n.name !== 'Respond 500' && n.name !== 'Respond 503');
    if (candidates.length !== 1) throw new Error(`cannot pick the success Respond node — found ${candidates.length} [${candidates.map((n) => n.name).join(', ')}]; pass --respond`);
    success = candidates[0];
  }
  if (!strict.length && !lenient.length) throw new Error('--strict and/or --lenient must name at least one node');
  for (const name of [...strict, ...lenient, ...(first ? [first] : [])]) {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`node "${name}" not found`);
    if (n.type === 'n8n-nodes-base.respondToWebhook') throw new Error(`node "${name}" is a respondToWebhook node; it cannot be guarded`);
  }
  ensureRespond503(wf, success);

  const slug = respond ? respond.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : null;
  const guardName = respond ? `DB ok? (${respond})` : 'DB ok?';
  const guardId = respond ? `db-guard-${slug}` : 'db-guard';
  const expression = guardExpression(strict, lenient);
  const existing = wf.nodes.find((n) => n.name === guardName);
  if (existing) {
    existing.parameters.conditions.conditions[0].leftValue = expression; // idempotent: refresh the condition, leave the wiring
  } else {
    wf.nodes.push(guardNode(guardId, guardName, [success.position[0] - 220, success.position[1]], expression));
    for (const [name, conns] of Object.entries(wf.connections)) {
      if (name === guardName) continue;
      for (const out of conns.main || []) {
        for (const c of out || []) if (c.node === success.name) c.node = guardName;
      }
    }
    wf.connections[guardName] = { main: [[{ node: success.name, type: 'main', index: 0 }], [{ node: 'Respond 503', type: 'main', index: 0 }]] };
  }

  if (first) {
    const anchor = wf.nodes.find((x) => x.name === first);
    const earlyName = respond ? `DB ok (early)? (${respond})` : 'DB ok (early)?';
    const earlyId = respond ? `db-guard-early-${slug}` : 'db-guard-early';
    const earlyExpression = strict.includes(first) ? guardExpression([first], []) : guardExpression([], [first]);
    const earlyExisting = wf.nodes.find((n) => n.name === earlyName);
    if (earlyExisting) {
      earlyExisting.parameters.conditions.conditions[0].leftValue = earlyExpression;
    } else {
      wf.nodes.push(guardNode(earlyId, earlyName, [anchor.position[0] + 180, anchor.position[1]], earlyExpression));
      const conns = (wf.connections[first] ||= { main: [] });
      const downstream = conns.main[0] || [];
      conns.main[0] = [{ node: earlyName, type: 'main', index: 0 }];
      wf.connections[earlyName] = { main: [downstream, [{ node: 'Respond 503', type: 'main', index: 0 }]] };
    }
  }
  return wf;
}

// `alwaysOutputData` on a mutating node hands the guard an indistinguishable
// `{}`; INSERT/UPDATE/DELETE nodes emit `{success:true}` on their own, so the
// flag is redundant there. It stays on every SELECT (wave 1 zero-row JSON).
function dropAod(wf, names) {
  for (const name of names) {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`node "${name}" not found`);
    if (n.type !== 'n8n-nodes-base.mySql' && n.type !== 'n8n-nodes-base.postgres') throw new Error(`node "${name}" is ${n.type}; drop-aod only applies to MySQL/Postgres nodes`);
    if (/^select\b/i.test(String(n.parameters?.query || '').trim())) throw new Error(`node "${name}" runs a SELECT; alwaysOutputData must stay (zero-row JSON responses depend on it)`);
    if (!n.alwaysOutputData) console.warn(`node "${name}" has no alwaysOutputData — nothing to drop`);
    delete n.alwaysOutputData;
  }
  return wf;
}

const USAGE = 'usage: n8n-wave.mjs export | show <path> | auth <path…> | error-branch <path> --nodes "A,B" | unswallow <path> --nodes "A,B" | db-guard <path> --strict "A,B" [--lenient "C,D"] [--respond "Respond X"] [--first "A"] | drop-aod <path> --nodes "A,B" | apply <path> <file.mjs> | cycle <path>';
const [cmd, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : null; };
const VALUE_FLAGS = ['--nodes', '--nodes-json', '--strict', '--strict-json', '--lenient', '--lenient-json', '--respond', '--first'];
const paths = rest.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(rest[i - 1]));
// --<name> "A,B" for simple names; --<name>-json '["A, with comma","B"]' when a node name contains a comma.
function nameList(base, { required = false } = {}) {
  const json = opt(`--${base}-json`);
  if (json !== null && json !== undefined) {
    let parsed;
    try { parsed = JSON.parse(json); } catch { parsed = null; }
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((s) => typeof s === 'string')) {
      console.error(`--${base}-json must parse to a non-empty array of strings`);
      console.error(USAGE);
      process.exit(2);
    }
    return parsed;
  }
  const raw = opt(`--${base}`);
  if (raw === null || raw === undefined) {
    if (!required) return [];
    console.error(`--${base} or --${base}-json is required`);
    console.error(USAGE);
    process.exit(2);
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
const nodeList = () => nameList('nodes', { required: true });

(async () => {
  switch (cmd) {
    case 'export': {
      const dir = `.n8n-backups/${new Date().toISOString().replace(/[:.]/g, '-')}`;
      mkdirSync(dir, { recursive: true });
      for (const w of await listActive()) writeFileSync(`${dir}/${w.id}.json`, JSON.stringify(await api('GET', `/workflows/${w.id}`), null, 1));
      console.log(`exported to ${dir}`); break;
    }
    case 'show': show(await byPath(paths[0])); break;
    case 'auth': {
      const succeeded = []; const failed = [];
      for (const p of paths) {
        try {
          const wf = await byPath(p);
          const wh = webhookNode(wf);
          wh.parameters.authentication = 'headerAuth';
          wh.credentials = { ...(wh.credentials || {}), httpHeaderAuth: CRED };
          await save(wf);
          succeeded.push(p);
        } catch (e) {
          console.error(`auth failed for "${p}": ${e.message}`);
          failed.push(p);
        }
      }
      console.log(`auth: succeeded=[${succeeded.join(', ')}] failed=[${failed.join(', ')}]`);
      if (failed.length) process.exit(1);
      break;
    }
    case 'error-branch': { const wf = await byPath(paths[0]); errorBranch(wf, nodeList()); await save(wf); break; }
    case 'unswallow': { const wf = await byPath(paths[0]); for (const name of nodeList()) { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`node "${name}" not found`); delete n.continueOnFail; delete n.onError; } await save(wf); break; }
    case 'db-guard': {
      const wf = await byPath(paths[0]);
      dbGuard(wf, { strict: nameList('strict'), lenient: nameList('lenient'), respond: opt('--respond') || null, first: opt('--first') || null });
      await save(wf); break;
    }
    case 'drop-aod': { const wf = await byPath(paths[0]); dropAod(wf, nodeList()); await save(wf); break; }
    case 'apply': { const wf = await byPath(paths[0]); const mod = await import(pathToFileURL(paths[1]).href); const edited = await mod.default(wf, { ensureRespond500, errorBranch, RESPOND_500_BODY, ensureRespond503, dbGuard, dropAod, RESPOND_503_BODY }); await save(edited || wf); break; }
    case 'cycle': { const wf = await byPath(paths[0]); await cycle(wf.id, wf.name); break; }
    default: console.log(USAGE); process.exit(1);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
