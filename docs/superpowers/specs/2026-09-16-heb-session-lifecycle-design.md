# Sub-project C — HEB session lifecycle (design)

Date: 2026-09-16
Status: approved; **amended 2026-09-16 after Task 5 — see §9.** §3, §4, §5, §7 and §8 carry the
amended text inline; §9 records what changed, the measurements that forced it, and the cost if
the new reading is wrong.
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
currently unreachable — see §8.)

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
- *App-side reconciliation only* — a shared hook reconciles the two endpoints client-side and no
  container is rebuilt. But the loose predicate would survive in `/session/start` and
  `createBrowserContext`, so the browser still launches with cookies it cannot use; the UI would
  merely be better at describing a backend that stays broken. It also leaves every future consumer
  to re-implement the reconciliation.
- *Route all health through n8n* — adds a hop to a check that runs on every Deals/Cart mount and
  discards a working, CORS-allowed direct path. The health endpoint is read-only; there is
  nothing to protect.

This supersedes the checklist's "a `heb_session_expired` flag the app can read". A flag written
by a daily job would be up to 24h stale in the UI: a user who re-logged in on their phone would
still be told to sign in. The app reads live health instead, and **no flag table is created**.

**Alerting is out of scope entirely** (decided 2026-09-16). The checklist's first C bullet called
for a Slack alert. The user does not use Slack and never has; sub-project E introduced Slack on an
assumption, and its two nodes — the only notification mechanism anywhere in the stack — have never
fired. Rather than substitute a different channel, C surfaces session state where the user is
already blocked: in Cart and Deals, with the re-login flow attached. That covers the real failure
(clipping and cart-building are dead) at the moment it bites, and needs no new infrastructure. A
push channel would add only advance warning, which is the smaller half of the value.

Consequences: no `heb_session_events` table, no changes to Daily Maintenance
`NGvnsYXF8cpFTHA1`, and no n8n restart for `SLACK_WEBHOOK_URL`.

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
single idle day, demanding a phone re-login (with hCaptcha) every day —
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

### Store binding (AMENDED 2026-09-16 — see §9, Amendment 1)

**HEB resolves the curbside store server-side from the account. There is no reliable store
cookie.** Measured on a live, authenticated session: 30 `heb.com` cookies, **none** carrying
store information — no `CURR_SESSION_STORE`, no `SHOPPING_STORE_ID` — while the site header
still correctly read "Curbside at H-E-B McKinney". The store id appears only in the page
payload, which `/api/health` cannot reach without a browser.

Those cookies do appear *sometimes* — a February profile carries `CURR_SESSION_STORE=794`,
an August one carried `SHOPPING_STORE_ID=809` — so they seem to be written transiently when a
store is picked through the UI and are absent otherwise. **They are a hint, never authority.**

Resolution from the already-parsed storage state; no browser:

1. `CURR_SESSION_STORE` when present and unexpired → observed (`storeSource: 'curr'`)
2. else `SHOPPING_STORE_ID` when present and unexpired → observed (`storeSource: 'shopping'`)
3. else `storeId: null`, `storeSource: null` → **UNKNOWN, not "no store"**

Compared as strings against `storeExpected` (`HEB_STORE_ID`, default `'794'`). Cookie `expires`
is honored — a 30-day persistent store cookie must not be reported as current months later.

**`storeId: null` means "not observed" and MUST NOT produce a user-facing remedy.** On a
correctly-configured account it is the *normal* result, so surfacing a remedy for it tells every
healthy user to fix something that is not broken and cannot be cleared by complying. Never
surface a remedy for an unknown.

The predicate is unchanged by this amendment — reporting `storeId: null` is the correct
*observation*. What changes is its *interpretation* in §4.

**The account is bound to store 794 (H-E-B McKinney, 8700 Eldorado Pkwy) and always was.** The
earlier "809 is live drift" conclusion in this document was wrong: it read a stale,
non-authoritative cookie on an unauthenticated session. To verify the real store, load
`https://www.heb.com/` in an authenticated browser and search the page HTML for
`store[_-]?(id|number)`. Do not trust cookies.

---

## 4. Client state model

New hook `useHebSession` → `{ state, health, recheck }`. One state, strict precedence.

**AMENDED 2026-09-16 (see §9, Amendment 1): `noStore` is deleted, and `wrongStore` is
advisory rather than blocking.** Six states, not seven:

| State | Condition | Remedy surfaced |
|---|---|---|
| `checking` | no response yet | none — render no banner |
| `unreachable` | network failure, or non-2xx, or unparseable body | "the clip server may need restarting" |
| `signedOut` | reachable, `sessionAuthenticated` false | **the re-login flow (§5)** |
| `wrongStore` | authenticated, a store id was **observed** and differs from `storeExpected` | advisory, non-blocking — "this session's last store selection was #{storeId}; the app is set up for #794" |
| `expiring` | authenticated, auth cookie expires < 48h | advisory, non-blocking |
| `ready` | otherwise — **including when no store id was observed** | none |

Rules that keep it honest:

- **`checking` must not flash.** `ConnectionPanel` already guards this (`isChecking`, lines 9-12)
  and the guard survives; losing it would reintroduce a defect the 2026-09-05 UI review fixed.
- **An unobserved store skips the store check entirely — `null` and `undefined` alike.**
  `undefined` means an old backend that does not send the field; `null` means the cookie was
  absent, which §3 establishes is the normal state of a healthy session. Neither is evidence of
  a wrong store, and one rule now covers both: *compare only what was actually observed.*
  Without it, every correctly-configured user is permanently told to choose a store, and the
  existing `Deals.test.js` fixtures (lines 16, 30) — which carry no `storeId` — fail.
- **`wrongStore` never blocks.** The only signal available is a cookie §3 shows to be
  transient and non-authoritative — it has already produced one false positive (the retracted
  "809 drift"). Blocking clipping on it would repeat, in a new place, the exact failure this
  amendment removes: a user stopped by a warning they cannot clear by complying. It renders as
  a note alongside working controls; it does not disable clipping and does not gate Connect.
  Its copy must be worded as an observation, not an instruction.
- **Store state ranks below `signedOut`.** Binding is meaningless when logged out.
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

**AMENDED 2026-09-16 (see §9, Amendment 2): Kasm is the convenient path, not the only one,
and the container does not currently work.**

Desktop login was restored on 2026-09-16 (`chrome-launcher.js`, scraper commit `6c61b48`):
Incapsula fingerprints the way Playwright *launches* Chrome, not automation itself, so the
scraper now spawns Chrome as a normal process and attaches over CDP. Verified the same day —
826 coupons scraped, 72 frequent products, session good to 2027-09-17. `npm run scrape:login`
works again. So the remote browser is a **phone-friendly convenience**, which is what this
sub-project wanted it to be; it is not the sole recovery path, and the panel must not imply
the system is one broken container away from unusable.

The infrastructure exists and is not rebuilt: `heb-remote-browser` (kasmweb/chrome) and
`cloudflared` ingress `heb-login.needexcelexpert.com` → `heb-remote-browser:6901`;
`POST /api/import-session` on clip-server.

**But `heb-remote-browser` boots a desktop with no browser.** Measured 2026-09-16: the compose
mount `kasm-custom-startup.sh:/dockerstartup/custom_startup.sh` *replaces* the image's own
Chrome launcher (`START_COMMAND="google-chrome"`) with the profile-sync loop, so `vnc_startup.sh`
launches the sync instead of Chrome — `ps` inside the container shows no Chrome process at all.
`kasm_post_run_user.sh` is **not** a usable home for the sync script in this deployment: nothing
invokes it outside Kasm Workspaces (verified by search inside the container; the compose
entrypoint is `kasm_default_profile.sh → vnc_startup.sh → kasm_startup.sh`).

Fix: keep the mount at `custom_startup.sh` but make it a **wrapper** — background the sync loop,
then `exec` a verbatim copy of the image's original launcher, mounted alongside at a second
path. The original is self-contained (it calls only `/usr/bin/filter_ready` and
`/usr/bin/desktop_ready`, both present), so copying it preserves `KASM_URL`, exec mode and
restart-on-crash. **Shipping the panel's sign-in link against the container as it stands would
be a second unactionable remedy**, so this is a release blocker for the link, not a nicety.
If the fix is declined, the link must be replaced with the desktop instruction rather than left
pointing at a dead desktop.

**One shared component** renders for `signedOut` / `wrongStore` in both Cart's
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
`apiJson`'s `raise()` would file a `client_errors` row on every attempt.

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

## 6. Deployment order

Netlify deploys `main` automatically; the clip-server needs a manual Docker rebuild. The orders
are **not** symmetric:

1. Compose env: `HEB_STORE_ID` on `heb-clip-server`, `ADMIN_API_KEY` on
   `hsa-local`
2. Clip-server rebuild + restart
3. n8n restart (one restart, batched with step 1) and workflow changes
4. **App merge last**

App-first would ship a hook expecting `storeId` against a container that doesn't send it.
Container-first is safe: the old panel merely shows "sign-in needed" somewhat more often.

The "compare only an observed store id" rule (§4, as amended) is the real safety net and must
hold regardless of order.

Clipping and cart building are down during the clip-server rebuild.

---

## 7. Testing

**Jest** — state precedence for all six states (§4 as amended); `undefined` **and** `null`
`storeId` both reaching `ready`, named as regression tests against the false "choose a store"
alarm; both screens' banner per state; the strict/loose divergence case specifically;
`signedOut` overriding `active`; `wrongStore` leaving clipping enabled.

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

## 8. Out of scope, recorded

- ~~**The weekly scrape is broken.**~~ **RESOLVED 2026-09-16** — root cause was the WAF
  fingerprinting Playwright's *launch* of Chrome; `chrome-launcher.js` now spawns Chrome and
  attaches over CDP (scraper `6c61b48`). 826 coupons scraped the same day, ending a six-week
  outage (`WAF_BLOCKED` on 08-20, 08-27, 09-03; 09-10 logged no row). A "coupon data is N days
  old" freshness line in Deals is still worth having and still belongs to F, not C.

- ~~**Store 809 is live drift.**~~ **RETRACTED 2026-09-16 — this was wrong.** The account is on
  794 and always was; the 809 reading came from a stale, non-authoritative cookie on an
  unauthenticated session. There is no drift to correct. See §3 as amended: HEB resolves the
  store server-side, so no cookie-based check can establish the bound store, and `/api/health`
  reports a *hint*, not a fact. Reading the true store needs a live page, which is too expensive
  for a health endpoint — it belongs in a periodic check, i.e. F. Aisle/walk-order data keyed to
  #794 is unaffected by C either way.
- **`ready` is a cookie-shape heuristic, not HEB-verified.** `saveSession` re-persists whatever
  auth cookies were loaded even if HEB rejected them. The existing `SESSION_EXPIRED` signal
  (`useClipCoupons.js:95`) should trigger a recheck into the same component.
- **Threat-model asymmetry.** `/api/clip` and `/api/heb/*` remain unauthenticated on the public
  hostname while import gets a keyed hop. Not widened here; the single-flight guard (§5) limits
  the new webhook's abuse value.
- Existing A/B/E/G/D deferrals in the checklist stand.

---

## 9. Amendments (2026-09-16, after Task 5)

Two premises of the approved spec were disproven by field measurement between Tasks 5 and 6.
Both would have shipped a **visible false alarm** — a banner telling a correctly-configured user
to fix something that is not broken and that they cannot clear by complying. That failure mode
is worse than the bug C exists to remove, because it is permanent rather than intermittent.

Tasks 1-5 are unaffected and stay as committed: the predicate's job is to *observe*, and
`storeId: null` is the correct observation. Only the interpretation layer (Tasks 7-11) changes.

### Amendment 1 — a null store id is UNKNOWN, not "no store"

**Evidence.** The live authenticated session file (30 cookies, `usable: true`, auth good to
2027-09-17) carries **zero** store cookies, while the site header correctly shows
"Curbside at H-E-B McKinney". HEB resolves the curbside store server-side from the account; the
id is in the page payload only. `evaluateSession` on that file returns
`storeId: null, storeSource: null` — and under §4 as approved that derives `noStore`, which
renders "Choose your HEB store" to every healthy user, forever.

**Changes.** §3 rewritten (store cookies are a transient hint, never authority; the account is
on 794 and always was). §4: `noStore` **deleted**; the store check now runs only on an
*observed* id, collapsing the old `undefined` compatibility rule and the `null` case into one
rule. §4: `wrongStore` downgraded from blocking to **advisory**, because the only available
signal has already produced one false positive — the retracted "809 drift" — and blocking
clipping on a known-unreliable cookie would recreate the same unactionable-remedy failure in a
new place. §7 gains named regression tests for both `null` and `undefined` reaching `ready`.
§8's "Store 809 is live drift" bullet retracted.

**Cost if wrong.** A genuinely mis-bound store is now reported without blocking, so a user could
clip against the wrong store's prices after ignoring an advisory. That is a rare, self-correcting
error with a visible warning attached; the alternative was a permanent false alarm for everyone.
Establishing the store for real needs a live page load and belongs to F.

### Amendment 2 — Kasm is a fallback, and the container is currently broken

**Evidence.** Desktop Playwright login was restored on 2026-09-16 (scraper `6c61b48`): the WAF
fingerprints Playwright's *launch* of Chrome, so the scraper now spawns Chrome and attaches over
CDP. Verified — 826 coupons, 72 frequent products, session to 2027-09-17. Separately, measured
inside `heb-remote-browser`: the compose mount replaces the image's Chrome launcher with the
profile-sync loop, and **no Chrome process is running** — the remote desktop has no browser.

**Changes.** §5 reframes the remote browser as the phone-friendly convenience rather than the
sole recovery route, records the container defect and the wrapper fix (and that
`kasm_post_run_user.sh` is never invoked in standalone compose mode, so it is not the fix), and
makes a working sign-in link a release blocker for that link. §8's "weekly scrape is broken"
bullet marked resolved. Panel copy in Task 8 must not imply the system is unusable without Kasm.

**Cost if wrong.** If the wrapper fix is declined, the panel's sign-in link must be replaced with
the desktop instruction — which is the remedy §1 calls a defect on a phone, but an honest one.

### Not amended

The single-predicate architecture, the async single-flight import, the keyed webhook hop, the
deployment order, and the `signedOut`-overrides-`active` rule are all unchanged and still hold.
