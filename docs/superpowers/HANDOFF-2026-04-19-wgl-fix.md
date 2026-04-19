# HANDOFF — WGL Architectural Fix Execution

**Created:** 2026-04-19 (end of brainstorming + planning session)
**Read this FIRST in your new Claude Code chat.**

---

## What this is

A single document the new Claude Code session should read to inherit all execution context. Once read, the new session can begin executing the plan without re-doing any of the analysis from the prior session.

## TL;DR

Execute the plan at [docs/superpowers/plans/2026-04-19-wgl-architectural-fix.md](plans/2026-04-19-wgl-architectural-fix.md) using the **`superpowers:executing-plans`** skill in **inline mode** (not subagent-driven — the work is heavily stateful with sequential migrations, and the prior session burned 45% of context on analysis; a fresh session has the budget for inline execution).

**Goal:** Fix duplicate-aisle and premature-shopping-done bugs at the architectural root by introducing FK-enforced canonical categories, stable per-week ItemIDs, cascade semantics across `WeeklyGroceryList` → `shopping_progress`, and the elimination of the DELETE+INSERT churn pattern.

## Current state

### Branch
- **Working branch:** `feature/staples-redesign`
- The user prefers all changes go on this branch (do NOT create a new feature branch).
- Last 3 commits are the plan/spec docs (37ecc9c, 10a2ff1, 53b4f74).

### Unstaged work (DO NOT TOUCH)
The working tree has unstaged changes that are NOT part of this plan:
- 11 modified `src/` files containing the user's in-flight staples-redesign work AND two unrelated bug fixes from earlier today (FAB removal in MealCreator.js, quantity-color fix in RecipeIngredients.js — for app feedback bug #37 and #38).
- 13 untracked screenshots (`*.png`) at repo root — development artifacts.
- 3 untracked test/component files in `src/components/staples/` — staples-redesign in flight.

**Important:** Use `git add <specific-file>` for every commit. Never `git add -A` or `git add .` — you'll bundle in unrelated work.

### Dev server
- Running at `http://localhost:3000` (started in prior session, may still be running).
- If not running: `cd "c:/New Grocery App/grocery-checklist-app" && npm start &`
- Use it for Phase 2's Playwright-based browser verification (Task 2.14).

### Database state
- MySQL on `localhost:3307`, schema `hsa`.
- Connection credentials: `source /c/hsa-automation/.env` (look for `MYSQL_USER`/`MYSQL_PASSWORD`).
- n8n MySQL credential id: `lqIXlvVVqfE4v7DF`.
- **No schema changes have been applied yet.** Phase 1 Task 1.3 is the first migration.

### Tests
- Last known state: 78/78 passing (verified earlier today after the bug-fix work).
- `cd "c:/New Grocery App/grocery-checklist-app" && CI=true npx react-scripts test --watchAll=false`

## Critical context to inherit (verified data shapes)

The prior session verified these against live DB and live workflows. **Trust them — don't re-verify unless something suggests they've changed.**

### WGL data state (as of 2026-04-19)
- 800 rows total across many weeks
- 19 distinct `Category` values (5 dirty: "Pantry", "Produce", "Dairy", "Seasoning", "General"; rest canonical)
- Current week (2026-04-19): 47 items in WGL, 13 distinct categories (8 of which are duplicates from the dirty mapping)
- ItemID range: 14-344 (GroceryItems master) + 1000-1040 (MealIngredients) + 0 (OneOff)
- 2 OneOff items share ItemID=0 this week ("cornbbread", "Garlic bread")
- 1 stranded WGL row uses short-form WeekDateRange ("April 19th to April 25th, 2026" instead of "For the week of...")
- WeekDateRange parses cleanly via `STR_TO_DATE` for every existing row (verified)

### Orphan accumulation (ALREADY EXISTS — to be cleaned in Phase 2)
- shopping_progress: 33 orphans across 5 weeks (78% on week 2026-03-09)
- WGL meal-ingredient orphans: 19 rows (DataSource='MealIngredients' with no matching meal selection)
- coupon_matches.grocery_list_id: 39 of 39 already orphaned (OUT OF SCOPE — pre-existing, no user-facing bug)

### n8n workflows touched by this plan (all IDs verified)
- `JoaR6klT950hwSLB` — Pull Grocery Staples (read endpoint /fetch_grocery_items)
- `o0FnsnU6DaU9CqKD` — Create Grocery List (bulk staples writer)
- `ONzUncTlldVW6qJ1` — Add One-Off Grocery Item
- `DIOBZkmtBz543RLN` — Selection Check (per-item Plan toggle)
- `IgQIsJCu5RZ9TYKJ` — Selection Uncheck (per-item Plan toggle)
- `HMe8bs6E93s0a1QN` — Remove Weekly Grocery Item
- `8m4k9rB5p0Z9zdaz` — Remove Weekly Selection (meal removal)
- `CkLhcFEM9Tfc5uxO` — Create Grocery List - Meals (meal-ingredient writer, /meal_ingredients)
- `UqXlXX5uPWlGvhU6` — Ingredient Agent (NEW in v2: needs CATEGORY_MAP fix in Task 1.18)

### Frontend files touched
- `src/components/InStoreMode.js`
- `src/components/RecipeIngredients.js`
- `src/components/App.js`
- `src/constants/categories.js`
- `src/config/api.js`
- New: `src/hooks/useCategories.js`, `src/utils/categoryMap.js`, `src/utils/storageVersion.js`

### Files NOT touched (verified safe)
- `src/components/HebCart.js` — `heb_product_matches.grocery_item_id` references `GroceryItems.ItemID` (range 14-83), not WGL.
- `src/components/GroceryChecklist.js` — uses bulk Create Grocery List path; Task 2.11 has a pre-flight check to verify if still used.

## Disciplines to follow (from prior session)

The user's standing instructions for this work:

1. **Observe before theorizing.** Verify with `mcp__mysql__mysql_query` (or curl, or browser) before proposing or applying any change.
2. **Distinguish root-cause fixes from defense-in-depth.** Call out which is which when you propose a change.
3. **Audit blast radius after every change.** Every contract change → grep all consumers. Every schema change → check every reader and writer.
4. **Look for siblings of the bug.** After fixing one instance, spend 5 min looking for the same root cause elsewhere.
5. **Verify with direct tools, not just tests.** DB → mysql_query. Webhook → curl + jq. UI → Playwright. Migration → row count before/after.
6. **Clarify before building when ambiguous.** One clarifying exchange beats a re-implementation.
7. **Report honestly.** Distinguish verified from believed from guessed. Call out leftovers and uncommitted side-effects.

## How to start

In your new chat:

```
Read docs/superpowers/HANDOFF-2026-04-19-wgl-fix.md, then begin executing
the WGL architectural fix plan starting at Phase 1 Task 1.1. Use the
superpowers:executing-plans skill in inline mode. Pause for my approval
at each verification gate (Tasks 1.19, 2.15, 3.7).
```

That's all the context the new session needs.

## Migration workflow naming convention

All Phase 1/2/3 migration workflows: `Migration: WGL-Fix Phase N - <description>` so they cluster in n8n list.

After each migration runs successfully, deactivate it via the n8n REST API and update [MEMORY.md](../../C:\Users\Corey\.claude\projects\c--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md) with the workflow ID for future reference.

## After every workflow update

Run this check to catch immediate breakage:
```bash
source /c/hsa-automation/.env && curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "http://localhost:5679/api/v1/executions?limit=5&status=error"
```

If non-empty, fetch the failing execution with `?includeData=true` to see error details.

## Phase gates require user approval

The plan has three explicit STOP points where the new session must pause and ask for user sign-off before proceeding:

- **Task 1.19** — End of Phase 1 (Foundation)
- **Task 2.15** — End of Phase 2 (Writers + Cascade) — recommend ≥1 week stabilization before Phase 3
- **Task 3.7** — End of Phase 3 (Cleanup) — final acceptance

## Known leftovers from prior session

- Background dev server (id `bqur7dwa6`) — exited with code 0 earlier; port 3000 may have a different instance running.
- 16 todo items in the prior session's TodoWrite list — all completed; new session should start its own.
- Test screenshots (`*.png` at repo root) — leftover from earlier feedback investigation; safe to ignore or delete.
- `superpowers:` plugin path: `C:\Users\Corey\.claude\plugins\cache\claude-plugins-official\superpowers\5.0.7`
- The two app-feedback bug fixes (FAB removal + quantity color) are in unstaged form — the user is aware; do not commit them as part of this plan's work.

## Plan revision history

- **v1** (commit 10a2ff1): 33 tasks across 3 phases. Initial draft from `superpowers:writing-plans` skill.
- **v2** (commit 37ecc9c): 36 tasks. Added after applying 7-discipline hardening pass — found 12 gaps including the missing Ingredient Agent fix (root cause), the dead `ingredient.ingredient_id` line, missing Playwright verification, missing pre-Phase-3 workflow audit, and several precision/standardization improvements.
