# Client error telemetry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uncaught client errors and server-fault `ApiError`s reach a keyed `client_errors` n8n webhook and a MySQL table, deduplicated per tab session by stack hash, with a Slack line on first sight; every active n8n workflow names an Error Workflow that posts to Slack; nothing new appears in the UI.

**Architecture:** A framework-free reporter module (`src/telemetry/errorReporter.js`) is installed once from `src/index.js`, listens to `window` `error`/`unhandledrejection`, and is called by `ErrorBoundary` and `apiJson`; it posts with raw `fetch` + `keepalive` and can never throw. A new n8n workflow validates, deduplicates (`INSERT IGNORE` on `(session_id, stack_hash)`), notifies Slack when a hash is new, and follows the A contract (`Respond 400/500/503`, `DB ok?`). An Error Trigger workflow posts to Slack and is set as `settings.errorWorkflow` on every active workflow by a new `n8n-wave.mjs` command.

**Tech Stack:** React 19 / react-scripts 5 (Jest 27, jsdom 16), `@playwright/test` 1.63 (Chromium), Node 22 scripts, n8n 1.121.3 public REST API, MySQL 8 (`hsa`), Slack incoming webhook.

**Spec:** `docs/superpowers/specs/2026-09-06-client-error-telemetry-design.md` (approved 2026-09-06). Read its "Current state" and "Design" sections first; the "Decisions" table is binding.

Branch: `feat/client-error-telemetry` off `main` (`856aac3` or later). Ledger: `.superpowers/sdd/2026-09-06-client-error-telemetry/progress.md` (created by the SDD skill); mirror one task-complete line per task into `.superpowers/sdd/progress.md` as `[client-errors] Task N: …`.

## Global Constraints

- **The reporter never throws, never recurses, never uses `apiFetch`/`apiJson`.** Raw `fetch` with `keepalive: true`, header `X-API-Key`, no retries, no timeout, rejection swallowed. Every exported function body is inside `try/catch`.
- **Privacy:** `message` ≤ 500 chars, `stack` ≤ 2,048 chars, every `?query` on a URL-shaped token removed from both, no request bodies, no item names, endpoint path only (last URL segment, no query). Slack lines carry screen, build, endpoint/status, first 200 chars of message and the hash; never the stack or user agent.
- **Reported `ApiError` codes:** `network`, `empty`, `invalid_json`, and `http` only when `status >= 500`. Never `forbidden`, `timeout`, or 4xx. `network` is skipped while `navigator.onLine === false`.
- **Dedupe/caps (client):** seen-set of stack hashes in `sessionStorage['ce_seen']` (memory fallback), 20 reports per tab session (`sessionStorage['ce_count']`), 5 per rolling 60 s (memory), `/ResizeObserver loop/` dropped. **Server:** `UNIQUE (session_id, stack_hash)` + `INSERT IGNORE`.
- **Stack hash:** FNV-1a 32-bit lower-case hex (8 chars) over `kind`, `endpoint`, `status`, `message`, and the top 5 stack frames with `main.<hash>.js` replaced by `main.js` — joined with `\n`. For `kind: 'api'` the stack is empty (the `ApiError` frames are `apiJson` internals).
- **Session id:** v4 UUID from `src/utils/uuid.js`, `sessionStorage['ce_session']`, one per tab.
- **App version:** the `<hash>` of the first `<script src>` matching `/main\.([0-9a-f]+)\.js/`, else `dev`.
- **Jest tests mock `global.fetch`** via `src/test-utils/mockFetch.js`, never `apiFetch`/`apiJson`. Suites that assert `unmocked()` stay valid because `reportError` is a no-op until `installErrorReporter` runs, and only the reporter's own suite installs it.
- **n8n:** every edit via `scripts/n8n-wave.mjs` (`export` before any change; new commands `create`, `apply-id`, `error-workflow` added here). Webhook nodes keep a fixed `webhookId`. After creating or editing a webhook workflow, `cycle` it. REST base `http://localhost:5679/api/v1`, key `N8N_API_KEY` in `C:\hsa-automation\.env` (`source /c/hsa-automation/.env`). Every webhook curl carries `-H "X-API-Key: $KEY" -H "Origin: https://grocery-checklist-app.netlify.app"` where `KEY=$(grep '^REACT_APP_API_KEY=' .env | cut -d= -f2- | tr -d '\r')`; use `curl -i`, never print the key.
- **MySQL writes/DDL:** `PW=$(grep '^DB_PASSWORD=' "/c/New Grocery App/heb-coupon-scraper/.env" | cut -d= -f2- | tr -d '\r'); docker exec -e MYSQL_PWD="$PW" hsa-mysql mysql -u hsa_user hsa -e "…"`. The MySQL MCP is read-only. Delete every test row you create (Task 5's `0000000dead%` sessions); the Task 8 sentinel row is permanent by design.
- **Never** call `submit_feedback`, `grocery_prep`, `transcribe_grocery_item`, `smart_deals`, `smart_match_grocery`, `categorize_heb_product`, `call_grocery_agent`, `meal_creator_*`, `get_recipe_items`, `add_grocery_items`, `meal_ingredients`, `update_feedback_status`, `create_grocery_list`, or `deactivate_grocery_item` with a valid body. Never make a real workflow fail on purpose; the Error Workflow is tested with the throwaway `zz_error_probe` workflow only.
- **Slack:** real channel, at most two `[TEST]`-marked messages during the whole sub-project (Task 7 probe, Task 8 first sentinel). No other test may reach Slack: the `SLACK_WEBHOOK_URL` env var does not exist inside n8n until Task 7, and the reporter's hermetic tests post to `http://n8n.test`.
- **Gates before every commit that touches `src/`:** `npm run lint` (0 warnings) → `CI=true npx react-scripts test --watchAll=false` (34 suites / 234 tests at start, zero `act()` warnings). Before merging: `npm run test:e2e` (70 hermetic at start, run in the **foreground**), `node scripts/webhook-contract.mjs --wave 3` then its cleanup, `npm run test:e2e:live`.
- **Commits:** one per task, `feat(telemetry): …` / `test(telemetry): …` / `chore(n8n): …` / `docs: …`, ending with a blank line then `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage by explicit path; never `git add -A`/`git add .` (untracked `*.png/*.json/*.yml` scratch files sit in the repo root). Do not push until Task 9.
- **Shell:** Bash tool (Git Bash) from `C:\New Grocery App\grocery-checklist-app`. Foreground runs only; an implementer that backgrounds `npm run test:e2e` stops mid-turn.

---

## File map

| Path | Change | Responsibility |
|---|---|---|
| `docs/migrations/2026-09-06-client-errors.sql` | create | `client_errors` DDL (applied once by hand) |
| `src/telemetry/errorReporter.js` | create | install/uninstall, `reportError`, hashing, dedupe, caps, transport |
| `src/telemetry/errorReporter.test.js` | create | reporter unit tests |
| `src/config/api.js` | modify | `ENDPOINTS.clientErrors`; `raise()` helper reporting server-fault `ApiError`s |
| `src/config/api.test.js` | modify | which codes report |
| `src/components/ErrorBoundary.js` | modify | `componentDidCatch` reports `boundary` |
| `src/components/ErrorBoundary.test.js` | create | fallback UI + one report |
| `src/index.js` | modify | `installErrorReporter` before render |
| `e2e/support/mock-backend.js` | modify | `client_errors` mutation body |
| `e2e/telemetry.spec.js` | create | hermetic reporter e2e |
| `e2e/live/telemetry.live.spec.js` | create | live sentinel + 400 check |
| `e2e/README.md` | modify | live sentinel documented |
| `scripts/n8n-wave.mjs` | modify | `create <file.json> [--inactive]`, `apply-id <id> <edit.mjs>`, `error-workflow <id>` |
| `scripts/n8n-workflows/client-errors.json` | create | webhook workflow definition |
| `scripts/n8n-workflows/error-to-slack.json` | create | Error Trigger workflow definition |
| `scripts/n8n-workflows/zz-error-probe.json` | create | throwaway probe (created and deleted in Task 7) |
| `scripts/n8n-edits/daily_maintenance_client_errors.mjs` | create | 90-day retention node |
| `scripts/webhook-contract.mjs` | modify | `client_errors` probe entry |
| `docs/superpowers/hardening-checklist.md` | modify | E ticked, deferred items |
| `C:\hsa-automation\docker-compose.yaml` | modify (Task 7, operator) | `SLACK_WEBHOOK_URL` for `hsa-local` |

---

### Task 1: Branch, table DDL, migration file

**Files:**
- Create: `docs/migrations/2026-09-06-client-errors.sql`

**Interfaces:**
- Produces: table `client_errors` (columns as below) that Tasks 5, 6, 8 write and read.

- [ ] **Step 1: Create the branch**

```bash
cd "/c/New Grocery App/grocery-checklist-app" && git checkout -b feat/client-error-telemetry main && git log --oneline -1
```
Expected: on `feat/client-error-telemetry` at `856aac3` or later.

- [ ] **Step 2: Write the migration file**

`docs/migrations/2026-09-06-client-errors.sql`:

```sql
-- Client error telemetry (hardening sub-project E). Applied 2026-09-06 with:
--   docker exec -e MYSQL_PWD=<DB_PASSWORD> hsa-mysql mysql -u hsa_user hsa < this file
-- One row per (tab session, stack hash); INSERT IGNORE from the client_errors webhook.
CREATE TABLE client_errors (
  id INT NOT NULL AUTO_INCREMENT,
  session_id CHAR(36) NOT NULL,
  stack_hash CHAR(8) NOT NULL,
  kind VARCHAR(20) NOT NULL COMMENT 'onerror/unhandledrejection/boundary/api',
  screen VARCHAR(50) NULL,
  endpoint VARCHAR(80) NULL COMMENT 'webhook path for kind=api',
  status SMALLINT NULL COMMENT 'HTTP status for kind=api',
  message VARCHAR(500) NOT NULL,
  stack TEXT NULL COMMENT 'first 2048 chars',
  user_agent VARCHAR(255) NULL,
  app_version VARCHAR(40) NULL COMMENT 'main.<hash>.js bundle hash',
  week_date_range VARCHAR(80) NULL,
  client_time DATETIME NULL,
  notified TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 when this row produced the Slack line',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_client_errors_session_hash (session_id, stack_hash),
  KEY ix_client_errors_hash (stack_hash),
  KEY ix_client_errors_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- [ ] **Step 3: Apply it**

```bash
PW=$(grep '^DB_PASSWORD=' "/c/New Grocery App/heb-coupon-scraper/.env" | cut -d= -f2- | tr -d '\r'); docker exec -i -e MYSQL_PWD="$PW" hsa-mysql mysql -u hsa_user hsa < docs/migrations/2026-09-06-client-errors.sql && docker exec -e MYSQL_PWD="$PW" hsa-mysql mysql -u hsa_user hsa -e "SHOW CREATE TABLE client_errors\G" | grep -c "uq_client_errors_session_hash"
```
Expected: `1`. If the table already exists (re-run), `SHOW CREATE TABLE` must still list the unique key and all 15 columns.

- [ ] **Step 4: Prove the unique key**

```bash
PW=$(grep '^DB_PASSWORD=' "/c/New Grocery App/heb-coupon-scraper/.env" | cut -d= -f2- | tr -d '\r'); docker exec -e MYSQL_PWD="$PW" hsa-mysql mysql -u hsa_user hsa -e "INSERT IGNORE INTO client_errors (session_id, stack_hash, kind, message) VALUES ('00000000-0000-4000-8000-0000000dead0','deadbee0','onerror','ddl probe'); INSERT IGNORE INTO client_errors (session_id, stack_hash, kind, message) VALUES ('00000000-0000-4000-8000-0000000dead0','deadbee0','onerror','ddl probe'); SELECT COUNT(*) AS n FROM client_errors WHERE session_id='00000000-0000-4000-8000-0000000dead0'; DELETE FROM client_errors WHERE session_id='00000000-0000-4000-8000-0000000dead0'; SELECT COUNT(*) AS left_over FROM client_errors;"
```
Expected: `n = 1`, `left_over = 0`.

- [ ] **Step 5: Commit**

```bash
git add docs/migrations/2026-09-06-client-errors.sql && git commit -m "feat(telemetry): client_errors table migration

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Reporter module with unit tests

**Files:**
- Create: `src/telemetry/errorReporter.js`
- Test: `src/telemetry/errorReporter.test.js`

**Interfaces:**
- Consumes: `randomUUID` from `src/utils/uuid.js`, `resolveScreenFromHash` from `src/utils/screenRoute.js`, `getWeekDates` from `src/utils/weekDates.js`.
- Produces (used by Tasks 3, 4):
  - `installErrorReporter({ url, apiKey }) → boolean` (false when already installed or `url` missing)
  - `uninstallErrorReporter() → void`
  - `reportError({ kind, error, message, endpoint, status }) → boolean` (true when a POST was issued)
  - `fnv1a(str) → 8-char hex`, `stripQueries(text) → string`, `bundleVersion(doc = document) → string`, `stackHash(kind, message, stack, endpoint, status) → 8-char hex`, `LIMITS`
  - POST body fields: `kind, screen, message, stack, stack_hash, session_id, app_version, user_agent, week_date_range, client_time` (+ `endpoint, status` for `api`).

- [ ] **Step 1: Write the failing tests**

`src/telemetry/errorReporter.test.js`:

```js
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import {
  installErrorReporter, uninstallErrorReporter, reportError,
  fnv1a, stripQueries, bundleVersion, stackHash, LIMITS,
} from './errorReporter';

const URL = 'http://n8n.test/webhook/client_errors';
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX8 = /^[0-9a-f]{8}$/;

let fetchMock;
beforeEach(() => {
  window.sessionStorage.clear();
  window.location.hash = '#shop';
  fetchMock = installMockFetch({ client_errors: { success: true, new: true } });
  installErrorReporter({ url: URL, apiKey: 'test-key' });
});
afterEach(() => {
  uninstallErrorReporter();
  restoreFetch();
  jest.useRealTimers();
});

const posts = () => fetchMock.for('client_errors');
const lastBody = () => posts()[posts().length - 1].body;
const lastInit = () => global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1];
const rejection = (reason) => { const ev = new Event('unhandledrejection'); ev.reason = reason; return ev; };

describe('helpers', () => {
  test('fnv1a is stable, 8 hex chars, and differs per input', () => {
    expect(fnv1a('abc')).toMatch(HEX8);
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
    expect(fnv1a('')).toBe('811c9dc5');
  });
  test('stripQueries removes query strings from URL-shaped tokens only', () => {
    expect(stripQueries('GET https://x.test/webhook/a?key=1&b=2 failed at https://y.test/z?t=3 end')).toBe('GET https://x.test/webhook/a failed at https://y.test/z end');
    expect(stripQueries('what? no url')).toBe('what? no url');
    expect(stripQueries(null)).toBe('');
  });
  test('bundleVersion reads the main.<hash>.js script or falls back to dev', () => {
    expect(bundleVersion({ scripts: [{ src: 'http://localhost/static/js/main.d016df08.js' }] })).toBe('d016df08');
    expect(bundleVersion({ scripts: [{ src: 'http://localhost/static/js/453.chunk.js' }] })).toBe('dev');
    expect(bundleVersion()).toBe('dev');
  });
  test('stackHash ignores the bundle hash but keeps line:column, and folds endpoint/status in', () => {
    const a = stackHash('onerror', 'boom', 'Error: boom\n    at f (http://h/static/js/main.aaaaaaaa.js:2:100)');
    const b = stackHash('onerror', 'boom', 'Error: boom\n    at f (http://h/static/js/main.bbbbbbbb.js:2:100)');
    const c = stackHash('onerror', 'boom', 'Error: boom\n    at f (http://h/static/js/main.aaaaaaaa.js:2:101)');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(stackHash('api', 'Workflow error', '', 'a', 500)).not.toBe(stackHash('api', 'Workflow error', '', 'b', 500));
  });
});

describe('reportError', () => {
  test('posts one keyed keepalive report with the documented fields', () => {
    const err = new Error('boom');
    expect(reportError({ kind: 'onerror', error: err })).toBe(true);
    expect(posts()).toHaveLength(1);
    const init = lastInit();
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.headers['X-API-Key']).toBe('test-key');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = lastBody();
    expect(body).toMatchObject({ kind: 'onerror', screen: 'shop', message: 'boom', app_version: 'dev' });
    expect(body.stack_hash).toMatch(HEX8);
    expect(body.session_id).toMatch(V4);
    expect(body.stack).toContain('boom');
    expect(typeof body.user_agent).toBe('string');
    expect(body.week_date_range).toMatch(/^For the week of /);
    expect(new Date(body.client_time).toString()).not.toBe('Invalid Date');
    expect(body.endpoint).toBeUndefined();
  });
  test('the session id is reused within a tab and stored in sessionStorage', () => {
    reportError({ kind: 'onerror', error: new Error('one') });
    reportError({ kind: 'onerror', error: new Error('two') });
    const [a, b] = posts().map((p) => p.body.session_id);
    expect(a).toBe(b);
    expect(window.sessionStorage.getItem('ce_session')).toBe(a);
  });
  test('the same error twice posts once; a different message posts again', () => {
    const err = new Error('dup');
    expect(reportError({ kind: 'onerror', error: err })).toBe(true);
    expect(reportError({ kind: 'onerror', error: err })).toBe(false);
    expect(posts()).toHaveLength(1);
    expect(reportError({ kind: 'onerror', error: new Error('other') })).toBe(true);
    expect(posts()).toHaveLength(2);
  });
  test('the seen set survives a re-install (sessionStorage)', () => {
    const err = new Error('persist');
    reportError({ kind: 'onerror', error: err });
    uninstallErrorReporter();
    installErrorReporter({ url: URL, apiKey: 'test-key' });
    expect(reportError({ kind: 'onerror', error: err })).toBe(false);
    expect(posts()).toHaveLength(1);
  });
  test('stops after 20 distinct reports in a session (spaced out so the per-minute cap never bites)', () => {
    jest.useFakeTimers('modern');
    let t = Date.parse('2026-09-09T10:00:00');
    for (let i = 0; i < LIMITS.perSession; i++) {
      jest.setSystemTime(t += 15000);
      expect(reportError({ kind: 'onerror', message: `m${i}` })).toBe(true);
    }
    jest.setSystemTime(t += 15000);
    expect(reportError({ kind: 'onerror', message: 'm-overflow' })).toBe(false);
    expect(posts()).toHaveLength(LIMITS.perSession);
    expect(window.sessionStorage.getItem('ce_count')).toBe(String(LIMITS.perSession));
  });
  test('allows 5 per minute, then more after 60 s', () => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-09-09T10:00:00'));
    for (let i = 0; i < LIMITS.perMinute; i++) expect(reportError({ kind: 'onerror', message: `r${i}` })).toBe(true);
    expect(reportError({ kind: 'onerror', message: 'r-burst' })).toBe(false);
    jest.setSystemTime(new Date('2026-09-09T10:01:01'));
    expect(reportError({ kind: 'onerror', message: 'r-later' })).toBe(true);
    expect(posts()).toHaveLength(LIMITS.perMinute + 1);
  });
  test('truncates message and stack and strips query strings from both', () => {
    const err = new Error(`x https://n8n.test/webhook/a?key=secret ${'m'.repeat(600)}`);
    err.stack = `Error: x\n    at f (https://h/static/js/main.abcdef12.js?v=1:2:3)\n${'s'.repeat(3000)}`;
    reportError({ kind: 'onerror', error: err });
    const body = lastBody();
    expect(body.message.length).toBeLessThanOrEqual(LIMITS.message);
    expect(body.message).not.toContain('secret');
    expect(body.stack.length).toBeLessThanOrEqual(LIMITS.stack);
    expect(body.stack).not.toContain('?v=1');
  });
  test('drops ResizeObserver loop noise and empty messages', () => {
    expect(reportError({ kind: 'onerror', message: 'ResizeObserver loop completed with undelivered notifications.' })).toBe(false);
    expect(reportError({ kind: 'onerror', message: '   ' })).toBe(false);
    expect(reportError({ kind: 'onerror' })).toBe(false);
    expect(posts()).toHaveLength(0);
  });
  test('api kind carries endpoint and status, has an empty stack, and is skipped for network errors while offline', () => {
    const apiErr = Object.assign(new Error('Workflow error'), { code: 'http', status: 500 });
    expect(reportError({ kind: 'api', error: apiErr, endpoint: 'fetch_grocery_items', status: 500 })).toBe(true);
    expect(lastBody()).toMatchObject({ kind: 'api', endpoint: 'fetch_grocery_items', status: 500, stack: '' });
    const onLine = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const netErr = Object.assign(new Error('Network error — check your connection'), { code: 'network', status: 0 });
    expect(reportError({ kind: 'api', error: netErr, endpoint: 'categories', status: 0 })).toBe(false);
    onLine.mockReturnValue(true);
    expect(reportError({ kind: 'api', error: netErr, endpoint: 'categories', status: 0 })).toBe(true);
    onLine.mockRestore();
  });
  test('window error and unhandledrejection events are reported with their kinds', () => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('evt'), message: 'evt' }));
    window.dispatchEvent(rejection(new Error('rej')));
    window.dispatchEvent(rejection('plain string reason'));
    window.dispatchEvent(rejection(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    window.dispatchEvent(new ErrorEvent('error', {}));
    const kinds = posts().map((p) => [p.body.kind, p.body.message]);
    expect(kinds).toEqual([['onerror', 'evt'], ['unhandledrejection', 'rej'], ['unhandledrejection', 'plain string reason']]);
  });
  test('is a no-op before install and after uninstall', () => {
    uninstallErrorReporter();
    expect(reportError({ kind: 'onerror', message: 'nobody home' })).toBe(false);
    expect(posts()).toHaveLength(0);
    expect(installErrorReporter({ url: URL, apiKey: 'k' })).toBe(true);
    expect(installErrorReporter({ url: URL, apiKey: 'k' })).toBe(false);
  });
  test('never throws: fetch throwing synchronously, fetch rejecting, sessionStorage throwing', async () => {
    global.fetch = jest.fn(() => { throw new Error('sync'); });
    expect(reportError({ kind: 'onerror', message: 'sync-throw' })).toBe(true);
    global.fetch = jest.fn(() => Promise.reject(new Error('async')));
    expect(reportError({ kind: 'onerror', message: 'async-reject' })).toBe(true);
    await Promise.resolve();
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    uninstallErrorReporter();
    expect(installErrorReporter({ url: URL, apiKey: 'k' })).toBe(true);
    expect(reportError({ kind: 'onerror', message: 'no-storage' })).toBe(true);
    expect(reportError({ kind: 'onerror', message: 'no-storage' })).toBe(false);
    getItem.mockRestore(); setItem.mockRestore();
  });
});
```

- [ ] **Step 2: Run the suite to see it fail**

```bash
CI=true npx react-scripts test --watchAll=false src/telemetry/errorReporter.test.js 2>&1 | tail -20
```
Expected: FAIL, `Cannot find module './errorReporter'`.

- [ ] **Step 3: Write the module**

`src/telemetry/errorReporter.js`:

```js
// Client error telemetry (hardening sub-project E). Framework-free: installed
// once from src/index.js, called by ErrorBoundary (kind 'boundary') and apiJson
// (kind 'api'). Posts with raw fetch — never apiFetch/apiJson, so it can never
// re-enter the API layer — and never throws: every exported function is wrapped.
import { randomUUID } from '../utils/uuid';
import { resolveScreenFromHash } from '../utils/screenRoute';
import { getWeekDates } from '../utils/weekDates';

export const LIMITS = { message: 500, stack: 2048, perSession: 20, perMinute: 5, frames: 5 };
const KINDS = ['onerror', 'unhandledrejection', 'boundary', 'api'];
const SEEN_KEY = 'ce_seen';
const COUNT_KEY = 'ce_count';
const SESSION_KEY = 'ce_session';
const NOISE = /ResizeObserver loop/;

let config = null;
let memory = freshMemory();
let onError = null;
let onRejection = null;

function freshMemory() { return { seen: new Set(), count: 0, session: null, sent: [] }; }
function storage() { try { return window.sessionStorage; } catch { return null; } }
function readJson(key, fallback) {
  try { const s = storage(); const v = s && s.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJson(key, value) { try { const s = storage(); if (s) s.setItem(key, JSON.stringify(value)); } catch { /* memory only */ } }

/** FNV-1a 32-bit as 8 lower-case hex chars. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Remove `?query` from every URL-shaped token; plain question marks stay. */
export function stripQueries(text) {
  return String(text == null ? '' : text).replace(/(https?:\/\/[^\s?#'")]+)\?[^\s'")]*/g, '$1');
}

/** The <hash> of the loaded main.<hash>.js bundle, or 'dev'. */
export function bundleVersion(doc) {
  try {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    const scripts = d && d.scripts ? Array.from(d.scripts) : [];
    for (const s of scripts) { const m = /main\.([0-9a-f]+)\.js/.exec(s.src || ''); if (m) return m[1]; }
  } catch { /* fall through */ }
  return 'dev';
}

/** Hash over kind, endpoint, status, message and the top frames (bundle hash normalised, line:col kept). */
export function stackHash(kind, message, stack, endpoint = '', status = '') {
  const frames = String(stack || '').split('\n')
    .filter((l) => /^\s*at\s|@/.test(l))
    .slice(0, LIMITS.frames)
    .map((l) => l.replace(/main\.[0-9a-f]+\.js/g, 'main.js').trim());
  return fnv1a([kind, endpoint || '', status === undefined || status === null ? '' : String(status), message, ...frames].join('\n'));
}

function sessionId() {
  if (memory.session) return memory.session;
  let id = null;
  try { const s = storage(); id = s ? s.getItem(SESSION_KEY) : null; } catch { id = null; }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = randomUUID();
    try { const s = storage(); if (s) s.setItem(SESSION_KEY, id); } catch { /* memory only */ }
  }
  memory.session = id;
  return id;
}

function currentScreen() {
  try {
    const r = resolveScreenFromHash(window.location.hash);
    return r.join ? 'join' : r.screen;
  } catch { return 'unknown'; }
}

function send(payload) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['X-API-Key'] = config.apiKey;
    const p = fetch(config.url, { method: 'POST', keepalive: true, headers, body: JSON.stringify(payload) });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* never throw */ }
}

/**
 * Report one error. Returns true when a POST was issued, false when skipped
 * (not installed, empty, noise, offline network error, deduped, capped).
 */
export function reportError(input) {
  try {
    if (!config) return false;
    const { kind: rawKind, error, endpoint, status } = input || {};
    const kind = KINDS.includes(rawKind) ? rawKind : 'onerror';
    let raw;
    if (input && input.message != null) raw = String(input.message);
    else if (error && error.message != null) raw = String(error.message);
    else raw = error == null ? '' : String(error);
    const message = stripQueries(raw).slice(0, LIMITS.message).trim();
    if (!message) return false;
    if (NOISE.test(message)) return false;
    if (kind === 'api' && error && error.code === 'network' && typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const stack = kind === 'api' ? '' : stripQueries(error && error.stack ? error.stack : '').slice(0, LIMITS.stack);
    const hash = stackHash(kind, message, stack, kind === 'api' ? endpoint : '', kind === 'api' ? status : '');
    if (memory.seen.has(hash)) return false;
    if (memory.count >= LIMITS.perSession) return false;
    const now = Date.now();
    memory.sent = memory.sent.filter((t) => now - t < 60000);
    if (memory.sent.length >= LIMITS.perMinute) return false;
    memory.seen.add(hash);
    memory.count += 1;
    memory.sent.push(now);
    writeJson(SEEN_KEY, Array.from(memory.seen));
    writeJson(COUNT_KEY, memory.count);
    const payload = {
      kind,
      screen: currentScreen(),
      message,
      stack,
      stack_hash: hash,
      session_id: sessionId(),
      app_version: bundleVersion(),
      user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 255) : '',
      week_date_range: (() => { try { return String(getWeekDates().displayRange || '').slice(0, 80); } catch { return ''; } })(),
      client_time: new Date().toISOString(),
    };
    if (kind === 'api') {
      payload.endpoint = String(endpoint || '').slice(0, 80);
      payload.status = Number.isFinite(Number(status)) ? Number(status) : 0;
    }
    send(payload);
    return true;
  } catch { return false; }
}

/** Install once. Returns false when already installed or no url was given. */
export function installErrorReporter(options) {
  try {
    const { url, apiKey } = options || {};
    if (config || !url) return false;
    config = { url: String(url), apiKey: apiKey ? String(apiKey) : '' };
    const seen = readJson(SEEN_KEY, []);
    memory = freshMemory();
    memory.seen = new Set(Array.isArray(seen) ? seen.filter((h) => typeof h === 'string') : []);
    memory.count = Number(readJson(COUNT_KEY, 0)) || 0;
    onError = (event) => {
      try {
        const err = event && event.error;
        const msg = event && event.message;
        if (!err && !msg) return; // resource-load failures, cross-origin "Script error." with nothing to report
        reportError({ kind: 'onerror', error: err || undefined, message: err && err.message ? undefined : msg });
      } catch { /* never throw */ }
    };
    onRejection = (event) => {
      try {
        const reason = event && event.reason;
        if (reason && reason.name === 'AbortError') return;
        if (reason instanceof Error) reportError({ kind: 'unhandledrejection', error: reason });
        else reportError({ kind: 'unhandledrejection', message: String(reason) });
      } catch { /* never throw */ }
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return true;
  } catch { config = null; return false; }
}

/** Tests only. */
export function uninstallErrorReporter() {
  try {
    if (onError) window.removeEventListener('error', onError);
    if (onRejection) window.removeEventListener('unhandledrejection', onRejection);
  } catch { /* ignore */ }
  config = null; onError = null; onRejection = null; memory = freshMemory();
}
```

- [ ] **Step 4: Run the suite to see it pass**

```bash
CI=true npx react-scripts test --watchAll=false src/telemetry/errorReporter.test.js 2>&1 | tail -30
```
Expected: PASS, 16 tests. If `jest.useFakeTimers('modern')` warns on Jest 27, use `jest.useFakeTimers()` (modern is the default there). If jsdom's `navigator.onLine` getter cannot be spied, replace the spy with `Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })` and restore with `get: () => true`.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint && git add src/telemetry/errorReporter.js src/telemetry/errorReporter.test.js && git commit -m "feat(telemetry): error reporter module (hash, dedupe, caps, keepalive POST)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Wire the reporter into index.js, apiJson, ErrorBoundary; mock it in the e2e backend

**Files:**
- Modify: `src/config/api.js` (ENDPOINTS block; the `apiJson` function), `src/config/api.test.js`, `src/components/ErrorBoundary.js:14-16`, `src/index.js`, `e2e/support/mock-backend.js:35-53`
- Create: `src/components/ErrorBoundary.test.js`

**Interfaces:**
- Consumes: `installErrorReporter`, `reportError` from Task 2.
- Produces: `ENDPOINTS.clientErrors` (`${API_BASE_URL}/client_errors`); `apiJson` reports before throwing for codes `network`, `empty`, `invalid_json`, `http ≥ 500`; hermetic backend answers `POST client_errors` with `{ success: true, new: true }`.

- [ ] **Step 1: Write the failing api tests**

Append to `src/config/api.test.js` (top of file gets the mock; Jest hoists `jest.mock`):

```js
jest.mock('../telemetry/errorReporter', () => ({ reportError: jest.fn() }));
import { reportError } from '../telemetry/errorReporter';
```

and a new describe block at the end:

```js
describe('apiJson → reportError', () => {
  beforeEach(() => { reportError.mockClear(); });
  const url = 'https://n8n.test/webhook/fetch_grocery_items?weekStartDate=2026-09-06';

  test('http 500 after retries reports kind api with endpoint and status', async () => {
    instant();
    global.fetch = jest.fn().mockResolvedValue(res(500, '{"success":false,"error":"Workflow error"}'));
    await expect(apiJson(url)).rejects.toMatchObject({ code: 'http', status: 500 });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toMatchObject({ kind: 'api', endpoint: 'fetch_grocery_items', status: 500 });
    expect(reportError.mock.calls[0][0].error.message).toBe('Workflow error');
  });
  test('503 reports; 403, 404 and a timeout do not', async () => {
    instant();
    global.fetch = jest.fn().mockResolvedValue(res(503, '{"success":false,"error":"Database unavailable"}'));
    await expect(apiJson(url, { method: 'POST' })).rejects.toMatchObject({ code: 'http', status: 503 });
    expect(reportError).toHaveBeenCalledTimes(1);
    reportError.mockClear();
    global.fetch = jest.fn().mockResolvedValue(res(403, 'Forbidden'));
    await expect(apiJson(url)).rejects.toMatchObject({ code: 'forbidden' });
    global.fetch = jest.fn().mockResolvedValue(res(404, '{"error":"nope"}'));
    await expect(apiJson(url)).rejects.toMatchObject({ code: 'http', status: 404 });
    global.fetch = jest.fn().mockImplementation((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    await expect(apiJson(url, { timeout: 20, retries: 0 })).rejects.toMatchObject({ code: 'timeout' });
    expect(reportError).not.toHaveBeenCalled();
  });
  test('empty, invalid_json and network report', async () => {
    instant();
    global.fetch = jest.fn().mockResolvedValue(res(200, '   '));
    await expect(apiJson(url, { retries: 0 })).rejects.toMatchObject({ code: 'empty' });
    global.fetch = jest.fn().mockResolvedValue(res(200, '<html>'));
    await expect(apiJson(url, { retries: 0 })).rejects.toMatchObject({ code: 'invalid_json' });
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiJson(url, { retries: 0 })).rejects.toMatchObject({ code: 'network' });
    expect(reportError.mock.calls.map((c) => c[0].error.code)).toEqual(['empty', 'invalid_json', 'network']);
    expect(reportError.mock.calls.every((c) => c[0].endpoint === 'fetch_grocery_items')).toBe(true);
  });
  test('ENDPOINTS.clientErrors is defined', () => {
    expect(ENDPOINTS.clientErrors).toMatch(/\/client_errors$/);
  });
});
```

- [ ] **Step 2: Write the failing ErrorBoundary test**

`src/components/ErrorBoundary.test.js`:

```js
import React from 'react';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';
import { reportError } from '../telemetry/errorReporter';

jest.mock('../telemetry/errorReporter', () => ({ reportError: jest.fn() }));

function Bomb() { throw new Error('boom'); }

test('a throwing child renders the fallback and reports once with kind boundary', () => {
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<ErrorBoundary><Bomb /></ErrorBoundary>);
  expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  expect(reportError).toHaveBeenCalledTimes(1);
  expect(reportError.mock.calls[0][0]).toMatchObject({ kind: 'boundary' });
  expect(reportError.mock.calls[0][0].error.message).toBe('boom');
  quiet.mockRestore();
});

test('renders children when nothing throws and reports nothing', () => {
  // react-scripts sets resetMocks: true, so the mock's call count starts at 0 here.
  render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
  expect(screen.getByText('fine')).toBeInTheDocument();
  expect(reportError).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run both files to see them fail**

```bash
CI=true npx react-scripts test --watchAll=false src/config/api.test.js src/components/ErrorBoundary.test.js 2>&1 | grep -E "✕|✓|Tests:" | head -40
```
Expected: the four new api tests and the boundary test fail (`reportError` not called / `ENDPOINTS.clientErrors` undefined).

- [ ] **Step 4: Implement**

`src/config/api.js` — add after the `import toast` line:

```js
import { reportError } from '../telemetry/errorReporter';
```

add to `ENDPOINTS` after the `// Feedback` pair:

```js
  // Client error telemetry (hardening sub-project E)
  clientErrors: `${API_BASE_URL}/client_errors`,
```

add just above `export async function apiJson`:

```js
const REPORTED_CODES = ['network', 'empty', 'invalid_json'];
/** Last path segment of a URL, query stripped, ≤ 80 chars — the only URL fact telemetry may carry. */
function endpointOf(url) {
  try {
    const p = new URL(String(url), window.location.origin).pathname;
    return p.slice(p.lastIndexOf('/') + 1).slice(0, 80);
  } catch {
    return String(url).split('?')[0].split('/').pop().slice(0, 80);
  }
}
/** Throw an ApiError, first telling telemetry about server faults (never forbidden/timeout/4xx). */
function raise(url, err) {
  if (REPORTED_CODES.includes(err.code) || (err.code === 'http' && err.status >= 500)) {
    reportError({ kind: 'api', error: err, endpoint: endpointOf(url), status: err.status || 0 });
  }
  throw err;
}
```

then inside `apiJson` replace the five throws:

```js
      throw new ApiError('network', 'Network error — check your connection');
```
→ `raise(url, new ApiError('network', 'Network error — check your connection'));`

```js
    throw new ApiError('network', 'Network error — check your connection', { status: response.status });
```
→ `raise(url, new ApiError('network', 'Network error — check your connection', { status: response.status }));`

```js
    throw new ApiError('http', message, { status: response.status, body: parsed ? body : text });
```
→ `raise(url, new ApiError('http', message, { status: response.status, body: parsed ? body : text }));`

```js
    throw new ApiError('empty', 'The server sent an empty response', { status: response.status });
```
→ `raise(url, new ApiError('empty', 'The server sent an empty response', { status: response.status }));`

```js
    throw new ApiError('invalid_json', 'The server sent an unreadable response', { status: response.status, body: text });
```
→ `raise(url, new ApiError('invalid_json', 'The server sent an unreadable response', { status: response.status, body: text }));`

The `timeout` and `forbidden` throws stay as they are. Because `raise` always throws, control flow is unchanged.

`src/components/ErrorBoundary.js` — add the import and the call:

```js
import { reportError } from '../telemetry/errorReporter';
```
```js
  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    reportError({ kind: 'boundary', error });
  }
```

`src/index.js` — install before render:

```js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './components/App';
import ErrorBoundary from './components/ErrorBoundary';
import { ENDPOINTS } from './config/api';
import { installErrorReporter } from './telemetry/errorReporter';

installErrorReporter({ url: ENDPOINTS.clientErrors, apiKey: process.env.REACT_APP_API_KEY });

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
```

`e2e/support/mock-backend.js` — in `mutationBody`, add a case before `default`:

```js
      case 'client_errors':
        return { success: true, new: true };
```

- [ ] **Step 5: Run the two files, then the whole Jest suite and lint**

```bash
CI=true npx react-scripts test --watchAll=false src/config/api.test.js src/components/ErrorBoundary.test.js 2>&1 | grep -E "Tests:|✕"
CI=true npx react-scripts test --watchAll=false 2>&1 | grep -E "Tests:|Test Suites:|act\(|✕"
npm run lint
```
Expected: the two files pass; `Test Suites: 36 passed`, `Tests: 256 passed` (234 + 16 reporter + 4 api + 2 boundary; adjust if your counts differ but nothing may fail), no `act(` lines, lint clean.

- [ ] **Step 6: Run the hermetic e2e suite in the foreground**

```bash
npm run test:e2e 2>&1 | tail -15
```
Expected: `70 passed`. The feedback "failed submit" spec now also posts `client_errors` (the Plan/feedback 500 overrides make `apiJson` report); the new `mutationBody` case absorbs it, so no `unmocked backend requests` failure.

- [ ] **Step 7: Commit**

```bash
git add src/config/api.js src/config/api.test.js src/components/ErrorBoundary.js src/components/ErrorBoundary.test.js src/index.js e2e/support/mock-backend.js && git commit -m "feat(telemetry): wire reporter into index.js, apiJson server faults and ErrorBoundary

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Hermetic e2e spec for the reporter

**Files:**
- Create: `e2e/telemetry.spec.js`

**Interfaces:**
- Consumes: `backend.calls('client_errors')`, `backend.set(path, { status, body, times })`, `open(page, route)`, `WEEK.displayRange` from `e2e/support/test.js` and `e2e/support/week.js`.

- [ ] **Step 1: Write the spec**

`e2e/telemetry.spec.js`:

```js
const { test, expect, open, WEEK } = require('./support/test.js');

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX8 = /^[0-9a-f]{8}$/;

// One thrower function per page, installed once, so repeated throws share the
// same stack frames (the hash covers the top frames' line:column) and the
// second identical throw is deduplicated by the reporter.
async function installThrower(page) {
  await page.evaluate(() => {
    window.__e2eThrow = (m) => setTimeout(() => { throw new Error(m); }, 0);
    window.__e2eReject = (m) => { Promise.reject(new Error(m)); };
  });
}

test.describe('Client error telemetry', () => {
  test('an uncaught error posts one report; the same error again is deduped; a new one posts', async ({ page, backend }) => {
    await open(page, 'plan');
    await installThrower(page);
    await page.evaluate(() => window.__e2eThrow('e2e telemetry probe'));
    await expect.poll(() => backend.calls('client_errors').length).toBe(1);
    const body = backend.calls('client_errors')[0].body;
    expect(body).toMatchObject({ kind: 'onerror', screen: 'plan', week_date_range: WEEK.displayRange });
    expect(body.message).toContain('e2e telemetry probe');
    expect(body.session_id).toMatch(V4);
    expect(body.stack_hash).toMatch(HEX8);
    expect(body.app_version).toMatch(HEX8); // the served production bundle main.<hash>.js
    expect(body.stack).not.toMatch(/\?[a-z]+=/);
    expect(body.endpoint).toBeUndefined();

    await page.evaluate(() => window.__e2eThrow('e2e telemetry probe'));
    await page.waitForTimeout(750);
    expect(backend.calls('client_errors')).toHaveLength(1);

    await page.evaluate(() => window.__e2eThrow('e2e telemetry probe two'));
    await expect.poll(() => backend.calls('client_errors').length).toBe(2);
    expect(backend.calls('client_errors')[1].body.stack_hash).not.toBe(body.stack_hash);
  });

  test('an unhandled rejection posts with kind unhandledrejection', async ({ page, backend }) => {
    await open(page, 'plan');
    await installThrower(page);
    await page.evaluate(() => window.__e2eReject('e2e rejection probe'));
    await expect.poll(() => backend.calls('client_errors').length).toBe(1);
    expect(backend.calls('client_errors')[0].body).toMatchObject({ kind: 'unhandledrejection', screen: 'plan' });
    expect(backend.calls('client_errors')[0].body.message).toContain('e2e rejection probe');
  });

  test('a 5xx from a data endpoint posts one kind=api report', async ({ page, backend }) => {
    // apiJson retries GETs twice (1 s + 2 s backoff) and Plan may request the
    // list from more than one component, so hand out enough 500s that at
    // least one caller exhausts its retries. Dedupe keeps the report count at 1.
    backend.set('fetch_grocery_items', { status: 500, body: { success: false, error: 'Workflow error' }, times: 6 });
    await open(page, 'plan');
    await expect.poll(() => backend.calls('client_errors').length, { timeout: 20000 }).toBe(1);
    expect(backend.calls('client_errors')[0].body).toMatchObject({ kind: 'api', endpoint: 'fetch_grocery_items', status: 500, screen: 'plan', stack: '' });
    expect(backend.calls('client_errors')[0].body.message).toBe('Workflow error');
  });

  test('a healthy load sends no telemetry', async ({ page, backend }) => {
    await open(page, 'plan');
    await page.waitForTimeout(500);
    expect(backend.calls('client_errors')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it alone in the foreground**

```bash
npx playwright test e2e/telemetry.spec.js 2>&1 | tail -20
```
Expected: 8 passed (4 tests × mobile + desktop). If the second identical throw is NOT deduped, print both bodies' `stack` and compare the frame text; the fix belongs in the spec (a stable thrower), not in the hash. If the `api` test times out, check with `backend.calls('fetch_grocery_items').length` how many attempts were made and raise `times` accordingly.

- [ ] **Step 3: Full hermetic run**

```bash
npm run test:e2e 2>&1 | tail -8
```
Expected: `78 passed`.

- [ ] **Step 4: Commit**

```bash
git add e2e/telemetry.spec.js && git commit -m "test(telemetry): hermetic e2e for onerror, rejection, dedupe and api reports

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: n8n `client_errors` workflow, `create` command, contract entry

**Files:**
- Modify: `scripts/n8n-wave.mjs` (USAGE line ~256; the `switch` at ~302), `scripts/webhook-contract.mjs:140-144`
- Create: `scripts/n8n-workflows/client-errors.json`

**Interfaces:**
- Consumes: the `client_errors` table (Task 1); the existing `auth`, `error-branch`, `db-guard`, `cycle`, `show` commands.
- Produces: an active workflow "Client Error Telemetry" at `POST /webhook/client_errors` answering `200 {success:true,new:bool}`, `400 {success:false,error:"invalid report"}`, `500`/`503` per the A contract; `n8n-wave.mjs create <file.json> [--inactive]`.

- [ ] **Step 1: Add the `create` command to `scripts/n8n-wave.mjs`**

Update `USAGE` to append ` | create <file.json> [--inactive] | apply-id <id> <file.mjs> | error-workflow <id>` (the last two are implemented in Task 6). Add a case before `default:`:

```js
    case 'create': {
      const def = JSON.parse(readFileSync(paths[0], 'utf8'));
      const wh = def.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
      if (wh && !wh.webhookId) throw new Error('refusing to create: Webhook node has no webhookId');
      if (wh) {
        const clash = (await listActive()).find((w) => webhookNode(w)?.parameters?.path === wh.parameters.path);
        if (clash) throw new Error(`an active workflow already serves /${wh.parameters.path}: ${clash.name} (${clash.id})`);
      }
      const settings = Object.fromEntries(Object.entries(def.settings || {}).filter(([k]) => SETTINGS_KEYS.includes(k)));
      const created = await api('POST', '/workflows', { name: def.name, nodes: def.nodes, connections: def.connections, settings });
      const inactive = rest.includes('--inactive');
      if (!inactive) await api('POST', `/workflows/${created.id}/activate`);
      console.log(`created ${created.name} (${created.id})${inactive ? ' (inactive)' : ' and activated'}`);
      break;
    }
```

- [ ] **Step 2: Write the workflow definition**

`scripts/n8n-workflows/client-errors.json` (positions are cosmetic; node names are load-bearing for the later `error-branch`/`db-guard` commands and for the expressions):

```json
{
  "name": "Client Error Telemetry",
  "settings": { "executionOrder": "v1", "saveDataErrorExecution": "all", "saveDataSuccessExecution": "all", "saveManualExecutions": true },
  "nodes": [
    {
      "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 0],
      "webhookId": "c3d4e5f6-7890-abcd-ef01-clienterr0001",
      "parameters": { "httpMethod": "POST", "path": "client_errors", "responseMode": "responseNode", "authentication": "headerAuth", "options": {} },
      "credentials": { "httpHeaderAuth": { "id": "OzxeppJmnYuJpXbO", "name": "Grocery App API Key" } }
    },
    {
      "id": "validate", "name": "Validate", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [220, 0],
      "parameters": { "jsCode": "const b = ($input.first().json.body) || {};\nconst s = (v, n) => (v === undefined || v === null) ? null : String(v).slice(0, n);\nconst KINDS = ['onerror', 'unhandledrejection', 'boundary', 'api'];\nconst kind = KINDS.includes(b.kind) ? b.kind : 'onerror';\nconst stack_hash = (s(b.stack_hash, 8) || '').toLowerCase();\nconst session_id = (s(b.session_id, 36) || '').toLowerCase();\nconst message = (s(b.message, 500) || '').trim();\nconst V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;\nconst valid = /^[0-9a-f]{8}$/.test(stack_hash) && V4.test(session_id) && message.length > 0;\nconst status = (b.status === undefined || b.status === null || b.status === '' || !Number.isFinite(Number(b.status))) ? null : Math.trunc(Number(b.status));\nlet client_time = null;\nif (b.client_time) { const d = new Date(b.client_time); if (!isNaN(d.getTime())) client_time = d.toISOString().slice(0, 19).replace('T', ' '); }\nreturn [{ json: { valid, kind, stack_hash, session_id, screen: s(b.screen, 50), endpoint: s(b.endpoint, 80), status, message, stack: s(b.stack, 2048), user_agent: s(b.user_agent, 255), app_version: s(b.app_version, 40), week_date_range: s(b.week_date_range, 80), client_time } }];" }
    },
    {
      "id": "valid", "name": "Valid?", "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": [440, 0],
      "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [ { "id": "valid-cond", "leftValue": "={{ $json.valid === true }}", "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } } ], "combinator": "and" }, "options": {} }
    },
    {
      "id": "respond-400", "name": "Respond 400", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.4, "position": [660, 200],
      "parameters": { "respondWith": "json", "responseBody": "={{ JSON.stringify({ success: false, error: \"invalid report\" }) }}", "options": { "responseCode": 400, "responseHeaders": { "entries": [ { "name": "Access-Control-Allow-Origin", "value": "*" } ] } } }
    },
    {
      "id": "seen", "name": "Seen before?", "type": "n8n-nodes-base.mySql", "typeVersion": 2.4, "position": [660, -100],
      "parameters": { "operation": "executeQuery", "query": "SELECT\n  (SELECT COUNT(*) FROM client_errors WHERE stack_hash = {{ JSON.stringify($('Validate').first().json.stack_hash) }}) AS seen,\n  (SELECT COUNT(*) FROM client_errors WHERE notified = 1 AND created_at > NOW() - INTERVAL 1 HOUR) AS recent", "options": {} },
      "credentials": { "mySql": { "id": "lqIXlvVVqfE4v7DF", "name": "MySQL account" } }
    },
    {
      "id": "insert", "name": "Insert Error", "type": "n8n-nodes-base.mySql", "typeVersion": 2.4, "position": [880, -100],
      "parameters": { "operation": "executeQuery", "query": "INSERT IGNORE INTO client_errors (session_id, stack_hash, kind, screen, endpoint, status, message, stack, user_agent, app_version, week_date_range, client_time, notified)\nVALUES (\n  {{ JSON.stringify($('Validate').first().json.session_id) }},\n  {{ JSON.stringify($('Validate').first().json.stack_hash) }},\n  {{ JSON.stringify($('Validate').first().json.kind) }},\n  {{ (v => v == null ? 'NULL' : JSON.stringify(v))($('Validate').first().json.screen) }},\n  {{ (v => v == null ? 'NULL' : JSON.stringify(v))($('Validate').first().json.endpoint) }},\n  {{ (v => v == null ? 'NULL' : String(Number(v)))($('Validate').first().json.status) }},\n  {{ JSON.stringify($('Validate').first().json.message) }},\n  {{ (v => v == null ? 'NULL' : JSON.stringify(v))($('Validate').first().json.stack) }},\n  {{ (v => v == null ? 'NULL' : JSON.stringify(v))($('Validate').first().json.user_agent) }},\n  {{ (v => v == null ? 'NULL' : JSON.stringify(v))($('Validate').first().json.app_version) }},\n  {{ (v => v == null ? 'NULL' : JSON.stringify(v))($('Validate').first().json.week_date_range) }},\n  {{ (v => v == null ? 'NULL' : JSON.stringify(v))($('Validate').first().json.client_time) }},\n  {{ (Number($json.seen) === 0 && Number($json.recent) < 10) ? 1 : 0 }}\n)", "options": {} },
      "credentials": { "mySql": { "id": "lqIXlvVVqfE4v7DF", "name": "MySQL account" } }
    },
    {
      "id": "notify", "name": "Notify?", "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": [1100, -100],
      "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [ { "id": "notify-cond", "leftValue": "={{ Number($('Seen before?').first().json.seen) === 0 && Number($('Seen before?').first().json.recent) < 10 }}", "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } } ], "combinator": "and" }, "options": {} }
    },
    {
      "id": "slack", "name": "Slack", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1320, -220],
      "onError": "continueRegularOutput",
      "parameters": { "method": "POST", "url": "={{ $env.SLACK_WEBHOOK_URL }}", "sendBody": true, "specifyBody": "json", "jsonBody": "={{ JSON.stringify({ text: (() => { const v = $('Validate').first().json; const api = v.kind === 'api' ? ', api ' + (v.endpoint || '?') + (v.status ? ' ' + v.status : '') : ''; return '[grocery-app] new client error on #' + (v.screen || '?') + ' (build ' + (v.app_version || '?') + api + '): ' + String(v.message).slice(0, 200) + ' · hash ' + v.stack_hash; })() }) }}", "options": {} }
    },
    {
      "id": "respond", "name": "Respond", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.4, "position": [1540, -100],
      "parameters": { "respondWith": "json", "responseBody": "={{ JSON.stringify({ success: true, new: Number($('Seen before?').first().json.seen) === 0 }) }}", "options": { "responseHeaders": { "entries": [ { "name": "Access-Control-Allow-Origin", "value": "*" } ] } } }
    }
  ],
  "connections": {
    "Webhook": { "main": [ [ { "node": "Validate", "type": "main", "index": 0 } ] ] },
    "Validate": { "main": [ [ { "node": "Valid?", "type": "main", "index": 0 } ] ] },
    "Valid?": { "main": [ [ { "node": "Seen before?", "type": "main", "index": 0 } ], [ { "node": "Respond 400", "type": "main", "index": 0 } ] ] },
    "Seen before?": { "main": [ [ { "node": "Insert Error", "type": "main", "index": 0 } ] ] },
    "Insert Error": { "main": [ [ { "node": "Notify?", "type": "main", "index": 0 } ] ] },
    "Notify?": { "main": [ [ { "node": "Slack", "type": "main", "index": 0 } ], [ { "node": "Respond", "type": "main", "index": 0 } ] ] },
    "Slack": { "main": [ [ { "node": "Respond", "type": "main", "index": 0 } ] ] }
  }
}
```

The MySQL `query` fields use `{{ }}` without a leading `=`, exactly like the working `Insert Feedback` node in `Submit App Feedback` (`Nc8YpkhwrnMeaNUN`); the SQL editor field resolves them. `JSON.stringify` produces a double-quoted MySQL string literal, the same quoting the feedback insert relies on.

- [ ] **Step 3: Export, create, wave**

```bash
node scripts/n8n-wave.mjs export
node scripts/n8n-wave.mjs create scripts/n8n-workflows/client-errors.json
node scripts/n8n-wave.mjs error-branch client_errors --nodes "Validate,Seen before?,Insert Error"
node scripts/n8n-wave.mjs db-guard client_errors --mutation "Insert Error" --require "Seen before?:seen" --respond "Respond"
node scripts/n8n-wave.mjs show client_errors
```
Expected `show`: `auth=headerAuth cred=OzxeppJmnYuJpXbO webhookId=c3d4e5f6-7890-abcd-ef01-clienterr0001`; `Validate`, `Seen before?`, `Insert Error` each `onError=continueErrorOutput` with `[1]→Respond 500`; `Notify?` `[0]→Slack [1]→DB ok? (Respond)`; `Slack` `onError=continueRegularOutput` `[0]→DB ok? (Respond)`; `DB ok? (Respond)` `[0]→Respond [1]→Respond 503`. `--respond "Respond"` is required because `Respond 400` is a second non-500/503 Respond node and `db-guard` refuses to guess. Every `save` cycles the workflow.

- [ ] **Step 4: Live checks with throwaway rows (Slack is unreachable until Task 7, so `Slack` fails and `continueRegularOutput` carries on)**

```bash
KEY=$(grep '^REACT_APP_API_KEY=' .env | cut -d= -f2- | tr -d '\r'); H=(-H "X-API-Key: $KEY" -H "Origin: https://grocery-checklist-app.netlify.app" -H "Content-Type: application/json"); B=https://n8n-grocery.needexcelexpert.com/webhook
curl -s -i -X POST "$B/client_errors" "${H[@]}" -d '{"session_id":"00000000-0000-4000-8000-0000000dead1","stack_hash":"deadbee1","kind":"onerror","screen":"plan","message":"[TEST] task 5 probe ?q=1 it'"'"'s \"quoted\"","stack":"Error: x\n    at f (main.js:2:3)","user_agent":"curl","app_version":"task5","week_date_range":"n/a","client_time":"2026-09-06T20:00:00.000Z"}' | sed -n '1p;/^{/p'
curl -s -i -X POST "$B/client_errors" "${H[@]}" -d '{"session_id":"00000000-0000-4000-8000-0000000dead1","stack_hash":"deadbee1","kind":"onerror","message":"dup"}' | sed -n '1p;/^{/p'
curl -s -i -X POST "$B/client_errors" "${H[@]}" -d '{"session_id":"00000000-0000-4000-8000-0000000dead2","stack_hash":"deadbee1","kind":"api","endpoint":"fetch_grocery_items","status":503,"message":"Database unavailable"}' | sed -n '1p;/^{/p'
curl -s -i -X POST "$B/client_errors" "${H[@]}" -d '{}' | sed -n '1p;/^{/p'
curl -s -i -X POST "$B/client_errors" "${H[@]}" -d '{"session_id":"nope","stack_hash":"ZZZ","kind":"onerror","message":"bad"}' | sed -n '1p;/^{/p'
curl -s -i -X POST "$B/client_errors" -H "Origin: https://grocery-checklist-app.netlify.app" -H "Content-Type: application/json" -d '{}' | sed -n '1p'
```
Expected, in order: `200 {"success":true,"new":true}`; `200 {"success":true,"new":false}` (same session + hash → IGNORE); `200 {"success":true,"new":false}` (new session, seen hash → stored, not notified); `400 {"success":false,"error":"invalid report"}` twice; `403` without the key.

Then verify rows and clean up:

```bash
PW=$(grep '^DB_PASSWORD=' "/c/New Grocery App/heb-coupon-scraper/.env" | cut -d= -f2- | tr -d '\r'); docker exec -e MYSQL_PWD="$PW" hsa-mysql mysql -u hsa_user hsa -e "SELECT session_id, stack_hash, kind, endpoint, status, notified, LEFT(message,40) AS message, client_time FROM client_errors WHERE session_id LIKE '00000000-0000-4000-8000-0000000dead%' ORDER BY id; DELETE FROM client_errors WHERE session_id LIKE '00000000-0000-4000-8000-0000000dead%'; SELECT COUNT(*) AS remaining FROM client_errors;"
```
Expected: two rows (`dead1`/`deadbee1` `notified=1`, message with the apostrophe and quotes intact and `?q=1` still present — the SERVER stores what it is sent; stripping is the client's job; `dead2`/`deadbee1` `kind=api endpoint=fetch_grocery_items status=503 notified=0`), then `remaining = 0`. Check `n8n_list_executions` (or the n8n UI) for the three executions: the `Slack` node errored (no env var) and the run still finished successfully.

- [ ] **Step 5: Outage check**

```bash
docker pause hsa-mysql; sleep 2; curl -s -i -X POST "$B/client_errors" "${H[@]}" -d '{"session_id":"00000000-0000-4000-8000-0000000dead3","stack_hash":"deadbee3","kind":"onerror","message":"outage probe"}' | sed -n '1p;/^{/p'; docker unpause hsa-mysql
```
Expected: `503 {"success":false,"error":"Database unavailable — please try again"}` (or `500` JSON from the `Seen before?` error branch — either is a JSON non-2xx; an empty 200 body is a FAIL). Wait ~40 s if the request hangs; MySQL connect timeouts are slow.

- [ ] **Step 6: Contract entry and gate**

In `scripts/webhook-contract.mjs`, after the `categorize_heb_product` line:

```js
  { path: 'client_errors', method: 'POST', wave: 3, tier: 'probe' },
```

```bash
node scripts/webhook-contract.mjs --wave 3 2>&1 | tail -25
PW=$(grep '^DB_PASSWORD=' "/c/New Grocery App/heb-coupon-scraper/.env" | cut -d= -f2- | tr -d '\r'); docker exec -e MYSQL_PWD="$PW" hsa-mysql mysql -u hsa_user hsa -e "DELETE FROM shopping_sessions WHERE week_start_date='2026-01-04'; DELETE FROM oneoff_items WHERE name='__contract_test_oneoff__';"
```
Expected: `client_errors` shows `PASS no-key 403` and `PASS probe → error JSON 400`; no FAIL anywhere in the summary.

- [ ] **Step 7: Commit**

```bash
git add scripts/n8n-wave.mjs scripts/n8n-workflows/client-errors.json scripts/webhook-contract.mjs && git commit -m "chore(n8n): client_errors webhook workflow, wave create command, contract entry

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Error Workflow definition, probe definition, `apply-id` and `error-workflow` commands, retention edit

**Files:**
- Modify: `scripts/n8n-wave.mjs` (the `switch`)
- Create: `scripts/n8n-workflows/error-to-slack.json`, `scripts/n8n-workflows/zz-error-probe.json`, `scripts/n8n-edits/daily_maintenance_client_errors.mjs`

**Interfaces:**
- Produces: `n8n-wave.mjs apply-id <workflowId> <edit.mjs>` (PUT by id, no webhook requirement, no cycle, verifies `active` unchanged); `n8n-wave.mjs error-workflow <errorWorkflowId>` (sets `settings.errorWorkflow` on every active workflow except the error workflow itself, verifies, backs up); the two workflow definitions Task 7 creates.
- This task applies ONLY the retention edit live. The Error Workflow and probe are created in Task 7 by the operator (Slack + restart gating).

- [ ] **Step 1: Add `apply-id` and `error-workflow` to `scripts/n8n-wave.mjs`**

Add a helper next to `save()`:

```js
// PUT a workflow fetched by id (schedule/error workflows have no webhook node,
// so byPath/save do not apply). No cycle: n8n re-registers triggers on update.
async function saveById(wf) {
  const pristine = await api('GET', `/workflows/${wf.id}`);
  const backupDir = '.n8n-backups/pre-save';
  mkdirSync(backupDir, { recursive: true });
  const backupPath = `${backupDir}/${wf.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(backupPath, JSON.stringify(pristine, null, 1));
  console.log(`pre-save backup: ${backupPath}`);
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => SETTINGS_KEYS.includes(k)));
  await api('PUT', `/workflows/${wf.id}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
  const after = await api('GET', `/workflows/${wf.id}`);
  if (pristine.active && !after.active) {
    console.warn(`${wf.name} (${wf.id}) went inactive after PUT — reactivating`);
    await api('POST', `/workflows/${wf.id}/activate`);
  }
  return api('GET', `/workflows/${wf.id}`);
}
```

Cases before `default:`:

```js
    case 'apply-id': {
      const wf = await api('GET', `/workflows/${paths[0]}`);
      const mod = await import(pathToFileURL(paths[1]).href);
      const edited = await mod.default(wf, { ensureRespond500, errorBranch, RESPOND_500_BODY, ensureRespond503, dbGuard, dropAod, RESPOND_503_BODY });
      const saved = await saveById(edited || wf);
      console.log(`${saved.name} (${saved.id}) active=${saved.active} nodes=${saved.nodes.map((n) => n.name).join(' → ')}`);
      break;
    }
    case 'error-workflow': {
      const id = paths[0];
      if (!id) throw new Error('usage: error-workflow <errorWorkflowId>');
      const target = await api('GET', `/workflows/${id}`);
      if (!target.nodes.some((n) => n.type === 'n8n-nodes-base.errorTrigger')) throw new Error(`${target.name} (${id}) has no Error Trigger node`);
      const dir = `.n8n-backups/${new Date().toISOString().replace(/[:.]/g, '-')}`;
      mkdirSync(dir, { recursive: true });
      let changed = 0, skipped = 0, failed = 0;
      for (const w of await listActive()) {
        if (w.id === id) continue;
        const wf = await api('GET', `/workflows/${w.id}`);
        writeFileSync(`${dir}/${wf.id}.json`, JSON.stringify(wf, null, 1));
        if (wf.settings?.errorWorkflow === id) { skipped++; continue; }
        const settings = { ...Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => SETTINGS_KEYS.includes(k))), errorWorkflow: id };
        try {
          await api('PUT', `/workflows/${wf.id}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
          let after = await api('GET', `/workflows/${wf.id}`);
          if (!after.active) { console.warn(`${wf.name} (${wf.id}) went inactive after PUT — reactivating`); await api('POST', `/workflows/${wf.id}/activate`); after = await api('GET', `/workflows/${wf.id}`); }
          if (after.settings?.errorWorkflow !== id) throw new Error('errorWorkflow not persisted');
          if (!after.active) throw new Error('workflow is inactive');
          changed++; console.log(`set errorWorkflow on ${wf.name} (${wf.id})`);
        } catch (e) { failed++; console.error(`FAILED ${wf.name} (${wf.id}): ${e.message}`); }
      }
      console.log(`error-workflow ${id}: changed=${changed} skipped=${skipped} failed=${failed} (backups in ${dir})`);
      if (failed) process.exit(1);
      break;
    }
```

- [ ] **Step 2: Write the Error Workflow definition**

`scripts/n8n-workflows/error-to-slack.json`:

```json
{
  "name": "n8n Error → Slack",
  "settings": { "executionOrder": "v1", "saveDataErrorExecution": "all", "saveDataSuccessExecution": "all", "saveManualExecutions": true },
  "nodes": [
    { "id": "error-trigger", "name": "Error Trigger", "type": "n8n-nodes-base.errorTrigger", "typeVersion": 1, "position": [0, 0], "parameters": {} },
    {
      "id": "format", "name": "Format", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [220, 0],
      "parameters": { "jsCode": "const e = $input.first().json || {};\nconst ex = e.execution || {};\nconst wf = e.workflow || {};\nconst msg = String((ex.error && ex.error.message) || 'unknown error').slice(0, 300);\nconst link = ex.url || (ex.id && wf.id ? `http://localhost:5679/workflow/${wf.id}/executions/${ex.id}` : '(no execution id)');\nconst name = wf.name || wf.id || 'unknown workflow';\nreturn [{ json: { text: `[grocery-n8n] ${name} failed at ${ex.lastNodeExecuted || '?'}: ${msg} — ${link}` } }];" }
    },
    {
      "id": "slack", "name": "Slack", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [440, 0],
      "parameters": { "method": "POST", "url": "={{ $env.SLACK_WEBHOOK_URL }}", "sendBody": true, "specifyBody": "json", "jsonBody": "={{ JSON.stringify({ text: $json.text }) }}", "options": {} }
    }
  ],
  "connections": {
    "Error Trigger": { "main": [ [ { "node": "Format", "type": "main", "index": 0 } ] ] },
    "Format": { "main": [ [ { "node": "Slack", "type": "main", "index": 0 } ] ] }
  }
}
```

- [ ] **Step 3: Write the probe definition**

`scripts/n8n-workflows/zz-error-probe.json` (created, fired once, and deleted in Task 7; its Code node throws before any Respond, which is the "unhandled → 200 empty body" path that fires the Error Trigger):

```json
{
  "name": "ZZ Error Probe (delete after use)",
  "settings": { "executionOrder": "v1", "saveDataErrorExecution": "all", "saveDataSuccessExecution": "all" },
  "nodes": [
    {
      "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 0],
      "webhookId": "c3d4e5f6-7890-abcd-ef01-errprobe00001",
      "parameters": { "httpMethod": "POST", "path": "zz_error_probe", "responseMode": "responseNode", "authentication": "headerAuth", "options": {} },
      "credentials": { "httpHeaderAuth": { "id": "OzxeppJmnYuJpXbO", "name": "Grocery App API Key" } }
    },
    { "id": "boom", "name": "Boom", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [220, 0], "parameters": { "jsCode": "throw new Error('[TEST] error workflow probe — safe to ignore');" } },
    { "id": "respond", "name": "Respond", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.4, "position": [440, 0], "parameters": { "respondWith": "json", "responseBody": "={{ JSON.stringify({ success: true }) }}", "options": {} } }
  ],
  "connections": {
    "Webhook": { "main": [ [ { "node": "Boom", "type": "main", "index": 0 } ] ] },
    "Boom": { "main": [ [ { "node": "Respond", "type": "main", "index": 0 } ] ] }
  }
}
```

- [ ] **Step 4: Write and apply the retention edit**

`scripts/n8n-edits/daily_maintenance_client_errors.mjs`:

```js
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
```

```bash
node scripts/n8n-wave.mjs export
node scripts/n8n-wave.mjs apply-id NGvnsYXF8cpFTHA1 scripts/n8n-edits/daily_maintenance_client_errors.mjs
```
Expected: `Daily Maintenance: Expire Coupons + Sweep Stale Jobs (NGvnsYXF8cpFTHA1) active=true nodes=Every Day 5 AM → Expire Old Coupons → Fail Stale Prep Jobs → Purge Old Deals Cache → Purge Old Client Errors`. Do not run the workflow; the `DELETE` deletes nothing today and runs at 5 AM.

- [ ] **Step 5: Smoke the `error-workflow` command without changing anything**

```bash
node scripts/n8n-wave.mjs error-workflow NGvnsYXF8cpFTHA1 2>&1 | head -2
```
Expected: exits 1 with `… has no Error Trigger node` — the guard works and nothing was written.

- [ ] **Step 6: Commit**

```bash
git add scripts/n8n-wave.mjs scripts/n8n-workflows/error-to-slack.json scripts/n8n-workflows/zz-error-probe.json scripts/n8n-edits/daily_maintenance_client_errors.mjs && git commit -m "chore(n8n): error workflow + probe definitions, apply-id and error-workflow commands, 90-day client_errors retention

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7 (operator task — run by the orchestrator, user confirms the restart and the Slack posts): compose env, Error Workflow rollout, probe

**Files:**
- Modify: `C:\hsa-automation\docker-compose.yaml` (service `hsa-local`, container `hsa-processor`)

**Interfaces:**
- Consumes: Task 5's workflow, Task 6's definitions and commands.
- Produces: `SLACK_WEBHOOK_URL` inside n8n; workflow "n8n Error → Slack" (id recorded in the ledger and in `docs/superpowers/hardening-checklist.md`); `settings.errorWorkflow` on every active workflow; one `[TEST]` Slack line; the probe deleted.

- [ ] **Step 1: Confirm with the user** that n8n may be restarted now (about 30 s of webhook downtime) and that up to two `[TEST]` Slack messages may be posted to the real channel. Stop here until they say yes.

- [ ] **Step 2: Add the variable and restart**

```bash
cd /c/hsa-automation && cp docker-compose.yaml "docker-compose.yaml.bak-$(date +%Y%m%d-%H%M%S)" && sed -i 's/^      - PREP_API_KEY=\${PREP_API_KEY}$/      - PREP_API_KEY=${PREP_API_KEY}\n      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}/' docker-compose.yaml && grep -n "SLACK_WEBHOOK_URL" docker-compose.yaml
docker compose up -d hsa-local 2>&1 | tail -3
sleep 25; docker exec hsa-processor sh -c 'echo "${SLACK_WEBHOOK_URL:0:30}"'; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5679/healthz
```
Expected: one `SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}` line under `hsa-local`, the container recreated, the prefix `https://hooks.slack.com/service` printed, `200` from healthz. Then re-check the webhooks are back: `node scripts/webhook-contract.mjs --only categories` → PASS.

- [ ] **Step 3: Create the Error Workflow**

```bash
cd "/c/New Grocery App/grocery-checklist-app" && node scripts/n8n-wave.mjs create scripts/n8n-workflows/error-to-slack.json --inactive
```
Expected: `created n8n Error → Slack (<ID>) (inactive)`. Error workflows do not need to be active (the Error Trigger is invoked by n8n directly). Record `<ID>`. If you prefer it active, `POST /workflows/<ID>/activate` may fail with "no trigger node" — that is fine, leave it inactive.

- [ ] **Step 4: Roll `errorWorkflow` out**

```bash
node scripts/n8n-wave.mjs error-workflow <ID> 2>&1 | tail -5
source /c/hsa-automation/.env && curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows?active=true&limit=100" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).data;const set=a.filter(w=>w.settings&&w.settings.errorWorkflow==="<ID>");console.log("active",a.length,"with errorWorkflow",set.length);for(const w of a)if(!set.includes(w))console.log("MISSING",w.id,w.name)})'
```
Expected: `changed=42 skipped=0 failed=0` (41 original + Client Error Telemetry), then `active 42 with errorWorkflow 42` and no `MISSING` lines (the inactive Error Workflow is not in the active list).

- [ ] **Step 5: Fire the probe once, confirm Slack, delete it**

```bash
node scripts/n8n-wave.mjs create scripts/n8n-workflows/zz-error-probe.json
node scripts/n8n-wave.mjs error-workflow <ID> 2>&1 | tail -1
KEY=$(grep '^REACT_APP_API_KEY=' .env | cut -d= -f2- | tr -d '\r'); curl -s -i -X POST https://n8n-grocery.needexcelexpert.com/webhook/zz_error_probe -H "X-API-Key: $KEY" -H "Origin: https://grocery-checklist-app.netlify.app" -H "Content-Type: application/json" -d '{}' | sed -n '1p'
```
Expected: `changed=1 skipped=42`, then `HTTP/2 200` with an empty body (the unhandled-throw path). Within a few seconds Slack shows `[grocery-n8n] ZZ Error Probe (delete after use) failed at Boom: [TEST] error workflow probe — safe to ignore — http://localhost:5679/workflow/…/executions/…`. Ask the user to confirm they see it. Then:

```bash
source /c/hsa-automation/.env && PID=$(curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows?limit=100" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const w=JSON.parse(s).data.find(w=>w.name.startsWith("ZZ Error Probe"));console.log(w?w.id:"")})'); echo "probe id: $PID"; curl -s -X DELETE -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/$PID" | head -c 120; echo
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/executions?limit=3&status=error" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const e of JSON.parse(s).data)console.log(e.id,e.workflowId,e.status)})'
```
Expected: the probe deleted (`"active":false` in the returned object); the latest error execution is the probe's. If the Slack line did not arrive, open that execution's Error Workflow run in the n8n UI (Executions → filter by the Error Workflow) and read the `Slack` node's error before changing anything.

- [ ] **Step 6: Record**

Append to the ledger: the Error Workflow id, the compose backup filename, `changed=42`, the Slack confirmation time. No app commit in this task (the compose file lives outside the repo).

---

### Task 8: Live spec, README, checklist, memory notes

**Files:**
- Create: `e2e/live/telemetry.live.spec.js`
- Modify: `e2e/README.md` (Live specs list and residue section), `docs/superpowers/hardening-checklist.md` (E section, deferred list)

**Interfaces:**
- Consumes: `api.post` from `e2e/live/support.js`; the live `client_errors` webhook with Slack reachable (Task 7).

- [ ] **Step 1: Write the live spec**

`e2e/live/telemetry.live.spec.js`:

```js
const { test, expect } = require('./support.js');

// A PERMANENT sentinel row: fixed session_id + stack_hash, so every run after
// the first is an INSERT IGNORE no-op ({success:true,new:false}) and Slack sees
// exactly one "[TEST] live smoke sentinel" line ever. Do not delete the row —
// deleting it would re-notify Slack on the next run.
const SENTINEL = {
  session_id: '00000000-0000-4000-8000-0000000e2e01',
  stack_hash: 'e2e00001',
  kind: 'onerror',
  screen: 'plan',
  message: '[TEST] live smoke sentinel',
  stack: '',
  user_agent: 'playwright-live',
  app_version: 'live-spec',
  week_date_range: 'live',
  client_time: new Date().toISOString(),
};

test('client_errors stores the sentinel idempotently and rejects an empty report', async ({ api }) => {
  const ok = await api.post('client_errors', SENTINEL);
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ success: true });
  const again = await api.post('client_errors', SENTINEL);
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual({ success: true, new: false });
  const bad = await api.post('client_errors', {});
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toEqual({ success: false, error: 'invalid report' });
});
```

- [ ] **Step 2: Run the live suite in the foreground**

```bash
npm run test:e2e:live 2>&1 | tail -10
```
Expected: 4 passed. The FIRST run posts the second and last `[TEST]` Slack line: `[grocery-app] new client error on #plan (build live-spec): [TEST] live smoke sentinel · hash e2e00001`. Confirm it with the user. Then:

```bash
PW=$(grep '^DB_PASSWORD=' "/c/New Grocery App/heb-coupon-scraper/.env" | cut -d= -f2- | tr -d '\r'); docker exec -e MYSQL_PWD="$PW" hsa-mysql mysql -u hsa_user hsa -e "SELECT id, session_id, stack_hash, notified, created_at FROM client_errors; SELECT COUNT(*) AS residue FROM oneoff_items WHERE name='__e2e_live__';"
```
Expected: exactly one row (the sentinel, `notified=1`) and `residue = 0`.

- [ ] **Step 3: README**

In `e2e/README.md` add to the "Live specs" list:

```
- **Telemetry** — posts the permanent `[TEST] live smoke sentinel` row to
  `client_errors` (session `00000000-0000-4000-8000-0000000e2e01`, hash
  `e2e00001`); the second post proves `INSERT IGNORE` (`new:false`), an empty
  body proves the 400. Never delete that row: the next run would re-notify
  Slack. No browser is opened.
```

and under "Live-project residue":

```
The client_errors sentinel row is intentional residue — leave it.
```

- [ ] **Step 4: Checklist**

In `docs/superpowers/hardening-checklist.md` tick E: the three items `[x]`, header `## E. Client error telemetry — \`[x]\``, and add a "Shipped state (2026-09-06)" paragraph naming: `src/telemetry/errorReporter.js` (kinds, caps, hash rule), `apiJson`'s reported codes, workflow "Client Error Telemetry" (`client_errors`, Respond 400/500/503, Slack on first sight ≤ 10/h), table + 90-day sweep, Error Workflow "n8n Error → Slack" id `<ID>` set on 42 active workflows, `n8n-wave.mjs create/apply-id/error-workflow`, the live sentinel. Add to the deferred list: "Notify sub-workflow for the Respond 500/503 branches (scraper-originated failures are not reported by the client)", "Slack gate keyed by stack hash re-alerts once per build for a surviving bug; switch to (message, screen) if noisy", "Error Workflow cannot see workflows that end with an empty 200 after a Respond already fired". Also note under "Deferred from A/B" that `api`-kind rows now make the `smart_deals` 0-row stop, the SELECT double-response race and the Deals `deal.id` failure observable.

- [ ] **Step 5: Gates and commit**

```bash
npm run lint && CI=true npx react-scripts test --watchAll=false 2>&1 | grep -E "Tests:|Test Suites:"
git add e2e/live/telemetry.live.spec.js e2e/README.md docs/superpowers/hardening-checklist.md && git commit -m "test(telemetry): live sentinel spec; docs: checklist E shipped state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Whole-branch review, fix wave, merge, deploy, post-deploy checks

**Files:** whatever the review names.

- [ ] **Step 1: Review package**

```bash
git diff main...HEAD --stat && git diff main...HEAD > .superpowers/sdd/2026-09-06-client-error-telemetry/review-branch.diff
```
Dispatch the whole-branch adversarial review (most capable model) with the spec's Decisions table, the Global Constraints, and the diff. Focus prompts: can the reporter throw or recurse in any branch; can any path leak a query string, item name or body; is `raise()` reachable for `forbidden`/`timeout`/4xx; does `keepalive` + header work in Chromium/Safari; is `INSERT IGNORE` + `notified` correct under two concurrent first-sight reports; does `DB ok? (Respond)` route the Slack-failed item correctly; can `error-workflow` deactivate anything; is anything visible in the UI.

- [ ] **Step 2: One fix wave, one scoped re-review**, each fix committed by explicit path with the standard trailer; re-run `npm run lint`, Jest, `npm run test:e2e` (foreground) after the wave.

- [ ] **Step 3: Push, CI, merge**

```bash
git push -u origin feat/client-error-telemetry && gh run list --branch feat/client-error-telemetry --limit 1
gh run watch <run-id> --exit-status
git checkout main && git merge --ff-only feat/client-error-telemetry && git push origin main
```
Expected: CI green; `main` fast-forwarded; Netlify builds `main`.

- [ ] **Step 4: Post-deploy**

```bash
curl -s https://grocery-checklist-app.netlify.app/ | grep -o 'main\.[0-9a-f]*\.js' | head -1
node scripts/webhook-contract.mjs --wave 3 2>&1 | tail -6
PW=$(grep '^DB_PASSWORD=' "/c/New Grocery App/heb-coupon-scraper/.env" | cut -d= -f2- | tr -d '\r'); docker exec -e MYSQL_PWD="$PW" hsa-mysql mysql -u hsa_user hsa -e "DELETE FROM shopping_sessions WHERE week_start_date='2026-01-04'; DELETE FROM oneoff_items WHERE name='__contract_test_oneoff__'; SELECT id, kind, screen, endpoint, status, app_version, notified, LEFT(message,60) AS message, created_at FROM client_errors ORDER BY id DESC LIMIT 10;"
```
Expected: a new bundle hash (not `d016df08`); contract green; `client_errors` still holds only the sentinel. Then load `https://grocery-checklist-app.netlify.app/#plan` once in headless Chromium (Playwright MCP, or the scraper's Playwright fallback), wait 5 s, and re-run the SELECT: still only the sentinel. If a real row appeared, that is a live finding: report it with its message and screen, do not delete it.

- [ ] **Step 5: Memory and ledger**

Update `hardening_program.md` in memory (E shipped, rules: reporter contract, the two Slack test lines already spent, `create`/`apply-id`/`error-workflow` commands, sentinel row, Error Workflow id, `SLACK_WEBHOOK_URL` now in compose). Close the ledger with the final commit hash and the live bundle name; mirror the line into `.superpowers/sdd/progress.md`.

---

## Self-review against the spec

- §1 reporter interface, listeners, callers, payload, filters, transport → Task 2 (module + 16 tests), Task 3 (wiring + api/boundary tests). `join` screen, `AbortError` skip, resource-load skip, offline skip, `ResizeObserver` drop, both caps, storage fallback, sync/async fetch failure: all have a named test.
- §2 table + retention → Task 1 (DDL, unique-key proof), Task 6 step 4 (retention node via `apply-id`).
- §3 webhook workflow nodes 1–9, Slack text, creation sequence, contract entry → Task 5 (definition, `create`, `error-branch`, `db-guard --respond Respond`, curl matrix incl. 400/403/dup/outage, contract gate + cleanup).
- §4 compose, Error Workflow, rollout command → Task 6 (definitions, `error-workflow`, guard smoke), Task 7 (operator: restart, create, roll out to 42, probe, delete).
- §5 wiring list → Task 3 (index.js, api.js, ErrorBoundary, mock-backend), Task 5 (contract), Task 8 (checklist).
- §6 tests → Task 2, 3, 4 (hermetic: onerror, dedupe, new hash, rejection, api 500, healthy = silent), Task 8 (live sentinel, idempotency, 400), Task 7 (probe).
- §7 verification order → Tasks 1, 3, 5, 7, 8, 9 in that order; Task 9 step 4 is the post-deploy check.
- Spec deviation to note: the Error Workflow is created inactive (n8n invokes Error Triggers without activation); the count is therefore 42 active workflows with the setting, not 43. The spec's §4 "the Error Workflow itself … included" is superseded by this plan.
- Type consistency: `reportError({ kind, error, message, endpoint, status })` everywhere; `installErrorReporter({ url, apiKey })`; `stackHash(kind, message, stack, endpoint, status)`; workflow node names `Validate`, `Valid?`, `Respond 400`, `Seen before?`, `Insert Error`, `Notify?`, `Slack`, `Respond`, and `DB ok? (Respond)` (the name `db-guard --respond "Respond"` generates) match between Task 5's JSON, its commands and its expected `show` output.
