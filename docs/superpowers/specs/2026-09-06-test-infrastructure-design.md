# Test infrastructure — design

Date: 2026-09-06. Sub-project B of the hardening program. Scope: a checked-in Playwright end-to-end suite (hermetic by default, small live smoke set), component tests for the four untested screens, the ESLint and `act()` debt in existing tests, and a GitHub Actions workflow.

## Goals

1. Every user flow the 2026-09-05 review exercised by hand is a checked-in Playwright spec that runs in under five minutes on a laptop and in CI, against the local app with the network fully mocked, in a mobile and a desktop viewport.
2. A three-spec live smoke suite proves the deployed backend still serves those flows, on demand, with zero test residue.
3. `Deals`, `InStoreMode` (menu, invite, partner badge, check-off), `HebCart` and `ChatBot` have component tests covering their primary flow and their error path.
4. `npx eslint src --max-warnings=0` and `CI=true npx react-scripts test --watchAll=false` are clean gates: no pre-existing problems, no `act()` warnings.
5. A GitHub Actions workflow runs lint, unit tests and the hermetic e2e suite on every push and pull request without secrets. Netlify deployment is unchanged.

## Non-goals

- Blocking Netlify deploys on CI (a red run is a signal; gating is a later decision).
- Visual regression or screenshot comparison.
- Testing the n8n workflows themselves (that is `scripts/webhook-contract.mjs`).
- Moving components into new directories (sub-project D); this sub-project only adds named exports where a component must be reachable by a test.
- Firefox/WebKit; Chromium only.

## Current state (2026-09-06)

- 27 Jest suites / 213 tests via `react-scripts test` (Jest 27, jsdom 16, Testing Library). No Playwright in the app repo; the scraper repo has Playwright with Chromium builds under `C:\Users\Corey\AppData\Local\ms-playwright` (`chromium-1234`).
- No CI. Netlify builds `main` with `npm run build`; ESLint warnings fail the build but tests are not run and `react-scripts build` does not lint test files.
- `npx eslint src --max-warnings=0` has four problems, all in tests: `App.test.js:48` (`testing-library/no-node-access`), `staples/ItemRow.test.js:30` (`no-container`, `no-node-access`), `hooks/useWeekStaples.test.js:1` (unused `React`).
- Two `act()` warnings come from `App.js` mount-time fetches (`setMealsLoading` after the test finished) when `App.test.js` renders without awaiting the meals load.
- `FeedbackPanel.test.js` carries a dead `html2canvas` mock (the panel mocks `../utils/screenshot` instead).
- `InStoreMode.js` exports `findBestMatch`, `useHoldToTalk`, `formatAisleBadge` and the default component; `ModeMenu`, `InviteModal`, `PartnerBadge` are internal. `HebCart.js` exports `ConnectionPanel` and the default. `ChatBot.js` exports only the default.
- The app reads `REACT_APP_API_BASE_URL`, `REACT_APP_CLIP_SERVER_URL` and `REACT_APP_API_KEY` at build time (`src/config/api.js`). All n8n calls go through `apiJson`/`apiFetch` and carry `X-API-Key`; clip-server calls use raw `fetch` (no key) except `hebWeeklyItems` via `apiJson`.
- Week logic (`src/utils/weekDates.js`) derives the week from the local date; Thursday and later roll to next week. Display string: `For the week of <Month> <Nth> to <Month> <Nth>, <year>`.
- Established gotchas from sub-project A: tests must mock `global.fetch`, never `apiFetch` (module-internal reference); a Shop check-off persists a `shopping_progress` row; Deals `add_oneoff_item` leaves an `oneoff_items` name row that only SQL removes; opening Invite inserts a `shopping_sessions` row; loading Deals with a cache older than one hour runs the Smart Deals LLM.

## Design

### 1. Playwright harness

- Dependency: `@playwright/test` (devDependency, pinned). Browser: Chromium via `npx playwright install chromium`.
- `playwright.config.js` (repo root): `testDir: 'e2e'`, `fullyParallel: true`, `retries: process.env.CI ? 1 : 0`, `reporter: [['list'], ['html', { open: 'never' }]]`, `use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' }`.
- `webServer`: `command: 'npx react-scripts start'`, `port: 3000`, `reuseExistingServer: !process.env.CI`, `timeout: 180000`, `env: { BROWSER: 'none', CI: 'true', PORT: '3000', REACT_APP_API_BASE_URL: 'http://n8n.test/webhook', REACT_APP_CLIP_SERVER_URL: 'http://clip.test', REACT_APP_API_KEY: 'e2e-key' }`. The hosts `n8n.test` and `clip.test` never resolve, so an unmocked request fails fast and can never reach real data. The live project overrides all three with values from `.env`.
- Projects: `mobile` (`viewport 390×844`, `isMobile: true`, `hasTouch: true`), `desktop` (`viewport 1280×800`), both with `testIgnore: 'live/**'`; `live` (`testMatch: 'live/**'`, mobile viewport). The default run is `mobile` + `desktop`; `live` runs only with `--project live`.
- Scripts in `package.json`: `lint` = `eslint src --max-warnings=0`; `test:e2e` = `playwright test --project mobile --project desktop`; `test:e2e:live` = `playwright test --project live`; `test:e2e:record` = `node e2e/support/record-fixtures.mjs`; `test:e2e:report` = `playwright show-report`.

### 2. Mock backend fixture

`e2e/support/test.js` exports `test` and `expect` from `@playwright/test` extended with a `backend` fixture (`e2e/support/mock-backend.js`):

- Installs `page.route('**/n8n.test/**')` and `page.route('**/clip.test/**')` before navigation.
- Resolves a request by method + path: n8n paths map to `e2e/fixtures/n8n/<path>.json` for reads; mutations answer built-in bodies (`add_oneoff_item` → `{success:true,itemId:<counter>,message:'…'}`, `selection_check`/`selection_uncheck`/`shopping_progress_check`/`shopping_progress_uncheck`/`remove_weekly_item` → `{success:true}`, `create_session` → `{code:'E2E1',week_start_date:<fixed week>,expires_at:<+4h>}`, `submit_feedback` → `{success:true}`, `add_weekly_selection`/`remove_weekly_selection` → the meals fixture). Clip-server paths map to `e2e/fixtures/clip/<name>.json` with two named states, `expired` (default: `api/health` `sessionAuthenticated:false`, `api/heb/session/status` `active:false, loginSessionValid:false`) and `healthy`.
- Asserts every n8n request carries `X-API-Key: e2e-key`; a missing key fails the test with the path in the message.
- API: `backend.calls(path)` → array of `{method, body, query}`; `backend.set(path, {status, body})` → override the next responses for that path (e.g. `500 {success:false,error:'Workflow error'}` or `{status:200, body:''}` for the empty-200 case); `backend.clip('healthy')` → switch clip-server state; `backend.reset()`.
- Unmatched routes under the two hosts are fulfilled with `404 {error:'unmocked <method> <path>'}` and recorded; the fixture's teardown fails the test if any unmocked call happened, so new endpoints cannot slip in unnoticed.
- The browser clock is frozen per test with `page.clock.install({ time: '<fixed Wednesday inside the fixture week> 10:00' })` so `getWeekDates()` matches the fixture week string exactly. The fixed week and its display string are exported from `e2e/support/week.js` and used by the recorder to rewrite recorded week strings.

### 3. Fixtures and the recorder

- `e2e/support/record-fixtures.mjs` (Node 22, no dependencies): reads `REACT_APP_API_KEY` and `REACT_APP_API_BASE_URL` from `.env`, calls each read endpoint once with the current week's parameters (`categories`, `fetch_grocery_items`, `fetch_weekly_meals`, `fetch_weekly_meal_ingredients`, `shopping_progress`, `fetch_heb_coupons`, `choose_recipe_instructions`, `grab_instructions_fast` for the first weekly recipe if any, `chat_history` with a throwaway session id, `grocery_prep_status` with a bogus id, `fetch_feedback?status=__e2e__`), and the clip-server `api/health`, `api/heb/session/status`, `api/heb/weekly-items`.
- Sanitising: drop `screenshots`, `metadata`, `user_agent`, `host_user_id`; replace every occurrence of the current week display string and `week_start_date` with the fixed week values; cap arrays at 40 items; for `fetch_feedback` write `[]`.
- `smart_deals` is not recorded live (it can run the LLM); its fixture is written by hand once from a real response shape (`[{deals:[…], totalDeals, totalSavings}]` with two deals, one clipped) and kept under `e2e/fixtures/n8n/smart_deals.json`.
- Every fixture file carries a top-level `_recorded` object (`at`, `endpoint`, `sanitised: true`) that the mock backend strips before answering. `e2e/README.md` documents when to re-record (a workflow's response shape changes) and that the recorder only sends read requests plus `{items: []}`-style safe bodies — never a mutating body.

### 4. Hermetic specs (each runs in `mobile` and `desktop` unless marked)

- `routing.spec.js`: each of `#home #plan #meals #deals #cart #shop #cook` renders its heading; `#grocery` → `#plan`; `#nonsense` → home; setting `location.hash` in an open tab switches screens; `history.back()` returns to the previous screen; the desktop sidebar and mobile bottom navigation both reach every screen (viewport-specific assertions).
- `plan.spec.js`: staples render grouped by category from the fixture; toggling a staple posts `selection_check` with `itemId, itemName, category, weekDateRange, weekStartDate`; with `backend.set('selection_check', {status:500, body:{success:false,error:'Workflow error'}})` the checkbox rolls back and a toast shows "Workflow error"; quick-add `__e2e__` posts `add_oneoff_item` and the item appears under One-offs; remove posts `remove_weekly_item` (confirm dialog accepted via `page.on('dialog')`); with `backend.set('add_oneoff_item', {status:200, body:''})` the toast says "The server sent an empty response" and no item appears.
- `deals.spec.js`: coupons and deals render (counts from the fixture); the expired banner is visible by default and absent after `backend.clip('healthy')`; "Add to list" posts `add_oneoff_item` once and shows "Added"; with a `500` it shows the error state and a retry re-posts.
- `shop.spec.js`: items render grouped by aisle in walk order; tapping an item posts `shopping_progress_check` and the remaining count drops; a `500` marks the pending op failed and the next successful post clears it; ⋯ menu → Feedback opens the panel; Invite posts `create_session` exactly once and shows `E2E1`; the voice button is present (no recording).
- `cart.spec.js`: default state shows "HEB sign-in needed"; "Check again" re-requests `api/health`/`session/status`; with `backend.clip('healthy')` the stepper shows step 1 as Connect.
- `feedback.spec.js`: opens from the mobile header icon (mobile), the sidebar footer link (desktop), and the Shop menu; pick a category, type, submit → one `submit_feedback` with a v4 `client_id`; with a `500` the panel stays open and a second submit reuses the `client_id`; after success the panel closes and a reopen mints a new id.
- `cook.spec.js`: with `fetch_weekly_meals` overridden to `[]` the empty state shows "No meals planned yet"; with the fixture the recipe list renders and selecting one requests `grab_instructions_fast`.
- Selectors: roles and accessible names first (`getByRole('button', { name })`), `getByPlaceholder` for inputs, text scoped to `main` on mobile (the hidden desktop sidebar duplicates labels). No CSS selectors on Tailwind classes.

### 5. Live smoke suite (`e2e/live/`)

- The `live` project in `playwright.config.js` reads `.env` (`REACT_APP_API_KEY`, `REACT_APP_API_BASE_URL`, `REACT_APP_CLIP_SERVER_URL`) and starts the app with those; it refuses to run when the key is missing. Serial, one worker, no retries.
- `plan.live.spec.js`: quick-add `__e2e_live__` → visible → remove → gone after reload; asserts the real `add_oneoff_item` body has `itemId`.
- `shop.live.spec.js`: check the first unchecked item → reload → still checked → uncheck by calling `shopping_progress_uncheck` through Playwright's `request` with the real key and the item's `ItemID` (a second tap does not uncheck in the UI) → reload → unchecked.
- `feedback.live.spec.js`: opens and closes the panel from the header; never submits.
- Teardown prints the cleanup lines for the rows the app cannot delete (`DELETE FROM oneoff_items WHERE name='__e2e_live__';` and, if the invite test is ever added, the `shopping_sessions` line) and `e2e/README.md` shows the `docker exec` command.

### 6. Component tests

- Shared helper `src/test-utils/mockFetch.js`: `installMockFetch(map)` sets `global.fetch` to a jest.fn that resolves by URL path (and optional method) with `{ok, status, text(), json()}` built from a plain object or a `{status, body}` entry; records calls; `restoreFetch()` in `afterEach`. Every new test uses it; never `jest.mock` of `apiFetch`.
- `src/components/Deals.test.js`: renders coupons and smart deals from mocked `fetch_heb_coupons`/`smart_deals`; "Add to list" → `add_oneoff_item` called once, state "Added"; `500` → error state; expired banner follows the `api/health` payload.
- `InStoreMode.js` gains named exports `ModeMenu`, `InviteModal`, `PartnerBadge` (no code moves). `src/components/InStoreMode.ModeMenu.test.js` (menu opens, items visible, Feedback item calls the provided handler), `InStoreMode.InviteModal.test.js` (one `create_session` POST on open, code rendered, copy button), `InStoreMode.PartnerBadge.test.js` (role labels). `InStoreMode.checkoff.test.js` renders the default component with a two-item list and asserts the optimistic toggle, the `shopping_progress_check` body, and the failed-op marker on a `500`.
- `src/components/HebCart.test.js`: expired → "Check again" → healthy stepper; the smart-match loop continues after one batch returns `500` (asserts the second batch is still requested); confirm/reject post to the clip-server match endpoints.
- `src/components/ChatBot.test.js`: mount loads `chat_history` and treats an empty body as no history; "new chat" clears messages; add-meal success toast and failure toast text via `userMessage`.
- Depth rule: one primary flow and one error path per screen; assertions on rendered text, roles and recorded requests; no snapshots.

### 7. Lint, warnings and existing tests

- Fix the four ESLint problems: `App.test.js:48` → query the sidebar with `within(screen.getByRole('navigation'))`/roles; `ItemRow.test.js:30` → `getByRole('checkbox')`/`getByLabelText`; `useWeekStaples.test.js:1` → drop the import. Add `"lint": "eslint src --max-warnings=0"` and run it in CI.
- `App.test.js`: await the meals load (`await screen.findByText(...)` or `await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('fetch_weekly_meals'), …))`) in the tests that currently finish before the mount fetches settle, removing the two `act()` warnings without `jest.spyOn(console, 'error')`.
- `FeedbackPanel.test.js`: delete the `html2canvas` mock; add entry-point tests for the Sidebar footer link and the Shop `ModeMenu` item (both call `openFeedback`).

### 8. CI

`.github/workflows/ci.yml`: triggers `push` and `pull_request`; `ubuntu-latest`, `actions/setup-node@v4` with Node 22 and npm cache; `npm ci`; `npm run lint`; `CI=true npm test -- --watchAll=false`; `npx playwright install --with-deps chromium`; `npm run test:e2e`; on failure `actions/upload-artifact@v4` with `playwright-report/` and `test-results/`. Concurrency group per ref cancels superseded runs. No secrets, no live project. Netlify is untouched.

### 9. Verification and done

- Local: `npm run lint` clean; `CI=true npm test -- --watchAll=false` all green with no `act()` output; `npm run test:e2e` green in both projects; `npm run test:e2e:live` green once with the printed cleanup executed and zero residue.
- CI: the first push of the branch shows a green workflow; the merge to `main` shows green again.
- Checklist B items ticked; memory notes the commands and the fixture re-record rule.

## Risks

- `react-scripts start` is slow to boot in CI (60–120 s); the `webServer` timeout is 180 s and the workflow caches `node_modules` via npm cache. If the boot proves flaky, switch the CI e2e to serve `build/` with `npx serve -s build -l 3000` (env vars baked at build time) — the spec allows either as long as the env values are the mock hosts.
- Frozen clock plus fixtures pinned to a fixed week means the fixtures never age; the recorder must rewrite week strings consistently or the app filters everything out. The recorder asserts the rewritten string appears in `fetch_grocery_items` before writing.
- `page.route` does not intercept `EventSource` (SSE) — the clip flows in Deals/Cart that use SSE are not exercised beyond their initial POST; that is acceptable for B.
- Exporting `ModeMenu`/`InviteModal`/`PartnerBadge` widens `InStoreMode.js`'s public surface slightly ahead of sub-project D, which will move them; no behaviour change.
