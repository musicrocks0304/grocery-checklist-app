# Hardening D: component decomposition design

Approved by the user on 2026-09-10. Baseline: `main` at `45bcd4d`. Scope: section D of `docs/superpowers/hardening-checklist.md`. The user selected a behavior-preserving refactor. Deployment requires the program's separate release approval.

## Purpose and approach

Separate responsibilities in App, Shop, Cart, Cook, ChatBot, and MealCreator so a future change can be understood and reviewed in the relevant module. Success is clear ownership and unchanged observable behavior, rather than a maximum line count.

Three approaches were considered:

| Approach | Benefit | Tradeoff |
| --- | --- | --- |
| Extract one area at a time, including its views and named hooks (recommended) | Each area reaches a reviewable stopping point with focused preservation tests | Stateful boundaries require characterization before they move |
| Move all existing views first, then extract hooks in a second pass | The first pass is mostly mechanical | Each screen needs two review passes before its state ownership is settled |
| Establish shared controllers first, then migrate screens | Common interfaces are defined early | Requires more interface decisions before the different screen contracts are exercised |

Use the first approach on one isolated branch, with sequential tasks and a single release after verification. Existing behavior, including quirks discovered during extraction, is the baseline. Record suspected defects separately with evidence; do not repair them in D.

## Architecture and ownership

| Area | Extract | Retain in the current owner |
| --- | --- | --- |
| App | `useHashRoute` for current screen, navigation, join handling, URL normalization and history listeners; `useWeeklyMeals` for App's cached selected meals, load, setter and refresh | Provider tree, screen composition, main scroll behavior, unsaved-change ref, storage initialization and week-rollover lifecycle |
| Shop | `useShoppingProgress` for checks, initial progress hydration, pending operations, retry/poll reconciliation, local persistence and undo toast; `usePartnerSession` for joined/host session lookup and refresh; existing voice hook and pure helpers into dedicated modules; existing views into `components/instore/` | Grocery-list resolution, category ordering/collapse, coupons, wake lock, elapsed time, completion/summary and voice-to-item wiring |
| Cart | `useClipSession` for status, poll, connect/disconnect/recheck and ensure-session; `useCartBuild` for build request, progress, summary and EventSource; existing panels/cards/search modal into `components/cart/` | Current step, weekly groceries, matches, two-phase matching, review mutations and totals |
| Cook | Recipe selection and cooking views into `components/cook/`; `useCookingTimer` for countdown state, interval and start/pause/cancel operations | Recipe loading, selected recipe/step, completion, saved cooking state, navigation, wake lock and the timer hook's screen lifetime |
| ChatBot / MealCreator | `useChatTransport` for send/retry mechanics, with separate planner and creator payload/response/error adapters | Each screen's session/history loading, messages and UI state, domain actions, and Creator build/save phases |

Hooks are called unconditionally from their current screen owner. Opening a panel, changing a cart step, or entering cooking mode must not start a new screen session or dispose of an existing one. Conditional views retain their current local state lifetimes. Chat hooks remain inside each chat screen; they are not lifted into the parent Meals tabs.

Implementation detail established during planning: when grouping effects into a hook would reorder them relative to effects that stay in the screen, the hook returns named memoized effect callbacks and the screen registers them at the original positions. The hook owns the state and effect body; registration order and equivalent dependencies remain explicit in the screen.

Move existing declarations with their DOM, props, keys, memoization and animation boundaries intact. Keep named exports used by current tests available from the original Shop and Cart modules as compatibility re-exports. Extracted modules must not import their original facade back and form cycles.

### App data flow

App retains the unsaved-change ref and gives the route hook access to it. The hook returns the current screen, navigation and join status/recovery values used by the existing renderer. Preserve push versus replace, confirmation text, scroll reset, join request/storage payload, cancellation and manual-join reload behavior. Source clarification during planning: the existing scroll operation uses `document.querySelector('main')`, rather than an App-owned main ref; retain that lookup.

Reuse `resolveScreenFromHash` in the history-state branch only after the existing screen whitelist validation. A malformed history state such as `'#plan'` must continue to fall back to home. Preserve storage initialization and week-rollover setup before the meal-load effect, and meal loading before the join/route effects.

`useWeeklyMeals` retains cached initialization, empty-result cache removal, stale-cache retention on failure and the existing setter/refresh contract. It is distinct from the existing `useWeekMeals`, which loads Plan's ingredients through a different endpoint and error model. Keep both.

### Shop data flow

The screen supplies its resolved shopping list and partner status to progress coordination. The progress hook owns one checked Set and one pending-operation map, shared by initial hydration, toggle, retry and partner poll. Tap, undo and voice continue through the same toggle operation. The hook returns checked state and the existing undo-toast state/actions for rendering.

Preserve string item IDs, operation tokens, cache `savedAt` matching, optimistic updates and side-effect ordering, the visible-tab 10-second retry tick, partner-only 4-second poll, 2-second local-mutation guard, pending-operation overlay and current cleanup. Initial hydration retains its existing replacement behavior; it must not silently adopt poll reconciliation. Existing state-updater side effects remain in their current sequence.

Session helpers retain storage keys, expiry parsing and joined-over-host precedence. The session hook refreshes on the same Invite-close event as today. Invite continues to create on its own mount, persist the host session only after Copy, and close after its existing delay. Opening or cancelling Invite must not establish a host session. List resolution still reads the joined session at its current time and preserves the host week and cache rules. Refreshing partner presence must enable polling without triggering a grocery-list reload; retain the list effect's existing dependency on `inStoreData`.

### Cart data flow

HebCart retains step ownership and provides a stable, explicit step-transition callback to the session/build hooks. Parent-owned auto-advance stays in place, and `checkSession` still returns status to ConnectionPanel as well as updating state. HebCart gives build the current groceries, matches and `ensureSession`; build returns progress, summary and its start action. Keep the existing snapshot timing: eligible items are captured before awaiting session verification.

The status poll and EventSource cleanup retain the whole screen's lifetime. ConnectionPanel keeps its own disclosure/rechecking state; SearchModal keeps query/results/focus state on its conditional mount. Matching and review algorithms remain in HebCart in this pass. Their calls into session verification must preserve current behavior.

Preserve the differences between non-OK and thrown status requests, synthetic status after reconnect, and disconnect HTTP versus network failure. Failed session verification returns to connect; a failed build-start request returns to review. Build progress replaces entries by strict index while retaining arrival order. Server error events keep the build step; five consecutive transport errors return to review; an open event resets that counter. Complete, malformed events and unmount retain their current distinct outcomes.

### Cook data flow

RecipeInstructions calls the timer hook above its conditional views. Views receive the state and actions they already render; moving a view must not remount the timer or change recipe fetch timing. Saved-state persistence stays with the parent and reads/writes the timer through explicit values and actions.

Preserve interval-based countdown and cadence, originating-step navigation, paused restoration without subtracting elapsed time, the current duration parser, replacement confirmation, completion toast and cleanup. Navigation and Back retain their current reset differences, including paused timer state that currently survives returning to selection. Do not introduce deadline timers, new persistence fields, or new recipe selection behavior. Preserve the existing auto-advance cancellation distinctions and recipe fallback versus network-error UI.

### Chat transport boundary

Share only the send/retry lifecycle: choose trimmed text from a string override or current input, append the user bubble, clear input, show/remove typing, build and remember the payload, make the request and apply the screen adapter's outcome. Keep raw `apiFetch`, 120-second message timeout and zero automatic retries. Manual retry creates another user bubble and payload timestamp, using the current screen's remembered payload convention. Do not introduce a send lock or concurrency guard.

Planner and Creator retain separate named adapters because their contracts differ. Planner's HTTP 500 produces its existing non-retryable fallback; Creator's remains retryable. Planner's array/body wrappers, structured cards, literal-string and legacy text fallbacks differ from Creator's array-or-object and JSON-string proposal parsing. IDs, timestamps, debug messages and domain updates must also retain their screen-specific behavior.

History loading stays screen-owned, including its current parser, timeout, error handling and mount behavior. Do not unify history formats, add cancellation, or normalize response schemas. Planner meal operations and grocery generation, and Creator proposal-to-build-to-save/add-week actions, remain separate from transport.

## Reachability and compatibility

Delete `SmartDeals.js` after a final import/reference audit; preserve the `#smart-deals` redirect to Deals. Keep `Coupons.js`, which App still renders at `#coupons`. `SessionManager.js` is already absent. Do not remove other deferred helpers or change legacy routes as incidental cleanup.

Preserve all G accessibility behavior: menu keyboard/focus contract, dialog focus trap and return during exit animations, labels/relationships, Escape behavior, 44-pixel targets and measured surrounding layout. Provider and motion ownership stay unchanged. No new dependencies, backend changes, UI redesign, mass formatting or incidental bug fixes belong to this pass.

## Verification and acceptance

Add focused characterization tests before each stateful extraction and run them against the baseline implementation. Verify user-visible state, payloads, request ordering and cleanup, using endpoint-level fetch mocks, controlled clocks and an EventSource fake where appropriate. Tests should protect the moved contract rather than assert the new hook's internal arrangement.

Priority coverage:

- App: join success/failure/cancellation, unsaved-navigation accept/cancel, history validation, weekly cache/empty/error/refresh behavior and week-rollover deferral.
- Shop: superseded operations and reversed acknowledgments, failed retry, poll guards/overlay, initial hydration/cache behavior, undo and Invite copy-to-session transition. Retain current voice, routing and G tests.
- Cart: session request outcomes and lifecycle; build item snapshot, progress replacement, completion, server error versus repeated transport error and cleanup. Exercise matching's session integration without expanding D into a match-algorithm rewrite.
- Cook: timer start/pause/replace/finish, step navigation, saved paused restoration and selection/cooking lifetime; current recipe fallback and auto-advance behavior across the view split.
- Chat: override/event input, payload/session fields, no automatic retries, manual retries, typing cleanup, the distinct 500 behaviors and planner/creator response parsing. Retain history and Creator phase behavior at the transport boundary.

Mechanical view moves reuse existing tests; add browser coverage only where focus, motion, layout or an uncovered complete flow requires a real browser. No arbitrary test-count target. The shipped starting gate is 38 Jest suites / 282 tests and 102 hermetic Playwright tests, subject to unchanged-baseline confirmation.

Execute lint, full Jest, hermetic Playwright in the foreground, then the live suite once at the release gate. Keep new characterization hermetic and do not use live AI calls or real cart builds. Diagnose failures by evidence; the G live navigation timeout and contrast deferral are existing follow-ups, not automatic waivers for new failures.

Use sequential implementation tasks with Sol implementers and Astra task/whole-branch reviewers, carrying forward the established SDD ledger and explicit-path commit rules. Reviewers receive the task brief, report and review diff. Finish with a whole-branch review and relevant verification. Present the tested result before requesting D's push/deploy approval. After approved deployment, perform the program's read-only live/telemetry checks, update checklist D and memory, and present C then F plus deferred findings.

## Approval

The user approved the recommended per-area extraction, the ownership boundaries above and the preservation/verification contract on 2026-09-10. This document records that approved design. The next artifact is the detailed implementation plan; D source changes have not begun.
