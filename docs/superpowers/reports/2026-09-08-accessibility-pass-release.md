# Accessibility pass release (2026-09-08)

G shipped dialog focus management, keyboard-operated Shop menus and check-offs, disclosure semantics, and the seven 44px control variants. Implementation `0df4c77` was fast-forwarded into main after independent task reviews, whole-branch review, its scoped final test review, and feature CI passed. Netlify serves `main.546b58f5.js`. No backend changes were made.

## Verification and release decision

- Lint: zero warnings. Jest: 38 suites / 282 tests, zero React act warnings. Hermetic Playwright: 102/102 across mobile and desktop, run in the foreground.
- [Feature CI run 34229374168](https://github.com/musicrocks0304/grocery-checklist-app/actions/runs/34229374168) passed all gates on the implementation commit.
- The live suite ran exactly once: Plan, Shop, and telemetry passed; Feedback timed out in its initial page.goto waiting for load before dialog assertions. A separate read-only Feedback open/close diagnostic passed in 2.210s (load 485ms), with zero page errors, failed requests, submissions, or telemetry. The initial timeout's cause remains unconfirmed; this is not a claim of 4/4 suite passes.
- Exact tagged test-data cleanup completed: oneoff_items name __e2e_live__ count 0. The permanent client_errors sentinel was preserved.
- Post-deploy Chromium loads of #plan and #shop both served the new bundle and produced zero client_errors requests and zero page errors. Shop's new menu attributes were present. SQL client_errors count remained 1, the sentinel only.
- All scoped axe rules execute and print. Existing serious color-contrast findings are deferred under the explicit no-color-change scope; every other serious/critical finding blocks and none were reported. The checklist retains the measured contrast ratios and live-navigation follow-up.
- The user explicitly approved release with both documented limitations on 2026-09-08. No Slack post or n8n restart was performed.

The full local execution evidence is retained under `.superpowers/sdd/2026-09-06-accessibility-pass/`, with one-line task mirrors in `.superpowers/sdd/progress.md`. The following is the release-date backlog snapshot; the living checklist is `docs/superpowers/hardening-checklist.md`.

## Rulings, in chronological order

1. Keep the Task 1 unmount fallback connected outside the hook owner and cover StrictMode; the planned fixture removed its own focus target. Cost if wrong: fixture rework.
2. Move the Task 2 feedback suite to `installMockFetch`/`restoreFetch` and prove preserved client identity and capture state with observable evidence; global test constraints supersede stale mock examples and UUID-shape assertions. Cost if wrong: extra test maintenance.
3. Do not put `aria-hidden` on the Invite backdrop ancestor because it wraps the dialog; preserve the layout and update menu-role consumers. Cost if wrong: the decorative backdrop may need to become a separate sibling.
4. Use deterministic readiness and meaningful re-entry assertions in Task 5, and scope the open-menu Shop axe audit to the Shop screen wrapper. Cost if wrong: a broader audit may expose existing serious violations that need small in-scope fixes.
5. Count the seven target variants as both Cook controls, Plan All and Clear, Cart disclosure, Invite close, and Feedback close; do not add an unrelated widget. Cost if wrong: the documentation count needs clarification.
6. Move the worktree outside `.superpowers` because Jest 27 on Windows treats the preceding separator as a glob escape. Cost if wrong: worktree relocation only.
7. Offset the Feedback close button's 40→44px height with matching negative vertical margin so the flex header remains 72px content / 73px including its border. Cost if wrong: browser spacing needs adjustment.
8. Drive `useDialog.open` from Framer Motion presence state in Invite so focus returns in the layout phase when exit begins. Cost if wrong: presence lifecycle integration needs rework; the AnimatePresence regression guards it.
9. Give Shop menuitems `tabIndex=-1` and use programmatic arrow focus so native Tab bypasses the exiting menu subtree. Cost if wrong: keyboard traversal needs adjustment; the closing regression guards it.
10. Preserve the approved palette, report all contrast findings, and block every other serious/critical axe finding; the spec excludes color changes. Cost if wrong: contrast must be fixed or gated in a later pass.
11. Use `-my-2.5` plus top alignment on the Cart disclosure; browser measurements show this preserves the original 24px row while retaining the 44px target. Cost if wrong: local spacing needs adjustment.
12. Do not repeat the full live suite or its mutations after the Feedback timeout during initial navigation; retain that failed run and use the passing read-only Feedback diagnostic as additional evidence. Cost if wrong: a transient live-load problem remains unverified and may require a separately authorized run.

## Remaining backlog

### D — Decompose large components

- Extract routing and weekly-meal hooks from `App.js`, using `resolveScreenFromHash` in the popstate state branch.
- Split shopping progress, partner session, and major Shop UI pieces out of `InStoreMode.js`.
- Split clip-session, cart-build, and panel logic out of `HebCart.js`.
- Separate Recipe selection and cooking modes; extract the timer hook.
- Share the ChatBot/MealCreator transport and retry/text-parsing behavior.
- Confirm `SmartDeals.js` and `Coupons.js` are unrouted before deletion; `SessionManager.js` was already removed under A.

### C — HEB session lifecycle

The alert path requires `SLACK_WEBHOOK_URL`, which remains unset in `C:/hsa-automation/.env`.

- Monitor clip-server authentication daily; alert via Slack and expose a `heb_session_expired` flag.
- Use one shared sign-in-needed state in Cart and Deals.
- Choose and wire a phone-friendly re-login path.
- Surface the required store #794 session binding.

### F — Scrape-time data quality

- Decode HTML entities in scraped frequent-product and coupon names.
- Reconcile grocery categories with aisle/store-location data, including feedback #41, before closing it.
- Backfill null `GroceryItems.category_id` values.

### A — Webhook and client follow-ups

- Fix `smart_deals` zero-row flow termination and bounded SELECT double-response races.
- Guard or report post-response and archive branches in recipe/chat workflows; include Postgres `chat_history` in fault coverage.
- Make zero-row lookup guards distinguish absence from infrastructure failure.
- Replace raw client `err.message` rendering with `userMessage()`, remove the dead `useCategories` shim, and tighten the real-backoff test.

### B — Test-infrastructure follow-ups

- Cover the Deals `deal.id` add failure, Cook timer fast-forward, and Cart-build SSE.
- Decouple the `#meals` route assertion from greeting copy and contain popup windows in hermetic tests.
- Investigate the CPU-load `App.test.js` flake and StrictMode double-POST behavior on the development server.

### E — Telemetry follow-ups

- Fill `SLACK_WEBHOOK_URL`, restart the local automation service, verify with a new throwaway telemetry row, and choose whether to delete pre-fill history or accept silent old hashes.
- Retain the first real #shop teardown telemetry evidence; those rows were already deleted during Task 8.
- Improve alerting and payload handling: re-alert key choice, client-message escaping, validation order, throttle atomicity, time-zone consistency, duplicate rejection reporting, trigger-payload fallback, and pagination.
- Cover failures that occur after a response or end as empty 200s, including scraper-originated failures.

### G — Accessibility deferrals

- Fix the documented light-theme contrast failures in Feedback, Shop, Invite, and Cart, then remove the axe exception.
- Investigate the unconfirmed live Feedback initial-navigation timeout if it recurs or a new run is authorized.

### General deferred findings

- Fix `WeeklyGroceryList.ItemID` collisions across `DataSource`; until then, avoid `INSERT IGNORE`/ODKU on that table.
- Mark failed `grocery_prep` jobs final on the error path and return an error contract when `categorize_heb_product` cannot parse model output.
- Fix Deals loading-toolbar flash, in-flight Retry state, decoded-name search, and consider fuzzy duplicate matching.
- Correct Cart connection copy, make `PartnerBadge.role` explicit, and confirm Plan desktop column order with the user.
- Decide whether to document or sweep retained `oneoff_items` name rows.
- Keep feedback #41 open until Christian validates the store layout on a real trip.
- Add Cloudflare rate limiting for the named mutation endpoints and, later, per-device authentication.
- Consider creating Invite sessions only when Copy link is used.
