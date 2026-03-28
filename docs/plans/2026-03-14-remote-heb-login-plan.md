# Remote HEB Login & Scraper Control — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable the full weekly HEB coupon workflow (login, scrape, clip, cart) from any device via the existing grocery app.

**Architecture:** Kasm Chrome container for remote browser access (VNC-in-browser), Cloudflare tunnel for HTTPS exposure, cookie bridge from Chrome to Playwright storage state, Express API endpoints for import/scrape, and a React Session Manager UI with 3 action buttons.

**Tech Stack:** Docker (kasmweb/chrome:1.16.0), Cloudflare Tunnel (existing `heb-clip` tunnel), Express.js (clip-server), Playwright (cookie extraction), React (Session Manager component), SSE (scraper progress streaming).

**Design doc:** `docs/plans/2026-03-14-remote-heb-login-design.md`

---

## Phase 1: Infrastructure (Docker + Cloudflare + Environment)

### Task 1: Add environment variables

**Files:**
- Modify: `C:\hsa-automation\.env`

**Step 1: Generate a VNC password and admin API key**

Run:
```bash
node -e "const c=require('crypto'); console.log('HEB_VNC_PASSWORD=' + c.randomBytes(12).toString('base64url')); console.log('ADMIN_API_KEY=' + c.randomUUID())"
```

**Step 2: Append to .env**

Add these two lines to `C:\hsa-automation\.env` (use the values generated in step 1):

```
# Remote HEB Login (Kasm Chrome VNC + Admin API)
HEB_VNC_PASSWORD=<generated-password>
ADMIN_API_KEY=<generated-uuid>
```

**Step 3: Commit**

```bash
cd "C:\hsa-automation"
git add .env
git commit -m "feat: add HEB_VNC_PASSWORD and ADMIN_API_KEY env vars for remote login"
```

---

### Task 2: Add Kasm Chrome container to Docker Compose

**Files:**
- Modify: `C:\hsa-automation\docker-compose.yaml`

**Step 1: Add `heb-remote-browser` service and `heb_chrome_profile` volume**

Insert the new service block after the `heb-clip-server` service (after line 125) and before the `cloudflared` service. Also add `ADMIN_API_KEY` to the `heb-clip-server` environment, and add the `heb_chrome_profile` named volume.

In `docker-compose.yaml`, the `heb-clip-server` service gets one new env var:

```yaml
  heb-clip-server:
    # ... existing config ...
    environment:
      # ... existing vars ...
      - ADMIN_API_KEY=${ADMIN_API_KEY}
```

New service (insert between `heb-clip-server` and `cloudflared`):

```yaml
  heb-remote-browser:
    image: kasmweb/chrome:1.16.0
    container_name: heb-remote-browser
    restart: unless-stopped
    shm_size: "512m"
    ports:
      - "6901:6901"
    environment:
      - VNC_PW=${HEB_VNC_PASSWORD}
    volumes:
      - "../New Grocery App/heb-coupon-scraper/cookies:/cookies"
      - heb_chrome_profile:/home/kasm-user/.config/google-chrome
    networks:
      - hsa-network
```

Add to the `volumes:` section at the bottom:

```yaml
volumes:
  hsa_data:
  mysql_data:
  postgres_data:
  scraper_data:
  heb_chrome_profile:
```

**Step 2: Verify syntax**

Run:
```bash
cd "C:\hsa-automation"
docker compose config --quiet
```
Expected: No output (valid YAML). Any output means a syntax error.

**Step 3: Commit**

```bash
cd "C:\hsa-automation"
git add docker-compose.yaml
git commit -m "feat: add heb-remote-browser (Kasm Chrome) container + admin API key"
```

---

### Task 3: Add Cloudflare tunnel route for remote browser

**Files:**
- Modify: `C:\hsa-automation\cloudflared\config.yml`

**Step 1: Add hostname route**

The current `config.yml` has one ingress rule (`clip.needexcelexpert.com`) followed by a catch-all 404. Insert the new route BEFORE the catch-all:

```yaml
tunnel: 4f4ce0c6-c242-4610-bf33-c8114ad9f73b
credentials-file: /etc/cloudflared/4f4ce0c6-c242-4610-bf33-c8114ad9f73b.json

ingress:
  - hostname: clip.needexcelexpert.com
    service: http://host.docker.internal:3847
  - hostname: heb-login.needexcelexpert.com
    service: https://heb-remote-browser:6901
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

**Why `noTLSVerify: true`**: KasmVNC serves its web client over self-signed HTTPS on port 6901. Cloudflare needs to accept that self-signed cert.

**Why `heb-remote-browser:6901`** (not `host.docker.internal`): Both `heb-cloudflared` and `heb-remote-browser` are on the `hsa-network` Docker bridge. Using the container name for direct container-to-container routing avoids going through the host network.

**Step 2: Add DNS CNAME record via Cloudflare CLI**

```bash
# Install cloudflared CLI if not already present (it should be — used for tunnel setup)
# Add CNAME: heb-login.needexcelexpert.com -> tunnel UUID
cloudflared tunnel route dns heb-clip heb-login.needexcelexpert.com
```

Expected output: `Successfully routed DNS record heb-login.needexcelexpert.com to tunnel 4f4ce0c6-c242-4610-bf33-c8114ad9f73b`

If the DNS record already exists: `A]DNS record already exists for heb-login.needexcelexpert.com` — that's fine.

**Step 3: Restart cloudflared to pick up new config**

```bash
cd "C:\hsa-automation"
docker compose restart cloudflared
```

**Step 4: Commit**

```bash
cd "C:\hsa-automation"
git add cloudflared/config.yml
git commit -m "feat: add heb-login.needexcelexpert.com tunnel route for remote browser"
```

---

### Task 4: Pull and start the Kasm Chrome container

**Step 1: Pull the Kasm image (large, ~2.5GB)**

```bash
cd "C:\hsa-automation"
docker compose pull heb-remote-browser
```

**Step 2: Start the container**

```bash
cd "C:\hsa-automation"
docker compose up -d heb-remote-browser
```

**Step 3: Verify it's running**

```bash
docker logs heb-remote-browser --tail 20
```

Expected: Kasm startup messages, VNC server listening on port 6901.

**Step 4: Test local access**

Open `https://localhost:6901` in a browser. You should see the KasmVNC login page asking for the VNC password (the `HEB_VNC_PASSWORD` value from `.env`).

**Step 5: Test tunnel access**

Open `https://heb-login.needexcelexpert.com` in a browser. Should show the same KasmVNC login page through Cloudflare.

---

## Phase 2: Backend — Cookie Import & Scraper Runner

### Task 5: Create `session-import.js` (cookie extraction module)

**Files:**
- Create: `C:\New Grocery App\heb-coupon-scraper\src\session-import.js`

**Context:** The Kasm Chrome container shares its cookie directory at `/cookies` (bind-mounted from `cookies/` on the host). After the user logs into HEB in the Kasm browser, we need to extract those cookies and convert them to Playwright's storage state format (`{ cookies: [...], origins: [...] }`), which is what the existing `auth.js` reads from `heb-session.json`.

**Approach (simpler alternative from design doc):** Launch a Playwright browser context pointed at the Kasm Chrome's user data directory, call `context.storageState()`, and write to `heb-session.json`. This reuses existing Playwright infrastructure and avoids SQLite dependencies.

**However**, the Chrome user data dir is inside the Kasm container's named volume (`heb_chrome_profile`), not directly accessible from the clip-server container. The shared bind mount is only the `cookies/` dir.

**Revised approach:** The Kasm Chrome container has the `cookies/` volume mounted. We'll add a small helper: after HEB login, the Kasm Chrome's cookies are in its profile. We need to extract them. The simplest path:

1. The clip-server container also has Playwright installed
2. The clip-server gets access to the Chrome profile volume (add a read-only mount)
3. Use Playwright to open a context with that user data dir and extract storage state

**OR even simpler**: Add the `heb_chrome_profile` volume as a read-only mount to `heb-clip-server` too. Then Playwright in clip-server can read the Chrome profile directly.

**Step 1: Update docker-compose.yaml — add Chrome profile volume to clip-server**

In `docker-compose.yaml`, add this volume mount to `heb-clip-server`:

```yaml
  heb-clip-server:
    volumes:
      - "../New Grocery App/heb-coupon-scraper/cookies:/app/cookies"
      - "heb_chrome_profile:/chrome-profile:ro"
```

**Step 2: Create session-import.js**

Create `C:\New Grocery App\heb-coupon-scraper\src\session-import.js`:

```javascript
/**
 * Session Import — Extract cookies from Kasm Chrome profile
 * and convert to Playwright storage state format.
 *
 * The Kasm Chrome container stores its profile in a Docker named volume
 * that's mounted read-only at /chrome-profile in the clip-server container.
 *
 * We launch a Playwright Chromium instance with that user data directory,
 * call context.storageState(), filter to .heb.com cookies, and write
 * the result to the standard cookie path (heb-session.json).
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Path where the Kasm Chrome profile is mounted (read-only)
const CHROME_PROFILE_PATH = process.env.CHROME_PROFILE_PATH || '/chrome-profile';

// Kasm Chrome stores the default profile under Default/
const CHROME_USER_DATA_DIR = path.join(CHROME_PROFILE_PATH, 'Default');

/**
 * Import session from Kasm Chrome's profile into Playwright storage state.
 *
 * @returns {{ success: boolean, cookieCount: number, expiresAt: string|null, error?: string }}
 */
async function importSession() {
  console.log('[session-import] Starting cookie import from Kasm Chrome profile...');
  console.log('[session-import] Chrome profile path:', CHROME_PROFILE_PATH);

  // Verify the Chrome profile exists
  if (!fs.existsSync(CHROME_PROFILE_PATH)) {
    return {
      success: false,
      cookieCount: 0,
      expiresAt: null,
      error: `Chrome profile not found at ${CHROME_PROFILE_PATH}. Has the Kasm browser been started?`,
    };
  }

  let browser = null;
  try {
    // Launch a temporary Chromium instance using the Kasm Chrome's profile.
    // We use launchPersistentContext which opens the profile directly.
    // This reads the cookies from Chrome's SQLite DB via Chromium's own internals.
    console.log('[session-import] Launching Playwright with Chrome user data dir...');
    const context = await chromium.launchPersistentContext(CHROME_PROFILE_PATH, {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    browser = context.browser();

    // Extract storage state (cookies + localStorage)
    const storageState = await context.storageState();
    await context.close();

    // Filter to HEB cookies only
    const hebCookies = storageState.cookies.filter(c =>
      c.domain.includes('.heb.com') || c.domain.includes('heb.com')
    );

    if (hebCookies.length === 0) {
      return {
        success: false,
        cookieCount: 0,
        expiresAt: null,
        error: 'No HEB cookies found in Chrome profile. Please log in at heb-login.needexcelexpert.com first.',
      };
    }

    // Filter origins to HEB only
    const hebOrigins = storageState.origins.filter(o =>
      o.origin.includes('heb.com')
    );

    // Build Playwright storage state with only HEB data
    const hebState = {
      cookies: hebCookies,
      origins: hebOrigins,
    };

    // Find the earliest expiry for session duration estimate
    const sessionCookies = hebCookies.filter(c => c.expires && c.expires > 0);
    const earliestExpiry = sessionCookies.length > 0
      ? Math.min(...sessionCookies.map(c => c.expires))
      : null;
    const expiresAt = earliestExpiry
      ? new Date(earliestExpiry * 1000).toISOString()
      : null;

    // Write to the standard cookie path
    const cookiePath = path.resolve(config.browser.cookiePath);
    const cookieDir = path.dirname(cookiePath);
    if (!fs.existsSync(cookieDir)) {
      fs.mkdirSync(cookieDir, { recursive: true });
    }
    fs.writeFileSync(cookiePath, JSON.stringify(hebState, null, 2));

    console.log(`[session-import] Imported ${hebCookies.length} HEB cookies to ${cookiePath}`);
    console.log(`[session-import] Session expires: ${expiresAt || 'unknown'}`);

    return {
      success: true,
      cookieCount: hebCookies.length,
      expiresAt,
    };
  } catch (err) {
    console.error('[session-import] Import failed:', err.message);
    return {
      success: false,
      cookieCount: 0,
      expiresAt: null,
      error: err.message,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = { importSession };
```

**Step 3: Commit**

```bash
cd "C:\New Grocery App\heb-coupon-scraper"
git add src/session-import.js
git commit -m "feat: add session-import.js — extracts Kasm Chrome cookies to Playwright format"
```

---

### Task 6: Create `scraper-runner.js` (child process runner with SSE)

**Files:**
- Create: `C:\New Grocery App\heb-coupon-scraper\src\scraper-runner.js`

**Context:** The scraper endpoints (`/api/run-scraper`) need to execute `node src/index.js` (coupons) and/or `node src/scrape-frequent.js` (frequent products) as child processes, streaming stdout/stderr back via SSE. Only one job at a time.

**Step 1: Create scraper-runner.js**

Create `C:\New Grocery App\heb-coupon-scraper\src\scraper-runner.js`:

```javascript
/**
 * Scraper Runner — Executes scraper scripts as child processes
 * with stdout/stderr streaming for SSE delivery.
 *
 * Only one scraper job runs at a time. Callers get a job ID
 * to subscribe to SSE progress updates.
 */

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

// Active job state
let activeJob = null;

// SSE client registry: jobId → Set<response>
const scraperClients = new Map();

/**
 * Start a scraper job.
 *
 * @param {'coupons'|'frequent'|'both'} type - Which scraper(s) to run
 * @returns {{ jobId: string } | { error: string }}
 */
function startScraperJob(type) {
  if (activeJob && activeJob.status === 'running') {
    return { error: 'A scraper job is already running. Please wait for it to finish.' };
  }

  const jobId = crypto.randomUUID();
  const scripts = [];

  if (type === 'coupons' || type === 'both') {
    scripts.push({ name: 'coupons', cmd: 'node', args: ['src/index.js'] });
  }
  if (type === 'frequent' || type === 'both') {
    scripts.push({ name: 'frequent', cmd: 'node', args: ['src/scrape-frequent.js'] });
  }

  if (scripts.length === 0) {
    return { error: `Invalid type: ${type}. Must be "coupons", "frequent", or "both".` };
  }

  activeJob = {
    jobId,
    type,
    status: 'running',
    scripts,
    currentScript: 0,
    logs: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    results: {},
  };

  console.log(`[scraper-runner] Starting job ${jobId}: type=${type}, scripts=${scripts.map(s => s.name).join(', ')}`);

  // Run scripts sequentially
  runNextScript(jobId);

  return { jobId };
}

/**
 * Run the next script in the job's queue.
 */
function runNextScript(jobId) {
  const job = activeJob;
  if (!job || job.jobId !== jobId || job.status !== 'running') return;

  if (job.currentScript >= job.scripts.length) {
    // All scripts complete
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    broadcastScraperSSE(jobId, { type: 'complete', results: job.results });
    console.log(`[scraper-runner] Job ${jobId} complete:`, job.results);
    return;
  }

  const script = job.scripts[job.currentScript];
  console.log(`[scraper-runner] Running script: ${script.name} (${script.cmd} ${script.args.join(' ')})`);
  broadcastScraperSSE(jobId, { type: 'script_start', script: script.name });

  const cwd = path.resolve(__dirname, '..');
  const child = spawn(script.cmd, script.args, {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) {
      job.logs.push({ script: script.name, stream: 'stdout', line, ts: Date.now() });
      broadcastScraperSSE(jobId, { type: 'log', script: script.name, line });

      // Parse progress hints from scraper output
      const couponMatch = line.match(/Page (\d+)\/(\d+)/);
      if (couponMatch) {
        broadcastScraperSSE(jobId, {
          type: 'progress',
          script: script.name,
          current: parseInt(couponMatch[1]),
          total: parseInt(couponMatch[2]),
        });
      }
    }
  });

  child.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) {
      job.logs.push({ script: script.name, stream: 'stderr', line, ts: Date.now() });
      broadcastScraperSSE(jobId, { type: 'log', script: script.name, line, level: 'error' });
    }
  });

  child.on('close', (code) => {
    job.results[script.name] = { exitCode: code };
    broadcastScraperSSE(jobId, { type: 'script_end', script: script.name, exitCode: code });

    if (code !== 0) {
      console.error(`[scraper-runner] Script ${script.name} exited with code ${code}`);
      job.status = 'error';
      job.completedAt = new Date().toISOString();
      job.results[script.name].error = `Process exited with code ${code}`;
      broadcastScraperSSE(jobId, {
        type: 'error',
        script: script.name,
        message: `${script.name} scraper failed (exit code ${code})`,
      });
      return;
    }

    // Move to next script
    job.currentScript++;
    runNextScript(jobId);
  });

  child.on('error', (err) => {
    console.error(`[scraper-runner] Failed to start ${script.name}:`, err.message);
    job.status = 'error';
    job.completedAt = new Date().toISOString();
    job.results[script.name] = { error: err.message };
    broadcastScraperSSE(jobId, {
      type: 'error',
      script: script.name,
      message: `Failed to start ${script.name}: ${err.message}`,
    });
  });
}

/**
 * Broadcast an SSE event to all clients watching a scraper job.
 */
function broadcastScraperSSE(jobId, data) {
  const clients = scraperClients.get(jobId);
  if (!clients) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  }

  // Close all clients on terminal events
  if (data.type === 'complete' || data.type === 'error') {
    for (const client of clients) {
      try { client.end(); } catch {}
    }
    scraperClients.delete(jobId);
  }
}

/**
 * Register an SSE client for a scraper job.
 */
function registerScraperClient(jobId, res) {
  if (!scraperClients.has(jobId)) {
    scraperClients.set(jobId, new Set());
  }
  scraperClients.get(jobId).add(res);
}

/**
 * Remove an SSE client.
 */
function removeScraperClient(jobId, res) {
  const clients = scraperClients.get(jobId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) {
      scraperClients.delete(jobId);
    }
  }
}

/**
 * Get the current active job (or null).
 */
function getActiveScraperJob() {
  return activeJob;
}

module.exports = {
  startScraperJob,
  getActiveScraperJob,
  registerScraperClient,
  removeScraperClient,
};
```

**Step 2: Commit**

```bash
cd "C:\New Grocery App\heb-coupon-scraper"
git add src/scraper-runner.js
git commit -m "feat: add scraper-runner.js — child process executor with SSE streaming"
```

---

### Task 7: Add API routes to clip-server.js

**Files:**
- Modify: `C:\New Grocery App\heb-coupon-scraper\src\clip-server.js`

**Context:** Add three things to the existing clip-server:
1. Admin key middleware for protected endpoints
2. `POST /api/import-session` route
3. `POST /api/run-scraper` + `GET /api/scraper-progress/:jobId` routes
4. Enhanced `GET /api/health` response

**Step 1: Add imports at the top of clip-server.js**

After the existing imports (line 21), add:

```javascript
const { importSession } = require('./session-import');
const { startScraperJob, getActiveScraperJob, registerScraperClient, removeScraperClient } = require('./scraper-runner');
```

**Step 2: Add `X-Admin-Key` to CORS allowedHeaders**

Change line 45 from:
```javascript
  allowedHeaders: ['Content-Type', 'Accept'],
```
to:
```javascript
  allowedHeaders: ['Content-Type', 'Accept', 'X-Admin-Key'],
```

**Step 3: Add admin key middleware**

After the `app.use(express.json());` line (line 47), add:

```javascript
// Admin API key for protected endpoints (import-session, run-scraper)
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

function requireAdminKey(req, res, next) {
  if (!ADMIN_API_KEY) {
    return res.status(500).json({ error: 'ADMIN_API_KEY not configured on server' });
  }
  const provided = req.headers['x-admin-key'];
  if (!provided || provided !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing admin key' });
  }
  next();
}
```

**Step 4: Enhance GET /api/health**

Replace the existing `/api/health` handler (lines 58-77) with:

```javascript
app.get('/api/health', async (req, res) => {
  try {
    const { isSessionFileValid } = require('./auth');
    const path = require('path');
    const fs = require('fs');
    const sessionPath = path.resolve(config.browser.cookiePath);
    const sessionValid = isSessionFileValid(sessionPath);

    // Calculate session age
    let sessionAgeHours = null;
    let sessionExpiresIn = null;
    try {
      if (fs.existsSync(sessionPath)) {
        const stats = fs.statSync(sessionPath);
        sessionAgeHours = Math.round(((Date.now() - stats.mtimeMs) / (1000 * 60 * 60)) * 10) / 10;
        const maxAge = config.browser.sessionMaxAgeHours || 24;
        const remainingHours = maxAge - sessionAgeHours;
        if (remainingHours > 0) {
          const h = Math.floor(remainingHours);
          const m = Math.round((remainingHours - h) * 60);
          sessionExpiresIn = `${h}h ${m}m`;
        } else {
          sessionExpiresIn = 'expired';
        }
      }
    } catch {}

    // Get coupon count from DB
    let couponCount = null;
    try {
      await db.connect();
      const [rows] = await db.pool.execute('SELECT COUNT(*) as cnt FROM heb_coupons WHERE is_active = 1');
      couponCount = rows[0]?.cnt || 0;
    } catch {}

    // Get last scrape timestamp
    let lastScrapeAt = null;
    try {
      const [rows] = await db.pool.execute('SELECT MAX(last_seen) as latest FROM heb_coupons');
      lastScrapeAt = rows[0]?.latest || null;
    } catch {}

    const scraperJob = getActiveScraperJob();

    res.json({
      status: 'ok',
      sessionValid,
      sessionAgeHours,
      sessionExpiresIn,
      lastScrapeAt,
      couponCount,
      activeJobs: Array.from(jobs.entries())
        .filter(([, job]) => job.status === 'running')
        .length,
      activeScraperJob: scraperJob && scraperJob.status === 'running'
        ? { jobId: scraperJob.jobId, type: scraperJob.type, startedAt: scraperJob.startedAt }
        : null,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});
```

**Step 5: Add POST /api/import-session route**

Insert after the enhanced health endpoint:

```javascript
/**
 * POST /api/import-session — Import cookies from Kasm Chrome into Playwright format
 * Protected by admin API key.
 */
app.post('/api/import-session', requireAdminKey, async (req, res) => {
  try {
    console.log('[clip-server] Import session requested');
    const result = await importSession();
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    console.error('[clip-server] Import session error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
```

**Step 6: Add POST /api/run-scraper and GET /api/scraper-progress/:jobId routes**

Insert after the import-session route:

```javascript
/**
 * POST /api/run-scraper — Start a scraper job (coupons, frequent, or both)
 * Body: { type: "coupons" | "frequent" | "both" }
 * Protected by admin API key.
 */
app.post('/api/run-scraper', requireAdminKey, async (req, res) => {
  const { type = 'both' } = req.body || {};

  console.log(`[clip-server] Run scraper requested: type=${type}`);
  const result = startScraperJob(type);

  if (result.error) {
    return res.status(409).json({ error: result.error });
  }

  res.json({ jobId: result.jobId });
});

/**
 * GET /api/scraper-progress/:jobId — SSE stream for scraper job progress
 */
app.get('/api/scraper-progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = getActiveScraperJob();

  if (!job || job.jobId !== jobId) {
    return res.status(404).json({ error: 'Scraper job not found' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send historical logs
  for (const log of job.logs) {
    res.write(`data: ${JSON.stringify({ type: 'log', script: log.script, line: log.line })}\n\n`);
  }

  // If already done, send terminal event
  if (job.status === 'completed') {
    res.write(`data: ${JSON.stringify({ type: 'complete', results: job.results })}\n\n`);
    res.end();
    return;
  }
  if (job.status === 'error') {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Scraper job failed' })}\n\n`);
    res.end();
    return;
  }

  // Register for live updates
  registerScraperClient(jobId, res);

  req.on('close', () => {
    removeScraperClient(jobId, res);
  });
});
```

**Step 7: Commit**

```bash
cd "C:\New Grocery App\heb-coupon-scraper"
git add src/clip-server.js
git commit -m "feat: add import-session, run-scraper, enhanced health endpoints to clip-server"
```

---

### Task 8: Rebuild and restart clip-server Docker container

**Step 1: Rebuild**

```bash
cd "C:\hsa-automation"
docker compose build heb-clip-server
```

**Step 2: Restart**

```bash
cd "C:\hsa-automation"
docker compose up -d heb-clip-server
```

**Step 3: Verify health endpoint returns new fields**

```bash
curl -s http://localhost:3847/api/health | node -e "process.stdin.on('data',d=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
```

Expected: Response includes `sessionAgeHours`, `sessionExpiresIn`, `lastScrapeAt`, `couponCount`, `activeScraperJob` fields.

**Step 4: Verify import-session rejects without admin key**

```bash
curl -s -X POST http://localhost:3847/api/import-session
```

Expected: `{"error":"Invalid or missing admin key"}` (401)

---

## Phase 3: Frontend — Session Manager UI

### Task 9: Add new endpoint URLs to api.js

**Files:**
- Modify: `C:\New Grocery App\grocery-checklist-app\src\config\api.js`

**Step 1: Add session manager endpoints**

After the existing clip server endpoints (after line 56, `clipServerProgress`), add:

```javascript
  // Session Manager — remote HEB login
  clipServerHealth: `${CLIP_SERVER_URL}/api/health`,
  importSession: `${CLIP_SERVER_URL}/api/import-session`,
  runScraper: `${CLIP_SERVER_URL}/api/run-scraper`,
  scraperProgress: `${CLIP_SERVER_URL}/api/scraper-progress`,
```

**Step 2: Commit**

```bash
cd "C:\New Grocery App\grocery-checklist-app"
git add src/config/api.js
git commit -m "feat: add session manager endpoint URLs to api.js"
```

---

### Task 10: Create SessionManager React component

**Files:**
- Create: `C:\New Grocery App\grocery-checklist-app\src\components\SessionManager.js`

**Context:** This is the main UI for remote session management. It shows:
- Session status card (green/yellow/red indicator)
- Three action buttons: "Open HEB Login", "Import Session", "Run Scraper"
- Smart guidance (highlight active step, dim irrelevant ones)
- Admin key entry (stored in localStorage after first use)
- SSE progress for scraper

**Step 1: Create the component**

Create `C:\New Grocery App\grocery-checklist-app\src\components\SessionManager.js`:

```jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Monitor, Download, Play, CheckCircle2, AlertTriangle, XCircle, Loader2, Key, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { ENDPOINTS, apiFetch } from '../config/api';

const HEB_LOGIN_URL = 'https://heb-login.needexcelexpert.com';

// Admin key stored in localStorage
const ADMIN_KEY_STORAGE = 'heb_admin_key';

function SessionManager({ onBack }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [scraperRunning, setScraperRunning] = useState(false);
  const [scraperLogs, setScraperLogs] = useState([]);
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem(ADMIN_KEY_STORAGE) || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const logsEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  // Fetch health status
  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiFetch(ENDPOINTS.clipServerHealth, { timeout: 10000 });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else {
        setHealth(null);
      }
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => {
      clearInterval(interval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [fetchHealth]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scraperLogs]);

  const getAdminKey = () => {
    if (adminKey) return adminKey;
    setShowKeyInput(true);
    return null;
  };

  const saveAdminKey = (key) => {
    setAdminKey(key);
    localStorage.setItem(ADMIN_KEY_STORAGE, key);
    setShowKeyInput(false);
  };

  // --- Actions ---

  const handleOpenLogin = () => {
    window.open(HEB_LOGIN_URL, '_blank');
  };

  const handleImportSession = async () => {
    const key = getAdminKey();
    if (!key) return;

    setImporting(true);
    try {
      const res = await apiFetch(ENDPOINTS.importSession, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': key,
        },
        timeout: 60000,
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`Session imported! ${data.cookieCount} cookies. Valid for ~24h.`);
        await fetchHealth();
      } else {
        toast.error(data.error || 'Import failed');
        if (res.status === 401) {
          localStorage.removeItem(ADMIN_KEY_STORAGE);
          setAdminKey('');
          setShowKeyInput(true);
        }
      }
    } catch (err) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleRunScraper = async (type = 'both') => {
    const key = getAdminKey();
    if (!key) return;

    setScraperRunning(true);
    setScraperLogs([]);

    try {
      const res = await apiFetch(ENDPOINTS.runScraper, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': key,
        },
        body: JSON.stringify({ type }),
        timeout: 15000,
      });

      if (res.status === 401) {
        localStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
        setShowKeyInput(true);
        setScraperRunning(false);
        toast.error('Invalid admin key');
        return;
      }

      const data = await res.json();

      if (data.error) {
        toast.error(data.error);
        setScraperRunning(false);
        return;
      }

      // Connect SSE for progress
      const progressUrl = `${ENDPOINTS.scraperProgress}/${data.jobId}`;
      const eventSource = new EventSource(progressUrl);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'log') {
          setScraperLogs(prev => [...prev, msg]);
        } else if (msg.type === 'script_start') {
          setScraperLogs(prev => [...prev, { type: 'info', line: `Starting ${msg.script} scraper...` }]);
        } else if (msg.type === 'script_end') {
          setScraperLogs(prev => [...prev, {
            type: 'info',
            line: `${msg.script} scraper finished (exit code ${msg.exitCode})`,
          }]);
        } else if (msg.type === 'complete') {
          toast.success('Scraper complete!');
          setScraperRunning(false);
          eventSource.close();
          fetchHealth();
        } else if (msg.type === 'error') {
          toast.error(msg.message || 'Scraper failed');
          setScraperRunning(false);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setScraperRunning(false);
        eventSource.close();
      };
    } catch (err) {
      toast.error(`Failed to start scraper: ${err.message}`);
      setScraperRunning(false);
    }
  };

  // --- Session status helpers ---

  const getSessionStatus = () => {
    if (!health) return 'unknown';
    if (!health.sessionValid) return 'expired';
    if (health.sessionAgeHours > 20) return 'expiring';
    return 'valid';
  };

  const sessionStatus = getSessionStatus();

  const statusConfig = {
    valid: { color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2, label: 'Session Active' },
    expiring: { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle, label: 'Expiring Soon' },
    expired: { color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: XCircle, label: 'Session Expired' },
    unknown: { color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', icon: AlertTriangle, label: 'Server Unreachable' },
  };

  const status = statusConfig[sessionStatus];
  const StatusIcon = status.icon;

  // --- Determine which step to highlight ---
  const activeStep = sessionStatus === 'expired' || sessionStatus === 'unknown' ? 1
    : health && !health.sessionValid ? 1
    : 2; // session valid → highlight "Run Scraper"

  // --- Render ---

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-slate-900">Session Manager</h1>
          <p className="text-sm text-slate-500">Remote HEB login & scraper control</p>
        </div>
      </div>

      {/* Admin Key Input Modal */}
      {showKeyInput && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold">Admin Key Required</h2>
            </div>
            <p className="text-sm text-slate-500">Enter the admin API key to access server controls. This is saved locally.</p>
            <input
              type="password"
              autoFocus
              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Enter admin key..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  saveAdminKey(e.target.value.trim());
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowKeyInput(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const input = document.querySelector('input[type="password"]');
                  if (input?.value.trim()) saveAdminKey(input.value.trim());
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Status Card */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : (
        <div className={`rounded-2xl border p-4 ${status.bg}`}>
          <div className="flex items-center gap-3 mb-3">
            <StatusIcon className={`w-6 h-6 ${status.color}`} />
            <div>
              <p className={`font-semibold ${status.color}`}>{status.label}</p>
              {health?.sessionExpiresIn && health.sessionValid && (
                <p className="text-xs text-slate-500">Expires in {health.sessionExpiresIn}</p>
              )}
            </div>
          </div>
          {health && (
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              {health.couponCount != null && (
                <div>Coupons: <span className="font-medium">{health.couponCount}</span></div>
              )}
              {health.lastScrapeAt && (
                <div>Last scrape: <span className="font-medium">{new Date(health.lastScrapeAt).toLocaleDateString()}</span></div>
              )}
              {health.sessionAgeHours != null && (
                <div>Session age: <span className="font-medium">{health.sessionAgeHours}h</span></div>
              )}
              {health.activeJobs != null && (
                <div>Active jobs: <span className="font-medium">{health.activeJobs}</span></div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 1: Open HEB Login */}
      <div className={`rounded-2xl border p-4 transition-all ${activeStep === 1 ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${activeStep === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
            1
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Open HEB Login</h3>
            <p className="text-sm text-slate-500 mt-0.5">Opens remote Chrome browser. Complete hCaptcha and log in.</p>
            <button
              onClick={handleOpenLogin}
              className={`mt-3 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeStep === 1
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Monitor className="w-4 h-4" />
              Open HEB Login
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Step 2: Import Session */}
      <div className={`rounded-2xl border p-4 transition-all ${activeStep === 2 && !health?.sessionValid ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${activeStep >= 2 && !health?.sessionValid ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
            2
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Import Session</h3>
            <p className="text-sm text-slate-500 mt-0.5">Pull cookies from the remote browser into the scraper.</p>
            <button
              onClick={handleImportSession}
              disabled={importing}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {importing ? 'Importing...' : 'Import Session'}
            </button>
          </div>
        </div>
      </div>

      {/* Step 3: Run Scraper */}
      <div className={`rounded-2xl border p-4 transition-all ${activeStep === 2 && health?.sessionValid ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${activeStep === 2 && health?.sessionValid ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
            3
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Run Scraper</h3>
            <p className="text-sm text-slate-500 mt-0.5">Scrape coupons and frequently purchased products.</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleRunScraper('both')}
                disabled={scraperRunning || !health?.sessionValid}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  health?.sessionValid && !scraperRunning
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {scraperRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {scraperRunning ? 'Running...' : 'Run Both'}
              </button>
              <button
                onClick={() => handleRunScraper('coupons')}
                disabled={scraperRunning || !health?.sessionValid}
                className="inline-flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Coupons Only
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scraper Logs */}
      {scraperLogs.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 max-h-64 overflow-y-auto">
          <p className="text-xs font-medium text-slate-400 mb-2">Scraper Output</p>
          <div className="font-mono text-xs space-y-0.5">
            {scraperLogs.map((log, i) => (
              <div key={i} className={log.level === 'error' ? 'text-red-400' : log.type === 'info' ? 'text-blue-400' : 'text-slate-300'}>
                {log.line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Quick links after everything is ready */}
      {health?.sessionValid && health?.couponCount > 0 && !scraperRunning && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-sm font-medium text-emerald-800">Ready to go!</p>
          <p className="text-xs text-emerald-600 mt-1">Session active, {health.couponCount} coupons available.</p>
          {onBack && (
            <button
              onClick={onBack}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              Go to Deals
            </button>
          )}
        </div>
      )}

      {/* Admin key management */}
      <div className="text-center">
        <button
          onClick={() => setShowKeyInput(true)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          {adminKey ? 'Change admin key' : 'Set admin key'}
        </button>
      </div>
    </div>
  );
}

export default SessionManager;
```

**Step 2: Commit**

```bash
cd "C:\New Grocery App\grocery-checklist-app"
git add src/components/SessionManager.js
git commit -m "feat: add SessionManager component — remote HEB login & scraper UI"
```

---

### Task 11: Add SessionManager to App.js routing

**Files:**
- Modify: `C:\New Grocery App\grocery-checklist-app\src\components\App.js`

**Step 1: Add import**

After the existing imports (around line 20, after `import FeedbackFAB from "./FeedbackFAB";`), add:

```javascript
import SessionManager from "./SessionManager";
```

**Step 2: Add "session-manager" to VALID_SCREENS**

In the `VALID_SCREENS` array (line 27-33), add `"session-manager"` to the legacy IDs section:

```javascript
const VALID_SCREENS = [
  // New flow screens
  "home", "plan", "deals", "cart", "shop", "cook",
  // Legacy IDs — still routable for internal navigation during phased migration
  "grocery", "chatbot", "meal-creator", "recipe-ingredients", "recipe-instructions",
  "in-store", "coupons", "heb-cart", "smart-deals", "session-manager",
];
```

**Step 3: Add case in renderScreen()**

Inside the `switch (currentScreen)` block, add a new case before the `default:` (before line 277):

```javascript
      // --- Session Manager (admin) ---
      case "session-manager":
        return (
          <SessionManager
            onBack={() => navigateToScreen("deals")}
          />
        );
```

**Step 4: Commit**

```bash
cd "C:\New Grocery App\grocery-checklist-app"
git add src/components/App.js
git commit -m "feat: add session-manager route to App.js"
```

---

### Task 12: Add Session Manager entry point to Deals screen

**Files:**
- Modify: `C:\New Grocery App\grocery-checklist-app\src\components\Deals.js`

**Context:** The Session Manager is accessed from the Deals screen. Add a small settings/admin button that navigates to `#session-manager`. This gives the user a discoverable entry point without cluttering the main navigation.

**Step 1: Read the Deals component to find the right insertion point**

Read `Deals.js` and find the header area where a settings button can be added.

**Step 2: Add the button**

Add a small gear/settings icon button in the Deals header that navigates to `#session-manager`:

```jsx
import { Settings } from 'lucide-react';
// ... in the header area:
<button
  onClick={() => onNavigate('session-manager')}
  className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
  title="Session Manager"
>
  <Settings className="w-5 h-5 text-slate-400" />
</button>
```

The exact location depends on the Deals.js layout — look for the header `<div>` and add the button there.

**Step 3: Commit**

```bash
cd "C:\New Grocery App\grocery-checklist-app"
git add src/components/Deals.js
git commit -m "feat: add Session Manager button to Deals header"
```

---

## Phase 4: Integration Testing

### Task 13: End-to-end verification

**Step 1: Verify all containers are running**

```bash
cd "C:\hsa-automation"
docker compose ps
```

Expected: `heb-clip-server`, `heb-remote-browser`, `heb-cloudflared` all running.

**Step 2: Test the full flow locally**

1. Open `http://localhost:3000/#session-manager` (or navigate from Deals)
2. Verify session status card loads (should show current session state)
3. Click "Open HEB Login" — should open `https://heb-login.needexcelexpert.com` in new tab
4. In the Kasm browser: navigate to heb.com and log in (complete hCaptcha)
5. Back in the app: click "Import Session" — should show success toast
6. Click "Run Scraper" — should show SSE progress logs, then completion toast
7. Verify health endpoint shows updated coupon count

**Step 3: Test from phone (production)**

1. Open `https://grocery-checklist-app.netlify.app/#session-manager`
2. Enter admin key when prompted (one-time)
3. Repeat the same flow — should work identically via Cloudflare tunnel

**Step 4: Test error cases**

- Import with wrong admin key → should show "Invalid admin key" and re-prompt
- Run scraper with expired session → button should be disabled
- Run scraper while another is running → should show "already running" error

---

## Phase 5: Docker Compose Update (rebuild everything together)

### Task 14: Final docker compose rebuild

If any changes were made during testing:

```bash
cd "C:\hsa-automation"
docker compose build heb-clip-server
docker compose up -d
```

Verify all services healthy:

```bash
docker compose ps
curl -s http://localhost:3847/api/health | node -e "process.stdin.on('data',d=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
```

---

## Summary of All Files

| File | Action | Purpose |
|------|--------|---------|
| `C:\hsa-automation\.env` | Modify | Add `HEB_VNC_PASSWORD`, `ADMIN_API_KEY` |
| `C:\hsa-automation\docker-compose.yaml` | Modify | Add `heb-remote-browser` service, `heb_chrome_profile` volume, `ADMIN_API_KEY` env to clip-server, Chrome profile mount to clip-server |
| `C:\hsa-automation\cloudflared\config.yml` | Modify | Add `heb-login.needexcelexpert.com` ingress route |
| `C:\New Grocery App\heb-coupon-scraper\src\session-import.js` | Create | Cookie extraction from Kasm Chrome → Playwright format |
| `C:\New Grocery App\heb-coupon-scraper\src\scraper-runner.js` | Create | Child process runner with SSE streaming |
| `C:\New Grocery App\heb-coupon-scraper\src\clip-server.js` | Modify | Add admin key middleware, `/api/import-session`, `/api/run-scraper`, `/api/scraper-progress/:jobId`, enhanced `/api/health` |
| `C:\New Grocery App\grocery-checklist-app\src\config\api.js` | Modify | Add session manager endpoint URLs |
| `C:\New Grocery App\grocery-checklist-app\src\components\SessionManager.js` | Create | React UI for remote session management |
| `C:\New Grocery App\grocery-checklist-app\src\components\App.js` | Modify | Add `session-manager` to routing |
| `C:\New Grocery App\grocery-checklist-app\src\components\Deals.js` | Modify | Add Session Manager settings button |
