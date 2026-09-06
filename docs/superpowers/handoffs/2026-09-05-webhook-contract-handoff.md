# Handoff: hardening sub-project A (webhook exposure + response contract)

Paste everything below the line into a fresh Claude Code session opened in `C:\New Grocery App\grocery-checklist-app`.

---

## Goal for this session

Ship hardening sub-project A end to end: turn the approved spec at `docs/superpowers/specs/2026-09-05-webhook-contract-design.md` into an implementation plan, execute it with subagents, verify adversarially, deploy, and update memory. Done means: contract test green against the live n8n after all three waves, app deployed with `apiJson`, both outside callers sending the key, feedback idempotency live, memory and `.superpowers/sdd/progress.md` updated. Then present the remaining backlog (B–G below) and ask which to design next.

No timed loop is needed; the work is gated on my plan review and on sequential n8n rollout waves. Use the progress ledger so a compaction or restart can resume.

## Where things stand (2026-09-05)

- Earlier today: a full UI/button review logged 15 bugs (app_feedback ids 42–56); all were fixed via a 9-task subagent-driven plan, merged to main and verified live (memory: `ui_review_2026_09_05.md`). Design canvas of proposals: https://claude.ai/code/artifact/86fd3ef4-e5b1-48ad-a1ec-774aa7190725
- Then we brainstormed the hardening program and decomposed it into sub-projects. I chose A first, with: key on every webhook, JSON guaranteed but payload shapes kept, server-side dedupe only where genuinely needed, hybrid mechanism.
- The spec was adversarially reviewed by a subagent against n8n 1.121.3 source and the live workflows; it overturned several assumptions (n8n already returns 500 JSON on unhandled errors; the empty-200 comes from error swallowers and dead-end branches; four "idempotency" endpoints were already collision-tolerant; retries would triple AI cost; a naive contract test would launch scrapes and write to the bug list). The spec was rewritten accordingly and committed (`e6cee89`, on `main`, not yet pushed). Read it first; it is the source of truth, including a "Current state" section of verified facts and a "Deferred findings" section.
- I have not yet given final spec approval in the new session. Start by asking me to confirm the spec (or accept my "go"), then invoke `superpowers:writing-plans`, then `superpowers:subagent-driven-development`.

## Do first

1. Read `docs/superpowers/specs/2026-09-05-webhook-contract-design.md` and `.superpowers/sdd/progress.md` (ledger from today's fix run; append to it).
2. Confirm spec approval with me, then write the plan to `docs/superpowers/plans/2026-09-05-webhook-contract.md` (writing-plans skill). Split roughly: app `apiJson` + retries + migration (2–3 tasks), feedback `client_id` (app + n8n migration workflow), outside callers, contract test script, step-zero fault injection, n8n wave 1, wave 2, wave 3.
3. Execute with subagent-driven-development: fresh implementer per task, reviewer per task, whole-branch adversarial review at the end, one fix wave, re-review. Work on a branch; fast-forward into `main` to deploy (Netlify auto-deploys `main`).
4. Verify with Playwright against a local build (`BROWSER=none PORT=3000 CI=true npx react-scripts start`) and then live, using today's checks for Plan, Deals, Shop, Feedback.

## Working rules and gotchas

- MySQL MCP is read-only. Writes and migrations: `docker exec -e MYSQL_PWD=<DB_PASSWORD from heb-coupon-scraper/.env> hsa-mysql mysql -u hsa_user hsa -e "..."`, or an n8n workflow. Never leave test rows behind; today's cleanups used exactly this.
- n8n: REST API at `http://localhost:5679/api/v1`, key `N8N_API_KEY` in `C:\hsa-automation\.env` (`source /c/hsa-automation/.env`). The `n8n_update_partial_workflow` MCP tool fails on this version; use `n8n_update_full_workflow` or REST PUT with `settings` filtered to known keys. After editing a webhook workflow, deactivate then activate so the webhook re-registers; a de-registered webhook returns 404 (no Origin) or 500 text/html (with Origin). Webhook nodes must keep their `webhookId`.
- n8n MySQL node: node-level `alwaysOutputData` only; 0-row stops sometimes need a UNION ALL sentinel; `$json` after INSERT is result metadata; no `affectedRows` unless `detailedOutput`.
- Never call `submit_feedback`, `grocery_prep`, `transcribe_grocery_item`, `smart_deals`, `smart_match_grocery`, `match_coupons`, `meal_creator_*`, `call_grocery_agent`, `create_grocery_list`, or `deactivate_grocery_item` with a valid body from tests. The contract test tiers in the spec define what is allowed.
- App API key: `REACT_APP_API_KEY` in the app `.env` (gitignored) and in Netlify build env. Curls to n8n webhooks need `-H "X-API-Key: <that value>"` once auth is on.
- Tests: `CI=true npx react-scripts test --watchAll=false` (currently 26 suites / 189 tests). ESLint gate: `npx eslint src --max-warnings=0` has 4 pre-existing problems in test files; add none. Production check: `CI=true npx react-scripts build`.
- Playwright MCP: `window.confirm` dialogs are auto-accepted and `page.on('dialog')` inside `browser_run_code` does not fire; `setTimeout` is undefined there (use `page.waitForTimeout`); scope text locators to `main` on mobile because the hidden desktop sidebar duplicates labels; navigate via `about:blank` then `#route` to force a real load.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Do not stage the untracked `*.png/*.json/*.yml` files in the repo root.

## Tools available and what each is for

- **Superpowers skills**: `brainstorming` (done for A), `writing-plans` (next), `subagent-driven-development` (execution; scripts `task-brief`, `review-package`, ledger), `systematic-debugging`, `verification-before-completion`, `requesting-code-review`.
- **Agent tool** (`general-purpose`, models `opus` for judgment/review, `sonnet` for mechanical tasks): use one implementer at a time, reviewers can run in the background in parallel.
- **Playwright MCP** (`mcp__plugin_playwright_playwright__*`): `browser_run_code_unsafe` for scripted checks, `browser_navigate/snapshot/click/handle_dialog` for interactive steps, screenshots to the scratchpad and `Read` them.
- **MySQL MCP** (`mcp__mysql__mysql_query`): read-only queries against `hsa`.
- **n8n MCP** (`mcp__n8n-mcp__*`): `n8n_get_workflow`, `n8n_update_full_workflow`, `n8n_list_executions`, `n8n_get_execution` (with data) for verifying error branches; REST via curl for bulk edits.
- **Sequential thinking MCP**: use for planning and for drafting the adversarial review prompts.
- **Artifact tool + `design` skill**: the existing canvas can be updated via its URL if UI changes are proposed.
- **Docker CLI**: containers `hsa-mysql`, `hsa-processor` (n8n), `heb-clip-server`, `heb-cloudflared`. Fault injection is `docker pause hsa-mysql` / `docker unpause hsa-mysql`.
- **git / gh**: repo `musicrocks0304/grocery-checklist-app`; GitHub MCP failed to connect today, use `gh` CLI or git.
- Also configured but not needed for A: context7 (library docs), Notion, Gmail, QuickBooks, Netlify connector (deploy status if needed), firecrawl, vercel skills.

## Backlog after A (agreed order)

B test infrastructure (checked-in Playwright e2e + component tests for Deals/InStoreMode/HebCart/ChatBot + ESLint test debt) → E client error telemetry → G accessibility pass → D decompose the four 1,300+ line components into hooks → C HEB session lifecycle (expiry alert, phone re-login) → F scrape-time data quality (entities, category/aisle). Plus the deferred finding from A: `WeeklyGroceryList.ItemID` collides across `DataSource` (21 IDs); needs the unique key to include `DataSource` before any INSERT IGNORE on that table.
