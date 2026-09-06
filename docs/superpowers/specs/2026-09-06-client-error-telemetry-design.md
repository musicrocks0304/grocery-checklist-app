# Client error telemetry — design

Date: 2026-09-06. Sub-project E of the hardening program. Scope: a client-side error reporter, a keyed `client_errors` n8n webhook backed by a MySQL table, Slack notification on first sight, an n8n Error Workflow set on every active workflow, and the tests that keep all of it honest. Nothing changes in the UI.

## Goals

1. Every uncaught client error (`window` `error` event, `unhandledrejection`, React ErrorBoundary catch) and every server-fault `ApiError` reaches a `client_errors` row, deduplicated per tab session by stack hash, with enough context (screen, build, endpoint, week) to reproduce it.
2. Slack receives one line the first time a stack hash is ever seen, so a crash loop on one phone produces one message.
3. Every active n8n workflow names an Error Workflow that posts to Slack when an execution finishes in error.
4. The reporter can never throw, recurse, or leak item names, free text or request bodies.
5. The A contract holds: the webhook requires `X-API-Key`, answers JSON on every path, has `Respond 500` error branches and a `DB ok?` → `Respond 503` guard, and appears in `scripts/webhook-contract.mjs`.
6. Hermetic e2e (70) and Jest (234) stay green; new Jest, hermetic e2e and live specs cover the reporter and the webhook.

## Non-goals

- Any UI: no error list, no badge, no change to the ErrorBoundary screen.
- Source maps or symbolication. Stacks are minified; the bundle hash plus line:column is enough to reproduce with a local production build of the same commit.
- Telemetry from the scraper or clip server.
- A shared "notify" sub-workflow called from the `Respond 500`/`503` branches of the 39 webhooks. Those failures reach Slack through the client reporter's `api` kind instead (decision 2026-09-06). Recorded as deferred.
- Reporting `forbidden`, `timeout` or 4xx `ApiError`s. `forbidden` is a stale bundle, `timeout` is normal on the AI agents, 4xx is a client mistake the app already handles.
- Dashboards or a Notion mirror.

## Decisions (2026-09-06)

| # | Question | Decision |
|---|----------|----------|
| 1 | Storage | `client_errors` table plus a Slack line on first sight of a stack hash |
| 2 | Handled `ApiError`s | Report codes `network`, `empty`, `invalid_json`, and `http` with status ≥ 500; skip `forbidden`, `timeout`, 4xx; skip `network` while `navigator.onLine === false` |
| 3 | Dedupe | Client `sessionStorage` set keyed by stack hash, 20 reports per tab session, 5 per rolling minute; server `INSERT IGNORE` on `UNIQUE (session_id, stack_hash)` |
| 4 | App version | The hash of the loaded `main.<hash>.js` script, read at report time; `dev` when absent |
| 5 | `Respond 500` branches | Covered by the client reporter (`api` kind); the Error Workflow handles only executions that finish in error |
| 6 | Slack URL | `SLACK_WEBHOOK_URL` added to the `hsa-processor` compose environment, read as `$env.SLACK_WEBHOOK_URL`; n8n restarted once (ask first) |
| 7 | Slack tests | Real channel, messages prefixed `[TEST]`, at most two during verification |
| 8 | Privacy | Message ≤ 500 chars, stack ≤ 2,048 chars, URL query strings stripped, no bodies, no item names, endpoint path only |
| 9 | Live check | A permanent sentinel row (fixed `session_id` and `stack_hash`) instead of post-and-delete, so re-runs are `INSERT IGNORE` no-ops and Slack fires only once ever |

## Current state (2026-09-06)

- `src/components/ErrorBoundary.js` is mounted inside `React.StrictMode` in `src/index.js` and only `console.error`s in `componentDidCatch`. No `window.onerror`, `error` or `unhandledrejection` listener exists under `src/`.
- `apiJson` in `src/config/api.js` throws `ApiError` with codes `http`, `forbidden`, `empty`, `invalid_json`, `network`, `timeout`; 17 modules call it. `apiFetch` adds `X-API-Key` from `REACT_APP_API_KEY`.
- `src/utils/screenRoute.js` (`resolveScreenFromHash`), `src/utils/uuid.js` (`randomUUID`), `src/utils/weekDates.js` (`getWeekDates().displayRange`) are pure helpers already used by `FeedbackContext`.
- `app_feedback.client_id` (`docs/migrations/2026-09-05-app-feedback-client-id.sql`) with `INSERT IGNORE` is the idempotency precedent. DDL is applied with `docker exec … hsa-mysql mysql` (the MySQL MCP is read-only).
- n8n 1.121.3: 81 workflows, 41 active, none with `settings.errorWorkflow`, none with a Slack node, an Error Trigger, or `hooks.slack.com` anywhere. The public API cannot list or create credentials. `N8N_BLOCK_ENV_ACCESS_IN_NODE` is unset, so `$env.X` works in expressions. The container reaches `hooks.slack.com`. `SLACK_WEBHOOK_URL` and `SLACK_CHANNEL` exist in `C:\hsa-automation\.env` but `hsa-processor` (`docker-compose.yaml`, no `env_file`) does not receive them.
- `scripts/n8n-wave.mjs` has `export`, `show`, `auth`, `error-branch`, `unswallow`, `apply`, `db-guard`, `drop-aod`, `cycle`; no `create` and no settings-only command. `save()` filters settings to `SETTINGS_KEYS` (which already includes `errorWorkflow`) and cycles the workflow. `byPath` only finds webhook workflows.
- `scripts/webhook-contract.mjs`: a `probe` tier posts `{}` with the key and expects a ≥ 400 JSON body that leaks nothing; `wave: 3` is the enforced wave.
- `e2e/support/mock-backend.js` answers n8n paths from `e2e/fixtures/n8n/*.json` or `mutationBody()`; any unmocked path 404s and fails the test at teardown. `e2e/live/support.js` exposes `api.post(path, body)` with the real key.
- `src/test-utils/mockFetch.js` (`installMockFetch`) mocks `global.fetch` and records calls; several suites assert `unmocked()` is empty.
- Verified n8n facts from A: any unhandled node error answers HTTP 200 with an empty body; a connection-level MySQL error passes the failing node's input item down output 0; INSERT/UPDATE/DELETE nodes emit `{success:true}`; the public API PUT accepts the full stored `settings`.
- Netlify builds with `npm run build`; the CSP `connect-src` already allows `https://n8n-grocery.needexcelexpert.com`. React 19.1.

## Design

### 1. Client reporter — `src/telemetry/errorReporter.js`

**Interface.**

```js
installErrorReporter({ url, apiKey })   // once, from src/index.js, before root.render
uninstallErrorReporter()                // tests only
reportError({ kind, error, message, endpoint, status })
  // kind: 'onerror' | 'unhandledrejection' | 'boundary' | 'api'
  // returns true when a POST was issued, false when skipped (not installed, deduped, capped, filtered)
```

`reportError` is a no-op until `installErrorReporter` has run. Jest suites that never install it therefore issue no fetches, and existing `unmocked()` assertions stay valid. The module never imports `src/config/api.js` (that would be a cycle, since `apiJson` calls `reportError`); `index.js` passes `ENDPOINTS.clientErrors` and `process.env.REACT_APP_API_KEY` in.

**Listeners.** `install` adds non-capturing `error` and `unhandledrejection` listeners on `window`. An `error` event without a message and without an `error` object (resource-load failures, cross-origin `Script error.`) is skipped. `unhandledrejection` uses `event.reason` (an `Error`, or anything else coerced with `String()`); `AbortError` reasons are skipped. Listeners are registered once; a second `install` call is ignored.

**Callers.**

- `ErrorBoundary.componentDidCatch(error, info)` calls `reportError({ kind: 'boundary', error })` and keeps its `console.error` and its UI. In React 19 a boundary-caught error is not re-thrown to `window`, so one boundary catch is one report.
- `apiJson` calls `reportError({ kind: 'api', error: apiErr, endpoint, status })` immediately before throwing an `ApiError` whose code is `network`, `empty`, `invalid_json`, or `http` with `status >= 500`. `endpoint` is the last path segment of the request URL with any query string removed (for example `fetch_grocery_items`). No other code is reported. The reporter's own POST uses raw `fetch`, so it can never re-enter `apiJson`.

**Payload** (JSON body of the POST):

| Field | Source | Limit |
|-------|--------|-------|
| `kind` | caller | enum above |
| `screen` | `resolveScreenFromHash(window.location.hash)`; `join` when the hash is an invite link | ≤ 50 |
| `message` | `error.message` or the string; every `?query` on a URL-shaped token removed | 500 chars |
| `stack` | `error.stack` with the same query stripping | 2,048 chars |
| `stack_hash` | FNV-1a 32-bit, lower-case hex, over `kind + '\n' + message + '\n' + top 5 stack frames` after replacing `main.<hash>.js` with `main.js` in each frame | 8 chars |
| `session_id` | v4 UUID from `randomUUID()`, stored in `sessionStorage['ce_session']` (one per tab); in-memory when storage throws | 36 |
| `app_version` | the `<hash>` from the first `<script src>` matching `/main\.([0-9a-f]+)\.js/`; `dev` otherwise | ≤ 40 |
| `user_agent` | `navigator.userAgent` | 255 |
| `week_date_range` | `getWeekDates().displayRange` | 80 |
| `client_time` | `new Date().toISOString()` | — |
| `endpoint`, `status` | `api` kind only | 80 / integer |

Frame line:column numbers stay in the hash, so the same bug on a new build gets a new hash and one fresh Slack line. That is intended: it says the bug survived a deploy.

**Filters, dedupe, caps** (evaluated in this order; any rejection returns `false`):

1. Not installed.
2. `kind === 'api'` and `navigator.onLine === false` and the code is `network`.
3. Message matches `/ResizeObserver loop/`.
4. `stack_hash` already in the seen set (`sessionStorage['ce_seen']`, a JSON array; in-memory fallback).
5. Session count (`sessionStorage['ce_count']`) ≥ 20.
6. More than 5 sends in the last 60 s (in-memory timestamp array).

On acceptance the hash is added to the set and the counters updated before the fetch is issued.

**Transport.** `fetch(url, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body })` with the returned promise's rejection swallowed. No `apiFetch`, no retries, no timeout, no `sendBeacon` (it cannot carry the key header). The body is ~3 KB, well under the 64 KB `keepalive` limit. Every branch of the module is inside try/catch; a failure inside the reporter is dropped silently.

### 2. Storage — `client_errors`

`docs/migrations/2026-09-06-client-errors.sql`, applied once with `docker exec -e MYSQL_PWD=… hsa-mysql mysql -u hsa_user hsa`:

```sql
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

Retention: the existing `Daily Maintenance: Expire Coupons + Sweep Stale Jobs` workflow (`NGvnsYXF8cpFTHA1`) gains one MySQL node, `DELETE FROM client_errors WHERE created_at < NOW() - INTERVAL 90 DAY`, wired after its last existing node. It is a schedule workflow, so it is edited via REST PUT (settings filtered) rather than `n8n-wave.mjs apply`.

### 3. Webhook workflow — "Client Error Telemetry", path `client_errors`

Nodes, in order; the first four follow the `Submit App Feedback` workflow exactly.

1. **Webhook** — POST `client_errors`, `responseMode: responseNode`, `authentication: headerAuth` with credential `OzxeppJmnYuJpXbO`, fixed `webhookId` `c3d4e5f6-7890-abcd-ef01-clienterr0001`.
2. **Validate** (Code) — reads `$json.body`, returns one item `{ valid, session_id, stack_hash, kind, screen, endpoint, status, message, stack, user_agent, app_version, week_date_range, client_time }` with every string truncated to its column width, `kind` forced into the enum, `status` an integer or null, `client_time` parsed or null, `valid = false` when `stack_hash` fails `/^[0-9a-f]{8}$/`, `session_id` fails the v4 shape, or `message` is empty.
3. **Valid?** (IF) — false → **Respond 400** `{"success":false,"error":"invalid report"}` with the CORS header. This is the answer the contract test's `{}` probe expects.
4. **Seen before?** (MySQL) — `SELECT (SELECT COUNT(*) FROM client_errors WHERE stack_hash = ?) AS seen, (SELECT COUNT(*) FROM client_errors WHERE notified = 1 AND created_at > NOW() - INTERVAL 1 HOUR) AS recent`. Values interpolated with the same quoting helpers as `Insert Feedback` (`JSON.stringify` for strings, `NULL` for nulls). Always returns exactly one row, so no zero-row handling is needed.
5. **Insert Error** (MySQL) — `INSERT IGNORE INTO client_errors (…) VALUES (…)` with `notified = (seen = 0 AND recent < 10) ? 1 : 0`. Emits `{success:true}` (mutation shape).
6. **DB ok?** (IF, inserted by `n8n-wave.mjs db-guard` in `mutation` mode) — false → **Respond 503**.
7. **Notify?** (IF) — `$('Seen before?').first().json.seen == 0 && recent < 10` → **Slack** (HTTP Request, POST `{{ $env.SLACK_WEBHOOK_URL }}`, JSON `{ text }`, `onError: continueRegularOutput` so a Slack failure never fails a stored report) → **Respond**. False → **Respond** directly.
8. **Respond** — `{"success":true,"new":<seen == 0>}` with the CORS header.
9. **Respond 500** — inserted by `n8n-wave.mjs error-branch` for `Validate`, `Seen before?`, `Insert Error`.

Slack text: `[grocery-app] new client error on #<screen> (build <app_version><, api <endpoint> <status> when kind=api>): <message, first 200 chars> · hash <stack_hash>`. No stack, no user agent.

Creation: `n8n_create_workflow` (or `POST /api/v1/workflows`) with the nodes above, then `node scripts/n8n-wave.mjs export`, `auth client_errors` (idempotent check), `error-branch client_errors Validate "Seen before?" "Insert Error"`, `db-guard client_errors`, `cycle client_errors`. Contract entry: `{ path: 'client_errors', method: 'POST', wave: 3, tier: 'probe' }`.

### 4. n8n Error Workflow — "n8n Error → Slack"

- **Compose**: add `- SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}` to `hsa-processor.environment` in `C:\hsa-automation\docker-compose.yaml`; `docker compose up -d hsa-processor` recreates the container in about 30 s with its data volume intact. The restart is confirmed with the user first. Verification: `docker exec hsa-processor sh -c 'echo ${SLACK_WEBHOOK_URL:0:30}'` shows the prefix.
- **Workflow**: Error Trigger → **Format** (Code: `workflow.name`, `execution.id`, `http://localhost:5679/workflow/<workflow.id>/executions/<execution.id>`, `execution.lastNodeExecuted`, `execution.error.message` trimmed to 300 chars, ISO time) → **Slack** (HTTP Request, POST `{{ $env.SLACK_WEBHOOK_URL }}`, `{ text: "[grocery-n8n] <name> failed at <node>: <message> — <link>" }`). No Respond node; no throttle (nothing runs more often than daily, and webhook workflows finish in error only on the unhandled paths listed in the Execution notes of the A spec).
- **Rollout**: new `error-workflow <id>` command in `scripts/n8n-wave.mjs`: `export` first, then for each active workflow whose `settings.errorWorkflow !== id`, PUT `{ name, nodes, connections, settings: filtered + errorWorkflow }`, re-GET and assert `active === true` (cycle only if it dropped), print a one-line summary per workflow. The Error Workflow itself and the new `client_errors` workflow are included. The command is idempotent.

### 5. Wiring in the app

- `src/index.js`: `installErrorReporter({ url: ENDPOINTS.clientErrors, apiKey: process.env.REACT_APP_API_KEY })` before `root.render`.
- `src/config/api.js`: `clientErrors: \`${API_BASE_URL}/client_errors\`` in `ENDPOINTS`; the `reportError` call inside `apiJson` at every `ApiError` throw site whose code is listed in §1 (both `network` sites, `empty`, `invalid_json`, and `http` when `status >= 500`).
- `src/components/ErrorBoundary.js`: the `componentDidCatch` call.
- `e2e/support/mock-backend.js`: `case 'client_errors': return { success: true, new: true };` in `mutationBody`.
- `scripts/webhook-contract.mjs`: the contract entry.
- `docs/superpowers/hardening-checklist.md`: E ticked with a "shipped state" paragraph; deferred list gains the notify sub-workflow.

### 6. Tests

**Jest** (`src/telemetry/errorReporter.test.js`; `installMockFetch` for `global.fetch`; fake timers for the caps):

- install + dispatched `ErrorEvent` → exactly one POST to the configured URL with `X-API-Key`, `keepalive: true`, and a body whose fields match the table in §1 (`kind`, `screen` from a set hash, v4 `session_id`, 8-hex `stack_hash`, `app_version` `dev` under jsdom).
- same error twice → one POST; two different messages → two; a rejection event → `kind: 'unhandledrejection'`; `reportError` before install → `false` and no fetch.
- 21st distinct error in a session → skipped; 6th within a minute → skipped, accepted again after 60 s.
- `sessionStorage` getter throwing → still reports (memory fallback); `fetch` throwing synchronously or rejecting → `reportError` still returns `true` and nothing propagates; `ResizeObserver loop` skipped; `?token=abc` removed from message and stack; message and stack truncated.
- `api` kind: `navigator.onLine === false` with a network error → skipped.

**Jest, existing suites**: `src/config/api.test.js` gains cases with `jest.mock('../telemetry/errorReporter')` proving `reportError` is called for `network`, `empty`, `invalid_json`, `http` 500 and 503 (with `endpoint` and `status`), and not for 403, 404, or a timeout. `ErrorBoundary.test.js` (new) proves a throwing child yields one `boundary` report and the fallback UI.

**Hermetic e2e** (`e2e/telemetry.spec.js`, both viewports):

- open `#plan`, `page.evaluate` a deferred `throw new Error('e2e telemetry probe')` → `expect.poll(() => backend.calls('client_errors').length).toBe(1)`; body has `kind: 'onerror'`, `screen: 'plan'`, v4 `session_id`, `stack_hash` `/^[0-9a-f]{8}$/`, `app_version` `/^[0-9a-f]{8}$/` (the served production bundle), `message` containing the probe text, no `?` in `stack`.
- the same throw again → still 1; a different message → 2; `Promise.reject(new Error(…))` → a `kind: 'unhandledrejection'` call.
- `backend.set('fetch_grocery_items', { status: 500, body: { success: false, error: 'Workflow error' } })` then open `#plan` → one `kind: 'api'` call with `endpoint: 'fetch_grocery_items'`, `status: 500`.
- The `backend` fixture's teardown already proves the key header was sent and no other host was touched. Existing specs that inject 500s (feedback retry) will now also post to `client_errors`; the mock absorbs it and their own assertions are unchanged.

**Live** (`e2e/live/telemetry.live.spec.js`, project `live`): `api.post('client_errors', sentinel)` where the sentinel is `{ session_id: '00000000-0000-4000-8000-0000000e2e01', stack_hash: 'e2e00001', kind: 'onerror', screen: 'plan', message: '[TEST] live smoke sentinel', app_version: 'live-spec', … }` → `200 {success:true}`. Also `api.post('client_errors', {})` → `400 {success:false}`. The sentinel row is permanent: later runs are `INSERT IGNORE` no-ops and never notify. No residue check is needed; the row is documented in memory.

**Error Workflow probe** (manual, once): create `ZZ Error Probe` (Webhook POST `zz_error_probe`, header auth, → Code `throw new Error('[TEST] error workflow probe')`), set its `errorWorkflow`, activate, one keyed curl (expect HTTP 200 empty body), confirm the `[grocery-n8n] ZZ Error Probe failed …` line in Slack, then delete the workflow and its executions. Never make a real workflow fail on purpose.

### 7. Verification and rollout order

1. DDL applied; `SHOW CREATE TABLE client_errors` matches the migration file.
2. Reporter + wiring + Jest green (`CI=true npx react-scripts test --watchAll=false`, zero `act()` warnings), `npm run lint` clean.
3. Workflow created, waved (`auth`, `error-branch`, `db-guard`, `cycle`), `node scripts/webhook-contract.mjs --wave 3` green including the new probe, then the usual cleanup (`shopping_sessions` week `2026-01-04`, `oneoff_items` `__contract_test_oneoff__`).
4. Compose change + restart (confirmed), Error Workflow created and activated, `error-workflow <id>` applied to all active workflows (`n8n_list_workflows` shows 43 with the setting: 41 + telemetry + error workflow), probe workflow fired once and deleted.
5. `npm run test:e2e` (70 + new), `npm run test:e2e:live` (3 + new) with the first live sentinel post producing exactly one `[TEST]`-marked Slack line.
6. Fast-forward `main`, Netlify bundle name changes, one real page load of the live app (`#plan`, not `#home`) shows no `client_errors` traffic, and `node scripts/webhook-contract.mjs --wave 3` is re-run once more after the deploy.
7. Checklist E ticked, memory updated, ledger closed.

## Risks

- **`keepalive` + custom headers on old browsers**: Firefox before 133 ignores `keepalive`; the request still sends unless the page unloads first. Acceptable; Christian's phone is Chrome/Safari.
- **Hash churn across builds** is deliberate (see §1). If it proves noisy, the Slack gate can move to `(message, screen)` without a schema change.
- **Error Trigger blind spot**: workflows that "handle" failures via `Respond 500` never fire it, by design after A. The `api` kind rows are the signal for those; the deferred notify sub-workflow would add scraper-originated calls.
- **A bad `errorWorkflow` PUT** could deactivate a workflow. The command re-GETs and asserts `active`, and `export` backups precede the wave.
- **Double Respond** on the Slack branch is avoided by routing both IF outputs into the single `Respond` node; the HTTP node's `continueRegularOutput` keeps the success path alive when Slack fails.
- **Test noise**: a real error in the live app during verification would create rows and one Slack line; that is the feature working, and it is reported as a finding.
