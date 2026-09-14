# D component decomposition release report

D shipped on 2026-09-14. The strictly behavior-preserving implementation `2b6c59f9b3d24f53afe4816eb8e5244361813253` was fast-forwarded into main after all task and whole-branch reviews approved it. Netlify serves `main.2a187bdc.js`; deployed Plan/Shop checks passed with zero page errors and zero telemetry requests. Final lint, Jest, hermetic Playwright and the single live suite all passed.

The user approved the prepared release sequence on September14. Feature and source-main CI passed, and Netlify metadata confirms the exact released commit. This documentation commit records the shipped checklist/report; its CI result is retained in the local release ledger and memory after the push.

Authority: [approved design](../specs/2026-09-10-component-decomposition-design.md), implementation base `e3b7ce90f31ecdaba6032b959df750c970c138dc`. The [hardening checklist](../hardening-checklist.md) retains all deferred work. Local task briefs, reports, review packages, raw verification logs and final evidence remain in `.superpowers/sdd/2026-09-10-component-decomposition/`.

## Problem and implementation

Large screen files made fixes and reviews expensive. D separates views, hooks and transport adapters while preserving established routing, state ownership, effects, request behavior, DOM and accessibility boundaries. App gains routing/weekly-meal hooks; Shop separates views, helpers, voice, progress and presence responsibilities; Cart separates panels, session handling and build/SSE behavior; Cook separates views and timer behavior; Planner and Creator share transport machinery through screen-specific adapters. Screen-owned domain/history/phase/build/save behavior remains screen-owned.

| Facade | Before lines | After lines |
| --- | ---: | ---: |
| App.js | 467 | 314 |
| InStoreMode.js | 1,974 | 665 |
| HebCart.js | 1,446 | 760 |
| RecipeInstructions.js | 1,427 | 727 |
| ChatBot.js | 1,329 | 954 |
| MealCreator.js | 1,187 | 1,086 |

Task 10 removes unreachable `SmartDeals.js` and verifies legacy routing. **Coupons remains routed and retained. SessionManager was already removed in A.** Static production ES-module imports/re-exports contain no cycles before or after (58 → 85 modules). Dynamic imports/`require` were not evaluated. No package/lock, API infrastructure, backend workflow, Playwright configuration or CI changes were found by the controller audit.

## Evidence and its limits

The isolated checkout baseline passed lint, **38 suites / 282 Jest tests with zero act warnings**, and **102/102 foreground hermetic browser tests**. Dependency installation did not change dependency files.

Original-production characterization preceded extraction: App 3/31; Shop progress 3/17; Cart panels/session 3/23; Cart build nine new cases in four original-source groups; Cook 2/15 including fourteen new cases; Planner 2/22 after R11; Creator 1/15. Final rewritten Cart assertions were replayed against the original facade, then the committed facade restored byte-for-byte. Task 10 original and post-change routing both passed 26/26. These results establish observed original behavior; they are distinct from subsequent task gates.

Every task's final required lint exited 0 and final Jest run had zero act warnings. Full task-local Jest counts progressed through 39/296, 41/311, 43/324, 44/333, 45/347, 46/365 and **47/380**; Tasks 9–10 ended at 47/380. Targeted foreground browser gates included routing/accessibility 46, Shop/accessibility 26, Cart/accessibility 6 and Cook/accessibility 28. These do **not** replace final root gates. Exact moved-body/declaration/prop comparisons supplement runtime evidence. Task 7's independent reviewer reconstructed JSX/props but did not rerun runtime gates.

Task 1 review corrected invalid-history setup and asserted unchanged history length for join replacement. Task 9 corrected a report-only ID-evidence overclaim. Task 4 assertions do not independently prove natural toast expiry or absence of a post-unmount setter; preserved source supports those boundaries. Task 6's footer count includes items without URLs; panel eligibility requires URLs, and the test does not independently assert its total.

## Controller corrections R1–R11

These resolve plan/test/import defects without authorizing behavior changes.

- **R1:** Passing characterization on original production replaces manufactured RED for this extraction.
- **R2:** Retain App's `document.querySelector('main')` scroll lookup; no original main ref exists.
- **R3:** App/Shop hooks return memoized effect callbacks; screens register them at original positions with unchanged dependencies and cleanup order.
- **R4:** Cart matching retains captured `sessionStatus.active`; only build verifies through `ensureSession`.
- **R5:** Gates precede explicit-path commits; review packages cover recorded base through actual head, including new files. Fixes receive additional commits.
- **R6:** Canonical Task 8/9 briefs supply complete adapter appendices.
- **R7:** `git rm` stages SmartDeals deletion; only the routing test is added afterward.
- **R8:** StepIndicator imports Check only; ChevronRight belongs to SearchModal. The unused historical-plan import caused the first Task 5 browser build to stop; correction and rerun passed.
- **R9:** Task 5/8 parameterized assertions use unconditional assertions with selected expected outcomes, and final assertions must pass original source.
- **R10:** Test-only lint fixes use a named-role Cook jump query, documented DOM access for unnamed timer controls and shared typing dots, and explicit awaited microtasks. Production markup/global lint rules stay unchanged.
- **R11:** Shared chat characterization uses keyDown for Enter/Shift+Enter because original screens bind onKeyDown. The proposed keyPress missed the callback; Task 8's initial original transport result was 17/18. Only events changed; expectations/production handlers remained, and original-source gates then passed. Task 9 reused the correction.

The committed historical plan retains R8–R10 import/test-lint errata; canonical briefs and controller evidence govern those narrow corrections. Static preflight parsed 43 complete examples and linted five corrected proposed test snippets; this is not runtime evidence. Optional direct Task 10 e2e lint found three existing diagnostics on unchanged Playwright calls; required src lint passed and neither new route case was flagged.

## Preserved behavior and follow-ups

App retains route whitelisting, join/history replacement, storage/cache/cancellation and effect order. Shop retains one checked/pending/token/timestamp/toast owner, initial hydration replacement versus poll overlay, both poll guards, visibility retry timing, and presence refresh without list reload. Invite creates on mount and persists host state on Copy, including clipboard failure behavior.

Cart retains snapshot-before-verification, strict SSE index comparison, arrival order, complete/HTTP/disconnect distinctions and transport-error recovery. A late build-start response after unmount can create a stream after cleanup already ran. The characterization observes this existing leak and disposes its fake; a separate request/stream lifetime fix remains deferred.

Cook retains running-state interval cadence, paused restoration without elapsed-time subtraction, Back resetting only running timers, and navigation-specific auto-advance cancellation. Chat adapters preserve distinct parsing, IDs/timestamps/logging, captured values, payloads, retry/AbortError wording and cleanup order; the shared send hook adds no effect, lock, retry or cancellation.

Existing intentional error-path logs, unrelated Deals key warnings, Browserslist notices and original-source Creator duplicate-key warnings from fixed-clock Date.now-only IDs remain narrowly attributed observations. New ESLint/act warnings or behavior changes remain defects.

## Review, verification and release

| Gate or action | Evidence / status |
| --- | --- |
| Independent task and whole-branch reviews | All Approved; no outstanding findings or final fix wave |
| Final lint | PASS, zero ESLint warnings |
| Final Jest | PASS, 47 suites / 380 tests, zero act warnings, 49.926 seconds |
| Final foreground hermetic Playwright | PASS, 106/106, first attempt, no retries, 2.5 minutes |
| Existing live suite, once | PASS, 4/4, no retries or skips, 43.3 seconds |
| Telemetry and test residue | Before: total1/sentinel1/residue0. After suite: total1/sentinel1/residue1. After prescribed cleanup: total1/sentinel1/residue0 |
| User release approval | Approved 2026-09-14; branch/main/deployment/completion-doc sequence |
| Feature/main CI and main push | [Feature CI](https://github.com/musicrocks0304/grocery-checklist-app/actions/runs/34863179902) and [Main CI](https://github.com/musicrocks0304/grocery-checklist-app/actions/runs/34863550980) passed; main fast-forward/push completed |
| Netlify commit/bundle and deployed Plan/Shop checks | Ready deployment `6aa815153d1005000813156c`, exact source `2b6c59f`, bundle `main.2a187bdc.js`; both routes zero page errors/telemetry requests |
| Shipped checklist/report | Completed in this documentation commit; final completion-doc CI recorded in retained ledger/memory |

The final gates ran sequentially against the reviewed source. Compared with the original baseline, D adds 98 Jest tests and four browser cases (two legacy routes in two viewports). The browser audits print the existing scoped serious color-contrast deferrals; passing this gate does not mean zero serious contrast findings. Existing Browserslist/environment notices and documented baseline logs remain.

The live Feedback test opened/closed without submission; Plan added/removed its named test item and verified reload; Shop checked an item, verified persistence, and restored it through the endpoint; telemetry verified the permanent sentinel idempotently and rejected an empty report. All passed. The one new `__e2e_live__` catalog row was removed under the suite's documented cleanup convention; no telemetry row was deleted. No live Cart build or AI generation was performed.

The previous deployment (`45bcd4d`, `main.546b58f5.js`) was replaced by ready Netlify deployment `6aa815153d1005000813156c`, published 2026-09-14T15:39:34.449Z. The Netlify API associates it with exact source `2b6c59f9b3d24f53afe4816eb8e5244361813253`; headless Plan/Shop both served `main.2a187bdc.js`. Post-deployment SQL remained total1/sentinel1/residue0. No additional live suite was run.

## Remaining program and deferred families

The agreed sequence remains **A → B → E → G → D → C → F**. After D, **C then F** each require a spec and plan. [Checklist](../hardening-checklist.md)

- **C:** Shared HEB expiry/sign-in state, health maintenance/alerts, phone re-login choice and store #794 binding. **F:** Scrape-time entity decoding, category/aisle reconciliation with feedback #41, and NULL category-ID backfill.
- **A:** Zero-row/empty-200 and double-response contracts, unguarded post-response branches, Postgres fault coverage, zero-row lookup 503s, client error presentation and hook/test cleanup.
- **B:** Deals undefined ID, historical Cook/SSE browser-coverage extras, greeting-coupled routing, popup interception, App flake and development StrictMode duplicate POST concern. D characterization does not automatically close B's original extras.
- **E:** Empty Slack webhook configuration and fresh-delivery verification; historical-hash silence remains a follow-up decision. Stored rows/`notified=1` do not prove Slack delivery. Earlier benign teardown rows were already removed; this draft authorizes no blanket telemetry deletion.
- **G:** Existing light-theme contrast exceptions remain. Historical live evidence is 3 passes/1 initial-navigation timeout plus a separate passing read-only diagnostic, not 4/4.
- **General:** Cross-source item-ID integrity; workflow final/error results; Deals loading/retry/search/deduplication; Cart/partner/invite/desktop-order details; retained one-off data and real-trip validation; rate limiting/auth; alert reach/identity; telemetry escaping, validation, concurrency, time consistency, duplicate reports and pagination.
- **D:** Late Cart stream lifetime and the characterization limits above.

Every deferred item remains in the [complete hardening checklist](../hardening-checklist.md). The local `backlog-snapshot.md` preserves source references and historical evidence limits.
