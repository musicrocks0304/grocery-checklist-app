#!/usr/bin/env node
// Contract test for the n8n webhooks the grocery app calls.
// Usage: node scripts/webhook-contract.mjs [--wave 0|1|2|3] [--only <path>] [--base <url>]
//        node scripts/webhook-contract.mjs --fault      (pauses hsa-mysql; expects 503 JSON)
// See docs/superpowers/specs/2026-09-05-webhook-contract-design.md §4.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const USAGE = 'Usage: node scripts/webhook-contract.mjs [--wave 0|1|2|3] [--only <path>] [--base <url>] | --fault';
const args = process.argv.slice(2);
const flagIndex = (name) => args.indexOf(name);
const flag = (name, def) => { const i = flagIndex(name); return i >= 0 ? args[i + 1] : def; };
const usageExit = (msg) => { console.error(msg); console.error(USAGE); process.exit(2); };

const FAULT = args.includes('--fault');
const waveIdx = flagIndex('--wave');
if (waveIdx >= 0 && (args[waveIdx + 1] === undefined || !/^[0-3]$/.test(args[waveIdx + 1]))) usageExit(`--wave must be one of 0,1,2,3, got: ${args[waveIdx + 1]}`);
const WAVE = Number(flag('--wave', '0'));

const onlyIdx = flagIndex('--only');
if (onlyIdx >= 0 && (args[onlyIdx + 1] === undefined || args[onlyIdx + 1].startsWith('--'))) usageExit('--only requires a value');
const ONLY = flag('--only', null);

const stripQuotes = (v) => { const m = v.match(/^(['"])(.*)\1$/); return m ? m[2] : v; };
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), stripQuotes(l.slice(i + 1).trim())]; }));
const KEY = env.REACT_APP_API_KEY;
const BASE = flag('--base', env.REACT_APP_API_BASE_URL || 'https://n8n-grocery.needexcelexpert.com/webhook');
if (!KEY) { console.error('REACT_APP_API_KEY missing from .env'); process.exit(1); }

const ORIGIN = 'https://grocery-checklist-app.netlify.app';
const WEEK_START = '2026-01-04';
const WEEK_END = '2026-01-10';
const WEEK_RANGE = 'For the week of January 4th to January 10th, 2026';
const NAME_SEL = '__contract_test__';
const NAME_ONEOFF = '__contract_test_oneoff__';
const ITEM_ID = 999999;
const RECIPE_ID = 1;
const LEAK = /INSERT|SELECT|UPDATE|host\.docker\.internal|hsa-/;

const results = [];
const record = (level, method, path, check, status, detail = '') => {
  results.push({ level, method, path, check, status, detail });
  console.log(`${level.padEnd(4)} ${method.padEnd(4)} /${path.padEnd(30)} ${check.padEnd(28)} ${String(status ?? '-').padEnd(4)} ${detail}`);
};

async function request(path, { method = 'GET', query, body, key = true, timeout = 60000 } = {}) {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const headers = { Origin: ORIGIN, Accept: 'application/json' };
  if (key) headers['X-API-Key'] = KEY;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    const text = await res.text();
    let json = null; let isJson = false;
    if (text.trim()) { try { json = JSON.parse(text); isJson = true; } catch { /* not json */ } }
    return { status: res.status, text, json, isJson, contentType: res.headers.get('content-type') || '' };
  } finally { clearTimeout(t); }
}

function unregistered(r) { return r.status === 404 || (r.status === 500 && r.contentType.includes('text/html')); }
function leak(r) { return LEAK.test(r.text); }

async function checkNoKey(ep) {
  const enforced = ep.wave <= WAVE;
  const r = await request(ep.path, { method: ep.method, query: ep.query, body: ep.method === 'POST' ? (ep.body ?? {}) : undefined, key: false });
  if (unregistered(r)) return record('FAIL', ep.method, ep.path, 'no-key', r.status, 'webhook not registered (re-activate the workflow)');
  if (r.status === 403) return record('PASS', ep.method, ep.path, 'no-key → 403', r.status);
  record(enforced ? 'FAIL' : 'INFO', ep.method, ep.path, `no-key (wave ${ep.wave})`, r.status, enforced ? 'expected 403' : 'auth not yet enabled');
}

function assertErrorBody(ep, r, check) {
  if (unregistered(r)) return record('FAIL', ep.method, ep.path, check, r.status, 'webhook not registered (re-activate the workflow)');
  if (!r.isJson) return record('FAIL', ep.method, ep.path, check, r.status, `not JSON: ${r.text.slice(0, 60)}`);
  if (leak(r)) return record('FAIL', ep.method, ep.path, check, r.status, `leaks internals: ${r.text.slice(0, 80)}`);
  return null;
}

async function checkRead(ep) {
  const r = await request(ep.path, { query: ep.query });
  if (r.status < 200 || r.status >= 300) { if (assertErrorBody(ep, r, 'key → 2xx') === null) record('FAIL', ep.method, ep.path, 'key → 2xx', r.status, 'expected 2xx'); return; }
  if (!r.isJson) return record('FAIL', ep.method, ep.path, 'key → JSON', r.status, r.text.trim() ? `not JSON: ${r.text.slice(0, 60)}` : 'EMPTY BODY (no Respond node fired)');
  const ok = ep.expect ? ep.expect(r.json) : true;
  record(ok ? 'PASS' : 'FAIL', ep.method, ep.path, 'key → 2xx JSON', r.status, ok ? '' : `unexpected shape: ${r.text.slice(0, 80)}`);
}

async function checkProbe(ep) {
  const r = await request(ep.path, { method: 'POST', body: ep.body ?? {} });
  if (r.status >= 200 && r.status < 300) {
    if (leak(r)) return record('FAIL', ep.method, ep.path, 'probe → 2xx', r.status, `leaks internals: ${r.text.slice(0, 80)}`);
    if (ep.softBeforeWave && WAVE < ep.wave) return record('INFO', ep.method, ep.path, 'probe → 2xx (pre-wave)', r.status, 'pre-wave: ' + (r.isJson ? r.text.slice(0, 60) : 'EMPTY/non-JSON body'));
    if (ep.allow2xx && r.isJson) return record('PASS', ep.method, ep.path, 'probe → JSON (no-op)', r.status, 'JSON 2xx by design (no-op)');
    return record('FAIL', ep.method, ep.path, 'probe → ≥400', r.status, r.text.trim() ? `invalid body accepted: ${r.text.slice(0, 60)}` : 'EMPTY BODY (workflow errored without a Respond node)');
  }
  if (assertErrorBody(ep, r, 'probe → error JSON') === null) record('PASS', ep.method, ep.path, 'probe → error JSON', r.status, r.text.slice(0, 60));
}

const isArr = (j) => Array.isArray(j);
// Probe-tier rule (final-review C1): no probe body may ever reach a
// MySQL/Postgres node that mutates. `checkProbe` sends its body WITH the
// API key, so "the workflow will reject an empty body" is not a safe
// assumption — several endpoints' first data node runs a live INSERT/
// UPDATE/DELETE against production before any validation Code node would
// stop it. An endpoint whose first data node can run with an empty/`{}`
// body reaching a mutating SQL node MUST be `probe-nokey` (with a `reason`
// naming that node) instead of `probe`. `probe` is reserved for endpoints
// where the `{}` (or otherwise-empty) body is proven to die before any
// mutating node — e.g. a Code-level 400 (`save_coupon_matches`), an
// `items: []` short-circuit (`match_coupons`, `smart_match_grocery`), or a
// no-SQL external-API error (`transcribe_grocery_item`'s Whisper call).
const EP = [
  { path: 'categories', method: 'GET', wave: 1, tier: 'read', expect: isArr },
  { path: 'fetch_grocery_items', method: 'GET', wave: 1, tier: 'read', query: { weekStartDate: WEEK_START, weekEndDate: WEEK_END, weekDateRange: WEEK_RANGE }, expect: isArr },
  { path: 'fetch_weekly_meals', method: 'GET', wave: 1, tier: 'read', query: { weekDateRange: WEEK_RANGE }, expect: isArr },
  { path: 'fetch_weekly_meal_ingredients', method: 'GET', wave: 1, tier: 'read', query: { weekDateRange: WEEK_RANGE }, expect: isArr },
  { path: 'shopping_progress', method: 'GET', wave: 1, tier: 'read', query: { week_date_range: WEEK_RANGE, week_start_date: WEEK_START }, expect: isArr },
  { path: 'join_session', method: 'GET', wave: 1, tier: 'read', query: { code: 'ZZZZ' }, expect: (j) => j && j.found === false },
  { path: 'grocery_prep_status', method: 'GET', wave: 1, tier: 'read', query: { jobId: NAME_SEL }, expect: (j) => j && typeof j === 'object' },
  { path: 'fetch_feedback', method: 'GET', wave: 1, tier: 'read', query: { status: NAME_SEL }, expect: (j) => isArr(j) && j.length === 0 },
  { path: 'chat_history', method: 'GET', wave: 1, tier: 'read', query: { sessionId: NAME_SEL }, expect: isArr },
  { path: 'choose_recipe_instructions', method: 'GET', wave: 1, tier: 'read', query: { weekDateRange: WEEK_RANGE }, expect: isArr },
  { path: 'grab_instructions_fast', method: 'GET', wave: 1, tier: 'read', query: { weekDateRange: WEEK_RANGE, recipe_id: String(RECIPE_ID) }, expect: (j) => j !== null && typeof j === 'object' },
  { path: 'fetch_heb_coupons', method: 'GET', wave: 1, tier: 'read', expect: isArr },
  { path: 'get_recipe_items', method: 'POST', wave: 1, tier: 'probe-nokey', reason: '"Execute a SQL query" runs an INSERT IGNORE on an empty body' },
  { path: 'match_coupons', method: 'POST', wave: 1, tier: 'probe', body: { items: [] }, allow2xx: true, softBeforeWave: true },
  { path: 'meal_creator_build', method: 'POST', wave: 1, tier: 'probe-nokey' },
  { path: 'add_grocery_items', method: 'POST', wave: 1, tier: 'probe-nokey', reason: '"Insert rows in a table" runs on an empty body' },
  ...['add_oneoff_item', 'selection_check', 'shopping_progress_check', 'shopping_progress_uncheck', 'selection_uncheck', 'add_weekly_selection', 'remove_weekly_selection', 'remove_weekly_item', 'create_session'].map((path) => ({ path, method: 'POST', wave: 2, tier: 'mutate' })),
  { path: 'save_coupon_matches', method: 'POST', wave: 2, tier: 'probe', softBeforeWave: true },
  { path: 'update_feedback_status', method: 'POST', wave: 2, tier: 'probe-nokey', reason: '"Update Feedback" runs on an empty body' },
  { path: 'submit_feedback', method: 'POST', wave: 2, tier: 'probe-nokey', reason: 'writes the bug list; no delete endpoint' },
  { path: 'create_grocery_list', method: 'POST', wave: 2, tier: 'probe-nokey', reason: '"Delete Old Staples" runs on an empty body' },
  { path: 'deactivate_grocery_item', method: 'POST', wave: 2, tier: 'probe-nokey', reason: '"Update rows in a table" — the last baseline ran UPDATE GroceryItems … WHERE ItemID = NaN' },
  { path: 'meal_ingredients', method: 'POST', wave: 2, tier: 'probe-nokey', reason: '"Insert Meal Ingredients" runs on an empty body' },
  { path: 'meal_creator_save', method: 'POST', wave: 2, tier: 'probe-nokey', reason: '"Insert Recipe" runs on an empty body' },
  { path: 'meal_creator_propose', method: 'POST', wave: 2, tier: 'probe-nokey' },
  { path: 'call_grocery_agent', method: 'POST', wave: 2, tier: 'probe-nokey' },
  { path: 'smart_match_grocery', method: 'POST', wave: 3, tier: 'probe', body: { items: [] }, allow2xx: true, softBeforeWave: true },
  { path: 'transcribe_grocery_item', method: 'POST', wave: 3, tier: 'probe', allow2xx: true, softBeforeWave: true },
  { path: 'smart_deals', method: 'POST', wave: 3, tier: 'probe-nokey' },
  { path: 'grocery_prep', method: 'POST', wave: 3, tier: 'probe-nokey' },
  { path: 'categorize_heb_product', method: 'POST', wave: 3, tier: 'probe-nokey' },
  { path: 'client_errors', method: 'POST', wave: 3, tier: 'probe' },
];

if (ONLY && !EP.some((e) => e.path === ONLY)) { console.error(`no endpoint named ${ONLY}`); process.exit(2); }

async function post(path, body) { return request(path, { method: 'POST', body }); }
function okJson(ep, r, check, pred) {
  const method = ep.method || 'POST';
  if (r.status < 200 || r.status >= 300) { if (assertErrorBody(ep, r, check) === null) record('FAIL', method, ep.path, check, r.status, 'expected 2xx'); return false; }
  if (!r.isJson) { record('FAIL', method, ep.path, check, r.status, r.text.trim() ? 'not JSON' : 'EMPTY BODY'); return false; }
  const ok = pred ? pred(r.json) : true;
  record(ok ? 'PASS' : 'FAIL', method, ep.path, check, r.status, ok ? '' : r.text.slice(0, 80));
  return ok;
}
const ep = (path) => EP.find((e) => e.path === path);
const hasName = (j, name) => isArr(j) && j.some((i) => i.ItemName === name);

async function mutationSequence() {
  const success = (j) => j && (j.success === true || (isArr(j) && j[0]?.success === true));
  const selBody = { itemName: NAME_SEL, weekDateRange: WEEK_RANGE, weekStartDate: WEEK_START };
  const progBody = { week_start_date: WEEK_START, item_id: ITEM_ID };
  try {
    okJson(ep('add_oneoff_item'), await post('add_oneoff_item', { itemName: NAME_ONEOFF, weekDateRange: WEEK_RANGE }), 'add one-off', (j) => success(j) && Number.isFinite(Number((isArr(j) ? j[0] : j).itemId)));
    okJson(ep('selection_check'), await post('selection_check', { itemId: ITEM_ID, itemName: NAME_SEL, store: 'HEB', quantity: 1, weekDateRange: WEEK_RANGE, weekStartDate: WEEK_START, category: 'Household & other' }), 'selection check', success);
    okJson(ep('fetch_grocery_items'), await request('fetch_grocery_items', { query: ep('fetch_grocery_items').query }), 'list shows test item', (j) => hasName(j, NAME_SEL));
    okJson(ep('shopping_progress_check'), await post('shopping_progress_check', progBody), 'progress check', success);
    okJson(ep('shopping_progress'), await request('shopping_progress', { query: ep('shopping_progress').query }), 'progress shows item', (j) => isArr(j) && j.some((r) => String(r.item_id) === String(ITEM_ID)));
    okJson(ep('shopping_progress_uncheck'), await post('shopping_progress_uncheck', progBody), 'progress uncheck', success);
    okJson(ep('shopping_progress'), await request('shopping_progress', { query: ep('shopping_progress').query }), 'progress cleared', (j) => isArr(j) && !j.some((r) => String(r.item_id) === String(ITEM_ID)));
    okJson(ep('selection_uncheck'), await post('selection_uncheck', selBody), 'selection uncheck', success);
    okJson(ep('add_weekly_selection'), await post('add_weekly_selection', { weekDateRange: WEEK_RANGE, recipeId: RECIPE_ID, notes: '' }), 'add weekly selection', (j) => isArr(j) && j.some((r) => Number(r.recipe_id) === RECIPE_ID));
    okJson(ep('remove_weekly_selection'), await post('remove_weekly_selection', { weekDateRange: WEEK_RANGE, recipeId: RECIPE_ID }), 'remove weekly selection', (j) => isArr(j) && !j.some((r) => Number(r.recipe_id) === RECIPE_ID));
    okJson(ep('remove_weekly_item'), await post('remove_weekly_item', selBody), 'remove selection item', success);
    okJson(ep('remove_weekly_item'), await post('remove_weekly_item', { ...selBody, itemName: NAME_ONEOFF }), 'remove one-off item', success);
    okJson(ep('fetch_grocery_items'), await request('fetch_grocery_items', { query: ep('fetch_grocery_items').query }), 'list clean', (j) => isArr(j) && !j.some((i) => String(i.ItemName || '').startsWith('__contract_test')));
    const sess = await post('create_session', { week_start_date: WEEK_START });
    if (okJson(ep('create_session'), sess, 'create session', (j) => j && typeof j.code === 'string' && j.code.length === 4)) {
      okJson({ ...ep('join_session') }, await request('join_session', { query: { code: sess.json.code } }), 'join created session', (j) => j && j.found === true);
    }
  } finally {
    await post('shopping_progress_uncheck', progBody).catch(() => {});
    await post('selection_uncheck', selBody).catch(() => {});
    await post('remove_weekly_selection', { weekDateRange: WEEK_RANGE, recipeId: RECIPE_ID }).catch(() => {});
    await post('remove_weekly_item', selBody).catch(() => {});
    await post('remove_weekly_item', { ...selBody, itemName: NAME_ONEOFF }).catch(() => {});
    printCleanupBlock();
  }
}

let cleanupPrinted = false;
function printCleanupBlock() {
  if (cleanupPrinted) return;
  cleanupPrinted = true;
  console.log(`\nCLEANUP (run via docker exec, these rows have no delete endpoint):\n  DELETE FROM shopping_sessions WHERE week_start_date = '${WEEK_START}';\n  DELETE FROM oneoff_items WHERE name = '${NAME_ONEOFF}';`);
}

// --fault: prove the wave-2b `DB ok?` guards answer 503 JSON instead of a
// phantom 200 when the database is unreachable. Each MySQL node burns ~10 s on
// its connect timeout, so the early guards keep the pause well under a minute.
const MYSQL_CONTAINER = 'hsa-mysql';
async function faultMode() {
  const docker = (verb) => execSync(`docker ${verb} ${MYSQL_CONTAINER}`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  console.log(`webhook contract — FAULT MODE — base ${BASE}`);
  console.log(`PAUSING ${MYSQL_CONTAINER} — other clients will fail for ~30 s\n`);
  // Ctrl-C must never leave the database paused.
  const onSignal = (sig) => {
    try { docker('unpause'); console.log(`\n${sig}: unpaused ${MYSQL_CONTAINER}`); } catch (e) { console.error(`\n${sig}: UNPAUSE FAILED — run: docker unpause ${MYSQL_CONTAINER}`); }
    process.exit(130);
  };
  const onInt = () => onSignal('SIGINT');
  const onTerm = () => onSignal('SIGTERM');
  process.once('SIGINT', onInt);
  process.once('SIGTERM', onTerm);
  try {
    docker('pause');
    const cases = [
      { path: 'add_oneoff_item', method: 'POST', run: () => request('add_oneoff_item', { method: 'POST', body: { itemName: NAME_ONEOFF, weekDateRange: WEEK_RANGE }, timeout: 25000 }) },
      { path: 'fetch_weekly_meals', method: 'GET', run: () => request('fetch_weekly_meals', { query: { weekDateRange: WEEK_RANGE }, timeout: 25000 }) },
      { path: 'create_session', method: 'POST', run: () => request('create_session', { method: 'POST', body: { week_start_date: WEEK_START }, timeout: 25000 }) },
      // an UPDATE that matches no row when healthy, so it is safe to replay
      { path: 'save_coupon_matches', method: 'POST', run: () => request('save_coupon_matches', { method: 'POST', body: { acceptCoupon: NAME_SEL }, timeout: 25000 }) },
    ];
    for (const c of cases) {
      try {
        const r = await c.run();
        const ok = r.status === 503 && r.isJson && r.json && r.json.success === false;
        const detail = ok ? r.text.slice(0, 80) : (r.text.trim() ? `expected 503 {success:false}, got: ${r.text.slice(0, 80)}` : 'EMPTY BODY');
        record(ok ? 'PASS' : 'FAIL', c.method, c.path, 'db down → 503 JSON', r.status, detail);
      } catch (err) {
        record('FAIL', c.method, c.path, 'db down → 503 JSON', '-', String(err.message).slice(0, 80));
      }
    }
  } finally {
    docker('unpause');
    // the handlers must not be able to fire (and unpause again) after this
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
    console.log(`\nunpaused ${MYSQL_CONTAINER}`);
  }
  printCleanupBlock();
}

async function main() {
  console.log(`webhook contract — base ${BASE} — enforcing 403 for waves ≤ ${WAVE}\n`);
  if (WAVE >= 1) {
    const targets = EP.filter((e) => e.tier !== 'read' && e.wave <= WAVE && (!ONLY || e.path === ONLY)).map((e) => e.path);
    if (targets.length) console.log(`keyless POSTs will be sent to: ${targets.join(', ')} — these must already require the key; abort with Ctrl-C if wave ${WAVE} is not live\n`);
  }
  let ranSequence = false;
  let sentKeylessNonRead = false;
  for (const e of EP) {
    if (ONLY && e.path !== ONLY) continue;
    try {
      if (e.wave <= WAVE || e.tier === 'read') {
        if (e.tier !== 'read') sentKeylessNonRead = true;
        await checkNoKey(e);
      } else {
        record('INFO', e.method, e.path, 'no-key check deferred', '-', `auth enabled in wave ${e.wave}`);
      }
      if (e.tier === 'read') await checkRead(e);
      else if (e.tier === 'probe') await checkProbe(e);
      else if (e.tier === 'probe-nokey') record('INFO', e.method, e.path, 'with-key skipped', '-', e.reason || 'AI/orchestration cost or side effects');
      else if (e.tier === 'mutate' && !ranSequence && !ONLY) { ranSequence = true; await mutationSequence(); }
    } catch (err) {
      record('FAIL', e.method, e.path, 'exception', '-', String(err.message).slice(0, 80));
    }
  }
  if (ranSequence || sentKeylessNonRead) printCleanupBlock();
}

(FAULT ? faultMode() : main()).catch((err) => {
  record('FAIL', '-', '-', 'exception', '-', String(err.message).slice(0, 80));
}).finally(() => {
  const fails = results.filter((r) => r.level === 'FAIL');
  console.log(`\n${results.filter((r) => r.level === 'PASS').length} passed, ${fails.length} failed, ${results.filter((r) => r.level === 'INFO').length} info`);
  process.exit(!FAULT && WAVE === 0 ? 0 : (fails.length ? 1 : 0));
});
