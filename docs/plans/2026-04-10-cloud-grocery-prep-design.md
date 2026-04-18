# Cloud Grocery Prep — Design Document

**Date**: 2026-04-10
**Status**: Approved
**Goal**: Move the `/grocery-prep` skill from a local Claude Code session to a phone-triggered workflow via the Netlify app.

## Problem

The grocery-prep workflow (check Docker, validate HEB session, scrape frequent items, scrape coupons, start clip session) currently requires a local Claude Code terminal session. This means the user must be at their PC to run it, which is inconvenient when preparing to shop.

## Requirements

- **Trigger**: "Prep for Shopping" button in the Netlify React app, usable from phone
- **Session handling**: If HEB session is expired, notify the user (don't block workflow)
- **Compute**: Hybrid — trigger local Windows machine remotely; designed so scrapers can move to cloud later
- **Progress**: Step-by-step progress visible in the app
- **No new cloud infrastructure** — reuse existing n8n + Cloudflare tunnel stack

## Architecture

```
Phone → Netlify App → "Prep" button
  → POST n8n-grocery.needexcelexpert.com/webhook/grocery_prep
    → n8n Orchestrator Workflow:
      1. GET host-agent:3850/docker-status
      2. GET host-agent:3850/session-status
      3. POST host-agent:3850/scrape-frequent  → poll /job-status/:id
      4. POST host-agent:3850/scrape-coupons   → poll /job-status/:id
      5. POST clip-server:3847/api/heb/session/start
    → Writes progress to MySQL prep_jobs table
    → Returns final summary

React App polls GET /grocery_prep_status?jobId=X every 3s for progress
```

## Component 1: Host Agent (`prep-agent`)

A minimal Express server running directly on the Windows host (NOT in Docker). Exposes a small set of hardcoded commands — not a general-purpose shell executor.

**Location**: `C:\New Grocery App\prep-agent\`

### Endpoints

| Route | Method | What it does | Returns |
|-------|--------|-------------|---------|
| `/health` | GET | Heartbeat | `{status: "ok"}` |
| `/docker-status` | GET | `docker ps --format json` | `{containers: [{name, status, running}]}` |
| `/session-status` | GET | Check HEB session file age | `{valid, ageHours, maxAge, lastModified}` |
| `/scrape-frequent` | POST | Spawn `npm run scrape:frequent` | `{jobId}` |
| `/scrape-coupons` | POST | Spawn `npm run scrape` | `{jobId}` |
| `/job-status/:jobId` | GET | Check job progress | `{status: "running"|"completed"|"failed", output, exitCode}` |

### Security

- API key required in `X-Prep-Key` header
- Only accepts predefined commands (no arbitrary execution)
- Listens on `0.0.0.0:3850` so Docker containers can reach it via `host.docker.internal:3850`

### Auto-start

Windows Task Scheduler task, runs on user login. Simple batch: `node C:\New Grocery App\prep-agent\server.js`

### Implementation

~100 lines of Express. Each scraper endpoint spawns a child process, tracks it by jobId (UUID), stores stdout/stderr in memory (Map), cleans up after 1 hour.

## Component 2: n8n Orchestrator Workflow

New workflow: `Grocery Prep Orchestrator`

### Trigger

POST webhook at `/grocery_prep`. WebhookId: TBD (generate UUID at creation time).

Uses `responseMode: lastNode` so the webhook responds immediately with `{jobId}` while processing continues asynchronously.

Actually — n8n webhook `responseMode: responseNode` allows responding early, then continuing processing. The workflow:

1. **Webhook** (POST `/grocery_prep`) — receives request
2. **Generate Job ID** (Code node) — UUID
3. **Init Job** (MySQL) — INSERT into `prep_jobs` with status='running', step='docker-check'
4. **Respond to Webhook** — return `{jobId}` immediately (CORS headers: `*`)
5. **Check Docker** (HTTP Request) — GET `http://host.docker.internal:3850/docker-status`
6. **Update Progress** (MySQL) — update prep_jobs step='session-check', docker_result=JSON
7. **Check Session** (HTTP Request) — GET `http://host.docker.internal:3850/session-status`
8. **Update Progress** (MySQL) — update step='scrape-frequent', session_result=JSON
9. **If Session Expired** (IF node) — branch to notification (email/webhook), continue regardless
10. **Start Scrape Frequent** (HTTP Request) — POST to host-agent
11. **Poll Frequent** (Loop/Wait) — poll job-status every 5s until complete
12. **Update Progress** (MySQL) — update step='scrape-coupons', frequent_result=JSON
13. **Start Scrape Coupons** (HTTP Request) — POST to host-agent
14. **Poll Coupons** (Loop/Wait) — poll job-status every 5s until complete
15. **Update Progress** (MySQL) — update step='clip-session', coupons_result=JSON
16. **Start Clip Session** (HTTP Request) — POST to clip-server
17. **Build Summary** (Code node) — aggregate all results
18. **Final Update** (MySQL) — update prep_jobs status='completed', summary=JSON

### Status Endpoint

Separate n8n workflow: GET webhook at `/grocery_prep_status?jobId=X`
- Webhook → MySQL SELECT from prep_jobs WHERE job_id=X → Respond

### MySQL Table: `prep_jobs`

```sql
CREATE TABLE prep_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id VARCHAR(36) NOT NULL UNIQUE,
  status ENUM('running', 'completed', 'failed') DEFAULT 'running',
  current_step VARCHAR(50),
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

## Component 3: React UI

### Home Screen Addition

A "Prep for Shopping" card/button on the Home screen. Tapping it:

1. POSTs to n8n webhook `/grocery_prep`
2. Receives `{jobId}`
3. Polls `/grocery_prep_status?jobId=X` every 3 seconds
4. Shows step-by-step progress UI:
   - Docker Infrastructure: spinner → checkmark/X
   - HEB Session: spinner → checkmark / warning (expired)
   - Frequently Purchased: spinner → "X new, Y updated"
   - Coupons: spinner → "X new, Y updated"
   - Clip Server: spinner → "Session active (X min)"
5. Final: summary card with "Ready to shop!" or error details

### Session Expired Warning

If `session_result.valid === false`, show a persistent warning banner:
> "HEB session expired — coupon clipping won't work. Log in from your computer to refresh."

Does NOT block the rest of the prep — scraping can still run with stale session (it'll fail gracefully).

## Cloud Migration Path

When scrapers move to cloud:
- **Host agent** becomes unnecessary (or moves to the cloud server)
- **n8n workflow** changes only the HTTP Request URLs (from `host.docker.internal:3850` to `localhost` or cloud agent URL)
- **React UI** — no changes
- **MySQL** — when DB moves to cloud, update n8n MySQL credentials

When DB moves to cloud:
- **prep_jobs table** moves with it
- **n8n MySQL connection** updates to cloud DB
- Everything else stays the same

## Security Considerations

- Host agent uses API key authentication (`X-Prep-Key` header)
- No arbitrary command execution — all commands are hardcoded
- n8n webhook is publicly accessible but the prep workflow is idempotent and safe
- Consider rate limiting: max 1 concurrent prep job per user (check for existing 'running' job before starting)

## Files to Create/Modify

### New Files
- `C:\New Grocery App\prep-agent\package.json`
- `C:\New Grocery App\prep-agent\server.js`
- `C:\New Grocery App\prep-agent\.env` (PREP_API_KEY)
- n8n workflow: `Grocery Prep Orchestrator`
- n8n workflow: `Grocery Prep Status`
- n8n migration workflow: `Create prep_jobs Table`

### Modified Files
- `src/components/Home.js` — add Prep button and progress UI
- `src/api.js` — add ENDPOINTS for grocery_prep and grocery_prep_status
- `C:\hsa-automation\.env` — add PREP_API_KEY

## Not In Scope
- Moving scrapers to cloud (future)
- Moving DB to cloud (future)
- Push notifications for session expiry (can use in-app warning for now)
- Automatic session refresh
