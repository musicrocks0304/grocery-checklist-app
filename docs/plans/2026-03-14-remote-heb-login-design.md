# Remote HEB Login & Scraper Control

**Date**: 2026-03-14
**Status**: Approved
**Problem**: HEB login requires hCaptcha (human interaction) on the home PC. When traveling, there's no way to refresh the session, run the scraper, or manage the weekly coupon pipeline remotely.

## Goal

Enable the full weekly coupon workflow (login, scrape, clip, cart) from any device, anywhere, with minimal steps and nothing to memorize.

## Architecture

```
Phone/laptop (anywhere)
  -> grocery app (Netlify) -> Session Manager UI
       |
       +--> "Open HEB Login" -> heb-login.needexcelexpert.com (Cloudflare tunnel)
       |        -> Kasm Chrome container (VNC in browser)
       |        -> User completes hCaptcha manually
       |
       +--> "Import Session" -> clip.needexcelexpert.com/api/import-session
       |        -> Reads Chrome cookies from shared volume
       |        -> Converts to Playwright storage state format
       |        -> Writes to /app/cookies/heb-session.json
       |
       +--> "Run Scraper" -> clip.needexcelexpert.com/api/run-scraper
                -> Executes coupon scraper + frequent products
                -> SSE progress stream back to UI
```

## Components

### 1. Kasm Chrome Container (`heb-remote-browser`)

Docker service added to `C:\hsa-automation\docker-compose.yaml`:

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

- Real Google Chrome + KasmVNC + web client in one image
- `shm_size: 512m` prevents Chrome crashes on heavy pages
- Cookies volume shared with clip-server (same bind mount)
- Chrome profile persisted in named volume (stays logged in between container restarts)
- Accessible via `https://heb-login.needexcelexpert.com` (Cloudflare tunnel)

### 2. Cloudflare Tunnel Route

Add to existing `heb-cloudflared` tunnel config (`C:\hsa-automation\cloudflared\config.yml`):

```yaml
- hostname: heb-login.needexcelexpert.com
  service: https://heb-remote-browser:6901
  originRequest:
    noTLSVerify: true
```

DNS CNAME record: `heb-login.needexcelexpert.com` -> tunnel UUID.

Optional: Cloudflare Access policy requiring email OTP before reaching VNC.

### 3. Cookie Import Endpoint (`POST /api/import-session`)

New route on clip-server (`src/clip-server.js`):

- Reads Chrome's cookie SQLite database from the shared volume (`/cookies/` or the Chrome profile)
- Filters to `.heb.com` domain cookies
- Converts to Playwright storage state JSON format (`{ cookies: [...], origins: [...] }`)
- Writes to `/app/cookies/heb-session.json`
- Returns `{ success: true, cookieCount, expiresAt }`
- Protected by `X-Admin-Key` header (shared secret from `.env`)

**Chrome cookie DB location**: The Kasm Chrome profile stores cookies in a SQLite file at a known path. The `better-sqlite3` npm package (or a simpler approach: launch a quick Playwright context against the Chrome profile to extract cookies via `context.storageState()`).

**Simpler alternative**: Instead of reading SQLite directly, the import endpoint could:
1. Launch Playwright with the Kasm Chrome's user data dir
2. Call `context.storageState()` to get the full Playwright-format JSON
3. Write to `heb-session.json`

This reuses existing Playwright infrastructure and avoids SQLite dependencies.

### 4. Scraper Trigger Endpoint (`POST /api/run-scraper`)

New route on clip-server:

- Accepts `{ type: "coupons" | "frequent" | "both" }`
- Runs `node src/index.js` (coupons) and/or `node src/scrape-frequent.js` (frequent products) as child processes
- Streams stdout/stderr back to client via SSE (same pattern as clip progress)
- Only one scraper job at a time (rejects if already running)
- Protected by `X-Admin-Key` header
- Returns job summary on completion

### 5. Session Manager UI (React)

New section in the existing grocery app, accessible from settings/admin area:

**Session Status Card:**
- Shows current session age (from `/api/health` enhanced response)
- Green/yellow/red indicator: valid (< 20h) / expiring soon (20-24h) / expired
- Last scrape timestamp + coupon count

**Action Buttons:**
- **"Open HEB Login"** — Opens `heb-login.needexcelexpert.com` in new tab
- **"Import Session"** — POST to `/api/import-session`, shows success/failure toast
- **"Run Scraper"** — POST to `/api/run-scraper`, shows SSE progress bar with coupon count

**Smart guidance:**
- If session expired: highlight "Open HEB Login" button, dim others
- After import: auto-enable "Run Scraper"
- After scraper completes: show "Ready! Go to Deals" link

### 6. Enhanced Health Endpoint

Extend existing `GET /api/health` response:

```json
{
  "status": "ok",
  "sessionValid": true,
  "sessionAgeHours": 4.2,
  "sessionExpiresIn": "19h 48m",
  "lastScrapeAt": "2026-03-14T06:00:00Z",
  "couponCount": 748,
  "activeJobs": 0
}
```

## Security

- **VNC password**: Required to access Kasm browser (set via `HEB_VNC_PASSWORD` in `.env`)
- **Cloudflare Access** (optional): Email OTP or Google SSO before reaching VNC page
- **Admin API key**: `X-Admin-Key` header on import-session and run-scraper endpoints (set via `ADMIN_API_KEY` in `.env`). React app stores in localStorage after first entry.
- **No HEB credentials exposed**: Login happens in the remote browser, cookies extracted server-side
- **Ephemeral browser state**: Chrome profile can be wiped without affecting the rest of the system

## Remote Workflow (User Perspective)

1. Open grocery app -> Session Manager -> see "Session expired" (red)
2. Tap **"Open HEB Login"** -> Kasm browser opens in new tab -> complete hCaptcha + login
3. Back in grocery app -> tap **"Import Session"** -> "Session imported! Valid for 24h" (green)
4. Tap **"Run Scraper"** -> progress bar -> "748 coupons scraped, 142 frequent products cached"
5. Use app normally: Deals, Clip, Cart, Shop

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `docker-compose.yaml` | Modify | Add `heb-remote-browser` service + volume |
| `cloudflared/config.yml` | Modify | Add `heb-login` hostname route |
| `.env` | Modify | Add `HEB_VNC_PASSWORD`, `ADMIN_API_KEY` |
| `clip-server.js` | Modify | Add `/api/import-session`, `/api/run-scraper`, enhance `/api/health` |
| `src/session-import.js` | Create | Cookie extraction + Playwright conversion logic |
| `src/scraper-runner.js` | Create | Child process runner with SSE streaming |
| `src/components/SessionManager.js` | Create | React UI for session management |
| `src/config/api.js` | Modify | Add new endpoint URLs |
| `src/components/App.js` | Modify | Add SessionManager to navigation/routing |

## Not In Scope

- Automated hCaptcha solving (not possible — requires human)
- Session auto-refresh (HEB enforces 24h TTL server-side)
- Multiple user support (single HEB account)
