# HEB Session Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one definition of "the HEB login works" govern the whole system, and give the user a phone-usable way to fix it when it doesn't.

**Architecture:** A single pure predicate in the clip-server decides session validity from the saved Playwright storage state; `/api/health`, `/api/heb/session/status`, `/api/heb/session/start` and `createBrowserContext` all call it. The React app consumes one hook, `useHebSession`, which both Cart and Deals render from. Re-login runs through the existing Kasm remote-browser tunnel, with the cookie import proxied by a keyed n8n webhook so the browser never holds the admin key.

**Tech Stack:** Node 20 + Express + Playwright (clip-server, CommonJS, Jest `testEnvironment: node`); React 18 + Tailwind (app, Jest + React Testing Library); Playwright for e2e; n8n 1.121.3; MySQL 8.

**Spec:** `docs/superpowers/specs/2026-09-16-heb-session-lifecycle-design.md`

## Global Constraints

- **Two repos.** Clip-server work is in `C:\New Grocery App\heb-coupon-scraper`. App work is in `C:\New Grocery App\grocery-checklist-app`. Never mix them in one commit.
- **Deployment order is asymmetric and mandatory:** compose env → clip-server rebuild → n8n restart + workflow → **app merge last**. App-first ships a hook against a container that does not send `storeId`.
- **`storeId === undefined` must skip the store check** in the app, always. This is the compatibility guard that makes deploy order recoverable.
- **Expected store is `794`** (H-E-B McKinney, 8700 Eldorado Pkwy). The live session is bound to `809`, which is confirmed drift, not a new preference.
- **"Auth cookie" means exactly `sst` or any cookie on `accounts.heb.com`** — never the whole cookie jar.
- **No Slack, no alerting, no new DB tables.** Session state surfaces in-app only.
- App gates before merge: `npm run lint` (0 warnings) → `CI=true npx react-scripts test --watchAll=false` → `npm run test:e2e` **in the foreground**.
- Scraper gates: `npm test` (Jest, `test/**/*.test.js`).
- Use `npm.cmd` / `npx.cmd` and set `CI=true` in each fresh shell on Windows.
- Clip-server code changes require a Docker rebuild to take effect.
- Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Clip-server (`heb-coupon-scraper`)**

| File | Responsibility |
|---|---|
| `src/heb-session.js` *(new)* | The single validity predicate + store resolution. Pure; no fs, no network. |
| `src/session-file.js` *(new)* | Reading the storage-state file and writing it atomically. The only module that touches that path. |
| `src/clip-server.js` | `/api/health` reports the predicate; async single-flight import routes. |
| `src/heb-cart-routes.js` | `/session/status` and `/session/start` use the predicate; `endSession` stops clobbering fresh imports. |
| `src/auth.js` | `createBrowserContext` loads cookies per the predicate; `saveSession` writes atomically. |
| `src/session-import.js` | Writes atomically; keeps `looksAuthenticated` as the cookie-shape judge. |
| `test/heb-session.test.js` *(new)* | Predicate unit tests. |
| `test/session-file.test.js` *(new)* | Atomic write / read tests. |

**App (`grocery-checklist-app`)**

| File | Responsibility |
|---|---|
| `src/hooks/useHebSession.js` *(new)* | Fetches `/api/health`, derives the seven-state model, exposes `recheck`. |
| `src/hooks/useHebSessionImport.js` *(new)* | Fires the import webhook, then polls health to completion. |
| `src/components/heb/HebSignInPanel.js` *(new)* | The shared remedy UI. Rendered by both Cart and Deals. |
| `src/hooks/useClipServerHealth.js` | **Deleted** — replaced by `useHebSession`. |
| `src/hooks/useClipSession.js` | Keeps browser-session lifecycle only; stops forming a login opinion. |
| `src/components/cart/ConnectionPanel.js` | Renders `HebSignInPanel`; `signedOut` overrides `active`. |
| `src/components/Deals.js` | Consumes `useHebSession`; stale "Session Manager" copy removed. |
| `src/config/api.js` | Adds `hebSessionImport` + `hebImportStatus` endpoints. |

---

## Task 1: The session validity predicate

**Files:**
- Create: `heb-coupon-scraper/src/heb-session.js`
- Test: `heb-coupon-scraper/test/heb-session.test.js`

**Interfaces:**
- Consumes: nothing (pure module, first task).
- Produces:
  ```js
  evaluateSession(storageState, opts) → {
    usable: boolean,
    reason: 'ok' | 'no_state' | 'no_auth_cookies' | 'auth_expired',
    authExpiresAt: string | null,   // ISO 8601, or null when non-expiring
    storeId: string | null,
    storeSource: 'curr' | 'shopping' | null,
    storeExpected: string
  }
  ```
  `opts` = `{ now?: number (ms epoch), expectedStoreId?: string }`.

- [ ] **Step 1: Write the failing test**

Create `heb-coupon-scraper/test/heb-session.test.js`:

```js
const { evaluateSession } = require('../src/heb-session');

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-09-16T12:00:00Z');
// Playwright stores `expires` in SECONDS since epoch; -1 means a session cookie.
const secs = (ms) => ms / 1000;

const cookie = (name, value, domain, expiresMs) => ({
  name, value, domain, path: '/',
  expires: expiresMs === undefined ? -1 : secs(expiresMs),
});

const authed = (extra = []) => ({
  cookies: [
    cookie('sst', 'abc', 'www.heb.com', NOW + 30 * 24 * HOUR),
    cookie('_session', 'xyz', 'accounts.heb.com', NOW + 30 * 24 * HOUR),
    ...extra,
  ],
  origins: [],
});

const opts = { now: NOW, expectedStoreId: '794' };

describe('evaluateSession — authentication', () => {
  test('null state is not usable', () => {
    const r = evaluateSession(null, opts);
    expect(r.usable).toBe(false);
    expect(r.reason).toBe('no_state');
  });

  test('sst without an accounts.heb.com cookie is not usable', () => {
    const state = { cookies: [cookie('sst', 'abc', 'www.heb.com', NOW + HOUR)], origins: [] };
    const r = evaluateSession(state, opts);
    expect(r.usable).toBe(false);
    expect(r.reason).toBe('no_auth_cookies');
  });

  test('accounts.heb.com cookie without sst is not usable', () => {
    const state = { cookies: [cookie('_session', 'xyz', 'accounts.heb.com', NOW + HOUR)], origins: [] };
    expect(evaluateSession(state, opts).usable).toBe(false);
  });

  test('both auth cookies present and unexpired is usable', () => {
    const r = evaluateSession(authed(), opts);
    expect(r.usable).toBe(true);
    expect(r.reason).toBe('ok');
  });

  test('expired auth cookie is not usable', () => {
    const state = {
      cookies: [
        cookie('sst', 'abc', 'www.heb.com', NOW - HOUR),
        cookie('_session', 'xyz', 'accounts.heb.com', NOW + 30 * 24 * HOUR),
      ],
      origins: [],
    };
    const r = evaluateSession(state, opts);
    expect(r.usable).toBe(false);
    expect(r.reason).toBe('auth_expired');
  });

  test('authExpiresAt is the EARLIEST auth cookie expiry', () => {
    const state = {
      cookies: [
        cookie('sst', 'abc', 'www.heb.com', NOW + 10 * HOUR),
        cookie('_session', 'xyz', 'accounts.heb.com', NOW + 30 * 24 * HOUR),
      ],
      origins: [],
    };
    expect(evaluateSession(state, opts).authExpiresAt).toBe(new Date(NOW + 10 * HOUR).toISOString());
  });

  test('a far-future NON-auth cookie never shortens authExpiresAt', () => {
    const state = authed([cookie('_ga', 'analytics', 'www.heb.com', NOW + HOUR)]);
    expect(evaluateSession(state, opts).authExpiresAt).toBe(new Date(NOW + 30 * 24 * HOUR).toISOString());
  });

  test('session cookies (expires -1) count as non-expiring', () => {
    const state = {
      cookies: [cookie('sst', 'abc', 'www.heb.com'), cookie('_session', 'xyz', 'accounts.heb.com')],
      origins: [],
    };
    const r = evaluateSession(state, opts);
    expect(r.usable).toBe(true);
    expect(r.authExpiresAt).toBeNull();
  });

  test('file mtime plays no part — a decades-old state with live cookies is usable', () => {
    expect(evaluateSession(authed(), opts).usable).toBe(true);
  });
});

describe('evaluateSession — store binding', () => {
  test('no store cookie yields null id and null source', () => {
    const r = evaluateSession(authed(), opts);
    expect(r.storeId).toBeNull();
    expect(r.storeSource).toBeNull();
  });

  test('CURR_SESSION_STORE is authoritative', () => {
    const state = authed([cookie('CURR_SESSION_STORE', '794', 'www.heb.com', NOW + 30 * 24 * HOUR)]);
    const r = evaluateSession(state, opts);
    expect(r.storeId).toBe('794');
    expect(r.storeSource).toBe('curr');
  });

  test('SHOPPING_STORE_ID is the fallback — matches the live session file today', () => {
    const state = authed([cookie('SHOPPING_STORE_ID', '809', 'www.heb.com', NOW + 30 * 24 * HOUR)]);
    const r = evaluateSession(state, opts);
    expect(r.storeId).toBe('809');
    expect(r.storeSource).toBe('shopping');
  });

  test('CURR_SESSION_STORE wins when both are present', () => {
    const state = authed([
      cookie('SHOPPING_STORE_ID', '809', 'www.heb.com', NOW + 30 * 24 * HOUR),
      cookie('CURR_SESSION_STORE', '794', 'www.heb.com', NOW + 30 * 24 * HOUR),
    ]);
    expect(evaluateSession(state, opts).storeSource).toBe('curr');
  });

  test('an EXPIRED store cookie is ignored', () => {
    const state = authed([cookie('CURR_SESSION_STORE', '794', 'www.heb.com', NOW - HOUR)]);
    const r = evaluateSession(state, opts);
    expect(r.storeId).toBeNull();
  });

  test('storeExpected defaults to 794 and is always a string', () => {
    const r = evaluateSession(authed(), { now: NOW });
    expect(r.storeExpected).toBe('794');
  });

  test('store is reported even when the session is unusable', () => {
    const state = { cookies: [cookie('CURR_SESSION_STORE', '794', 'www.heb.com', NOW + HOUR)], origins: [] };
    expect(evaluateSession(state, opts).storeId).toBe('794');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npx.cmd jest test/heb-session.test.js`
Expected: FAIL — `Cannot find module '../src/heb-session'`

- [ ] **Step 3: Write minimal implementation**

Create `heb-coupon-scraper/src/heb-session.js`:

```js
/**
 * The single source of truth for "is the saved HEB session usable".
 *
 * Pure: no fs, no network, no clock except what the caller injects. Every
 * consumer (health endpoint, cart session routes, browser-context loader)
 * calls this, so they cannot drift apart.
 *
 * File mtime is deliberately NOT an input. An anonymous scrape or a cart
 * teardown refreshes the file's mtime without refreshing the login, which is
 * exactly how Cart and Deals came to disagree.
 */

const DEFAULT_STORE_ID = '794';

/** Cookies that actually prove a login: `sst` plus the accounts.heb.com flow. */
function isAuthCookie(c) {
  return c.name === 'sst' || String(c.domain || '').includes('accounts.heb.com');
}

/** Playwright stores `expires` in seconds; <= 0 means a session cookie. */
function expiryMs(cookie) {
  const e = Number(cookie.expires);
  return Number.isFinite(e) && e > 0 ? e * 1000 : null;
}

function isUnexpired(cookie, now) {
  const ms = expiryMs(cookie);
  return ms === null || ms > now;
}

function resolveStore(cookies, now) {
  const live = (name) => cookies.find((c) => c.name === name && isUnexpired(c, now));
  const curr = live('CURR_SESSION_STORE');
  if (curr) return { storeId: String(curr.value), storeSource: 'curr' };
  const shopping = live('SHOPPING_STORE_ID');
  if (shopping) return { storeId: String(shopping.value), storeSource: 'shopping' };
  return { storeId: null, storeSource: null };
}

function evaluateSession(storageState, opts = {}) {
  const now = opts.now ?? Date.now();
  const storeExpected = String(opts.expectedStoreId ?? process.env.HEB_STORE_ID ?? DEFAULT_STORE_ID);

  const base = { authExpiresAt: null, storeId: null, storeSource: null, storeExpected };

  if (!storageState || !Array.isArray(storageState.cookies)) {
    return { usable: false, reason: 'no_state', ...base };
  }

  const cookies = storageState.cookies;
  const store = resolveStore(cookies, now);

  const authCookies = cookies.filter(isAuthCookie);
  const hasSst = authCookies.some((c) => c.name === 'sst');
  const hasAccounts = authCookies.some((c) => String(c.domain || '').includes('accounts.heb.com'));
  if (!hasSst || !hasAccounts) {
    return { usable: false, reason: 'no_auth_cookies', ...base, ...store };
  }

  const expiries = authCookies.map(expiryMs).filter((ms) => ms !== null);
  const earliest = expiries.length ? Math.min(...expiries) : null;
  const authExpiresAt = earliest === null ? null : new Date(earliest).toISOString();

  if (earliest !== null && earliest <= now) {
    return { usable: false, reason: 'auth_expired', ...base, ...store, authExpiresAt };
  }

  return { usable: true, reason: 'ok', ...base, ...store, authExpiresAt };
}

module.exports = { evaluateSession, isAuthCookie, DEFAULT_STORE_ID };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npx.cmd jest test/heb-session.test.js`
Expected: PASS, 17 tests.

- [ ] **Step 5: Run the whole scraper suite for regressions**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npm.cmd test`
Expected: PASS, no previously-passing test broken.

- [ ] **Step 6: Commit**

```bash
cd "C:/New Grocery App/heb-coupon-scraper"
git add src/heb-session.js test/heb-session.test.js
git commit -m "feat: single predicate for HEB session validity

Decides usability from auth-cookie expiry rather than file mtime, and
resolves store binding from CURR_SESSION_STORE with SHOPPING_STORE_ID as
fallback. Pure and injectable so every consumer shares one definition.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Atomic session-file read and write

**Files:**
- Create: `heb-coupon-scraper/src/session-file.js`
- Test: `heb-coupon-scraper/test/session-file.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `readSessionState(cookiePath) → object | null` — parsed storage state, `null` if missing or unparseable.
  - `writeSessionState(cookiePath, state) → void` — writes via temp file + rename.
  - `sessionFileMtimeMs(cookiePath) → number | null` — diagnostic only.

Why: `fs.writeFileSync` is not atomic, and `/api/health` parses the same file on every Deals and Cart mount. A concurrent read during a write surfaces as a transient false `signedOut` in both screens.

- [ ] **Step 1: Write the failing test**

Create `heb-coupon-scraper/test/session-file.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readSessionState, writeSessionState, sessionFileMtimeMs } = require('../src/session-file');

let dir;
let file;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-file-'));
  file = path.join(dir, 'heb-session.json');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('readSessionState', () => {
  test('missing file returns null', () => {
    expect(readSessionState(file)).toBeNull();
  });

  test('unparseable file returns null instead of throwing', () => {
    fs.writeFileSync(file, '{ this is not json');
    expect(readSessionState(file)).toBeNull();
  });

  test('valid file round-trips', () => {
    const state = { cookies: [{ name: 'sst', value: 'a', domain: 'www.heb.com' }], origins: [] };
    writeSessionState(file, state);
    expect(readSessionState(file)).toEqual(state);
  });
});

describe('writeSessionState', () => {
  test('creates the parent directory when absent', () => {
    const nested = path.join(dir, 'deep', 'heb-session.json');
    writeSessionState(nested, { cookies: [], origins: [] });
    expect(fs.existsSync(nested)).toBe(true);
  });

  test('leaves no temp files behind', () => {
    writeSessionState(file, { cookies: [], origins: [] });
    expect(fs.readdirSync(dir)).toEqual(['heb-session.json']);
  });

  test('a reader never observes a partial file', () => {
    // Pre-existing valid content must stay readable right up to the swap.
    writeSessionState(file, { cookies: [{ name: 'old', value: '1', domain: 'd' }], origins: [] });
    const big = { cookies: Array.from({ length: 5000 }, (_, i) => ({ name: `c${i}`, value: 'x'.repeat(200), domain: 'd' })), origins: [] };
    writeSessionState(file, big);
    const after = readSessionState(file);
    expect(after.cookies).toHaveLength(5000);
  });

  test('overwrites an existing file', () => {
    writeSessionState(file, { cookies: [{ name: 'a', value: '1', domain: 'd' }], origins: [] });
    writeSessionState(file, { cookies: [{ name: 'b', value: '2', domain: 'd' }], origins: [] });
    expect(readSessionState(file).cookies[0].name).toBe('b');
  });
});

describe('sessionFileMtimeMs', () => {
  test('missing file returns null', () => {
    expect(sessionFileMtimeMs(file)).toBeNull();
  });

  test('written file returns a recent timestamp', () => {
    writeSessionState(file, { cookies: [], origins: [] });
    expect(sessionFileMtimeMs(file)).toBeGreaterThan(Date.now() - 60000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npx.cmd jest test/session-file.test.js`
Expected: FAIL — `Cannot find module '../src/session-file'`

- [ ] **Step 3: Write minimal implementation**

Create `heb-coupon-scraper/src/session-file.js`:

```js
/**
 * The only module that reads or writes the Playwright storage-state file.
 *
 * Writes go through a temp file + rename so a concurrent /api/health parse
 * can never observe a half-written file (which would surface as a spurious
 * "HEB sign-in needed" in Cart and Deals).
 */

const fs = require('fs');
const path = require('path');

function readSessionState(cookiePath) {
  try {
    return JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeSessionState(cookiePath, state) {
  const dir = path.dirname(cookiePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Same directory, so the rename stays on one filesystem and is atomic.
  const tmp = `${cookiePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, cookiePath);
  } finally {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* best effort */ }
  }
}

function sessionFileMtimeMs(cookiePath) {
  try {
    return fs.statSync(cookiePath).mtimeMs;
  } catch {
    return null;
  }
}

module.exports = { readSessionState, writeSessionState, sessionFileMtimeMs };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npx.cmd jest test/session-file.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Route the two existing writers through it**

In `heb-coupon-scraper/src/auth.js`, replace the body of `saveSession` (currently lines 214-225):

```js
async function saveSession(context) {
  const cookiePath = path.resolve(config.browser.cookiePath);
  const state = await context.storageState();
  writeSessionState(cookiePath, state);
  console.log('[auth] Session saved to', cookiePath);
}
```

Add at the top of `auth.js`: `const { writeSessionState } = require('./session-file');`

In `heb-coupon-scraper/src/session-import.js`, replace the `fs.writeFileSync` at line 183 with `writeSessionState(sessionPath, hebState);` and add `const { writeSessionState } = require('./session-file');` to its requires. Keep the surrounding logging.

- [ ] **Step 6: Run the whole scraper suite**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npm.cmd test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd "C:/New Grocery App/heb-coupon-scraper"
git add src/session-file.js test/session-file.test.js src/auth.js src/session-import.js
git commit -m "fix: write the HEB session file atomically

writeFileSync let a concurrent /api/health parse observe a half-written
file, surfacing as a spurious sign-in prompt. Temp file + rename, behind
the one module that owns this path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `/api/health` reports the predicate

**Files:**
- Modify: `heb-coupon-scraper/src/clip-server.js:74-146` (the `/api/health` handler)
- Test: `heb-coupon-scraper/test/health-payload.test.js` *(new)*

**Interfaces:**
- Consumes: `evaluateSession` (Task 1), `readSessionState` / `sessionFileMtimeMs` (Task 2).
- Produces: the health payload shape the app's `useHebSession` (Task 7) parses:
  ```js
  {
    status: 'ok',
    sessionValid: boolean,          // mtime freshness — DIAGNOSTIC ONLY now
    sessionAuthenticated: boolean,  // = evaluateSession().usable
    sessionReason: string,          // evaluateSession().reason
    authExpiresAt: string | null,
    storeId: string | null,
    storeSource: 'curr' | 'shopping' | null,
    storeExpected: string,
    sessionAgeHours: number | null,
    lastScrapeAt, couponCount, activeJobs, activeScraperJob   // unchanged
  }
  ```

To keep the handler testable without booting Express, extract the payload builder.

- [ ] **Step 1: Write the failing test**

Create `heb-coupon-scraper/test/health-payload.test.js`:

```js
const { buildSessionHealth } = require('../src/clip-server-health');

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-09-16T12:00:00Z');
const secs = (ms) => ms / 1000;
const cookie = (name, value, domain, expiresMs) => ({
  name, value, domain, path: '/', expires: expiresMs === undefined ? -1 : secs(expiresMs),
});
const authedState = (extra = []) => ({
  cookies: [
    cookie('sst', 'abc', 'www.heb.com', NOW + 30 * 24 * HOUR),
    cookie('_session', 'xyz', 'accounts.heb.com', NOW + 30 * 24 * HOUR),
    ...extra,
  ],
  origins: [],
});

describe('buildSessionHealth', () => {
  test('authenticated state reports sessionAuthenticated true', () => {
    const h = buildSessionHealth({ state: authedState(), mtimeMs: NOW - HOUR, now: NOW, expectedStoreId: '794' });
    expect(h.sessionAuthenticated).toBe(true);
    expect(h.sessionReason).toBe('ok');
  });

  test('a 40-hour-old file with live cookies is STILL authenticated', () => {
    // The old mtime gate would have called this expired. That gate is gone.
    const h = buildSessionHealth({ state: authedState(), mtimeMs: NOW - 40 * HOUR, now: NOW, expectedStoreId: '794' });
    expect(h.sessionAuthenticated).toBe(true);
    expect(h.sessionValid).toBe(false); // diagnostic only
    expect(h.sessionAgeHours).toBe(40);
  });

  test('missing state reports not authenticated', () => {
    const h = buildSessionHealth({ state: null, mtimeMs: null, now: NOW, expectedStoreId: '794' });
    expect(h.sessionAuthenticated).toBe(false);
    expect(h.sessionReason).toBe('no_state');
    expect(h.sessionAgeHours).toBeNull();
  });

  test('store fields are always present, null when no store cookie', () => {
    const h = buildSessionHealth({ state: authedState(), mtimeMs: NOW, now: NOW, expectedStoreId: '794' });
    expect(h).toHaveProperty('storeId', null);
    expect(h).toHaveProperty('storeSource', null);
    expect(h.storeExpected).toBe('794');
  });

  test('reports the live drift case: SHOPPING_STORE_ID 809 against expected 794', () => {
    const state = authedState([cookie('SHOPPING_STORE_ID', '809', 'www.heb.com', NOW + 30 * 24 * HOUR)]);
    const h = buildSessionHealth({ state, mtimeMs: NOW, now: NOW, expectedStoreId: '794' });
    expect(h.storeId).toBe('809');
    expect(h.storeSource).toBe('shopping');
    expect(h.storeExpected).toBe('794');
  });

  test('authExpiresAt is surfaced for the expiring advisory', () => {
    const state = {
      cookies: [
        cookie('sst', 'abc', 'www.heb.com', NOW + 6 * HOUR),
        cookie('_session', 'xyz', 'accounts.heb.com', NOW + 30 * 24 * HOUR),
      ],
      origins: [],
    };
    const h = buildSessionHealth({ state, mtimeMs: NOW, now: NOW, expectedStoreId: '794' });
    expect(h.authExpiresAt).toBe(new Date(NOW + 6 * HOUR).toISOString());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npx.cmd jest test/health-payload.test.js`
Expected: FAIL — `Cannot find module '../src/clip-server-health'`

- [ ] **Step 3: Write minimal implementation**

Create `heb-coupon-scraper/src/clip-server-health.js`:

```js
/**
 * Builds the session portion of the /api/health payload. Split out of the
 * route so it can be tested without booting Express or touching disk.
 */

const { evaluateSession } = require('./heb-session');

function buildSessionHealth({ state, mtimeMs, now = Date.now(), expectedStoreId }) {
  const ev = evaluateSession(state, { now, expectedStoreId });

  const sessionAgeHours = mtimeMs === null || mtimeMs === undefined
    ? null
    : Math.round(((now - mtimeMs) / 3600000) * 10) / 10;

  // Retained purely as a diagnostic: it no longer gates anything.
  const sessionValid = sessionAgeHours !== null && sessionAgeHours < 24;

  return {
    sessionValid,
    sessionAuthenticated: ev.usable,
    sessionReason: ev.reason,
    authExpiresAt: ev.authExpiresAt,
    storeId: ev.storeId,
    storeSource: ev.storeSource,
    storeExpected: ev.storeExpected,
    sessionAgeHours,
  };
}

module.exports = { buildSessionHealth };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npx.cmd jest test/health-payload.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire it into the route**

In `heb-coupon-scraper/src/clip-server.js`, replace the session block at the top of the `/api/health` handler (the `isSessionFileValid` / `looksAuthenticated` / `sessionAgeHours` / `sessionExpiresIn` computation, lines 75-110) with:

```js
    const sessionPath = path.resolve(config.browser.cookiePath);
    const sessionHealth = buildSessionHealth({
      state: readSessionState(sessionPath),
      mtimeMs: sessionFileMtimeMs(sessionPath),
    });
```

Add to the requires at the top of the file:

```js
const path = require('path');
const { buildSessionHealth } = require('./clip-server-health');
const { readSessionState, sessionFileMtimeMs } = require('./session-file');
```

Then spread it into the response, replacing the individual session fields:

```js
    res.json({
      status: 'ok',
      ...sessionHealth,
      lastScrapeAt,
      couponCount,
      activeJobs: Array.from(jobs.entries()).filter(([, job]) => job.status === 'running').length,
      activeScraperJob: scraperJob && scraperJob.status === 'running'
        ? { jobId: scraperJob.jobId, type: scraperJob.type, startedAt: scraperJob.startedAt }
        : null,
    });
```

Remove the now-unused `sessionExpiresIn` computation and the local `isSessionFileValid` / `looksAuthenticated` / `fs` requires inside the handler.

**Note:** the app's old `useClipServerHealth` read `sessionExpiresIn` for its "expiring" copy. That hook is deleted in Task 8, and the new advisory uses `authExpiresAt`. Dropping the field is intended.

- [ ] **Step 6: Verify the server still boots**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && node -e "require('./src/clip-server.js')" `
Expected: the Express listen log, no require errors. Stop it with Ctrl+C.

- [ ] **Step 7: Run the whole scraper suite and commit**

```bash
cd "C:/New Grocery App/heb-coupon-scraper"
npm.cmd test
git add src/clip-server-health.js test/health-payload.test.js src/clip-server.js
git commit -m "feat: /api/health reports session validity and store binding

sessionAuthenticated now comes from the shared predicate rather than an
mtime gate ANDed with a cookie-shape check, and the payload carries
storeId/storeSource/storeExpected plus authExpiresAt.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Cart routes and the browser loader use the predicate

**Files:**
- Modify: `heb-coupon-scraper/src/heb-cart-routes.js:171-182` (`/session/status`), `:114-121` (`/session/start`), `:70-78` (`endSession`)
- Modify: `heb-coupon-scraper/src/auth.js:47` (`createBrowserContext`)
- Test: `heb-coupon-scraper/test/session-usability.test.js` *(new)*

**Interfaces:**
- Consumes: `evaluateSession` (Task 1), `readSessionState` / `sessionFileMtimeMs` (Task 2).
- Produces: `isSessionUsable(cookiePath, opts) → boolean` exported from `src/heb-session-fs.js`, the disk-backed convenience wrapper the three call sites share.

This is the task that actually kills the divergence. Leaving `/session/start` or `createBrowserContext` on the loose check means auto-reconnect during a cart build still launches a browser with unusable cookies.

- [ ] **Step 1: Write the failing test**

Create `heb-coupon-scraper/test/session-usability.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isSessionUsable } = require('../src/heb-session-fs');
const { writeSessionState } = require('../src/session-file');

const HOUR = 3600 * 1000;
let dir;
let file;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usable-'));
  file = path.join(dir, 'heb-session.json');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const authed = () => ({
  cookies: [
    { name: 'sst', value: 'a', domain: 'www.heb.com', path: '/', expires: (Date.now() + 30 * 24 * HOUR) / 1000 },
    { name: '_session', value: 'b', domain: 'accounts.heb.com', path: '/', expires: (Date.now() + 30 * 24 * HOUR) / 1000 },
  ],
  origins: [],
});

const loggedOut = () => ({
  cookies: [{ name: 'sst', value: 'a', domain: 'www.heb.com', path: '/', expires: (Date.now() + 30 * 24 * HOUR) / 1000 }],
  origins: [],
});

test('missing file is not usable', () => {
  expect(isSessionUsable(file)).toBe(false);
});

test('authenticated file is usable', () => {
  writeSessionState(file, authed());
  expect(isSessionUsable(file)).toBe(true);
});

test('THE BUG: a freshly-written logged-out file is NOT usable', () => {
  // This is precisely what cart endSession used to produce: fresh mtime,
  // no accounts.heb.com cookie. The old mtime check called it valid.
  writeSessionState(file, loggedOut());
  expect(isSessionUsable(file)).toBe(false);
});

test('an old file with live auth cookies IS usable', () => {
  writeSessionState(file, authed());
  const old = (Date.now() - 40 * HOUR) / 1000;
  fs.utimesSync(file, old, old);
  expect(isSessionUsable(file)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npx.cmd jest test/session-usability.test.js`
Expected: FAIL — `Cannot find module '../src/heb-session-fs'`

- [ ] **Step 3: Write minimal implementation**

Create `heb-coupon-scraper/src/heb-session-fs.js`:

```js
/** Disk-backed convenience wrapper around the pure predicate. */

const { evaluateSession } = require('./heb-session');
const { readSessionState } = require('./session-file');

function evaluateSessionFile(cookiePath, opts = {}) {
  return evaluateSession(readSessionState(cookiePath), opts);
}

function isSessionUsable(cookiePath, opts = {}) {
  return evaluateSessionFile(cookiePath, opts).usable;
}

module.exports = { evaluateSessionFile, isSessionUsable };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npx.cmd jest test/session-usability.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Swap the three call sites**

In `heb-coupon-scraper/src/heb-cart-routes.js`, add `const { isSessionUsable } = require('./heb-session-fs');` to the requires, then:

`/session/status` (line ~174) — replace
`const loginSessionValid = isSessionFileValid(cookiePath);`
with
`const loginSessionValid = isSessionUsable(cookiePath);`

`/session/start` (line ~118) — replace `if (!isSessionFileValid(cookiePath)) {` with `if (!isSessionUsable(cookiePath)) {` and update the message, which currently names a desktop-only remedy:

```js
      return res.status(401).json({
        error: 'SESSION_EXPIRED',
        message: 'HEB login is expired. Sign in at heb-login.needexcelexpert.com, then import the session.',
      });
```

In `heb-coupon-scraper/src/auth.js`, add `const { isSessionUsable } = require('./heb-session-fs');` and replace line 47:

```js
  if (!forceLogin && isSessionUsable(cookiePath)) {
```

Leave `isSessionFileValid` exported — `store-locations/preflight.js` still calls it for its own mtime staleness hint, which is a legitimate separate use.

- [ ] **Step 6: Guard `endSession` against clobbering a fresh import**

In `heb-cart-routes.js`, the `session.touched` save (lines ~72-77) must not overwrite a session file that was imported after this browser session started. Replace that block with:

```js
    // If HEB accepted at least one request during this session, persist the
    // refreshed cookies — unless a newer session file landed meanwhile (a
    // phone re-login + import), which we must not overwrite with this
    // browser's older, possibly rejected cookies.
    if (session.touched && session.context) {
      const cookiePath = path.resolve(config.browser.cookiePath);
      const mtime = sessionFileMtimeMs(cookiePath);
      if (mtime !== null && session.startedAt && mtime > session.startedAt) {
        console.log('[heb-cart] Skipping saveSession — session file is newer than this browser session');
      } else {
        await saveSession(session.context).catch(err =>
          console.error(`[heb-cart] saveSession failed: ${err.message}`)
        );
      }
    }
```

Add `const { sessionFileMtimeMs } = require('./session-file');` to the requires, and set `startedAt: Date.now()` in the `activeSession = { ... }` object literal in `/session/start` (alongside `id`, `browser`, `context`, `page`, `status`, `lastActivity`).

- [ ] **Step 7: Run the whole scraper suite and commit**

```bash
cd "C:/New Grocery App/heb-coupon-scraper"
npm.cmd test
git add src/heb-session-fs.js test/session-usability.test.js src/heb-cart-routes.js src/auth.js
git commit -m "fix: cart session routes and browser loader share the predicate

/session/status, /session/start and createBrowserContext all judged
login validity by file mtime, so a cart teardown that wrote logged-out
cookies made Cart offer a Connect button that could only fail. endSession
now also refuses to overwrite a session file imported after it started.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Asynchronous, single-flight session import

**Files:**
- Modify: `heb-coupon-scraper/src/clip-server.js:152-165` (`/api/import-session`)
- Create: `heb-coupon-scraper/src/import-runner.js`
- Test: `heb-coupon-scraper/test/import-runner.test.js` *(new)*

**Interfaces:**
- Consumes: `importSession` from `session-import.js` (existing, unchanged).
- Produces:
  - `startImport(runner) → { started: boolean, alreadyRunning: boolean }`
  - `getImportStatus() → { running: boolean, lastResult: object | null, lastFinishedAt: string | null }`
  - Routes: `POST /api/import-session` → `202 { started, alreadyRunning }`; `GET /api/import-session/status` → the status object.

Why asynchronous: `importSession` copies a ~355 MB Chrome profile and launches Playwright, twice on a first-pass miss. The n8n hostname is behind a ~100s Cloudflare origin cap, so a synchronous call can 524 the browser *while succeeding on the server*. Why single-flight: the route has no lock today, so a second tap starts a second profile copy and a second unsynchronised write.

- [ ] **Step 1: Write the failing test**

Create `heb-coupon-scraper/test/import-runner.test.js`:

```js
const { createImportRunner } = require('../src/import-runner');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('import runner', () => {
  test('starts an import and reports running', async () => {
    const d = deferred();
    const runner = createImportRunner(() => d.promise);
    expect(runner.getStatus().running).toBe(false);

    const r = runner.start();
    expect(r).toEqual({ started: true, alreadyRunning: false });
    expect(runner.getStatus().running).toBe(true);

    d.resolve({ success: true, cookieCount: 19 });
    await runner.settled();
    expect(runner.getStatus().running).toBe(false);
    expect(runner.getStatus().lastResult).toEqual({ success: true, cookieCount: 19 });
  });

  test('SINGLE FLIGHT: a second start while running does not invoke the import again', async () => {
    const d = deferred();
    const impl = jest.fn(() => d.promise);
    const runner = createImportRunner(impl);

    runner.start();
    const second = runner.start();

    expect(second).toEqual({ started: false, alreadyRunning: true });
    expect(impl).toHaveBeenCalledTimes(1);

    d.resolve({ success: true });
    await runner.settled();
  });

  test('a new import may start after the previous one finishes', async () => {
    const impl = jest.fn()
      .mockResolvedValueOnce({ success: false, error: 'not synced yet' })
      .mockResolvedValueOnce({ success: true, cookieCount: 19 });
    const runner = createImportRunner(impl);

    runner.start();
    await runner.settled();
    expect(runner.getStatus().lastResult.success).toBe(false);

    runner.start();
    await runner.settled();
    expect(runner.getStatus().lastResult.success).toBe(true);
    expect(impl).toHaveBeenCalledTimes(2);
  });

  test('a thrown import is captured as a failed result, not an unhandled rejection', async () => {
    const runner = createImportRunner(() => Promise.reject(new Error('chrome exploded')));
    runner.start();
    await runner.settled();

    const s = runner.getStatus();
    expect(s.running).toBe(false);
    expect(s.lastResult.success).toBe(false);
    expect(s.lastResult.error).toContain('chrome exploded');
  });

  test('lastFinishedAt is an ISO timestamp after completion', async () => {
    const runner = createImportRunner(() => Promise.resolve({ success: true }));
    runner.start();
    await runner.settled();
    expect(() => new Date(runner.getStatus().lastFinishedAt).toISOString()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npx.cmd jest test/import-runner.test.js`
Expected: FAIL — `Cannot find module '../src/import-runner'`

- [ ] **Step 3: Write minimal implementation**

Create `heb-coupon-scraper/src/import-runner.js`:

```js
/**
 * Single-flight wrapper around the session import.
 *
 * The import copies a large Chrome profile and launches Playwright, so it is
 * far too slow to answer synchronously behind Cloudflare's origin timeout,
 * and far too expensive to run twice because someone tapped twice.
 */

function createImportRunner(impl) {
  let running = null;          // Promise while in flight, else null
  let lastResult = null;
  let lastFinishedAt = null;

  function start() {
    if (running) return { started: false, alreadyRunning: true };

    running = Promise.resolve()
      .then(() => impl())
      .then((result) => {
        lastResult = result;
      })
      .catch((err) => {
        lastResult = { success: false, error: err && err.message ? err.message : String(err) };
      })
      .finally(() => {
        lastFinishedAt = new Date().toISOString();
        running = null;
      });

    return { started: true, alreadyRunning: false };
  }

  function getStatus() {
    return { running: running !== null, lastResult, lastFinishedAt };
  }

  /** Test seam: resolves when the in-flight import settles. */
  function settled() {
    return running || Promise.resolve();
  }

  return { start, getStatus, settled };
}

module.exports = { createImportRunner };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/New Grocery App/heb-coupon-scraper" && npx.cmd jest test/import-runner.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Rewire the routes**

In `heb-coupon-scraper/src/clip-server.js`, add near the other module setup:

```js
const { createImportRunner } = require('./import-runner');
const importRunner = createImportRunner(() => importSession());
```

Replace the whole `POST /api/import-session` handler with:

```js
/**
 * POST /api/import-session — Kick off a cookie import from the Kasm Chrome
 * profile. Returns immediately; poll /api/health or the status route below.
 * Protected by admin API key.
 */
app.post('/api/import-session', requireAdminKey, (req, res) => {
  const { started, alreadyRunning } = importRunner.start();
  console.log(`[clip-server] Import requested (started=${started}, alreadyRunning=${alreadyRunning})`);
  res.status(202).json({ started, alreadyRunning });
});

/**
 * GET /api/import-session/status — Whether an import is running and how the
 * last one went. Unauthenticated, like /api/health: it exposes only a
 * boolean and a generic error string.
 */
app.get('/api/import-session/status', (req, res) => {
  res.json(importRunner.getStatus());
});
```

- [ ] **Step 6: Verify the server boots and the routes answer**

```bash
cd "C:/New Grocery App/heb-coupon-scraper"
node src/clip-server.js &
sleep 3
curl -s -i -X POST http://localhost:3847/api/import-session | head -3
curl -s http://localhost:3847/api/import-session/status
kill %1
```
Expected: the POST returns `401` without an admin key (proving the guard is intact); the status route returns `{"running":false,"lastResult":null,"lastFinishedAt":null}`.

- [ ] **Step 7: Run the whole scraper suite and commit**

```bash
cd "C:/New Grocery App/heb-coupon-scraper"
npm.cmd test
git add src/import-runner.js test/import-runner.test.js src/clip-server.js
git commit -m "feat: asynchronous single-flight session import

The import copies a 355MB Chrome profile and launches Playwright, which
cannot answer inside Cloudflare's origin timeout. POST now returns 202
immediately and coalesces concurrent callers; a status route reports the
last outcome so the UI can distinguish 'not synced yet' from a failure.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Infrastructure — compose env, rebuild, import webhook

**Files:**
- Modify: `C:\hsa-automation\docker-compose.yaml` (env on `heb-clip-server` and `hsa-local`)
- Create: `grocery-checklist-app/scripts/n8n-workflows/heb-session-import.json`

**Interfaces:**
- Consumes: the clip-server routes from Task 5.
- Produces: `POST https://n8n-grocery.needexcelexpert.com/webhook/heb_session_import`, requiring `X-API-Key`, returning the clip-server's status and body verbatim.

**This task changes live infrastructure. Confirm with the user before running steps 3 and 4** — the rebuild takes clipping and cart-building down, and the n8n restart re-activates 42 workflows (~65s).

- [ ] **Step 1: Add the missing environment variables**

In `C:\hsa-automation\docker-compose.yaml`, under `heb-clip-server:` → `environment:`, add:

```yaml
      - HEB_STORE_ID=${HEB_STORE_ID:-794}
```

Under `hsa-local:` → `environment:`, add:

```yaml
      - ADMIN_API_KEY=${ADMIN_API_KEY}
```

`ADMIN_API_KEY` is currently passed only to `heb-clip-server`. Without this line `{{$env.ADMIN_API_KEY}}` resolves empty in n8n and the webhook 401s on first use.

- [ ] **Step 2: Author the import webhook workflow**

Create `grocery-checklist-app/scripts/n8n-workflows/heb-session-import.json` following the sub-project A contract: Webhook (`responseNode`, `webhookId` present) → HTTP Request → Respond with CORS `*`.

The HTTP Request node must set:
- URL `http://heb-clip-server:3847/api/import-session` (container DNS on `hsa-network`; no tunnel hop)
- Method POST
- Header `X-Admin-Key` = `={{$env.ADMIN_API_KEY}}`
- **`onError: continueRegularOutput`** — a 4xx here is the routine "Chrome profile hasn't synced yet" case, and letting the node throw would surface as an n8n 500, which `apiJson`'s `raise()` files as a `client_errors` row on every attempt.
- `neverError: true` in options so the status code passes through.

The Respond node returns the clip-server's status code and body unchanged.

- [ ] **Step 3: Apply the compose changes and rebuild** *(destructive — confirm first)*

```bash
cd /c/hsa-automation
docker compose up -d --build heb-clip-server
docker compose up -d hsa-local
```
Expected: clip-server rebuilds with the Task 1-5 code; n8n restarts and picks up `ADMIN_API_KEY`. Webhooks take ~65s to answer after the n8n restart.

- [ ] **Step 4: Create the workflow and verify end to end**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
node scripts/n8n-wave.mjs create scripts/n8n-workflows/heb-session-import.json
```

Then verify the new health shape and the webhook, using the project's required headers:

```bash
source /c/hsa-automation/.env
# Health must now carry the new fields
curl -s https://clip.needexcelexpert.com/api/health | python -m json.tool | grep -E "sessionAuthenticated|storeId|storeSource|storeExpected|authExpiresAt"

# The webhook must reach clip-server and NOT 401
curl -i -X POST "https://n8n-grocery.needexcelexpert.com/webhook/heb_session_import" \
  -H "X-API-Key: $GROCERY_APP_API_KEY" \
  -H "Origin: https://grocery-checklist-app.netlify.app" \
  -H "Content-Type: application/json" -d '{}'
```
Expected: health shows `storeId: "809"`, `storeSource: "shopping"`, `storeExpected: "794"`; the webhook returns 202 (or the clip-server's 400 with a real message), **never 401**.

- [ ] **Step 5: Commit the workflow definition**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
git add scripts/n8n-workflows/heb-session-import.json
git commit -m "feat: n8n webhook proxying the HEB session import

Holds ADMIN_API_KEY server-side so the browser never carries it. Set to
pass clip-server 4xx through rather than throwing, because 'profile not
synced yet' is the routine first-tap outcome and must not become a 500
and a telemetry row.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: The `useHebSession` hook

**Files:**
- Create: `grocery-checklist-app/src/hooks/useHebSession.js`
- Create: `grocery-checklist-app/src/hooks/useHebSession.test.js`
- Modify: `grocery-checklist-app/src/config/api.js` (add two endpoints)

**Interfaces:**
- Consumes: the `/api/health` payload from Task 3.
- Produces: `useHebSession() → { state, health, recheck }` where `state` is one of
  `'checking' | 'unreachable' | 'signedOut' | 'noStore' | 'wrongStore' | 'expiring' | 'ready'`,
  and `recheck()` returns a Promise resolving to the new state string.
  Also exports the pure `deriveState(health) → string` for direct testing.

- [ ] **Step 1: Write the failing test**

Create `grocery-checklist-app/src/hooks/useHebSession.test.js`:

```js
import { renderHook, waitFor } from '@testing-library/react';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { useHebSession, deriveState } from './useHebSession';

const HOUR = 3600 * 1000;
const future = (ms) => new Date(Date.now() + ms).toISOString();

const healthy = {
  status: 'ok',
  sessionAuthenticated: true,
  sessionReason: 'ok',
  authExpiresAt: future(30 * 24 * HOUR),
  storeId: '794',
  storeSource: 'curr',
  storeExpected: '794',
};

afterEach(() => restoreFetch());

describe('deriveState', () => {
  test('authenticated, right store, long-lived → ready', () => {
    expect(deriveState(healthy)).toBe('ready');
  });

  test('not authenticated → signedOut', () => {
    expect(deriveState({ ...healthy, sessionAuthenticated: false })).toBe('signedOut');
  });

  test('signedOut outranks a wrong store', () => {
    expect(deriveState({ ...healthy, sessionAuthenticated: false, storeId: '809' })).toBe('signedOut');
  });

  test('null storeId → noStore', () => {
    expect(deriveState({ ...healthy, storeId: null })).toBe('noStore');
  });

  test('mismatched store → wrongStore', () => {
    expect(deriveState({ ...healthy, storeId: '809', storeSource: 'shopping' })).toBe('wrongStore');
  });

  test('COMPATIBILITY: undefined storeId skips the store check entirely', () => {
    // An old container that has not been rebuilt omits the field. Treating
    // undefined as a mismatch would put every user in wrongStore.
    const old = { status: 'ok', sessionAuthenticated: true, authExpiresAt: future(30 * 24 * HOUR) };
    expect(deriveState(old)).toBe('ready');
  });

  test('store comparison is by string, not identity', () => {
    expect(deriveState({ ...healthy, storeId: 794, storeExpected: '794' })).toBe('ready');
  });

  test('auth expiring inside 48h → expiring', () => {
    expect(deriveState({ ...healthy, authExpiresAt: future(6 * HOUR) })).toBe('expiring');
  });

  test('auth expiring beyond 48h → ready', () => {
    expect(deriveState({ ...healthy, authExpiresAt: future(72 * HOUR) })).toBe('ready');
  });

  test('null authExpiresAt (session cookies) → ready, not expiring', () => {
    expect(deriveState({ ...healthy, authExpiresAt: null })).toBe('ready');
  });

  test('a wrong store outranks expiring', () => {
    expect(deriveState({ ...healthy, storeId: '809', authExpiresAt: future(1 * HOUR) })).toBe('wrongStore');
  });

  test('null health → unreachable', () => {
    expect(deriveState(null)).toBe('unreachable');
  });
});

describe('useHebSession', () => {
  test('starts in checking, then resolves to ready', async () => {
    installMockFetch({ '/api/health': healthy });
    const { result } = renderHook(() => useHebSession());
    expect(result.current.state).toBe('checking');
    await waitFor(() => expect(result.current.state).toBe('ready'));
  });

  test('a 500 from health is unreachable, not signedOut', async () => {
    installMockFetch({ '/api/health': { status: 500, body: { error: 'boom' } } });
    const { result } = renderHook(() => useHebSession());
    await waitFor(() => expect(result.current.state).toBe('unreachable'));
  });

  test('an unparseable body is unreachable', async () => {
    installMockFetch({ '/api/health': { status: 200, body: 'not json at all' } });
    const { result } = renderHook(() => useHebSession());
    await waitFor(() => expect(result.current.state).toBe('unreachable'));
  });

  test('expired session surfaces signedOut', async () => {
    installMockFetch({ '/api/health': { ...healthy, sessionAuthenticated: false } });
    const { result } = renderHook(() => useHebSession());
    await waitFor(() => expect(result.current.state).toBe('signedOut'));
  });

  test('recheck resolves to the new state', async () => {
    installMockFetch({ '/api/health': healthy });
    const { result } = renderHook(() => useHebSession());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    await expect(result.current.recheck()).resolves.toBe('ready');
  });

  test('health payload is exposed for copy that names the bound store', async () => {
    installMockFetch({ '/api/health': { ...healthy, storeId: '809', storeSource: 'shopping' } });
    const { result } = renderHook(() => useHebSession());
    await waitFor(() => expect(result.current.state).toBe('wrongStore'));
    expect(result.current.health.storeId).toBe('809');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && set CI=true && npx.cmd react-scripts test --watchAll=false -t useHebSession`
Expected: FAIL — cannot resolve `./useHebSession`

- [ ] **Step 3: Add the endpoints**

In `grocery-checklist-app/src/config/api.js`, in the `// Clip Server` block after `clipServerHealth`:

```js
  clipImportStatus: `${CLIP_SERVER_URL}/api/import-session/status`,
```

and in the n8n webhook section:

```js
  hebSessionImport: `${API_BASE_URL}/heb_session_import`,
```

- [ ] **Step 4: Write minimal implementation**

Create `grocery-checklist-app/src/hooks/useHebSession.js`:

```js
import { useState, useEffect, useCallback, useRef } from 'react';
import { ENDPOINTS } from '../config/api';

/** Advisory window before the auth cookies lapse. */
const EXPIRING_WINDOW_MS = 48 * 3600 * 1000;

/**
 * The one place that decides what the HEB session state is.
 *
 * Precedence matters: reachability, then login, then store binding, then the
 * expiry advisory. Store binding is meaningless when logged out, so it never
 * outranks signedOut.
 */
export function deriveState(health) {
  if (!health) return 'unreachable';
  if (!health.sessionAuthenticated) return 'signedOut';

  // An older clip-server omits the store fields entirely. Absent is not the
  // same as wrong — treating it as a mismatch would flag every user during
  // the window where the app has deployed but the container has not.
  if (health.storeId !== undefined) {
    if (health.storeId === null) return 'noStore';
    if (String(health.storeId) !== String(health.storeExpected)) return 'wrongStore';
  }

  if (health.authExpiresAt) {
    const remaining = Date.parse(health.authExpiresAt) - Date.now();
    if (Number.isFinite(remaining) && remaining < EXPIRING_WINDOW_MS) return 'expiring';
  }

  return 'ready';
}

export function useHebSession() {
  const [state, setState] = useState('checking');
  const [health, setHealth] = useState(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const recheck = useCallback(async () => {
    let next;
    let payload = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(ENDPOINTS.clipServerHealth, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        next = 'unreachable';
      } else {
        // A 200 with an unreadable body is a broken server, not a logout.
        payload = await res.json();
        next = deriveState(payload);
      }
    } catch {
      next = 'unreachable';
      payload = null;
    }

    if (mounted.current) {
      setHealth(payload);
      setState(next);
    }
    return next;
  }, []);

  useEffect(() => { recheck(); }, [recheck]);

  return { state, health, recheck };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && set CI=true && npx.cmd react-scripts test --watchAll=false -t useHebSession`
Expected: PASS, 18 tests.

- [ ] **Step 6: Commit**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
git add src/hooks/useHebSession.js src/hooks/useHebSession.test.js src/config/api.js
git commit -m "feat: useHebSession derives one session state for the whole app

Seven states in strict precedence. An undefined storeId skips the store
check so the app tolerates a clip-server that has not been rebuilt yet.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: The shared sign-in panel

**Files:**
- Create: `grocery-checklist-app/src/hooks/useHebSessionImport.js`
- Create: `grocery-checklist-app/src/components/heb/HebSignInPanel.js`
- Create: `grocery-checklist-app/src/components/heb/HebSignInPanel.test.js`
- Delete: `grocery-checklist-app/src/hooks/useClipServerHealth.js`

**Interfaces:**
- Consumes: `useHebSession` (Task 7), `ENDPOINTS.hebSessionImport` / `ENDPOINTS.clipImportStatus`.
- Produces:
  - `useHebSessionImport({ recheck }) → { importing, error, runImport }`
  - `<HebSignInPanel state={...} health={...} onRecheck={...} />` — renders the remedy for `signedOut`, `noStore`, `wrongStore`, `expiring` and `unreachable`; renders `null` for `checking` and `ready`.

The panel must never render for `checking` — flashing "sign-in needed" at everyone on mount is a defect the 2026-09-05 UI review already fixed once.

**Testid warning:** this component uses `data-testid="heb-session-panel"`. Do **not** reuse `heb-signin-panel` — sub-project G put that one on the `ConnectionPanel` *root* as an axe scope target (`e2e/a11y.spec.js:293`). Since this panel renders inside `ConnectionPanel`, sharing the id would put two matching elements in the tree and make `getByTestId` throw. `ConnectionPanel`'s root keeps its existing testid untouched, so G's scoped axe run keeps working.

- [ ] **Step 1: Write the failing test**

Create `grocery-checklist-app/src/components/heb/HebSignInPanel.test.js`:

```js
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installMockFetch, restoreFetch } from '../../test-utils/mockFetch';
import { HebSignInPanel } from './HebSignInPanel';

const LOGIN_URL = 'https://heb-login.needexcelexpert.com';
afterEach(() => restoreFetch());

const renderPanel = (props) => render(
  <HebSignInPanel state="signedOut" health={null} onRecheck={jest.fn()} {...props} />
);

describe('HebSignInPanel visibility', () => {
  test('renders nothing while checking', () => {
    const { container } = renderPanel({ state: 'checking' });
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when ready', () => {
    const { container } = renderPanel({ state: 'ready' });
    expect(container).toBeEmptyDOMElement();
  });

  test('signedOut shows the sign-in heading', () => {
    renderPanel({ state: 'signedOut' });
    expect(screen.getByText('HEB sign-in needed')).toBeInTheDocument();
  });

  test('unreachable talks about the server, not about signing in', () => {
    renderPanel({ state: 'unreachable' });
    expect(screen.queryByText('HEB sign-in needed')).not.toBeInTheDocument();
    expect(screen.getByText(/clip server/i)).toBeInTheDocument();
  });
});

describe('HebSignInPanel remedies', () => {
  test('signedOut links to the phone login tunnel', () => {
    renderPanel({ state: 'signedOut' });
    expect(screen.getByRole('link', { name: /sign in to h-?e-?b/i })).toHaveAttribute('href', LOGIN_URL);
  });

  test('no longer tells the user to run a desktop command', () => {
    renderPanel({ state: 'signedOut' });
    expect(screen.queryByText(/scrape:login/)).not.toBeInTheDocument();
  });

  test('wrongStore names the store actually bound', () => {
    renderPanel({ state: 'wrongStore', health: { storeId: '809', storeExpected: '794' } });
    expect(screen.getByText(/809/)).toBeInTheDocument();
    expect(screen.getByText(/794/)).toBeInTheDocument();
  });

  test('noStore asks the user to pick a store', () => {
    renderPanel({ state: 'noStore', health: { storeId: null, storeExpected: '794' } });
    expect(screen.getByText(/choose/i)).toBeInTheDocument();
  });

  test('expiring is advisory and offers no import button', () => {
    renderPanel({ state: 'expiring', health: { authExpiresAt: new Date(Date.now() + 3600000).toISOString() } });
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument();
  });
});

describe('HebSignInPanel import flow', () => {
  test('tapping import posts to the webhook then rechecks', async () => {
    const user = userEvent.setup();
    const mock = installMockFetch({
      'heb_session_import': { started: true, alreadyRunning: false },
      '/api/health': { sessionAuthenticated: true, storeId: '794', storeExpected: '794', authExpiresAt: null },
    });
    const onRecheck = jest.fn().mockResolvedValue('ready');

    renderPanel({ state: 'signedOut', onRecheck });
    await user.click(screen.getByRole('button', { name: /I've signed in/i }));

    await waitFor(() => expect(mock.for('heb_session_import')).toHaveLength(1));
    await waitFor(() => expect(onRecheck).toHaveBeenCalled());
  });

  test('the import button is disabled while an import is in flight', async () => {
    const user = userEvent.setup();
    installMockFetch({
      'heb_session_import': { started: true, alreadyRunning: false },
      '/api/import-session/status': { running: true, lastResult: null },
    });
    const onRecheck = jest.fn().mockResolvedValue('signedOut');

    renderPanel({ state: 'signedOut', onRecheck });
    const button = screen.getByRole('button', { name: /I've signed in/i });
    await user.click(button);

    await waitFor(() => expect(button).toBeDisabled());
  });

  test('a 4xx shows the wait-and-retry message, not a raw error code', async () => {
    const user = userEvent.setup();
    installMockFetch({
      'heb_session_import': { status: 400, body: { success: false, error: 'Chrome profile has HEB cookies but does NOT look logged in' } },
    });

    renderPanel({ state: 'signedOut', onRecheck: jest.fn().mockResolvedValue('signedOut') });
    await user.click(screen.getByRole('button', { name: /I've signed in/i }));

    await waitFor(() => expect(screen.getByText(/few seconds/i)).toBeInTheDocument());
    expect(screen.queryByText(/HTTP 400/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && set CI=true && npx.cmd react-scripts test --watchAll=false -t HebSignInPanel`
Expected: FAIL — cannot resolve `./HebSignInPanel`

- [ ] **Step 3: Write the import hook**

Create `grocery-checklist-app/src/hooks/useHebSessionImport.js`:

```js
import { useState, useCallback, useRef, useEffect } from 'react';
import { ENDPOINTS, apiJson, userMessage } from '../config/api';

const POLL_INTERVAL_MS = 3000;
const POLL_CEILING_MS = 120000;

/** The import's usual first-tap outcome: Chrome has not flushed cookies yet. */
const NOT_SYNCED_MESSAGE = 'Give it a few seconds after signing in, then try again.';

export function useHebSessionImport({ recheck }) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const runImport = useCallback(async () => {
    setImporting(true);
    setError(null);
    try {
      // The import is long and expensive; never retry it automatically, and
      // never let the default 30s timeout abort a request the server honours.
      await apiJson(ENDPOINTS.hebSessionImport, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        retries: 0,
        timeout: 90000,
      });

      // The webhook returns as soon as the import STARTS, so the real answer
      // comes from polling health until the session flips.
      const deadline = Date.now() + POLL_CEILING_MS;
      // `mounted.current` is part of the loop condition, not just a setState
      // guard: without it the poll keeps running after the component goes
      // away, which leaves timers open in Jest and risks act() warnings
      // against a suite that gates on zero.
      while (mounted.current && Date.now() < deadline) {
        const state = await recheck();
        if (state !== 'signedOut' && state !== 'unreachable') {
          if (mounted.current) setImporting(false);
          return state;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      if (!mounted.current) return null;
      if (mounted.current) setError(NOT_SYNCED_MESSAGE);
    } catch (err) {
      // A 4xx is the expected "profile not synced yet" case, not an incident.
      if (mounted.current) {
        setError(err?.status >= 400 && err?.status < 500 ? NOT_SYNCED_MESSAGE : userMessage(err, 'Import failed.'));
      }
    } finally {
      if (mounted.current) setImporting(false);
    }
    return null;
  }, [recheck]);

  return { importing, error, runImport };
}
```

- [ ] **Step 4: Write the panel**

Create `grocery-checklist-app/src/components/heb/HebSignInPanel.js`:

```js
import React from 'react';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { useHebSessionImport } from '../../hooks/useHebSessionImport';

const LOGIN_URL = 'https://heb-login.needexcelexpert.com';
const SILENT_STATES = ['checking', 'ready'];

function copyFor(state, health) {
  const expected = health?.storeExpected || '794';
  switch (state) {
    case 'unreachable':
      return {
        title: 'Clip server offline',
        body: 'Coupon clipping and the cart builder are unavailable. The clip server may need restarting.',
        needsSignIn: false,
      };
    case 'signedOut':
      return {
        title: 'HEB sign-in needed',
        body: 'The saved HEB login has expired, so clipping and the cart builder can\u2019t reach HEB. Sign in below, then import the session.',
        needsSignIn: true,
      };
    case 'noStore':
      return {
        title: 'Choose your HEB store',
        body: `This session has no store selected. Sign in below, choose H\u2011E\u2011B McKinney (store #${expected}), then import the session.`,
        needsSignIn: true,
      };
    case 'wrongStore':
      return {
        title: 'Wrong HEB store',
        body: `This session is bound to store ${health?.storeId}, but the aisle order and product availability are set up for store #${expected}. Sign in below, switch stores, then import.`,
        needsSignIn: true,
      };
    case 'expiring':
      return {
        title: 'HEB sign-in expiring soon',
        body: 'The HEB login lapses within two days. Clip what you need, or sign in again before your next trip.',
        needsSignIn: false,
      };
    default:
      return null;
  }
}

const HebSignInPanel = ({ state, health, onRecheck }) => {
  const { importing, error, runImport } = useHebSessionImport({ recheck: onRecheck });

  if (SILENT_STATES.includes(state)) return null;
  const copy = copyFor(state, health);
  if (!copy) return null;

  const Icon = state === 'unreachable' ? WifiOff : AlertTriangle;

  return (
    <div
      data-testid="heb-session-panel"
      className="mb-4 p-4 bg-surface border border-default rounded-2xl shadow-warm transition-colors duration-200"
    >
      <div className="flex items-start gap-3">
        <Icon className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold font-display text-heading">{copy.title}</h2>
          <p className="mt-1 text-sm text-body">{copy.body}</p>

          {copy.needsSignIn && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <a
                href={LOGIN_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl font-medium text-sm bg-primary text-white hover:bg-primary-hover transition-colors"
              >
                <ExternalLink size={16} />
                Sign in to HEB
              </a>
              <button
                type="button"
                onClick={runImport}
                disabled={importing}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl font-medium text-sm transition-colors ${
                  importing
                    ? 'bg-background text-muted cursor-wait'
                    : 'bg-background text-body hover:bg-default border border-default'
                }`}
              >
                {/* Escapes like \u2026 render literally in a JSX text node \u2014 use the
                    character itself or an HTML entity. */}
                {importing
                  ? <><Loader2 size={16} className="animate-spin" />Importing&hellip;</>
                  : <><RefreshCw size={16} />I&apos;ve signed in &mdash; import it</>}
              </button>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-muted">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export { HebSignInPanel };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && set CI=true && npx.cmd react-scripts test --watchAll=false -t HebSignInPanel`
Expected: PASS, 12 tests.

- [ ] **Step 6: Delete the superseded hook**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
git rm src/hooks/useClipServerHealth.js
```
It has exactly one consumer (`Deals.js`), rewired in Task 10. If `npm run lint` reports it as still imported, Task 10 has not run yet — that is expected; do Task 10 before the final gate.

- [ ] **Step 7: Commit**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
git add src/hooks/useHebSessionImport.js src/components/heb/HebSignInPanel.js src/components/heb/HebSignInPanel.test.js
git commit -m "feat: shared HEB sign-in panel with phone re-login

One component for signedOut/noStore/wrongStore/expiring/unreachable,
rendered by both Cart and Deals. Links to the Kasm tunnel and imports the
session through the keyed webhook, polling health for the real outcome.
Replaces a desktop-only scrape:login instruction.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Cart consumes the shared state

**Files:**
- Modify: `grocery-checklist-app/src/components/cart/ConnectionPanel.js`
- Modify: `grocery-checklist-app/src/components/HebCart.js` (the `active` auto-advance, ~line 517)
- Modify: `grocery-checklist-app/src/hooks/useClipSession.js` (drop its login opinion)
- Modify: `grocery-checklist-app/src/components/HebCart.ConnectionPanel.test.js`, `HebCart.test.js`, `HebCart.session.test.js`, `src/hooks/useClipSession.test.js`, `src/test-utils/cartFixtures.js`

**Interfaces:**
- Consumes: `useHebSession` (Task 7), `HebSignInPanel` (Task 8).
- Produces: no new exports. `ConnectionPanel` gains props `hebState` and `hebHealth`; `useClipSession` stops returning a `loginSessionValid` opinion of its own and simply passes through what `/session/status` reports.

- [ ] **Step 1: Write the failing test**

Add to `grocery-checklist-app/src/components/HebCart.ConnectionPanel.test.js`:

```js
describe('ConnectionPanel under the shared session state', () => {
  const noop = () => {};

  test('signedOut renders the shared panel, not the old inline copy', () => {
    render(
      <ConnectionPanel
        sessionStatus={{ active: false, loginSessionValid: false }}
        hebState="signedOut"
        hebHealth={null}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    expect(screen.getByTestId('heb-session-panel')).toBeInTheDocument();
    expect(screen.queryByText(/scrape:login/)).not.toBeInTheDocument();
  });

  test('CRITICAL: signedOut wins even when a stale browser session is active', () => {
    // Without this, HebCart's auto-advance hides the remedy behind a browser
    // session whose cookies HEB has already rejected.
    render(
      <ConnectionPanel
        sessionStatus={{ active: true, loginSessionValid: true, idleSeconds: 5 }}
        hebState="signedOut"
        hebHealth={null}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    expect(screen.getByTestId('heb-session-panel')).toBeInTheDocument();
  });

  test('Connect is disabled while signedOut', () => {
    render(
      <ConnectionPanel
        sessionStatus={{ active: false, loginSessionValid: true }}
        hebState="signedOut"
        hebHealth={null}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    const connect = screen.queryByRole('button', { name: /Connect to HEB/ });
    expect(connect === null || connect.disabled).toBe(true);
  });

  test('checking renders neither the panel nor a premature Connect', () => {
    const { container } = render(
      <ConnectionPanel
        sessionStatus={null}
        hebState="checking"
        hebHealth={null}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    expect(container.querySelector('[data-testid="heb-session-panel"]')).toBeNull();
    expect(screen.getByText('Checking connection…')).toBeInTheDocument();
  });

  test('ready shows the Connect button', () => {
    render(
      <ConnectionPanel
        sessionStatus={{ active: false, loginSessionValid: true }}
        hebState="ready"
        hebHealth={null}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    expect(screen.getByRole('button', { name: /Connect to HEB/ })).toBeEnabled();
  });

  test('NEW BEHAVIOR: Cart warns when the session is expiring, but stays usable', () => {
    // Cart has never had this warning — Deals had it and Cart did not.
    render(
      <ConnectionPanel
        sessionStatus={{ active: false, loginSessionValid: true }}
        hebState="expiring"
        hebHealth={{ authExpiresAt: new Date(Date.now() + 3600000).toISOString() }}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    expect(screen.getByTestId('heb-session-panel')).toBeInTheDocument();
    expect(screen.getByText(/expiring soon/i)).toBeInTheDocument();
    // Advisory, not blocking.
    expect(screen.getByRole('button', { name: /Connect to HEB/ })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && set CI=true && npx.cmd react-scripts test --watchAll=false HebCart.ConnectionPanel`
Expected: FAIL — the panel testid is absent and `scrape:login` is still rendered.

- [ ] **Step 3: Rewrite ConnectionPanel's expired branch**

In `ConnectionPanel.js`: accept `hebState` and `hebHealth`; import `HebSignInPanel`; derive

```js
  // `blocked` gates the Connect button. It deliberately EXCLUDES 'expiring',
  // which is advisory: the session still works, so connecting must stay
  // available.
  const blocked = ['signedOut', 'noStore', 'wrongStore', 'unreachable'].includes(hebState);
  const isChecking = hebState === 'checking';
```

Replace the entire `isExpired && (...)` block (lines 56-101, the paragraph, "Check again" button, and the `scrape:login` disclosure) with an **unconditional** render — the panel self-silences on `checking` and `ready`, and rendering it unconditionally is what gives Cart the `expiring` warning it has never had:

```js
      <HebSignInPanel state={hebState} health={hebHealth} onRecheck={onRecheck} />
```

Do **not** gate this on `blocked`; that would drop `expiring` and contradict spec §4.

Change the header line to use `blocked` rather than the old `isExpired`, and gate the Connect/Disconnect row on `!blocked && !isChecking`. Connect stays disabled unless `hebState === 'ready' || hebState === 'expiring'`.

Delete the now-unused `handleRecheck`, `rechecking`, `showDetails`, `ChevronDown`, `ChevronUp`, `RefreshCw` and `toast` imports — Netlify CI treats unused imports as errors.

- [ ] **Step 4: Pass the state down and stop the auto-advance**

In `HebCart.js`: call `const { state: hebState, health: hebHealth, recheck: hebRecheck } = useHebSession();`, pass `hebState`/`hebHealth` to `ConnectionPanel`, and pass `hebRecheck` as `onRecheck`.

Guard the auto-advance (~line 517) so a stale browser session cannot hide the remedy:

```js
    if (sessionStatus?.active && hebState !== 'signedOut' && hebState !== 'unreachable') {
      setStep('review');
    }
```

Add `hebState` to that effect's dependency array.

In `useClipSession.js`, remove the fabricated `loginSessionValid: true` in `startSession` (line 43) — it asserted a login fact the hook no longer owns:

```js
    setSessionStatus({ active: true, sessionId: data.sessionId, idleSeconds: 0 });
```

- [ ] **Step 5: Update the existing Cart assertions**

- `HebCart.test.js:65-66` — this asserts the `scrape:login` disclosure exists **and** that `getByTestId('heb-signin-panel')` contains it. Both go: the disclosure is deleted with the old panel. Replace the pair with `expect(screen.getByTestId('heb-session-panel')).toBeInTheDocument()`. Leave `ConnectionPanel`'s own root testid in place.
- `HebCart.ConnectionPanel.test.js:43` — replace the `scrape:login` assertion with `expect(screen.getByTestId('heb-session-panel')).toBeInTheDocument()`.
- `HebCart.test.js`, `HebCart.session.test.js` — these mock only `/api/heb/session/status`; Cart now also calls `/api/health`. Add a `/api/health` entry to each `installMockFetch` map (`{ sessionAuthenticated: false }` for expired cases, `{ sessionAuthenticated: true, storeId: '794', storeExpected: '794', authExpiresAt: null }` for healthy ones), or `mock.unmocked()` assertions will fail.
- `src/hooks/useClipSession.test.js` — any assertion that `startSession` leaves `loginSessionValid: true` on the status object must go; the hook no longer asserts that fact. Assert `{ active: true, sessionId, idleSeconds: 0 }` instead.
- `src/test-utils/cartFixtures.js` — add matching health fixtures:

```js
export const healthySessionHealth = { sessionAuthenticated: true, storeId: '794', storeSource: 'curr', storeExpected: '794', authExpiresAt: null };
export const expiredSessionHealth = { sessionAuthenticated: false, sessionReason: 'no_auth_cookies', storeId: null, storeSource: null, storeExpected: '794', authExpiresAt: null };
```

- [ ] **Step 6: Run the Cart suites, then the whole Jest suite**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
set CI=true && npx.cmd react-scripts test --watchAll=false HebCart
set CI=true && npx.cmd react-scripts test --watchAll=false
```
Expected: Cart suites PASS; full suite PASS with zero `act()` warnings.

- [ ] **Step 7: Commit**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
git add src/components/cart/ConnectionPanel.js src/components/HebCart.js src/hooks/useClipSession.js src/components/HebCart.ConnectionPanel.test.js src/components/HebCart.test.js src/components/HebCart.session.test.js src/test-utils/cartFixtures.js
git commit -m "feat: Cart renders the shared HEB session state

signedOut now outranks an active browser session, so a stale session can
no longer auto-advance past the remedy. useClipSession stops asserting
loginSessionValid on connect, a fact it does not own.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Deals consumes the shared state

**Files:**
- Modify: `grocery-checklist-app/src/components/Deals.js:340-341`, `:857-886` (the three banners)
- Modify: `grocery-checklist-app/src/components/Deals.test.js:16,30`

**Interfaces:**
- Consumes: `useHebSession` (Task 7), `HebSignInPanel` (Task 8).
- Produces: no new exports.

This removes the "Session Manager" instruction, which names a component sub-project A deleted.

- [ ] **Step 1: Write the failing test**

Add to `grocery-checklist-app/src/components/Deals.test.js`:

```js
describe('Deals HEB session state', () => {
  test('expired session renders the shared panel', async () => {
    installMockFetch({ ...base(), '/api/health': { sessionAuthenticated: false, storeId: null, storeExpected: '794' } });
    render(<Deals />);
    expect(await screen.findByTestId('heb-session-panel')).toBeInTheDocument();
  });

  test('never mentions Session Manager — that component was deleted', async () => {
    installMockFetch({ ...base(), '/api/health': { sessionAuthenticated: false, storeId: null, storeExpected: '794' } });
    render(<Deals />);
    await screen.findByTestId('heb-session-panel');
    expect(screen.queryByText(/Session Manager/i)).not.toBeInTheDocument();
  });

  test('wrong store blocks clipping and names the bound store', async () => {
    installMockFetch({ ...base(), '/api/health': { sessionAuthenticated: true, storeId: '809', storeSource: 'shopping', storeExpected: '794', authExpiresAt: null } });
    render(<Deals />);
    expect(await screen.findByText(/809/)).toBeInTheDocument();
  });

  test('a healthy session shows no panel', async () => {
    installMockFetch({ ...base(), '/api/health': { sessionAuthenticated: true, storeId: '794', storeSource: 'curr', storeExpected: '794', authExpiresAt: null } });
    render(<Deals />);
    await waitFor(() => expect(screen.queryByTestId('heb-session-panel')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && set CI=true && npx.cmd react-scripts test --watchAll=false Deals`
Expected: FAIL — no `heb-session-panel` testid.

- [ ] **Step 3: Rewire Deals**

Replace lines 340-341:

```js
  const { state: hebState, health: hebHealth, recheck: hebRecheck } = useHebSession();
  const clipServerUnavailable = ['unreachable', 'signedOut', 'noStore', 'wrongStore'].includes(hebState);
```

Replace the three banner blocks (lines ~857-886 — the `unreachable`, `expired` and `expiring` conditionals) with one line:

```js
      <HebSignInPanel state={hebState} health={hebHealth} onRecheck={hebRecheck} />
```

Update the import at line 11 from `useClipServerHealth` to `useHebSession`, and add the `HebSignInPanel` import. Remove `WifiOff` / `AlertTriangle` from the lucide import if nothing else in the file uses them.

**Note:** `clipServerUnavailable` now also covers `noStore` and `wrongStore`, so the selection toolbar and checkboxes disable in those states too. That is intended — clipping against the wrong store silently clips the wrong prices.

- [ ] **Step 4: Update the existing Deals fixtures**

`Deals.test.js:16` and `:30` currently supply `/api/health` bodies without store fields. Add them so the tests exercise the real shape:

```js
  '/api/health': { ok: true, sessionValid: false, sessionAuthenticated: false, storeId: null, storeSource: null, storeExpected: '794', authExpiresAt: null },
```
and for the healthy variant:
```js
  '/api/health': { ok: true, sessionValid: true, sessionAuthenticated: true, sessionAgeHours: 1, storeId: '794', storeSource: 'curr', storeExpected: '794', authExpiresAt: null },
```

- [ ] **Step 5: Run the Deals suite and the full suite**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
set CI=true && npx.cmd react-scripts test --watchAll=false Deals
set CI=true && npx.cmd react-scripts test --watchAll=false
npm.cmd run lint
```
Expected: all PASS; lint reports 0 warnings (this is where a leftover `useClipServerHealth` import would surface).

- [ ] **Step 6: Commit**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
git add src/components/Deals.js src/components/Deals.test.js
git commit -m "feat: Deals renders the shared HEB session state

Replaces three hand-rolled banners, one of which told the user to open
Session Manager -- a component sub-project A deleted. Clipping now also
blocks on a wrong store binding, which would otherwise clip prices for
the wrong location.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: End-to-end coverage

**Files:**
- Modify: `grocery-checklist-app/e2e/support/mock-backend.js:151-155`
- Create: `grocery-checklist-app/e2e/fixtures/clip/health.nostore.json`, `health.wrongstore.json`, `health.expiring.json`
- Modify: `grocery-checklist-app/e2e/fixtures/clip/health.healthy.json`, `health.expired.json`
- Modify: `grocery-checklist-app/e2e/cart.spec.js:8-19`, `e2e/a11y.spec.js:285-290`
- Create: `grocery-checklist-app/e2e/heb-session.spec.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `backend.clip(state)` accepts `'healthy' | 'expired' | 'nostore' | 'wrongstore' | 'expiring'`.

- [ ] **Step 1: Extend the fixtures**

Add store fields to the two existing health fixtures. `health.healthy.json`:

```json
{
  "_recorded": { "at": "hand-written", "endpoint": "api/health", "sanitised": true },
  "ok": true,
  "sessionValid": true,
  "sessionAuthenticated": true,
  "sessionReason": "ok",
  "sessionAgeHours": 2,
  "authExpiresAt": null,
  "storeId": "794",
  "storeSource": "curr",
  "storeExpected": "794"
}
```

`health.expired.json`: same shape with `"sessionAuthenticated": false`, `"sessionReason": "no_auth_cookies"`, `"storeId": null`, `"storeSource": null`.

Create `health.nostore.json` (authenticated, `storeId: null`), `health.wrongstore.json` (authenticated, `storeId: "809"`, `storeSource: "shopping"`), and `health.expiring.json` (authenticated, `storeId: "794"`, `authExpiresAt` a fixed ISO timestamp ~6h after the suite's frozen clock of 2026-09-09).

Add matching `session-status.*.json` files for the three new states (copy `session-status.healthy.json`; the panel's behavior is driven by health, but `mock-backend` maps both by `clipState` and an unmapped path becomes an `unmocked` 404).

- [ ] **Step 2: Write the failing spec**

Create `grocery-checklist-app/e2e/heb-session.spec.js`:

```js
const { test, expect, open } = require('./support/test.js');

const main = (page) => page.locator('main');

test.describe('HEB session state', () => {
  test('expired session offers the phone re-login on Cart', async ({ page, backend }) => {
    backend.clip('expired');
    await open(page, 'cart');
    await expect(main(page).getByTestId('heb-session-panel')).toBeVisible();
    await expect(main(page).getByRole('link', { name: /Sign in to HEB/i }))
      .toHaveAttribute('href', 'https://heb-login.needexcelexpert.com');
  });

  test('wrong store names the bound store and blocks clipping on Deals', async ({ page, backend }) => {
    backend.clip('wrongstore');
    await open(page, 'deals');
    await expect(page.getByTestId('heb-session-panel')).toBeVisible();
    await expect(page.getByText(/809/)).toBeVisible();
  });

  test('healthy session shows no panel on either screen', async ({ page, backend }) => {
    backend.clip('healthy');
    await open(page, 'deals');
    await expect(page.getByTestId('heb-session-panel')).toHaveCount(0);
    await open(page, 'cart');
    await expect(main(page).getByTestId('heb-session-panel')).toHaveCount(0);
  });

  test('import posts to the webhook and re-polls health', async ({ page, backend }) => {
    backend.clip('expired');
    await open(page, 'cart');
    const before = backend.calls('api/health').length;
    await main(page).getByRole('button', { name: /I've signed in/i }).click();
    await expect.poll(() => backend.calls('heb_session_import').length).toBeGreaterThan(0);
    await expect.poll(() => backend.calls('api/health').length).toBeGreaterThan(before);
  });
});
```

- [ ] **Step 3: Teach the mock backend the new states and the webhook**

In `e2e/support/mock-backend.js`, the `handleClip` map already keys fixtures by `this.clipState`, so the new fixture files work once they exist. Add the import status route beside the others:

```js
    if (p === 'api/import-session/status') return this.fulfil(route, 200, { running: false, lastResult: { success: true }, lastFinishedAt: null });
```

In the n8n handler, add `heb_session_import` returning `{ started: true, alreadyRunning: false }`.

- [ ] **Step 4: Fix the two specs that assert the old behavior**

`e2e/cart.spec.js:8-19` — the comment and the test assert that Cart calls only `api/heb/session/status` and never `api/health`. Cart now calls both. Rewrite the assertion to poll `api/health` instead, and replace the stale comment:

```js
    // Cart's recheck now runs through useHebSession, which polls /api/health —
    // the same endpoint Deals uses. That shared path is the point of the change.
    const before = backend.calls('api/health').length;
    await main(page).getByRole('button', { name: /I've signed in/i }).click();
    await expect.poll(() => backend.calls('api/health').length).toBeGreaterThan(before);
```

`e2e/a11y.spec.js` — only the disclosure block (lines ~285-290) changes. The "Show technical details" toggle, its `aria-expanded` assertion and the `npm run scrape:login` text all disappear with the old panel, so delete those lines and re-point the 44px target measurement (`expectTarget` / `expectHitTarget`) at the new "I've signed in — import it" button.

**Leave lines 270 and 293 alone.** `getByTestId('heb-signin-panel')` still resolves to the `ConnectionPanel` root, and the scoped axe run at 293 still targets the right subtree — which now includes the new panel, so accessibility coverage of the new markup comes for free. If either line is edited, G's scoped audit silently stops covering Cart.

- [ ] **Step 5: Run the e2e suite in the FOREGROUND**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && npm.cmd run test:e2e`
Expected: PASS. **Do not background this** — backgrounded Playwright runs stop mid-turn.

- [ ] **Step 6: Commit**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
git add e2e/
git commit -m "test: e2e coverage for every HEB session state

Fixtures for nostore/wrongstore/expiring, and specs for the phone
re-login path. Updates cart.spec and a11y.spec, which asserted the old
desktop-only panel.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Gates, deploy, live verification

**Files:**
- Modify: `grocery-checklist-app/docs/superpowers/hardening-checklist.md` (tick C)
- Create: `grocery-checklist-app/docs/superpowers/reports/2026-09-16-heb-session-lifecycle-release.md`

**Interfaces:** consumes everything.

**This task deploys to production and needs the user in the loop.**

- [ ] **Step 1: Run the full gates from a clean shell**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
npm.cmd run lint
set CI=true && npx.cmd react-scripts test --watchAll=false
npm.cmd run test:e2e
```
Expected: lint 0 warnings; Jest all green with zero `act()` warnings; e2e all green with no retries. Record the counts — they go in the report.

- [ ] **Step 2: Confirm the container is already ahead of the app**

```bash
curl -s https://clip.needexcelexpert.com/api/health | python -m json.tool
```
Expected: `storeId`, `storeSource`, `storeExpected`, `authExpiresAt`, `sessionReason` all present. **If any is missing, stop** — Task 6 did not take effect, and merging the app now would put every user into `wrongStore`.

- [ ] **Step 3: Merge and let Netlify deploy**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
git checkout main && git merge --ff-only feat/heb-session-lifecycle
git push origin main
```

Wait for the Netlify deploy, then confirm the published bundle changed.

- [ ] **Step 4: Live verification with the user** *(requires the user's phone)*

Ask the user to:
1. Open `#cart` — expect the sign-in panel, since the live session is bound to 809 and is `wrongStore` (or `signedOut`).
2. Tap **Sign in to HEB**, sign in at the Kasm tunnel, and **choose H-E-B McKinney, store #794** while there.
3. Return to the app and tap **I've signed in — import it**.
4. Confirm the panel clears within ~2 minutes.

Then verify the binding actually changed:

```bash
curl -s https://clip.needexcelexpert.com/api/health | python -m json.tool | grep -E "storeId|storeSource|sessionAuthenticated"
```
Expected: `sessionAuthenticated: true`, `storeId: "794"`, `storeSource: "curr"`.

- [ ] **Step 5: Confirm no telemetry regression**

```bash
source /c/hsa-automation/.env
docker exec hsa-mysql mysql -uhsa_user -p"$MYSQL_DB_PASSWORD" hsa \
  -e "SELECT COUNT(*) AS total FROM client_errors;"
```
Expected: still exactly 1 (the permanent live sentinel, row id 7 — **never delete it**). Any new row means the import path is filing telemetry, which Task 6's `neverError` setting exists to prevent.

- [ ] **Step 6: Tick the checklist and write the release report**

Tick section C and its four bullets in `docs/superpowers/hardening-checklist.md`. Note in the report that the checklist's Slack bullet was retired by decision, not implemented.

Write `docs/superpowers/reports/2026-09-16-heb-session-lifecycle-release.md` covering: the shipped behavior, exact gate counts, the live verification result, the store re-binding outcome, and the deferrals carried forward (the six-week-old scrape data, `ready` being a cookie-shape heuristic, the unauthenticated `/api/clip` surface).

- [ ] **Step 7: Commit the docs**

```bash
cd "C:/New Grocery App/grocery-checklist-app"
git add docs/superpowers/hardening-checklist.md docs/superpowers/reports/2026-09-16-heb-session-lifecycle-release.md
git commit -m "docs: record shipped HEB session lifecycle

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

## Deferred (recorded, not implemented)

- The weekly scrape has been WAF-blocked since 2026-08-20; coupon data is ~6 weeks stale and **nothing currently surfaces this**. Belongs to sub-project F.
- `ready` remains a cookie-shape heuristic, not an HEB-verified login. Wiring the existing `SESSION_EXPIRED` signal (`useClipCoupons.js:95`) into a recheck would tighten it.
- `/api/clip` and `/api/heb/*` stay unauthenticated on the public hostname.
- All prior A/B/E/G/D deferrals in the checklist stand.
