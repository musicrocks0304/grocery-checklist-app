# Grocery Prep

Prepare everything for weekly grocery shopping. Run through each step sequentially, reporting status as you go. If any step fails, pause and ask before continuing.

## Steps

### 1. Check Docker Infrastructure
Run `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"` and verify these containers are running:
- **heb-clip-server** (coupon clipping server)
- **heb-cloudflared** (Cloudflare tunnel)
- **hsa-processor** (n8n workflows)
- **hsa-mysql** (MySQL database)
- **hsa-postgres** (Postgres database)

If Docker Desktop isn't running, offer to launch it: `"/c/Program Files/Docker/Docker/Docker Desktop.exe" &` then wait ~60s and re-check.

If specific containers are down, offer to start them with `docker start <name>`. Do NOT proceed until infrastructure is confirmed healthy.

### 2. Check HEB Session
The scraper checks **file age** (not cookie expiry). Run this check:
```bash
cd "C:/New Grocery App/heb-coupon-scraper" && node -e "
const config = require('./src/config');
const { isSessionFileValid } = require('./src/auth');
const fs = require('fs');
const path = require('path');
const cookiePath = path.resolve(config.browser.cookiePath);
if (!fs.existsSync(cookiePath)) { console.log('NO SESSION FILE'); process.exit(1); }
const stats = fs.statSync(cookiePath);
const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
const maxAge = config.browser.sessionMaxAgeHours;
const valid = isSessionFileValid(cookiePath);
console.log('File age:', Math.round(ageHours), 'hours (max:', maxAge, 'hours)');
console.log('Last modified:', new Date(stats.mtimeMs).toLocaleString());
console.log('Status:', valid ? 'VALID' : 'EXPIRED');
if (!valid) process.exit(1);
"
```

If the session is expired or the file doesn't exist, ask the user: "HEB session is expired. Want me to open the login browser?" If yes, run `cd "C:/New Grocery App/heb-coupon-scraper" && npm run scrape:login` (with a 5-minute timeout, run in background so the user can interact with the browser).

Wait for login to complete before proceeding.

### 3. Scrape Frequently Purchased Items
```bash
cd "C:/New Grocery App/heb-coupon-scraper" && npm run scrape:frequent
```
Run with a 5-minute timeout. Report the count of new/updated products when done.

### 4. Scrape Fresh Coupons
```bash
cd "C:/New Grocery App/heb-coupon-scraper" && npm run scrape
```
Run with a 10-minute timeout (this one takes about a minute). Report the count of new/updated coupons when done.

### 5. Start Clip Server Session
Start a browser session on the clip server so coupons can be clipped from the app:
```bash
curl -s -X POST http://localhost:3847/api/heb/session/start
```
Confirm it returns `"status":"active"` and report the timeout duration.

### 6. Summary
After all steps complete, show a summary:
- Infrastructure status
- HEB session status
- Frequently purchased: X new, Y updated
- Coupons: X new, Y updated
- Clip server: session active, X min timeout
- "Ready to shop!"
