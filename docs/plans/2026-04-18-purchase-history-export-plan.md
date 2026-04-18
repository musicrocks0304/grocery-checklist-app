# HEB Purchase History Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-shot Node script that scrapes all HEB order history into `heb_purchase_history` and exports a per-product frequency CSV.

**Architecture:** Standalone script in `heb-coupon-scraper/src/` modeled after [scrape-frequent.js](../../../heb-coupon-scraper/src/scrape-frequent.js). Reuses existing `getOrderHistory()` + `getOrderDetails()` from [cart-manager.js](../../../heb-coupon-scraper/src/cart-manager.js) and the mysql2 pool in [database.js](../../../heb-coupon-scraper/src/database.js). Idempotent via `INSERT IGNORE` + pre-scrape dedupe.

**Tech Stack:** Node.js, Playwright, mysql2, Node `fs` (no new dependencies).

**Note on testing:** Design deliberately skips automated tests (see [design doc](2026-04-18-purchase-history-export-design.md#testing)). Each task ends with a manual verification step instead of unit tests. This is a throwaway analysis tool.

**Repo location:** All changes in `C:\New Grocery App\heb-coupon-scraper\` (separate repo from grocery-checklist-app).

---

## File Structure

- **Create:** `C:\New Grocery App\heb-coupon-scraper\src\scrape-purchase-history.js` — main script
- **Modify:** `C:\New Grocery App\heb-coupon-scraper\package.json` — add `scrape:history` script
- **Create:** `C:\New Grocery App\heb-coupon-scraper\exports\.gitkeep` — export directory
- **Modify:** `C:\New Grocery App\heb-coupon-scraper\.gitignore` — ignore `exports/*.csv`

---

## Task 1: Script skeleton with npm wiring

Creates a runnable script that connects to DB, launches browser, and exits cleanly. No business logic yet — just the scaffolding, following the `scrape-frequent.js` pattern so we know the existing auth/config plumbing works.

**Files:**
- Create: `C:\New Grocery App\heb-coupon-scraper\src\scrape-purchase-history.js`
- Modify: `C:\New Grocery App\heb-coupon-scraper\package.json`

- [ ] **Step 1.1: Create script skeleton**

```javascript
#!/usr/bin/env node
/**
 * HEB Purchase History Scraper
 *
 * Walks the full order history, fetches per-order details, persists to
 * heb_purchase_history, and exports an aggregated per-product CSV sorted
 * by purchase frequency.
 *
 * Usage: npm run scrape:history
 */

const config = require('./config');
const { createBrowserContext, isSessionFileValid, saveSession } = require('./auth');
const { getOrderHistory, getOrderDetails } = require('./cart-manager');
const Database = require('./database');
const fs = require('fs');
const path = require('path');

const HEADFUL = process.argv.includes('--headful');
const MAX_PAGES = 999; // safety cap; getOrderHistory breaks on last page
const BETWEEN_ORDERS_MS = 5000;
const JITTER_MS = 3000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const startTime = Date.now();
  console.log('[scrape-history] Starting purchase history scrape...');
  console.log(`[scrape-history] Mode: ${HEADFUL ? 'headful' : 'headless'}`);

  // Check session
  const cookiePath = path.resolve(config.browser.cookiePath);
  if (!isSessionFileValid(cookiePath)) {
    console.error('[scrape-history] HEB session expired! Run `npm run scrape:login` first.');
    process.exit(1);
  }

  let browser = null;
  const db = new Database(config.db);

  try {
    // Connect DB
    await db.connect();
    console.log('[scrape-history] Database connected');

    // Launch browser
    console.log('[scrape-history] Launching browser...');
    const ctx = await createBrowserContext({ headless: !HEADFUL });
    browser = ctx.browser;
    const page = ctx.page;

    // TODO Task 2: list orders
    // TODO Task 3: fetch details + insert
    // TODO Task 4: aggregate + CSV

    await saveSession(ctx.context);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[scrape-history] Done in ${elapsed}s`);
  } catch (err) {
    console.error('[scrape-history] Fatal error:', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    await db.disconnect();
  }
}

main();
```

- [ ] **Step 1.2: Add npm script**

Edit `package.json`, add to the `scripts` block (after `scrape:frequent:debug`):

```json
    "scrape:history": "node src/scrape-purchase-history.js",
    "scrape:history:debug": "node src/scrape-purchase-history.js --headful",
```

- [ ] **Step 1.3: Manual verification**

From `C:\New Grocery App\heb-coupon-scraper\`:

```bash
npm run scrape:history
```

Expected output:
- `[scrape-history] Starting purchase history scrape...`
- `[scrape-history] Database connected`
- `[scrape-history] Launching browser...`
- `[scrape-history] Done in Xs`
- Exit code 0

If session is expired, expect exit code 1 with "HEB session expired" — run `npm run scrape:login` and re-verify.

- [ ] **Step 1.4: Commit**

```bash
cd "C:\New Grocery App\heb-coupon-scraper"
git add src/scrape-purchase-history.js package.json
git commit -m "feat: scaffold purchase history scraper"
```

---

## Task 2: Walk order history with dedupe filter

Adds order-list scraping using `getOrderHistory()`. Filters out orders already in `heb_purchase_history` so re-runs are idempotent.

**Files:**
- Modify: `C:\New Grocery App\heb-coupon-scraper\src\scrape-purchase-history.js`

- [ ] **Step 2.1: Add helper to load already-scraped order IDs**

Insert above `async function main()`:

```javascript
async function loadExistingOrderIds(db) {
  const [rows] = await db.pool.execute(
    'SELECT heb_order_id FROM heb_purchase_history'
  );
  return new Set(rows.map(r => r.heb_order_id));
}
```

- [ ] **Step 2.2: Replace the `TODO Task 2` line with order-list logic**

Replace:

```javascript
    // TODO Task 2: list orders
```

With:

```javascript
    // List all orders
    const existing = await loadExistingOrderIds(db);
    console.log(`[scrape-history] ${existing.size} orders already in DB (will skip)`);

    const listResult = await getOrderHistory(page, { maxPages: MAX_PAGES });
    if (!listResult.success) {
      if (listResult.error === 'NAVIGATION_BLOCKED' || listResult.error === 'NO_DATA') {
        console.error('[scrape-history] HEB session expired — run `npm run scrape:login` and retry.');
        process.exit(1);
      }
      throw new Error(`getOrderHistory failed: ${listResult.error} — ${listResult.message}`);
    }

    const allOrders = listResult.orders;
    const newOrders = allOrders.filter(o => !existing.has(o.orderId));
    console.log(`[scrape-history] Found ${allOrders.length} total orders, ${newOrders.length} new to fetch`);

    if (newOrders.length === 0) {
      console.log('[scrape-history] Nothing new to scrape. Skipping to aggregation.');
    }
```

- [ ] **Step 2.3: Manual verification**

Run:

```bash
npm run scrape:history
```

Expected:
- `[scrape-history] 0 orders already in DB (will skip)` (first run)
- `[cart] Page 1: N orders (M pages total)` (from existing getOrderHistory logs)
- `[scrape-history] Found X total orders, X new to fetch`
- Still exits cleanly (no detail fetch yet)

Spot-check: the total count should roughly match what you see on https://www.heb.com/my-account/order-history.

- [ ] **Step 2.4: Commit**

```bash
git add src/scrape-purchase-history.js
git commit -m "feat: list orders with dedupe against heb_purchase_history"
```

---

## Task 3: Fetch details per order and insert

For each new order, fetch items and upsert one row into `heb_purchase_history`. Isolates per-order failures so one bad order doesn't kill the whole run.

**Files:**
- Modify: `C:\New Grocery App\heb-coupon-scraper\src\scrape-purchase-history.js`

- [ ] **Step 3.1: Add insert helper**

Insert above `async function main()`:

```javascript
async function insertOrder(db, orderMeta, details) {
  const sql = `
    INSERT IGNORE INTO heb_purchase_history (
      heb_order_id, order_date, store_name, fulfillment_type,
      order_total, item_count, items_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    orderMeta.orderId,
    orderMeta.orderDate || null,
    orderMeta.storeName || null,
    orderMeta.fulfillmentType || null,
    orderMeta.totalAmount != null ? orderMeta.totalAmount : null,
    details.items.length,
    JSON.stringify(details.items),
  ];
  const [result] = await db.pool.execute(sql, params);
  return result.affectedRows === 1; // 1 = inserted, 0 = duplicate (IGNORE)
}
```

- [ ] **Step 3.2: Replace the `TODO Task 3` line with detail-fetch loop**

Replace:

```javascript
    // TODO Task 3: fetch details + insert
```

With:

```javascript
    // Fetch details per order and insert
    const skipped = [];
    let inserted = 0;

    for (let i = 0; i < newOrders.length; i++) {
      const order = newOrders[i];
      const progress = `[${i + 1}/${newOrders.length}]`;

      try {
        console.log(`${progress} Fetching ${order.orderId}...`);
        const details = await getOrderDetails(page, order.orderId);

        if (!details.success) {
          console.error(`${progress} FAILED ${order.orderId}: ${details.error} — ${details.message}`);
          skipped.push({ orderId: order.orderId, error: details.error });
          continue;
        }

        const wasInserted = await insertOrder(db, order, details);
        if (wasInserted) {
          inserted++;
          console.log(`${progress} Inserted ${order.orderId} (${details.items.length} items)`);
        } else {
          console.log(`${progress} Duplicate ${order.orderId} — skipped`);
        }
      } catch (err) {
        console.error(`${progress} ERROR ${order.orderId}:`, err.message);
        skipped.push({ orderId: order.orderId, error: err.message });
      }

      // Rate limit between orders (skip delay on last)
      if (i < newOrders.length - 1) {
        const delay = BETWEEN_ORDERS_MS + Math.floor(Math.random() * JITTER_MS);
        await sleep(delay);
      }
    }

    console.log(`[scrape-history] Inserted ${inserted} orders, ${skipped.length} skipped`);
    if (skipped.length > 0) {
      console.log('[scrape-history] Skipped orders:');
      skipped.forEach(s => console.log(`  ${s.orderId}: ${s.error}`));
    }
```

- [ ] **Step 3.3: Manual verification**

Run:

```bash
npm run scrape:history
```

Expected:
- `[1/N] Fetching HEB....` lines with 5-8s between each
- Final `[scrape-history] Inserted X orders, Y skipped`
- Rows appear in DB:

Verify row count matches insertions:

```sql
SELECT COUNT(*) FROM heb_purchase_history;
SELECT heb_order_id, order_date, item_count FROM heb_purchase_history ORDER BY order_date DESC LIMIT 5;
```

Spot-check one order: pick an `orderId` from the DB, open `https://www.heb.com/my-account/order-history/<orderId>`, compare item count + a few product names against `items_json`.

- [ ] **Step 3.4: Idempotency check**

Run again:

```bash
npm run scrape:history
```

Expected:
- `[scrape-history] N orders already in DB (will skip)`
- `Found N total orders, 0 new to fetch`
- `Nothing new to scrape. Skipping to aggregation.`
- Exits in seconds (no detail fetches)

- [ ] **Step 3.5: Commit**

```bash
git add src/scrape-purchase-history.js
git commit -m "feat: fetch per-order details and upsert into heb_purchase_history"
```

---

## Task 4: Aggregate and export CSV

Runs the aggregation SQL and writes the result as CSV. Unconditional — even when nothing new was scraped, we still regenerate the CSV from current DB state so the file is always fresh.

**Files:**
- Modify: `C:\New Grocery App\heb-coupon-scraper\src\scrape-purchase-history.js`
- Create: `C:\New Grocery App\heb-coupon-scraper\exports\.gitkeep`
- Modify: `C:\New Grocery App\heb-coupon-scraper\.gitignore`

- [ ] **Step 4.1: Add CSV helpers**

Insert above `async function main()`:

```javascript
function csvEscape(value) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowsToCsv(rows, columns) {
  const header = columns.join(',');
  const body = rows.map(row =>
    columns.map(col => csvEscape(row[col])).join(',')
  ).join('\n');
  return header + '\n' + body + '\n';
}

async function exportAggregatedCsv(db) {
  const sql = `
    SELECT
      JSON_UNQUOTE(JSON_EXTRACT(item.value, '$.productId')) AS product_id,
      JSON_UNQUOTE(JSON_EXTRACT(item.value, '$.name')) AS product_name,
      JSON_UNQUOTE(JSON_EXTRACT(item.value, '$.category')) AS category,
      COUNT(DISTINCT h.heb_order_id) AS orders_with_item,
      SUM(CAST(JSON_EXTRACT(item.value, '$.quantity') AS DECIMAL(10,2))) AS total_quantity,
      DATE_FORMAT(MIN(h.order_date), '%Y-%m-%d') AS first_purchased,
      DATE_FORMAT(MAX(h.order_date), '%Y-%m-%d') AS last_purchased,
      ROUND(AVG(CAST(JSON_EXTRACT(item.value, '$.unitPrice') AS DECIMAL(10,2))), 2) AS avg_unit_price
    FROM heb_purchase_history h
    CROSS JOIN JSON_TABLE(h.items_json, '$[*]' COLUMNS(value JSON PATH '$')) AS item
    GROUP BY product_id, product_name, category
    ORDER BY orders_with_item DESC, total_quantity DESC
  `;
  const [rows] = await db.pool.query(sql);

  const exportsDir = path.resolve(__dirname, '..', 'exports');
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(exportsDir, `purchase-frequency-${dateStamp}.csv`);

  const columns = [
    'product_id', 'product_name', 'category',
    'orders_with_item', 'total_quantity',
    'first_purchased', 'last_purchased', 'avg_unit_price',
  ];
  const csv = rowsToCsv(rows, columns);
  fs.writeFileSync(outPath, csv, 'utf8');

  console.log(`[scrape-history] Wrote ${rows.length} product rows to ${outPath}`);
}
```

- [ ] **Step 4.2: Replace the `TODO Task 4` line with the export call**

Replace:

```javascript
    // TODO Task 4: aggregate + CSV
```

With:

```javascript
    // Aggregate and export CSV (always runs, even when nothing new was scraped)
    await exportAggregatedCsv(db);
```

- [ ] **Step 4.3: Create exports directory with .gitkeep**

Create file `C:\New Grocery App\heb-coupon-scraper\exports\.gitkeep` with empty content.

- [ ] **Step 4.4: Ignore generated CSVs**

Append to `C:\New Grocery App\heb-coupon-scraper\.gitignore`:

```
exports/*.csv
```

- [ ] **Step 4.5: Manual verification**

Run:

```bash
npm run scrape:history
```

Expected:
- `[scrape-history] Wrote N product rows to C:\New Grocery App\heb-coupon-scraper\exports\purchase-frequency-2026-04-18.csv`

Open the CSV and verify:
1. Header row: `product_id,product_name,category,orders_with_item,total_quantity,first_purchased,last_purchased,avg_unit_price`
2. Row count matches DB:

```sql
SELECT COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(item.value, '$.productId'))) AS distinct_products
FROM heb_purchase_history h
CROSS JOIN JSON_TABLE(h.items_json, '$[*]' COLUMNS(value JSON PATH '$')) AS item;
```

3. Top rows are products you buy constantly (bananas, milk, eggs, etc.)
4. `orders_with_item` in the top row ≤ `SELECT COUNT(*) FROM heb_purchase_history`
5. Fields with commas (e.g., `"H-E-B Organics, Free-Range"`) are properly quoted

- [ ] **Step 4.6: Commit**

```bash
git add src/scrape-purchase-history.js exports/.gitkeep .gitignore
git commit -m "feat: aggregate purchase history and export CSV"
```

---

## Task 5: End-to-end verification

Final sanity pass after all tasks are done.

- [ ] **Step 5.1: Fresh clean run**

Nothing new should have appeared in HEB between the last scrape and now, so this should be a no-op + CSV regeneration:

```bash
npm run scrape:history
```

Expected:
- `[scrape-history] N orders already in DB (will skip)`
- `Found N total orders, 0 new to fetch`
- `Nothing new to scrape. Skipping to aggregation.`
- CSV still gets written with same row count
- Exits in seconds

- [ ] **Step 5.2: Confirm CSV is current and complete**

```bash
ls -la "C:\New Grocery App\heb-coupon-scraper\exports"
```

Expected: `purchase-frequency-2026-04-18.csv` exists, modified today, >10 KB.

- [ ] **Step 5.3: Hand off CSV for analysis**

The CSV is ready for the user. Next conversation turn: user shares observations, we decide what (if anything) to do about `GroceryItems.Type` based on real frequency data. This plan ends here.

---

## Self-Review

**Spec coverage:**
- ✅ Populate `heb_purchase_history` — Task 3
- ✅ Export aggregated CSV — Task 4
- ✅ All available history — Task 2 (`maxPages: 999`, existing function handles early exit)
- ✅ Idempotent re-runs — Task 2 dedupe filter + Task 3 `INSERT IGNORE`
- ✅ Session expiration detection — Task 2 error handling
- ✅ Per-order failure isolation — Task 3 try/catch + skipped array
- ✅ 5s + jitter rate limit — Task 3 `BETWEEN_ORDERS_MS` + `JITTER_MS`
- ✅ CSV schema matches design — Task 4 columns exactly match design doc table
- ✅ Manual verification checklist — Task 3.3, 3.4, 4.5, 5.1

**Placeholder scan:** No TODOs, no "add appropriate error handling" — all code shown inline.

**Type/name consistency:**
- `BETWEEN_ORDERS_MS` / `JITTER_MS` defined in Task 1, used in Task 3 ✅
- `MAX_PAGES` defined in Task 1, used in Task 2 ✅
- `loadExistingOrderIds` / `insertOrder` / `exportAggregatedCsv` all defined and called with matching signatures ✅
- `orderMeta.orderDate` / `orderMeta.storeName` / etc. match fields returned by existing `getOrderHistory()` at [cart-manager.js:974-984](../../../heb-coupon-scraper/src/cart-manager.js) ✅
- `details.items` matches shape returned by existing `getOrderDetails()` at [cart-manager.js:1025-1040](../../../heb-coupon-scraper/src/cart-manager.js) ✅
