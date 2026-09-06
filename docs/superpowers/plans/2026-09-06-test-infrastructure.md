# Test infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A checked-in Playwright e2e suite (hermetic mobile + desktop projects, a separate live smoke project), component tests for Deals, InStoreMode, HebCart and ChatBot, a clean lint/test gate, and a GitHub Actions workflow that runs all of it without secrets.

**Architecture:** `@playwright/test` drives the CRA dev server started with unresolvable backend hosts; a `backend` fixture answers every n8n and clip-server request from checked-in JSON fixtures (recorded once from live and sanitised) and records what the UI sent. Component tests use a shared `installMockFetch` helper (never `jest.mock` of `apiFetch`). CI runs lint → Jest → hermetic e2e on every push and PR.

**Tech Stack:** React 19 / react-scripts 5 (Jest 27, jsdom 16, Testing Library), `@playwright/test` 1.63.0 (Chromium), Node 22, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-06-test-infrastructure-design.md` (approved 2026-09-06). Read its "Current state" and "Design" sections first.

Branch: `feat/test-infrastructure` off `main` (150f91b or later). Ledger: `.superpowers/sdd/2026-09-06-test-infrastructure/progress.md` (created by the SDD skill); mirror task-complete lines into `.superpowers/sdd/progress.md`.

## Global Constraints

- **No real backend from the hermetic suite, ever.** The dev server for the `mobile`/`desktop` projects runs with `REACT_APP_API_BASE_URL=http://n8n.test/webhook`, `REACT_APP_CLIP_SERVER_URL=http://clip.test`, `REACT_APP_API_KEY=e2e-key`. Only the `live` project and the recorder read `.env`. Never commit `.env` values; never print the key.
- **Fixed fixture week:** `week_start_date` `2026-09-06`, end `2026-09-12`, display string `For the week of September 6th to September 12th, 2026`; the browser clock is frozen at `2026-09-09T10:00:00` local (a Wednesday) in every hermetic test. Exported from `e2e/support/week.js`; the recorder rewrites live week strings to these.
- **Selectors:** roles and accessible names first (`getByRole('button', { name })`), `getByPlaceholder` for inputs, `getByText` scoped to `main` on mobile (the hidden desktop sidebar duplicates labels). No CSS class selectors. Confirm dialogs are accepted with `page.on('dialog', d => d.accept())` registered before the click.
- **Live suite residue:** the live specs remove what they add through the app's endpoints and print the two SQL cleanup lines; run them via `PW=$(grep '^DB_PASSWORD=' "/c/New Grocery App/heb-coupon-scraper/.env" | cut -d= -f2- | tr -d '\r'); docker exec -e MYSQL_PWD="$PW" hsa-mysql mysql -u hsa_user hsa -e "…"`. Never submit feedback, never open Deals with a stale cache in a live spec (it runs the LLM), never trigger Prep.
- **Jest tests mock `global.fetch`** (via `src/test-utils/mockFetch.js`), never `apiFetch`/`apiJson` — `apiJson` calls `apiFetch` by module-internal reference. Responses must provide `ok`, `status`, `text()`, `json()`. Tests must never reach the network: before committing, run the touched Jest files once with `REACT_APP_API_BASE_URL=http://127.0.0.1:9` in the environment.
- **Gates:** `npm run lint` (`eslint src --max-warnings=0`, zero problems after Task 11); `CI=true npx react-scripts test --watchAll=false` (27 suites / 213 tests at start; no `act()` warnings after Task 11); `npm run test:e2e` green in both projects; `CI=true npx react-scripts build` succeeds. Netlify config untouched.
- **New dependency:** only `@playwright/test@1.63.0` (devDependency, exact). Chromium via `npx playwright install chromium` locally; `--with-deps` in CI.
- **No component moves.** `InStoreMode.js` gains named exports `ModeMenu`, `InviteModal`, `PartnerBadge` only.
- **Commits:** one per task; message `test(e2e): …` / `test(components): …` / `chore(ci): …` / `chore(lint): …`, ending with a blank line then `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage by explicit path; never `git add -A`/`git add .` (untracked `*.png/*.json/*.yml` scratch files sit in the repo root). Add `playwright-report/`, `test-results/`, `e2e/.auth/` to `.gitignore`. Do not push until Task 12.
- **Shell:** Bash tool (Git Bash) from `C:\New Grocery App\grocery-checklist-app`. Windows: `npx playwright install chromium` downloads to `%LOCALAPPDATA%\ms-playwright`.

---

## File map

| Path | Change | Responsibility |
|---|---|---|
| `package.json` | modify | `@playwright/test` devDependency; scripts `lint`, `test:e2e`, `test:e2e:live`, `test:e2e:record`, `test:e2e:report` |
| `playwright.config.js` | create | projects `mobile`, `desktop`, `live`; `webServer`; reporters |
| `e2e/support/week.js` | create | fixed week constants |
| `e2e/support/mock-backend.js` | create | route interception, fixture lookup, call recording, overrides, clip states |
| `e2e/support/test.js` | create | `test`/`expect` with the `backend` fixture and frozen clock |
| `e2e/support/record-fixtures.mjs` | create | live recorder + sanitiser |
| `e2e/support/live-env.js` | create | reads `.env` for the live project |
| `e2e/fixtures/n8n/*.json`, `e2e/fixtures/clip/*.json` | create | recorded/sanitised and hand-written responses |
| `e2e/routing.spec.js`, `plan.spec.js`, `deals.spec.js`, `shop.spec.js`, `cart.spec.js`, `feedback.spec.js`, `cook.spec.js` | create | hermetic flows |
| `e2e/live/plan.live.spec.js`, `shop.live.spec.js`, `feedback.live.spec.js` | create | live smoke |
| `e2e/README.md` | create | how to run, record, clean up |
| `src/test-utils/mockFetch.js`, `src/test-utils/render.js` | create | Jest fetch mock + provider wrapper |
| `src/components/Deals.test.js`, `ChatBot.test.js`, `HebCart.test.js`, `InStoreMode.ModeMenu.test.js`, `InStoreMode.InviteModal.test.js`, `InStoreMode.PartnerBadge.test.js`, `InStoreMode.checkoff.test.js` | create | component tests |
| `src/components/InStoreMode.js` | modify | named exports |
| `src/components/App.test.js`, `staples/ItemRow.test.js`, `hooks/useWeekStaples.test.js`, `FeedbackPanel.test.js` | modify | lint/act debt, entry-point tests |
| `.github/workflows/ci.yml` | create | CI |
| `.gitignore` | modify | report/result dirs |

---

### Task 1: Playwright harness, mock backend, hand fixtures, routing spec

**Files:**
- Create: `playwright.config.js`, `e2e/support/week.js`, `e2e/support/mock-backend.js`, `e2e/support/test.js`, `e2e/routing.spec.js`, `e2e/fixtures/n8n/{categories,fetch_grocery_items,fetch_weekly_meals,fetch_weekly_meal_ingredients,shopping_progress,smart_deals,fetch_heb_coupons,chat_history,choose_recipe_instructions,grocery_prep_status,fetch_feedback}.json`, `e2e/fixtures/clip/{health.expired,health.healthy,session-status.expired,session-status.healthy,weekly-items}.json`
- Modify: `package.json` (devDependency + scripts), `.gitignore`

**Interfaces:**
- Produces `e2e/support/week.js`: `WEEK = { startDate: '2026-09-06', endDate: '2026-09-12', displayRange: 'For the week of September 6th to September 12th, 2026', frozenClock: '2026-09-09T10:00:00' }`.
- Produces `e2e/support/test.js`: `export const test` (Playwright test with fixture `backend`) and `export const expect`.
- Produces `backend` API: `backend.calls(path) → [{ method, query, body }]`; `backend.set(path, { status = 200, body, times = 1 })`; `backend.clip('expired' | 'healthy')`; `backend.unmocked → [{ method, path }]`.
- Fixture lookup: n8n GET `<path>` → `e2e/fixtures/n8n/<path>.json`; POST mutations → built-in bodies (see code); clip `api/health` → `clip/health.<state>.json`, `api/heb/session/status` → `clip/session-status.<state>.json`, `api/heb/weekly-items` → `clip/weekly-items.json`, `api/heb/matches/all` → `{ matches: [] }`, `api/heb/frequent-cached` → `{ products: [] }`.

- [ ] **Step 1: Branch and dependency**

```bash
cd "/c/New Grocery App/grocery-checklist-app" && git checkout -b feat/test-infrastructure
npm install --save-dev --save-exact @playwright/test@1.63.0
npx playwright install chromium
printf '\n# Playwright\nplaywright-report/\ntest-results/\ne2e/.auth/\n' >> .gitignore
```

Add to `package.json` `scripts`:

```json
"lint": "eslint src --max-warnings=0",
"test:e2e": "playwright test --project mobile --project desktop",
"test:e2e:live": "playwright test --project live",
"test:e2e:record": "node e2e/support/record-fixtures.mjs",
"test:e2e:report": "playwright show-report"
```

- [ ] **Step 2: Week constants and config**

`e2e/support/week.js`:

```js
// Every hermetic test runs with the browser clock frozen inside this week, and
// every fixture is rewritten to it by the recorder, so the app's week logic
// (Thursday+ rolls forward) always resolves to these values.
export const WEEK = {
  startDate: '2026-09-06',
  endDate: '2026-09-12',
  displayRange: 'For the week of September 6th to September 12th, 2026',
  frozenClock: '2026-09-09T10:00:00',
};
```

`playwright.config.js`:

```js
// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const MOCK_ENV = {
  BROWSER: 'none',
  CI: 'true',
  PORT: '3000',
  REACT_APP_API_BASE_URL: 'http://n8n.test/webhook',
  REACT_APP_CLIP_SERVER_URL: 'http://clip.test',
  REACT_APP_API_KEY: 'e2e-key',
};

const isLive = process.argv.some((a) => a === 'live' || a === '--project=live');
const liveEnv = isLive ? require('./e2e/support/live-env.js').readLiveEnv() : null;

module.exports = defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npx react-scripts start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
    env: liveEnv ? { ...MOCK_ENV, ...liveEnv } : MOCK_ENV,
  },
  projects: [
    { name: 'mobile', testIgnore: /live\//, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...devices['Desktop Chrome'], defaultBrowserType: 'chromium' } },
    { name: 'desktop', testIgnore: /live\//, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'live', testMatch: /live\/.*\.spec\.js/, retries: 0, workers: 1, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
```

(`devices['Desktop Chrome']` spread comes before the viewport override in `mobile` so the 390×844 viewport wins; keep that order.) `e2e/support/live-env.js` is written in Task 7; for this task create it as:

```js
// Reads the real backend settings for the `live` project. Refuses without a key.
const fs = require('fs');
function readLiveEnv() {
  const text = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
  const get = (k) => ((text.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^['"]|['"]$/g, '');
  const key = get('REACT_APP_API_KEY');
  if (!key) throw new Error('live project: REACT_APP_API_KEY missing from .env');
  return {
    REACT_APP_API_KEY: key,
    REACT_APP_API_BASE_URL: get('REACT_APP_API_BASE_URL') || 'https://n8n-grocery.needexcelexpert.com/webhook',
    REACT_APP_CLIP_SERVER_URL: get('REACT_APP_CLIP_SERVER_URL') || 'https://clip.needexcelexpert.com',
  };
}
module.exports = { readLiveEnv };
```

- [ ] **Step 3: Mock backend**

`e2e/support/mock-backend.js`:

```js
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

let oneoffCounter = 900000;

// Mutations the app performs; bodies mirror the real Respond nodes.
function mutationBody(p, body) {
  switch (p) {
    case 'add_oneoff_item':
      oneoffCounter += 1;
      return { success: true, itemId: oneoffCounter, message: `${body.itemName} added as one-off item` };
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

class MockBackend {
  constructor(page) {
    this.page = page;
    this.records = new Map();   // path -> [{method, query, body}]
    this.overrides = new Map(); // path -> [{status, body, headers}]
    this.unmocked = [];
    this.clipState = 'expired';
    this.keyErrors = [];
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
      const body = mutationBody(p, request.postDataJSON ? (() => { try { return request.postDataJSON(); } catch { return {}; } })() : {});
      if (body !== undefined) return this.fulfil(route, 200, body);
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
```

`e2e/support/test.js`:

```js
const base = require('@playwright/test');
const { MockBackend } = require('./mock-backend.js');
const { WEEK } = require('./week.js');

const test = base.test.extend({
  backend: async ({ page }, use) => {
    await page.clock.install({ time: new Date(WEEK.frozenClock) });
    const backend = new MockBackend(page);
    await backend.install();
    await use(backend);
    base.expect(backend.keyErrors, 'n8n requests without X-API-Key').toEqual([]);
    base.expect(backend.unmocked, 'unmocked backend requests').toEqual([]);
  },
});

// Navigate through about:blank so every visit is a real load (hash-only
// changes do not re-run the app's mount effects).
async function open(page, route) {
  await page.goto('about:blank');
  await page.goto(`/#${route}`);
  await page.waitForLoadState('networkidle');
}

module.exports = { test, expect: base.expect, open, WEEK };
```

- [ ] **Step 4: Hand-written fixtures (replaced by the recorder in Task 2)**

Create each file with a top-level `_recorded: { at: 'hand-written', endpoint: '<path>', sanitised: true }` for object fixtures; array fixtures have no `_recorded`. Minimal contents:

- `n8n/categories.json`: `[{"id":1,"name":"Fruit & vegetables","walk_order":1},{"id":2,"name":"Bakery & bread","walk_order":2},{"id":5,"name":"Dairy & eggs","walk_order":5},{"id":14,"name":"Household & other","walk_order":14},{"id":15,"name":"One-off items","walk_order":15}]`
- `n8n/fetch_grocery_items.json`: three staples and one one-off, each `{ "ItemID", "ItemName", "Category", "Store": "HEB", "GroceryStoreSection": null, "Type": "Basic", "IsActive": 1, "DataSource": "Staples", "QuantitySelected": 1, "IsSelected": 1|0, "store_location": "Aisle 3"|null }`: `{ItemID: 23, ItemName: 'Bread', Category: 'Bakery & bread', IsSelected: 1, store_location: 'Bakery, Back'}`, `{ItemID: 14, ItemName: 'Grapes', Category: 'Fruit & vegetables', IsSelected: 1, store_location: 'Produce'}`, `{ItemID: 31, ItemName: 'Milk', Category: 'Dairy & eggs', IsSelected: 0, store_location: 'Dairy, Back'}`, `{ItemID: 100001, ItemName: 'Candles', Category: 'Household & other', DataSource: 'OneOff', Type: 'OneOff', IsSelected: 1, store_location: null}`.
- `n8n/fetch_weekly_meals.json`: `[]`. `n8n/fetch_weekly_meal_ingredients.json`: `[]`. `n8n/chat_history.json`: `[]`. `n8n/choose_recipe_instructions.json`: `[]`. `n8n/fetch_feedback.json`: `[]`.
- `n8n/shopping_progress.json`: `[{"item_id":14,"checked_at":"2026-09-08 18:02:11"}]` (Grapes already checked).
- `n8n/grocery_prep_status.json`: `{"_recorded":{…},"error":"not_found"}`.
- `n8n/smart_deals.json`: `[{"deals":[{"frequentProduct":{"id":"1001","name":"Pillsbury Crescent Rolls","brand":"Pillsbury","category":"Bakery & bread","price":3.12},"coupon":{"hashId":"h1","productName":"Pillsbury Original Crescent Dinner Rolls","discount":"$1 off 2","savingsAmount":1,"expirationDate":"2026-09-30","clippedStatus":0,"imageUrl":null},"confidence":"high","reason":"Same product"},{"frequentProduct":{"id":"1002","name":"Danimals Smoothies","brand":"Danimals","category":"Dairy & eggs","price":4.5},"coupon":{"hashId":"h2","productName":"Danimals Smoothies 12 pk","discount":"$1 off","savingsAmount":1,"expirationDate":"2026-09-30","clippedStatus":1,"imageUrl":null},"confidence":"medium","reason":"Same brand"}],"totalDeals":2,"totalSavings":2,"cached":true}]`
- `n8n/fetch_heb_coupons.json`: two coupons `{ "hash_id", "product_name", "description", "image_url": null, "coupon_type": "digital", "discount", "savings_amount", "expiration_date": "2026-09-30", "clipped_status": 0|1 }` (`h1` unclipped, `h2` clipped).
- `clip/health.expired.json`: `{"ok":true,"sessionValid":false,"sessionAuthenticated":false,"sessionAgeHours":40}`; `clip/health.healthy.json`: `{"ok":true,"sessionValid":true,"sessionAuthenticated":true,"sessionAgeHours":2}`.
- `clip/session-status.expired.json`: `{"active":false,"loginSessionValid":false}`; `clip/session-status.healthy.json`: `{"active":false,"loginSessionValid":true,"idleSeconds":0}`.
- `clip/weekly-items.json`: `{"items":[{"ItemID":23,"ItemName":"Bread","couponDiscount":null},{"ItemID":14,"ItemName":"Grapes","couponDiscount":"$0.50 off","couponSavings":0.5,"couponClipped":1,"couponProductName":"Seedless Grapes"}]}`

If a screen renders a field the fixture lacks, add the field to the fixture (keep the real shape from the live workflow's Respond node); note it in the report.

- [ ] **Step 5: Routing spec (failing first — the harness does not exist until Steps 2–4 are in place)**

`e2e/routing.spec.js`:

```js
const { test, expect, open } = require('./support/test.js');

// Labels come from the `navigation` array in src/components/App.js (read it once).
const SCREENS = [
  ['home', 'Grocery Planner'],
  ['plan', 'Grocery Staples'],
  ['deals', 'Deals & Coupons'],
  ['cart', 'HEB Cart Builder'],
  ['cook', 'Cook'],
];

test.describe('routing', () => {
  for (const [route, heading] of SCREENS) {
    test(`#${route} renders "${heading}"`, async ({ page, backend }) => {
      await open(page, route);
      await expect(page.locator('main, body').first().getByText(heading, { exact: false }).first()).toBeVisible();
    });
  }

  test('#shop renders the in-store checklist', async ({ page, backend }) => {
    await open(page, 'shop');
    await expect(page.getByText(/items? left|All done!/)).toBeVisible();
    expect(backend.calls('fetch_grocery_items').length).toBeGreaterThan(0);
  });

  test('legacy #grocery redirects to #plan', async ({ page, backend }) => {
    await open(page, 'grocery');
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#plan');
  });

  test('unknown hash goes home', async ({ page, backend }) => {
    await open(page, 'nonsense');
    await expect(page.getByText('Grocery Planner').first()).toBeVisible();
  });

  test('changing the hash in an open tab switches screens and back returns', async ({ page, backend }) => {
    await open(page, 'home');
    await page.evaluate(() => { window.location.hash = '#deals'; });
    await expect(page.getByText('Deals & Coupons').first()).toBeVisible();
    await page.goBack();
    await expect(page.getByText('Grocery Planner').first()).toBeVisible();
  });
});
```

- [ ] **Step 6: Run the suite**

Run: `npm run test:e2e`
Expected: the dev server boots (first run ≈ 60–90 s), 12 tests pass across `mobile` and `desktop`. If the `#shop` test fails on an unmocked clip path, add that path to `handleClip` (the spec's list) rather than to the test. If `page.clock.install` breaks React's dev-server HMR socket (symptom: page never reaches `networkidle`), replace `waitForLoadState('networkidle')` in `open()` with `await page.getByRole('main').waitFor()` plus `await page.waitForTimeout(500)` and note it in the report.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json playwright.config.js .gitignore e2e/support e2e/fixtures e2e/routing.spec.js
git commit -m "test(e2e): Playwright harness with mocked backend, frozen week, routing spec

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Fixture recorder and README

**Files:**
- Create: `e2e/support/record-fixtures.mjs`, `e2e/README.md`
- Modify: `e2e/fixtures/n8n/*.json` (overwritten by the recorder), `e2e/fixtures/clip/weekly-items.json`

**Interfaces:**
- Consumes `WEEK` from `e2e/support/week.js` (ESM import of a CommonJS file: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const { WEEK } = require('./week.js');`).
- Produces the fixture files Task 1's mock backend reads; every object fixture carries `_recorded`.

- [ ] **Step 1: Recorder**

`e2e/support/record-fixtures.mjs`:

```js
#!/usr/bin/env node
// Records read endpoints from the live backend, sanitises them, rewrites the
// live week to the fixed fixture week, and writes e2e/fixtures/**. Sends only
// GETs and the documented safe bodies. Usage: npm run test:e2e:record
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { WEEK } = require('./week.js');

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const KEY = env.REACT_APP_API_KEY; if (!KEY) { console.error('REACT_APP_API_KEY missing from .env'); process.exit(1); }
const N8N = env.REACT_APP_API_BASE_URL || 'https://n8n-grocery.needexcelexpert.com/webhook';
const CLIP = env.REACT_APP_CLIP_SERVER_URL || 'https://clip.needexcelexpert.com';

// Live week, computed the way src/utils/weekDates.js does (Thursday+ rolls forward).
function liveWeek() {
  const today = new Date(); const day = today.getDay();
  const sunday = new Date(today); sunday.setDate(today.getDate() - day + (day >= 4 ? 7 : 0));
  const saturday = new Date(sunday); saturday.setDate(sunday.getDate() + 6);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ord = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const long = (d) => `${d.toLocaleString('en-US', { month: 'long' })} ${ord(d.getDate())}`;
  return { startDate: iso(sunday), endDate: iso(saturday), displayRange: `For the week of ${long(sunday)} to ${long(saturday)}, ${sunday.getFullYear()}` };
}
const LIVE = liveWeek();

async function get(base, path, query = {}, key = true) {
  const url = new URL(`${base}/${path}`); for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: 'application/json', Origin: 'https://grocery-checklist-app.netlify.app', ...(key ? { 'X-API-Key': KEY } : {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return text.trim() ? JSON.parse(text) : [];
}

const DROP = new Set(['screenshots', 'metadata', 'user_agent', 'host_user_id']);
function sanitise(value) {
  if (Array.isArray(value)) return value.slice(0, 40).map(sanitise);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !DROP.has(k)).map(([k, v]) => [k, sanitise(v)]));
  if (typeof value === 'string') return value.split(LIVE.displayRange).join(WEEK.displayRange).split(LIVE.startDate).join(WEEK.startDate).split(LIVE.endDate).join(WEEK.endDate);
  return value;
}

function write(rel, data, endpoint) {
  const out = Array.isArray(data) ? data : { _recorded: { at: new Date().toISOString(), endpoint, sanitised: true }, ...data };
  mkdirSync(`e2e/fixtures/${rel.split('/')[0]}`, { recursive: true });
  writeFileSync(`e2e/fixtures/${rel}`, JSON.stringify(out, null, 1) + '\n');
  console.log('wrote', rel, Array.isArray(out) ? `${out.length} items` : 'object');
}

const READS = [
  ['categories', {}],
  ['fetch_grocery_items', { weekStartDate: LIVE.startDate, weekEndDate: LIVE.endDate, weekDateRange: LIVE.displayRange }],
  ['fetch_weekly_meals', { weekDateRange: LIVE.displayRange }],
  ['fetch_weekly_meal_ingredients', { weekDateRange: LIVE.displayRange }],
  ['shopping_progress', { week_date_range: LIVE.displayRange, week_start_date: LIVE.startDate }],
  ['fetch_heb_coupons', {}],
  ['choose_recipe_instructions', { weekDateRange: LIVE.displayRange }],
  ['chat_history', { sessionId: '__e2e_record__' }],
  ['grocery_prep_status', { jobId: '__e2e_record__' }],
];

(async () => {
  for (const [p, q] of READS) write(`n8n/${p}.json`, sanitise(await get(N8N, p, q)), p);
  write('n8n/fetch_feedback.json', [], 'fetch_feedback');
  const meals = JSON.parse(readFileSync('e2e/fixtures/n8n/fetch_weekly_meals.json', 'utf8'));
  if (Array.isArray(meals) && meals.length) write('n8n/grab_instructions_fast.json', sanitise(await get(N8N, 'grab_instructions_fast', { weekDateRange: LIVE.displayRange, recipe_id: String(meals[0].recipe_id) })), 'grab_instructions_fast');
  write('clip/weekly-items.json', sanitise(await get(CLIP, 'api/heb/weekly-items', { weekDateRange: LIVE.displayRange }, false)), 'api/heb/weekly-items');
  const items = JSON.parse(readFileSync('e2e/fixtures/n8n/fetch_grocery_items.json', 'utf8'));
  if (!JSON.stringify(items).includes(WEEK.displayRange) && !JSON.stringify(items).includes(WEEK.startDate)) console.warn('warning: fetch_grocery_items carries no week string (fine if the endpoint omits it)');
  console.log('done — smart_deals.json and clip/health*/session-status* are hand-maintained');
})().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Record and re-run the suite**

Run: `npm run test:e2e:record` (sends only GETs plus no bodies; `fetch_heb_coupons` and `fetch_grocery_items` are the large ones). Inspect `e2e/fixtures/n8n/fetch_grocery_items.json`: at least one staple with `IsSelected: 1`, and one `DataSource: "OneOff"` row (if none exists live, append the hand-written `Candles` row from Task 1 so the one-off flows have data; note it in the report). Then `npm run test:e2e` → all routing tests pass with the recorded data.

- [ ] **Step 3: README**

`e2e/README.md` (≤ 40 lines): how to run each script; the three projects; the fixed week and frozen clock; when to re-record (a workflow's response shape changes) and that the recorder only sends GETs; the hand-maintained fixtures (`smart_deals.json`, `clip/health.*`, `clip/session-status.*`); the live project's residue lines (`DELETE FROM oneoff_items WHERE name='__e2e_live__';`) and the `docker exec` command from Global Constraints; the "unmocked request fails the test" rule.

- [ ] **Step 4: Commit**

```bash
git add e2e/support/record-fixtures.mjs e2e/README.md e2e/fixtures
git commit -m "test(e2e): fixture recorder with sanitising and week rewrite; README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Plan and Deals specs

**Files:**
- Create: `e2e/plan.spec.js`, `e2e/deals.spec.js`

**Interfaces:** consumes `test`, `expect`, `open`, `WEEK`, `backend` from Task 1.

- [ ] **Step 1: Plan spec**

`e2e/plan.spec.js`:

```js
const { test, expect, open, WEEK } = require('./support/test.js');

const main = (page) => page.locator('main');

test.describe('Plan', () => {
  test('renders staples from the fixture grouped by category', async ({ page, backend }) => {
    await open(page, 'plan');
    await expect(main(page).getByText('Grocery Staples')).toBeVisible();
    await expect(main(page).getByText('Bakery & bread')).toBeVisible();
    await expect(main(page).getByRole('checkbox', { name: /Bread/ })).toBeChecked();
    await expect(main(page).getByRole('checkbox', { name: /Milk/ })).not.toBeChecked();
    const q = backend.calls('fetch_grocery_items')[0].query;
    expect(q.weekDateRange).toBe(WEEK.displayRange);
    expect(q.weekStartDate).toBe(WEEK.startDate);
  });

  test('toggling a staple posts selection_check with the full row', async ({ page, backend }) => {
    await open(page, 'plan');
    await main(page).getByRole('checkbox', { name: /Milk/ }).click();
    await expect.poll(() => backend.calls('selection_check').length).toBe(1);
    const body = backend.calls('selection_check')[0].body;
    expect(body).toMatchObject({ itemName: 'Milk', category: 'Dairy & eggs', weekDateRange: WEEK.displayRange, weekStartDate: WEEK.startDate, quantity: 1 });
    expect(typeof body.itemId).toBe('number');
    await expect(main(page).getByRole('checkbox', { name: /Milk/ })).toBeChecked();
  });

  test('a 500 on selection_check rolls the checkbox back and shows the server message', async ({ page, backend }) => {
    await open(page, 'plan');
    backend.set('selection_check', { status: 500, body: { success: false, error: 'Workflow error' } });
    await main(page).getByRole('checkbox', { name: /Milk/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Workflow error' })).toBeVisible();
    await expect(main(page).getByRole('checkbox', { name: /Milk/ })).not.toBeChecked();
  });

  test('quick-add posts add_oneoff_item and the item appears under One-offs', async ({ page, backend }) => {
    await open(page, 'plan');
    await main(page).getByPlaceholder('Quick add one-off item…').fill('__e2e__');
    await main(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(main(page).getByRole('button', { name: 'Remove one-off __e2e__' })).toBeVisible();
    expect(backend.calls('add_oneoff_item')[0].body).toEqual({ itemName: '__e2e__', weekDateRange: WEEK.displayRange });
  });

  test('an empty 200 on add shows the empty-response toast and adds nothing', async ({ page, backend }) => {
    await open(page, 'plan');
    backend.set('add_oneoff_item', { status: 200, body: '' });
    await main(page).getByPlaceholder('Quick add one-off item…').fill('__ghost__');
    await main(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'The server sent an empty response' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Remove one-off __ghost__' })).toHaveCount(0);
  });

  test('remove posts remove_weekly_item and the item disappears', async ({ page, backend }) => {
    page.on('dialog', (d) => d.accept());
    await open(page, 'plan');
    const oneoff = main(page).getByRole('button', { name: /^Remove one-off / }).first();
    const name = (await oneoff.getAttribute('aria-label')).replace('Remove one-off ', '');
    await oneoff.click();
    await expect.poll(() => backend.calls('remove_weekly_item').length).toBe(1);
    expect(backend.calls('remove_weekly_item')[0].body).toMatchObject({ itemName: name, weekDateRange: WEEK.displayRange, weekStartDate: WEEK.startDate });
    await expect(main(page).getByRole('button', { name: `Remove one-off ${name}` })).toHaveCount(0);
  });
});
```

If the staple checkbox has no accessible name containing the item name, read `src/components/staples/ItemRow.js` and use `getByRole('checkbox', { name })` with the actual label pattern; do not switch to CSS selectors.

- [ ] **Step 2: Deals spec**

`e2e/deals.spec.js`:

```js
const { test, expect, open } = require('./support/test.js');

const main = (page) => page.locator('main');

test.describe('Deals', () => {
  test('renders smart deals and coupons from fixtures, expired banner by default', async ({ page, backend }) => {
    await open(page, 'deals');
    await expect(main(page).getByText('Deals & Coupons')).toBeVisible();
    await expect(main(page).getByText('HEB session expired')).toBeVisible();
    await expect(main(page).getByText('Pillsbury Original Crescent Dinner Rolls').first()).toBeVisible();
    expect(backend.calls('smart_deals')[0].method).toBe('POST');
    expect(backend.calls('fetch_heb_coupons').length).toBeGreaterThan(0);
  });

  test('no expired banner when the clip session is healthy', async ({ page, backend }) => {
    backend.clip('healthy');
    await open(page, 'deals');
    await expect(main(page).getByText('Deals & Coupons')).toBeVisible();
    await expect(main(page).getByText('HEB session expired')).toHaveCount(0);
  });

  test('Add to list posts add_oneoff_item once and settles on Added', async ({ page, backend }) => {
    await open(page, 'deals');
    await main(page).getByRole('button', { name: 'Add to list' }).first().click();
    await expect(main(page).getByText('Added').first()).toBeVisible();
    expect(backend.calls('add_oneoff_item').length).toBe(1);
    expect(backend.calls('add_oneoff_item')[0].body.itemName).toContain('Pillsbury');
  });

  test('a 500 on add shows the error state and a retry re-posts', async ({ page, backend }) => {
    await open(page, 'deals');
    backend.set('add_oneoff_item', { status: 500, body: { success: false, error: 'Workflow error' } });
    await main(page).getByRole('button', { name: 'Add to list' }).first().click();
    await expect(main(page).getByRole('button', { name: /Retry|Try again/ }).first()).toBeVisible();
    await main(page).getByRole('button', { name: /Retry|Try again/ }).first().click();
    await expect.poll(() => backend.calls('add_oneoff_item').length).toBe(2);
    await expect(main(page).getByText('Added').first()).toBeVisible();
  });
});
```

Read `src/components/Deals.js` around the `addingToList` state to confirm the exact retry label and the "exists" case; adjust the regex to the real label.

- [ ] **Step 3: Run and commit**

Run: `npx playwright test e2e/plan.spec.js e2e/deals.spec.js` → all pass in both projects.

```bash
git add e2e/plan.spec.js e2e/deals.spec.js
git commit -m "test(e2e): Plan and Deals flows incl. rollback, empty-200 and 500 paths

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Shop and Cart specs

**Files:**
- Create: `e2e/shop.spec.js`, `e2e/cart.spec.js`

- [ ] **Step 1: Shop spec**

`e2e/shop.spec.js`:

```js
const { test, expect, open, WEEK } = require('./support/test.js');

test.describe('Shop (In-Store Mode)', () => {
  test('renders items grouped by aisle with the remaining count', async ({ page, backend }) => {
    await open(page, 'shop');
    await expect(page.getByText(/\d+ items? left/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Bread/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Milk/ })).toBeVisible();
    expect(backend.calls('shopping_progress')[0].query.week_start_date).toBe(WEEK.startDate);
  });

  test('tapping an item posts shopping_progress_check and the count drops', async ({ page, backend }) => {
    await open(page, 'shop');
    const before = Number((await page.getByText(/\d+ items? left/).textContent()).match(/\d+/)[0]);
    await page.getByRole('button', { name: /^Bread/ }).click();
    await expect.poll(() => backend.calls('shopping_progress_check').length).toBe(1);
    expect(backend.calls('shopping_progress_check')[0].body).toEqual({ week_start_date: WEEK.startDate, item_id: 23 });
    await expect(page.getByText(new RegExp(`${before - 1} items? left|All done!`))).toBeVisible();
  });

  test('a failed check-off is retried by the next successful post', async ({ page, backend }) => {
    await open(page, 'shop');
    backend.set('shopping_progress_check', { status: 500, body: { success: false, error: 'Workflow error' } });
    await page.getByRole('button', { name: /^Bread/ }).click();
    await expect.poll(() => backend.calls('shopping_progress_check').length).toBe(1);
    await page.getByRole('button', { name: /^Milk/ }).click();
    // The pending-ops layer re-sends the failed op on the next drain.
    await expect.poll(() => backend.calls('shopping_progress_check').length, { timeout: 15000 }).toBeGreaterThanOrEqual(3);
    const ids = backend.calls('shopping_progress_check').map((c) => c.body.item_id);
    expect(ids.filter((id) => id === 23).length).toBeGreaterThanOrEqual(2);
  });

  test('the ⋯ menu opens Feedback', async ({ page, backend }) => {
    await open(page, 'shop');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Send feedback' }).click();
    await expect(page.getByText('Send Feedback')).toBeVisible();
  });

  test('Invite posts create_session exactly once and shows the code', async ({ page, backend }) => {
    await open(page, 'shop');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Invite partner' }).click();
    await expect(page.getByText('E2E1')).toBeVisible();
    expect(backend.calls('create_session')).toHaveLength(1);
    expect(backend.calls('create_session')[0].body).toEqual({ week_start_date: WEEK.startDate });
    await page.getByRole('button', { name: 'Close' }).click();
  });

  test('the voice button is present', async ({ page, backend }) => {
    await open(page, 'shop');
    await expect(page.getByRole('button', { name: 'Hold to voice-check item' })).toBeVisible();
  });
});
```

Read `src/components/InStoreMode.js` `drainPendingOps` / `sendProgressOp` (around lines 1160–1200) to confirm when a failed op is re-sent; if it only re-sends on reconnect/visibility rather than on the next tap, change the third test to trigger that event (`page.evaluate(() => window.dispatchEvent(new Event('online')))`) and keep the assertion.

- [ ] **Step 2: Cart spec**

`e2e/cart.spec.js`:

```js
const { test, expect, open } = require('./support/test.js');

test.describe('Cart', () => {
  test('expired login shows the sign-in panel and Check again re-polls', async ({ page, backend }) => {
    await open(page, 'cart');
    await expect(page.getByText('HEB sign-in needed')).toBeVisible();
    const before = backend.calls('api/heb/session/status').length;
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect.poll(() => backend.calls('api/heb/session/status').length).toBeGreaterThan(before);
  });

  test('healthy login shows the Connect step', async ({ page, backend }) => {
    backend.clip('healthy');
    await open(page, 'cart');
    await expect(page.getByRole('button', { name: /Connect to HEB/ })).toBeVisible();
    await expect(page.getByText('HEB sign-in needed')).toHaveCount(0);
  });
});
```

- [ ] **Step 3: Run and commit**

Run: `npx playwright test e2e/shop.spec.js e2e/cart.spec.js` → pass in both projects.

```bash
git add e2e/shop.spec.js e2e/cart.spec.js
git commit -m "test(e2e): Shop check-off/retry/menu/invite and Cart connection states

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Feedback and Cook specs

**Files:**
- Create: `e2e/feedback.spec.js`, `e2e/cook.spec.js`

- [ ] **Step 1: Feedback spec**

`e2e/feedback.spec.js`:

```js
const { test, expect, open } = require('./support/test.js');

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function fillAndSubmit(page, text) {
  await page.getByRole('button', { name: 'Bug' }).click();
  await page.getByPlaceholder('What happened? What would make it better?').fill(text);
  await page.getByRole('button', { name: 'Submit Feedback' }).click();
}

test.describe('Feedback', () => {
  test('opens from the header icon (mobile) or the sidebar link (desktop)', async ({ page, backend }, testInfo) => {
    await open(page, 'home');
    await page.getByRole('button', { name: 'Send feedback' }).first().click();
    await expect(page.getByText('Send Feedback')).toBeVisible();
    await page.getByRole('button', { name: 'Close feedback' }).click();
    await expect(page.getByText('Send Feedback')).toHaveCount(0);
    expect(backend.calls('submit_feedback')).toHaveLength(0);
  });

  test('submit posts one submit_feedback with a v4 client_id', async ({ page, backend }) => {
    await open(page, 'home');
    await page.getByRole('button', { name: 'Send feedback' }).first().click();
    await fillAndSubmit(page, 'e2e report');
    await expect(page.getByRole('status').filter({ hasText: 'Feedback sent' })).toBeVisible();
    const calls = backend.calls('submit_feedback');
    expect(calls).toHaveLength(1);
    expect(calls[0].body.client_id).toMatch(V4);
    expect(calls[0].body).toMatchObject({ category: 'bug', description: 'e2e report', screen: 'home' });
  });

  test('a failed submit keeps the panel open and the retry reuses the client_id', async ({ page, backend }) => {
    await open(page, 'home');
    backend.set('submit_feedback', { status: 500, body: { success: false, error: 'Workflow error' } });
    await page.getByRole('button', { name: 'Send feedback' }).first().click();
    await fillAndSubmit(page, 'e2e retry');
    await expect(page.getByRole('status').filter({ hasText: 'Failed to send feedback' })).toBeVisible();
    await expect(page.getByText('Send Feedback')).toBeVisible();
    await page.getByRole('button', { name: 'Submit Feedback' }).click();
    await expect.poll(() => backend.calls('submit_feedback').length).toBe(2);
    const [a, b] = backend.calls('submit_feedback');
    expect(b.body.client_id).toBe(a.body.client_id);
  });

  test('a new report after success gets a new client_id', async ({ page, backend }) => {
    await open(page, 'home');
    await page.getByRole('button', { name: 'Send feedback' }).first().click();
    await fillAndSubmit(page, 'first');
    await expect(page.getByText('Send Feedback')).toHaveCount(0);
    await page.getByRole('button', { name: 'Send feedback' }).first().click();
    await fillAndSubmit(page, 'second');
    await expect.poll(() => backend.calls('submit_feedback').length).toBe(2);
    const [a, b] = backend.calls('submit_feedback');
    expect(b.body.client_id).not.toBe(a.body.client_id);
  });
});
```

The mobile header icon and the desktop sidebar link both carry `aria-label="Send feedback"`; `.first()` picks whichever is visible in the project's viewport (Playwright only clicks visible elements — if the hidden one is first in DOM order, use `page.getByRole('button', { name: 'Send feedback' }).locator('visible=true').first()`).

- [ ] **Step 2: Cook spec**

`e2e/cook.spec.js`:

```js
const { test, expect, open } = require('./support/test.js');

test.describe('Cook', () => {
  test('zero meals shows the empty state', async ({ page, backend }) => {
    backend.set('fetch_weekly_meals', { body: [], times: 3 });
    backend.set('choose_recipe_instructions', { body: [], times: 3 });
    await open(page, 'cook');
    await expect(page.locator('main').getByText('No meals planned yet')).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('with a planned meal the recipe list renders and selecting it requests instructions', async ({ page, backend }) => {
    const meal = { selection_id: 1, WeekDateRange: 'For the week of September 6th to September 12th, 2026', recipe_id: 3, notes: '', created_at: '2026-09-06 12:00:00', recipe_name: 'Chicken tacos', recipe_description: 'Weeknight tacos' };
    backend.set('fetch_weekly_meals', { body: [meal], times: 3 });
    backend.set('choose_recipe_instructions', { body: [meal], times: 3 });
    backend.set('grab_instructions_fast', { body: [{ output: [{ recipe_id: 3, step_number: 1, instruction_text: 'Cook the chicken', time_minutes: 10 }], all_ingredients: [{ recipe_id: 3, ingredient_name: 'Chicken thighs', quantity: 1, unit_name: 'lb' }] }], times: 2 });
    await open(page, 'cook');
    await page.locator('main').getByText('Chicken tacos').first().click();
    await expect.poll(() => backend.calls('grab_instructions_fast').length).toBeGreaterThan(0);
    await expect(page.locator('main').getByText('Cook the chicken')).toBeVisible();
  });
});
```

(`fetch_weekly_meals` is also requested by `App` on mount and by Home; `times: 3` covers those. If the fixture from Task 2 already contains meals, the first test's overrides still force the empty state.)

- [ ] **Step 3: Run and commit**

Run: `npx playwright test e2e/feedback.spec.js e2e/cook.spec.js` → pass.

```bash
git add e2e/feedback.spec.js e2e/cook.spec.js
git commit -m "test(e2e): Feedback client_id lifecycle and Cook empty/recipe states

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Full hermetic run in both projects, flake pass

**Files:** none new; fix any flaky spec found.

- [ ] **Step 1:** `npm run test:e2e` three times in a row. Expected: 3/3 green in `mobile` and `desktop` (≈ 26 tests × 2). For each flake: prefer `expect.poll`/auto-retrying assertions over `waitForTimeout`; scope locators to `main` on mobile; never widen timeouts beyond 15 s.
- [ ] **Step 2:** `npx playwright test --project desktop --reporter=line 2>&1 | tail -3` and record the wall-clock time in the report (target < 5 min total including server boot).
- [ ] **Step 3:** Commit any fixes: `test(e2e): stabilise flows` with the trailer. If nothing changed, note "no changes" in the ledger.

---

### Task 7: Live smoke suite

**Files:**
- Create: `e2e/live/plan.live.spec.js`, `e2e/live/shop.live.spec.js`, `e2e/live/feedback.live.spec.js`, `e2e/live/support.js`
- Modify: `e2e/README.md` (live section already described; add the exact commands)

**Interfaces:** the `live` project starts the app with `.env` values (Task 1 config). Specs use plain `@playwright/test` (no mock backend) plus `e2e/live/support.js`:

```js
const { test: base, expect } = require('@playwright/test');
const { readLiveEnv } = require('../support/live-env.js');
const env = readLiveEnv();
const test = base.extend({
  api: async ({ request }, use) => {
    await use({
      post: (p, body) => request.post(`${env.REACT_APP_API_BASE_URL}/${p}`, { headers: { 'X-API-Key': env.REACT_APP_API_KEY, Origin: 'https://grocery-checklist-app.netlify.app' }, data: body }),
    });
  },
});
async function open(page, route) { await page.goto('about:blank'); await page.goto(`/#${route}`); await page.waitForLoadState('networkidle'); }
module.exports = { test, expect, open, env };
```

- [ ] **Step 1: Plan live spec**

```js
const { test, expect, open } = require('./support.js');
const NAME = '__e2e_live__';
test.describe.configure({ mode: 'serial' });

test('add a one-off, see it, remove it, gone after reload', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await open(page, 'plan');
  const main = page.locator('main');
  const added = page.waitForResponse((r) => r.url().includes('/add_oneoff_item'));
  await main.getByPlaceholder('Quick add one-off item…').fill(NAME);
  await main.getByRole('button', { name: 'Add', exact: true }).click();
  const body = await (await added).json();
  expect(body.success).toBe(true);
  expect(typeof body.itemId).toBe('number');
  await expect(main.getByRole('button', { name: `Remove one-off ${NAME}` })).toBeVisible();
  await main.getByRole('button', { name: `Remove one-off ${NAME}` }).click();
  await expect(main.getByRole('button', { name: `Remove one-off ${NAME}` })).toHaveCount(0, { timeout: 15000 });
  await open(page, 'plan');
  await expect(main.getByRole('button', { name: `Remove one-off ${NAME}` })).toHaveCount(0);
  test.info().annotations.push({ type: 'cleanup', description: `DELETE FROM oneoff_items WHERE name='${NAME}';` });
});

test.afterAll(() => { console.log(`\nCLEANUP (docker exec): DELETE FROM oneoff_items WHERE name='${NAME}';`); });
```

- [ ] **Step 2: Shop live spec**

```js
const { test, expect, open, env } = require('./support.js');
test.describe.configure({ mode: 'serial' });

test('check an item, it persists, uncheck via the endpoint, it clears', async ({ page, api }) => {
  await open(page, 'shop');
  const left = async () => Number((await page.getByText(/(\d+) items? left|All done!/).textContent()).match(/\d+/)?.[0] ?? 0);
  const before = await left();
  test.skip(before === 0, 'nothing left to check this week');
  // Read the first unchecked item's id from the list the app loaded.
  const listRes = page.waitForResponse((r) => r.url().includes('/fetch_grocery_items'));
  await open(page, 'shop');
  const items = await (await listRes).json();
  const progress = await (await page.waitForResponse((r) => r.url().includes('/shopping_progress?'))).json();
  const checked = new Set(progress.map((r) => String(r.item_id)));
  const target = items.find((i) => i.IsSelected === 1 && !checked.has(String(i.ItemID)));
  test.skip(!target, 'no unchecked item');
  await page.getByRole('button', { name: new RegExp('^' + target.ItemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
  await expect.poll(left).toBe(before - 1);
  await open(page, 'shop');
  await expect.poll(left).toBe(before - 1);
  const weekStart = items[0].week_start_date || progress[0]?.week_start_date;
  const res = await api.post('shopping_progress_uncheck', { week_start_date: weekStart || new URL(page.url()).hash && undefined, item_id: target.ItemID });
  expect(res.ok()).toBeTruthy();
  await open(page, 'shop');
  await expect.poll(left).toBe(before);
});
```

`week_start_date` must be the real current week start: derive it in the spec from the `shopping_progress` request's query (`page.waitForRequest` on `/shopping_progress?` → `new URL(req.url()).searchParams.get('week_start_date')`) rather than from fixture rows; replace the `weekStart` line accordingly.

- [ ] **Step 3: Feedback live spec**

```js
const { test, expect, open } = require('./support.js');
test('feedback panel opens and closes; never submits', async ({ page }) => {
  await open(page, 'home');
  await page.getByRole('button', { name: 'Send feedback' }).first().click();
  await expect(page.getByText('Send Feedback')).toBeVisible();
  await page.getByRole('button', { name: 'Close feedback' }).click();
  await expect(page.getByText('Send Feedback')).toHaveCount(0);
});
```

- [ ] **Step 4: Run once, clean up, commit**

Run: `npm run test:e2e:live` (local dev server with the real key). Expected: 3 passed (or the Shop spec skipped with its reason). Then run the cleanup: `docker exec … -e "DELETE FROM oneoff_items WHERE name='__e2e_live__'; SELECT COUNT(*) FROM WeeklyGroceryList WHERE ItemName='__e2e_live__';"` → 0. If the Shop spec checked an item, confirm `shopping_progress` no longer has it (the spec unchecked it).

```bash
git add e2e/live e2e/README.md
git commit -m "test(e2e): live smoke suite (Plan add/remove, Shop check/uncheck, Feedback open/close)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Jest helpers + Deals and ChatBot component tests

**Files:**
- Create: `src/test-utils/mockFetch.js`, `src/test-utils/render.js`, `src/components/Deals.test.js`, `src/components/ChatBot.test.js`

**Interfaces:**
- `installMockFetch(map)`: `map` is `{ '<path substring>': body | { status, body } | (req) => body|{status,body} }`; returns `{ calls: () => [{ url, method, body }], for: (substr) => calls filtered }`; `restoreFetch()`. Unmatched URLs resolve `404 {error:'unmocked'}` and are listed by `unmocked()`.
- `renderWithProviders(ui)`: wraps in `ThemeProvider` and `FeedbackProvider` (from `src/contexts`), returns Testing Library's render result.

- [ ] **Step 1: Helpers**

`src/test-utils/mockFetch.js`:

```js
// Jest helper: mock global.fetch by URL substring. Responses provide ok/status/
// text()/json() so apiJson (which reads text()) and raw fetch callers both work.
const originalFetch = global.fetch;
let state = null;

function toResponse(entry, req) {
  const resolved = typeof entry === 'function' ? entry(req) : entry;
  const { status = 200, body = '' } = resolved && typeof resolved === 'object' && 'status' in resolved && 'body' in resolved ? resolved : { status: 200, body: resolved };
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: new Map(), text: () => Promise.resolve(text), json: () => Promise.resolve(JSON.parse(text)) };
}

export function installMockFetch(map) {
  state = { calls: [], unmocked: [] };
  global.fetch = jest.fn((url, init = {}) => {
    const u = String(url);
    let body = null;
    if (init.body && typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    const req = { url: u, method: init.method || 'GET', body };
    state.calls.push(req);
    const key = Object.keys(map).find((k) => u.includes(k));
    if (key === undefined) { state.unmocked.push(req); return Promise.resolve(toResponse({ status: 404, body: { error: 'unmocked' } }, req)); }
    return Promise.resolve(toResponse(map[key], req));
  });
  return {
    calls: () => state.calls,
    for: (substr) => state.calls.filter((c) => c.url.includes(substr)),
    unmocked: () => state.unmocked,
  };
}

export function restoreFetch() { global.fetch = originalFetch; state = null; }
```

`src/test-utils/render.js`:

```js
import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '../contexts/ThemeContext';
import { FeedbackProvider } from '../contexts/FeedbackContext';

export function renderWithProviders(ui, { currentScreen = 'test' } = {}) {
  return render(<ThemeProvider><FeedbackProvider currentScreen={currentScreen}>{ui}</FeedbackProvider></ThemeProvider>);
}
```

(Check `src/contexts/ThemeContext.js` for the provider's export name; adapt the import, never the pattern.)

- [ ] **Step 2: Deals test (failing first)**

`src/components/Deals.test.js`:

```js
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import Deals from './Deals';

const deal = (clipped) => ({ frequentProduct: { id: '1001', name: 'Pillsbury Crescent Rolls', brand: 'Pillsbury', category: 'Bakery & bread', price: 3.12 }, coupon: { hashId: 'h1', productName: 'Pillsbury Original Crescent Dinner Rolls', discount: '$1 off 2', savingsAmount: 1, expirationDate: '2099-01-01', clippedStatus: clipped, imageUrl: null }, confidence: 'high', reason: 'Same product' });
const coupons = [{ hash_id: 'h1', product_name: 'Pillsbury Original Crescent Dinner Rolls', description: 'Save', discount: '$1 off 2', savings_amount: 1, expiration_date: '2099-01-01', clipped_status: 0 }];

const base = () => ({
  '/smart_deals': [{ deals: [deal(0)], totalDeals: 1, totalSavings: 1 }],
  '/fetch_heb_coupons': coupons,
  '/fetch_grocery_items': [],
  '/api/health': { ok: true, sessionValid: false, sessionAuthenticated: false },
});

afterEach(restoreFetch);

test('renders deals and coupons and the expired banner', async () => {
  installMockFetch(base());
  renderWithProviders(<Deals onNavigate={() => {}} />);
  expect(await screen.findByText('Pillsbury Original Crescent Dinner Rolls')).toBeInTheDocument();
  expect(await screen.findByText('HEB session expired')).toBeInTheDocument();
});

test('healthy session hides the banner', async () => {
  installMockFetch({ ...base(), '/api/health': { ok: true, sessionValid: true, sessionAuthenticated: true, sessionAgeHours: 1 } });
  renderWithProviders(<Deals onNavigate={() => {}} />);
  await screen.findByText('Pillsbury Original Crescent Dinner Rolls');
  expect(screen.queryByText('HEB session expired')).not.toBeInTheDocument();
});

test('Add to list posts add_oneoff_item once and shows Added', async () => {
  const mock = installMockFetch({ ...base(), '/add_oneoff_item': { success: true, itemId: 5, message: 'ok' } });
  renderWithProviders(<Deals onNavigate={() => {}} />);
  await screen.findByText('Pillsbury Original Crescent Dinner Rolls');
  fireEvent.click(screen.getAllByRole('button', { name: /Add to list/ })[0]);
  expect(await screen.findByText('Added')).toBeInTheDocument();
  expect(mock.for('/add_oneoff_item')).toHaveLength(1);
  expect(mock.for('/add_oneoff_item')[0].body.itemName).toContain('Pillsbury');
});

test('a 500 on add shows the error state', async () => {
  installMockFetch({ ...base(), '/add_oneoff_item': { status: 500, body: { success: false, error: 'Workflow error' } } });
  renderWithProviders(<Deals onNavigate={() => {}} />);
  await screen.findByText('Pillsbury Original Crescent Dinner Rolls');
  fireEvent.click(screen.getAllByRole('button', { name: /Add to list/ })[0]);
  await waitFor(() => expect(screen.getByRole('button', { name: /Retry|Try again/ })).toBeInTheDocument());
});
```

Run: `CI=true npx react-scripts test --watchAll=false src/components/Deals.test.js` → expect failures only where the component's real labels differ; read `Deals.js` and align the selectors (the network paths above are the real ones).

- [ ] **Step 3: ChatBot test**

`src/components/ChatBot.test.js`:

```js
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import ChatBot from './ChatBot';

const props = () => ({ onBack: jest.fn(), onNavigate: jest.fn(), selectedMeals: [], setSelectedMeals: jest.fn(), refreshMeals: jest.fn(), groceryListData: null, setGroceryListData: jest.fn() });

afterEach(() => { restoreFetch(); localStorage.clear(); });

test('mount loads chat_history and treats an empty body as no history', async () => {
  const mock = installMockFetch({ '/chat_history': { status: 200, body: '' } });
  renderWithProviders(<ChatBot {...props()} />);
  await waitFor(() => expect(mock.for('/chat_history')).toHaveLength(1));
  expect(screen.getByLabelText('Type your message')).toBeInTheDocument();
});

test('a previous exchange in history is rendered', async () => {
  installMockFetch({ '/chat_history': [{ id: 1, session_id: 's', message: { type: 'human', content: 'tacos please' }, raw_content: null }, { id: 2, session_id: 's', message: { type: 'ai', content: 'Here are tacos' }, raw_content: null }] });
  renderWithProviders(<ChatBot {...props()} />);
  expect(await screen.findByText('tacos please')).toBeInTheDocument();
});

test('sending a message posts call_grocery_agent with retries 0 and renders the reply', async () => {
  const mock = installMockFetch({ '/chat_history': [], '/call_grocery_agent': [{ output: { message: 'How about tacos?', suggestedMeals: [] } }] });
  renderWithProviders(<ChatBot {...props()} />);
  fireEvent.change(screen.getByLabelText('Type your message'), { target: { value: 'dinner ideas' } });
  fireEvent.click(screen.getByLabelText('Send message'));
  expect(await screen.findByText(/How about tacos/)).toBeInTheDocument();
  expect(mock.for('/call_grocery_agent')).toHaveLength(1);
});

test('a 500 from the agent shows the fallback message, not a crash', async () => {
  installMockFetch({ '/chat_history': [], '/call_grocery_agent': { status: 500, body: { message: 'Error in workflow' } } });
  renderWithProviders(<ChatBot {...props()} />);
  fireEvent.change(screen.getByLabelText('Type your message'), { target: { value: 'x' } });
  fireEvent.click(screen.getByLabelText('Send message'));
  expect(await screen.findByText(/hit a snag/)).toBeInTheDocument();
});
```

Read `ChatBot.js` `sendMessage` (≈ lines 320–470) for the exact response shape it parses (`data.output` / `data[0].output`) and adjust the mocked agent body so the reply renders.

- [ ] **Step 4: Run, isolate, commit**

```bash
REACT_APP_API_BASE_URL=http://127.0.0.1:9 CI=true npx react-scripts test --watchAll=false src/components/Deals.test.js src/components/ChatBot.test.js
npx eslint src --max-warnings=0   # still exactly the 4 pre-existing problems (fixed in Task 11)
git add src/test-utils src/components/Deals.test.js src/components/ChatBot.test.js
git commit -m "test(components): mockFetch/render helpers; Deals and ChatBot flows and error paths

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: InStoreMode named exports and tests

**Files:**
- Modify: `src/components/InStoreMode.js` (export `ModeMenu`, `InviteModal`, `PartnerBadge`)
- Create: `src/components/InStoreMode.ModeMenu.test.js`, `InStoreMode.InviteModal.test.js`, `InStoreMode.PartnerBadge.test.js`, `InStoreMode.checkoff.test.js`

- [ ] **Step 1: Exports**

Change the three declarations (`const ModeMenu = …` ≈ line 795, `const InviteModal = …` ≈ 860, `const PartnerBadge = …` ≈ 998) to `export const …`. No other change. `CI=true npx react-scripts test --watchAll=false src/components/InStoreMode` still passes.

- [ ] **Step 2: ModeMenu test**

```js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeMenu } from './InStoreMode';

test('renders the three actions and calls their handlers', () => {
  const onReorder = jest.fn(), onInvite = jest.fn(), onFeedback = jest.fn(), onClose = jest.fn();
  render(<ModeMenu onReorder={onReorder} onInvite={onInvite} onFeedback={onFeedback} onClose={onClose} wakeLockActive={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reorder aisles' }));
  fireEvent.click(screen.getByRole('button', { name: 'Invite partner' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
  expect(onReorder).toHaveBeenCalledTimes(1);
  expect(onInvite).toHaveBeenCalledTimes(1);
  expect(onFeedback).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: InviteModal test**

```js
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { InviteModal } from './InStoreMode';

afterEach(restoreFetch);

test('posts create_session once on open and shows the code', async () => {
  const mock = installMockFetch({ '/create_session': { code: 'AB12', week_start_date: '2026-09-06', expires_at: '2026-09-06 14:00:00' } });
  render(<InviteModal weekStartDate="2026-09-06" onClose={() => {}} />);
  expect(await screen.findByText('AB12')).toBeInTheDocument();
  expect(mock.for('/create_session')).toHaveLength(1);
  expect(mock.for('/create_session')[0].body).toEqual({ week_start_date: '2026-09-06' });
});

test('a 500 shows an error and no code', async () => {
  installMockFetch({ '/create_session': { status: 500, body: { success: false, error: 'Workflow error' } } });
  render(<InviteModal weekStartDate="2026-09-06" onClose={() => {}} />);
  await waitFor(() => expect(screen.queryByText(/AB12/)).not.toBeInTheDocument());
  expect(await screen.findByText(/couldn.t|failed|error/i)).toBeInTheDocument();
});

test('Close calls onClose', () => {
  installMockFetch({ '/create_session': { code: 'AB12', week_start_date: '2026-09-06', expires_at: '' } });
  const onClose = jest.fn();
  render(<InviteModal weekStartDate="2026-09-06" onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});
```

Read `InviteModal` (≈ lines 860–990) for its error copy and adjust the regex in the second test.

- [ ] **Step 4: PartnerBadge test**

```js
import React from 'react';
import { render, screen } from '@testing-library/react';
import { PartnerBadge } from './InStoreMode';

test('labels host and partner roles', () => {
  const { rerender } = render(<PartnerBadge role="host" expiresAt="2026-09-06 14:00:00" />);
  expect(screen.getByText(/host/i)).toBeInTheDocument();
  rerender(<PartnerBadge role="partner" expiresAt="2026-09-06 14:00:00" />);
  expect(screen.getByText(/partner/i)).toBeInTheDocument();
});
```

- [ ] **Step 5: Check-off test through the default component**

```js
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import InStoreMode from './InStoreMode';

const items = [
  { ItemID: 23, ItemName: 'Bread', Category: 'Bakery & bread', Store: 'HEB', DataSource: 'Staples', IsSelected: 1, QuantitySelected: 1, store_location: 'Bakery, Back' },
  { ItemID: 31, ItemName: 'Milk', Category: 'Dairy & eggs', Store: 'HEB', DataSource: 'Staples', IsSelected: 1, QuantitySelected: 1, store_location: 'Dairy, Back' },
];
const base = () => ({
  '/fetch_grocery_items': items,
  '/shopping_progress?': [],
  '/shopping_progress_check': { success: true },
  '/shopping_progress_uncheck': { success: true },
  '/api/heb/weekly-items': { items: [] },
  '/categories': [{ id: 2, name: 'Bakery & bread', walk_order: 2 }, { id: 5, name: 'Dairy & eggs', walk_order: 5 }],
});

afterEach(() => { restoreFetch(); localStorage.clear(); sessionStorage.clear(); });

test('tapping an item posts shopping_progress_check and drops the count', async () => {
  const mock = installMockFetch(base());
  renderWithProviders(<InStoreMode inStoreData={null} onExit={() => {}} />);
  expect(await screen.findByText('2 items left')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Bread/ }));
  expect(await screen.findByText('1 item left')).toBeInTheDocument();
  await waitFor(() => expect(mock.for('/shopping_progress_check')).toHaveLength(1));
  expect(mock.for('/shopping_progress_check')[0].body).toMatchObject({ item_id: 23 });
});

test('a 500 keeps the optimistic state and marks the op failed for retry', async () => {
  const mock = installMockFetch({ ...base(), '/shopping_progress_check': { status: 500, body: { success: false, error: 'Workflow error' } } });
  renderWithProviders(<InStoreMode inStoreData={null} onExit={() => {}} />);
  await screen.findByText('2 items left');
  fireEvent.click(screen.getByRole('button', { name: /^Bread/ }));
  expect(await screen.findByText('1 item left')).toBeInTheDocument();
  await waitFor(() => expect(mock.for('/shopping_progress_check')).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: /^Milk/ }));
  await waitFor(() => expect(mock.for('/shopping_progress_check').length).toBeGreaterThanOrEqual(2));
});
```

Read the component's list-loading effect (≈ lines 1220–1300) for any other endpoint it calls on mount (e.g. `hebWeeklyItems`) and add it to `base()`; the test must end with `mock.unmocked()` empty — add `expect(mock.unmocked()).toEqual([])` at the end of each test.

- [ ] **Step 6: Run, isolate, commit**

```bash
REACT_APP_API_BASE_URL=http://127.0.0.1:9 CI=true npx react-scripts test --watchAll=false src/components/InStoreMode
git add src/components/InStoreMode.js src/components/InStoreMode.ModeMenu.test.js src/components/InStoreMode.InviteModal.test.js src/components/InStoreMode.PartnerBadge.test.js src/components/InStoreMode.checkoff.test.js
git commit -m "test(components): InStoreMode menu, invite, partner badge and check-off; export sub-components

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: HebCart component tests

**Files:**
- Create: `src/components/HebCart.test.js`

- [ ] **Step 1: Test**

```js
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import HebCart from './HebCart';

const expired = { active: false, loginSessionValid: false };
const healthy = { active: false, loginSessionValid: true, idleSeconds: 0 };
const weekly = { items: [{ ItemID: 1, ItemName: 'Bread' }, { ItemID: 2, ItemName: 'Milk' }, { ItemID: 3, ItemName: 'Eggs' }, { ItemID: 4, ItemName: 'Grapes' }, { ItemID: 5, ItemName: 'Beer' }, { ItemID: 6, ItemName: 'Rice' }] };

afterEach(restoreFetch);

test('expired login shows the sign-in panel; Check again re-polls and a healthy answer shows Connect', async () => {
  let status = expired;
  const mock = installMockFetch({ '/api/heb/session/status': () => status, '/api/heb/weekly-items': weekly, '/api/heb/matches/all': { matches: [] } });
  renderWithProviders(<HebCart onNavigate={() => {}} />);
  expect(await screen.findByText('HEB sign-in needed')).toBeInTheDocument();
  status = healthy;
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  expect(await screen.findByRole('button', { name: /Connect to HEB/ })).toBeInTheDocument();
  expect(mock.for('/api/heb/session/status').length).toBeGreaterThanOrEqual(2);
});

test('smart match continues after one failed batch', async () => {
  let smartCalls = 0;
  const mock = installMockFetch({
    '/api/heb/session/status': { active: true, loginSessionValid: true, idleSeconds: 0, sessionId: 's' },
    '/api/heb/weekly-items': weekly,
    '/api/heb/matches/all': { matches: [] },
    '/api/heb/frequent-cached': { products: [{ id: '9', name: 'Bread loaf', skuId: 'sku', price: 2 }] },
    '/smart_match_grocery': () => { smartCalls += 1; return smartCalls === 1 ? { status: 500, body: { success: false, error: 'Workflow error' } } : [{ matches: [] }]; },
    '/api/heb/search-batch': { results: {} },
    '/api/heb/matches': { success: true },
  });
  renderWithProviders(<HebCart onNavigate={() => {}} />);
  // Reach step 2 and start the match (read HebCart.js ~1250-1340 for the exact button label).
  fireEvent.click(await screen.findByRole('button', { name: /Match & Review|Start matching|Match items/ }));
  await waitFor(() => expect(mock.for('/smart_match_grocery').length).toBeGreaterThanOrEqual(2), { timeout: 10000 });
  expect(mock.unmocked()).toEqual([]);
});
```

`BATCH_SIZE` in `HebCart.js` decides how many items make two batches; read it and size `weekly.items` to at least `BATCH_SIZE + 1`. If the match button is only reachable after a connect step, drive that step first with the mocked `api/heb/session/start`.

- [ ] **Step 2: Run, isolate, commit**

```bash
REACT_APP_API_BASE_URL=http://127.0.0.1:9 CI=true npx react-scripts test --watchAll=false src/components/HebCart
git add src/components/HebCart.test.js
git commit -m "test(components): HebCart connection recheck and smart-match batch resilience

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Lint and act() debt, FeedbackPanel cleanup and entry-point tests

**Files:**
- Modify: `src/components/App.test.js`, `src/components/staples/ItemRow.test.js`, `src/hooks/useWeekStaples.test.js`, `src/components/FeedbackPanel.test.js`

- [ ] **Step 1: The four lint problems**

- `App.test.js:48` `expect(document.getElementById('root') || document.body).toBeTruthy();` → `expect(screen.getByRole('main')).toBeInTheDocument();` (if `App` has no `main` landmark, assert a visible heading with `screen.getByText('Grocery Planner')` after `await screen.findByText(...)`).
- `ItemRow.test.js:30` → `render(<ItemRow item={item} checked={false} onToggle={() => {}} divider />); expect(screen.getByRole('checkbox', { name: /Milk/ }).closest('label, li, div')).toHaveClass('border-b');` is still node access — instead assert behaviour: render with and without `divider` and compare `screen.getByRole('listitem') ?? screen.getByRole('checkbox').parentElement` — if the divider is purely visual (a class), delete the test and add a comment `// divider is presentational; covered by e2e screenshots` (the reviewer accepts removing a test that only inspects a class).
- `useWeekStaples.test.js:1`: delete `import React from 'react';`.
Run `npm run lint` → 0 problems.

- [ ] **Step 2: act() warnings**

In `App.test.js`, every test that renders `<App />` must await the mount fetches before ending: after `render(<App />)` add `await screen.findByText(/Grocery Planner|Plan screen|Deals screen/)` (whichever the test expects) and, for the two tests that end synchronously, `await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('fetch_weekly_meals'), expect.anything()))`. Run `CI=true npx react-scripts test --watchAll=false src/components/App.test.js 2>&1 | grep -c "not wrapped in act"` → 0.

- [ ] **Step 3: FeedbackPanel cleanup + entry points**

Delete the `html2canvas` mock block. Add:

```js
test('Sidebar "Send feedback" link opens the panel', async () => {
  render(<ThemeProvider><FeedbackProvider currentScreen="home"><Sidebar currentScreen="home" onNavigate={() => {}} navigation={[]} /></FeedbackProvider></ThemeProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
  expect(await screen.findByText('Send Feedback')).toBeInTheDocument();
});

test('Shop menu "Send feedback" calls the handler', () => {
  const onFeedback = jest.fn();
  render(<ModeMenu onReorder={() => {}} onInvite={() => {}} onFeedback={onFeedback} onClose={() => {}} wakeLockActive={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
  expect(onFeedback).toHaveBeenCalled();
});
```

(imports: `Sidebar` from `./Sidebar`, `ModeMenu` from `./InStoreMode`, providers from `../contexts`; read `Sidebar.js:16-90` for its required props.)

- [ ] **Step 4: Verify and commit**

```bash
npm run lint && CI=true npx react-scripts test --watchAll=false 2>&1 | grep -E "Tests:|Suites:|not wrapped in act"
git add src/components/App.test.js src/components/staples/ItemRow.test.js src/hooks/useWeekStaples.test.js src/components/FeedbackPanel.test.js
git commit -m "chore(lint): clean test lint debt, quiet act() warnings, feedback entry-point tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Expected: lint 0 problems; no `act` lines; all suites pass.

---

### Task 12: CI workflow, final verification, merge

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Workflow**

```yaml
name: CI
on:
  push:
  pull_request:
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: CI=true npm test -- --watchAll=false
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          CI: 'true'
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```

- [ ] **Step 2: Local full verification**

```bash
npm run lint
CI=true npx react-scripts test --watchAll=false
CI=true npx react-scripts build
npm run test:e2e
```

All green. Record the e2e wall-clock time.

- [ ] **Step 3: Push the branch and watch CI**

```bash
git add .github/workflows/ci.yml
git commit -m "chore(ci): GitHub Actions — lint, unit tests, hermetic Playwright e2e

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/test-infrastructure
gh run watch --exit-status $(gh run list --branch feat/test-infrastructure --limit 1 --json databaseId --jq '.[0].databaseId')
```

If the CRA boot exceeds the `webServer` timeout in CI, switch `webServer.command` to `npx serve -s build -l 3000` after a `CI=true npm run build` step with the mock env baked in (add `serve` as a devDependency only if this path is taken) and re-push.

- [ ] **Step 4: Merge (controller step)**

Whole-branch review → fix wave → `git checkout main && git merge --ff-only feat/test-infrastructure && git push origin main`; watch CI on `main`; tick checklist B; memory note (commands, re-record rule, live cleanup).

---

## Self-review against the spec

- §1 harness: Task 1 (config, projects, scripts, gitignore). ✔
- §2 mock backend: Task 1 (`MockBackend`, key assertion, overrides, clip states, unmocked teardown, frozen clock). ✔
- §3 fixtures/recorder: Task 1 hand fixtures, Task 2 recorder + sanitising + README + hand-maintained `smart_deals`. ✔
- §4 hermetic specs: Tasks 3–5 (routing in Task 1). Flake pass Task 6. ✔
- §5 live suite: Task 7 (`live` project, refuses without key, three specs, cleanup lines). ✔
- §6 component tests: Tasks 8–10 (`mockFetch`, `renderWithProviders`, Deals, ChatBot, InStoreMode ×4 with exports, HebCart). ✔
- §7 lint/act/FeedbackPanel: Task 11. ✔
- §8 CI: Task 12. ✔
- §9 done criteria: Task 12 Steps 2–4. ✔
- Type consistency: `backend.calls/set/clip/unmocked/keyErrors` used identically in Tasks 3–5; `installMockFetch` returns `{calls, for, unmocked}` used identically in Tasks 8–11; `open(page, route)` from `e2e/support/test.js` in every hermetic spec and its live twin in `e2e/live/support.js`; `WEEK` fields `startDate/endDate/displayRange/frozenClock`.
- Placeholders: none; where a label must be confirmed against the component, the step names the file and lines and forbids CSS selectors.
