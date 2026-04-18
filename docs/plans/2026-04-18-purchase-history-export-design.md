# HEB Purchase History Export — Design

**Date:** 2026-04-18
**Status:** Design approved, awaiting implementation plan
**Goal:** One-shot export of HEB purchase history aggregated by product, to inform a later redesign of the manually-curated "Grocery Staples" list.

## Problem

`GroceryItems` contains 81 hand-curated staple items (55 Basic + 26 Periodic). The user wants to verify — with real purchase data — whether that list reflects what they *actually* buy most often. No DB schema changes, no app changes, no automation. Just a CSV for offline analysis.

The scraper already has `getOrderHistory()` and `getOrderDetails()` (see [cart-manager.js:948](../../../heb-coupon-scraper/src/cart-manager.js)), and the `heb_purchase_history` table exists but is empty (0 rows).

## Scope

**In scope:**
- Populate `heb_purchase_history` with all available HEB orders (one-time bulk scrape)
- Export aggregated per-product CSV sorted by purchase frequency

**Out of scope (deliberately):**
- Any schema change
- Any UI change
- Any automation / cron / scheduling
- Any update to `GroceryItems` or staples logic
- React app touches
- n8n workflow changes

## Architecture

**File:** `C:\New Grocery App\heb-coupon-scraper\src\scrape-purchase-history.js`

**Invocation:** `npm run scrape:history` (host, not Docker)

**Dependencies (all already installed):**
- `playwright` — reuses `cookies/heb-session.json` via `chromium.launch` + `storageState`, same stealth config as [scrape-frequent.js](../../../heb-coupon-scraper/src/scrape-frequent.js)
- `mysql2/promise` via [database.js](../../../heb-coupon-scraper/src/database.js) pool
- `getOrderHistory()` and `getOrderDetails()` from [cart-manager.js:948](../../../heb-coupon-scraper/src/cart-manager.js)
- `fs` for CSV writing (no new library)

**Output:**
1. Rows inserted into `heb_purchase_history` (one row per HEB order; item details in `items_json`)
2. Aggregated CSV at `C:\New Grocery App\heb-coupon-scraper\exports\purchase-frequency-YYYY-MM-DD.csv`

## Data Flow

1. **Init** — load session, launch stealth Playwright, connect mysql2 pool
2. **List orders** — call `getOrderHistory(page, { maxPages: 999 })`. The existing function already breaks when `pageNum >= totalPages`; the cap is a safety net
3. **Filter already-scraped** — `SELECT heb_order_id FROM heb_purchase_history`, exclude matches. Makes re-runs idempotent
4. **Fetch details** — for each new `orderId`, call `getOrderDetails(page, orderId)`. 5s + 0–3s jitter between calls (reuse `BETWEEN_OPS_DELAY`)
5. **Upsert per order** — one `INSERT IGNORE` per order (uses existing `heb_order_id UNIQUE` constraint). `items_json` stores the full items array
6. **Aggregate** — single SQL query (below)
7. **Write CSV** — stream aggregated rows to `exports/purchase-frequency-<date>.csv`

### Aggregation Query

```sql
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(item.value, '$.productId')) AS product_id,
  JSON_UNQUOTE(JSON_EXTRACT(item.value, '$.name')) AS product_name,
  JSON_UNQUOTE(JSON_EXTRACT(item.value, '$.category')) AS category,
  COUNT(DISTINCT h.heb_order_id) AS orders_with_item,
  SUM(CAST(JSON_EXTRACT(item.value, '$.quantity') AS DECIMAL(10,2))) AS total_quantity,
  MIN(h.order_date) AS first_purchased,
  MAX(h.order_date) AS last_purchased,
  ROUND(AVG(CAST(JSON_EXTRACT(item.value, '$.unitPrice') AS DECIMAL(10,2))), 2) AS avg_unit_price
FROM heb_purchase_history h
CROSS JOIN JSON_TABLE(h.items_json, '$[*]' COLUMNS(value JSON PATH '$')) AS item
GROUP BY product_id, product_name, category
ORDER BY orders_with_item DESC, total_quantity DESC;
```

Aggregation lives in SQL (not JS) so the CSV can be regenerated without re-scraping and the query can be tweaked for ad-hoc analysis.

## CSV Schema

Filename: `exports/purchase-frequency-YYYY-MM-DD.csv` (date stamp = run date)

| Column | Type | Source |
|---|---|---|
| `product_id` | string | HEB product ID (stable key) |
| `product_name` | string | `fullDisplayName` from order |
| `category` | string | HEB `productCategory.name` |
| `orders_with_item` | int | Count of distinct orders containing this product — **primary frequency signal** |
| `total_quantity` | decimal | Sum of quantities across all orders |
| `first_purchased` | date | Earliest order date |
| `last_purchased` | date | Most recent order date |
| `avg_unit_price` | decimal | Mean unit price across orders |

**Sort:** `orders_with_item DESC, total_quantity DESC`

**Escaping:** Standard CSV — wrap any field containing `,`, `"`, or newline in double quotes; escape internal quotes by doubling. Inline helper, no library.

**Rationale:**
- `orders_with_item` answers "how often do I buy this?" independent of quantity
- `total_quantity` distinguishes "1× on 10 orders" from "10× on 10 orders"
- `last_purchased` lets the user filter out one-time purchases from years ago
- `avg_unit_price` surfaces expensive staples worth targeting with coupons

## Error Handling

- **Session expired** — If `getOrderHistory()` returns `{ success: false, error: 'NAVIGATION_BLOCKED' | 'NO_DATA' }` or navigation lands on `accounts.heb.com/login`, abort with: *"HEB session expired — run `npm run scrape:login` and retry."*
- **Per-order failure isolation** — A failed `getOrderDetails(orderId)` logs the error and continues. Collect skipped orderIds and print at end of run for possible retry
- **No retry logic** — if the whole run dies, rerun the script. `INSERT IGNORE` + pre-filter make it idempotent
- **Cleanup** — `try/finally` closes browser and pool on any exit path

## Rate Limiting

- 5s + 0–3s jitter between `getOrderDetails` calls (reuse `BETWEEN_OPS_DELAY`)
- No delay between list pages (few pages, low risk)
- Headless browser with existing stealth config (UA, webdriver override) — avoids Incapsula WAF

## Testing

No automated tests. This is a throwaway analysis tool; re-running it is cheaper than maintaining tests.

Manual verification checklist:
1. Dry-run with `maxPages: 1` — verify order count matches HEB UI
2. Spot-check one scraped order against HEB's order page (item count, a few product names)
3. After full run, verify CSV row count matches `COUNT(DISTINCT product_id)` and top rows are recognizable staples
4. Rerun — should skip all already-scraped orders and exit quickly (idempotency check)

## What "Done" Looks Like

1. `npm run scrape:history` runs to completion without errors
2. `heb_purchase_history` has one row per HEB order
3. `exports/purchase-frequency-<date>.csv` exists, sorted by `orders_with_item DESC`
4. User can open the CSV, eyeball it, and iterate with Claude on "which items should actually be Staples"

## Non-Decisions (defer until after analysis)

- Whether to auto-update `GroceryItems.Type` based on frequency
- Whether to add a `PurchaseFrequency` column to `GroceryItems`
- Whether to schedule periodic re-scrapes
- Whether to show purchase counts anywhere in the React app

These come in a follow-up design after the user reviews the CSV.
