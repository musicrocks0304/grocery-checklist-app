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
week logic always resolves the same way.

## When to re-record
When a workflow's response shape changes. Not for date drift — the recorder
rewrites live dates itself.

## Hand-maintained (recorder does not touch)
`e2e/fixtures/n8n/smart_deals.json`, `e2e/fixtures/clip/health.*.json`,
`e2e/fixtures/clip/session-status.*.json`.

## Live-project residue
```
DELETE FROM oneoff_items WHERE name='__e2e_live__';
docker exec -it <mysql-container> mysql -u root -p hsa -e "DELETE FROM oneoff_items WHERE name='__e2e_live__';"
```
