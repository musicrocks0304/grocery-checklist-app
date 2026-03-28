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

If any are down, alert the user and offer to start them with `docker start <name>`. Do NOT proceed until infrastructure is confirmed healthy.

### 2. Check HEB Session
Read the session file at `C:\New Grocery App\heb-coupon-scraper\cookies\heb-session.json` and check cookie expiration. Key cookies to check: `_session`, `sat`, `sst`.

Run this check:
```bash
cd "C:/New Grocery App/heb-coupon-scraper" && node -e "
const fs=require('fs');
const s=JSON.parse(fs.readFileSync('cookies/heb-session.json','utf8'));
const cookies=s.cookies||[];
const now=Date.now()/1000;
const key=['_session','sat','sst'];
const expired=cookies.filter(c=>key.includes(c.name)&&c.expires>0&&c.expires<now);
if(expired.length) { console.log('EXPIRED:', expired.map(c=>c.name).join(', ')); process.exit(1); }
else { console.log('Session valid'); cookies.filter(c=>key.includes(c.name)&&c.expires>0).forEach(c=>console.log(c.name,'expires',new Date(c.expires*1000).toLocaleDateString())); }
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

### 5. Summary
After all steps complete, show a summary:
- Infrastructure status
- HEB session status
- Frequently purchased: X new, Y updated
- Coupons: X new, Y updated
- "Ready to shop!"
