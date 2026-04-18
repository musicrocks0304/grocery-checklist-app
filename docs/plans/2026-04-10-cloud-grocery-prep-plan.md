# Cloud Grocery Prep — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the `/grocery-prep` skill from a local Claude Code session to a phone-triggered workflow — a "Prep for Shopping" button in the Netlify app that orchestrates scraping, session checks, and clip-server startup via an n8n workflow + lightweight host agent.

**Architecture:** A minimal Express server ("prep-agent") runs on the Windows host and exposes hardcoded scraper/Docker commands as HTTP endpoints. An n8n orchestrator workflow calls these endpoints sequentially, writes progress to a `prep_jobs` MySQL table, and the React app polls for status. The host agent uses API key auth and only accepts predefined commands.

**Tech Stack:** Express (host agent), n8n workflows (orchestrator + status), MySQL (progress tracking), React (UI)

**Design doc:** `docs/plans/2026-04-10-cloud-grocery-prep-design.md`

---

## Task 1: Create `prep-agent` Express Server

**Files:**
- Create: `C:\New Grocery App\prep-agent\package.json`
- Create: `C:\New Grocery App\prep-agent\server.js`
- Create: `C:\New Grocery App\prep-agent\.env.example`

### Step 1: Initialize project

```bash
mkdir -p "C:/New Grocery App/prep-agent" && cd "C:/New Grocery App/prep-agent" && npm init -y && npm install express dotenv cors uuid
```

### Step 2: Create `.env.example`

```
PREP_API_KEY=your-secret-key-here
PORT=3850
SCRAPER_DIR=C:/New Grocery App/heb-coupon-scraper
```

Create actual `.env` with a real key (generate UUID).

### Step 3: Write `server.js`

The server has these endpoints:

| Route | Method | What it does |
|-------|--------|-------------|
| `/health` | GET | Returns `{status: "ok"}` |
| `/docker-status` | GET | Runs `docker ps --format "{{json .}}"`, parses container statuses |
| `/session-status` | GET | Checks HEB session file age at `SCRAPER_DIR/cookies/heb-session.json` |
| `/scrape-frequent` | POST | Spawns `npm run scrape:frequent` in SCRAPER_DIR, returns `{jobId}` |
| `/scrape-coupons` | POST | Spawns `npm run scrape` in SCRAPER_DIR, returns `{jobId}` |
| `/job-status/:jobId` | GET | Returns `{status, output, exitCode}` for a tracked job |

Key implementation details:
- **Auth middleware**: Check `X-Prep-Key` header against `process.env.PREP_API_KEY`. Return 401 if missing/wrong. Apply to all routes except `/health`.
- **CORS**: Allow `localhost`, `*.netlify.app`, `*.needexcelexpert.com` (same pattern as clip-server).
- **Job tracking**: In-memory `Map<jobId, {status, stdout, stderr, exitCode, startedAt}>`. Use `child_process.spawn` with `shell: true` on Windows. Pipe stdout/stderr to strings. Clean up jobs older than 1 hour via `setInterval`.
- **Session check**: Use `fs.statSync` on cookie file, compute age in hours, compare to 24h max. Return `{valid, ageHours, maxAge: 24, lastModified}`.
- **Docker status**: Spawn `docker ps --format "{{json .}}"`, parse each line as JSON, return array of `{name, status, running: status.startsWith("Up")}`. Check for required containers: `heb-clip-server`, `heb-cloudflared`, `hsa-processor`, `hsa-mysql`, `hsa-postgres`.
- **Concurrency guard**: Only allow 1 scrape job of each type at a time. If `/scrape-coupons` called while one is running, return `{error: "ALREADY_RUNNING", jobId: existingJobId}`.
- **Logging**: Prefix all logs with `[prep-agent]`.
- **Listen on `0.0.0.0:3850`** so Docker containers can reach via `host.docker.internal:3850`.

### Step 4: Test manually

```bash
cd "C:/New Grocery App/prep-agent" && node server.js
```

In another terminal:
```bash
# Health
curl http://localhost:3850/health

# Docker status (with auth)
curl -H "X-Prep-Key: YOUR_KEY" http://localhost:3850/docker-status

# Session status
curl -H "X-Prep-Key: YOUR_KEY" http://localhost:3850/session-status

# Start scrape (returns jobId)
curl -X POST -H "X-Prep-Key: YOUR_KEY" http://localhost:3850/scrape-frequent

# Check job
curl -H "X-Prep-Key: YOUR_KEY" http://localhost:3850/job-status/JOB_ID
```

### Step 5: Commit

```bash
cd "C:/New Grocery App/prep-agent" && git init && git add -A && git commit -m "feat: prep-agent Express server for remote grocery prep"
```

---

## Task 2: Create `prep_jobs` MySQL Table

**Files:**
- Create: n8n workflow `Create prep_jobs Table`

### Step 1: Create n8n migration workflow

Create a new n8n workflow with:
- **Webhook** (GET, path: `/create_prep_jobs_table`)
- **MySQL** node with this query:

```sql
CREATE TABLE IF NOT EXISTS prep_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id VARCHAR(36) NOT NULL UNIQUE,
  status ENUM('running', 'completed', 'failed') DEFAULT 'running',
  current_step VARCHAR(50) DEFAULT 'init',
  docker_result JSON,
  session_result JSON,
  frequent_result JSON,
  coupons_result JSON,
  clip_result JSON,
  summary JSON,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_job_id (job_id),
  INDEX idx_status (status)
);
```

- **Respond to Webhook** with `{success: true}`

### Step 2: Execute the migration

Activate workflow, hit the webhook, verify table created, then deactivate.

### Step 3: Verify

```sql
DESCRIBE prep_jobs;
```

---

## Task 3: Create n8n `Grocery Prep Status` Workflow

**Files:**
- Create: n8n workflow `Grocery Prep Status`

This is the simpler workflow — the React app polls it for progress. Build it first so the orchestrator can be tested end-to-end.

### Step 1: Create the workflow

Nodes:
1. **Webhook** — GET at `/grocery_prep_status`. WebhookId: generate UUID. Query param: `jobId`.
2. **MySQL** — `SELECT * FROM prep_jobs WHERE job_id = '{{ $json.query.jobId }}' LIMIT 1`
3. **Aggregate** — aggregateAllItemData (n8n returns only first row without this)
4. **Respond to Webhook** — Body: `{{ JSON.stringify($json.data[0] || {error: "not_found"}) }}`. Headers: `Access-Control-Allow-Origin: *`.

### Step 2: Activate and test

```bash
curl "https://n8n-grocery.needexcelexpert.com/webhook/grocery_prep_status?jobId=test-123"
```

Should return `{error: "not_found"}` (no job exists yet).

---

## Task 4: Create n8n `Grocery Prep Orchestrator` Workflow

**Files:**
- Create: n8n workflow `Grocery Prep Orchestrator`

This is the main workflow. It responds immediately with a jobId, then runs steps in sequence, updating the `prep_jobs` table at each step.

### Step 1: Create the workflow structure

**Trigger path**: POST `/grocery_prep`. WebhookId: generate UUID. ResponseMode: `responseNode` (allows responding early, then continuing).

**Node chain:**

```
Webhook
  → Generate Job ID (Code)
  → Init Job (MySQL INSERT)
  → Respond to Webhook (return {jobId} immediately)
  → Check Docker (HTTP Request to host-agent)
  → Update Progress: docker (MySQL UPDATE)
  → Check Session (HTTP Request to host-agent)
  → Update Progress: session (MySQL UPDATE)
  → Start Scrape Frequent (HTTP Request POST to host-agent)
  → Wait 5s (Wait node)
  → Poll Frequent Loop (HTTP Request GET job-status + IF not done → Wait 5s → loop back)
  → Update Progress: frequent (MySQL UPDATE)
  → Start Scrape Coupons (HTTP Request POST to host-agent)
  → Wait 5s (Wait node)
  → Poll Coupons Loop (HTTP Request GET job-status + IF not done → Wait 5s → loop back)
  → Update Progress: coupons (MySQL UPDATE)
  → Start Clip Session (HTTP Request POST to clip-server)
  → Update Progress: clip (MySQL UPDATE)
  → Build Summary (Code node)
  → Final Update (MySQL UPDATE status='completed', summary=JSON)
```

### Step 2: Implement each node

**Generate Job ID** (Code node):
```javascript
const jobId = $('Webhook').first().json.headers['x-request-id']
  || require('crypto').randomUUID();
return [{ json: { jobId } }];
```

**Init Job** (MySQL):
```sql
INSERT INTO prep_jobs (job_id, status, current_step)
VALUES ('{{ $json.jobId }}', 'running', 'docker-check')
```

**Respond to Webhook**:
- Body: `{"jobId": "{{ $('Generate Job ID').first().json.jobId }}"}`
- Headers: `Access-Control-Allow-Origin: *`, `Content-Type: application/json`
- Connect this node's output to the next step so processing continues

**Check Docker** (HTTP Request):
- Method: GET
- URL: `http://host.docker.internal:3850/docker-status`
- Headers: `X-Prep-Key: {{ $env.PREP_API_KEY }}`
  (Add `PREP_API_KEY` to n8n environment variables in docker-compose)

**Update Progress: docker** (MySQL):
```sql
UPDATE prep_jobs
SET current_step = 'session-check',
    docker_result = '{{ JSON.stringify($json) }}'
WHERE job_id = '{{ $('Generate Job ID').first().json.jobId }}'
```

**Check Session** (HTTP Request):
- Method: GET
- URL: `http://host.docker.internal:3850/session-status`
- Headers: `X-Prep-Key: {{ $env.PREP_API_KEY }}`

**Update Progress: session** (MySQL):
```sql
UPDATE prep_jobs
SET current_step = 'scrape-frequent',
    session_result = '{{ JSON.stringify($json) }}'
WHERE job_id = '{{ $('Generate Job ID').first().json.jobId }}'
```

**Start Scrape Frequent** (HTTP Request):
- Method: POST
- URL: `http://host.docker.internal:3850/scrape-frequent`
- Headers: `X-Prep-Key: {{ $env.PREP_API_KEY }}`

**Poll Loop** — n8n doesn't have native loops. Use this pattern:
- **Wait** (5 seconds)
- **Poll Job** (HTTP GET `http://host.docker.internal:3850/job-status/{{ $json.jobId }}`)
- **IF** node: `{{ $json.status }}` equals `running` → loop back to Wait. Else → continue.
- Set a max poll count (60 iterations = 5 minutes) to prevent infinite loops.

Repeat the same poll pattern for scrape-coupons (with 10-minute max = 120 iterations).

**Start Clip Session** (HTTP Request):
- Method: POST
- URL: `http://host.docker.internal:3847/api/heb/session/start`
  (clip-server is on the Docker network, reachable at container name `heb-clip-server:3847` or via `host.docker.internal:3847`)

**Build Summary** (Code node):
```javascript
const jobId = $('Generate Job ID').first().json.jobId;
const docker = $('Check Docker').first().json;
const session = $('Check Session').first().json;
const frequent = $('Poll Frequent Done').first().json;
const coupons = $('Poll Coupons Done').first().json;
const clip = $('Start Clip Session').first().json;

return [{
  json: {
    jobId,
    summary: {
      docker: docker,
      session: session,
      frequent: frequent.output || 'completed',
      coupons: coupons.output || 'completed',
      clip: clip,
      sessionExpired: !session.valid,
      ready: true
    }
  }
}];
```

**Final Update** (MySQL):
```sql
UPDATE prep_jobs
SET status = 'completed',
    current_step = 'done',
    clip_result = '{{ JSON.stringify($('Start Clip Session').first().json) }}',
    summary = '{{ JSON.stringify($('Build Summary').first().json.summary) }}'
WHERE job_id = '{{ $('Generate Job ID').first().json.jobId }}'
```

### Step 3: Add error handling

Add an **Error Trigger** node that catches any failure and updates the job:
```sql
UPDATE prep_jobs
SET status = 'failed',
    error_message = '{{ $json.error.message }}'
WHERE job_id = '{{ $('Generate Job ID').first().json.jobId }}'
```

### Step 4: Add PREP_API_KEY to n8n environment

Edit `C:\hsa-automation\.env`:
```
PREP_API_KEY=same-key-as-prep-agent
```

Edit `C:\hsa-automation\docker-compose.yaml`, add to `hsa-local` environment:
```yaml
- PREP_API_KEY=${PREP_API_KEY}
```

Restart n8n container: `docker restart hsa-processor`

### Step 5: Test end-to-end

```bash
# Start prep-agent on host
cd "C:/New Grocery App/prep-agent" && node server.js &

# Trigger orchestrator
curl -X POST https://n8n-grocery.needexcelexpert.com/webhook/grocery_prep

# Poll status (use returned jobId)
curl "https://n8n-grocery.needexcelexpert.com/webhook/grocery_prep_status?jobId=RETURNED_JOB_ID"
```

Watch n8n execution log for errors. Verify each step updates `prep_jobs`.

### Step 6: Commit n8n workflows

Document the workflow IDs in MEMORY.md after creation.

---

## Task 5: Add React UI — Prep Button + Progress

**Files:**
- Modify: `src/config/api.js` — add 2 endpoints
- Modify: `src/components/Home.js` — add Prep card and progress UI

### Step 1: Add endpoints to `api.js`

Add to the ENDPOINTS object:
```javascript
// Grocery Prep
groceryPrep: `${API_BASE_URL}/grocery_prep`,
groceryPrepStatus: `${API_BASE_URL}/grocery_prep_status`,
```

### Step 2: Add Prep button to Home.js

Add a "Prep for Shopping" card to the Home screen, placed above the Quick Access section. Use the existing card pattern:

```jsx
// State
const [prepJob, setPrepJob] = useState(null); // {jobId, status, currentStep, summary, error}

// Steps definition for progress display
const PREP_STEPS = [
  { key: 'docker-check', label: 'Checking infrastructure', icon: Server },
  { key: 'session-check', label: 'Checking HEB session', icon: Key },
  { key: 'scrape-frequent', label: 'Scraping frequent items', icon: ShoppingCart },
  { key: 'scrape-coupons', label: 'Scraping coupons', icon: Tag },
  { key: 'clip-session', label: 'Starting clip server', icon: Scissors },
  { key: 'done', label: 'Ready to shop!', icon: CheckCircle },
];
```

**Start prep handler:**
```javascript
const startPrep = async () => {
  try {
    setPrepJob({ status: 'starting' });
    const res = await apiFetch(ENDPOINTS.groceryPrep, { method: 'POST' });
    const data = await res.json();
    setPrepJob({ jobId: data.jobId, status: 'running', currentStep: 'docker-check' });
  } catch (err) {
    setPrepJob({ status: 'error', error: err.message });
  }
};
```

**Polling effect:**
```javascript
useEffect(() => {
  if (!prepJob?.jobId || prepJob.status !== 'running') return;

  const interval = setInterval(async () => {
    try {
      const url = new URL(ENDPOINTS.groceryPrepStatus);
      url.searchParams.append('jobId', prepJob.jobId);
      const res = await apiFetch(url.toString());
      const data = await res.json();

      if (data.status === 'completed') {
        setPrepJob({ ...prepJob, status: 'completed', summary: data.summary, currentStep: 'done' });
        clearInterval(interval);
      } else if (data.status === 'failed') {
        setPrepJob({ ...prepJob, status: 'error', error: data.error_message });
        clearInterval(interval);
      } else {
        setPrepJob(prev => ({ ...prev, currentStep: data.current_step }));
      }
    } catch {
      // Silently retry on network error
    }
  }, 3000);

  return () => clearInterval(interval);
}, [prepJob?.jobId, prepJob?.status]);
```

**UI rendering:**
- **Idle state**: Card with play icon, "Prep for Shopping" title, "Check infrastructure, scrape deals, get ready" subtitle. Tap to start.
- **Running state**: Card expands to show step list. Each step shows: icon + label + status (checkmark if past current step, spinner if current, gray if future). Session expired warning if applicable.
- **Completed state**: Summary card showing counts (frequent items, coupons, clip session timeout). "Ready to shop!" message with green checkmark.
- **Error state**: Red error card with message and "Retry" button.

Use the existing motion animation pattern (staggerContainer/staggerItem) for the step list.

### Step 3: Add Lucide icons import

Add any missing icons to Home.js imports: `Server`, `Key`, `Scissors`, `PlayCircle` (or reuse existing ones).

### Step 4: Test in dev

```bash
cd "C:/New Grocery App/grocery-checklist-app" && npm start
```

1. Verify the Prep card appears on Home screen
2. Tap it — should show progress
3. Verify polling works and steps update
4. Verify completed summary displays

### Step 5: Build check

```bash
cd "C:/New Grocery App/grocery-checklist-app" && npm run build
```

Fix any unused imports or build warnings (Netlify CI treats warnings as errors).

### Step 6: Commit

```bash
cd "C:/New Grocery App/grocery-checklist-app"
git add src/config/api.js src/components/Home.js
git commit -m "feat: add Prep for Shopping button with progress tracking"
```

---

## Task 6: Auto-Start Prep Agent on Windows Login

**Files:**
- Create: `C:\New Grocery App\prep-agent\start-prep-agent.bat`

### Step 1: Create batch file

```bat
@echo off
cd /d "C:\New Grocery App\prep-agent"
node server.js
```

### Step 2: Create Windows Task Scheduler task

```bash
schtasks /create /tn "PrepAgent" /tr "C:\New Grocery App\prep-agent\start-prep-agent.bat" /sc onlogon /rl highest
```

### Step 3: Verify it starts

Log out and back in, or run manually:
```bash
schtasks /run /tn "PrepAgent"
```

Verify: `curl http://localhost:3850/health`

### Step 4: Commit

```bash
cd "C:/New Grocery App/prep-agent"
git add start-prep-agent.bat
git commit -m "feat: add auto-start batch file for Windows Task Scheduler"
```

---

## Task 7: End-to-End Verification

### Step 1: Ensure all components running

- prep-agent on host (port 3850)
- Docker containers (n8n, MySQL, clip-server, cloudflared)
- React dev server or Netlify deploy

### Step 2: Test from phone

1. Open `https://grocery-checklist-app.netlify.app` on phone
2. Tap "Prep for Shopping" button on Home screen
3. Watch progress — each step should show a checkmark as it completes
4. Verify final summary shows coupon/frequent counts
5. If HEB session is expired, verify warning banner appears

### Step 3: Test error scenarios

- Stop prep-agent → verify n8n workflow fails gracefully, React shows error
- Kill Docker containers → verify docker-check step reports them as down
- Delete HEB session file → verify session-check reports expired

### Step 4: Deploy to Netlify

```bash
cd "C:/New Grocery App/grocery-checklist-app" && git push
```

Verify Netlify build succeeds and the button works on the deployed app.

### Step 5: Update MEMORY.md

Add entries for:
- `Grocery Prep Orchestrator` workflow ID and webhook path
- `Grocery Prep Status` workflow ID and webhook path
- `Create prep_jobs Table` migration workflow ID
- prep-agent location and port
- Windows Task Scheduler task name

---

## Summary of Deliverables

| Component | Location | Type |
|-----------|----------|------|
| prep-agent server | `C:\New Grocery App\prep-agent\server.js` | New Express app |
| prep_jobs table | MySQL `hsa` database | New table |
| Grocery Prep Orchestrator | n8n workflow | New workflow |
| Grocery Prep Status | n8n workflow | New workflow |
| Create prep_jobs Table | n8n workflow | Migration (run once) |
| Home.js Prep button | `src/components/Home.js` | Modified |
| api.js endpoints | `src/config/api.js` | Modified |
| Auto-start batch | `prep-agent\start-prep-agent.bat` | New file |
