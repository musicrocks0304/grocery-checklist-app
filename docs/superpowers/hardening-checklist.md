# Hardening checklist

Living checklist for the post-review hardening program. Tick items as they ship; keep the "Why" lines so a future session knows the evidence behind each. Sub-projects run in the agreed order A → B → E → G → D → C → F unless the user reorders. Each sub-project gets its own spec (`docs/superpowers/specs/`) and plan (`docs/superpowers/plans/`) before implementation.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` dropped

## A. Webhook exposure + response contract — `[x]` shipped 2026-09-06

Spec: `docs/superpowers/specs/2026-09-05-webhook-contract-design.md`. Handoff: `docs/superpowers/handoffs/2026-09-05-webhook-contract-handoff.md`.

- [x] `ApiError` + `apiJson` in `src/config/api.js`; POST/PUT/DELETE default to `retries: 0`
- [x] Migrate the 50 `apiFetch` sites (hand-review the 9 `response.text()` sites in ChatBot/MealCreator); add the missing `ok` check on `grocery_prep` in Home.js; delete dead `SessionManager.js`
- [x] `submit_feedback` idempotency: client `client_id` UUID + unique index on `app_feedback.client_id` + `INSERT IGNORE`
- [x] Scraper store-locations scripts send `X-API-Key` (new `GROCERY_APP_API_KEY` in scraper `.env`); `review-feedback` command sends it (parsed from app `.env`, never inlined)
- [x] `scripts/webhook-contract.mjs` with the three tiers (exercised / auth-probe with invalid body / skipped) and error-body leakage assertions; sends `Origin` header
- [x] Step zero fault injection (`docker pause hsa-mysql`) recorded before n8n edits
- [x] n8n wave 1: auth on the 16 read workflows (+ branch audit where a zero-row stop exists)
- [x] n8n wave 2: list/progress/feedback/session mutations + the 6 authenticated mutating workflows: auth, remove error swallowers, `Respond 500` on MySQL/Postgres/HTTP/Code error outputs, branch audit
- [x] n8n wave 3: `grocery_prep`, `smart_deals`, `smart_match_grocery`, `transcribe_grocery_item`, `categorize_heb_product`
- [x] Live contract test green; memory + ledger updated

Why: 25 of 39 webhooks accepted unauthenticated calls (17 mutating); MySQL outages produced empty 200s read as success; AI POSTs were retried twice on 500.

Shipped state (2026-09-06): all 39 webhooks require `X-API-Key`; `apiJson` live (bundle main.800ec3b3.js); 37 `DB ok?` guards → `Respond 503` on 31 workflows; `Respond 500` branches on every pre-response MySQL/Postgres/Code node; `app_feedback.client_id` + `INSERT IGNORE`; `save_coupon_matches` Switch fixed; `scripts/webhook-contract.mjs --wave 3` = 70 passed / 0 failed; `--fault` = 4/4 503. Ledger of every ruling: `.superpowers/sdd/2026-09-05-webhook-contract/progress.md` (git-ignored; rulings summarised in memory).

Deferred from A (assign to E/F or fix opportunistically):
- `smart_deals`: a 0-row `Fetch Clipped IDs` / `SQL Match Products to Coupons` stops the flow before the guard (empty 200 → client "empty response" toast); needs `alwaysOutputData` + `{}` tolerance in `Overlay Clipped Status` / `Build AI Prompt`.
- `get_recipe_items`: the post-response `Transform for Weekly Selections → Execute a SQL query` branch is unguarded (silent failure after the response).
- SELECT nodes with `alwaysOutputData` keep a bounded double-response race on per-item SQL errors (`Respond 500` vs `[]` 200).
- `chat_history` (Postgres) is not exercised by `--fault`.
- `meal_creator_propose`/`call_grocery_agent`: Postgres archive nodes run after the response and are unbranched.
- `Lookup OneOff ID`/`Lookup Session` use `require` guards; a genuine zero-row lookup answers 503.
- Client: `Coupons.js`, `Deals.js`, `RecipeInstructions.js`, `Home.js` still render raw `err.message` (use `userMessage()`); `useCategories` shim is dead code; `useWeekMeals` failure test exercises real backoff.
- Deferred from A/B, now observable via E: `api`-kind `client_errors` rows will surface the `smart_deals` 0-row stop, the SELECT double-response race, and the Deals `deal.id` failure the next time any of them fires in production — check `client_errors` before re-investigating those from scratch.


## B. Test infrastructure — `[x]` shipped 2026-09-06

- [x] Checked-in Playwright e2e (`e2e/`): hermetic suite (70 tests × mobile 390×844 / desktop 1280×800) against a production build served on port 3000 with every n8n/clip request mocked from recorded, sanitised fixtures (`e2e/fixtures/`, `npm run test:e2e:record`), clock frozen at 2026-09-09 (week of Sept 6–12, 2026), third-party hosts aborted; plus a 3-spec live smoke set (`npm run test:e2e:live`, Plan/Shop/Feedback) that cleans its own rows
- [x] Component/render tests for the four untested screens: `Deals.js`, `InStoreMode.js` (ModeMenu, InviteModal, PartnerBadge), `HebCart.js` flows, `ChatBot.js` toolbar (`src/test-utils/{mockFetch,render}.js` helpers)
- [x] `npm run lint` (`eslint src --max-warnings=0`) is a clean gate
- [x] Dead `html2canvas` mock removed; Sidebar and ModeMenu feedback entry-point tests added
- [x] Zero `act()` warnings across 34 suites / 234 tests
- [x] GitHub Actions `.github/workflows/ci.yml` on push/PR: lint → Jest → hermetic Playwright (Chromium); Netlify deploy unchanged

Why: two regressions in the 2026-09-05 fix run were only caught by reviewers; ad-hoc Playwright scripts are not repeatable.

Shipped state (2026-09-06): spec `docs/superpowers/specs/2026-09-06-test-infrastructure-design.md`, plan `docs/superpowers/plans/2026-09-06-test-infrastructure.md`, branch `feat/test-infrastructure` fast-forwarded into `main` at 9cc0322. Two production bugs fixed along the way: desktop feedback panel Submit button off-screen (`FeedbackPanel.js`), bottom-tab active indicator ~10px off centre (`BottomTabBar.js`). Deferred from B: Deals `deal.id` undefined on add (fixture-derived), spec extras not in the plan (Cook timer fast-forward, Cart build SSE), `#meals` routing assertion bound to the ChatBot greeting copy, popup windows escape the hermetic catch-all (no spec opens one), `App.test.js` one-off flake under CPU load, StrictMode double-POST smell on the dev server (hermetic suite uses a production build for that reason).

## E. Client error telemetry — `[x]` shipped 2026-09-06

- [x] `window.onerror` / `unhandledrejection` / React ErrorBoundary post to a new `client_errors` webhook (screen, message, stack hash, user agent, week); dedupe by stack hash per session; respects the A contract (key, JSON)
- [x] n8n Error Workflow configured on all active workflows (none has one today) → Slack (`SLACK_WEBHOOK_URL` exists in `C:\hsa-automation\.env`)
- [x] Home or feedback panel shows nothing new; this is silent instrumentation
- [ ] Fill `SLACK_WEBHOOK_URL` in `C:\hsa-automation\.env` (Incoming Webhook for #automation-alerts), run `cd /c/hsa-automation && docker compose up -d hsa-local`, then verify with a fresh throwaway post to `client_errors` (new `stack_hash`, message prefixed `[TEST]`) and delete that row; the live sentinel's one-time Slack line was already consumed while the URL was empty. Hashes first recorded while the URL was empty will never alert (Notify? gates on row existence, not on `notified`): when filling the URL, either run `DELETE FROM client_errors WHERE created_at < '<fill time>'` via docker exec (accepting the loss of that history) or accept that those hashes stay silent until the code changes and the hash moves.
- [ ] First real telemetry (2026-09-06 live run): two `api`/`network` reports on #shop for `shopping_progress_check` (status 0, exec 26528/26584) — benign teardown; rows deleted during Task 8, evidence in `docs/superpowers/reports/2026-09-06-client-errors-first-telemetry.md`.

Why: the only production signal is the `app_feedback` table; failures Christian never reports are invisible.

Shipped state (2026-09-06): reporter `src/telemetry/errorReporter.js` catches `onerror`/`unhandledrejection`/React ErrorBoundary/`api` (from `apiJson`) kinds, deduped via `sessionStorage` by an FNV-1a hash of the stack, capped at 20/session and 5/minute, sent as a raw `keepalive` fetch; installed from `src/index.js`. `apiJson` only reports `network`/`empty`/`invalid_json`/`http>=500` codes (4xx client errors are not telemetry). Workflow "Client Error Telemetry" (id `CPnstolvOjSGOm3z`) at `POST /webhook/client_errors`: Validate → `Respond 400` on an invalid body → "Seen before?" → `INSERT IGNORE` → "Notify?" → Slack (first sight of a `stack_hash`, throttled to ≤10/h) → "DB ok?" (`Respond`) → `Respond`, with `Respond 500`/`Respond 503` on the A contract. Table `client_errors` (`docs/migrations/2026-09-06-client-errors.sql`) with a 90-day sweep node `Purge Old Client Errors` appended to Daily Maintenance (`NGvnsYXF8cpFTHA1`). Error Workflow "n8n Error → Slack" (id `NVS9ZMdzpWSdSBn2`, inactive by design — Error Trigger → Format → HTTP to `$env.SLACK_WEBHOOK_URL`) is set as `settings.errorWorkflow` on all 42 active workflows via the new `node scripts/n8n-wave.mjs error-workflow <id>` (also new: `create <file.json> [--inactive]`, `apply-id <id> <edit.mjs>`; definitions in `scripts/n8n-workflows/`). Contract entry `client_errors` added to `scripts/webhook-contract.mjs` (wave 3, probe). Hermetic coverage: `e2e/telemetry.spec.js` (78 hermetic tests now), Jest 257. Live coverage: `e2e/live/telemetry.live.spec.js` posts a permanent sentinel row (session `00000000-0000-4000-8000-0000000e2e01`, hash `e2e00001`) idempotently and asserts the 400 on an empty body.

Deviation found during live verification: `SLACK_WEBHOOK_URL` in `C:\hsa-automation\.env` is empty today, so every Slack post from both the Client Error Telemetry workflow and the Error Workflow fails silently — rows are still stored (`notified=1`), but the Error Workflow's own execution ends in error at its Slack node. Verified on the probe: `Format` produced `[grocery-n8n] ZZ Error Probe (delete after use) failed at Boom: [TEST] error workflow probe — safe to ignore [line 1] — http://localhost:5679/workflow/…/executions/26491`. The follow-up item above is unticked until `SLACK_WEBHOOK_URL` is filled in and re-verified.

## G. Accessibility pass — `[ ]`

- [ ] Focus trap + `aria-modal` on the feedback panel and invite modal; return focus on close
- [ ] `aria-controls` on the Cart "Show technical details" disclosure
- [ ] Guard `openFeedback` against re-entry while the panel is open (keyboard users can Tab to the header button and clobber screenshots)
- [ ] Secondary controls below 44px: Cook debug toggle, Deals "Retry" during add, Plan category "Select all/Clear" text buttons
- [ ] Keyboard path through Shop check-offs and the ⋯ menu (Escape closes)

Why: flagged by task reviewers during the 2026-09-05 fixes; none blocked shipping but all are cheap.

## D. Decompose the large components — `[ ]` (after B, so refactors are guarded)

- [ ] `App.js`: extract `useHashRoute` (routing + popstate/hashchange + join flow) and `useWeeklyMeals` (meal load/refresh); use `resolveScreenFromHash` in the state branch of the popstate handler (currently re-implemented inline)
- [ ] `InStoreMode.js` (~1,900 lines): split `useShoppingProgress` (pending-ops layer, poll), `usePartnerSession`, voice check-off hook already exists; move `ModeMenu`, `InviteModal`, `ReorderDrawer`, `AisleSection` to `src/components/instore/`
- [ ] `HebCart.js` (~1,400): `useClipSession` (status poll, connect/disconnect/recheck), `useCartBuild` (SSE), panels to `src/components/cart/`
- [ ] `RecipeInstructions.js` (~1,450): selection screen vs cooking mode as separate components; timer hook
- [ ] `ChatBot.js` / `MealCreator.js` (~1,300 / ~1,200): shared chat transport hook with the `sendMessage(overrideText)` retry pattern and the text-parsing fallbacks
- [ ] Delete dead code: `SmartDeals.js`, `Coupons.js` if unrouted after check, `SessionManager.js` (already slated in A)

Why: every fix round pays a context tax on these files; reviewers repeatedly flagged file size.

## C. HEB session lifecycle — `[ ]`

- [ ] Daily maintenance workflow checks clip-server `/api/health` `sessionAuthenticated`; on false, Slack alert + a `heb_session_expired` flag the app can read
- [ ] Cart/Deals show one shared "HEB sign-in needed" state sourced from that flag (Cart already has the panel; Deals banner should match)
- [ ] Phone-friendly re-login: evaluate the existing `heb-login.needexcelexpert.com` remote-browser tunnel as the path (link from the Cart panel) versus a scraper endpoint that triggers `scrape:login`; pick one and wire it
- [ ] Session store binding check (must be store #794) surfaced in the same state

Why: Deals clipping and the Cart builder are unusable whenever the login expires, which is the normal state between manual logins.

## F. Scrape-time data quality — `[ ]`

- [ ] Decode HTML entities in `heb_frequent_products` / `heb_coupons` names at scrape time (app now decodes at render; remove the need)
- [ ] Reconcile `GroceryItems.Category` vs `store_location` aisle (e.g. Pastry Pups: Frozen food vs Bakery); report + fix list; align with feedback #41 (Christian's store-layout notes) before closing it
- [ ] Backfill `GroceryItems.category_id` where NULL

Why: UI-level patches hide inconsistent source data; walk order depends on it.

## Deferred findings from reviews (assign to a sub-project or fix opportunistically)

- [ ] **Data integrity (schema):** `WeeklyGroceryList.ItemID` collides across `DataSource` (staples 1001–1050 vs meal ingredients `ingredient_id + 1000`; 21 IDs today). Add `DataSource` to `uq_week_item` or namespace IDs. Until fixed, no `INSERT IGNORE`/ODKU on that table. Evidence: `SELECT ItemID, GROUP_CONCAT(DISTINCT DataSource) FROM WeeklyGroceryList GROUP BY ItemID HAVING COUNT(DISTINCT DataSource) > 1`
- [ ] `grocery_prep` orchestrator: mid-chain failures leave `prep_jobs.status='running'` until the 5 AM sweep; add a `Final Update` on the error path
- [ ] `categorize_heb_product` returns 200 with a `parse error` placeholder when model output is unparsable; should be a 5xx or a `success:false`
- [ ] Deals: selection toolbar flashes while `useClipServerHealth` is `loading`; "Retry" not disabled during an in-flight add; search/filter matches raw (undecoded) names
- [ ] Deals "Add to list" duplicate check compares full HEB product titles against staple names, so it only catches re-adds of the same deal (by design, but worth a fuzzy match later)
- [ ] Cart "Connected!" toast fires on `loginSessionValid`, not an active browser session; copy could say "Signed in — you can connect now"
- [ ] `PartnerBadge` defaults a missing `role` to the partner label; make it explicit
- [ ] Plan desktop CSS columns read column-major; confirm with the user it feels right at 1280px+
- [ ] Removing a one-off leaves its name row in `oneoff_items` (by design as the stable ID lookup; document or add a sweep)
- [ ] Feedback #41 (store-layout sections) remains open pending Christian's real-trip validation
- [ ] Rate limiting at Cloudflare for `submit_feedback`, `create_session`, `grocery_prep`, `transcribe_grocery_item` (explicit non-goal of A; free plan allows one rule)
- [ ] Per-device auth token (real protection; deferred by user decision)
- [ ] Invite session created only on "Copy link" (UI change; deferred)
- [ ] Notify sub-workflow for the Respond 500/503 branches (scraper-originated failures are not reported by the client)
- [ ] Slack gate keyed by stack hash re-alerts once per build for a surviving bug; switch to (message, screen) if noisy
- [ ] Error Workflow cannot see workflows that end with an empty 200 after a Respond already fired
- [ ] Slack `text` interpolates client-controlled `message` unescaped (strip `<`/`>` or code-span it)
- [ ] Validate truncates before regex-matching `stack_hash`/`session_id`
- [ ] The notify throttle is raceable (SELECT then INSERT)
- [ ] `client_time` is stored UTC while `created_at` is server-local
- [ ] An unhandled `apiJson` rejection is reported twice (kind `api` + kind `unhandledrejection`)
- [ ] Error Workflow `Format` has no fallback for the trigger-failure payload shape
- [ ] `error-workflow`/`listActive` unpaginated at 100
