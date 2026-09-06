# Handoff: hardening sub-project G (accessibility pass)

Paste everything below the line into a fresh Claude Code session opened in `C:\New Grocery App\grocery-checklist-app`.

---

## Goal for this session

Execute hardening sub-project G, the accessibility pass. The brainstorm, spec and plan are done and approved; the session paused right before execution. Start with `superpowers:subagent-driven-development` on `docs/superpowers/plans/2026-09-06-accessibility-pass.md` (sonnet implementers, opus task reviewers and whole-branch review, ledger under `.superpowers/sdd/2026-09-06-accessibility-pass/`, one-line mirrors in `.superpowers/sdd/progress.md` as `[a11y] Task N: …`). Then verify (Jest → hermetic Playwright in the foreground → live once), fast-forward `main` (Netlify deploys), tick checklist G, update memory, and present the remaining backlog (D → C → F, plus the deferred lists in the checklist).

## Where things stand (end of 2026-09-06)

- `main` is at `3eeb3fd` (spec `2d1ec65` + plan `3eeb3fd`, both committed on `main`; no code for G exists yet). Live bundle `main.9a7ac9c4.js` (sub-project E). Sub-projects A, B, E are shipped; read `docs/superpowers/hardening-checklist.md` (A/B/E ticked with shipped-state paragraphs; E has an unticked Slack follow-up because `SLACK_WEBHOOK_URL` is empty in `C:\hsa-automation\.env`).
- Spec: `docs/superpowers/specs/2026-09-06-accessibility-pass-design.md` (five Decisions: hand-rolled `useDialog`, menu keyboard contract, seven 44 px targets, scoped `@axe-core/playwright` 4.13.0, Escape closes the feedback panel unconditionally). Plan: six tasks with full code; Jest expected 259 → 278, hermetic e2e 78 → 90.
- Gates: `npm run lint` → `CI=true npx react-scripts test --watchAll=false` (36 suites / 259 tests, zero `act()` warnings) → `npm run test:e2e` (78, foreground, ~3 min) → `npm run test:e2e:live` (4; the telemetry sentinel row is permanent). CI on push via `.github/workflows/ci.yml`.
- Memory file `hardening_program.md` has the rules (n8n curl headers, wave tool commands, subagent gotchas: implementers must run Playwright in the foreground; one implementer at a time; reviewers get the brief, the report and a review-package diff, never the whole plan).

## Rules (verbatim from the E session)

- Commits end with a blank line then `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; stage by explicit path; never stage the untracked `*.png/*.json/*.yml` scratch files in the repo root.
- Confirm with the user before anything irreversible or outward-facing (pushing `main`, Slack posts, restarting n8n). G touches no backend.
- Playwright MCP may be locked; headless checks via `require('C:/New Grocery App/heb-coupon-scraper/node_modules/playwright')` with `executablePath 'C:/Users/Corey/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'`.
- Post-deploy check for G: load `#plan` and `#shop` on the live bundle headlessly, expect zero `client_errors` requests and zero page errors; `SELECT COUNT(*) FROM client_errors` stays 1 (the sentinel).

## Backlog after G

D decompose the four 1,300+ line components into hooks → C HEB session lifecycle (needs `SLACK_WEBHOOK_URL` for its alerts) → F scrape-time data quality. Deferred lists live in the checklist sections A, B and E.
