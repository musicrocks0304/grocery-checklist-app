// Answers every n8n and clip-server request from fixtures, records what the UI
// sent, and lets a test override responses. Unmocked paths return 404 and fail
// the test at teardown so a new endpoint cannot slip through unnoticed.
const fs = require('fs');
const path = require('path');
const { WEEK } = require('./week.js');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const N8N_HOST = 'n8n.test';
const CLIP_HOST = 'clip.test';

function readFixture(rel) {
  const file = path.join(FIXTURES, rel);
  if (!fs.existsSync(file)) return undefined;
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (json && typeof json === 'object' && !Array.isArray(json)) delete json._recorded;
  return json;
}

class MockBackend {
  constructor(page) {
    this.page = page;
    this.records = new Map();   // path -> [{method, query, body}]
    this.overrides = new Map(); // path -> [{status, body, headers}]
    this.unmocked = [];
    this.clipState = 'expired';
    this.keyErrors = [];
    this.oneoffCounter = 900000; // per-test state; a module-level counter would leak across tests
  }

  // Mutations the app performs; bodies mirror the real Respond nodes.
  mutationBody(p, body) {
    switch (p) {
      case 'add_oneoff_item':
        this.oneoffCounter += 1;
        return { success: true, itemId: this.oneoffCounter, message: `${body.itemName} added as one-off item` };
      case 'selection_check': case 'selection_uncheck':
      case 'shopping_progress_check': case 'shopping_progress_uncheck':
      case 'submit_feedback': case 'save_coupon_matches':
        return { success: true };
      case 'remove_weekly_item':
        return { success: true, message: 'Item removed from this week' };
      case 'create_session':
        return { code: 'E2E1', week_start_date: WEEK.startDate, expires_at: '2026-09-09 14:00:00' };
      case 'add_weekly_selection': case 'remove_weekly_selection':
        return readFixture('n8n/fetch_weekly_meals.json') || [];
      default:
        return undefined;
    }
  }

  async install() {
    await this.page.route(`**/${N8N_HOST}/**`, (route) => this.handleN8n(route));
    await this.page.route(`**/${CLIP_HOST}/**`, (route) => this.handleClip(route));
  }

  calls(p) { return this.records.get(p) || []; }
  set(p, { status = 200, body = '', times = 1, headers = {} } = {}) {
    const list = this.overrides.get(p) || [];
    for (let i = 0; i < times; i++) list.push({ status, body, headers });
    this.overrides.set(p, list);
  }
  clip(state) { this.clipState = state; }

  record(p, request) {
    let body = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    const url = new URL(request.url());
    const list = this.records.get(p) || [];
    list.push({ method: request.method(), query: Object.fromEntries(url.searchParams), body });
    this.records.set(p, list);
  }

  fulfil(route, status, body, extraHeaders = {}) {
    const isString = typeof body === 'string';
    return route.fulfill({
      status,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
      body: isString ? body : JSON.stringify(body),
    });
  }

  takeOverride(p) {
    const list = this.overrides.get(p);
    if (!list || list.length === 0) return null;
    return list.shift();
  }

  async handleN8n(route) {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const url = new URL(request.url());
    const p = url.pathname.replace(/^\/webhook\//, '');
    this.record(p, request);
    if (request.headers()['x-api-key'] !== 'e2e-key') this.keyErrors.push(`${request.method()} ${p}`);
    const ov = this.takeOverride(p);
    if (ov) return this.fulfil(route, ov.status, ov.body, ov.headers);
    if (request.method() === 'GET') {
      const fx = readFixture(`n8n/${p}.json`);
      if (fx !== undefined) return this.fulfil(route, 200, fx);
    } else {
      const parsedBody = (() => { try { return request.postDataJSON(); } catch { return {}; } })();
      const body = this.mutationBody(p, parsedBody);
      if (body !== undefined) return this.fulfil(route, 200, body);
      // Some n8n endpoints (e.g. smart_deals) are read-only queries the app
      // calls via POST with an empty body — not a "mutation" with a synthetic
      // response, so fall back to the same fixture file a GET would use.
      const fx = readFixture(`n8n/${p}.json`);
      if (fx !== undefined) return this.fulfil(route, 200, fx);
    }
    this.unmocked.push({ method: request.method(), path: p });
    return this.fulfil(route, 404, { error: `unmocked ${request.method()} ${p}` });
  }

  async handleClip(route) {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const url = new URL(request.url());
    const p = url.pathname.replace(/^\//, '');
    this.record(p, request);
    const ov = this.takeOverride(p);
    if (ov) return this.fulfil(route, ov.status, ov.body, ov.headers);
    const map = {
      'api/health': `clip/health.${this.clipState}.json`,
      'api/heb/session/status': `clip/session-status.${this.clipState}.json`,
      'api/heb/weekly-items': 'clip/weekly-items.json',
    };
    if (map[p]) return this.fulfil(route, 200, readFixture(map[p]));
    if (p === 'api/heb/matches/all') return this.fulfil(route, 200, { matches: [] });
    if (p === 'api/heb/frequent-cached') return this.fulfil(route, 200, { products: [] });
    if (p === 'api/heb/matches' || p === 'api/heb/matches/confirm' || p === 'api/heb/matches/reject') return this.fulfil(route, 200, { success: true });
    if (p === 'api/heb/session/start') return this.fulfil(route, 200, { sessionId: 'e2e-session' });
    if (p === 'api/heb/session/end') return this.fulfil(route, 200, { success: true });
    if (p === 'api/heb/search-batch') return this.fulfil(route, 200, { results: {} });
    this.unmocked.push({ method: request.method(), path: p });
    return this.fulfil(route, 404, { error: `unmocked ${request.method()} ${p}` });
  }
}

module.exports = { MockBackend };
