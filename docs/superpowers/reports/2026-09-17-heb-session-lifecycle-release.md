# Sub-project C — HEB session lifecycle: release report

Shipped 2026-09-17. App `bd708ca` on `main` (Netlify bundle `main.8e49b497.js`);
scraper `master` at `5e987da`. Spec: `../specs/2026-09-16-heb-session-lifecycle-design.md`
(amended — see its §9). Plan: `../plans/2026-09-16-heb-session-lifecycle.md`.

---

## What shipped

Cart and Deals used to hold contradictory opinions about whether the HEB login worked,
because they read different endpoints with different predicates — one judging file mtime, the
other cookie shape. A cart teardown could rewrite the session file with logged-out cookies and
a fresh mtime, after which Cart offered a "Connect to HEB" button that could not work while
Deals simultaneously said the session had expired.

Now one pure predicate, `evaluateSession` in `heb-coupon-scraper/src/heb-session.js`, decides
validity from the saved storage state, and **all eight** consumers call it: `/api/health`,
`/api/heb/session/status`, `/api/heb/session/start`, `createBrowserContext`,
`scrape-frequent.js`, `scrape-purchase-history.js`, `explore-heb.js` and `test-cart.js`.
`isSessionFileValid` is deleted. **File mtime is no longer a validity input anywhere in the
repo.**

The app consumes one hook, `useHebSession`, which derives six states in strict precedence, and
both screens render one shared `HebSignInPanel`. The remedy is a link to the remote browser
plus a one-tap import through a keyed n8n webhook — replacing a desktop-only
`npm run scrape:login` instruction shown on a phone, and a Deals banner pointing at a
component sub-project A had already deleted.

## Gates

| Gate | Result |
|---|---|
| Scraper Jest | 16 suites / **138 tests** (baseline 7 / 49) |
| App Jest | 49 suites / **423 tests** (baseline 380), 0 `act()` warnings |
| App lint | clean at `--max-warnings=0` |
| Hermetic Playwright e2e | **122 passed / 0 failed** (baseline 106) |
| `client_errors` after live import | **1** — unchanged; the permanent sentinel only |

## Live verification, 2026-09-17

Performed against production with the user signed in through the remote browser.

1. Webhook fired the app's exact path → **202** `{"started":true,"alreadyRunning":false}`, CORS `*`.
2. Import succeeded on pass 1 — **24 HEB cookies** written atomically.
3. `/api/health` reported the imported session: `sessionAuthenticated: true`, `reason: "ok"`,
   `authExpiresAt` **365 days** out.
4. Derived app state: **`ready`** — the panel correctly renders nothing.
5. Telemetry unchanged at 1 row, confirming the webhook's `neverError` setting keeps a routine
   4xx from filing a `client_errors` row.

### Two rulings proved themselves in that run

**R5/R7 (the expiry fold).** The importer logged `Session expires: 02:55` — 23 minutes out —
and the `_interaction*` cookies expired 58 minutes out. Under the spec's *original* rule
(earliest expiry across `sst` plus any `accounts.heb.com` cookie) this freshly-imported session
would have reported `expiring` on arrival and `auth_expired` within the hour, so the re-login
flow would have appeared to fail every time, immediately after succeeding. The
`min(sst, MAX(accounts))` fold reported 365 days.

**R14 (`wrongStore` is advisory).** The fresh login wrote `SHOPPING_STORE_ID=809` and the app
derived `wrongStore` against a session that was correctly bound — the user read
"Curbside at H-E-B McKinney" (794) in that same browser. Had the state stayed *blocking* as the
plan specified, the user would have been locked out of clipping at the exact moment they had
done what the app asked. It was advisory, so nothing was blocked, and the cookie was
subsequently dropped from the resolution entirely (below).

## The three unactionable remedies this sub-project nearly shipped

Each would have told a correctly-configured user to fix something they could not fix. All three
were caught by measurement rather than by review of the design.

1. **"Choose your HEB store", permanently.** Spec §3 resolved the store from cookies and §4
   derived `noStore` from `null`. Measured: a healthy authenticated session carries **zero**
   store cookies, because HEB resolves the curbside store server-side. Every correct user would
   have been nagged forever. `noStore` was deleted; `null` and `undefined` both mean *not
   observed* and skip the store check.
2. **A sign-in link to a desktop with no browser.** The compose mount of
   `kasm-custom-startup.sh` over `/dockerstartup/custom_startup.sh` *replaced* the image's own
   Chrome launcher, so the remote browser booted with no Chrome at all. Repaired with a wrapper
   that backgrounds the profile sync then `exec`s a verbatim copy of the stock launcher.
   (`kasm_post_run_user.sh` is not a usable hook here — nothing invokes it outside Kasm
   Workspaces.)
3. **An import button that could never succeed.** `session-import.js` had never worked: it died
   on every run with `Browser.getWindowForTarget: Browser window not found`. Rewritten to spawn
   Chrome and attach over CDP — the pattern `chrome-launcher.js` had already settled on for the
   WAF. It also stranded a ~370MB profile copy per attempt, fixed by killing the process group
   and awaiting it.

## An outage we caused and fixed the same night

The Task 6 container rebuild pulled in the same-day WAF fix (`6c61b48`), whose new
`chrome-launcher.js` knew only Windows Chrome paths and passed no `--no-sandbox`. Inside the
Linux container `createBrowserContext` therefore threw before a browser existed, so **coupon
clipping and the cart builder were down while `/api/health` still reported `ready`** — C's own
failure mode, one layer lower. Found by the final whole-branch review, reproduced live, and
fixed by adding Linux paths and a root-conditional `--no-sandbox` (conditional so the desktop
path, the one Incapsula actually inspects, gains no new fingerprint). Both `spawn` sites now
listen for `error`; without a listener an ENOENT would take the whole clip-server process down.

No test could have caught it: the launcher's tests used a `C:/tmp/profile` path and asserted
flag *absence* only. Five tests now pin the Linux path and the sandbox flag.

## Store binding, as actually shipped

Reduced in scope on evidence. Only `CURR_SESSION_STORE` is trusted. `SHOPPING_STORE_ID` was the
documented fallback until field data killed it: observed twice, wrong both times, against an
account confirmed bound to 794. Anything else resolves to UNKNOWN, which produces no warning.

Reading the true store needs a live page load, which is too expensive for a health endpoint —
it belongs to sub-project F.

## Deferred, carried forward

Ranked by the final review.

**High**
- `useHebSession` fetches `/api/health` once on mount and never on a timer, so a login that dies
  mid-session is invisible until a remount. Not a regression — it is what the old code did — and
  spec §8 records the intended wiring: the existing `SESSION_EXPIRED` signal
  (`useClipCoupons.js:95`) should trigger a `recheck`. Highest-value follow-up.
- `endSession` still writes the cart browser's cookies back even when HEB rejected every
  request (`touched` is set unconditionally at `heb-cart-routes.js:50`). C killed the
  user-visible symptom, but the write that destroys a good session survives.
- `loginToHeb` still judges login success by URL alone. The Incapsula block page is served from
  `www.heb.com`, so it passes every URL check and can overwrite a good session with WAF-only
  cookies. Same fix shape as the item above — gate the save on `evaluateSession(...).usable`;
  bundle them.

**Lower**
- `/api/import-session` is not truly asynchronous: `importSession()`'s first act is a ~436MB
  synchronous `copyDirSync` that blocks the event loop for 5-8s before the 202 is written,
  stalling the 3s health polls the UI fires during an import. Inside Cloudflare's ~100s cap, so
  the spec's stated purpose is met.
- The import's failure path takes the full 60s poll ceiling; the precise answer exists in ~10s
  at `/api/import-session/status`, which ruling R3 removed from the app because nothing consumed
  it.
- `/api/health` now discloses store `794` on an unauthenticated, internet-facing route. Ruling
  R11 scoped only the import route. Worth a decision.
- `clearTimeout` is skipped on `useHebSession`'s error path (harmless open handle).
- The clip-server container has the default 64MB `/dev/shm`, which crashes Chrome on heavy
  pages. Clipping goes through GraphQL and is unaffected, but any future `page.goto` work needs
  `shm_size` raised or `--disable-dev-shm-usage`.
- `ready` remains a cookie-shape heuristic, not an HEB-verified login.
- `/api/clip` and `/api/heb/*` stay unauthenticated on the public hostname.

**Resolved since the plan was written:** the weekly scrape is no longer WAF-blocked (fixed
2026-09-16; 826 coupons). A "coupon data is N days old" freshness line still belongs to F.

## Process notes

- The plan was deliberately **not** edited when it proved wrong; corrections travelled as
  errata in each dispatch, with 21 rulings (R1-R21) recorded in the SDD ledger. Amendments that
  changed *design* rather than detail were made to the spec and committed (`4faab34`).
- Four plan defects would have shipped broken code. The most serious: the plan's `mounted` ref
  pattern is inverted under `StrictMode`, which this app uses — the hook would have been stuck
  in `checking` forever, so the panel would never have rendered and C would have shipped doing
  nothing. Also `userEvent.setup()` does not exist at the pinned v13.5.0, and three separate
  `getByText` collisions.
- One fix in this sub-project was published with a **wrong root cause** and then corrected: a
  2x2 matrix run in sequence against the same Chrome profile directory, where the first failing
  launch had already migrated the profile. A contaminated measurement is worse than none,
  because it reads as evidence. Always take a fresh copy per cell.
