# Sub-project C — HEB session lifecycle (design)

Date: 2026-09-16
Status: approved for planning
Supersedes: the four-bullet sketch of C in `docs/superpowers/hardening-checklist.md`

Related: [A webhook contract](2026-09-05-webhook-contract-design.md),
[E client error telemetry](2026-09-06-client-error-telemetry-design.md),
[D component decomposition](2026-09-10-component-decomposition-design.md)

---

## 1. Problem

Cart and Deals hold two different, contradictory opinions about whether the HEB login
works, because they read different endpoints with different predicates.

| | Cart | Deals |
|---|---|---|
| Hook | `useClipSession` | `useClipServerHealth` |
| Endpoint | `/api/heb/session/status` | `/api/health` |
| Field | `loginSessionValid` | `sessionAuthenticated` |
| Predicate | `isSessionFileValid()` — file mtime only (`auth.js:71-80`) | mtime **and** `looksAuthenticated()` (`clip-server.js:89`) |

`looksAuthenticated` (`session-import.js:60-64`) requires an `sst` cookie **and** a cookie on
`accounts.heb.com`. The clip-server's own comment explains the gap: mtime freshness "says
nothing about being logged in".

**Live trigger.** `endSession` calls `saveSession(session.context)` whenever the cart browser
was `touched` (`heb-cart-routes.js:72-77`). A cart session whose cookies HEB has already
rejected therefore rewrites the session file with logged-out cookies **and a fresh mtime**.
Cart then reports `loginSessionValid: true` and enables "Connect to HEB"; Deals
simultaneously reports `sessionAuthenticated: false` and shows "HEB session expired". The
user connects, a browser launches, and product search fails.

(The weekly anonymous scrape can reach the same state via `index.js:187`, but that path is
currently unreachable — see §9.)

**Second defect.** Deals' expired banner (`Deals.js:872`) instructs the user to start a session
in "Session Manager", a component deleted by sub-project A (`8ad2bf4`). Cart's panel
(`ConnectionPanel.js:95`) instructs `npm run scrape:login` — a desktop-only remedy shown on a
phone.

**Why it matters.** Clipping and the cart builder are unusable whenever the login expires,
which is the normal state between manual logins.

---

## 2. Approach

**Fix at the source.** One validity predicate inside clip-server, called by every route and by
the browser-context loader; `/api/health` also reports store binding. The app consumes one hook.

Rejected:
- *App-side reconciliation only* — avoids a Docker rebuild, but the n8n alert would still judge
  "signed in" by a different definition than the UI displays. The same bug, relocated.
- *Route all health through n8n* — adds a hop to a check that runs on every Deals/Cart mount and
  discards a working, CORS-allowed direct path. The health endpoint is read-only; there is
  nothing to protect.

This supersedes the checklist's "a `heb_session_expired` flag the app can read". A flag written
by a daily job would be up to 24h stale in the UI: a user who re-logged in on their phone would
still be told to sign in. The app reads live health; the DB table exists only for alert
throttling (§6).

---

## 3. Session validity (the single predicate)

One exported function in clip-server decides validity. It replaces the mtime gate everywhere.

```
hebSessionUsable(storageState) →
  { usable, reason, authExpiresAt, storeId, storeSource }
```

**Usable** iff the stored cookies are authenticated (`looksAuthenticated`: `sst` **and** an
`accounts.heb.com` cookie) **and** the earliest-expiring *auth* cookie is still in the future.

"Auth cookie" here means precisely the cookies `looksAuthenticated` keys on — `sst` and any on
`accounts.heb.com` — not the earliest expiry across the whole jar. Analytics and consent cookies
expire on unrelated schedules and must not drag the session to `signedOut`. Session cookies
(`expires` absent or ≤ 0) are treated as non-expiring for this test, since their lifetime is the
browser's, not the file's.

**File mtime no longer gates validity.** HEB's auth cookies last ~30 days; the previous 24h cap
measured *inactivity*, not expiry. Left in place it would flip the system to `signedOut` after a
single idle day, firing a daily alert and demanding a phone re-login (with hCaptcha) every day —
making C actively worse than nothing.

Because `createBrowserContext` (`auth.js:47`) currently refuses to *load* a >24h file, the
reporting change and the loader change **must ship together**. Reporting cookie-expiry truth
while the loader still refuses at 24h would recreate exactly the divergence this sub-project
removes. `sessionMaxAgeHours` is retired as a validity input.

**Call sites that must use it** (all four, or auto-reconnect reintroduces the bug):
- `/api/health` → `sessionAuthenticated`
- `/api/heb/session/status` → `loginSessionValid`
- `/api/heb/session/start` (`heb-cart-routes.js:118`)
- `createBrowserContext` (`auth.js:47`) — its decision to load cookies at all

`sessionAgeHours` stays in the health payload as diagnostic only.

### Store binding

Resolved from the same already-parsed storage state; no browser.

1. `CURR_SESSION_STORE` when present and unexpired → authoritative (`storeSource: 'curr'`)
2. else `SHOPPING_STORE_ID` when present and unexpired → fallback (`storeSource: 'shopping'`)
3. else `storeId: null` (`storeSource: null`)

Compared as strings against `storeExpected` (`HEB_STORE_ID`, default `'794'`). Cookie `expires`
is honored — a 30-day persistent store cookie must not be reported as current months later.

Ground truth today: the live session file has `SHOPPING_STORE_ID = 809` and **no**
`CURR_SESSION_STORE`; the older logged-in file has `CURR_SESSION_STORE = 794` plus
`USER_SELECT_STORE = true`. So the current session is bound to the wrong store, and the
`CURR_SESSION_STORE`-only rule originally specified would have reported `wrongStore` for every
user while missing the real discrepancy.

---

## 4. Client state model

New hook `useHebSession` → `{ state, health, recheck }`. One state, strict precedence:

| State | Condition | Remedy surfaced |
|---|---|---|
| `checking` | no response yet | none — render no banner |
| `unreachable` | network failure, or non-2xx, or unparseable body | "the clip server may need restarting" |
| `signedOut` | reachable, `sessionAuthenticated` false | **the re-login flow (§5)** |
| `noStore` | authenticated, `storeId === null` | "choose H-E-B McKinney #794 in the login browser, then import" |
| `wrongStore` | authenticated, `storeId !== storeExpected` | "your session is bound to store {storeId}; switch to #794, then import" |
| `expiring` | authenticated, right store, auth cookie expires < 48h | advisory, non-blocking |
| `ready` | otherwise | none |

Rules that keep it honest:

- **`checking` must not flash.** `ConnectionPanel` already guards this (`isChecking`, lines 9-12)
  and the guard survives; losing it would reintroduce a defect the 2026-09-05 UI review fixed.
- **`storeId === undefined` skips the store check entirely.** An absent field means an old
  backend, not a wrong store. Without this rule a Netlify deploy landing before the container
  rebuild puts every user in `wrongStore`, and the existing `Deals.test.js` fixtures (lines 16, 30)
  — which carry no `storeId` — fail.
- **Store states rank below `signedOut`.** Binding is meaningless when logged out.
- **`unreachable` covers a 5xx**, not just a network error. `/api/health` returns 500 on an
  internal throw (`clip-server.js:145`).

**Hook boundary.** `useHebSession` owns "can we talk to HEB at all". `useClipSession` keeps owning
"is a browser open right now" (`active`, `idleSeconds`) and **stops** forming its own
`loginSessionValid` opinion. Cart consumes both; Deals consumes only `useHebSession`.
`useClipServerHealth` is replaced outright.

**`signedOut` overrides `active` in Cart.** `HebCart` auto-advances to `review` whenever `active`
is true (`HebCart.js:517-519`), which would hide the re-login panel behind a stale browser
session — the state in which the user most needs it.

**Deliberate behavior changes:**
- Cart inherits `expiring` (no such warning today).
- Cart's Connect button becomes stricter, per the 2026-09-16 decision.

---

## 5. Re-login flow

The infrastructure exists and is not rebuilt: `heb-remote-browser` (kasmweb/chrome) and
`cloudflared` ingress `heb-login.needexcelexpert.com` → `heb-remote-browser:6901`;
`POST /api/import-session` on clip-server.

**One shared component** renders for `signedOut` / `noStore` / `wrongStore` in both Cart's
`ConnectionPanel` and Deals' banner: a link to `https://heb-login.needexcelexpert.com`, and below
it an **"I've signed in — import it"** button. This replaces Cart's `npm run scrape:login`
instruction and Deals' "Session Manager" text.

### The import must be asynchronous and single-flight

`importSession` copies a ~355 MB / ~940 file Chrome profile over a Docker bind mount and launches
Playwright, and on a first-pass miss waits 5s and repeats the whole thing
(`session-import.js:94-138`). A synchronous call is not shippable:

- The n8n hostname sits behind Cloudflare with a ~100s origin cap. A slow import returns 524 to
  the browser **while succeeding on the server**.
- `/api/import-session` has no in-flight lock (`clip-server.js:152-165`). A user who taps twice
  gets two profile copies, two Chromes, and two unsynchronized `writeFileSync` calls on the same
  file. `retries: 0` guards against `apiFetch`, not against a person.

Therefore:

1. **clip-server** holds a module-level in-flight promise. A second call while one is running
   joins the first rather than starting another. Returns a job id immediately, following the
   existing `/api/run-scraper` pattern.
2. **n8n webhook `heb_session_import`** — Webhook (responseNode, `X-API-Key`) → HTTP Request
   `POST http://heb-clip-server:3847/api/import-session` with
   `X-Admin-Key: {{$env.ADMIN_API_KEY}}` → Respond, CORS `*`. Container DNS over `hsa-network`;
   no tunnel hop. The browser never holds the admin key.
3. **The app** fires the webhook, then polls `/api/health` until `sessionAuthenticated` flips or a
   ceiling is reached, and reports the outcome from health — not from the webhook response.

`ADMIN_API_KEY` **must be added to the `hsa-local` service environment.** It is currently passed
only to `heb-clip-server`; without this the webhook 401s on first use
(`clip-server.js:58-61`).

### Errors must not become 500s

Kasm syncs the profile on a ~30s cycle and Chrome flushes cookies lazily, so **the first tap
after signing in will commonly return 400 `success:false`** — the expected case, not an incident.
n8n's HTTP Request node throws on 4xx by default, which would surface as an n8n 500, and
`apiJson`'s `raise()` would file a `client_errors` row (and an E Slack alert) on every attempt.

So: HTTP node set to never error; Respond passes the clip-server's status and body through
unchanged; the UI says "give it a few seconds and try again" on a 4xx. A 4xx is not reported by
telemetry (`api.js` reports only network/empty/invalid_json/http≥500).

### Write safety

`session-import.js:183` and `auth.js:223` use `writeFileSync`, which a concurrent `/api/health`
`JSON.parse` can observe mid-write — a transient false `signedOut`. Both become write-temp +
rename.

**`endSession` must not clobber a fresh import.** `endSession` saves when `touched`
(`heb-cart-routes.js:72-77`) and `/session/start` ends the old session *before*
`createBrowserContext` reads the file (lines 135, 141). A user who re-logs in while a stale cart
browser exists would have the import overwritten by logged-out cookies. `saveSession` is skipped
when the file's mtime is newer than the session's start time.

---

## 6. Alerting

New table `heb_session_events` — DDL via an n8n migration workflow (MySQL MCP is read-only).
Columns: observed state, `storeId`, `observed_at`, `notified_at`.

Its purpose is alert throttling, not analytics. Alert on a **state transition**
(e.g. `ready` → `signedOut`), never on every observation — otherwise a 30-day expiry Slacks every
morning.

Added to Daily Maintenance `NGvnsYXF8cpFTHA1`:
HTTP Request → `http://heb-clip-server:3847/api/health` → classify → compare to last row →
INSERT event → Slack on transition.

Three failure modes the naive version silently loses, each addressed:

1. **Empty table.** A 0-row SELECT stops the flow in n8n MySQL 2.4 (node-level
   `alwaysOutputData`; inside `parameters.options` it does nothing). The migration **seeds a
   baseline row**, so the first comparison always has a predecessor.
2. **Slack failure loses the alert forever.** If the row is inserted first and Slack then fails
   (the URL is empty today), the state is recorded as observed and never retried. `notified_at`
   is set **only after a Slack 2xx**, and the gate is "state changed **OR** `notified_at IS NULL`".
   A missed alert is worse than a duplicate.
3. **`unreachable` is a state, not an exception.** The HTTP node is set to continue-on-error; a
   missing or invalid body classifies as `unreachable` and alerts like any other transition.
   Otherwise the execution just fails and the only signal is the generic Error Workflow, which is
   itself Slack-dependent.

**The branch attaches to the schedule trigger, not to the tail of the existing MySQL chain**, so
the health check does not depend on four unrelated maintenance nodes succeeding. The existing
chain is not modified.

**Scrape freshness** (approved 2026-09-16, cheap while in the same job): alert when the newest
`heb_scraping_history` success is older than ~10 days. C's session alerting would not otherwise
catch a WAF-blocked scraper — see §9.

**Slack enablement**: user supplies `SLACK_WEBHOOK_URL` (empty since 2026-09-06), then
`docker compose up -d hsa-local`. Batch this restart with the `ADMIN_API_KEY` addition (§5) —
one restart, ~65s, 42 workflows re-activate. Verify a real delivery.

---

## 7. Deployment order

Netlify deploys `main` automatically; the clip-server needs a manual Docker rebuild. The orders
are **not** symmetric:

1. Compose env: `HEB_STORE_ID` on `heb-clip-server`, `ADMIN_API_KEY` + `SLACK_WEBHOOK_URL` on
   `hsa-local`
2. Clip-server rebuild + restart
3. n8n restart (one restart, batched with step 1) and workflow changes
4. **App merge last**

App-first would ship a hook expecting `storeId` against a container that doesn't send it.
Container-first is safe: the old panel merely shows "sign-in needed" somewhat more often.

The `storeId === undefined` rule (§4) is the real safety net and must hold regardless of order.

Clipping and cart building are down during the clip-server rebuild.

---

## 8. Testing

**Jest** — state precedence for all seven states; `undefined` vs `null` `storeId`; both screens'
banner per state; the strict/loose divergence case specifically; `signedOut` overriding `active`.

Existing assertions that will need updating (enumerated, not discovered later):
`HebCart.ConnectionPanel.test.js:43`, `HebCart.test.js:65`, `e2e/a11y.spec.js:288`
(all assert the `npm run scrape:login` copy); `HebCart.test.js`, `HebCart.session.test.js`,
`useClipSession.test.js`, `cartFixtures.js` (panel currently driven by `/session/status`, and
`mock.unmocked()` assertions break once Cart calls `/api/health`); `e2e/cart.spec.js:12-19`
(explicitly asserts Cart does *not* call health); `mock-backend.js:151-155` and `clip/*.json`
fixtures need `storeId` / `storeExpected`.

**Hermetic Playwright** — a fixture per state; the import button's async/poll path; the 4xx
"not synced yet" path.

**Live smoke** — the existing 4 specs touch none of this, so the live gate gives **zero** coverage
of the change. Live verification of the import flow is manual and must be planned explicitly.

**Gates**: `npm run lint` (0 warnings) → Jest → `npm run test:e2e` (foreground) → live smoke.

---

## 9. Out of scope, recorded

- **The weekly scrape is broken.** `heb_scraping_history` shows `WAF_BLOCKED` on 2026-08-20,
  08-27 and 09-03; last success 2026-08-06 (917 coupons); the 09-10 run logged no row at all.
  Deals is serving ~6-week-old coupons. Agreed 2026-09-16 to finish C first; the freshness alert
  in §6 makes it visible meanwhile.
- **`ready` is a cookie-shape heuristic, not HEB-verified.** `saveSession` re-persists whatever
  auth cookies were loaded even if HEB rejected them. The existing `SESSION_EXPIRED` signal
  (`useClipCoupons.js:95`) should trigger a recheck into the same component.
- **Threat-model asymmetry.** `/api/clip` and `/api/heb/*` remain unauthenticated on the public
  hostname while import gets a keyed hop. Not widened here; the single-flight guard (§5) limits
  the new webhook's abuse value.
- Existing A/B/E/G/D deferrals in the checklist stand.
