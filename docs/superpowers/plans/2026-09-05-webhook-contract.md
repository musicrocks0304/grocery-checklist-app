# Webhook exposure + response contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every active n8n webhook requires the `X-API-Key` header, every response the app consumes is JSON (failures are 5xx JSON, empty/unparsable 2xx is an error client-side), failed mutations are never retried into duplicates, and a checked-in contract test proves it wave by wave.

**Architecture:** The client gets an `ApiError` class and an `apiJson()` wrapper over the existing `apiFetch()`; all `apiFetch → response.ok → response.json()` call sites move to `apiJson`, POSTs default to zero retries, and feedback submissions carry a `client_id` UUID. Two ops scripts are added: `scripts/webhook-contract.mjs` (tiered contract test against live n8n) and `scripts/n8n-wave.mjs` (backup, auth flip, error-branch injection, deactivate/activate). The n8n side rolls out in three waves (reads → mutations → AI/orchestration), each gated on the contract test.

**Tech Stack:** React 19 SPA (react-scripts 5, Jest 27 + Testing Library), Node 22 (global `fetch`, no new dependencies), n8n 1.121.3 public REST API (`http://localhost:5679/api/v1`), MySQL 8 in Docker (`hsa-mysql`), Netlify auto-deploy from `main`.

**Spec:** `docs/superpowers/specs/2026-09-05-webhook-contract-design.md` (approved 2026-09-05). The spec's "Current state" section lists the verified facts this plan relies on; read it first.

Branch: `feat/webhook-contract` off `main` (at `44a8d11` or later). Deploy by fast-forwarding `main` (Task 10). Ledger: append one line per task to `.superpowers/sdd/progress.md`.

## Global Constraints

- **Never call these n8n endpoints with a valid body from any test or script:** `submit_feedback`, `grocery_prep`, `transcribe_grocery_item`, `smart_deals`, `smart_match_grocery` (except an empty `items: []` body, which short-circuits before the AI), `match_coupons` (same: `items: []` only), `categorize_heb_product`, `call_grocery_agent`, `create_grocery_list`, `deactivate_grocery_item`, `meal_creator_propose`, `meal_creator_build`, `meal_creator_save`, `get_recipe_items`, `add_grocery_items`, `meal_ingredients`, `update_feedback_status`. The contract test's tiers (Task 7) define exactly what may be sent.
- **Test data:** fixed past week only: `week_start_date` `2026-01-04`, `weekEndDate` `2026-01-10`, display string `For the week of January 4th to January 10th, 2026`. Item names `__contract_test__` and `__contract_test_oneoff__`, `ItemID` `999999`, `recipeId` `1` (exists). Every row created by a test is removed by the matching remove endpoint or by the documented `docker exec` cleanup in the same task. Leave nothing behind.
- **MySQL MCP is read-only.** Writes/DDL: `PW=$(grep '^DB_PASSWORD=' "/c/New Grocery App/heb-coupon-scraper/.env" | cut -d= -f2- | tr -d '\r'); docker exec -e MYSQL_PWD="$PW" hsa-mysql mysql -u hsa_user hsa -e "<SQL>"` (Bash tool). Never paste the password into a file or a commit.
- **n8n edits** go through `scripts/n8n-wave.mjs` (Task 8), which does GET → mutate → PUT with `settings` filtered to `executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow, timezone` → deactivate → activate. Never drop a Webhook node's `webhookId`. `n8n_update_partial_workflow` (MCP) does not work on this n8n version. Export a backup before every wave.
- **API key:** `REACT_APP_API_KEY` in the app `.env` (gitignored; also in the Netlify build env). Curls to n8n need `-H "X-API-Key: $KEY"` and `-H "Origin: https://grocery-checklist-app.netlify.app"` (without `Origin`, a de-registered webhook 404s; with it, 500 text/html). Read the key with `KEY=$(grep '^REACT_APP_API_KEY=' .env | cut -d= -f2- | tr -d '\r')`.
- **App conventions:** hash routing via `navigateToScreen`/`onNavigate`; Tailwind JIT (no dynamic class names); Netlify treats ESLint warnings as build errors: `npx eslint src --max-warnings=0` has exactly 4 pre-existing problems in test files (`App.test.js`, `staples/ItemRow.test.js` ×2, `useWeekStaples.test.js`) — add none. Tests: `CI=true npx react-scripts test --watchAll=false` (26 suites / 189 tests at start). Production check: `CI=true npx react-scripts build`. No new dependencies in either repo.
- **Success payload shapes are unchanged.** `apiJson` returns the parsed body exactly as before; no envelopes. A 2xx body with `success:false` is returned, not thrown (`transcribe_grocery_item` uses it).
- **Commits:** one per task (Task 6 makes two, one per repo). Message format `feat(api): …` / `refactor(<area>): …` / `chore(scripts): …` / `docs: …`, ending with a blank line then `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage files by explicit path; never `git add -A`/`git add .` — the repo root contains untracked `*.png`, `*.json`, `*.yml` scratch files that must not be committed. Do not push unless the task says so.
- **Playwright MCP gotchas** (verification tasks): `window.confirm` auto-accepts; `page.on('dialog')` inside `browser_run_code` does not fire; `setTimeout` is undefined there (use `page.waitForTimeout`); scope text locators to `main` on mobile (hidden desktop sidebar duplicates labels); navigate via `about:blank` then `#route` to force a real load.

---

## File map

**App repo (`grocery-checklist-app`)**

| Path | Change | Responsibility |
|---|---|---|
| `src/config/api.js` | modify | `ApiError`, `apiJson`, retry defaults, `showApiError` mapping |
| `src/config/api.test.js` | modify | unit tests for the above |
| `src/utils/uuid.js` (+ `.test.js`) | create | `randomUUID()` with fallback for jsdom |
| `src/hooks/useWeekStaples.js`, `useWeekMeals.js`, `useCategories.js` (+ tests) | modify | migrate to `apiJson` |
| `src/components/App.js`, `Home.js`, `Coupons.js`, `Deals.js`, `SmartDeals.js`, `RecipeInstructions.js`, `RecipeIngredients.js`, `staples/ReviewScreen.js` | modify | migrate to `apiJson`; explicit `retries: 0` on AI/side-effect POSTs |
| `src/components/InStoreMode.js` (+ `InStoreMode.useHoldToTalk.test.js`), `HebCart.js` | modify | migrate n8n calls; transcribe upload sends the key |
| `src/components/ChatBot.js`, `MealCreator.js` | modify | hand-reviewed: migrate `ok/json()` sites, keep text-path sites on `apiFetch` |
| `src/components/SessionManager.js` | delete | dead code |
| `src/contexts/FeedbackContext.js` (+ `src/components/FeedbackPanel.test.js`) | modify | `client_id` per report, `apiJson` with `retries: 0` |
| `scripts/webhook-contract.mjs` | create | tiered live contract test |
| `scripts/n8n-wave.mjs` | create | n8n backup/auth/error-branch/cycle tool |
| `scripts/n8n-edits/*.js` | create | bespoke per-workflow edit functions (wave tasks) |
| `docs/migrations/2026-09-05-app-feedback-client-id.sql` | create | DDL record |
| `.claude/commands/review-feedback.md` | modify | send the key |
| `.gitignore` | modify | ignore `.n8n-backups/` |
| `docs/superpowers/hardening-checklist.md` | modify | tick A items (Task 13) |

**Scraper repo (`heb-coupon-scraper`)**

| Path | Change | Responsibility |
|---|---|---|
| `src/store-locations/n8n-client.js` (+ `test/n8n-client.test.js`) | create | `postJson(path, body)` with the key |
| `src/store-locations/phase0.js`, `phase1.js`, `offline-match.js` | modify | use the helper |
| `.env.example` | modify | document `GROCERY_APP_API_KEY` |
| `.env` (gitignored, local only) | modify | add the key value |

---

## Task 1: `ApiError`, `apiJson`, retry defaults, `showApiError`

**Files:**
- Modify: `src/config/api.js` (after `apiFetch`, before `showApiError`; replace `showApiError`)
- Test: `src/config/api.test.js`

**Interfaces:**
- Consumes: existing `apiFetch(url, options)` (unchanged).
- Produces:
  - `class ApiError extends Error { code: 'http'|'forbidden'|'empty'|'invalid_json'|'network'|'timeout'; status: number; body: any; message: string }`
  - `apiJson(url, options) → Promise<any>`: same options as `apiFetch`; `retries` defaults to `0` for `POST`/`PUT`/`DELETE` and `2` otherwise; returns the parsed JSON body; throws `ApiError`. A caller-aborted request rethrows the original `AbortError` (not an `ApiError`).
  - `showApiError(error, onRetry?)`: shows `error.message` when `error instanceof ApiError`; legacy wording for other errors.

- [ ] **Step 1: Create the branch**

```bash
cd "/c/New Grocery App/grocery-checklist-app" && git checkout -b feat/webhook-contract
```

- [ ] **Step 2: Write the failing tests**

Append to `src/config/api.test.js` (keep the existing tests; add `ApiError, apiJson, showApiError` to the import line). Add near the top, after the existing `afterEach`:

```js
const instant = () => { global.setTimeout = (fn, _delay) => originalSetTimeout(fn, 0); };
const res = (status, text, extra = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: extra.statusText || '',
  text: () => Promise.resolve(text),
  json: () => Promise.resolve(JSON.parse(text)),
});
```

Then:

```js
describe('apiJson', () => {
  test('returns the parsed body on 2xx JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(200, '[{"id":1}]'));
    await expect(apiJson('https://example.com/x')).resolves.toEqual([{ id: 1 }]);
  });

  test('POST defaults to retries: 0 — a 500 is thrown after one attempt', async () => {
    instant();
    global.fetch = jest.fn().mockResolvedValue(res(500, '{"message":"Error in workflow"}'));
    const err = await apiJson('https://example.com/x', { method: 'POST', body: '{}' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('http');
    expect(err.status).toBe(500);
    expect(err.message).toBe('Error in workflow');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('GET defaults to retries: 2 — recovers from two 500s', async () => {
    instant();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(res(500, ''))
      .mockResolvedValueOnce(res(500, ''))
      .mockResolvedValueOnce(res(200, '{"ok":true}'));
    await expect(apiJson('https://example.com/x')).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('explicit retries on a POST is honoured', async () => {
    instant();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(res(500, ''))
      .mockResolvedValueOnce(res(200, '{"ok":true}'));
    await expect(apiJson('https://example.com/x', { method: 'POST', retries: 1 })).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('403 with a plain-text body → code forbidden', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(403, 'Authorization data is wrong!'));
    const err = await apiJson('https://example.com/x').catch((e) => e);
    expect(err.code).toBe('forbidden');
    expect(err.status).toBe(403);
    expect(err.message).toBe("This app version can't reach the server. Reload and try again.");
  });

  test('non-2xx with JSON error field uses it as the message', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(400, '{"success":false,"error":"weekDateRange and matches[] required"}'));
    const err = await apiJson('https://example.com/x').catch((e) => e);
    expect(err.code).toBe('http');
    expect(err.message).toBe('weekDateRange and matches[] required');
    expect(err.body).toEqual({ success: false, error: 'weekDateRange and matches[] required' });
  });

  test('non-2xx with an unparsable body falls back to the status', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(502, '<html>bad gateway</html>', { statusText: 'Bad Gateway' }));
    const err = await apiJson('https://example.com/x', { retries: 0 }).catch((e) => e);
    expect(err.code).toBe('http');
    expect(err.message).toBe('HTTP 502 Bad Gateway');
  });

  test('2xx with an empty body → code empty', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(200, ''));
    const err = await apiJson('https://example.com/x').catch((e) => e);
    expect(err.code).toBe('empty');
  });

  test('2xx with an unparsable body → code invalid_json', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(200, 'Workflow was started'));
    const err = await apiJson('https://example.com/x').catch((e) => e);
    expect(err.code).toBe('invalid_json');
    expect(err.body).toBe('Workflow was started');
  });

  test('2xx with success:false is returned, not thrown', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(200, '{"success":false,"error":"no_audio"}'));
    await expect(apiJson('https://example.com/x', { method: 'POST' })).resolves.toEqual({ success: false, error: 'no_audio' });
  });

  test('network failure after retries → code network', async () => {
    instant();
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await apiJson('https://example.com/x', { retries: 1 }).catch((e) => e);
    expect(err.code).toBe('network');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('timeout → code timeout', async () => {
    global.fetch = jest.fn().mockImplementation((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const err = await apiJson('https://example.com/x', { timeout: 20, retries: 0 }).catch((e) => e);
    expect(err.code).toBe('timeout');
  });

  test('caller abort rethrows the AbortError untouched', async () => {
    const controller = new AbortController();
    global.fetch = jest.fn().mockImplementation((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const p = apiJson('https://example.com/x', { signal: controller.signal, retries: 0 });
    controller.abort();
    const err = await p.catch((e) => e);
    expect(err.name).toBe('AbortError');
    expect(err).not.toBeInstanceOf(ApiError);
  });
});
```

`showApiError` renders a toast; keep it untested here (react-hot-toast needs a DOM host) — the FeedbackContext test in Task 5 covers the user-facing branch.

- [ ] **Step 3: Run the tests to see them fail**

Run: `CI=true npx react-scripts test --watchAll=false src/config/api.test.js`
Expected: FAIL — `apiJson is not a function` / `ApiError is not defined`.

- [ ] **Step 4: Implement**

In `src/config/api.js`, insert after the `apiFetch` function:

```js
/**
 * Error thrown by apiJson. `code` is one of:
 *   http         non-2xx response (message from the JSON error/message field when present)
 *   forbidden    403 — the key was rejected (stale bundle)
 *   empty        2xx with no body — n8n finished without a Respond node firing
 *   invalid_json 2xx with a body that is not JSON
 *   network      fetch threw (DNS, offline, CORS-blocked 500 text/html)
 *   timeout      the apiFetch timeout fired
 */
export class ApiError extends Error {
  constructor(code, message, { status = 0, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

const MUTATING_METHODS = ['POST', 'PUT', 'DELETE'];
const FORBIDDEN_MESSAGE = "This app version can't reach the server. Reload and try again.";

/**
 * apiFetch + JSON contract. Returns the parsed body on 2xx; throws ApiError
 * otherwise. Mutations (POST/PUT/DELETE) default to retries: 0 — retrying a
 * mutation duplicates data or multiplies AI cost; reads keep retries: 2.
 * A caller-aborted request rethrows the original AbortError.
 */
export async function apiJson(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const retries = options.retries ?? (MUTATING_METHODS.includes(method) ? 0 : 2);

  let response;
  try {
    response = await apiFetch(url, { ...options, retries });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      if (options.signal?.aborted) throw err;
      throw new ApiError('timeout', 'Request timed out');
    }
    throw new ApiError('network', 'Network error — check your connection');
  }

  const text = await response.text();
  const trimmed = text.trim();
  let body = null;
  let parsed = false;
  if (trimmed !== '') {
    try { body = JSON.parse(text); parsed = true; } catch { /* not JSON */ }
  }

  if (response.status === 403) {
    throw new ApiError('forbidden', FORBIDDEN_MESSAGE, { status: 403, body: parsed ? body : text });
  }
  if (!response.ok) {
    const field = parsed && body && typeof body === 'object' ? (body.error ?? body.message) : undefined;
    const message = typeof field === 'string' && field.trim()
      ? field
      : `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
    throw new ApiError('http', message, { status: response.status, body: parsed ? body : text });
  }
  if (trimmed === '') {
    throw new ApiError('empty', 'The server sent an empty response', { status: response.status });
  }
  if (!parsed) {
    throw new ApiError('invalid_json', 'The server sent an unreadable response', { status: response.status, body: text });
  }
  return body;
}
```

Replace the body of `showApiError` so the message resolution reads:

```js
export function showApiError(error, onRetry) {
  let message = 'Something went wrong';
  if (error instanceof ApiError) {
    message = error.message;
  } else if (error?.name === 'AbortError') {
    message = 'Request timed out';
  } else if (error?.message === 'Failed to fetch') {
    message = 'Network error — check your connection';
  }
  // …existing toast rendering below is unchanged…
```

Update the `apiFetch` doc comment's last line to: `AI-agent callers should use apiJson (retries default to 0 on POST) with an explicit long timeout.`

- [ ] **Step 5: Run the tests**

Run: `CI=true npx react-scripts test --watchAll=false src/config/api.test.js`
Expected: PASS (existing + 13 new).

- [ ] **Step 6: Lint and commit**

```bash
npx eslint src/config --max-warnings=0
git add src/config/api.js src/config/api.test.js
git commit -m "feat(api): ApiError + apiJson with JSON contract and mutation-safe retry defaults

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 2: Migrate hooks, App, Home (and delete SessionManager)

**Files:**
- Modify: `src/hooks/useWeekStaples.js`, `src/hooks/useWeekMeals.js`, `src/hooks/useCategories.js`, `src/components/App.js` (lines ~103–128 `loadMealsFromDb`, ~165–200 join effect), `src/components/Home.js` (five `apiFetch` sites at ~99, 118, 149, 173, 198, 227)
- Modify tests: `src/hooks/useWeekStaples.test.js`, `src/hooks/useWeekMeals.test.js`, `src/hooks/useCategories.test.js`, `src/components/Home.test.js` (if it mocks `apiFetch`)
- Delete: `src/components/SessionManager.js`

**Interfaces:**
- Consumes: `apiJson`, `ApiError`, `showApiError` from Task 1.
- Produces: nothing new; hook return shapes unchanged.

**Migration rule (applies to every site in Tasks 2–5):** replace

```js
const res = await apiFetch(url, opts);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

with `const data = await apiJson(url, opts);`. Where the old code checked `response.ok` without throwing (e.g. `if (response.ok) { … }`), wrap in `try { const data = await apiJson(...); … } catch { …same fallback as before… }`. Keep every header, `timeout`, `signal`, `mode` option as-is. Remove now-unused `apiFetch` imports (ESLint gate).

- [ ] **Step 1: Update the hook tests first**

The hook tests mock `apiFetch` from `../config/api`. `apiJson` calls the real `apiFetch` internally via module scope, so mocking `apiFetch` still works **only if** the mock responses provide `text()`. They already do (`mockOk` returns `text` and `json`). Change the failure mocks:

- `useWeekMeals.test.js` "sets error state on API failure": `Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error', text: () => Promise.resolve('') })`.
- `useWeekStaples.test.js`: any `ok: false` mock gets the same `text` field. Add one new test:

```js
test('toggle rolls back on an empty 200 (apiJson treats it as an error)', async () => {
  apiFetch.mockImplementationOnce(() => mockOk(mockItems));
  apiFetch.mockImplementationOnce(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.reject(new Error('empty')) }));
  const { result } = renderHook(() => useWeekStaples());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.toggle(2); });
  expect(result.current.selected.has(2)).toBe(false);
});
```

- `useCategories.test.js` mocks `global.fetch` (the hook's injection shim falls through to `apiFetch`, which calls `global.fetch`). Give every `mockResolvedValueOnce` a `text` field, e.g. `{ ok: true, status: 200, text: async () => JSON.stringify(mockCats), json: async () => mockCats }`.

Run: `CI=true npx react-scripts test --watchAll=false src/hooks`
Expected: the new rollback test FAILS (toggle currently treats a bare 200 as success); the rest pass.

- [ ] **Step 2: Migrate the hooks**

`useWeekStaples.js`: import `{ ENDPOINTS, apiJson, showApiError }`. Initial load: `const data = await apiJson(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } }); setItems(Array.isArray(data) ? data : []);` (keep the `cancelled` guards). `toggle`: `await apiJson(endpoint, { method: 'POST', headers: {...}, body: JSON.stringify(payload) });` (no `ok` check needed). `quickAdd`: `const data = await apiJson(ENDPOINTS.addOneOffItem, {...});` then the existing `newId` logic. `removeOneOff`: `await apiJson(ENDPOINTS.removeWeeklyItem, {...});`.

`useWeekMeals.js`: `const data = await apiJson(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } }); setMeals(Array.isArray(data) ? data : []);`.

`useCategories.js`: keep the shim and fallback; the shim now selects the JSON function:

```js
const fetchFn = typeof apiJson === 'function' ? apiJson : async (u, o) => { const r = await fetch(u, o); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
const data = await fetchFn(ENDPOINTS.categories, { method: 'GET', retries: 0 });
```

- [ ] **Step 3: Migrate App.js**

`loadMealsFromDb`: inside the existing `try`, `const data = await apiJson(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });` then the existing normalize/cache block (drop the `if (response.ok)` wrapper; the `catch` already keeps stale data). Join effect: `const data = await apiJson(url.toString(), { method: 'GET', headers: { Accept: 'application/json' }, timeout: 8000, retries: 1 });` (drop the `ok` throw). Import becomes `{ ENDPOINTS, apiJson, normalizeDbMeals }`.

- [ ] **Step 4: Migrate Home.js**

- List count (~99): `try { const data = await apiJson(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } }); const items = Array.isArray(data) ? data : []; …counts… } catch { setFetchError(true); setListItems(0); }`.
- Deals (~118): `const data = await apiJson(ENDPOINTS.smartDeals, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}), timeout: 15000, retries: 0 });` then the existing `result`/filter logic; the existing `catch` stays.
- Meals count (~149) and shopped count (~173): same pattern; shopped keeps `timeout: 8000, retries: 1`.
- `grocery_prep` (~198): **add the missing failure check** — `const data = await apiJson(ENDPOINTS.groceryPrep, { method: 'POST', retries: 0, timeout: 30000 }); if (!data?.jobId) throw new Error('Prep did not return a job id'); setPrepJob({ jobId: data.jobId, status: 'running', currentStep: 'docker-check' });`.
- Status poll (~227): `const data = await apiJson(url.toString());` (GET keeps 2 retries; the surrounding `catch` already swallows).

- [ ] **Step 5: Delete SessionManager.js**

```bash
git rm src/components/SessionManager.js
grep -rn "SessionManager" src || echo "no references"
```

Expected: no references.

- [ ] **Step 6: Run the suite, lint, build**

```bash
CI=true npx react-scripts test --watchAll=false
npx eslint src --max-warnings=0   # exactly the 4 pre-existing problems
```

Expected: all suites pass (the rollback test now passes); no new ESLint problems.

- [ ] **Step 7: Commit**

```bash
git add src/hooks src/components/App.js src/components/Home.js src/components/SessionManager.js
git commit -m "refactor(api): hooks, App and Home use apiJson; remove dead SessionManager

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 3: Migrate Deals, SmartDeals, Coupons, Recipe screens, ReviewScreen

**Files:**
- Modify: `src/components/Deals.js` (~354, 384, 580, 588), `src/components/SmartDeals.js` (~46; leave the raw `fetch` to the clip server at ~167 alone), `src/components/Coupons.js` (~103), `src/components/RecipeInstructions.js` (~139, 250), `src/components/RecipeIngredients.js` (~101), `src/components/staples/ReviewScreen.js` (~127, 144)
- Tests: `src/components/staples/ReviewScreen.test.js`, `src/components/Deals.helpers.test.js` (adjust mocks only if they mock `apiFetch` responses without `text()`)

**Interfaces:** consumes `apiJson`/`ApiError` (Task 1). Uses the migration rule from Task 2.

- [ ] **Step 1: Check which tests mock apiFetch**

```bash
grep -ln "apiFetch" src/components/staples/ReviewScreen.test.js src/components/Deals.helpers.test.js src/components/Plan.test.js src/components/StaplesScreen.test.js
```

For each hit, make every mocked response include `text: () => Promise.resolve(JSON.stringify(body))` (and `text: () => Promise.resolve('')` for failures). Run those tests; they must still pass before you change components.

- [ ] **Step 2: Deals.js**

- Smart deals (~354): `const data = await apiJson(ENDPOINTS.smartDeals, { method: 'POST', headers: {...}, body: JSON.stringify({}), mode: 'cors', retries: 0 });` then `const result = Array.isArray(data) ? data[0] : data;` and the existing filter.
- Coupons (~384): `const data = await apiJson(ENDPOINTS.fetchHebCoupons, { method: 'GET', headers: { Accept: 'application/json' }, mode: 'cors' }); setCouponsData(Array.isArray(data) ? data : []);`.
- Add-to-list (~580–600): `const existingItems = await apiJson(fetchUrl.toString(), { method: 'GET', headers: { Accept: 'application/json' } });` … `const addBody = await apiJson(ENDPOINTS.addOneOffItem, { method: 'POST', headers: {...}, body: JSON.stringify({ itemName, weekDateRange: weekData.displayRange }) });` Keep the payload validation but reword the comment: `// apiJson already rejects an empty 200; still require the success payload shape.` and the message `'Unexpected response from add-item endpoint'`.

- [ ] **Step 3: SmartDeals.js, Coupons.js**

SmartDeals (~46): same as Deals smart deals, `retries: 0`. Coupons (~103): `const data = await apiJson(WEBHOOK_URL, { method: 'GET', headers: { Accept: 'application/json' }, mode: 'cors' }); setCouponsData(Array.isArray(data) ? data : []);`.

- [ ] **Step 4: RecipeInstructions.js, RecipeIngredients.js**

- Choose recipes (~139): `const data = await apiJson(webhookURL, { method: 'GET', headers: { Accept: 'application/json' }, mode: 'cors' });` — keep the `addDebugLog` calls but log `{ ok: true }` instead of `response.status`.
- Grab instructions (~250): the site builds its own 30 s `AbortController`; replace with `timeout: 30000` on `apiJson` and delete the controller/`clearTimeout` lines. Keep the rest of the parsing.
- RecipeIngredients (~101): `await apiJson(webhookUrl, { method: 'POST', headers: {...}, body: JSON.stringify(payload), mode: 'cors', signal: controller.signal });` then the success toast/navigate; the `catch` already ignores `AbortError` (apiJson rethrows caller aborts) — keep that check first.

- [ ] **Step 5: ReviewScreen.js**

- `match_coupons` (~127): `const data = await apiJson(ENDPOINTS.matchCoupons, { method: 'POST', headers: {...}, body: JSON.stringify({ items: selectedItems }), timeout: 120000, retries: 0 });` then existing payload handling.
- `save_coupon_matches` (~144): `apiJson(ENDPOINTS.saveCouponMatches, { method: 'POST', retries: 0, headers: {...}, body: ... }).catch(() => {});`.

- [ ] **Step 6: Verify**

```bash
grep -n "apiFetch" src/components/Deals.js src/components/SmartDeals.js src/components/Coupons.js src/components/RecipeInstructions.js src/components/RecipeIngredients.js src/components/staples/ReviewScreen.js
```

Expected: no output (all migrated, imports updated). Then:

```bash
CI=true npx react-scripts test --watchAll=false
npx eslint src --max-warnings=0
```

- [ ] **Step 7: Commit**

```bash
git add src/components/Deals.js src/components/SmartDeals.js src/components/Coupons.js src/components/RecipeInstructions.js src/components/RecipeIngredients.js src/components/staples
git commit -m "refactor(api): Deals, Coupons, Recipe and Review screens use apiJson

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 4: Migrate InStoreMode and HebCart (transcribe upload sends the key)

**Files:**
- Modify: `src/components/InStoreMode.js` (transcribe upload ~229–275; `create_session` ~875; `sendProgressOp` ~1170; list load ~1269; progress load ~1345; coupon lookup ~1383; progress poll ~1650), `src/components/HebCart.js` (`smart_match_grocery` ~821 and ~923 only; leave every `fetch` to the clip server untouched)
- Test: `src/components/InStoreMode.useHoldToTalk.test.js`, `src/components/InStoreMode.test.js`

**Interfaces:** consumes `apiJson`/`ApiError`.

**Why the transcribe change matters:** `useHoldToTalk` posts the recording with a raw `fetch` and no `X-API-Key`; wave 3 enables auth on `transcribe_grocery_item`, which would silently break voice check-off. Routing it through `apiJson` adds the key, keeps the 15 s deadline via the caller signal, and keeps the multipart body (no `Content-Type` header is set, so the browser sets the boundary).

- [ ] **Step 1: Update the hold-to-talk test mock and add a header assertion**

In `InStoreMode.useHoldToTalk.test.js` `setupMocks`, make the default `fetchImpl` return `{ ok: true, status: 200, text: async () => JSON.stringify({ success: true, transcript: 'milk' }), json: async () => ({ success: true, transcript: 'milk' }) }`, and any custom `fetchImpl` in the file the same way (`ok:false` cases: `text: async () => ''`). In the test that inspects `global.fetch.mock.calls[0]` add:

```js
process.env.REACT_APP_API_KEY = 'test-key';   // set in beforeEach for this test, delete in afterEach
expect(init.headers['X-API-Key']).toBe('test-key');
expect(init.body).toBeInstanceOf(FormData);
```

Run: `CI=true npx react-scripts test --watchAll=false src/components/InStoreMode.useHoldToTalk.test.js`
Expected: the header assertion FAILS.

- [ ] **Step 2: Migrate the transcribe upload**

Replace the `try { const res = await fetch(endpoint, {...}) … resJson = await res.json(); } catch (err) {…}` block with:

```js
let resJson = null;
try {
  resJson = await apiJson(endpoint, {
    method: "POST",
    body: form,
    signal: controller.signal,
    timeout: FETCH_TIMEOUT_MS,
    retries: 0,
  });
  clearTimeout(timeoutId);
} catch (err) {
  clearTimeout(timeoutId);
  setState("idle");
  // Timeout, caller abort and network failures all mean "try again";
  // anything the server answered (403/5xx/empty/invalid JSON) is "server".
  const isNetwork = err?.name === "AbortError" || err?.code === "network" || err?.code === "timeout";
  if (onErrorRef.current) onErrorRef.current(isNetwork ? "network" : "server");
  return;
}
```

Keep the `if (!resJson || resJson.success !== true)` block after it unchanged. Import `apiJson` (and `ApiError` only if used).

- [ ] **Step 3: Migrate the other InStoreMode n8n calls**

- `create_session` (~875): `const data = await apiJson(ENDPOINTS.createSession, { method: "POST", headers: {...}, body: ..., timeout: 10000, retries: 0 });` then the existing `if (!cancelled) {…}`.
- `sendProgressOp` (~1172): 

```js
apiJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week_start_date: weekStart, item_id: itemId }) })
  .then(() => {
    const entry = pendingOpsRef.current.get(itemId);
    if (!entry || entry.token !== token) return;
    pendingOpsRef.current.delete(itemId);
  })
  .catch(() => {
    const entry = pendingOpsRef.current.get(itemId);
    if (entry && entry.token === token) entry.failed = true;
  });
```

- List load (~1269): `const data = await apiJson(url.toString(), { method: "GET", mode: "cors", headers: { Accept: "application/json" } }); if (cancelled || !Array.isArray(data)) return;`.
- Progress load (~1345): `try { const data = await apiJson(url.toString(), {...}); const checkedIds = …; setCheckedItems(new Set(checkedIds)); return; } catch { /* fall through to localStorage */ }`.
- Coupon lookup (~1383): `const data = await apiJson(url, { timeout: 10000 }); const items = data.items || data || [];` inside the existing try.
- Progress poll (~1650): `const data = await apiJson(url.toString(), { method: "GET", headers: {...}, timeout: 8000, retries: 0 }); if (cancelled) return;` then the existing logic.

- [ ] **Step 4: HebCart smart match (two sites)**

Both `smart_match_grocery` calls: `const aiData = await apiJson(ENDPOINTS.hebSmartMatch, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: batchItems, frequentProducts: batchFrequentProducts }), timeout: 120000, retries: 0 }); const resultObj = Array.isArray(aiData) ? aiData[0] : aiData;` — drop the `if (aiRes.ok)` wrapper; the surrounding `try/catch` already logs and continues. Import `{ ENDPOINTS, apiJson }`; remove `apiFetch` if unused.

- [ ] **Step 5: Verify**

```bash
grep -n "apiFetch\|fetch(endpoint" src/components/InStoreMode.js src/components/HebCart.js
```

Expected: only clip-server `fetch(` calls remain in HebCart; none in InStoreMode.

```bash
CI=true npx react-scripts test --watchAll=false src/components/InStoreMode
CI=true npx react-scripts test --watchAll=false
npx eslint src --max-warnings=0
```

- [ ] **Step 6: Commit**

```bash
git add src/components/InStoreMode.js src/components/InStoreMode.useHoldToTalk.test.js src/components/HebCart.js
git commit -m "refactor(api): InStoreMode and HebCart n8n calls use apiJson; transcribe upload sends the key

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 5: ChatBot and MealCreator (hand-reviewed) + retries audit

**Files:**
- Modify: `src/components/ChatBot.js` (sites at ~96, 261, 302, 362, 751, 1236), `src/components/MealCreator.js` (sites at ~64, 106, 256, 340, 393, 436, 471, 511)

**Decision table (from the spec's rule "keep apiFetch where the text path is load-bearing"):**

| Site | Endpoint | Decision |
|---|---|---|
| ChatBot ~96, MealCreator ~106 | `chat_history` | **keep `apiFetch`** — empty text means "no history"; add a comment `// apiFetch on purpose: an empty body is the "no history yet" signal (see webhook-contract spec §2a).` |
| ChatBot ~362 | `call_grocery_agent` | **keep `apiFetch`** (text + 500 fallback message); already `retries: 0` |
| ChatBot ~751 | `get_recipe_items` | **keep `apiFetch`** (text + parse fallback); add `retries: 0` |
| ChatBot ~261, ~1236; MealCreator ~436 | `add_weekly_selection` | `apiJson` |
| ChatBot ~302; MealCreator ~64 | `remove_weekly_selection` | `apiJson` |
| MealCreator ~256, ~340 | `meal_creator_propose`/`_build` | **keep `apiFetch`** (text + `output` unwrapping); already `retries: 0` |
| MealCreator ~393 | `meal_creator_save` | `apiJson` with `timeout: 60000, retries: 0` (drop the manual controller); `let data = await apiJson(...); if (Array.isArray(data) && data.length > 0) data = data[0];` |
| MealCreator ~471 | `get_recipe_items` | `apiJson` with `retries: 0`; `const ingredientData = await apiJson(...)`; on catch log as before |
| MealCreator ~511 | `meal_ingredients` | `apiJson` with `retries: 0`; success log on resolve, failure log in catch |

- [ ] **Step 1: Apply the table**

For `add_weekly_selection` in ChatBot ~261: `await apiJson(ENDPOINTS.addWeeklySelection, {...}); toast.success(...); if (refreshMeals) await refreshMeals();` — the `else` branch (`Failed to add`) merges into the `catch`, which becomes `toast.error(\`Failed to add "${mealName}". ${error.message}\`)`. Same shape for MealCreator ~436 (the nested ingredient extraction stays inside the success path). `Clear All` (~1236): `apiJson(ENDPOINTS.removeWeeklySelection, {...})` inside `Promise.all`.

- [ ] **Step 2: Repo-wide retries audit (gate)**

```bash
grep -n "smartDeals\|hebSmartMatch\|matchCoupons\|mealCreator\|callGroceryAgent\|groceryPrep\b\|createSession\|saveCouponMatches\|submitFeedback\|getRecipeItems" src --include=*.js -r | grep -v test | grep -v "config/api.js"
```

For every call site listed, open the surrounding options object and confirm `retries: 0` is present explicitly (add it where missing; `submitFeedback` is handled in Task 6). Record the list of files touched in the commit body.

- [ ] **Step 3: Verify**

```bash
CI=true npx react-scripts test --watchAll=false
npx eslint src --max-warnings=0
grep -rn "response.ok\|res.ok" src --include=*.js | grep -v test | grep -v "config/api.js"
```

Expected on the last grep: only clip-server `fetch` sites (HebCart, useClipCoupons, useClipServerHealth, SmartDeals ~167) and the four kept `apiFetch` text-path sites.

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatBot.js src/components/MealCreator.js
git commit -m "refactor(api): ChatBot/MealCreator JSON sites use apiJson; explicit retries: 0 on every AI and side-effect POST

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 6: Feedback idempotency key on the client

**Files:**
- Create: `src/utils/uuid.js`, `src/utils/uuid.test.js`
- Modify: `src/contexts/FeedbackContext.js`
- Test: `src/components/FeedbackPanel.test.js` (already renders `FeedbackProvider` with an "open from context" button)

**Interfaces:**
- Produces: `randomUUID(): string` (RFC 4122 v4 format). Feedback POST body gains `client_id: <uuid>`; the same id is reused for a retried or double-tapped submission of the same report and a new one is generated when the panel is opened again.
- Server side (wave 2, Task 12) adds the column and `INSERT IGNORE`; until then n8n ignores the extra field, so this ships safely first.

- [ ] **Step 1: uuid util (TDD)**

`src/utils/uuid.test.js`:

```js
import { randomUUID } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('returns v4-format ids', () => {
  expect(randomUUID()).toMatch(V4);
});

test('ids are unique across calls', () => {
  const ids = new Set(Array.from({ length: 200 }, () => randomUUID()));
  expect(ids.size).toBe(200);
});

test('falls back when crypto.randomUUID is unavailable', () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try { expect(randomUUID()).toMatch(V4); }
  finally { Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true }); }
});
```

`src/utils/uuid.js`:

```js
/** RFC 4122 v4 id; uses crypto.randomUUID when the platform has it (jsdom does not). */
export function randomUUID() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
```

Run: `CI=true npx react-scripts test --watchAll=false src/utils/uuid.test.js` → PASS.

- [ ] **Step 2: Failing FeedbackContext test**

In `src/components/FeedbackPanel.test.js`, extend the module mock so `apiJson` is a `jest.fn()` (mirror the pattern in `useWeekStaples.test.js`: `jest.mock('../config/api', () => ({ ...jest.requireActual('../config/api'), apiJson: jest.fn() }))`). Add:

```js
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function openAndFill() {
  fireEvent.click(screen.getByText('open from context'));
  await screen.findByText('Send Feedback');
  fireEvent.click(screen.getByRole('img', { name: 'Bug' }).closest('button'));
  fireEvent.change(screen.getByPlaceholderText('What happened? What would make it better?'), { target: { value: 'it broke' } });
}

test('submit sends a client_id and reuses it on retry; a new report gets a new id', async () => {
  const { apiJson } = require('../config/api');
  apiJson.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ success: true });
  render(/* same tree the existing tests render */);
  await openAndFill();
  const submit = () => fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
  submit();
  await waitFor(() => expect(apiJson).toHaveBeenCalledTimes(1));
  const first = JSON.parse(apiJson.mock.calls[0][1].body);
  expect(first.client_id).toMatch(V4);
  expect(apiJson.mock.calls[0][1].retries).toBe(0);
  submit();
  await waitFor(() => expect(apiJson).toHaveBeenCalledTimes(2));
  expect(JSON.parse(apiJson.mock.calls[1][1].body).client_id).toBe(first.client_id);
  await waitFor(() => expect(screen.queryByText('Send Feedback')).not.toBeInTheDocument());
  await openAndFill();
  submit();
  await waitFor(() => expect(apiJson).toHaveBeenCalledTimes(3));
  expect(JSON.parse(apiJson.mock.calls[2][1].body).client_id).not.toBe(first.client_id);
});
```

If the submit button's accessible name differs from "Send Feedback", read `FeedbackPanel.js` and use its actual label; do not change the component's copy.

Run: `CI=true npx react-scripts test --watchAll=false src/components/FeedbackPanel.test.js` → the new test FAILS (no `client_id`, `apiFetch` still used).

- [ ] **Step 3: Implement in FeedbackContext.js**

- Imports: `import { ENDPOINTS, apiJson, ApiError } from '../config/api'; import { randomUUID } from '../utils/uuid';`
- `const clientIdRef = useRef(null);`
- In `openFeedback`, first line: `clientIdRef.current = randomUUID();`
- In `reset`, add `clientIdRef.current = null;`
- `handleSubmit` body:

```js
setIsSubmitting(true);
try {
  const weekData = getWeekDates();
  const metadata = { /* unchanged */ };
  if (!clientIdRef.current) clientIdRef.current = randomUUID();
  const data = await apiJson(ENDPOINTS.submitFeedback, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    retries: 0,
    body: JSON.stringify({
      client_id: clientIdRef.current,
      category,
      description: description.trim(),
      screen: currentScreen || 'unknown',
      metadata,
      screenshots: JSON.stringify(screenshots),
    }),
  });
  if (data && data.success === false) {
    toast.error('Failed to send feedback. Try again?');
  } else {
    toast.success('Feedback sent! Thanks!');
    handleClose();
  }
} catch (err) {
  const message = err instanceof ApiError && ['forbidden', 'timeout', 'network'].includes(err.code)
    ? err.message
    : 'Failed to send feedback. Try again?';
  toast.error(message);
} finally {
  setIsSubmitting(false);
}
```

- [ ] **Step 4: Verify and commit**

```bash
CI=true npx react-scripts test --watchAll=false
npx eslint src --max-warnings=0
git add src/utils/uuid.js src/utils/uuid.test.js src/contexts/FeedbackContext.js src/components/FeedbackPanel.test.js
git commit -m "feat(feedback): client_id idempotency key per report, apiJson with no retries

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 7: Outside callers send the key (scraper + review-feedback command)

**Files (scraper repo `C:\New Grocery App\heb-coupon-scraper`):**
- Create: `src/store-locations/n8n-client.js`, `test/n8n-client.test.js`
- Modify: `src/store-locations/phase0.js` (lines 7, 15–32), `src/store-locations/phase1.js` (lines 8, 51–66), `src/store-locations/offline-match.js` (lines 13, 42–52), `.env.example`, local `.env` (not committed)

**Files (app repo):**
- Modify: `.claude/commands/review-feedback.md` (both `https.get` calls)

**Interfaces:**
- Produces (scraper): `postJson(path, body) → Promise<object>`; throws `Error('GROCERY_APP_API_KEY missing from .env')` when unset; throws `Error(\`${path} returned ${status}\`)` on non-2xx; unwraps n8n's one-element array.

- [ ] **Step 1: Scraper test (TDD)**

`test/n8n-client.test.js`:

```js
const { postJson } = require('../src/store-locations/n8n-client');

describe('n8n-client postJson', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; delete process.env.GROCERY_APP_API_KEY; });

  test('sends X-API-Key and unwraps the array response', async () => {
    process.env.GROCERY_APP_API_KEY = 'k-123';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => [{ matches: [] }] }));
    await expect(postJson('smart_match_grocery', { items: [] })).resolves.toEqual({ matches: [] });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://n8n-grocery.needexcelexpert.com/webhook/smart_match_grocery');
    expect(init.headers['X-API-Key']).toBe('k-123');
    expect(init.method).toBe('POST');
  });

  test('throws when the key is missing', async () => {
    global.fetch = jest.fn();
    await expect(postJson('smart_match_grocery', {})).rejects.toThrow('GROCERY_APP_API_KEY missing');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('throws on non-2xx with the status', async () => {
    process.env.GROCERY_APP_API_KEY = 'k';
    global.fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    await expect(postJson('categorize_heb_product', {})).rejects.toThrow('categorize_heb_product returned 403');
  });
});
```

Run: `cd "/c/New Grocery App/heb-coupon-scraper" && npx jest test/n8n-client.test.js` → FAIL (module not found).

- [ ] **Step 2: Implement the helper**

`src/store-locations/n8n-client.js`:

```js
// Shared n8n webhook client for the store-locations scripts. Every n8n
// webhook requires the app's X-API-Key (hardening sub-project A, 2026-09).
require('../config'); // loads .env
const N8N_BASE = 'https://n8n-grocery.needexcelexpert.com/webhook';

function apiKey() {
  const key = process.env.GROCERY_APP_API_KEY;
  if (!key) throw new Error('GROCERY_APP_API_KEY missing from .env (copy REACT_APP_API_KEY from the grocery-checklist-app .env)');
  return key;
}

async function postJson(path, body) {
  const res = await fetch(`${N8N_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  const data = await res.json();
  // Respond to Webhook (allIncomingItems) wraps the payload in an array.
  return Array.isArray(data) ? data[0] : data;
}

module.exports = { postJson, N8N_BASE };
```

- [ ] **Step 3: Use it in the three scripts**

- `phase0.js`: delete `CATEGORIZE_URL`; `const { postJson } = require('./n8n-client');`; `categorizeHebProduct` becomes `return withRetry(() => postJson('categorize_heb_product', { name: product.product_name, brand: product.brand, hebProductCategory: product.category, hebProductCategoryPath: product.category_path }), { maxAttempts: 3, baseMs: 1000 });`.
- `phase1.js`: delete `SMART_MATCH_URL`; `const payload = await withRetry(() => postJson('smart_match_grocery', { items: [{ groceryItemId: String(item.id), groceryItemName: item.name, searchResults: results.products.slice(0, 12) }], frequentProducts: [] }), { maxAttempts: 3, baseMs: 1000 });` and drop the `Array.isArray(data) ? data[0] : data` line (the helper unwraps).
- `offline-match.js`: delete `SMART_MATCH_URL`; `callSmartMatch` becomes `const payload = await postJson('smart_match_grocery', { items, frequentProducts }); return payload?.matches || [];`.
- `.env.example`: append

```
# Grocery app API key — same value as REACT_APP_API_KEY in grocery-checklist-app/.env.
# Required by the store-locations scripts (n8n webhooks reject calls without it).
GROCERY_APP_API_KEY=
```

- Local `.env` (never committed): append `GROCERY_APP_API_KEY=<value of REACT_APP_API_KEY from the app .env>`:

```bash
KEY=$(grep '^REACT_APP_API_KEY=' "/c/New Grocery App/grocery-checklist-app/.env" | cut -d= -f2- | tr -d '\r'); grep -q '^GROCERY_APP_API_KEY=' "/c/New Grocery App/heb-coupon-scraper/.env" || printf '\nGROCERY_APP_API_KEY=%s\n' "$KEY" >> "/c/New Grocery App/heb-coupon-scraper/.env"
```

- [ ] **Step 4: Verify scraper**

```bash
cd "/c/New Grocery App/heb-coupon-scraper" && npx jest && grep -rn "n8n-grocery.needexcelexpert.com" src --include=*.js
```

Expected: all tests pass; the only URL occurrence is in `n8n-client.js`. Then a live dry run that hits the endpoint with an empty payload (safe: `items: []` short-circuits before the AI): `node -e "require('./src/store-locations/n8n-client').postJson('smart_match_grocery',{items:[],frequentProducts:[]}).then(r=>console.log('ok',JSON.stringify(r).slice(0,80)))"` → prints `ok {"matches":[]…`.

- [ ] **Step 5: Commit scraper**

```bash
git -C "/c/New Grocery App/heb-coupon-scraper" add src/store-locations/n8n-client.js test/n8n-client.test.js src/store-locations/phase0.js src/store-locations/phase1.js src/store-locations/offline-match.js .env.example
git -C "/c/New Grocery App/heb-coupon-scraper" commit -m "feat(store-locations): send the grocery app API key to n8n via a shared client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Do not stage the pre-existing modified `src/auth.js` or the untracked `exports/`, `logs/`.)

- [ ] **Step 6: review-feedback command**

In `.claude/commands/review-feedback.md`, replace both `node -e` scripts' first lines so they read the key from the app `.env` at runtime and pass it:

```js
const https = require('https');
const fs = require('fs');
const key = ((fs.readFileSync('.env', 'utf8').match(/^REACT_APP_API_KEY=(.*)$/m) || [])[1] || '').trim();
if (!key) { console.error('REACT_APP_API_KEY not found in .env'); process.exit(1); }
const opts = { headers: { 'X-API-Key': key } };
https.get('https://n8n-grocery.needexcelexpert.com/webhook/fetch_feedback?status=new', opts, res => {
```

(the rest of each script unchanged). Add a note under "Steps" heading: `All n8n webhooks require the X-API-Key header. Run these commands from the repo root so .env resolves. When marking items via update_feedback_status with curl, add -H "X-API-Key: $KEY".`

- [ ] **Step 7: Commit app repo**

```bash
cd "/c/New Grocery App/grocery-checklist-app" && git add .claude/commands/review-feedback.md && git commit -m "docs(review-feedback): send X-API-Key read from .env at runtime

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 8: Contract test script `scripts/webhook-contract.mjs`

**Files:**
- Create: `scripts/webhook-contract.mjs`

**Interfaces:**
- CLI: `node scripts/webhook-contract.mjs [--wave 0|1|2|3] [--only <path>] [--base <url>]`. Exit 0 when every enforced check passes, 1 otherwise. `--wave N` enforces "no key → 403" only for endpoints whose declared wave ≤ N (wave 0 = report-only: prints the table, always exits 0). **The no-key request is only sent for endpoints whose wave ≤ N or whose tier is `read`** — before its wave an unauthenticated POST endpoint would execute the workflow with the probe body (Ruling 6 in the ledger; this happened once during the baseline). With-key checks are always enforced (they are valid against today's backend).
- Reads `REACT_APP_API_KEY` and `REACT_APP_API_BASE_URL` from `.env` (cwd = repo root). Every request sends `Origin: https://grocery-checklist-app.netlify.app`.
- Prints one line per check: `PASS|FAIL|INFO  <method> /<path>  <check>  <status> <detail>`, a cleanup section, and a summary.

**Tiers (declared per endpoint in the script):**

| Tier | Meaning |
|---|---|
| `read` | GET with valid params; no key → 403 (per wave); key → 2xx JSON |
| `mutate` | part of the ordered round-trip sequence below; no key → 403; key → 2xx JSON with the asserted shape; cleanup at the end |
| `probe` | POST with a deliberately invalid body and the key; must not be 2xx unless `allow2xx` is set (endpoints whose empty body short-circuits without side effects); body must be JSON; no key → 403 |
| `probe-nokey` | only the no-key 403 check; never sent with the key (AI/orchestration/feedback cost or side effects) |

**Endpoint table:**

| path | method | wave | tier | request | expectation |
|---|---|---|---|---|---|
| categories | GET | 1 | read | — | array |
| fetch_grocery_items | GET | 1 | read | `weekStartDate, weekEndDate, weekDateRange` | array |
| fetch_weekly_meals | GET | 1 | read | `weekDateRange` | array |
| fetch_weekly_meal_ingredients | GET | 1 | read | `weekDateRange` | array |
| shopping_progress | GET | 1 | read | `week_date_range, week_start_date` | array |
| join_session | GET | 1 | read | `code=ZZZZ` | object with `found === false` |
| grocery_prep_status | GET | 1 | read | `jobId=__contract_test__` | object (`error: 'not_found'`) |
| fetch_feedback | GET | 1 | read | `status=__contract_test__` | array, length 0 |
| chat_history | GET | 1 | read | `sessionId=__contract_test__` | array |
| choose_recipe_instructions | GET | 1 | read | `weekDateRange` | array |
| grab_instructions_fast | GET | 1 | read | `weekDateRange, recipe_id=1` | JSON (object or array) |
| fetch_heb_coupons | GET | 1 | read | — | array |
| get_recipe_items | POST | 1 | probe | `{}` | ≥400 JSON |
| match_coupons | POST | 1 | probe | `{ items: [] }` | JSON, `allow2xx` |
| meal_creator_build | POST | 1 | probe-nokey | — | 403 |
| add_grocery_items | POST | 1 | probe | `{}` | ≥400 JSON |
| add_oneoff_item, selection_check, shopping_progress_check, shopping_progress_uncheck, selection_uncheck, add_weekly_selection, remove_weekly_selection, remove_weekly_item, create_session | POST | 2 | mutate | sequence below | see sequence |
| save_coupon_matches | POST | 2 | probe | `{}` | 400 JSON `success:false` |
| update_feedback_status | POST | 2 | probe | `{}` | ≥400 JSON |
| submit_feedback | POST | 2 | probe-nokey | — | 403 (with-key skipped: writes the bug list) |
| create_grocery_list, deactivate_grocery_item, meal_ingredients, meal_creator_save | POST | 2 | probe | `{}` | ≥400 JSON (`meal_ingredients` `allow2xx`: an empty body is a no-op) |
| meal_creator_propose, call_grocery_agent | POST | 2 | probe-nokey | — | 403 |
| smart_match_grocery | POST | 3 | probe | `{ items: [] }` | JSON, `allow2xx` |
| transcribe_grocery_item | POST | 3 | probe | `{}` (JSON, no audio) | ≥400 JSON after wave 3; before wave 3 report `INFO` if 2xx `{success:false}` |
| smart_deals, grocery_prep, categorize_heb_product | POST | 3 | probe-nokey | — | 403 |

**Mutation sequence (wave-2 tier, runs in this order, each step is a named check; a `finally` block always runs the cleanup calls):**

1. `add_oneoff_item` `{ itemName: NAME_ONEOFF, weekDateRange }` → `success === true` and numeric `itemId`.
2. `selection_check` `{ itemId: 999999, itemName: NAME_SEL, store: 'HEB', quantity: 1, weekDateRange, weekStartDate, category: 'Household & other' }` → `success === true`.
3. `fetch_grocery_items` (past week) → array contains an item with `ItemName === NAME_SEL`.
4. `shopping_progress_check` `{ week_start_date, item_id: 999999 }` → `success === true`.
5. `shopping_progress` → array contains `item_id 999999` (compare as strings).
6. `shopping_progress_uncheck` same body → success; `shopping_progress` no longer contains it.
7. `selection_uncheck` `{ itemName: NAME_SEL, weekDateRange, weekStartDate }` → success.
8. `add_weekly_selection` `{ weekDateRange, recipeId: 1, notes: '' }` → array containing `recipe_id 1`.
9. `remove_weekly_selection` `{ weekDateRange, recipeId: 1 }` → array not containing `recipe_id 1`.
10. `remove_weekly_item` `{ itemName: NAME_SEL, weekDateRange, weekStartDate }` → success; again with `NAME_ONEOFF`.
11. `fetch_grocery_items` (past week) → no `ItemName` starting with `__contract_test`.
12. `create_session` `{ week_start_date }` → `code` is 4 chars; `join_session?code=<code>` → `found === true`.
Cleanup (always): steps 6, 7, 9, 10 bodies re-sent (idempotent); then print:

```
CLEANUP (run via docker exec, these rows have no delete endpoint):
  DELETE FROM shopping_sessions WHERE week_start_date = '2026-01-04';
  DELETE FROM oneoff_items WHERE name = '__contract_test_oneoff__';
```

**Error-body assertions** (every non-2xx or `probe` response): body parses as JSON; `JSON.stringify(body)` matches none of `/INSERT|SELECT|UPDATE|host\.docker\.internal|hsa-/`. Detection lines: a `500` with `content-type` containing `text/html` → `FAIL … webhook not registered (re-activate the workflow)`; a `404` → same message.

- [ ] **Step 1: Write the script**

The canonical implementation is the checked-in `scripts/webhook-contract.mjs` (commits 256de23, 43cfd0f and the round-2 fix). The reference listing that used to live here was superseded during execution by these amendments, all recorded in the ledger: `WEEK_RANGE` is `For the week of January 4th to January 10th, 2026`; the no-key request is sent only for endpoints with `wave <= --wave` or tier `read`; `--wave` defaults to `0` (report-only) and enforcement is opt-in with a banner listing the keyless POST targets; `match_coupons`/`smart_match_grocery` probes carry `softBeforeWave` (INFO on a pre-wave empty 200); every check is exception-proof and the summary/exit rule always runs; the CLEANUP block prints whenever a keyless POST or the mutation sequence ran. Read the script, not this paragraph, for the exact behaviour.

- [ ] **Step 2: Baseline run against live n8n (report-only)**

```bash
cd "/c/New Grocery App/grocery-checklist-app" && node scripts/webhook-contract.mjs --wave 0 | tee "$SCRATCH/contract-baseline.txt"
```

(`$SCRATCH` = the session scratchpad directory.) Expected: exits 0; no-key checks are deferred (INFO) for every not-yet-authenticated POST endpoint; no-key checks show `PASS` for the 14 authenticated endpoints and `INFO` for the 25 others; every with-key read returns 2xx JSON **except** those that answer an empty body today (`EMPTY BODY` lines) — record the exact list under "Baseline results" at the end of this plan; the mutation sequence passes end to end; `save_coupon_matches` probe → 400 JSON. Any `FAIL` with `leaks internals` or `not JSON` on a probe is also recorded (n8n's own 500 is JSON; a pre-wave probe returning `{"message":"Error in workflow"}` passes).

- [ ] **Step 3: Cleanup the residue rows**

```bash
PW=$(grep '^DB_PASSWORD=' "/c/New Grocery App/heb-coupon-scraper/.env" | cut -d= -f2- | tr -d '\r'); docker exec -e MYSQL_PWD="$PW" hsa-mysql mysql -u hsa_user hsa -e "DELETE FROM shopping_sessions WHERE week_start_date='2026-01-04'; DELETE FROM oneoff_items WHERE name='__contract_test_oneoff__'; SELECT COUNT(*) leftover FROM WeeklyGroceryList WHERE ItemName LIKE '__contract_test%'; SELECT COUNT(*) sel FROM weekly_selections WHERE WeekDateRange='For the week of January 4th to January 10th, 2026'; SELECT COUNT(*) sp FROM shopping_progress WHERE week_start_date='2026-01-04';"
```

Expected: all three counts 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/webhook-contract.mjs
git commit -m "chore(scripts): tiered webhook contract test against live n8n

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 9: n8n rollout tool `scripts/n8n-wave.mjs`

**Files:**
- Create: `scripts/n8n-wave.mjs`, `scripts/n8n-edits/README.md`
- Modify: `.gitignore` (add `.n8n-backups/`)

**Interfaces:**
- CLI (all commands take webhook **paths**, not workflow ids, and resolve them against the active list):
  - `export` → writes every active workflow to `.n8n-backups/<ISO timestamp>/<id>.json`; prints the directory.
  - `show <path>` → prints auth, each node's `type/onError/continueOnFail/alwaysOutputData`, and connections.
  - `auth <path>…` → sets `authentication: 'headerAuth'` + credential `{ id: 'OzxeppJmnYuJpXbO', name: 'Grocery App API Key' }` on the Webhook node; PUT; cycle.
  - `error-branch <path> --nodes "A,B,…"` (or `--nodes-json '["A, b","C"]'` when a name contains a comma) → ensures a `Respond 500` node exists, sets `onError: 'continueErrorOutput'` and deletes `continueOnFail` on each listed node, connects each node's error output (`main[1]`) to `Respond 500`; PUT; cycle. Nodes must be MySQL/Postgres/HTTP Request/Code (the tool refuses others).
  - `unswallow <path> --nodes "A,B"` → deletes `continueOnFail` and `onError` on the listed nodes; PUT; cycle.
  - `apply <path> <file.mjs>` → imports `file.mjs` (default export `(workflow) => workflow`), applies it; PUT; cycle. Used for bespoke rewires; each file is committed under `scripts/n8n-edits/`.
  - `cycle <path>` → deactivate then activate.
- Env: `N8N_API_KEY` read from `C:\hsa-automation\.env` (override the file with `N8N_ENV_FILE`); base `http://localhost:5679/api/v1`.
- Every write: GET workflow → mutate in memory → `PUT /workflows/{id}` with `{ name, nodes, connections, settings }` where `settings` keeps only `executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow, timezone` → `POST /workflows/{id}/deactivate` → `POST /workflows/{id}/activate` → GET again and print `show` output. Refuses to PUT if any Webhook node lost its `webhookId`.

**Respond 500 node** (inserted by `error-branch`, position = existing Respond node's position + `[0, 260]`, or `[900, 500]` if none):

```js
{
  id: 'respond-500', name: 'Respond 500', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.4,
  position, parameters: {
    respondWith: 'json',
    responseBody: RESPOND_500_BODY,
    options: { responseCode: 500, responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } },
  },
}
```

`RESPOND_500_BODY` (one line; the sanitiser cuts the message at the first SQL keyword or `near`, masks hostnames, caps at 200 chars, never serialises the error object — MySQL's error object carries the interpolated SQL in `description`; the `$json.message` fallback was removed during review because an error item keeps the input json and `call_grocery_agent` carries the user's chat text in that field):

```
={{ (() => { const e = $json.error; const raw = typeof e === 'string' ? e : ((e && e.message) || 'Workflow error'); const safe = String(raw).split(/\bnear\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i)[0].replace(/host\.docker\.internal|hsa-[a-z0-9_-]+/gi, 'db').trim().slice(0, 200); return JSON.stringify({ success: false, error: safe || 'Workflow error' }); })() }}
```

- [ ] **Step 1: Write the tool**

```js
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
export const RESPOND_500_BODY = "={{ (() => { const e = $json.error; const raw = typeof e === 'string' ? e : ((e && e.message) || 'Workflow error'); const safe = String(raw).split(/\\bnear\\b|\\bSELECT\\b|\\bINSERT\\b|\\bUPDATE\\b|\\bDELETE\\b/i)[0].replace(/host\\.docker\\.internal|hsa-[a-z0-9_-]+/gi, 'db').trim().slice(0, 200); return JSON.stringify({ success: false, error: safe || 'Workflow error' }); })() }}";

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
```

`scripts/n8n-edits/README.md`: three lines explaining that each file exports `default (workflow, helpers) => workflow` and is applied with `node scripts/n8n-wave.mjs apply <path> scripts/n8n-edits/<file>.mjs`, and that every edit is preceded by `export`.

- [ ] **Step 2: Smoke test without changing anything**

```bash
printf '\n# n8n workflow backups (ops tool)\n.n8n-backups/\n' >> .gitignore
node scripts/n8n-wave.mjs export
node scripts/n8n-wave.mjs show add_oneoff_item
node scripts/n8n-wave.mjs show fetch_grocery_items
```

Expected: a backup directory with 41 files (39 webhook workflows + 2 scheduled); `show` prints the node/flag/connection lines matching the workflow summary in the spec's "Current state".

- [ ] **Step 3: Round-trip test on one already-authenticated workflow**

`cycle` a workflow that already has auth (no content change) and confirm the contract test still passes for it:

```bash
node scripts/n8n-wave.mjs cycle fetch_heb_coupons
node scripts/webhook-contract.mjs --wave 0 --only fetch_heb_coupons
```

Expected: PASS for no-key → 403 and key → 2xx JSON (proves deactivate/activate re-registers the webhook).

- [ ] **Step 4: Commit**

```bash
git add scripts/n8n-wave.mjs scripts/n8n-edits/README.md .gitignore
git commit -m "chore(scripts): n8n rollout tool (export, auth, error-branch, unswallow, apply, cycle)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 10: Whole-branch review, deploy the app, step-zero fault injection

This task is run by the orchestrator (not a subagent) except where noted. Order matters: the app must be live with `apiJson` before any n8n wave.

- [ ] **Step 1: Whole-branch adversarial review** (per subagent-driven-development: one reviewer over `main..feat/webhook-contract`, one fix wave, re-review). Focus list for the reviewer prompt: every migrated site preserves headers/timeout/signal; no `apiFetch` left at an `ok/json` site; every AI/side-effect POST has `retries: 0`; `showApiError` never shows `[object Object]`; caller aborts are not turned into toasts; the transcribe upload keeps `FormData` and the caller signal; feedback `client_id` reuse semantics; contract test can never send a valid body to the forbidden endpoints (grep the tier table); n8n tool never drops `webhookId` and filters settings.

- [ ] **Step 2: Local verification with Playwright**

```bash
BROWSER=none PORT=3000 CI=true npx react-scripts start
```

Checks (mobile 390×844 and desktop): Plan loads staples, add a one-off `__pw_check__` → appears → remove it; Deals loads coupons and smart deals (cached; no new AI run if the cache is fresh — check `smart_deals_cache.created_at` first and skip the Deals refresh if older than 1 h to avoid an LLM call); Shop check/undo one item; Cart shows "Checking connection…" then a status; Feedback panel opens and closes (do **not** submit). Confirm in the network log that every n8n request carries `X-API-Key` (including any transcribe attempt if a mic is available; otherwise skip). Confirm no test rows remain (`WeeklyGroceryList` has no `__pw_check__`).

- [ ] **Step 3: Fast-forward main and deploy**

```bash
git checkout main && git merge --ff-only feat/webhook-contract && git push origin main
```

Wait for Netlify (poll `https://grocery-checklist-app.netlify.app` for the new bundle hash, ≤ 5 min). Repeat the Step 2 checks against the live URL. Record the bundle hash in the ledger.

- [ ] **Step 4: Step zero — fault injection on the current n8n**

```bash
KEY=$(grep '^REACT_APP_API_KEY=' .env | cut -d= -f2- | tr -d '\r'); H=(-H "X-API-Key: $KEY" -H "Origin: https://grocery-checklist-app.netlify.app" -H "Content-Type: application/json")
docker pause hsa-mysql
time curl -s -o /dev/stdout -w '\nSTATUS %{http_code} TYPE %{content_type} TIME %{time_total}\n' "${H[@]}" -X POST -d '{"itemName":"__contract_test_oneoff__","weekDateRange":"For the week of January 4th to January 10th, 2026"}' https://n8n-grocery.needexcelexpert.com/webhook/add_oneoff_item
time curl -s -o /dev/stdout -w '\nSTATUS %{http_code} TYPE %{content_type} TIME %{time_total}\n' "${H[@]}" -X POST -d '{"week_start_date":"2026-01-04","item_id":999999}' https://n8n-grocery.needexcelexpert.com/webhook/shopping_progress_check
docker unpause hsa-mysql
docker exec hsa-mysql mysqladmin -u hsa_user ping 2>/dev/null || sleep 5
```

Record status, content type, body (first 200 chars) and elapsed time for both under "Step zero results" at the end of this plan. Then look at the two executions (`n8n_list_executions` status error/success, `n8n_get_execution` with data) and record which node failed and the error item's JSON keys (`error`? `message`? `description`?) — this confirms the field names the `Respond 500` expression reads. Clean up: none expected (MySQL was paused), but run the Task 8 Step 3 cleanup query to be sure.

- [ ] **Step 5: Ledger + commit the recorded results**

Append the results to this plan file's "Step zero results" section and commit (`docs: record step-zero fault injection results`). Ledger line: `Task 10: app deployed <bundle>, step zero recorded`.

---

## Task 11: n8n wave 1 — reads

**Scope:** auth on the 8 unauthenticated GET workflows; branch audit on the reads that the baseline (Task 8 Step 2) reported as `EMPTY BODY`; **plus `Respond 500` error branches on every read workflow's MySQL/Postgres/Code nodes (Ruling 7: this n8n answers any unhandled node error with an empty 200, so the spec's "untouched" reads would fail Goal 2)**; plus the `match_coupons` AI bypass (Ruling 5: IF node routing `skipAgent` to Format Output; `onError: continueRegularOutput` on the AI Agent and a throw in Format Output when the agent item carries `error`).

**Files:** `scripts/n8n-edits/chat_history.mjs` (and one file per additional read that needs the aggregate pattern — same code, different node names).

- [ ] **Step 1: Backup**

`node scripts/n8n-wave.mjs export`

- [ ] **Step 2: Auth flip**

```bash
node scripts/n8n-wave.mjs auth categories fetch_grocery_items fetch_weekly_meal_ingredients fetch_weekly_meals shopping_progress join_session grocery_prep_status fetch_feedback
node scripts/webhook-contract.mjs --wave 1 --only categories
```

Expected: `show` output for each prints `auth=headerAuth cred=OzxeppJmnYuJpXbO`; the `--only` run passes.

- [ ] **Step 3: Branch audit — zero-row reads that respond with `allIncomingItems`**

The baseline lists which of `chat_history`, `choose_recipe_instructions`, `grab_instructions_fast`, `fetch_heb_coupons` returned `EMPTY BODY`. For each such workflow apply the aggregate pattern. Template `scripts/n8n-edits/chat_history.mjs`:

```js
// Zero rows from Postgres left the Respond node unreached → empty 200.
// Pattern: data node alwaysOutputData → Aggregate → Respond (json, drop empty rows).
export default function (wf) {
  const data = wf.nodes.find((n) => n.name === 'Get Chat History');
  const respond = wf.nodes.find((n) => n.type === 'n8n-nodes-base.respondToWebhook');
  data.alwaysOutputData = true;
  if (!wf.nodes.some((n) => n.name === 'Aggregate')) {
    wf.nodes.push({ id: 'aggregate-rows', name: 'Aggregate', type: 'n8n-nodes-base.aggregate', typeVersion: 1,
      position: [respond.position[0] - 220, respond.position[1]], parameters: { aggregate: 'aggregateAllItemData', options: {} } });
  }
  respond.parameters.respondWith = 'json';
  respond.parameters.responseBody = "={{ JSON.stringify(($json.data || []).filter((r) => r && r.id != null)) }}";
  respond.parameters.options = { ...(respond.parameters.options || {}), responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Content-Type', value: 'application/json' }] } };
  wf.connections[data.name] = { main: [[{ node: 'Aggregate', type: 'main', index: 0 }]] };
  wf.connections['Aggregate'] = { main: [[{ node: respond.name, type: 'main', index: 0 }]] };
  return wf;
}
```

Per-workflow substitutions: `choose_recipe_instructions` → data node `Execute a SQL query`, filter `r.selection_id != null`; `fetch_heb_coupons` → `Query Active Coupons`, filter `r.hash_id != null`; `grab_instructions_fast` → the chain is `Get Instructions → Get Ingredients → Merge Results (Code) → Respond`; set `alwaysOutputData = true` on **both** MySQL nodes and leave Respond alone (the Code node already builds a single object; verify with `--only grab_instructions_fast` that an unknown recipe returns JSON, and if `Merge Results` throws on the empty item, guard its first line with `const rows = $input.all().map(i => i.json).filter(r => r && Object.keys(r).length);` via the same edit file).

Apply each: `node scripts/n8n-wave.mjs apply chat_history scripts/n8n-edits/chat_history.mjs` etc.

- [ ] **Step 4: Gate**

```bash
node scripts/webhook-contract.mjs --wave 1
```

Expected: exit 0; every wave-1 endpoint `PASS` on both checks; wave-2/3 no-key lines `INFO`. Then the Task 8 Step 3 cleanup query. Live UI checks: Plan (list loads), Home counts, Cook (Choose recipe list), Chat (open a session; history loads or shows empty), Cart weekly items.

- [ ] **Step 5: Commit + ledger**

```bash
git add scripts/n8n-edits && git commit -m "chore(n8n): wave 1 read workflows — auth + zero-row responses

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Ledger: `Task 11: wave 1 done — auth on 8 reads; aggregate pattern on <list>; contract --wave 1 green`.

---

## Task 12: n8n wave 2 — mutations, swallowers, error branches, feedback migration

**Scope (18 workflows):** auth on the 12 unauthenticated POSTs (`add_oneoff_item add_weekly_selection remove_weekly_item remove_weekly_selection selection_check selection_uncheck shopping_progress_check shopping_progress_uncheck create_session save_coupon_matches submit_feedback update_feedback_status`); `Respond 500` error branches on all 18 (the 12 above + `create_grocery_list deactivate_grocery_item meal_ingredients meal_creator_save meal_creator_propose call_grocery_agent`); swallower removal on `update_feedback_status`; `app_feedback.client_id` migration + `INSERT IGNORE`.

**Files:** `scripts/n8n-edits/submit_feedback.mjs`, `docs/migrations/2026-09-05-app-feedback-client-id.sql`.

- [ ] **Step 1: Backup + auth**

```bash
node scripts/n8n-wave.mjs export
node scripts/n8n-wave.mjs auth add_oneoff_item add_weekly_selection remove_weekly_item remove_weekly_selection selection_check selection_uncheck shopping_progress_check shopping_progress_uncheck create_session save_coupon_matches submit_feedback update_feedback_status
```

- [ ] **Step 2: Feedback migration**

`docs/migrations/2026-09-05-app-feedback-client-id.sql`:

```sql
-- Idempotency key for submit_feedback (hardening sub-project A). Old rows keep NULL.
ALTER TABLE app_feedback
  ADD COLUMN client_id VARCHAR(36) NULL AFTER id,
  ADD UNIQUE KEY uq_app_feedback_client_id (client_id);
```

Apply with the docker exec pattern from Global Constraints, then verify: `SHOW INDEX FROM app_feedback WHERE Key_name='uq_app_feedback_client_id'` → one row.

`scripts/n8n-edits/submit_feedback.mjs`:

```js
// Add client_id to the INSERT and make it INSERT IGNORE (unique key uq_app_feedback_client_id).
export default function (wf) {
  const node = wf.nodes.find((n) => n.name === 'Insert Feedback');
  let q = node.parameters.query;
  if (!q.includes('client_id')) {
    q = q.replace(/^\s*INSERT INTO app_feedback \(/i, 'INSERT IGNORE INTO app_feedback (client_id, ')
         .replace(/VALUES \(\s*/i, "VALUES ( {{ $json.body.client_id ? \"'\" + String($json.body.client_id).replace(/[^0-9a-fA-F-]/g, '').slice(0, 36) + \"'\" : 'NULL' }}, ");
  }
  node.parameters.query = q;
  return wf;
}
```

Apply: `node scripts/n8n-wave.mjs apply submit_feedback scripts/n8n-edits/submit_feedback.mjs`, then `show submit_feedback` and read the query back: it must start with `INSERT IGNORE INTO app_feedback (client_id, category, …` and the VALUES list must start with the `client_id` expression. **Do not test-submit feedback.** Verification is the live Feedback check in Step 6 (one real submission by the user, or none — the unique index + `INSERT IGNORE` are verified by inspection and by the migration).

- [ ] **Step 3: Swallower removal**

`node scripts/n8n-wave.mjs unswallow update_feedback_status --nodes "Webhook,Respond"` (removes `onError: continueRegularOutput` on both).

- [ ] **Step 4: Error branches**

Node lists (all MySQL/Postgres/Code; `Respond`-type nodes excluded):

```bash
W=scripts/n8n-wave.mjs
node $W error-branch add_oneoff_item --nodes "Ensure OneOff,Lookup OneOff ID,Insert WGL"
node $W error-branch add_weekly_selection --nodes "Insert Selection,Get Updated List"
node $W error-branch remove_weekly_item --nodes "Cleanup Progress,Delete Weekly Item"
node $W error-branch remove_weekly_selection --nodes "Delete Selection,Cleanup Orphan Meal Ingredients,Get Updated List"
node $W error-branch selection_check --nodes "Clear Skipped Flag,Check Item"
node $W error-branch selection_uncheck --nodes "Uncheck Item"
node $W error-branch shopping_progress_check --nodes "Check Item"
node $W error-branch shopping_progress_uncheck --nodes "Uncheck Item"
node $W error-branch create_session --nodes "Prepare Session,Insert Session"
node $W error-branch save_coupon_matches --nodes "Route Request,Save Matches,Accept Coupon"   # also: the baseline shows `{}` → empty 200, so the Switch's `error` route to `Respond Error` (400) is not firing — inspect with `show` and wire the fallback output before the gate
node $W error-branch submit_feedback --nodes "Insert Feedback"
node $W error-branch update_feedback_status --nodes "Build SQL,Update Feedback"
node $W error-branch create_grocery_list --nodes "Extract Week Range,Delete Old Staples,Transform for DB Input,Execute a SQL query"
node $W error-branch deactivate_grocery_item --nodes "Transform for DB Input,Update rows in a table,Delete from WeeklyGroceryList"
node $W error-branch meal_ingredients --nodes "Lookup Existing Staples,Lookup Ingredient IDs,Transform for DB Input,Insert Meal Ingredients"
node $W error-branch meal_creator_save --nodes "Validate & Parse Recipe,Insert Recipe,Process Ingredients, Instructions & Tags,Execute SQL Statements,Aggregate Results"
node $W error-branch meal_creator_propose --nodes "Extract Session & Message,Build Summary,Archive Raw JSON,Update Chat Summary"
node $W error-branch call_grocery_agent --nodes "Code,Build Summary,Archive Raw JSON,Update Chat Summary"
```

Note for `meal_creator_save`: the node name `Process Ingredients, Instructions & Tags` contains a comma — use the tool's `--nodes-json '["Validate & Parse Recipe","Insert Recipe","Process Ingredients, Instructions & Tags","Execute SQL Statements","Aggregate Results"]'` form instead of `--nodes` for that one.

`meal_creator_propose`/`call_grocery_agent`: the two Postgres nodes run **after** `Build Summary` fans out to `Respond to Webhook`; an error there fires `Respond 500` after the 200 was sent — n8n logs "response already sent" and the execution shows the error. Acceptable (the client got its answer; the failure is visible in executions). Record it in the ledger.

- [ ] **Step 5: Gate**

```bash
node scripts/webhook-contract.mjs --wave 2
```

Expected: exit 0. Probes now show `Respond 500` bodies, e.g. `update_feedback_status` → `500 {"success":false,"error":"id is required and must be numeric"}`, `meal_creator_save` → `500 {"success":false,"error":"recipe_name is required"}`; `save_coupon_matches` still `400`. Cleanup query (Task 8 Step 3).

- [ ] **Step 6: UI fault injection through the deployed app**

With Playwright on the live app, open Plan; `docker pause hsa-mysql`; add a one-off `__pw_fault__`; expect an error toast (`Something went wrong` / server message) and **no** "Added" and no item in the list; `docker unpause hsa-mysql`; reload; confirm the list is intact and `__pw_fault__` is absent (it never persisted). Then Shop: check an item, confirm it persists after reload; uncheck. Feedback: open and close only. Record the toast text in the ledger.

- [ ] **Step 7: Commit + ledger**

```bash
git add scripts/n8n-edits docs/migrations scripts/n8n-wave.mjs && git commit -m "chore(n8n): wave 2 — auth on mutations, Respond 500 error branches, feedback client_id

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 13: n8n wave 3 — AI and orchestration workflows

**Scope:** `grocery_prep`, `smart_deals`, `smart_match_grocery`, `transcribe_grocery_item`, `categorize_heb_product`: auth, swallower removal, error branches.

**Files:** `scripts/n8n-edits/smart_deals.mjs`.

- [ ] **Step 1: Backup + auth**

```bash
node scripts/n8n-wave.mjs export
node scripts/n8n-wave.mjs auth grocery_prep smart_deals smart_match_grocery transcribe_grocery_item categorize_heb_product
```

Before this step confirm the scraper `.env` has `GROCERY_APP_API_KEY` (Task 7) — `categorize_heb_product` and `smart_match_grocery` are its endpoints.

- [ ] **Step 2: Smart Deals — remove both swallowers without a double response**

`scripts/n8n-edits/smart_deals.mjs`:

```js
// 1) An LLM failure must become a 500, not an empty cached result: drop continueOnFail on the chain.
// 2) Save to Cache ran in parallel with the Respond node; move it AFTER the response so a cache
//    failure can neither swallow the answer nor cause a second response.
export default function (wf, { errorBranch }) {
  const llm = wf.nodes.find((n) => n.name === 'Basic LLM Chain');
  delete llm.continueOnFail; delete llm.onError;
  const cache = wf.nodes.find((n) => n.name === 'Save to Cache');
  delete cache.continueOnFail; delete cache.onError;
  wf.connections['Format and Cache'] = { main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]] };
  wf.connections['Respond to Webhook'] = { main: [[{ node: 'Save to Cache', type: 'main', index: 0 }]] };
  errorBranch(wf, ['Check Cache', 'Return Cached', 'Fetch Clipped IDs', 'Overlay Clipped Status', 'SQL Match Products to Coupons', 'Build AI Prompt', 'Format and Cache', 'No Deals Found']);
  return wf;
}
```

Apply and `show smart_deals`: `Basic LLM Chain` has no flags; `Format and Cache [0]→Respond to Webhook`; `Respond to Webhook [0]→Save to Cache`; the eight listed nodes show `onError=continueErrorOutput` with `[1]→Respond 500`.

- [ ] **Step 3: Transcribe, smart match, categorize, prep**

```bash
W=scripts/n8n-wave.mjs
node $W error-branch transcribe_grocery_item --nodes "Build Response"
node $W error-branch smart_match_grocery --nodes "Build Match Prompt,Format Output"
node $W error-branch categorize_heb_product --nodes "Build Prompt,Format Output"
node $W error-branch grocery_prep --nodes "Generate Job ID,Init Job"
```

`grocery_prep`: only the two nodes before `Respond` get branches; everything after the response is the orchestrator's concern (spec). `transcribe_grocery_item`: **keep** the Whisper node's `continueRegularOutput` and Build Response's `{success:false, error:'no_audio'|'whisper_error'}` 200 (Ruling 12): on this n8n an unswallowed LangChain/OpenAI node error yields an empty 200, which is worse than the by-design JSON; the contract test's probe carries `allow2xx`.

- [ ] **Step 4: Gate**

```bash
node scripts/webhook-contract.mjs --wave 3
```

Expected: exit 0 — every no-key check `PASS` (39/39 → 403), `transcribe_grocery_item` probe `PASS` with a 5xx JSON body, `smart_match_grocery` probe `PASS` (JSON no-op). Cleanup query (Task 8 Step 3).

- [ ] **Step 5: Live checks**

- Home: tap **Prep** only if the user agrees (it runs the real orchestration); otherwise skip and note it.
- Deals: if `smart_deals_cache` is fresh (< 1 h) the Deals screen must still load from cache (`Return Cached` path now has an error branch — verify it renders). Do not force an LLM run.
- Shop: voice check-off — if a microphone is available in the Playwright browser, hold-to-talk once and confirm the request carries the key and returns JSON; if not, confirm via the contract test's transcribe probe only.
- Scraper: `cd heb-coupon-scraper && npm run offline-match:dry` → the log shows Smart Match calls succeeding (200), no 403.

- [ ] **Step 6: Commit + ledger**

```bash
git add scripts/n8n-edits && git commit -m "chore(n8n): wave 3 — auth + error branches on AI/orchestration workflows; Smart Deals no longer caches LLM failures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 14: Wrap-up — memory, checklist, ledger, backlog handoff

- [ ] **Step 1: Final contract run and push**

```bash
node scripts/webhook-contract.mjs --wave 3 && git push origin main
```

(Wave commits were made on `main` directly after Task 10's fast-forward; confirm `git status -sb` shows `main` in sync.)

- [ ] **Step 2: Checklist + memory**

- `docs/superpowers/hardening-checklist.md`: tick every A item, set the heading to `[x] shipped 2026-09-05`, and add under "Deferred findings": the post-response Postgres error case in `meal_creator_propose`/`call_grocery_agent`, and `grab_instructions_fast` empty-item guard (if applied).
- Project memory (`hardening_program.md`): status A shipped; rules "every curl needs `X-API-Key` + `Origin`", "new call sites use `apiJson` (POST = 0 retries)", "n8n edits via `scripts/n8n-wave.mjs` (export first)", "contract test: `node scripts/webhook-contract.mjs --wave 3`, then the docker exec cleanup for `shopping_sessions`/`oneoff_items`". Update `MEMORY.md` index line.
- Commit: `docs: hardening A shipped — checklist, migrations note`.

- [ ] **Step 3: Ledger**

Append `DONE sub-project A <date> — contract --wave 3 green; bundle <hash>; waves 1–3 backups in .n8n-backups/<dirs>`.

- [ ] **Step 4: Present backlog B–G** (from the handoff) and ask which to design next.

---

## Baseline results (filled in during Task 8 Step 2)

_Recorded at execution time: list of endpoints returning `EMPTY BODY`, any `not JSON`/leak findings, mutation sequence outcome._

## Step zero results (recorded 2026-09-05 21:51 local, before any n8n workflow edit)

With `hsa-mysql` paused (23 s), keyed requests with the browser `Origin`:

| endpoint | status | content-type | body | elapsed |
|---|---|---|---|---|
| `add_oneoff_item` | 200 | application/json | empty (0 bytes) | 10.8 s |
| `shopping_progress_check` | 200 | application/json | empty (0 bytes) | 10.9 s |

Executions 25795 (`Check Item`) and 25793/25794 (two read workflows a real client hit during the pause) all ended `status: error` at the MySQL node with `connect ETIMEDOUT` (error object keys: `errorno, code, syscall, fatal, message, stack`; no hostname in `message`). Conclusion: on this n8n a MySQL outage is an **empty 200**, never a 500 JSON — the `Respond 500` error branches (and the client's `empty` error code, already deployed) are load-bearing. The `RESPOND_500_BODY` expression reads `error.message` → `connect ETIMEDOUT`, which passes the leak assertions.

Baseline (Task 8, third run): `29 passed, 10 failed, 45 info`; empty-200 reads `chat_history`, `grab_instructions_fast`; empty-200 probes on every endpoint whose first Code node throws on `{}` (n8n answers any unhandled node error with an empty 200).

Deploy (Task 10 Step 3): `main` fast-forwarded to 47a997f and pushed; Netlify bundle `main.800ec3b3.js` live.

## Wave results (recorded 2026-09-06)

| wave | commit | backup dir | gate | notes |
|---|---|---|---|---|
| 1 (16 reads) | 8c8a326 | `.n8n-backups/2026-09-06T02-55-55-752Z` | `--wave 1`: 44 passed / 1 failed (the wave-2 `save_coupon_matches` probe, later made soft) | auth on 8 reads; aggregate pattern on chat_history, choose_recipe_instructions, fetch_heb_coupons; `grab_instructions_fast` Merge Results guard; `Respond 500` on all 16 (Ruling 7); `match_coupons` agent bypass (Ruling 5) |
| 2 (18 mutations) | 365596d | `.n8n-backups/2026-09-06T03-12-19-099Z` | `--wave 2`: 63 / 0 / 21 | auth on 12; `Respond 500` on 18; `app_feedback.client_id` + unique index + `INSERT IGNORE`; `save_coupon_matches` Switch rules rewritten; `update_feedback_status` unswallowed; AI pattern on `meal_creator_propose`/`call_grocery_agent` |
| 2b (outage guards) | d4cad5d → f3b00ed → bc506ce | `.n8n-backups/2026-09-06T03-41-19-257Z`, `…T04-08-32-216Z`, `…T04-44-07-407Z` | `--wave 2`: 63 / 0 / 21; `--fault`: 4 / 4 (503) | Ruling 19/20: 37 `DB ok?` guards on 31 workflows, `alwaysOutputData` dropped on 12 mutation nodes; two fix rounds (Code-fed pass-through; placeholder short-circuit) |
| 3 (AI/orchestration) | ec128ee | see task-13 report | `--wave 3`: 70 / 0 / 14; `--fault`: 4 / 4 | auth on 5; Smart Deals reroute (cache write after response, LLM failure → 500); `smart_match` agent bypass; transcribe swallower kept (Ruling 12); `grocery_prep` guard on `Init Job` (strict, Ruling 21) |

Live UI after each wave (headless Chromium): Plan add/remove one-off, Shop check-off persists, Cook empty state, Feedback open/close, Deals renders (7 deals after wave 3), 0 keyless n8n requests.

---

## Self-review against the spec

- §1 Authentication: Tasks 11–13 (auth on all 25), Task 7 (both outside callers), Task 1 (`forbidden` mapping + toast copy). ✔
- §2a Client: Task 1 (`ApiError`, `apiJson`, retries by method, `showApiError`), Tasks 2–5 (migration incl. `grocery_prep` ok-check, `SessionManager` removal, hand-reviewed ChatBot/MealCreator), Task 5 Step 2 (explicit `retries: 0` audit). Addition beyond the spec's list: the raw transcribe `fetch` (Task 4) — required or wave 3 breaks voice check-off. ✔
- §2b Server: Task 10 (step zero), Task 12/13 (swallowers, `Respond 500` on MySQL/Postgres/HTTP/Code only, branch audit, `grocery_prep` limited to two nodes, `save_coupon_matches` keeps 400), Task 11 (read branch audit). Refinement: the `Respond 500` body sanitises the message (spec's expression would leak `host.docker.internal` on connection errors and SQL fragments in syntax errors, failing the spec's own leak assertion). ✔
- §3 Idempotency: Task 6 (client), Task 12 Step 2 (migration + `INSERT IGNORE`). No WGL/progress insert changed. ✔
- §4 Verification: Task 8 (tiers, `Origin`, leak assertions, unregistered detection), Task 1/2/4/6 unit tests, Task 10/12 fault injection, live checks after each wave. Deviation: `submit_feedback` still gets the harmless no-key 403 check; with-key is skipped with a printed reason. ✔
- §5 Rollout order: Tasks 1–6 → 7 → 8–9 → 10 (deploy + step zero) → 11 → 12 → 13 → 14. ✔
- Type consistency: `apiJson(url, options)` and `ApiError.code` values are used identically in Tasks 2–6; `postJson(path, body)` in Task 7; tool commands in Tasks 11–13 match Task 9's CLI (including `--nodes-json`).
