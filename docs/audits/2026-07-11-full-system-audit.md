# Full-System Audit — 2026-07-11

**Scope:** React app (all 78 src files), heb-coupon-scraper (all 30 modules), all ~40 active n8n workflows (node/SQL level), MySQL `hsa` schema + data forensics, cross-layer contract check, and root-cause analysis of all 11 open `app_feedback` items.

**Method:** 17 parallel Fable 5 reviewers + adversarial verification. Every critical/high finding was independently re-checked against live code, live n8n workflow JSON, production executions, and the live database by a separate verifier agent instructed to refute it. **219 raw findings → 41 confirmed, 6 refuted, 172 unverified medium/low** (unverified = plausible on one read, not independently reproduced).

**Headline:** No data-loss criticals. But several user-facing features are **fully broken right now** (Deals "Add to list", re-checking unchecked staples, apostrophe items, coupon chips in In-Store), the coupon dataset is **97% expired because the scheduled scrape has been silently dead for 5 weeks**, and every one of your 11 open feedback items now has a named root cause.

---

## 0. Operational alert (do this before any code)

**The Thursday scheduled scrape has not run since 2026-06-05** (verified via `heb_scraping_history`; today is 07-11). Because expired-coupon maintenance (`markExpiredCoupons`) only runs inside a successful scrape, the live DB now has **674 of 693 "active" coupons past expiration**. Every consumer — Fetch HEB Coupons, Smart Deals, Deals screen, Home savings stat — is being fed ~97% dead coupons. `[77 · CONFIRMED]`

Also stale: **3 `prep_jobs` rows stuck in `status='running'` since 2026-04-11** (orchestrator has no failure path — see §2.14). `[173 · CONFIRMED]`

**Actions:** check `schtasks /query` for the scrape task and why it stopped; add `AND expiration_date >= CURDATE()` to reader queries as a defensive layer; move expiry maintenance into a daily n8n Schedule workflow; sweep stale prep_jobs in the existing daily cleanup workflow.

---

## 1. Top 10 — what I'd fix first

| # | Finding | Status | Effort |
|---|---------|--------|--------|
| 1 | Dead scheduled scrape → 97% expired coupon data (§0) | Ops | Small |
| 2 | Deals/SmartDeals "Add to list" 500s every time — INSERT into dropped `Category` column (§2.1) | CONFIRMED | Medium |
| 3 | Un-check → re-check silently lost; payload missing `weekStartDate` (§2.2) | CONFIRMED | **One line** |
| 4 | Apostrophe item names break check/uncheck/remove/one-off — "Bobo's Bars" is live in your catalog and can never be toggled (§2.3) | CONFIRMED | Medium |
| 5 | First item of a fresh week disappears — 1-row week hits the clean-slate branch (§2.4) | CONFIRMED | Small |
| 6 | Session-refresh trust chain: mtime-only "validity" + no-validation import → the entire clipping feedback cluster (#32/#35) (§2.5) | CONFIRMED | Medium |
| 7 | Smart Deals counts already-clipped coupons as available savings — FB#36 (§2.6) | CONFIRMED | Small |
| 8 | In-Store coupon chips silently dead since 4/19 — matching pipeline orphaned by the GroceryChecklist deletion (§2.7) | CONFIRMED | Decision |
| 9 | AI chat crashes on no-match input; user sees developer-jargon bubble — FB#11/#24 (§2.8) | CONFIRMED | Small |
| 10 | Production CSP has been silently blocking your fonts, dark-mode anti-flash script, and feedback screenshots since day one (§2.9) | CONFIRMED | Small |

---

## 2. Confirmed bugs — broken right now

All verified by an independent adversarial agent against live sources. Bracketed numbers are audit-finding IDs.

### 2.1 Deals "Add to list" is 100% broken `[197/59/103]`
`POST /api/heb/add-weekly-item` (clip-server, called by the Add button on **Deals** and **SmartDeals**) runs `INSERT INTO WeeklyGroceryList (..., Category, ...)`. The `Category` column was **dropped in WGL-Fix Phase 3**, and `category_id`/`week_start_date` are now NOT NULL with no defaults. Every insert → "Unknown column" → HTTP 500 → red Retry state. Only the already-on-list short-circuit works, masking it for repeat adds. Sibling route `/add-oneoff-item` (heb-cart-routes.js:1098) is identically broken but dead code.
**Fix:** rewrite the INSERT for the current schema (category name → `categories.id` lookup, parse `week_start_date`), or simpler — point the frontend at the working n8n `add_oneoff_item` webhook and delete both clip-server routes.

### 2.2 Re-checking an unchecked staple is silently lost `[199/15]`
The bug-#40 soft-delete fix requires the check payload to carry `weekStartDate` for the `Clear Skipped Flag` UPDATE — but `useWeekStaples.toggle` only sends it on *uncheck*. On check, the UPDATE renders `STR_TO_DATE('undefined')` = NULL → matches 0 rows → the INSERT's NOT-EXISTS sees the still-skipped row → nothing happens → workflow still returns `success:true`. Verified against production execution 23337. Every uncheck→recheck cycle reverts on reload. **This silently regressed the exact bug the 2-step path was built to fix.**
**Fix (1 line):** add `weekStartDate: weekData.startDate` to the check payload in [useWeekStaples.js:59-70](src/hooks/useWeekStaples.js#L59-L70).

### 2.3 Apostrophes break five workflows `[17/130]`
Selection Check/Uncheck, Add One-Off, Remove Weekly, and Pull Grocery Staples splice webhook values raw into SQL (`'{{ $json.body.itemName }}'`). Catalog item 69 **"Bobo's Bars - Lemon Poppyseed"** (IsActive=1, appears weekly) can never be checked, unchecked, or removed; any one-off like "Reese's" fails. Sibling workflows already use a `sqlEscape()` Code node — these five just never got it. Also the SQL-injection surface on unauthenticated endpoints.
**Fix:** add the same sqlEscape step (or switch nodes to query parameters) in all five workflows.

### 2.4 One-row week renders as a clean slate `[131/21]`
`Pull Grocery Staples` detects "existing data" via `items.length > 1` (because `alwaysOutputData` emits 1 empty item on 0 rows). A week with **exactly one** WGL row is misclassified as empty → clean-slate branch → no `IsSelected`/`DataSource` fields. So the first staple you check (or the first one-off you add) in a fresh week disappears on the next fetch. Self-heals at 2+ rows, which is why it's been invisible.
**Fix:** probe with `SELECT COUNT(*) AS cnt` and test `cnt > 0`.

### 2.5 The clipping cluster: session "validity" is a lie `[89/209/210]` — root cause of FB#32, FB#35
Three layers, all confirmed against `prep_jobs` rows:
- **FB#32/#35 incidents:** prep jobs on 4/12 and 4/14 recorded `session_result {"valid":false,"ageHours":38-41}` yet reported `status='completed'` / "Ready to Shop!" — the orchestrator didn't gate on session validity until the 4/18 fix. Those two feedback items are **already fixed by the gate**; close them.
- **Still live #1:** `/api/import-session` declares success if *any* heb.com cookie exists — an Incapsula visitor cookie from a logged-out profile passes. It also copies Chrome's profile while Chrome is running (cookies flush lazily → can import pre-login state).
- **Still live #2:** `/api/health` `sessionValid` is **file-mtime only** (`isSessionFileValid`), never checks auth. And the clipper only maps HTTP 401/403 to `SESSION_EXPIRED`; HEB often returns 200 + GraphQL error for logged-out persisted queries, which shows as a generic failure — plus the app discards per-coupon failure messages, so all you see is "0 clipped, 1 failed".
**Fix:** after import, require a real auth cookie (`sst`) or do a cheap authenticated GraphQL probe; use the same probe in `/api/health`; treat 200-with-auth-error as SESSION_EXPIRED; keep `data.message` in clipProgress and show it on failed rows.

### 2.6 Smart Deals counts clipped coupons as savings `[158]` — root cause of FB#36
The match SQL never excludes `clipped_status = 1`; the cache-path "Overlay Clipped Status" node only stamps a flag without recomputing totals; Deals.js and Home.js both sum savings without filtering clipped. So right after "Clipping Complete!", the same 12 coupons still show as available. (The old CouponMatchPanel screenshot in FB#36 has the same class of bug — but that panel is dead code now, see §2.7.)
**Fix:** add `AND c.clipped_status = 0` to the match SQL, filter `clippedStatus === 1` from headline sums in Deals/Home, and cache-bust `smart_deals_cache` on successful clip.

### 2.7 Coupon matching pipeline is orphaned — In-Store coupon chips dead since 4/19 `[157]`
The only caller of `/match_coupons` + `/save_coupon_matches` was GroceryChecklist.js, deleted 4/24 (`d8d378d`). Both n8n workflows are still ACTIVE with zero callers; `CouponMatchPanel.js` is never imported; `coupon_matches` last row is 2026-04-19 — so `weekly-items` coupon JOIN and InStoreMode's coupon chips quietly render nothing every week since.
**Decision needed:** re-wire matching into the ReviewScreen flow (FB#27 asks for exactly this — see §5.1), or deactivate the workflows and delete the dead surface.

### 2.8 AI chat crashes on no-match; jargon bubble shown to user `[144/215/216]` — FB#11, FB#24
The Blue Apron agent's prompt says "if no recipes match, *say* 'I couldn't find any…'" while its Structured Output Parser enum-locks `responseType` — conversational replies fail parsing, the workflow 500s (confirmed in executions 22674/22676), and ChatBot's 500 handler renders **"…your n8n webhook is working correctly. This might be a CORS or header issue."** as a bot message. Same latent conflict in Meal Creator Propose.
FB#24 (transient error, fine after refresh) is the same family: n8n's Postgres chat memory persists the exchange server-side regardless of whether the HTTP response reaches the browser, and `apiFetch` (a) caps at a hidden 30s while agent runs often exceed it, (b) **discards caller-supplied AbortControllers** (spreads `...fetchOptions` before setting its own `signal`), and (c) auto-retries POSTs.
**Fix:** make the prompt always emit `recipes: []` + apology in `message`; set the Agent node's On-Error to continue with a fallback; replace the jargon bubble; in apiFetch honor caller signals/timeout and stop retrying AI-agent POSTs.

### 2.9 Production CSP has been degrading the app since launch `[0]`
`netlify.toml`'s CSP blocks: (1) the inline dark-mode anti-flash script (`script-src 'self'`) — dark users get a white flash every load; (2) Google Fonts — **DM Sans and Fraunces have never loaded in production**; the whole app renders in fallback Georgia/system-ui; (3) `blob:`/`data:` images — feedback screenshot preview/resize is broken. Verified live via response headers.
**Fix:** add `https://fonts.googleapis.com` to style-src, `https://fonts.gstatic.com` to font-src, `blob: data:` to img-src, and hash or externalize the theme script.

### 2.10 Add Weekly Selection: double-click → 500; response contract dead `[142/143/42/217]` — FB#20, FB#39-adjacent
Plain `INSERT` collides with `uq_week_recipe` → second click 500s and shows "Failed to add" after "Added!". Also the workflow's `Get Updated List` node references `$json.body` *after* the INSERT (resolves to nothing) and its `alwaysOutputData` is misplaced inside `parameters.options`, so the documented response is never returned (confirmed in execution 23345) — the app only works because it refetches separately. ChatBot's '+' button still has no pending/disabled state (MealCreator's was fixed 4/11).
**Fix:** `INSERT IGNORE` (matching Ingredient Agent), fix the `$('Webhook')` reference, move `alwaysOutputData` to node level, add per-meal in-flight state to the '+' button.

### 2.11 MealCreator "Add to This Week's Meals" goes through the LLM — and it's a DB no-op `[45/214]` — FB#39
`addToThisWeek()` POSTs natural language to the **Blue Apron chat agent**, whose insert subgraph is *disconnected* (sticky note: "This was for a previous iteration") — the call writes nothing, burns an agent run, and pollutes creator chat memory. `refreshMeals()` + success toast fire on HTTP 200 *before* the real insert happens later via the Ingredient Agent chain — hence the bottom-bar meal count never updates.
**Fix:** POST to `ENDPOINTS.addWeeklySelection` with the known `recipeId` (copy ChatBot.addMealToList), and refresh after the ingredients chain completes.

### 2.12 Clip-server internals `[86/87/88/62/76]`
- **Pool leak:** `/api/health` calls `db.connect()` per request, orphaning a 5-connection pool each time; clip jobs `disconnect()` the shared pool under concurrent health checks. You already fought `ER_CON_COUNT_ERROR` once — the MySQL wait-timeout you added is the only thing keeping this self-healing. Fix: idempotent connect, connect once at startup.
- **False clip successes:** GraphQL path trusts any 200-with-no-errors without validating `result.data`; DOM path counts "verification pending" as clipped → `clipped_status=1` written for clips HEB may never have registered.
- **Page-swap crash:** blank-page recovery closes the active page but the caller keeps using it → `TargetClosedError` outside the per-coupon try → whole job dies.
- **SSE client is single-shot:** first transient drop closes the EventSource (server supports full replay!), then a retry hits 409 "job already running".
- **Weekly scrape clobbers clip state:** the upsert's `clipped_status = VALUES(clipped_status)` + anonymous scrape session resets every clipped coupon to 0. Fix: `GREATEST(clipped_status, VALUES(...))`.

### 2.13 In-Store Mode sync `[30/172]`
- The 4s live-sync poll (runs for **every** shopper, not just partner sessions) wholesale replaces checked state with the server snapshot; the only guard is 2s since last local tap, while apiFetch retries mean a POST can land 3-90s later on store Wi-Fi — failed/slow check-offs get silently reverted. Fix: merge with a pending-mutations set; gate the poll on an active partner session; queue failed POSTs for `online`.
- Shopping Progress GET returns HTTP 200 **empty body** for 0 checked items (misplaced `alwaysOutputData` — same pattern as §2.10) — and 0-checked is the *normal start-of-trip state*; the poll's `res.json()` throws. Verified live.

### 2.14 Prep Orchestrator has no failure path `[173]`
Only 1 of 6 HTTP steps has `onError: continue`. Any timeout/non-2xx after the webhook already responded strands the job at `status='running'` forever (the 3 stuck April rows) while the phone spinner polls indefinitely. Fix: onError branches → `UPDATE prep_jobs SET status='failed'`, plus a stale-job sweep in the daily cleanup.

### 2.15 Smaller confirmed items
- **HebCart Phase 2 never runs:** `sessionStatus === 'connected'` compares an object to a string — always false; live search for unmatched items silently skipped. Fix: `sessionStatus?.active`. `[60]`
- **`/matches/all` shadowed by `/matches/:groceryItemId`** (registered first) → returns the 260 `grocery_item_id=0` rows; saved matches never reload, every cart build redoes AI matching. Fix: move the route up. `[200/104]`
- **Every app-checked staple stored as `category_id=8`** (frontend never sends category; workflow defaults). UI is rescued by a COALESCE, but WGL category data is systematically wrong for direct consumers (clip-server weekly-items). Fix: send `category: item.Category` + one-time backfill. `[16]`
- **ChatBot "Clear All" only clears local state** — meals resurrect from DB on next refresh. Fix: loop removeWeeklySelection then refreshMeals. `[43]`
- **Chat-memory summary UPDATE interpolates user text into Postgres SQL** — any apostrophe ("what's easy this week?") errors the memory write and can fail the whole chat turn (branch-0 ordering). Fix: query parameters. `[146]`
- **Store-locations:** Phase 1 treats WAF blocks / expired sessions as `no_match` (sticky 90 days) — a WAF block mid-run poisons every remaining item `[115]`; offline-run `no_match` rows currently lock **132 items** out of live scraping until ~07-26 `[116]`; Phase 0 re-processes ~126 aisle-less items every run, burning most of the 30-min/day WAF budget before new work `[117]`.
- **MealCreator's mobile "Selected Meals" bottom-sheet is unreachable** (its only trigger is `hidden lg:flex`) — leftover from the FB#37 fix. Delete or re-trigger. `[218]`

---

## 3. Feedback triage — all 11 open items root-caused

| FB | Screen | Root cause | State |
|----|--------|-----------|-------|
| #41 | shop | Known: HEB store-aligned categories (active project, Phase 1 partial) | In progress |
| #39 | meals | §2.11 — add routes through LLM no-op; refresh fires before real insert | Fix planned |
| #37 | meals | Badge removed same-day (386d6ab). Residue: unreachable mobile meals sheet | **Close** (+ optional cleanup) |
| #36 | plan | §2.6 — Smart Deals/UI never exclude clipped coupons | Fix planned |
| #35 | deals | §2.5 — prep "succeeded" with 40.7h-dead session (pre-4/18 gate); failure reasons discarded | **Close** (gate fixed it) + harden |
| #32 | deals | §2.5 — same incident class, 38.3h-dead session, `prep_jobs` row confirms | **Close** (gate fixed it) + harden |
| #28 | plan | apiFetch 30s timeout aborted the 30-60s Match Coupons AI call, then *retried the abort twice* (3 AI runs). Flow since deleted; the abort-retry bug is still live in apiFetch | **Close** + fix apiFetch |
| #27 | plan | Coupon search exists on Deals; opt-in AI matching with ETA existed and was deleted with GroceryChecklist. All pieces exist unwired — see §5.1 | Easy-add |
| #24 | meals | §2.8 — chat persists server-side while the client 30s-timeout/500 shows a fake error bubble; refresh restores truth | Fix planned |
| #20 | meals | MealCreator fixed 4/11 (93a23cc); ChatBot '+' still has no pending state; backend needs INSERT IGNORE | Fix planned |
| #11 | meals | §2.8 — prompt/parser contradiction, confirmed in executions 22674/22676 | Fix planned |

---

## 4. Systemic themes (fix the class, not the instance)

1. **Raw SQL interpolation in n8n** — five grocery workflows, three coupon workflows, the Postgres chat-memory writer, and several shopping/feedback nodes all splice request/AI text into SQL. One apostrophe breaks them; on unauthenticated webhooks it's also injection. A one-day sweep converting to query parameters (or the existing `sqlEscape()` pattern) kills ~10 findings at once.
2. **`apiFetch` design flaws** — hidden 30s default timeout, auto-retry of POSTs (non-idempotent!), retrying its own timeout aborts, and discarding caller-supplied AbortControllers. Implicated in FB#24, FB#28, and the in-store revert race. One focused refactor.
3. **`alwaysOutputData` misplaced inside `parameters.options`** — does nothing there. Confirmed in Shopping Progress, Fetch App Feedback, Add Weekly Selection ("Get Updated List"), Remove Weekly Grocery Item. Grep all workflow JSON once and move it to node level.
4. **Dual week keying** — `WeekDateRange` display string vs `week_start_date` DATE, still mixed *within single workflows* (Selection Check uses three derivations). `weekly_selections` has no DATE column at all, and a wrong year-boundary label is already in production data. Long-term: key everything on `week_start_date`.
5. **Session "validity" = file mtime** — in auth.js, clip-server health, and session import. Nothing ever checks an actual auth cookie or makes an authenticated probe. Root of the whole clipping saga.
6. **Dead code with live wiring** — SessionManager (references 3 nonexistent ENDPOINTS keys), SmartDeals + CouponMatchPanel (unimported), 12 unused ENDPOINTS keys, 6 active n8n webhooks with no callers, 5 dead clip-server routes, and — worth fixing this week — an **orphaned subgraph inside the ACTIVE Blue Apron workflow containing an unfiltered `DELETE FROM weekly_selections`** `[155]`, plus the ACTIVE unauthenticated GET migration webhook `run-migration-cart-builder` `[183]`. Deactivate both.
7. **Auth (consolidated, personal-app-calibrated)** — the X-API-Key scheme is enforced on only ~15 legacy webhooks (and the key ships in the JS bundle anyway); all newer mutation webhooks and the entire clip-server (including remote browser launch) are open behind CORS that allows any `*.netlify.app` origin. Pragmatic hardening: enforce one header key on all n8n webhooks via config, tighten clip-server CORS to your exact origin, deactivate the migration webhook.

---

## 5. Easy-add features (highest value first)

1. **FB#27 — opt-in coupon matching on ReviewScreen** `[213]`: button → "Uses AI, ~30-60s" confirm → `matchCoupons` with `timeout:120000, retries:0` → render the already-built CouponMatchPanel → fire-and-forget save. Resurrects the orphaned pipeline (§2.7) and closes FB#27. Most parts already exist.
2. **"Hide clipped" filter + clipped count on Deals** `[74]` — pairs with the §2.6 fix.
3. **Wire the unused `recheck()` from useClipServerHealth into the banners/post-clip flow** `[75/63]` — one transient failure currently mislabels the server until navigation.
4. **Daily maintenance workflow**: expired-coupon sweep + stale prep_jobs reaper + old `smart_deals_cache` purge, folded into the existing Cleanup Expired Shopping Sessions cron `[185]`.
5. **Hoist Home's week-boundary watcher to App.js** `[14]` — fixes stale-week PWA sessions on every screen, not just Home.
6. **Voice check-off toast should name the item it checked** `[40]` — trust-building for findBestMatch.
7. **Return real state from Selection Check/Uncheck/Remove** instead of static `success:true` `[141]` — makes every silent-failure bug in this report loud.
8. **Week-scoped localStorage GC** `[12/132]` — keys accumulate forever.
9. **Order clip-server `/weekly-items` by `walk_order`** (categories already joined) `[114]`.
10. **In-app feedback list** — `fetchFeedback` endpoint already exists; a simple read view closes the loop on your own bug reports `[132]`.

---

## 6. Fragility watch-list (unverified but plausible — spot-check before big changes)

- **In-Store:** partner-join week mismatch (joiner's local weekDateRange + host's week_start_date) `[31/204]`; mic-permission stale closure `[32]`; findBestMatch false positives `[33]`; offline fallback discarded when progress fetch fails `[35]`.
- **Meals/AI:** retry buttons are stale-closure no-ops `[46]`; messages sent during history restore get wiped `[50]`; legacy regex re-parse duplicates suggestion cards `[51]`; Thursday-00:00 week flip mid-session splits chat/writes across weeks `[52/90]`; RecipeInstructions crashes on empty instructions `[49]`.
- **Coupons/cart:** UTC-midnight expiration parsing hides deals on their last valid day `[64/9]`; hardcoded GraphQL persisted-query hashes are single points of failure (clip + cart) `[90/107]`; browser-session races under running build jobs `[105 · CONFIRMED]`; cart adds can report success without verification `[109]`.
- **Scraper:** anonymous scrape overwrites the authenticated cookie file used by the clip-server `[79]`; login failure path saves an unauthenticated session as success `[80]`; no child-process timeout in scraper-runner `[81]`.
- **Schema:** collation split (16 tables unicode_ci vs 11 0900_ai_ci; four name-join pairs need COLLATE) `[189]`; redundant dual unique keys on WGL `[193]`; legacy `unique_item (ItemName, Category)` still on GroceryItems `[195]`; 124 legacy WGL rows with per-week sequential ItemIDs mislabeled as Staples `[186]`; un-skip resurrects items as already-checked (skip doesn't clear shopping_progress) `[190]`.
- **n8n patterns:** Cook-screen workflows dead-end on 0 rows (no alwaysOutputData) `[148]`; Ingredient Agent `IN ()` syntax error on empty selection `[149]`; Save to DB has no transaction/duplicate guard `[151]`; Save Coupon Matches error route wired to nowhere `[160]` and its ON DUPLICATE KEY is a no-op (no unique key) `[161]`.

## 7. Refuted (dropped after adversarial verification)

Six reviewer claims did not survive independent verification and are excluded above: SessionManager "fully broken" (it's unreachable dead code — downgraded, §4.6), heb_product_matches `grocery_item_id=0` as corruption (intentional namespace for frequent products — though the shadowed route `[200]` that *serves* them is real), ItemID-1000 ingredient collapse, Chat History zero-row dead-end, meal-count dual-source staleness, and post-clip 1-hour-cache staleness (superseded by the §2.6 mechanism).

## 8. Coverage + gaps

Read end-to-end: all app `src/` files incl. tests, all scraper `src/` files + Dockerfile.clip, all ~40 active workflow JSONs, schema + data checks on all 33 tables/views, live-verified against production Netlify headers, n8n executions, and the `hsa` DB (read-only).
**Not audited:** `C:\hsa-automation\docker-compose.yaml` + cloudflared configs (outside approved working directories this session), the Kasm/prep-agent host setup (one agent read `prep-agent/server.js` for FB#32 only), and the n8n instance/host OS configuration itself. Raw per-agent results: session workflow `wf_5e96c65d-808`.
