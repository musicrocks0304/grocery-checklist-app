# e2e tests

Playwright specs for the grocery-checklist-app. Three projects
(`playwright.config.js`):
- `mobile` / `desktop` — hermetic, mocked backend, run by `npm run test:e2e`.
- `live` — real n8n + clip backend, run by `npm run test:e2e:live` (needs
  `REACT_APP_API_KEY` in repo-root `.env`; specs under `e2e/live/`).

## Scripts
- `npm run test:e2e` — mobile + desktop against `e2e/fixtures/**` via
  `e2e/support/mock-backend.js`. A request with no fixture or mutation body
  fails the test (404, recorded `unmocked`) — an unhandled endpoint cannot
  slip through silently.
- `npm run test:e2e:live` — real backend, no mocking.
- `npm run test:e2e:record` — re-records `e2e/fixtures/n8n/*.json` and
  `e2e/fixtures/clip/weekly-items.json` from the live backend, GET-only,
  never a mutation. Sanitises (drops `screenshots`/`metadata`/`user_agent`/
  `host_user_id`, caps arrays at 40) and rewrites live dates/labels to the
  fixed fixture week.
- `npm run test:e2e:report` — opens the last HTML report.

## Fixed week / frozen clock
Hermetic tests freeze the clock at `WEEK.frozenClock` (`e2e/support/week.js`)
inside the fixed week `2026-09-06`–`2026-09-12` so the Thursday-rollover
week logic always resolves the same way. `page.clock.install()` fakes
`setTimeout`/`setInterval`/`Date`/`requestAnimationFrame` and does **not**
auto-advance, so no interval-driven behaviour (HebCart's 30s poll,
InStoreMode's drain poll, toast auto-dismiss, session-expiry countdowns) will
ever fire on its own in this suite. If a spec needs one of those to run, call
`page.clock.fastForward(ms)` explicitly rather than waiting — waiting for a
frozen timer will simply time out.

## When to re-record
When a workflow's response shape changes. Not for date drift — the recorder
rewrites live dates itself.

## Hand-maintained (recorder does not touch)
`e2e/fixtures/n8n/smart_deals.json`, `e2e/fixtures/clip/health.*.json`,
`e2e/fixtures/clip/session-status.*.json`.

## Live specs (`e2e/live/`)
Real n8n + clip backend, real API key, real data for the current week — no
mocking. `npm run test:e2e:live` is the **only** way the live project runs —
`--project` must be `=live` (not a separate ` live` argument, which
Playwright would otherwise swallow as a second, non-existent project) and a
bare `npx playwright test` never collects it: `playwright.config.js` derives
the entire project set from the same flag that selects the live webServer,
so the hermetic and live suites can never be collected together. Run:
```
npm run test:e2e:live
```
or a single spec:
```
npx playwright test --project=live e2e/live/plan.live.spec.js
npx playwright test --project=live e2e/live/shop.live.spec.js
npx playwright test --project=live e2e/live/feedback.live.spec.js
```
Requires `REACT_APP_API_KEY` (and optionally `REACT_APP_API_BASE_URL`,
`REACT_APP_CLIP_SERVER_URL`) in repo-root `.env`; `e2e/support/live-env.js`
refuses to run without a key. Three specs, serial, minimal mutations:
- **Plan** — adds one-off item `__e2e_live__`, confirms it renders, removes
  it via the UI, confirms it's gone after reload. The UI removal only takes
  it off this week's list — the `oneoff_items` catalog row survives, so SQL
  cleanup is required (see below).
- **Shop** — picks a selected-but-unchecked item for the real current week
  (derived from the app's own `shopping_progress` request, never computed
  locally), checks it off in the UI, confirms the count drops and persists
  across reload, then restores state by POSTing
  `shopping_progress_uncheck` directly (via `X-API-Key` + the Netlify
  `Origin`) in a separate restore step that cannot mask the original
  failure, so the mutation is undone even if an assertion fails. Skips if
  nothing is left to check this week, or if every selected item is already
  checked.
- **Feedback** — opens `#plan` (not `#home`, see below), opens and closes
  the panel from the header/sidebar trigger. Never clicks "Submit
  Feedback" — this suite must never create a real feedback row.

No live spec ever visits Deals or Home: both fire a Smart Deals request
on mount (Home does it in the background as part of its own dashboard
fetch, Deals as its primary content), and with a stale cache that triggers
a real LLM run.

## Live-project residue
```
DELETE FROM oneoff_items WHERE name='__e2e_live__';
docker exec -it <mysql-container> mysql -u root -p hsa -e "DELETE FROM oneoff_items WHERE name='__e2e_live__';"
```
