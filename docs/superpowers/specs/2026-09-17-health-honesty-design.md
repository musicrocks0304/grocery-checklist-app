# Sub-project F — health surfaces that tell the truth

Design, 2026-09-17. Supersedes the "scrape-time data quality" sketch carried in the
hardening program, which was written before the facts below were measured.

Related: `2026-09-16-heb-session-lifecycle-design.md` (sub-project C) and
`../reports/2026-09-17-heb-session-lifecycle-release.md`.

---

## 1. The problem

Sub-project C ended the disagreement between *consumers* — eight of them now ask one predicate
whether the HEB session is usable. It did not make the server honest about **itself**.

Three measurements, all taken 2026-09-17:

**`/api/health` cannot report failure.** `status: 'ok'` is a literal (`clip-server.js:110`).
Both its database queries sit in bare `catch {}` blocks (`:98`, `:105`). If MySQL is unreachable
the endpoint still answers `ok`, the app derives `ready`, no panel renders — and **every clip
fails**, because `runClipJob` maps `hash_id → heb_coupon_id` through the database before it ever
contacts HEB. That is sub-project C's failure mode exactly, one layer out: a surface reporting
health it never measured.

**One field has never once worked.** `lastScrapeAt` runs
`SELECT MAX(last_seen) FROM heb_coupons`. **`heb_coupons` has no `last_seen` column.** The query
throws on every call, the bare `catch` swallows it, and the field has been `null` since it was
written. Nothing ever noticed, because nothing reads it.

**Two fields are read by nobody.** Neither `couponCount` nor `lastScrapeAt` is consumed anywhere
in the app. The payload carries two unread fields, one permanently broken, while the question
that matters — *can this server do its job right now?* — is hardcoded true.

### Scope

In: the health predicate, the endpoint, the app states that consume it, the Deals freshness
line, and the product-text normalisation the data needs.

Out: sub-project F's original "real store check". `__PROFILE_STATE__.storeId` makes it cheap now,
but reading it costs a page load, which a polled endpoint cannot afford — the same reasoning that
kept it out of C. Also out: any change to `evaluateSession` itself.

---

## 2. What this design is NOT allowed to do

These are the project's scars. An adversarial review caught this design violating two of them
before it was written down; both corrections are recorded in §9.

1. **Never show a remedy the user cannot act on.** C nearly shipped three.
2. **Absent is not wrong.** `null` means *unknown*, never *bad*. `storeId: null` once meant
   "no store" and would have nagged every correct user forever.
3. **Advisory must not block** (R14). `wrongStore` stays advisory because its signal produced a
   false positive; blocking on it would have locked out a correctly-configured user.
4. **A blocking state must be recoverable without a remount.** New, from the review — see §5.

---

## 3. `evaluateServerHealth` — the predicate

Pure. No fs, no network, no clock except the injected `now`. Lives in
**`src/clip-server-health.js`**, beside `buildSessionHealth`, which is already "builds the
/api/health payload" and is already covered by `test/health-payload.test.js`.

Explicitly **not** in `heb-session.js`: that file's header scopes it to "is the saved HEB session
usable", and `saveSession`/`createBrowserContext` import it on that understanding. Server
liveness is a different question and must not be smuggled into the session predicate.

```js
evaluateServerHealth({ dbReachable, couponsQueryable, lastScrapeAt, now })
  → { status, degradedReason, dataStale, staleDays }
```

### Two axes, deliberately not merged

**`status: 'ok' | 'degraded'`** — *can the server do its job?* This MAY block.

**`dataStale` / `staleDays`** — *how old is the data?* **Advisory. Never blocks.** Stale coupons
clip perfectly well. Merging these would let a missed Thursday disable clipping, inventing a new
unactionable remedy.

### Why two database inputs, not one

`dbReachable` comes from `SELECT 1`; `couponsQueryable` from the coupon count. Either being
false yields `degraded`, with `degradedReason` distinguishing `db_unreachable` from
`coupons_unavailable`.

Both are needed. Collapsing them into one boolean is what hid the `last_seen` bug for months — a
schema fault read as "no data". Reporting only `SELECT 1` would be the opposite error: the
database answers, `heb_coupons` is broken, clipping still fails, and health still says `ok`.
Separate probes, separate reasons, one verdict.

### Null rules

| Input | Meaning | Effect |
|---|---|---|
| `lastScrapeAt: null` | unknown | `dataStale: false` |
| `dbReachable: null` | not probed | does **not** degrade |
| `couponsQueryable: null` | not probed | does **not** degrade |

Carried straight from C. Without the first, the very bug being fixed — a failing query returning
null — flips into a permanent staleness banner nobody can clear. We would have replaced a silent
lie with a loud one.

### Staleness threshold

`STALE_AFTER_DAYS = 8`, a named constant, injectable for tests. The coupon scrape is weekly
(Thursday), so 8 days is one missed run plus a day's grace.

`staleDays` is computed **server-side** from the injected `now`. The container runs UTC and MySQL
is `time_zone=SYSTEM`, but a developer running on the Windows host reads ~5h off — an error
invisible at an 8-day threshold and therefore exactly the kind that survives to production.
Computing it in one place with an injected clock removes the question.

Two facts about the source, both verified:

- `success = 1 ⟹ coupons_found > 0` **by construction** (`index.js` logs `success:false` when a
  scrape finds zero). All 37 success rows have `coupons_found > 0`; all 3 failures have 0. The
  "successful scrape found nothing" worry is moot.
- `heb_scraping_history` records the **coupon** scraper only — `scrape-frequent.js` never writes
  it. All copy must therefore say *"coupon data"*, never *"deals"* (Smart Deals is coupons ×
  frequent products, and the frequent side has no freshness signal at all).

---

## 4. The endpoint

**Freshness repointed** to `SELECT MAX(scraped_at) FROM heb_scraping_history WHERE success = 1`.
Last *successful* scrape: a failed run must not reset the clock and make stale data look fresh.

**Three probes, bounded and parallel.** Each is wrapped in a `Promise.race` against a 2s
deadline and they run under `Promise.allSettled`; a timeout counts as false, which is truthful.

**`dbReachable` — and only that probe — retries once** after 500ms before reporting false. It is
the sole input that can block the user (§5), so it is the only one worth paying for twice; a
slow count query should not double the endpoint's latency. Worst case is therefore
2s + 0.5s + 2s = **4.5s**, comfortably inside the app's 8s abort, which is the budget that makes
the whole arrangement safe.

This is not premature optimisation, it is a correctness fix. `useHebSession` aborts its fetch at
**8000ms** and maps an abort to `unreachable`, whose panel copy says *"it usually just needs a
restart"*. mysql2's default `connectTimeout` is **10000ms**, and today's handler runs its queries
sequentially. A hung database would therefore produce a confidently wrong remedy, pointed at the
wrong component. The pool also gets an explicit `connectTimeout` rather than relying on the
default. `db.connect()` moves out of the same `try` as the count query so a pool failure and a
query failure stay distinguishable.

**The bare `catch {}` blocks go**, each replaced by a logged warning that sets its field.

**`degraded` is always HTTP 200.** It is a report, not a transport failure, and the compose
healthcheck uses `curl -f`, which fails on ≥400 — returning 5xx would mark the container
unhealthy and restart it under a condition it cannot fix. The outer `catch` keeps
`status: 'error'` for a genuinely broken endpoint.

All new fields are additive.

### Dropped: `lastSaveRefusal`

Considered and rejected. `saveSession` refusals were going to be surfaced as module-level state,
but that covers only the 2 of 8 callers living in the clip-server process — the weekly scrape
runs on the Windows host and `scrape-frequent` runs as a spawned child — and it resets on every
container rebuild, which this change requires. `null` would read as "no refusals" when it means
"none in this process since it started". That is a third unread, actively misleading field, and
this design exists to delete that category. The refusal keeps its log line.

---

## 5. The app

### `deriveState` gains `degraded`, placed FOURTH

```
unreachable → signedOut → degraded → wrongStore → expiring → ready
```

**Not second.** The first draft put `degraded` above `signedOut`, reasoning that a database
outage might make `sessionAuthenticated` read false and so make "sign in again" unactionable.
**That reasoning was false.** `sessionAuthenticated` comes from `buildSessionHealth` →
`evaluateSession(state)`, where `state` is the session **file**; the handler's database code runs
afterwards and touches none of it. A database outage cannot move it.

The inverse is what is true: `session-import.js` contains **zero** database references, so
signing in works perfectly during a database outage. Ordering `degraded` first would have hidden
a working remedy behind a broken one — rule 1, running backwards.

An older clip-server sends no `status`, so `health.status` is `undefined`, which is not
`'degraded'` and behaves exactly as today. Absent is not wrong.

### Blocking, and how it recovers

`degraded` disables the clip controls in Deals — a third state where a clip genuinely cannot
succeed, alongside `signedOut` and `unreachable`. `wrongStore` and `expiring` stay enabled,
unchanged (R14).

But blocking on a transient is a lockout, and `useHebSession` fetches **once on mount**; its only
other trigger is `SESSION_EXPIRED` during a clip, which cannot fire when clipping is disabled. A
single transient `dbReachable: false` would therefore disable clipping until the user navigated
away and back. This is not hypothetical: mysql2's pool `idleTimeout` is 60s against
`connectionLimit: 5`, so a `docker restart hsa-mysql` leaves dead idle sockets that throw once,
and `ER_CON_COUNT_ERROR` blips are in this project's own history.

Two mitigations, both required:

1. **The `dbReachable` probe retries once** before reporting false (§4).
2. **The degraded panel carries a "Check again" button**, wired to the `onRecheck` prop
   `HebSignInPanel` already receives. A blocking state the user cannot clear is the lockout R14
   warns about; a blocking state with a working escape is not.

### The cart builder is gated too

The build job calls `db.connect()` and inserts into `heb_cart_sessions` outside its inner
try/catches, so a database outage fails the whole build. But `HebCart.js:528`
(`autoAdvanceAllowed`) and `ConnectionPanel.js:29` (`blocked`) both enumerate only
`['signedOut', 'unreachable']`. Unlisted, `degraded` would let Cart auto-advance past Connect and
fail later with a raw connection error. Both lists gain `degraded`, and the copy names the cart
builder as well as clipping — the `unreachable` copy already does.

### Copy

Says what is true, asks nothing impossible, and **attributes the fault precisely**: *"the clip
server can't reach its database"*, never *"the database is down"*. `dbReachable: false` can be a
container-network fault (`DB_HOST=hsa-mysql` on the docker network) while the app's own n8n data
path is fine — lists load, clipping does not.

It must **not** assert anything about the HEB sign-in. Under this ordering `degraded` is only
reached when the session is already authenticated, so a reassurance is unnecessary; asserting it
from a state that does not know is how the first draft ended up contradicting the server.

When MySQL is genuinely down the Deals lists also fail through n8n, so the screen will show a
data error *and* the degraded panel. That is honest, and the copy must read sensibly beside a
list error rather than duplicating it.

### Freshness line

Lives in **Deals**, not the panel — it is about coupon data, not the HEB session, and the panel's
job is remedies. Renders only when `dataStale`, names the age and the cause, blocks nothing:

> Coupon data is 9 days old — the weekly update hasn't run.

The client **never recomputes staleness**; it renders what the server decided.

---

## 6. Data hygiene: normalise, do not decode

The first draft specified a `decodeHtmlEntities` helper. **That would have made the data worse**,
and the measurement behind it was contaminated. Both are recorded in §9.

### What is actually in the tables

Measured under `COLLATE utf8mb4_bin`, because `utf8mb4_unicode_ci` weighs U+00A0 equal to a
space and matches every row:

| Table / column | Finding |
|---|---|
| `heb_frequent_products.product_name` | **18 of 380** contain literal `&nbsp;`; **6** are trailing |
| `heb_frequent_products.full_name` | the same **18** contain a raw U+00A0 |
| `heb_coupons.product_name` | **7 of 6332** contain a raw U+00A0; **0** contain literal entities |

HEB ships `displayName` raw and `fullDisplayName` decoded, which is why one column has the entity
and its sibling has the character. Both tables are fed from HEB GraphQL JSON, so neither is
"clean by construction" — the coupon table is clean of *entities* only.

### Why decoding is the wrong primitive

Every conventional decoder maps `&nbsp;` → ` `. Applying one would convert the 18 frequent
names **into** the same broken form the 7 coupons already have. `Deals.js:427` filters with
`.toLowerCase().includes(q)` against a space typed by a human, so a U+00A0 in the name silently
fails to match. The "fix" would have broken search on exactly the rows it touched.

### `normalizeProductText(str)`

Pure, shared, applied where product text enters the database — the `database.js` upserts and
`scrape-frequent.js`:

1. decode HTML entities (`&nbsp;`, `&amp;`, `&quot;`, `&apos;`, `&#39;`, numeric forms)
2. replace the NBSP family `[   ]` with a plain space
3. collapse whitespace runs
4. trim

**Backfill** the 18 frequent rows (both columns) and the 7 coupon rows. Without it they stay
wrong until someone manually runs `npm run scrape:frequent`.

**Hash safety.** `hasher.js` keys on `heb_coupon_id` first and **0** coupons lack one, so
normalising `product_name` cannot change any existing `hash_id`. Normalisation is still applied
*before* `generateHashId` so the fallback branch stays deterministic.

---

## 7. Testing

The MySQL-down path is the one nobody will re-verify by hand. It must be provable without taking
MySQL down — which is the entire reason for a pure predicate.

**Scraper (Jest)**
- `evaluateServerHealth`: degraded / stale / both / neither; `db_unreachable` vs
  `coupons_unavailable`; all three null rules; the boundary at exactly 8 days; a probe timeout
  yielding `degraded`.
- `normalizeProductText`: the real `&nbsp;` strings from the table, a trailing one, a raw U+00A0,
  and a name containing a legitimate `&`.
- Extend `test/health-payload.test.js` for the new fields.

**App (Jest)**
- `deriveState`: `degraded`; **`signedOut` outranks `degraded`** (the corrected precedence);
  `degraded` outranks `wrongStore` and `expiring`.
- Back-compat: health with **no `status` field at all** behaves exactly as today. The existing
  "old server" fixture in `useHebSession.test.js` still sets `status:'ok'` and must have it
  removed, or it proves nothing.
- Recovery: a `degraded → healthy` sequence where pressing **"Check again"** re-enables the clip
  controls. This is the C2 lockout guard and is not optional.
- Controls disabled in `degraded`, **not** in `wrongStore`/`expiring`.
- `ConnectionPanel` blocked in `degraded`; `autoAdvanceAllowed` false in `degraded`.
- Freshness: renders when stale; and a fixture with `lastScrapeAt` 30 days old but
  `dataStale: false` **must render nothing** — proving the client never recomputes. Without that
  second fixture the negative test passes trivially.

**e2e**
- A degraded scenario. `mock-backend.clip(state)` requires **both** `clip/health.<state>.json`
  and `clip/session-status.<state>.json`; a lone health fixture 404s at teardown.
- Existing `e2e/fixtures/clip/health.*.json` carry `lastScrapeAt: null` and must be updated to
  the new payload shape, or e2e stops exercising what the server sends.

**Library constraints:** `user-event` is pinned at 13.5.0 — no `userEvent.setup()`, use
`fireEvent`. Use `findByText` for DOM assertions; `waitFor(() => expect(getByText(...)))` fails
lint.

**Gates:** scraper Jest; app `lint` → Jest → `test:e2e` in the **foreground**; all green before
merge.

**Deploy:** `Dockerfile.clip` copies `src/` from the working tree, so uncommitted files ship.
Commit, then rebuild, then verify live with `docker exec -e DISPLAY=:99` and one real clip. The
last rebuild in this project shipped an outage while health still reported `ready`.

---

## 8. Accepted limitations

- `/api/health` stays cookie-shape for the session verdict. A page load is too expensive for a
  polled endpoint; the import path now verifies against HEB, so a session must pass HEB's own
  check before it can reach disk.
- Frequent-product data has no freshness signal, because `scrape-frequent.js` writes no history
  row. Out of scope; noted so the copy stays narrow.
- `degraded` is derived from the clip-server's view of MySQL, which is a different network path
  from the app's n8n queries. The two can disagree, and the copy is written to survive that.

---

## 9. Corrections made before this spec was written

An adversarial review attacked the draft and found two premise errors, both verified against the
code and data before being accepted. Recorded because the pattern is the point.

**The ordering rationale was invented, not measured.** The draft asserted that a database outage
could make `sessionAuthenticated` read false. `clip-server-health.js` shows it cannot. The claim
*sounded* mechanical and was never checked, and it produced both a wrong precedence and copy that
would have contradicted the server in the very fixture the draft specified.

**"0 entities in coupons" was true and misleading** — the third contaminated measurement in two
days, after the `latin1` client and the `pgrep` shell match. The query answered the question
asked (literal entities) and the design took it for the question meant (bad whitespace). The
reviewer hit the matching trap from the other side: `LIKE '%<nbsp>%'` under a case-insensitive
collation matched all 6332 rows.

Both share one shape: **a measurement that is correct for its literal query and wrong for the
belief it is used to support.** The habit that catches it is not "measure more", it is *state
what the number would have to be if the belief were false* — and both times, the number was
available for the asking.
