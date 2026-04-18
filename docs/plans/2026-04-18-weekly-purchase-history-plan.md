# Weekly Purchase History Scrape — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `npm run scrape:history` into the weekly grocery prep orchestrator so HEB orders are captured before HEB's ~4-month rolling window rotates them away.

**Architecture:** Add a `POST /scrape-history` route to the Windows prep-agent that spawns the npm script. Insert `Scrape History → Clean History Result → Update: History` as a new node group in the n8n orchestrator, right after `Update: Coupons` and before `Start Clip Session`. Add a `history_result LONGTEXT` column to `prep_jobs` and one `PREP_STEPS` entry to the React Home progress card.

**Tech Stack:** Express (prep-agent), n8n workflow nodes, MySQL, React.

**Note on testing:** No automated tests. prep-agent and the orchestrator don't have a test suite; pattern is manual verification at each integration point. This matches how [2026-04-18-purchase-history-export-design.md](2026-04-18-purchase-history-export-design.md) was built.

**Reference spec:** [2026-04-18-weekly-purchase-history-design.md](2026-04-18-weekly-purchase-history-design.md).

---

## File Structure

- **Modify:** `C:\New Grocery App\prep-agent\server.js` — add route + concurrency guard entry
- **Modify (via n8n API):** workflow `SgEykcbXCexjTe6l` ("Grocery Prep Orchestrator") — add 3 nodes, rewire, update `Update: Coupons` current_step value
- **Modify (via n8n API):** MySQL schema — add `history_result` column to `prep_jobs`
- **Modify:** `c:\New Grocery App\grocery-checklist-app\src\components\Home.js` — add `scrape-history` entry to `PREP_STEPS` array

---

## Task 1: Add `history_result` column to `prep_jobs`

Migration via n8n (MySQL MCP can't run DDL — see MEMORY.md). Creates a dedicated one-shot migration workflow, executes it, deactivates it.

**Files:**
- Create (via n8n API): new workflow "Add history_result to prep_jobs"

- [ ] **Step 1.1: Create migration workflow**

Use `n8n_create_workflow` to create a workflow with this structure:

- Manual Trigger → MySQL node (executeQuery)
- MySQL credential id: `lqIXlvVVqfE4v7DF`
- Query:

```sql
ALTER TABLE prep_jobs ADD COLUMN history_result LONGTEXT DEFAULT NULL
```

Workflow name: `Add history_result to prep_jobs`

- [ ] **Step 1.2: Activate and run migration**

Activate the workflow via n8n REST API:

```bash
source /c/hsa-automation/.env && curl -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<WORKFLOW_ID>/activate"
```

Then trigger it manually through the n8n UI (click the workflow → Execute Workflow).

- [ ] **Step 1.3: Verify column exists**

Use mysql MCP:

```sql
SHOW COLUMNS FROM prep_jobs LIKE 'history_result'
```

Expected: one row with `Field: history_result, Type: longtext, Null: YES`.

- [ ] **Step 1.4: Deactivate migration workflow**

```bash
source /c/hsa-automation/.env && curl -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<WORKFLOW_ID>/deactivate"
```

No git commit needed — migration is n8n-side, not in the repo.

---

## Task 2: Add `/scrape-history` route to prep-agent

**File:** `C:\New Grocery App\prep-agent\server.js`

- [ ] **Step 2.1: Add to activeJobs concurrency guard**

Find:

```javascript
const activeJobs = {
  'scrape-frequent': null,
  'scrape-coupons': null,
};
```

Replace with:

```javascript
const activeJobs = {
  'scrape-frequent': null,
  'scrape-coupons': null,
  'scrape-history': null,
};
```

- [ ] **Step 2.2: Add the POST /scrape-history route**

Find the block for `app.post('/scrape-coupons', ...)` (should be around line 271-286 of server.js). Directly **after** the closing `});` of that route, insert:

```javascript
// POST /scrape-history  — ?wait=true blocks until done
app.post('/scrape-history', async (req, res) => {
  const result = spawnScrapeJob('scrape-history', 'scrape:history');
  if (result.alreadyRunning) {
    return res.status(409).json({ error: 'ALREADY_RUNNING', jobId: result.jobId });
  }
  console.log(`[prep-agent] Spawned scrape-history job ${result.jobId}`);
  if (req.query.wait === 'true') {
    try {
      const job = await waitForJob(result.jobId, 10 * 60 * 1000);
      return res.json({ jobId: result.jobId, status: job.status, output: job.stdout, exitCode: job.exitCode });
    } catch (err) {
      return res.json({ jobId: result.jobId, status: 'timeout', error: err.message });
    }
  }
  res.json({ jobId: result.jobId });
});
```

10-minute timeout matches `/scrape-coupons`. `npm run scrape:history` already exists per `heb-coupon-scraper/package.json` (wired in the earlier plan).

- [ ] **Step 2.3: Restart prep-agent**

Find how prep-agent is run. If via Windows Task Scheduler, use:

```bash
schtasks /query /tn "prep-agent" 2>/dev/null
```

If it's running as a simple background process, identify the PID:

```bash
netstat -ano | grep ':3850 '
```

Then terminate and restart:

```bash
# If running in a terminal, Ctrl+C that terminal. Otherwise:
taskkill //PID <pid> //F
cd "C:/New Grocery App/prep-agent" && node server.js &
```

Give the restart preference to the user — they may already have a preferred way. **If unsure, BLOCK and ask the user how to restart prep-agent.**

- [ ] **Step 2.4: Smoke-test the new route**

```bash
source /c/hsa-automation/.env
PREP_KEY=$(grep PREP_API_KEY "C:/New Grocery App/prep-agent/.env" | cut -d'=' -f2 | tr -d '"')
curl -s -X POST -H "X-Prep-Key: $PREP_KEY" "http://localhost:3850/scrape-history?wait=true" | head -200
```

Expected: JSON response with `{ jobId, status: 'done', output: '...', exitCode: 0 }`. The `output` should contain `[scrape-history] N orders already in DB (will skip)` and `[scrape-history] Wrote N product rows to ...`.

If `status: 'failed'` or `exitCode !== 0`, surface the output so we can diagnose (likely session expired). **If session expired, BLOCK and ask user to run `npm run scrape:login` in the scraper dir.**

- [ ] **Step 2.5: Smoke-test concurrency guard**

Run two POSTs in quick succession from two terminals (or background one):

```bash
curl -X POST -H "X-Prep-Key: $PREP_KEY" "http://localhost:3850/scrape-history" &
sleep 1
curl -X POST -H "X-Prep-Key: $PREP_KEY" "http://localhost:3850/scrape-history"
```

Second response expected: `{"error":"ALREADY_RUNNING","jobId":"<first-job-id>"}` with HTTP 409.

No git commit for this repo (prep-agent directory is not a git repo — memory confirms).

---

## Task 3: Update n8n Orchestrator

Add three new nodes and rewire connections. Done via `n8n_update_partial_workflow` for minimal disruption.

**Workflow ID:** `SgEykcbXCexjTe6l` ("Grocery Prep Orchestrator")

- [ ] **Step 3.1: Deactivate workflow before editing**

```bash
source /c/hsa-automation/.env && curl -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/SgEykcbXCexjTe6l/deactivate"
```

- [ ] **Step 3.2: Add `Scrape History` node**

Use `n8n_update_partial_workflow` with operation `addNode`:

```json
{
  "id": "scrapeHistory",
  "name": "Scrape History",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [3100, 300],
  "parameters": {
    "url": "http://host.docker.internal:3850/scrape-history?wait=true",
    "method": "POST",
    "options": { "timeout": 660000 },
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "X-Prep-Key",
          "value": "={{ $env.PREP_API_KEY }}"
        }
      ]
    }
  },
  "onError": "continueRegularOutput"
}
```

Note: `onError: "continueRegularOutput"` is the n8n v2+ equivalent of the old `continueOnFail: true` — lets the pipeline proceed even if HTTP request errors.

- [ ] **Step 3.3: Add `Clean History Result` node**

```json
{
  "id": "cleanHistory",
  "name": "Clean History Result",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [3300, 300],
  "parameters": {
    "jsCode": "const data = $('Scrape History').first().json;\nconst clean = {\n  status: data.status || 'unknown',\n  exitCode: data.exitCode,\n  jobId: data.jobId,\n  output: (data.output || '').replace(/[\\x00-\\x1f\\x7f-\\x9f]/g, ' ').substring(0, 2000)\n};\nreturn [{ json: clean }];"
  }
}
```

Identical to `Clean Coupons Result` except source node name.

- [ ] **Step 3.4: Add `Update: History` node**

```json
{
  "id": "updateHistory",
  "name": "Update: History",
  "type": "n8n-nodes-base.mySql",
  "typeVersion": 2.4,
  "position": [3500, 300],
  "parameters": {
    "operation": "executeQuery",
    "query": "=UPDATE prep_jobs SET current_step = 'clip-session', history_result = '{{ JSON.stringify($('Clean History Result').first().json).replace(/'/g, \"''\") }}' WHERE job_id = '{{ $('Generate Job ID').first().json.jobId }}'"
  },
  "credentials": {
    "mySql": {
      "id": "lqIXlvVVqfE4v7DF",
      "name": "MySQL account"
    }
  }
}
```

- [ ] **Step 3.5: Move downstream nodes to make room**

The current Start Clip Session is at position `[3200, 300]`. Shift it and everything after by +600 on the x-axis so the new nodes fit visually:

Use `n8n_update_partial_workflow` with `updateNode` for each:

- `Start Clip Session`: position → `[3700, 300]`
- `Build Summary`: position → `[3900, 300]`
- `Clean Summary`: position → `[4100, 300]`
- `Final Update`: position → `[4300, 300]`

- [ ] **Step 3.6: Update `Update: Coupons` current_step value**

The current query sets `current_step = 'clip-session'`. Change it to `current_step = 'scrape-history'` so the UI advances to the new step.

Use `n8n_update_partial_workflow` with `updateNode` for `Update: Coupons`:

New `query` parameter value:

```
=UPDATE prep_jobs SET current_step = 'scrape-history', coupons_result = '{{ JSON.stringify($('Clean Coupons Result').first().json).replace(/'/g, "''") }}' WHERE job_id = '{{ $('Generate Job ID').first().json.jobId }}'
```

- [ ] **Step 3.7: Rewire connections**

Current connection: `Update: Coupons → Start Clip Session`

New connections:
- Remove: `Update: Coupons → Start Clip Session`
- Add: `Update: Coupons → Scrape History`
- Add: `Scrape History → Clean History Result`
- Add: `Clean History Result → Update: History`
- Add: `Update: History → Start Clip Session`

Use `n8n_update_partial_workflow` with `removeConnection` then `addConnection` operations.

- [ ] **Step 3.8: Update `Build Summary` to include history**

The `Build Summary` node aggregates all step results into one JSON blob. It currently references `frequent`, `coupons`, `clip`. Add `history`.

Use `n8n_update_partial_workflow` with `updateNode` for `Build Summary`:

New `jsCode` parameter value:

```javascript
const jobId = $('Generate Job ID').first().json.jobId;
const docker = $('Check Docker').first().json;
const session = $('Check Session').first().json;
const frequent = $('Clean Frequent Result').first().json;
const coupons = $('Clean Coupons Result').first().json;
const history = $('Clean History Result').first().json;
const clip = $('Start Clip Session').first().json;

return [{
  json: {
    jobId,
    summary: {
      docker,
      session,
      frequent,
      coupons,
      history,
      clip,
      sessionExpired: !session.valid,
      ready: true
    }
  }
}];
```

- [ ] **Step 3.9: Validate workflow**

```
n8n_validate_workflow with id "SgEykcbXCexjTe6l"
```

Expected: no errors. If errors appear, fix them before activating.

- [ ] **Step 3.10: Reactivate workflow**

```bash
source /c/hsa-automation/.env && curl -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/SgEykcbXCexjTe6l/activate"
```

---

## Task 4: Update React Home progress UI

**File:** `c:\New Grocery App\grocery-checklist-app\src\components\Home.js`

- [ ] **Step 4.1: Add History icon import**

Find the lucide-react import (around line 2-6):

```javascript
import {
  ClipboardList, Tag, Store, ShoppingBag, ChefHat,
  ArrowRight, TrendingUp, Sparkles, AlertCircle,
  Server, Key, RefreshCw, Scissors, PlayCircle, CheckCircle, Circle, Loader,
} from "lucide-react";
```

Add `History` to the last line:

```javascript
import {
  ClipboardList, Tag, Store, ShoppingBag, ChefHat,
  ArrowRight, TrendingUp, Sparkles, AlertCircle,
  Server, Key, RefreshCw, Scissors, PlayCircle, CheckCircle, Circle, Loader, History,
} from "lucide-react";
```

- [ ] **Step 4.2: Add PREP_STEPS entry**

Find the `PREP_STEPS` array (around line 46-53):

```javascript
const PREP_STEPS = [
  { key: 'docker-check',    label: 'Checking infrastructure',  icon: Server },
  { key: 'session-check',   label: 'Checking HEB session',     icon: Key },
  { key: 'scrape-frequent', label: 'Scraping frequent items',  icon: RefreshCw },
  { key: 'scrape-coupons',  label: 'Scraping coupons',         icon: Tag },
  { key: 'clip-session',    label: 'Starting clip server',     icon: Scissors },
  { key: 'done',            label: 'Ready to shop!',           icon: CheckCircle },
];
```

Insert `scrape-history` entry between `scrape-coupons` and `clip-session`:

```javascript
const PREP_STEPS = [
  { key: 'docker-check',    label: 'Checking infrastructure',  icon: Server },
  { key: 'session-check',   label: 'Checking HEB session',     icon: Key },
  { key: 'scrape-frequent', label: 'Scraping frequent items',  icon: RefreshCw },
  { key: 'scrape-coupons',  label: 'Scraping coupons',         icon: Tag },
  { key: 'scrape-history',  label: 'Scraping purchase history', icon: History },
  { key: 'clip-session',    label: 'Starting clip server',     icon: Scissors },
  { key: 'done',            label: 'Ready to shop!',           icon: CheckCircle },
];
```

- [ ] **Step 4.3: Run tests and build**

```bash
cd "c:/New Grocery App/grocery-checklist-app"
npm test -- --watchAll=false
```

Expected: all tests pass (16/16 from previous runs). The change doesn't break any test since none of them assert on PREP_STEPS order.

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds. Memory note: Netlify CI treats warnings as errors (`CI=true`) — if `History` import is unused, the build fails. Since we use it in PREP_STEPS, this should be fine.

- [ ] **Step 4.4: Commit React change**

```bash
cd "c:/New Grocery App/grocery-checklist-app"
git add src/components/Home.js
git commit -m "feat: add scrape-history step to prep progress UI

Adds the new 'Scraping purchase history' step to the Home 'Prep for
Shopping' progress card, matching the new node in the Grocery Prep
Orchestrator.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: End-to-end verification

- [ ] **Step 5.1: Trigger prep from React Home**

Open http://localhost:3000 (or netlify URL if deployed), navigate to Home, click "Prep for Shopping". Watch the progress card.

Expected: all 6 steps tick through in order, including the new "Scraping purchase history" step between coupons and clip.

If Home isn't running locally:

```bash
cd "c:/New Grocery App/grocery-checklist-app"
npm start
```

Then click the button.

- [ ] **Step 5.2: Verify prep_jobs got populated**

Use mysql MCP:

```sql
SELECT job_id, status, current_step, history_result
FROM prep_jobs
ORDER BY created_at DESC
LIMIT 1
```

Expected:
- `status`: `completed`
- `current_step`: `done`
- `history_result`: JSON with `status: 'done'`, `exitCode: 0`, and an `output` containing `[scrape-history] Wrote N product rows...`

- [ ] **Step 5.3: Verify heb_purchase_history + CSV still sane**

```sql
SELECT COUNT(*) AS orders FROM heb_purchase_history
```

Should be ≥ 10 (the 10 orders already scraped earlier today). If you've shopped since, it may be 11+.

Then:

```bash
ls -la "C:/New Grocery App/heb-coupon-scraper/exports/purchase-frequency-*.csv"
```

Expected: most recent CSV timestamp is within the last 5 minutes.

- [ ] **Step 5.4: Failure-path verification**

Temporarily rename the session cookie to simulate expiration:

```bash
cd "C:/New Grocery App/heb-coupon-scraper/cookies"
mv heb-session.json heb-session.json.bak
```

Trigger prep again. Expected: `Gate: Session Valid` routes to `Mark Failed: Session Expired`, so `scrape-history` never attempts. UI should show session-expired warning.

Restore the session file:

```bash
mv heb-session.json.bak heb-session.json
```

- [ ] **Step 5.5: continueOnFail verification (optional)**

Simulate a `/scrape-history` HTTP failure by stopping prep-agent for a moment during a prep run. Expected: `Scrape History` node errors, but because `onError: continueRegularOutput` is set, the orchestrator proceeds to `Clean History Result` → `Update: History` (which records the error) → `Start Clip Session`. The prep completes with `history_result` showing the error.

If this is too fiddly to reproduce, skip — the `onError` config was validated in Task 3.9.

---

## Self-Review

**Spec coverage:**
- ✅ `POST /scrape-history` route on prep-agent — Task 2
- ✅ Concurrency guard entry — Task 2.1
- ✅ `Scrape History`, `Clean History Result`, `Update: History` nodes in orchestrator — Task 3.2–3.4
- ✅ Rewired sequence (Update: Coupons → Scrape History → ... → Start Clip Session) — Task 3.7
- ✅ `history_result` LONGTEXT column — Task 1
- ✅ `continueOnFail` / onError continueRegularOutput — Task 3.2 (`onError` field on Scrape History)
- ✅ React progress UI labels — Task 4
- ✅ Build Summary includes history — Task 3.8
- ✅ Rollout order (route → column → workflow → UI) — Tasks 1-4 in this order
- ✅ Manual verification (6 checks) — Task 5

**Placeholder scan:** No TODOs, no "add appropriate handling" — all SQL, JSON, and JS code shown inline.

**Type/name consistency:**
- Column name `history_result` consistent everywhere (Task 1 ALTER, Task 3.4 UPDATE) ✅
- Step key `scrape-history` consistent (Task 3.6 Update: Coupons query, Task 4.2 PREP_STEPS) ✅
- Node IDs (`scrapeHistory`, `cleanHistory`, `updateHistory`) used consistently in Task 3 sub-steps ✅
- `onError: "continueRegularOutput"` matches n8n v2 httpRequest schema ✅
