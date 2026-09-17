# Sub-project F — Health Honesty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/health` report only what it has actually verified, and make the app act on that truthfully — without inventing a remedy the user cannot act on.

**Architecture:** One pure predicate (`evaluateServerHealth`) decides the server verdict from injected inputs, exactly as `evaluateSession` does for the session. The endpoint gathers three bounded, parallel probes and hands them to the predicate. The app derives a new `degraded` state that blocks clipping and cart-building but always offers a working escape. Product text is normalised (not merely decoded) where it enters the database.

**Tech Stack:** Node 20 / Express / mysql2 (scraper, CommonJS, Jest). React 18 / CRA / Tailwind (app, Jest via react-scripts + Playwright e2e). MySQL 8 in Docker.

**Spec:** `docs/superpowers/specs/2026-09-17-health-honesty-design.md` — read §2 (the rules this must not break) and §9 (two corrections already made) before starting.

## Global Constraints

- **Two repos.** Scraper: `C:\New Grocery App\heb-coupon-scraper` (branch `master`, **no git remote** — never push). App: `C:\New Grocery App\grocery-checklist-app` (branch `main`, pushes to GitHub, Netlify auto-deploys).
- **Windows.** Use `npm.cmd` / `npx.cmd`. Set `CI=true` in every fresh shell.
- **Scraper tests:** `CI=true npx.cmd jest test/<file>`. **App tests:** `CI=true npx.cmd react-scripts test --testPathPattern="<pattern>" --watchAll=false` — bare `jest` fails with "Cannot use import statement outside a module".
- **App e2e runs in the FOREGROUND only:** `CI=true npm.cmd run test:e2e` (~2.4 min). Backgrounded runs stop mid-turn.
- Netlify CI treats **ESLint warnings as errors**. `npm.cmd run lint` must pass at `--max-warnings=0`.
- Tailwind JIT: **no dynamic class names** (`bg-${x}-100` silently produces nothing).
- `@testing-library/user-event` is pinned at **13.5.0** — `userEvent.setup()` does NOT exist; use `fireEvent`. Use `findByText`; `waitFor(() => expect(getByText(...)))` fails lint.
- `src/index.js` wraps the app in `<React.StrictMode>` — effects run twice.
- **Copy rule:** say *"the clip server can't reach its database"*, never *"the database is down"*. Say *"coupon data"*, never *"deals"* (`heb_scraping_history` records the coupon scraper only).
- **Never assert anything about the user's HEB sign-in from the `degraded` state.**
- Commit messages end with: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Repo files are **CRLF**. Use the Edit tool; multi-line `node -e` replacement with `\n` silently does nothing.

---

## File Structure

**Scraper (`heb-coupon-scraper`)**

| File | Responsibility |
|---|---|
| `src/clip-server-health.js` | *Modify.* Already owns "builds the /api/health payload". Gains `evaluateServerHealth`. Deliberately **not** `heb-session.js`, which is scoped to session usability. |
| `src/text-normalize.js` | *Create.* One pure export, `normalizeProductText`. |
| `src/clip-server.js` | *Modify.* The `/api/health` handler (~lines 82-122). |
| `src/database.js` | *Modify.* Apply normalisation in both upserts. |
| `src/scrape-frequent.js` | *Modify.* Apply normalisation before write. |
| `scripts/backfill-product-text.js` | *Create.* One-off, idempotent, host-side backfill. |
| `test/health-payload.test.js` | *Modify.* Extend for the new fields. |
| `test/server-health.test.js` | *Create.* The predicate. |
| `test/text-normalize.test.js` | *Create.* The normaliser. |

**App (`grocery-checklist-app`)**

| File | Responsibility |
|---|---|
| `src/hooks/useHebSession.js` | *Modify.* `deriveState` gains `degraded`. |
| `src/components/heb/HebSignInPanel.js` | *Modify.* `degraded` copy + "Check again" button. |
| `src/components/Deals.js` | *Modify.* Gate clip controls; render the freshness line. |
| `src/components/HebCart.js` | *Modify.* `autoAdvanceAllowed`. |
| `src/components/cart/ConnectionPanel.js` | *Modify.* `blocked`. |
| `e2e/fixtures/clip/health.*.json` | *Modify/Create.* New payload shape + a degraded pair. |

---

## Task 1: The `evaluateServerHealth` predicate

**Files:**
- Modify: `src/clip-server-health.js`
- Test: `test/server-health.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `evaluateServerHealth({ dbReachable, couponsQueryable, lastScrapeAt, now, staleAfterDays })` → `{ status: 'ok'|'degraded', degradedReason: null|'db_unreachable'|'coupons_unavailable', dataStale: boolean, staleDays: number|null }`. Also exports `STALE_AFTER_DAYS` (number, 8).

- [ ] **Step 1: Write the failing test**

Create `test/server-health.test.js`:

```js
const { evaluateServerHealth, STALE_AFTER_DAYS } = require('../src/clip-server-health');

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse('2026-09-17T12:00:00Z');
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const base = { dbReachable: true, couponsQueryable: true, lastScrapeAt: ago(1), now: NOW };

describe('evaluateServerHealth — can the server do its job', () => {
  test('everything up is ok', () => {
    expect(evaluateServerHealth(base)).toMatchObject({ status: 'ok', degradedReason: null });
  });

  test('an unreachable database degrades', () => {
    expect(evaluateServerHealth({ ...base, dbReachable: false })).toMatchObject({
      status: 'degraded', degradedReason: 'db_unreachable',
    });
  });

  test('a reachable database with a broken coupons table still degrades', () => {
    // Clipping maps hash_id -> heb_coupon_id before it contacts HEB, so a
    // SELECT 1 that passes proves nothing on its own.
    expect(evaluateServerHealth({ ...base, couponsQueryable: false })).toMatchObject({
      status: 'degraded', degradedReason: 'coupons_unavailable',
    });
  });

  test('unreachable outranks unqueryable — the more fundamental fault is named', () => {
    expect(evaluateServerHealth({ ...base, dbReachable: false, couponsQueryable: false }))
      .toMatchObject({ degradedReason: 'db_unreachable' });
  });
});

describe('evaluateServerHealth — staleness is advisory', () => {
  test('fresh data is not stale', () => {
    expect(evaluateServerHealth(base)).toMatchObject({ dataStale: false, staleDays: 1 });
  });

  test('exactly at the threshold is stale', () => {
    expect(evaluateServerHealth({ ...base, lastScrapeAt: ago(STALE_AFTER_DAYS) }))
      .toMatchObject({ dataStale: true, staleDays: 8 });
  });

  test('one day under the threshold is not', () => {
    expect(evaluateServerHealth({ ...base, lastScrapeAt: ago(STALE_AFTER_DAYS - 1) }))
      .toMatchObject({ dataStale: false, staleDays: 7 });
  });

  test('stale data does NOT degrade the server — stale coupons still clip', () => {
    expect(evaluateServerHealth({ ...base, lastScrapeAt: ago(30) }))
      .toMatchObject({ status: 'ok', dataStale: true });
  });

  test('accepts a Date, because mysql2 returns TIMESTAMP as a Date', () => {
    expect(evaluateServerHealth({ ...base, lastScrapeAt: new Date(NOW - 9 * DAY) }))
      .toMatchObject({ dataStale: true, staleDays: 9 });
  });
});

describe('evaluateServerHealth — absent is not wrong', () => {
  test('lastScrapeAt null means UNKNOWN, never infinitely stale', () => {
    // The bug this sub-project fixes made this field null for months. If null
    // meant stale, the fix would replace a silent lie with a permanent banner
    // nobody can clear.
    expect(evaluateServerHealth({ ...base, lastScrapeAt: null }))
      .toMatchObject({ dataStale: false, staleDays: null });
  });

  test('an unparseable timestamp is also unknown, not stale', () => {
    expect(evaluateServerHealth({ ...base, lastScrapeAt: 'not-a-date' }))
      .toMatchObject({ dataStale: false, staleDays: null });
  });

  test('dbReachable null means NOT PROBED and does not degrade', () => {
    expect(evaluateServerHealth({ ...base, dbReachable: null })).toMatchObject({ status: 'ok' });
  });

  test('couponsQueryable null means NOT PROBED and does not degrade', () => {
    expect(evaluateServerHealth({ ...base, couponsQueryable: null })).toMatchObject({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\New Grocery App\heb-coupon-scraper" && CI=true npx.cmd jest test/server-health.test.js`
Expected: FAIL — `evaluateServerHealth is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/clip-server-health.js`, above `module.exports`:

```js
/**
 * Days without a successful coupon scrape before the data is called stale.
 * The scrape is weekly (Thursday), so 8 days is one missed run plus a day's
 * grace. Injectable so tests never depend on the calendar.
 */
const STALE_AFTER_DAYS = 8;

/**
 * Can this server do its job, and how old is its data?
 *
 * Pure. Two axes that must NOT be merged:
 *   status    — can the server work at all. MAY block the user.
 *   dataStale — how old the coupon data is. ADVISORY, never blocks (R14).
 *
 * Merging them would let a missed Thursday disable clipping, which is a
 * remedy nobody can act on.
 */
function evaluateServerHealth({
  dbReachable, couponsQueryable, lastScrapeAt, now = Date.now(), staleAfterDays = STALE_AFTER_DAYS,
}) {
  // null/undefined mean NOT PROBED for both inputs, and never degrade.
  let status = 'ok';
  let degradedReason = null;
  if (dbReachable === false) {
    status = 'degraded';
    degradedReason = 'db_unreachable';
  } else if (couponsQueryable === false) {
    // Reachable but the coupon table is not usable: clipping needs it to map
    // hash_id -> heb_coupon_id before HEB is ever contacted.
    status = 'degraded';
    degradedReason = 'coupons_unavailable';
  }

  let staleDays = null;
  let dataStale = false;
  if (lastScrapeAt !== null && lastScrapeAt !== undefined) {
    const ms = lastScrapeAt instanceof Date ? lastScrapeAt.getTime() : Date.parse(lastScrapeAt);
    if (Number.isFinite(ms)) {
      staleDays = Math.floor((now - ms) / 86400000);
      dataStale = staleDays >= staleAfterDays;
    }
  }

  return { status, degradedReason, dataStale, staleDays };
}
```

Change the export line to:

```js
module.exports = { buildSessionHealth, evaluateServerHealth, STALE_AFTER_DAYS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npx.cmd jest test/server-health.test.js test/health-payload.test.js`
Expected: PASS, both suites.

- [ ] **Step 5: Commit**

```bash
cd "C:\New Grocery App\heb-coupon-scraper"
git add src/clip-server-health.js test/server-health.test.js
git commit -m "feat(health): evaluateServerHealth predicate

Two axes that must not merge: status (can the server work, may block) and
dataStale (advisory, never blocks). Absent inputs mean NOT PROBED and
never degrade -- the null rule carried from sub-project C.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `/api/health` reports what it verified

**Files:**
- Modify: `src/clip-server.js` (the `/api/health` handler, ~lines 82-122)
- Modify: `src/database.js` (add `connectTimeout` to the pool)
- Test: `test/health-payload.test.js`

**Interfaces:**
- Consumes: `evaluateServerHealth`, `STALE_AFTER_DAYS` from Task 1.
- Produces: `/api/health` JSON gains `status: 'ok'|'degraded'|'error'`, `degradedReason`, `dataStale`, `staleDays`. `lastScrapeAt` now returns a real ISO string. All additive.

- [ ] **Step 1: Write the failing test**

Append to `test/health-payload.test.js`:

```js
const { evaluateServerHealth } = require('../src/clip-server-health');

describe('health payload contract', () => {
  test('a degraded verdict is still a 200-shaped payload, not an error', () => {
    // The compose healthcheck uses `curl -f`, which fails on >=400. Returning
    // 5xx for a degraded database would restart the container under a
    // condition restarting cannot fix.
    const v = evaluateServerHealth({ dbReachable: false, couponsQueryable: null, lastScrapeAt: null });
    expect(v.status).toBe('degraded');
    expect(v).toHaveProperty('degradedReason', 'db_unreachable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx.cmd jest test/health-payload.test.js`
Expected: FAIL — `evaluateServerHealth is not a function` if Task 1 is not merged; otherwise PASS (this test guards the contract Task 2 must honour). If it passes, proceed — the real verification for this task is Step 4.

- [ ] **Step 3: Rewrite the handler**

In `src/database.js`, inside `mysql.createPool({...})`, add after `queueLimit: 0,`:

```js
      // Explicit, because mysql2's default is 10s — longer than the app's own
      // 8s abort, which would make a hung DB look like an offline clip server
      // and send the user to restart the wrong component.
      connectTimeout: 5000,
```

In `src/clip-server.js`, replace the two `try { ... } catch {}` blocks (the coupon count and the last-scrape lookup) with:

```js
    // Bounded so the whole handler answers well inside the app's 8s abort.
    // Worst case: 2s + 0.5s retry + 2s = 4.5s.
    const PROBE_MS = 2000;
    const withDeadline = (p, ms) => Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), ms)),
    ]);

    let dbReachable = null;
    let couponsQueryable = null;
    let couponCount = null;
    let lastScrapeAt = null;

    try {
      await withDeadline(db.connect(), PROBE_MS);
    } catch (err) {
      console.warn('[health] db.connect failed:', err.message);
    }

    // Reachability, retried ONCE: this is the only input that can block the
    // user, and a pool with dead idle sockets (mysql2 idleTimeout 60s) throws
    // once after a MySQL restart. Blocking on that transient would be a
    // lockout.
    const probeReachable = async () => {
      await withDeadline(db.pool.execute('SELECT 1'), PROBE_MS);
      return true;
    };
    try {
      dbReachable = await probeReachable();
    } catch (first) {
      console.warn('[health] SELECT 1 failed, retrying once:', first.message);
      await new Promise((r) => setTimeout(r, 500));
      try {
        dbReachable = await probeReachable();
      } catch (second) {
        console.warn('[health] SELECT 1 failed twice:', second.message);
        dbReachable = false;
      }
    }

    if (dbReachable) {
      // Run the two content queries together; neither blocks the other.
      const [countRes, scrapeRes] = await Promise.allSettled([
        withDeadline(db.pool.execute('SELECT COUNT(*) as cnt FROM heb_coupons WHERE is_active = 1'), PROBE_MS),
        withDeadline(
          db.pool.execute('SELECT MAX(scraped_at) as latest FROM heb_scraping_history WHERE success = 1'),
          PROBE_MS
        ),
      ]);

      if (countRes.status === 'fulfilled') {
        couponsQueryable = true;
        couponCount = countRes.value[0][0]?.cnt ?? null;
      } else {
        // Reachable but unusable — a schema fault, which is exactly what hid
        // the `last_seen` bug for months when it was rounded to "no data".
        couponsQueryable = false;
        console.warn('[health] coupon count failed:', countRes.reason?.message);
      }

      if (scrapeRes.status === 'fulfilled') {
        const latest = scrapeRes.value[0][0]?.latest ?? null;
        lastScrapeAt = latest === null ? null : new Date(latest).toISOString();
      } else {
        console.warn('[health] last-scrape lookup failed:', scrapeRes.reason?.message);
      }
    }

    const serverHealth = evaluateServerHealth({ dbReachable, couponsQueryable, lastScrapeAt });
```

Then change the response object from `status: 'ok',` to:

```js
      status: serverHealth.status,
      degradedReason: serverHealth.degradedReason,
      dataStale: serverHealth.dataStale,
      staleDays: serverHealth.staleDays,
```

and keep `lastScrapeAt`, `couponCount` as they are. Add the import at the top of the file, alongside the existing `buildSessionHealth` import:

```js
const { buildSessionHealth, evaluateServerHealth } = require('./clip-server-health');
```

(If `buildSessionHealth` is imported on its own line, extend that line rather than adding a second `require` of the same module.)

- [ ] **Step 4: Verify against the live server**

```bash
cd "C:\New Grocery App\heb-coupon-scraper" && CI=true npx.cmd jest
docker compose -f "C:/hsa-automation/docker-compose.yaml" up -d --build heb-clip-server
```

Wait for it, then:

```bash
curl -s https://clip.needexcelexpert.com/api/health
```

Expected: `"status":"ok"`, `"dataStale":false`, and **`lastScrapeAt` is a real ISO timestamp, not null** — that field has never once returned a value, so this is the proof the whole task exists for. `staleDays` should be `0`.

- [ ] **Step 5: Commit**

```bash
git add src/clip-server.js src/database.js test/health-payload.test.js
git commit -m "fix(health): report what was actually verified

status was a literal and both DB queries sat in bare catch {}, so with
MySQL down health answered ok while every clip failed. lastScrapeAt
queried heb_coupons.last_seen, a column that does not exist, so it had
been null since it was written and nothing noticed because nothing reads
it.

Probes are bounded (2s) and parallel; reachability retries once so a
post-restart dead socket cannot lock the user out. degraded stays HTTP
200 because the compose healthcheck uses curl -f.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `normalizeProductText`

**Files:**
- Create: `src/text-normalize.js`
- Modify: `src/database.js`, `src/scrape-frequent.js`
- Test: `test/text-normalize.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeProductText(value: string|null|undefined) → string|null|undefined` (non-strings pass through untouched).

- [ ] **Step 1: Write the failing test**

Create `test/text-normalize.test.js`:

```js
const { normalizeProductText } = require('../src/text-normalize');

describe('normalizeProductText', () => {
  // Real rows, measured 2026-09-17 under COLLATE utf8mb4_bin.
  test('decodes &nbsp; to a REAL space, not U+00A0', () => {
    // The trap this function exists for: every conventional entity decoder
    // maps &nbsp; to \u00a0. Deals filters with .includes(q) against a space
    // typed by a human, so that "fix" would silently break search on exactly
    // the rows it touched.
    const out = normalizeProductText('H-E-B Split Top Honey Wheat Enriched Sliced&nbsp;Bread');
    expect(out).toBe('H-E-B Split Top Honey Wheat Enriched Sliced Bread');
    expect(out).not.toContain('\u00a0');
  });

  test('replaces a RAW U+00A0 too — 7 coupon rows already carry one', () => {
    const out = normalizeProductText('SAVE $6.00 on TWO (2)\u00a0BOOST Drinks');
    expect(out).toBe('SAVE $6.00 on TWO (2) BOOST Drinks');
    expect(out).not.toContain('\u00a0');
  });

  test('trims a trailing &nbsp; — 6 of the 18 rows end with one', () => {
    expect(normalizeProductText('Fresh Seedless&nbsp;White Grapes&nbsp;'))
      .toBe('Fresh Seedless White Grapes');
  });

  test('collapses whitespace runs', () => {
    expect(normalizeProductText('Danimals   Smoothies\t12 pk')).toBe('Danimals Smoothies 12 pk');
  });

  test('keeps a legitimate ampersand', () => {
    expect(normalizeProductText('Char-Griller Pro Barrel Grill &amp; Offset Smoker'))
      .toBe('Char-Griller Pro Barrel Grill & Offset Smoker');
  });

  test('preserves a real apostrophe character', () => {
    // U+2019 is valid UTF-8 in this column and must survive untouched.
    expect(normalizeProductText('Char-Griller Smokin\u2019 Pro')).toBe('Char-Griller Smokin\u2019 Pro');
  });

  test('decodes numeric entities', () => {
    expect(normalizeProductText('Kellogg&#39;s Frosted Flakes')).toBe("Kellogg's Frosted Flakes");
    expect(normalizeProductText('Fresh&#160;Bok Choy')).toBe('Fresh Bok Choy');
  });

  test('passes null and undefined straight through', () => {
    expect(normalizeProductText(null)).toBe(null);
    expect(normalizeProductText(undefined)).toBe(undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx.cmd jest test/text-normalize.test.js`
Expected: FAIL — `Cannot find module '../src/text-normalize'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/text-normalize.js`:

```js
/**
 * Normalise product text on its way into the database.
 *
 * NORMALISE, not decode. A plain entity decoder maps &nbsp; to U+00A0, which
 * would convert the 18 frequent-product names carrying the entity into the
 * same broken form 7 coupon rows already carry — and Deals filters with
 * `.toLowerCase().includes(q)` against a space typed by a human, so a U+00A0
 * in the name silently matches nothing.
 *
 * Measured 2026-09-17 under COLLATE utf8mb4_bin (utf8mb4_unicode_ci weighs
 * U+00A0 equal to a space and matches every row — see spec §9).
 */
const NAMED = { nbsp: '\u00a0', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };

function normalizeProductText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/&(nbsp|amp|quot|apos|lt|gt);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (m, d) => {
      const n = Number(d);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    // Only AFTER decoding, so both the entity and the raw character land here.
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { normalizeProductText };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx.cmd jest test/text-normalize.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Apply it at both write paths**

In `src/database.js`, add at the top with the other requires:

```js
const { normalizeProductText } = require('./text-normalize');
```

In **both** upsert value arrays (around lines 76 and 140), wrap the product name and description values. The existing lines read `coupon.product_name,` and `coupon.description,` — change each to:

```js
        normalizeProductText(coupon.product_name),
        normalizeProductText(coupon.description),
```

In `src/scrape-frequent.js`, add the same require, then wrap the name values in the INSERT parameter list (the `product_name` and `full_name` bindings) with `normalizeProductText(...)`.

Run: `CI=true npx.cmd jest`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add src/text-normalize.js src/database.js src/scrape-frequent.js test/text-normalize.test.js
git commit -m "fix(data): normalise product text, do not merely decode it

Every conventional decoder maps &nbsp; to U+00A0. Applying one would have
converted the 18 frequent-product names carrying the entity into the same
broken form 7 coupon rows already have, silently breaking Deals search,
which filters with .includes() against a typed ASCII space.

Decode, then map the NBSP family to a real space, collapse runs, trim.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Backfill the existing rows

**Files:**
- Create: `scripts/backfill-product-text.js`

**Interfaces:**
- Consumes: `normalizeProductText` from Task 3, and the scraper's `Database` class (`src/database.js`) for host-side writes — the MySQL MCP is read-only.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Count the affected rows BEFORE changing anything**

```bash
docker exec hsa-mysql bash -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 hsa -e "
SELECT COUNT(*) AS freq_entity FROM heb_frequent_products WHERE product_name LIKE \"%&nbsp;%\";
SELECT COUNT(*) AS freq_raw FROM heb_frequent_products WHERE full_name LIKE CONCAT(\"%\", CHAR(0xC2A0 USING utf8mb4), \"%\") COLLATE utf8mb4_bin;
SELECT COUNT(*) AS coupon_raw FROM heb_coupons WHERE product_name LIKE CONCAT(\"%\", CHAR(0xC2A0 USING utf8mb4), \"%\") COLLATE utf8mb4_bin;
"'
```

Expected at time of writing: `18`, `18`, `7`. **Record the actual numbers** — Step 4 asserts they reach 0, and a different starting count is information, not a reason to stop.

- [ ] **Step 2: Write the backfill script**

Create `scripts/backfill-product-text.js`:

```js
/**
 * One-off, idempotent backfill for product text written before
 * normalizeProductText existed. Safe to re-run: normalising an already
 * normalised string is a no-op, and rows that do not change are not written.
 *
 * Hash safety: hasher.js keys on heb_coupon_id first and 0 coupons lack one,
 * so changing product_name cannot move any existing hash_id.
 */
const config = require('../src/config');
const Database = require('../src/database');
const { normalizeProductText } = require('../src/text-normalize');

const TARGETS = [
  { table: 'heb_coupons', key: 'id', columns: ['product_name', 'description'] },
  { table: 'heb_frequent_products', key: 'id', columns: ['product_name', 'full_name'] },
];

(async () => {
  const db = new Database(config.db);
  await db.connect();
  let changed = 0;

  for (const { table, key, columns } of TARGETS) {
    const [rows] = await db.pool.execute(`SELECT ${key}, ${columns.join(', ')} FROM ${table}`);
    for (const row of rows) {
      const updates = [];
      const values = [];
      for (const col of columns) {
        const next = normalizeProductText(row[col]);
        if (typeof row[col] === 'string' && next !== row[col]) {
          updates.push(`${col} = ?`);
          values.push(next);
        }
      }
      if (updates.length === 0) continue;
      values.push(row[key]);
      await db.pool.execute(`UPDATE ${table} SET ${updates.join(', ')} WHERE ${key} = ?`, values);
      changed += 1;
    }
    console.log(`[backfill] ${table}: scanned ${rows.length}`);
  }

  console.log(`[backfill] rows updated: ${changed}`);
  await db.pool.end();
  process.exit(0);
})().catch((err) => {
  console.error('[backfill] FAILED:', err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Run it**

```bash
cd "C:\New Grocery App\heb-coupon-scraper" && node scripts/backfill-product-text.js
```

Expected: a `rows updated:` count at least as large as the Step 1 totals (a row with two dirty columns counts once).

- [ ] **Step 4: Verify the counts are now zero**

Re-run the Step 1 query block.
Expected: `0`, `0`, `0`.

Then confirm idempotence — run the script a second time.
Expected: `rows updated: 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-product-text.js
git commit -m "chore(data): backfill product text normalisation

18 frequent-product rows carried a literal &nbsp;, their full_name column
the raw U+00A0, and 7 coupon rows the raw character. Idempotent and safe
to re-run; rows that do not change are not written.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `deriveState` gains `degraded`

**Files:**
- Modify: `src/hooks/useHebSession.js`
- Test: `src/hooks/useHebSession.test.js`

**Interfaces:**
- Consumes: the `status` field added by Task 2.
- Produces: `deriveState(health)` may now return `'degraded'`. Full precedence: `unreachable → signedOut → degraded → wrongStore → expiring → ready`.

- [ ] **Step 1: Write the failing test**

Append to `src/hooks/useHebSession.test.js` (inside the existing `deriveState` describe block, matching its `healthy` / `future` helpers):

```js
  test('a degraded server derives degraded', () => {
    expect(deriveState({ ...healthy, status: 'degraded', degradedReason: 'db_unreachable' }))
      .toBe('degraded');
  });

  test('signedOut OUTRANKS degraded — the sign-in remedy still works', () => {
    // sessionAuthenticated comes from the session FILE (buildSessionHealth ->
    // evaluateSession), which the health handler's DB code never touches, so a
    // DB outage cannot move it. And session-import.js has zero DB references,
    // so signing in works fine during an outage. Ordering degraded first would
    // hide a working remedy behind a broken one.
    expect(deriveState({ ...healthy, status: 'degraded', sessionAuthenticated: false }))
      .toBe('signedOut');
  });

  test('degraded outranks wrongStore and expiring — blocking beats advisory', () => {
    expect(deriveState({ ...healthy, status: 'degraded', storeId: '809', storeSource: 'curr' }))
      .toBe('degraded');
    expect(deriveState({ ...healthy, status: 'degraded', authExpiresAt: future(HOUR) }))
      .toBe('degraded');
  });

  test('COMPATIBILITY: a payload with NO status field behaves exactly as today', () => {
    // An old container omits the field entirely. Absent is not wrong.
    const old = { sessionAuthenticated: true, authExpiresAt: future(30 * 24 * HOUR) };
    expect(deriveState(old)).toBe('ready');
  });

  test('an explicit status ok is not degraded', () => {
    expect(deriveState({ ...healthy, status: 'ok' })).toBe('ready');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\New Grocery App\grocery-checklist-app" && CI=true npx.cmd react-scripts test --testPathPattern="useHebSession" --watchAll=false`
Expected: FAIL — the first test receives `'ready'`, expected `'degraded'`.

- [ ] **Step 3: Write minimal implementation**

In `src/hooks/useHebSession.js`, inside `deriveState`, insert **after** the `signedOut` check and **before** the store comparison:

```js
  // Fourth, NOT second. The first draft put this above signedOut, reasoning
  // that a DB outage might make sessionAuthenticated read false — it cannot,
  // that value comes from the session FILE. The inverse is what matters:
  // session import touches no database, so signing in works during an outage,
  // and ordering degraded first would hide a working remedy behind a broken
  // one. Blocking states outrank advisories; the login verdict is independent.
  //
  // An older clip-server omits `status` entirely: undefined is not 'degraded',
  // so it behaves exactly as before. Absent is not wrong.
  if (health.status === 'degraded') return 'degraded';
```

Update the JSDoc above `deriveState` to list the new state and order.

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npx.cmd react-scripts test --testPathPattern="useHebSession" --watchAll=false`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Remove the compatibility fixture's `status`**

In the pre-existing test named `COMPATIBILITY: undefined storeId skips the store check entirely`, the `old` fixture contains `status: 'ok'`. Delete that property — an "old server" fixture that sets a field old servers do not send proves nothing.

Re-run Step 4's command. Expected: still PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useHebSession.js src/hooks/useHebSession.test.js
git commit -m "feat(heb): derive a degraded state from server health

Placed FOURTH, below signedOut: sessionAuthenticated comes from the
session file and a DB outage cannot move it, while session import touches
no database -- so signing in works during an outage and must not be hidden
behind a state the user cannot clear.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Panel copy and the "Check again" escape

**Files:**
- Modify: `src/components/heb/HebSignInPanel.js`
- Test: `src/components/heb/HebSignInPanel.test.js`

**Interfaces:**
- Consumes: `state === 'degraded'` from Task 5; the existing `onRecheck` prop.
- Produces: the panel renders for `degraded` with a button labelled **Check again** that calls `onRecheck`.

- [ ] **Step 1: Write the failing test**

Append to `src/components/heb/HebSignInPanel.test.js`, following the file's existing render helper and imports:

```js
describe('degraded', () => {
  test('names the clip server as the thing that cannot reach its database', async () => {
    render(<HebSignInPanel state="degraded" health={{}} onRecheck={() => {}} />);
    // Never "the database is down": dbReachable false can be a container
    // network fault while the app's own n8n path is fine.
    expect(await screen.findByText(/can.t reach its database/i)).toBeInTheDocument();
  });

  test('offers no sign-in route — signing in cannot fix a database outage', () => {
    render(<HebSignInPanel state="degraded" health={{}} onRecheck={() => {}} />);
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
  });

  test('Check again calls onRecheck, so a transient cannot become a lockout', () => {
    // useHebSession fetches once on mount and its only other trigger is
    // SESSION_EXPIRED during a clip -- which cannot fire while clipping is
    // disabled. Without this button a single transient dbReachable:false
    // would disable clipping until the user navigated away and back.
    const onRecheck = jest.fn();
    render(<HebSignInPanel state="degraded" health={{}} onRecheck={onRecheck} />);
    fireEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });
});
```

Ensure `fireEvent` is imported from `@testing-library/react` at the top of the file (user-event is pinned at 13.5.0 and `userEvent.setup()` does not exist).

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx.cmd react-scripts test --testPathPattern="HebSignInPanel" --watchAll=false`
Expected: FAIL — the panel renders nothing for an unknown state (`copyFor` returns null).

- [ ] **Step 3: Write minimal implementation**

In `src/components/heb/HebSignInPanel.js`, add a case to `copyFor` before `default:`:

```js
    case 'degraded':
      return {
        title: 'Clip server can’t reach its database',
        // Says nothing about the HEB sign-in. Under deriveState's ordering,
        // degraded is only reached when the session is already authenticated,
        // so a reassurance is unnecessary — and asserting it from a state that
        // does not know is how the first draft contradicted the server.
        body: 'Coupon clipping and the cart builder look up coupons there, so both are unavailable until it reconnects. There’s nothing to fix on your side.',
        offersSignIn: false,
        offersRecheck: true,
      };
```

Then render the button. In the JSX, alongside the existing sign-in affordance, add:

```jsx
              {copy.offersRecheck && (
                <button
                  type="button"
                  onClick={onRecheck}
                  className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-alt border border-default text-sm font-medium hover:bg-surface transition-colors"
                >
                  <RefreshCw size={16} />
                  Check again
                </button>
              )}
```

`RefreshCw` is already imported at the top of the file. Use static class names only — Tailwind JIT ignores dynamic ones.

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npx.cmd react-scripts test --testPathPattern="HebSignInPanel" --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/heb/HebSignInPanel.js src/components/heb/HebSignInPanel.test.js
git commit -m "feat(heb): degraded panel copy with a working escape

A blocking state the user cannot clear is a lockout. useHebSession fetches
once on mount and its only other trigger cannot fire while clipping is
disabled, so the panel carries a Check again button wired to recheck.

Copy attributes the fault to the clip server's reach, never asserts the
database is down, and says nothing about the HEB sign-in.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Deals — gate the controls, show the freshness line

**Files:**
- Modify: `src/components/Deals.js`
- Test: `src/components/Deals.session.test.js` (create if absent; otherwise extend the nearest Deals test file)

**Interfaces:**
- Consumes: `hebState === 'degraded'` (Task 5); `health.dataStale`, `health.staleDays` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

```jsx
test('degraded disables the clip controls', async () => {
  // A clip cannot succeed: the server maps hash_id -> heb_coupon_id through
  // the database before it ever contacts HEB.
  renderDealsWithHealth({ status: 'degraded', sessionAuthenticated: true });
  expect(await screen.findByTestId('heb-session-panel')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /clip selected/i })).toBeDisabled();
});

test('wrongStore and expiring still allow clipping (R14)', async () => {
  renderDealsWithHealth({ status: 'ok', sessionAuthenticated: true, storeId: '809', storeSource: 'curr' });
  expect(await screen.findByRole('button', { name: /clip selected/i })).not.toBeDisabled();
});

test('stale coupon data shows an advisory line', async () => {
  renderDealsWithHealth({ status: 'ok', sessionAuthenticated: true, dataStale: true, staleDays: 9 });
  expect(await screen.findByText(/coupon data is 9 days old/i)).toBeInTheDocument();
});

test('the client NEVER recomputes staleness from the timestamp', async () => {
  // lastScrapeAt is 30 days old but the server said dataStale:false. The
  // client must render nothing: one place decides, and it is the server.
  renderDealsWithHealth({
    status: 'ok',
    sessionAuthenticated: true,
    dataStale: false,
    staleDays: null,
    lastScrapeAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  });
  await screen.findByTestId('deals-screen');
  expect(screen.queryByText(/days old/i)).not.toBeInTheDocument();
});
```

Write `renderDealsWithHealth(health)` as a local helper that installs a mock fetch mapping `/api/health` to the given payload, following the pattern in `src/components/HebCart.session.test.js`. Use the existing `installMockFetch` / `cartFetchMap` test utilities.

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx.cmd react-scripts test --testPathPattern="Deals" --watchAll=false`
Expected: FAIL — the clip button is enabled in `degraded`, and no freshness text renders.

- [ ] **Step 3: Write minimal implementation**

In `src/components/Deals.js`, extend the gate (currently `['signedOut', 'unreachable']`):

```js
  // 'degraded' joins these two: a clip request cannot succeed when the clip
  // server cannot reach its database, because it maps hash_id ->
  // heb_coupon_id before it ever contacts HEB. 'wrongStore' remains absent
  // (R14) and 'expiring' still works.
  const clipServerUnavailable = ['signedOut', 'unreachable', 'degraded'].includes(hebState);
```

Add the freshness line above the deals list, rendering only on the server's verdict:

```jsx
      {hebHealth?.dataStale && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-surface-alt border border-default text-sm text-muted">
          Coupon data is {hebHealth.staleDays} days old — the weekly update hasn’t run.
        </div>
      )}
```

Say "coupon data", never "deals": `heb_scraping_history` records the coupon scraper only, and Smart Deals is coupons × frequent products.

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npx.cmd react-scripts test --testPathPattern="Deals" --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Deals.js src/components/Deals.session.test.js
git commit -m "feat(deals): gate clipping on degraded, surface stale coupon data

Clipping needs the database before it contacts HEB, so degraded joins
signedOut and unreachable. wrongStore stays enabled (R14).

The freshness line renders only on the server's dataStale verdict -- the
client never recomputes it, so one place decides.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Gate the cart builder

**Files:**
- Modify: `src/components/HebCart.js:528`, `src/components/cart/ConnectionPanel.js:29`
- Test: `src/components/HebCart.session.test.js`

**Interfaces:**
- Consumes: `hebState === 'degraded'` (Task 5).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to `src/components/HebCart.session.test.js`:

```js
test('degraded blocks the Connect step instead of auto-advancing past it', async () => {
  // runBuildJob calls db.connect() and inserts into heb_cart_sessions OUTSIDE
  // its inner try/catches, so a DB outage fails the whole build. Auto-
  // advancing would sail past Connect and fail later with a raw connection
  // error instead of an explanation.
  const mock = installMockFetch(cartFetchMap({
    '/api/heb/session/status': idleSession,
    '/api/health': { status: 'degraded', sessionAuthenticated: true, storeExpected: '794' },
  }));
  renderCart();
  await flush();
  expect(await screen.findByTestId('heb-session-panel')).toBeInTheDocument();
  expect(mock).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx.cmd react-scripts test --testPathPattern="HebCart" --watchAll=false`
Expected: FAIL — Cart auto-advances and the panel is absent.

- [ ] **Step 3: Write minimal implementation**

`src/components/HebCart.js:528`:

```js
  const autoAdvanceAllowed = hebState !== 'checking' && hebState !== 'signedOut'
    && hebState !== 'unreachable' && hebState !== 'degraded';
```

`src/components/cart/ConnectionPanel.js:29`:

```js
  const blocked = ['signedOut', 'unreachable', 'degraded'].includes(hebState);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npx.cmd react-scripts test --testPathPattern="HebCart|ConnectionPanel" --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/HebCart.js src/components/cart/ConnectionPanel.js src/components/HebCart.session.test.js
git commit -m "fix(cart): block the build on degraded instead of failing late

The build job connects to MySQL outside its inner try/catches, but both
gates enumerated only signedOut and unreachable.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: e2e fixtures and a degraded scenario

**Files:**
- Modify: `e2e/fixtures/clip/health.*.json`
- Create: `e2e/fixtures/clip/health.degraded.json`, `e2e/fixtures/clip/session-status.degraded.json`
- Modify: the Deals or session e2e spec that exercises clip-server states

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Update the existing fixtures to the real payload shape**

Every `e2e/fixtures/clip/health.*.json` carries `"lastScrapeAt": null`, which is the bug this sub-project fixed — leaving it means e2e stops exercising what the server sends. Add to each:

```json
  "status": "ok",
  "degradedReason": null,
  "dataStale": false,
  "staleDays": 0,
  "lastScrapeAt": "2026-09-17T11:01:00.000Z"
```

- [ ] **Step 2: Create the degraded PAIR**

`mock-backend.clip(state)` requires **both** files; a lone health fixture 404s at teardown.

`e2e/fixtures/clip/health.degraded.json`:

```json
{
  "status": "degraded",
  "degradedReason": "db_unreachable",
  "dataStale": false,
  "staleDays": null,
  "sessionValid": true,
  "sessionAuthenticated": true,
  "sessionReason": "ok",
  "authExpiresAt": "2027-09-17T08:25:12.944Z",
  "storeId": null,
  "storeSource": null,
  "storeExpected": "794",
  "sessionAgeHours": 1.5,
  "lastScrapeAt": null,
  "couponCount": null,
  "activeJobs": 0,
  "activeScraperJob": null
}
```

Copy the existing `session-status.*.json` for a healthy session to `e2e/fixtures/clip/session-status.degraded.json` unchanged — the session is fine; the database is not.

- [ ] **Step 3: Add the spec**

```js
test('a degraded clip server explains itself and disables clipping', async ({ page }) => {
  await mockBackend.clip('degraded');
  await page.goto('/#deals');
  await expect(page.getByTestId('heb-session-panel')).toContainText(/can.t reach its database/i);
  await expect(page.getByRole('button', { name: /clip selected/i })).toBeDisabled();
});
```

- [ ] **Step 4: Run the full e2e suite in the FOREGROUND**

Run: `cd "C:\New Grocery App\grocery-checklist-app" && CI=true npm.cmd run test:e2e`
Expected: **123+ passed, 0 failed** (122 was the baseline before this plan).

- [ ] **Step 5: Commit**

```bash
git add e2e/
git commit -m "test(e2e): degraded clip-server scenario and real payload shape

The health fixtures carried lastScrapeAt: null -- the bug this sub-project
fixed -- so e2e had stopped exercising what the server sends.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Ship and verify against the live system

**Files:** none.

**Interfaces:**
- Consumes: Tasks 1-9.
- Produces: a deployed, verified system.

- [ ] **Step 1: Run every gate**

```bash
cd "C:\New Grocery App\heb-coupon-scraper" && CI=true npx.cmd jest
cd "C:\New Grocery App\grocery-checklist-app" && CI=true npm.cmd run lint
CI=true npx.cmd react-scripts test --watchAll=false
CI=true npm.cmd run test:e2e
```

Expected: scraper all green; lint clean at `--max-warnings=0`; app Jest all green; e2e 123+ passed / 0 failed. **Do not proceed on a single failure.**

- [ ] **Step 2: Rebuild the container**

`Dockerfile.clip` copies `src/` from the working tree, so uncommitted files ship. Commit everything first, then:

```bash
docker compose -f "C:/hsa-automation/docker-compose.yaml" up -d --build heb-clip-server
```

This causes a brief clipping outage (~2 min).

- [ ] **Step 3: Verify the live payload**

```bash
curl -s https://clip.needexcelexpert.com/api/health
```

Expected: `"status":"ok"`, `"dataStale":false`, `"staleDays":0`, and **`lastScrapeAt` a real ISO timestamp**.

- [ ] **Step 4: Prove the degraded path against the real system**

This is the one path no test can cover, and the whole sub-project exists for it.

```bash
docker stop hsa-mysql
sleep 5
curl -s https://clip.needexcelexpert.com/api/health
```

Expected: HTTP **200** with `"status":"degraded"` and `"degradedReason":"db_unreachable"` — and the response must arrive in **under 8 seconds** (time it; that is the app's abort, and exceeding it would make the app say `unreachable` and offer the wrong remedy).

```bash
docker start hsa-mysql
until docker exec hsa-mysql mysqladmin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent 2>/dev/null; do sleep 2; done
curl -s https://clip.needexcelexpert.com/api/health
```

Expected: back to `"status":"ok"` — proving the retry recovers rather than latching.

- [ ] **Step 5: Confirm clipping still works end to end**

Ask the user to tap Clip on one coupon they actually want, then:

```bash
docker logs --tail 40 heb-clip-server 2>&1 | grep -E "Clipped|Done\.|Job complete|Error"
```

Expected: `clipped: 1, failed: 0`. Judge from the job result, not the Deals display.

- [ ] **Step 6: Verify no leaks and push**

```bash
docker exec heb-clip-server bash -c 'pgrep -c chrome; ls /app/probe-*.js 2>/dev/null | wc -l'
docker exec hsa-mysql bash -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" hsa -e "SELECT COUNT(*) FROM client_errors;"'
```

Expected: `0` chrome, `0` probe files, `client_errors` still **1** (the permanent sentinel, row id 7 — never delete it).

```bash
cd "C:\New Grocery App\grocery-checklist-app" && git push origin main
```

The scraper repo has **no remote** — nothing to push there.

---

## Self-Review

**Spec coverage.** §3 predicate → Task 1. §4 endpoint, probes, dropped `lastSaveRefusal` → Task 2 (the drop is a non-change; nothing to implement). §5 `deriveState` → Task 5; blocking + recheck → Tasks 6, 7; cart gating → Task 8; copy rules → Tasks 6, 7. §6 normalisation → Task 3; backfill → Task 4. §7 testing → distributed through every task, with e2e in Task 9. §8 accepted limitations need no code. The store check is explicitly out of scope per §1.

**Placeholders.** None. Every code step carries the actual code. Task 7's `renderDealsWithHealth` helper is described by the existing pattern it must follow rather than transcribed, because the surrounding test file's imports determine its exact shape — this is the one place an implementer must read neighbouring code, and it is named as such.

**Type consistency.** `evaluateServerHealth` returns `{ status, degradedReason, dataStale, staleDays }` in Task 1 and is consumed with those exact names in Tasks 2, 5, 7 and the fixtures in Task 9. `normalizeProductText` has one signature across Tasks 3 and 4. `degradedReason` values `'db_unreachable'` / `'coupons_unavailable'` appear identically in Tasks 1, 2 and 9. The app reads `health.status`, `health.dataStale`, `health.staleDays` — all produced by Task 2.

**One ordering dependency worth naming:** Task 5 must land before Tasks 6, 7 and 8, which all branch on `'degraded'`. Tasks 1-4 (scraper) and 5-8 (app) are otherwise independent and could run in either order.
