# HEB Store-Aligned Categories & Walk Order — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-categorize every catalog item using AI grounded in HEB's product taxonomy at store #794, capture each item's physical aisle, and have In-Store Mode sort items by aisle within each of the existing 14 walk-order categories.

**Architecture:** Single new npm script (`scrape:store-locations`) drives a 5-stage pipeline: preflight → enumerate work via audit-table dedup → match + AI-categorize via extended Smart Match (or new Categorize-only workflow for already-matched items) → apply changes per-item in transactions → run summary. Existing 14 categories stay; new `store_location` column on catalog rows feeds an aisle-aware secondary sort in the React In-Store Mode.

**Tech Stack:** Playwright, Node 18+, Jest, MySQL 8, n8n workflows, Claude Haiku 4.5 via Anthropic API, React 18.

**Spec:** [docs/superpowers/specs/2026-04-26-heb-store-locations-design.md](../specs/2026-04-26-heb-store-locations-design.md)

**Bug ref:** `app_feedback` #41 (Christian / Corey, screen=`shop`)

---

## Phase 0 — Test infrastructure

### Task 0.1: Install Jest and create test scaffolding

**Files:**
- Modify: `heb-coupon-scraper/package.json`
- Create: `heb-coupon-scraper/jest.config.js`
- Create: `heb-coupon-scraper/test/.gitkeep`
- Create: `heb-coupon-scraper/test/fixtures/.gitkeep`

- [ ] **Step 1: Install Jest as dev dependency**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm install --save-dev jest@^29.7.0
```

Expected: `package-lock.json` updated, `node_modules/jest` exists.

- [ ] **Step 2: Add `test` script to `package.json`**

Modify the `scripts` block in `heb-coupon-scraper/package.json`. Add `"test": "jest"` after `"clip-server": ...`. Final scripts block:

```json
"scripts": {
  "scrape": "node src/index.js",
  "scrape:discover": "node src/index.js --discover --headful",
  "scrape:debug": "node src/index.js --headful",
  "scrape:dry": "node src/index.js --dry-run",
  "scrape:login": "node src/index.js --login",
  "scrape:frequent": "node src/scrape-frequent.js",
  "scrape:frequent:debug": "node src/scrape-frequent.js --headful",
  "scrape:history": "node src/scrape-purchase-history.js",
  "scrape:history:debug": "node src/scrape-purchase-history.js --headful",
  "export:history": "node src/export-purchase-history.js",
  "clip-server": "node src/clip-server.js",
  "test": "jest"
}
```

- [ ] **Step 3: Create `jest.config.js`**

```javascript
// heb-coupon-scraper/jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.js'],
  collectCoverageFrom: ['src/store-locations/**/*.js'],
  testTimeout: 10000,
};
```

- [ ] **Step 4: Verify Jest runs (with no tests)**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm test
```

Expected output: `No tests found` warning, exit code 1 is fine — Jest exits 1 when no tests, that's expected at this point.

- [ ] **Step 5: Create empty test/ structure and commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && mkdir -p test/fixtures && touch test/.gitkeep test/fixtures/.gitkeep
```

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add package.json package-lock.json jest.config.js test/.gitkeep test/fixtures/.gitkeep && git commit -m "chore: add jest test infrastructure for store-locations scraper"
```

---

## Phase 1 — Database migrations

All migrations follow the existing WGL-Fix migration pattern (per `MEMORY.md`): create n8n workflow with Manual Trigger → MySQL DDL node → notify on success, execute manually via n8n UI or REST API, deactivate after success.

### Task 1.1: Add `category_id` FK to `GroceryItems` and backfill

**Spec gap fix:** the spec assumed `GroceryItems.category_id` exists; it does not. Current column is `Category VARCHAR(50)`. All values exactly match canonical names in `categories.name`, so backfill is a clean name JOIN.

**n8n workflow:** Create new workflow named `Migration: Add category_id to GroceryItems`.

- [ ] **Step 1: Create the migration workflow via n8n MCP**

Use `mcp__n8n-mcp__n8n_create_workflow` with these nodes:

1. **Manual Trigger** node
2. **MySQL** node (`hsa` credential `lqIXlvVVqfE4v7DF`) — operation: `executeQuery`, query:

```sql
ALTER TABLE GroceryItems
  ADD COLUMN category_id INT NULL AFTER Category,
  ADD CONSTRAINT fk_gi_category FOREIGN KEY (category_id) REFERENCES categories(id);

UPDATE GroceryItems g
JOIN categories c
  ON c.name COLLATE utf8mb4_unicode_ci = g.Category COLLATE utf8mb4_unicode_ci
SET g.category_id = c.id
WHERE g.Category IS NOT NULL;

SELECT
  COUNT(*) AS total,
  SUM(category_id IS NULL) AS unmapped,
  SUM(Category IS NULL) AS null_category
FROM GroceryItems
WHERE IsActive = 1;
```

- [ ] **Step 2: Execute the workflow via n8n UI**

Open workflow in browser at `http://localhost:5679`, click "Test workflow". Wait for green checkmark.

- [ ] **Step 3: Verify backfill via direct SQL**

Run via MySQL MCP:

```sql
SELECT COUNT(*) AS total, SUM(category_id IS NULL) AS missing
FROM GroceryItems WHERE IsActive=1;
```

Expected: `missing = 0` (every active item has a `category_id`).

- [ ] **Step 4: Deactivate workflow**

```bash
source /c/hsa-automation/.env && curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<workflow-id>/deactivate"
```

(Replace `<workflow-id>` with the ID returned by `n8n_create_workflow`.)

- [ ] **Step 5: Update MEMORY.md with workflow ID**

Add to the "n8n Workflows Created" section:
```
- `Migration: Add category_id to GroceryItems` (ID: <workflow-id>) — Executed and deactivated 2026-04-XX. Added category_id FK + backfilled from Category VARCHAR via name JOIN.
```

- [ ] **Step 6: Commit memory update**

```bash
cd "c:/New Grocery App/grocery-checklist-app" && git add docs/superpowers/plans/2026-04-26-heb-store-locations.md && git commit -m "feat(db): add category_id FK to GroceryItems"
```

---

### Task 1.2: Add `category_id` FK to `ingredients` and backfill via mapping

**Background:** `ingredients.ingredient_category` is VARCHAR(100) with lowercase shorthand values (`produce`, `condiments`, `spices`, ...) that don't match canonical category names. Need an explicit mapping.

**Mapping (verified against current data):**

| `ingredient_category` | `categories.id` (canonical name) |
|---|---|
| `produce` | 1 (Fruit & vegetables) |
| `condiments` | 9 (Condiments & sauces) |
| `spices` | 10 (Spices & seasonings) |
| `seasoning` | 10 (Spices & seasonings) |
| `dairy` | 5 (Dairy & eggs) |
| `protein` | 4 (Meat & seafood) |
| `grains` | 7 (Pasta, rice & grains) |
| `baking` | 8 (Pantry staples) |
| `canned` | 8 (Pantry staples) |
| `oils` | 8 (Pantry staples) |
| `sweeteners` | 8 (Pantry staples) |
| `nuts` | 11 (Snacks) |
| `frozen` | 14 (Frozen food) |
| `other` | 8 (Pantry staples) |

- [ ] **Step 1: Create `Migration: Add category_id to ingredients` workflow**

MySQL node query:

```sql
ALTER TABLE ingredients
  ADD COLUMN category_id INT NULL AFTER ingredient_category,
  ADD CONSTRAINT fk_ing_category FOREIGN KEY (category_id) REFERENCES categories(id);

UPDATE ingredients SET category_id = CASE LOWER(TRIM(ingredient_category))
  WHEN 'produce'    THEN 1
  WHEN 'condiments' THEN 9
  WHEN 'spices'     THEN 10
  WHEN 'seasoning'  THEN 10
  WHEN 'dairy'      THEN 5
  WHEN 'protein'    THEN 4
  WHEN 'grains'     THEN 7
  WHEN 'baking'     THEN 8
  WHEN 'canned'     THEN 8
  WHEN 'oils'       THEN 8
  WHEN 'sweeteners' THEN 8
  WHEN 'nuts'       THEN 11
  WHEN 'frozen'     THEN 14
  WHEN 'other'      THEN 8
  ELSE 8  -- default: Pantry staples for any unknown shorthand
END
WHERE ingredient_category IS NOT NULL;

SELECT COUNT(*) AS total, SUM(category_id IS NULL) AS missing FROM ingredients;
```

- [ ] **Step 2: Execute via n8n UI**

- [ ] **Step 3: Verify**

```sql
SELECT COUNT(*) AS total, SUM(category_id IS NULL) AS missing FROM ingredients;
```

Expected: `missing` should equal the count of rows where `ingredient_category` was NULL (likely 0).

- [ ] **Step 4: Deactivate workflow + memory update + commit**

(Same pattern as Task 1.1 Steps 4-6.)

---

### Task 1.3: Add scraper columns to `GroceryItems` and `ingredients`

- [ ] **Step 1: Create `Migration: Add HEB store-location columns to catalog` workflow**

```sql
ALTER TABLE GroceryItems
  ADD COLUMN heb_product_id        VARCHAR(50)  NULL AFTER category_id,
  ADD COLUMN store_location        VARCHAR(50)  NULL AFTER heb_product_id,
  ADD COLUMN store_id              VARCHAR(20)  NULL AFTER store_location,
  ADD COLUMN store_loc_scraped_at  TIMESTAMP    NULL AFTER store_id,
  ADD INDEX idx_gi_store_loc (store_id, store_location);

ALTER TABLE ingredients
  ADD COLUMN heb_product_id        VARCHAR(50)  NULL AFTER category_id,
  ADD COLUMN store_location        VARCHAR(50)  NULL AFTER heb_product_id,
  ADD COLUMN store_id              VARCHAR(20)  NULL AFTER store_location,
  ADD COLUMN store_loc_scraped_at  TIMESTAMP    NULL AFTER store_id,
  ADD INDEX idx_ing_store_loc (store_id, store_location);
```

- [ ] **Step 2: Execute, verify, deactivate, memory-update, commit**

Verification:

```sql
SHOW COLUMNS FROM GroceryItems LIKE 'store_%';
SHOW COLUMNS FROM ingredients LIKE 'store_%';
```

Expected: 3 rows each, all NULLable.

---

### Task 1.4: Add scraper columns to `heb_frequent_products` and `heb_product_matches`

- [ ] **Step 1: Create `Migration: Add HEB store-location columns to product cache` workflow**

```sql
ALTER TABLE heb_frequent_products
  ADD COLUMN store_location VARCHAR(50) NULL AFTER category_path,
  ADD COLUMN store_id       VARCHAR(20) NULL AFTER store_location;

ALTER TABLE heb_product_matches
  ADD COLUMN store_location           VARCHAR(50) NULL AFTER heb_category,
  ADD COLUMN store_id                 VARCHAR(20) NULL AFTER store_location,
  ADD COLUMN user_category_id         INT         NULL,
  ADD COLUMN user_category_confidence ENUM('high','medium','low') NULL,
  ADD CONSTRAINT fk_hpm_category FOREIGN KEY (user_category_id) REFERENCES categories(id);
```

- [ ] **Step 2: Execute, verify, deactivate, memory-update, commit**

---

### Task 1.5: Create `category_assignment_audit` table

- [ ] **Step 1: Create `Migration: Create category_assignment_audit table` workflow**

```sql
CREATE TABLE category_assignment_audit (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  source_table       ENUM('GroceryItems','ingredients','heb_frequent_products') NOT NULL,
  source_item_id     INT NOT NULL,
  source_item_name   VARCHAR(255) NOT NULL,
  old_category_id    INT NULL,
  new_category_id    INT NULL,
  heb_product_id     VARCHAR(50) NULL,
  heb_product_name   VARCHAR(500) NULL,
  store_location     VARCHAR(50) NULL,
  confidence         ENUM('high','medium','low') NULL,
  ai_reason          VARCHAR(500) NULL,
  action             ENUM('applied','skipped_low_conf','no_match','error','dry_run') NOT NULL,
  run_id             VARCHAR(50) NOT NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_run (run_id),
  INDEX idx_action (action),
  INDEX idx_source (source_table, source_item_id)
);
```

- [ ] **Step 2: Execute, verify with `DESCRIBE category_assignment_audit`, deactivate, memory-update, commit**

---

## Phase 2 — n8n workflow updates

### Task 2.1: Extend `Smart Match Grocery Items` with `userCategory` output

**Workflow:** `Smart Match Grocery Items` (ID: `DDlygjzqHlLs4V1E`)

Per `MEMORY.md`: workflow is AI Agent + Haiku 4.5 with Structured Output Parser.

- [ ] **Step 1: Inspect current workflow structure**

```bash
mcp__n8n-mcp__n8n_get_workflow_structure with id="DDlygjzqHlLs4V1E"
```

Note the IDs of the **Structured Output Parser** node and the **AI Agent** prompt node.

- [ ] **Step 2: Modify the Structured Output Parser schema**

Use `n8n_update_partial_workflow` to update the parser's `jsonSchema` field. Add `userCategory` to the per-match object schema:

```json
{
  "type": "object",
  "properties": {
    "matches": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "groceryItemId": { "type": "string" },
          "hebProductId": { "type": "string" },
          "matchConfidence": { "type": "string", "enum": ["high","medium","low"] },
          "matchReason": { "type": "string" },
          "userCategory": {
            "type": "string",
            "description": "One of the 14 walk-order category names from the categories table"
          }
        },
        "required": ["groceryItemId","hebProductId","matchConfidence","userCategory"]
      }
    }
  }
}
```

- [ ] **Step 3: Add MySQL node before AI Agent to fetch category enum**

Insert a new MySQL node between Webhook and AI Agent. Query:

```sql
SELECT GROUP_CONCAT(name SEPARATOR ', ') AS category_list
FROM categories ORDER BY walk_order;
```

This returns a single string like `Fruit & vegetables, Bakery & bread, Deli & prepared food, Meat & seafood, Dairy & eggs, ...`.

- [ ] **Step 4: Inject category enum into AI Agent prompt**

In the AI Agent node's system prompt, append this paragraph:

```
After choosing the HEB product for each grocery item, also assign each item to exactly one of these 14 walk-order categories: {{ $('FetchCategories').item.json.category_list }}. Use HEB's productCategory and productCategoryPath as your primary signal. Set userCategory to one of these exact strings — no other values are valid.
```

- [ ] **Step 5: Activate workflow and test via webhook**

```bash
curl -X POST https://n8n-grocery.needexcelexpert.com/webhook/smart_match_grocery \
  -H "Content-Type: application/json" \
  -d '{"items":[{"id":"test1","name":"Soy Sauce"}],"frequentProducts":[]}'
```

Expected: response includes `matches[0].userCategory` with one of the 14 canonical names (e.g. `Pantry staples` or `Condiments & sauces`).

- [ ] **Step 6: Memory-update + commit (no code change in repo, just memory)**

---

### Task 2.2: Create new `Categorize HEB Product` workflow

**Purpose:** AI categorize-only flow for items already known to HEB (Phase 0 — `heb_frequent_products`). Smaller payload than Smart Match (no search results).

- [ ] **Step 1: Create the workflow via n8n MCP**

Use `mcp__n8n-mcp__n8n_create_workflow`. Structure:

1. **Webhook** (POST `/categorize_heb_product`, webhookId: `cat-heb-product-2026-04-26`, responseMode: `responseNode`)
2. **MySQL** (FetchCategories) — same SELECT as Task 2.1 Step 3
3. **Basic LLM Chain** (Claude Haiku 4.5, Anthropic credential `oIJGiLWag044CZqj`) with prompt:

```
You are categorizing HEB products into the user's 14 walk-order categories.

Available categories (use exact spelling): {{ $('FetchCategories').item.json.category_list }}

Item name: {{ $('Webhook').item.json.body.name }}
Brand: {{ $('Webhook').item.json.body.brand }}
HEB taxonomy: {{ $('Webhook').item.json.body.hebProductCategory }}
HEB taxonomy path: {{ $('Webhook').item.json.body.hebProductCategoryPath }}

Respond ONLY in JSON matching this exact schema:
{
  "userCategory": "<one of the 14 category names>",
  "confidence": "high" | "medium" | "low",
  "reason": "<one short sentence>"
}
```

4. **Structured Output Parser** with schema:

```json
{
  "type": "object",
  "properties": {
    "userCategory": { "type": "string" },
    "confidence": { "type": "string", "enum": ["high","medium","low"] },
    "reason": { "type": "string" }
  },
  "required": ["userCategory","confidence"]
}
```

5. **Respond to Webhook** with CORS headers `Access-Control-Allow-Origin: *` and body `={{ JSON.stringify($json) }}`.

- [ ] **Step 2: Activate workflow**

```bash
source /c/hsa-automation/.env && curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<workflow-id>/activate"
```

- [ ] **Step 3: Test via webhook**

```bash
curl -X POST https://n8n-grocery.needexcelexpert.com/webhook/categorize_heb_product \
  -H "Content-Type: application/json" \
  -d '{"name":"H-E-B Whole Milk","brand":"H-E-B","hebProductCategory":"Dairy & eggs","hebProductCategoryPath":"Dairy & eggs/Milk"}'
```

Expected: `{"userCategory":"Dairy & eggs","confidence":"high","reason":"..."}`.

- [ ] **Step 4: Memory-update with workflow ID + commit**

---

## Phase 3 — Pure-function unit tests + implementations (TDD)

Each task in this phase is strict TDD: write failing test → run → write minimal code → run → commit.

### Task 3.1: `aisleSortKey()` — parse aisle string to sortable integer

**Files:**
- Create: `heb-coupon-scraper/test/aisle-sort-key.test.js`
- Create: `heb-coupon-scraper/src/store-locations/aisle-sort-key.js`

- [ ] **Step 1: Write the failing test**

```javascript
// heb-coupon-scraper/test/aisle-sort-key.test.js
const { aisleSortKey } = require('../src/store-locations/aisle-sort-key');

describe('aisleSortKey', () => {
  test('null returns 9999 (sort to end)', () => {
    expect(aisleSortKey(null)).toBe(9999);
  });
  test('undefined returns 9999', () => {
    expect(aisleSortKey(undefined)).toBe(9999);
  });
  test('empty string returns 9999', () => {
    expect(aisleSortKey('')).toBe(9999);
  });
  test('"Aisle 14" returns 14', () => {
    expect(aisleSortKey('Aisle 14')).toBe(14);
  });
  test('"aisle 7" (lowercase) returns 7', () => {
    expect(aisleSortKey('aisle 7')).toBe(7);
  });
  test('"AISLE  14" (extra spaces) returns 14', () => {
    expect(aisleSortKey('AISLE  14')).toBe(14);
  });
  test('"Aisle 1" returns 1', () => {
    expect(aisleSortKey('Aisle 1')).toBe(1);
  });
  test('"Produce" (department) returns 8000', () => {
    expect(aisleSortKey('Produce')).toBe(8000);
  });
  test('"Bakery" returns 8000', () => {
    expect(aisleSortKey('Bakery')).toBe(8000);
  });
  test('"Meat & Seafood" returns 8000', () => {
    expect(aisleSortKey('Meat & Seafood')).toBe(8000);
  });
  test('"12B" (with letter suffix) returns 12', () => {
    expect(aisleSortKey('12B')).toBe(12);
  });
  test('"Aisle 12B" returns 12', () => {
    expect(aisleSortKey('Aisle 12B')).toBe(12);
  });
});
```

- [ ] **Step 2: Run test, verify all fail**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm test -- aisle-sort-key
```

Expected: `Cannot find module '../src/store-locations/aisle-sort-key'` — all tests fail at import.

- [ ] **Step 3: Create directory and implementation file**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && mkdir -p src/store-locations
```

```javascript
// heb-coupon-scraper/src/store-locations/aisle-sort-key.js
function aisleSortKey(loc) {
  if (typeof loc !== 'string' || loc.trim() === '') return 9999;
  const m = loc.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return 8000;
}

module.exports = { aisleSortKey };
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm test -- aisle-sort-key
```

Expected: 12 tests passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add src/store-locations/aisle-sort-key.js test/aisle-sort-key.test.js && git commit -m "feat(store-locations): aisleSortKey for in-store walk order"
```

---

### Task 3.2: `extractProductLocation()` — pull aisle from HEB `__NEXT_DATA__`

**Files:**
- Create: `heb-coupon-scraper/test/fixtures/heb-product-soy-sauce.json`
- Create: `heb-coupon-scraper/test/fixtures/heb-product-no-location.json`
- Create: `heb-coupon-scraper/test/extract-product-location.test.js`
- Create: `heb-coupon-scraper/src/store-locations/extract-product-location.js`

- [ ] **Step 1: Capture real fixtures from HEB (one-time, manual)**

Run this script in a Playwright session against a real HEB product page (any product, just need a real `__NEXT_DATA__` blob). The fixture is committed; this step is a one-time human action to seed the test:

```javascript
// throwaway script — DO NOT commit
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({ storageState: './cookies/heb-session.json' });
  const page = await ctx.newPage();
  await page.goto('https://www.heb.com/product-detail/kikkoman-all-purpose-soy-sauce/116471');
  const data = await page.evaluate(() => {
    return JSON.parse(document.querySelector('#__NEXT_DATA__').textContent);
  });
  fs.writeFileSync('test/fixtures/heb-product-soy-sauce.json', JSON.stringify(data, null, 2));
  await browser.close();
})();
```

Manually inspect the saved JSON and locate the path to `productLocation.location` (likely `data.props.pageProps.product.productLocation.location`). Document this path in the implementation.

For the no-location fixture, save another product page that returns no aisle (e.g., a discontinued product or one HEB returns null for) under `heb-product-no-location.json`. If unable to find one organically, create a minimal synthetic fixture by copying the soy sauce one and removing the `productLocation` field.

- [ ] **Step 2: Write the failing test**

```javascript
// heb-coupon-scraper/test/extract-product-location.test.js
const { extractProductLocation } = require('../src/store-locations/extract-product-location');
const soySauce = require('./fixtures/heb-product-soy-sauce.json');
const noLocation = require('./fixtures/heb-product-no-location.json');

describe('extractProductLocation', () => {
  test('extracts aisle string from real product page __NEXT_DATA__', () => {
    const result = extractProductLocation(soySauce);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('returns null when productLocation field is absent', () => {
    expect(extractProductLocation(noLocation)).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(extractProductLocation(null)).toBeNull();
    expect(extractProductLocation(undefined)).toBeNull();
    expect(extractProductLocation({})).toBeNull();
  });

  test('returns null when productLocation.location is empty string', () => {
    const blob = { props: { pageProps: { product: { productLocation: { location: '' } } } } };
    expect(extractProductLocation(blob)).toBeNull();
  });

  test('returns null when productLocation.location is not a string', () => {
    const blob = { props: { pageProps: { product: { productLocation: { location: 42 } } } } };
    expect(extractProductLocation(blob)).toBeNull();
  });
});
```

- [ ] **Step 3: Run, verify failure**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm test -- extract-product-location
```

Expected: import error.

- [ ] **Step 4: Implement**

```javascript
// heb-coupon-scraper/src/store-locations/extract-product-location.js
/**
 * Extracts productLocation.location string from HEB's product-page __NEXT_DATA__.
 * Path verified against captured fixture: props.pageProps.product.productLocation.location.
 */
function extractProductLocation(nextData) {
  const loc = nextData?.props?.pageProps?.product?.productLocation?.location;
  if (typeof loc !== 'string' || loc.trim() === '') return null;
  return loc;
}

/**
 * Variant for search-results SSR data, where products are an array under a different path.
 * Returns aisle for a specific result by index.
 */
function extractProductLocationFromSearchResult(searchResult) {
  const loc = searchResult?.productLocation?.location;
  if (typeof loc !== 'string' || loc.trim() === '') return null;
  return loc;
}

module.exports = { extractProductLocation, extractProductLocationFromSearchResult };
```

- [ ] **Step 5: Run, verify pass; adjust JSON path if fixture revealed a different shape**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm test -- extract-product-location
```

Expected: all 5 tests pass.

If the path differs from the fixture, update the implementation accordingly.

- [ ] **Step 6: Commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add src/store-locations/extract-product-location.js test/extract-product-location.test.js test/fixtures/heb-product-soy-sauce.json test/fixtures/heb-product-no-location.json && git commit -m "feat(store-locations): extractProductLocation from HEB __NEXT_DATA__"
```

---

### Task 3.3: `buildWorkQueue()` — filter catalog rows needing scrape

**Files:**
- Create: `heb-coupon-scraper/test/build-work-queue.test.js`
- Create: `heb-coupon-scraper/src/store-locations/build-work-queue.js`

- [ ] **Step 1: Write the failing test**

```javascript
// heb-coupon-scraper/test/build-work-queue.test.js
const { buildWorkQueue } = require('../src/store-locations/build-work-queue');

describe('buildWorkQueue', () => {
  const allItems = [
    { id: 1, name: 'Milk' },
    { id: 2, name: 'Bread' },
    { id: 3, name: 'Eggs' },
    { id: 4, name: 'Cheese' },
  ];

  test('returns all items when audit table is empty', () => {
    const queue = buildWorkQueue(allItems, []);
    expect(queue).toHaveLength(4);
  });

  test('excludes items recently applied (within freshness window)', () => {
    const recentDate = new Date().toISOString();
    const audit = [
      { source_item_id: 1, action: 'applied', created_at: recentDate },
      { source_item_id: 2, action: 'no_match', created_at: recentDate },
    ];
    const queue = buildWorkQueue(allItems, audit, { freshnessDays: 90 });
    expect(queue.map(i => i.id)).toEqual([3, 4]);
  });

  test('includes items past the freshness window', () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const audit = [
      { source_item_id: 1, action: 'applied', created_at: oldDate },
    ];
    const queue = buildWorkQueue(allItems, audit, { freshnessDays: 90 });
    expect(queue.map(i => i.id)).toContain(1);
  });

  test('always retries skipped_low_conf and error rows', () => {
    const recentDate = new Date().toISOString();
    const audit = [
      { source_item_id: 1, action: 'skipped_low_conf', created_at: recentDate },
      { source_item_id: 2, action: 'error', created_at: recentDate },
    ];
    const queue = buildWorkQueue(allItems, audit, { freshnessDays: 90 });
    expect(queue.map(i => i.id).sort()).toEqual([1, 2, 3, 4]);
  });

  test('respects retrySkipped=false to skip low_conf items', () => {
    const recentDate = new Date().toISOString();
    const audit = [
      { source_item_id: 1, action: 'skipped_low_conf', created_at: recentDate },
    ];
    const queue = buildWorkQueue(allItems, audit, { freshnessDays: 90, retrySkipped: false });
    expect(queue.map(i => i.id)).toEqual([2, 3, 4]);
  });

  test('uses most recent audit row per item when multiple exist', () => {
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date().toISOString();
    const audit = [
      { source_item_id: 1, action: 'applied',  created_at: oldDate },
      { source_item_id: 1, action: 'no_match', created_at: recentDate },
    ];
    const queue = buildWorkQueue(allItems, audit, { freshnessDays: 90 });
    expect(queue.map(i => i.id)).not.toContain(1);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm test -- build-work-queue
```

- [ ] **Step 3: Implement**

```javascript
// heb-coupon-scraper/src/store-locations/build-work-queue.js
const STICKY_ACTIONS = new Set(['applied', 'no_match']);

/**
 * Filters items down to those needing (re)processing this run.
 *
 * @param {Array<{id, name}>} items - all candidate catalog rows
 * @param {Array<{source_item_id, action, created_at}>} auditRows - audit history
 * @param {Object} [opts]
 * @param {number} [opts.freshnessDays=90] - how recent counts as "still fresh"
 * @param {boolean} [opts.retrySkipped=true] - true: low_conf/error always retried
 * @returns {Array<{id, name}>} work queue
 */
function buildWorkQueue(items, auditRows, opts = {}) {
  const { freshnessDays = 90, retrySkipped = true } = opts;
  const cutoff = Date.now() - freshnessDays * 24 * 60 * 60 * 1000;

  const latestByItem = new Map();
  for (const row of auditRows) {
    const ts = Date.parse(row.created_at);
    const cur = latestByItem.get(row.source_item_id);
    if (!cur || Date.parse(cur.created_at) < ts) {
      latestByItem.set(row.source_item_id, row);
    }
  }

  return items.filter(item => {
    const last = latestByItem.get(item.id);
    if (!last) return true;
    const ts = Date.parse(last.created_at);
    if (ts < cutoff) return true;
    if (STICKY_ACTIONS.has(last.action)) return false;
    return retrySkipped;
  });
}

module.exports = { buildWorkQueue, STICKY_ACTIONS };
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add src/store-locations/build-work-queue.js test/build-work-queue.test.js && git commit -m "feat(store-locations): buildWorkQueue with audit-driven dedup"
```

---

### Task 3.4: `buildAuditRow()` — construct audit-table row from pipeline outputs

**Files:**
- Create: `heb-coupon-scraper/test/build-audit-row.test.js`
- Create: `heb-coupon-scraper/src/store-locations/build-audit-row.js`

- [ ] **Step 1: Write the failing test**

```javascript
// heb-coupon-scraper/test/build-audit-row.test.js
const { buildAuditRow } = require('../src/store-locations/build-audit-row');

describe('buildAuditRow', () => {
  const baseInput = {
    sourceTable: 'GroceryItems',
    sourceItemId: 42,
    sourceItemName: 'Soy Sauce',
    runId: 'run_2026-04-26_19-30-00',
  };

  test('builds applied row with full match data', () => {
    const row = buildAuditRow({
      ...baseInput,
      oldCategoryId: 8,
      newCategoryId: 9,
      hebProductId: '116471',
      hebProductName: 'Kikkoman All-Purpose Soy Sauce',
      storeLocation: 'Aisle 14',
      confidence: 'high',
      aiReason: 'HEB taxonomy = Pantry/Sauces, mapped to Condiments & sauces',
      action: 'applied',
    });
    expect(row).toEqual({
      source_table: 'GroceryItems',
      source_item_id: 42,
      source_item_name: 'Soy Sauce',
      old_category_id: 8,
      new_category_id: 9,
      heb_product_id: '116471',
      heb_product_name: 'Kikkoman All-Purpose Soy Sauce',
      store_location: 'Aisle 14',
      confidence: 'high',
      ai_reason: 'HEB taxonomy = Pantry/Sauces, mapped to Condiments & sauces',
      action: 'applied',
      run_id: 'run_2026-04-26_19-30-00',
    });
  });

  test('builds no_match row with null product fields', () => {
    const row = buildAuditRow({
      ...baseInput,
      oldCategoryId: 8,
      action: 'no_match',
    });
    expect(row.action).toBe('no_match');
    expect(row.new_category_id).toBeNull();
    expect(row.heb_product_id).toBeNull();
    expect(row.store_location).toBeNull();
    expect(row.confidence).toBeNull();
  });

  test('builds skipped_low_conf row preserving match data', () => {
    const row = buildAuditRow({
      ...baseInput,
      oldCategoryId: 8,
      hebProductId: '99999',
      hebProductName: 'Generic Salt',
      confidence: 'low',
      aiReason: 'Ambiguous between Pantry staples and Spices',
      action: 'skipped_low_conf',
    });
    expect(row.action).toBe('skipped_low_conf');
    expect(row.new_category_id).toBeNull();
    expect(row.heb_product_id).toBe('99999');
  });

  test('truncates ai_reason to 500 chars', () => {
    const longReason = 'x'.repeat(700);
    const row = buildAuditRow({
      ...baseInput,
      action: 'applied',
      aiReason: longReason,
    });
    expect(row.ai_reason.length).toBe(500);
  });

  test('throws when required fields are missing', () => {
    expect(() => buildAuditRow({})).toThrow(/sourceTable/);
    expect(() => buildAuditRow({ sourceTable: 'GroceryItems' })).toThrow(/sourceItemId/);
  });

  test('rejects invalid source_table', () => {
    expect(() => buildAuditRow({ ...baseInput, sourceTable: 'BogusTable', action: 'applied' })).toThrow(/source_table/);
  });

  test('rejects invalid action', () => {
    expect(() => buildAuditRow({ ...baseInput, action: 'invented_action' })).toThrow(/action/);
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement**

```javascript
// heb-coupon-scraper/src/store-locations/build-audit-row.js
const VALID_TABLES = new Set(['GroceryItems', 'ingredients', 'heb_frequent_products']);
const VALID_ACTIONS = new Set(['applied', 'skipped_low_conf', 'no_match', 'error', 'dry_run']);

/**
 * Builds a row matching the category_assignment_audit table schema.
 * Throws on missing or invalid required fields.
 */
function buildAuditRow(input) {
  const {
    sourceTable, sourceItemId, sourceItemName, runId, action,
    oldCategoryId = null, newCategoryId = null,
    hebProductId = null, hebProductName = null,
    storeLocation = null, confidence = null, aiReason = null,
  } = input;

  if (!sourceTable) throw new Error('buildAuditRow: sourceTable required');
  if (typeof sourceItemId !== 'number') throw new Error('buildAuditRow: sourceItemId required');
  if (!sourceItemName) throw new Error('buildAuditRow: sourceItemName required');
  if (!runId) throw new Error('buildAuditRow: runId required');
  if (!action) throw new Error('buildAuditRow: action required');
  if (!VALID_TABLES.has(sourceTable)) throw new Error(`buildAuditRow: invalid source_table "${sourceTable}"`);
  if (!VALID_ACTIONS.has(action)) throw new Error(`buildAuditRow: invalid action "${action}"`);

  return {
    source_table: sourceTable,
    source_item_id: sourceItemId,
    source_item_name: sourceItemName,
    old_category_id: oldCategoryId,
    new_category_id: action === 'applied' ? newCategoryId : null,
    heb_product_id: hebProductId,
    heb_product_name: hebProductName,
    store_location: action === 'applied' ? storeLocation : null,
    confidence,
    ai_reason: aiReason ? String(aiReason).slice(0, 500) : null,
    action,
    run_id: runId,
  };
}

module.exports = { buildAuditRow, VALID_TABLES, VALID_ACTIONS };
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add src/store-locations/build-audit-row.js test/build-audit-row.test.js && git commit -m "feat(store-locations): buildAuditRow with validation"
```

---

### Task 3.5: `buildRunSummary()` — aggregate per-bucket per-action counts

**Files:**
- Create: `heb-coupon-scraper/test/build-run-summary.test.js`
- Create: `heb-coupon-scraper/src/store-locations/build-run-summary.js`

- [ ] **Step 1: Write the failing test**

```javascript
// heb-coupon-scraper/test/build-run-summary.test.js
const { buildRunSummary, formatRunSummary } = require('../src/store-locations/build-run-summary');

describe('buildRunSummary', () => {
  test('aggregates counts by phase and action', () => {
    const auditRows = [
      { action: 'applied',           phase: 0, store_location: 'Aisle 7' },
      { action: 'applied',           phase: 0, store_location: null },
      { action: 'no_match',          phase: 0, store_location: null },
      { action: 'applied',           phase: 1, store_location: 'Aisle 14' },
      { action: 'skipped_low_conf',  phase: 1, store_location: null },
      { action: 'error',             phase: 1, store_location: null },
    ];
    const summary = buildRunSummary(auditRows, 'run_test');
    expect(summary.runId).toBe('run_test');
    expect(summary.phase0).toEqual({ total: 3, applied: 2, no_match: 1, skipped_low_conf: 0, error: 0 });
    expect(summary.phase1).toEqual({ total: 3, applied: 1, no_match: 0, skipped_low_conf: 1, error: 1 });
    expect(summary.aisleCoverage.applied).toBe(3);
    expect(summary.aisleCoverage.withAisle).toBe(2);
    expect(summary.aisleCoverage.percent).toBe(67);
  });

  test('flags low aisle coverage', () => {
    const auditRows = [
      { action: 'applied', phase: 1, store_location: null },
      { action: 'applied', phase: 1, store_location: null },
      { action: 'applied', phase: 1, store_location: 'Aisle 5' },
    ];
    const summary = buildRunSummary(auditRows, 'run_test');
    expect(summary.aisleCoverage.percent).toBe(33);
    expect(summary.warnings).toContain(expect.stringMatching(/aisle coverage/i));
  });

  test('handles empty audit', () => {
    const summary = buildRunSummary([], 'run_empty');
    expect(summary.phase0.total).toBe(0);
    expect(summary.phase1.total).toBe(0);
    expect(summary.aisleCoverage.percent).toBe(0);
  });

  test('formatRunSummary produces human-readable string', () => {
    const summary = {
      runId: 'run_test',
      phase0: { total: 3, applied: 2, no_match: 1, skipped_low_conf: 0, error: 0 },
      phase1: { total: 3, applied: 1, no_match: 0, skipped_low_conf: 1, error: 1 },
      aisleCoverage: { applied: 3, withAisle: 2, percent: 67 },
      warnings: [],
      walltimeSec: 120,
    };
    const text = formatRunSummary(summary);
    expect(text).toContain('run_test');
    expect(text).toContain('Phase 0');
    expect(text).toContain('Phase 1');
    expect(text).toContain('67%');
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement**

```javascript
// heb-coupon-scraper/src/store-locations/build-run-summary.js
const ACTIONS = ['applied', 'no_match', 'skipped_low_conf', 'error'];

function emptyPhase() {
  return { total: 0, applied: 0, no_match: 0, skipped_low_conf: 0, error: 0 };
}

/**
 * Aggregates audit rows into per-phase counts plus aisle-coverage metric.
 * Coverage threshold: warn if <30% of applied rows have store_location.
 */
function buildRunSummary(auditRows, runId, walltimeSec = null) {
  const summary = {
    runId,
    phase0: emptyPhase(),
    phase1: emptyPhase(),
    aisleCoverage: { applied: 0, withAisle: 0, percent: 0 },
    warnings: [],
    walltimeSec,
  };
  for (const row of auditRows) {
    const bucket = row.phase === 0 ? summary.phase0 : summary.phase1;
    bucket.total++;
    if (ACTIONS.includes(row.action)) bucket[row.action]++;
    if (row.action === 'applied') {
      summary.aisleCoverage.applied++;
      if (row.store_location) summary.aisleCoverage.withAisle++;
    }
  }
  if (summary.aisleCoverage.applied > 0) {
    summary.aisleCoverage.percent = Math.round(
      100 * summary.aisleCoverage.withAisle / summary.aisleCoverage.applied
    );
  }
  if (summary.aisleCoverage.applied > 0 && summary.aisleCoverage.percent < 30) {
    summary.warnings.push(
      `Low aisle coverage: only ${summary.aisleCoverage.percent}% of applied items have store_location. ` +
      `HEB may have changed __NEXT_DATA__ shape — check extractProductLocation.`
    );
  }
  return summary;
}

function formatPhase(name, p) {
  return `${name}: ${p.total} items, ${p.applied} applied, ${p.no_match} no_match, ` +
         `${p.skipped_low_conf} skipped_low_conf, ${p.error} error`;
}

function formatRunSummary(s) {
  const lines = [
    `=== Run ${s.runId} ===`,
    formatPhase('Phase 0', s.phase0),
    formatPhase('Phase 1', s.phase1),
    `Aisle coverage: ${s.aisleCoverage.withAisle}/${s.aisleCoverage.applied} applied (${s.aisleCoverage.percent}%)`,
  ];
  if (s.walltimeSec != null) lines.push(`Walltime: ${Math.floor(s.walltimeSec / 60)}m ${s.walltimeSec % 60}s`);
  if (s.warnings.length) {
    lines.push('');
    lines.push('WARNINGS:');
    for (const w of s.warnings) lines.push(`  - ${w}`);
  }
  return lines.join('\n');
}

module.exports = { buildRunSummary, formatRunSummary };
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add src/store-locations/build-run-summary.js test/build-run-summary.test.js && git commit -m "feat(store-locations): buildRunSummary with aisle-coverage canary"
```

---

## Phase 4 — Scraper orchestration

### Task 4.1: Preflight checks module

**Files:**
- Create: `heb-coupon-scraper/src/store-locations/preflight.js`

- [ ] **Step 1: Implement preflight**

```javascript
// heb-coupon-scraper/src/store-locations/preflight.js
const fs = require('fs');
const path = require('path');
const config = require('../config');

class PreflightError extends Error {
  constructor(msg, hint) {
    super(msg);
    this.hint = hint;
  }
}

async function checkEnv() {
  if (!process.env.HEB_STORE_ID || process.env.HEB_STORE_ID !== '794') {
    throw new PreflightError(
      `HEB_STORE_ID must equal 794 (current: ${process.env.HEB_STORE_ID || 'unset'})`,
      'Set HEB_STORE_ID=794 in heb-coupon-scraper/.env'
    );
  }
}

async function checkSession() {
  const cookiePath = path.resolve(__dirname, '..', '..', config.browser.cookiePath);
  if (!fs.existsSync(cookiePath)) {
    throw new PreflightError(
      `Session cookies not found at ${cookiePath}`,
      'Run npm run scrape:login first'
    );
  }
  const stats = fs.statSync(cookiePath);
  const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
  if (ageHours > config.browser.sessionMaxAgeHours) {
    throw new PreflightError(
      `Session cookies are ${ageHours.toFixed(1)}h old (max ${config.browser.sessionMaxAgeHours}h)`,
      'Run npm run scrape:login to refresh'
    );
  }
}

/**
 * Verifies the Playwright session is bound to store HEB_STORE_ID.
 * Reads the homepage __NEXT_DATA__ blob and inspects the selected-store field.
 */
async function checkStoreBinding(page) {
  await page.goto('https://www.heb.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const storeData = await page.evaluate(() => {
    try {
      const blob = JSON.parse(document.querySelector('#__NEXT_DATA__').textContent);
      // Path TBD during implementation — inspect blob in DevTools to find the right field.
      // Common candidates: props.pageProps.curbsideStore.id, props.pageProps.selectedStore.id,
      // or via cookie '_b_orderingStoreNumber'. Return all candidates for the caller to pick.
      return {
        curbsideStore: blob?.props?.pageProps?.curbsideStore || null,
        selectedStore: blob?.props?.pageProps?.selectedStore || null,
        store: blob?.props?.pageProps?.store || null,
      };
    } catch (e) {
      return null;
    }
  });
  if (!storeData) {
    throw new PreflightError(
      'Could not read __NEXT_DATA__ from heb.com homepage',
      'HEB may have changed page structure or session is invalid — try re-running npm run scrape:login'
    );
  }
  // Inspect first run output, then update this to read the correct field:
  const observedId =
    storeData.curbsideStore?.id ||
    storeData.selectedStore?.id ||
    storeData.store?.id ||
    null;
  if (String(observedId) !== process.env.HEB_STORE_ID) {
    throw new PreflightError(
      `Session is bound to store ${observedId || 'unknown'}, expected ${process.env.HEB_STORE_ID}`,
      'Open heb.com in your browser, change your curbside store to H-E-B McKinney (8700 Eldorado Pkwy, store #794), then re-run npm run scrape:login to capture fresh cookies.'
    );
  }
}

async function checkSchema(mysql) {
  const [columns] = await mysql.execute(`
    SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND ((TABLE_NAME = 'GroceryItems' AND COLUMN_NAME IN ('category_id','heb_product_id','store_location'))
       OR (TABLE_NAME = 'ingredients'  AND COLUMN_NAME IN ('category_id','heb_product_id','store_location'))
       OR (TABLE_NAME = 'category_assignment_audit' AND COLUMN_NAME = 'run_id'))
  `);
  const required = [
    ['GroceryItems', 'category_id'],
    ['GroceryItems', 'heb_product_id'],
    ['GroceryItems', 'store_location'],
    ['ingredients', 'category_id'],
    ['ingredients', 'heb_product_id'],
    ['ingredients', 'store_location'],
    ['category_assignment_audit', 'run_id'],
  ];
  const present = new Set(columns.map(c => `${c.TABLE_NAME}.${c.COLUMN_NAME}`));
  const missing = required.filter(([t, c]) => !present.has(`${t}.${c}`));
  if (missing.length) {
    throw new PreflightError(
      `Missing schema: ${missing.map(([t, c]) => `${t}.${c}`).join(', ')}`,
      'Run migrations from Phase 1 (workflow IDs in MEMORY.md)'
    );
  }
}

async function checkCategories(mysql) {
  const [rows] = await mysql.execute('SELECT COUNT(*) AS n FROM categories');
  if (rows[0].n < 14) {
    throw new PreflightError(
      `categories table has ${rows[0].n} rows (expected ≥ 14)`,
      'Re-run categories seed migration'
    );
  }
}

async function runPreflight(page, mysql) {
  await checkEnv();
  await checkSession();
  await checkStoreBinding(page);
  await checkSchema(mysql);
  await checkCategories(mysql);
}

module.exports = { runPreflight, PreflightError };
```

- [ ] **Step 2: Manual smoke test of preflight**

Create a temporary test script `scripts/test-preflight.js`:

```javascript
// scripts/test-preflight.js — temporary, do not commit
const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const { runPreflight, PreflightError } = require('../src/store-locations/preflight');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ storageState: './cookies/heb-session.json' });
  const page = await ctx.newPage();
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3307, user: 'root',
    password: process.env.DB_PASSWORD, database: 'hsa',
  });
  try {
    await runPreflight(page, conn);
    console.log('✓ Preflight passed');
  } catch (e) {
    if (e instanceof PreflightError) console.error(`✗ ${e.message}\nHint: ${e.hint}`);
    else throw e;
  }
  await browser.close();
  await conn.end();
})();
```

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && HEB_STORE_ID=794 node scripts/test-preflight.js
```

Expected: `✓ Preflight passed`. If `checkStoreBinding` fails because the path to store ID in `__NEXT_DATA__` is wrong, manually inspect the JSON returned by the `evaluate` block and update the candidate paths in `preflight.js` accordingly. Re-run until it passes.

- [ ] **Step 3: Delete the throwaway script and commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && rm scripts/test-preflight.js
```

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add src/store-locations/preflight.js && git commit -m "feat(store-locations): preflight checks (env, session, store binding, schema)"
```

---

### Task 4.1.5: Resilience helpers (WAF detection, session check, fetch with retry)

**Files:**
- Create: `heb-coupon-scraper/src/store-locations/resilience.js`

These helpers are reused by Phase 0 and Phase 1 to handle transient network errors, WAF challenges, and session expirations consistently with existing scraper conventions.

- [ ] **Step 1: Implement helpers**

```javascript
// heb-coupon-scraper/src/store-locations/resilience.js
// Mirrors patterns in cart-manager.js (WAF detection) and clipper.js (isLoginRedirect).

class WafBlockedError extends Error {
  constructor() { super('WAF/Incapsula challenge detected'); this.code = 'WAF_BLOCKED'; }
}
class SessionExpiredError extends Error {
  constructor() { super('Session redirected to login'); this.code = 'SESSION_EXPIRED'; }
}

function isLoginRedirect(url) {
  if (!url) return false;
  return /accounts\.heb\.com/i.test(url) || /\/login(\?|$)/i.test(url);
}

function isWafChallenge(html) {
  if (!html) return false;
  return /incapsula/i.test(html) || /captcha-delivery/i.test(html) || /challenge-platform/i.test(html);
}

/**
 * Wraps page.goto + body sniff. Throws WafBlockedError or SessionExpiredError when applicable.
 */
async function safeGoto(page, url, opts = {}) {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000, ...opts });
  if (isLoginRedirect(page.url())) throw new SessionExpiredError();
  const html = await page.content();
  if (isWafChallenge(html)) throw new WafBlockedError();
  return resp;
}

/**
 * Retries the given async fn up to maxAttempts times with exponential backoff.
 * Bails immediately on WafBlockedError or SessionExpiredError (those are caller-handled).
 */
async function withRetry(fn, { maxAttempts = 3, baseMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn(); }
    catch (e) {
      if (e instanceof WafBlockedError || e instanceof SessionExpiredError) throw e;
      lastErr = e;
      if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, baseMs * Math.pow(5, i)));
    }
  }
  throw lastErr;
}

/**
 * Page-level WAF recovery: pause 60s, navigate to homepage to re-warm cookies, retry once.
 * Returns true if recovery succeeded, false otherwise.
 */
async function attemptWafRecovery(page) {
  console.warn('[resilience] WAF detected — sleeping 60s then re-warming homepage');
  await new Promise(r => setTimeout(r, 60000));
  try {
    await page.goto('https://www.heb.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const html = await page.content();
    return !isWafChallenge(html);
  } catch { return false; }
}

module.exports = { WafBlockedError, SessionExpiredError, safeGoto, withRetry, attemptWafRecovery, isLoginRedirect, isWafChallenge };
```

- [ ] **Step 2: Write basic tests for the pure-function helpers**

```javascript
// heb-coupon-scraper/test/resilience.test.js
const { isLoginRedirect, isWafChallenge, withRetry } = require('../src/store-locations/resilience');

describe('resilience helpers', () => {
  test('isLoginRedirect identifies login URLs', () => {
    expect(isLoginRedirect('https://accounts.heb.com/login')).toBe(true);
    expect(isLoginRedirect('https://www.heb.com/my-account/login')).toBe(true);
    expect(isLoginRedirect('https://www.heb.com/search?q=milk')).toBe(false);
    expect(isLoginRedirect(null)).toBe(false);
  });

  test('isWafChallenge identifies challenge HTML', () => {
    expect(isWafChallenge('<html>incapsula challenge</html>')).toBe(true);
    expect(isWafChallenge('<div class="challenge-platform">')).toBe(true);
    expect(isWafChallenge('<html><body>products</body></html>')).toBe(false);
    expect(isWafChallenge('')).toBe(false);
    expect(isWafChallenge(null)).toBe(false);
  });

  test('withRetry succeeds on first try', async () => {
    let calls = 0;
    const result = await withRetry(async () => { calls++; return 'ok'; });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  test('withRetry retries on transient errors', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => { calls++; if (calls < 3) throw new Error('transient'); return 'ok'; },
      { baseMs: 1 }  // fast for tests
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  test('withRetry gives up after maxAttempts', async () => {
    let calls = 0;
    await expect(withRetry(
      async () => { calls++; throw new Error('persistent'); },
      { maxAttempts: 3, baseMs: 1 }
    )).rejects.toThrow('persistent');
    expect(calls).toBe(3);
  });
});
```

- [ ] **Step 3: Run tests, verify pass**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm test -- resilience
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add src/store-locations/resilience.js test/resilience.test.js && git commit -m "feat(store-locations): WAF + session-expiration + retry helpers"
```

---

### Task 4.2: Phase 0 — `heb_frequent_products` enrichment loop

**Files:**
- Create: `heb-coupon-scraper/src/store-locations/phase0.js`

- [ ] **Step 1: Implement Phase 0 module**

```javascript
// heb-coupon-scraper/src/store-locations/phase0.js
// Uses global fetch (Node 18+); no node-fetch dependency.
const { extractProductLocation } = require('./extract-product-location');
const { buildAuditRow } = require('./build-audit-row');

const CATEGORIZE_URL = 'https://n8n-grocery.needexcelexpert.com/webhook/categorize_heb_product';
const BETWEEN_OPS_DELAY_MS = 3000;
const JITTER_MS = 2000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter() { return BETWEEN_OPS_DELAY_MS + Math.floor(Math.random() * JITTER_MS); }

async function categorizeHebProduct(product) {
  const res = await fetch(CATEGORIZE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: product.product_name,
      brand: product.brand,
      hebProductCategory: product.category,
      hebProductCategoryPath: product.category_path,
    }),
  });
  if (!res.ok) throw new Error(`categorize_heb_product returned ${res.status}`);
  return res.json();
}

async function fetchProductLocation(page, hebProductId) {
  try {
    await page.goto(`https://www.heb.com/product-detail/${hebProductId}`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    const blob = await page.evaluate(() => {
      try { return JSON.parse(document.querySelector('#__NEXT_DATA__').textContent); }
      catch { return null; }
    });
    return extractProductLocation(blob);
  } catch (e) {
    console.warn(`[phase0] Could not fetch productLocation for ${hebProductId}: ${e.message}`);
    return null;
  }
}

/**
 * Enriches heb_frequent_products with user_category_id + store_location.
 * Idempotent — skips rows that already have store_location set.
 */
async function runPhase0({ page, mysql, runId, storeId, dryRun = false, limit = null, log }) {
  const auditRows = [];
  const [products] = await mysql.execute(`
    SELECT id, heb_product_id, product_name, brand, category, category_path, store_location
    FROM heb_frequent_products
    WHERE store_location IS NULL
    ORDER BY id
    ${limit ? `LIMIT ${parseInt(limit, 10)}` : ''}
  `);
  log.info(`[phase0] ${products.length} products to enrich`);

  for (const product of products) {
    const baseAudit = {
      sourceTable: 'heb_frequent_products',
      sourceItemId: product.id,
      sourceItemName: product.product_name,
      runId,
      hebProductId: product.heb_product_id,
      hebProductName: product.product_name,
    };
    try {
      const ai = await categorizeHebProduct(product);
      const aisle = await fetchProductLocation(page, product.heb_product_id);
      const action = dryRun ? 'dry_run'
        : (ai.confidence === 'low' ? 'skipped_low_conf' : 'applied');

      const [catRow] = await mysql.execute(
        'SELECT id FROM categories WHERE name = ? COLLATE utf8mb4_unicode_ci',
        [ai.userCategory]
      );
      const newCategoryId = catRow[0]?.id || null;

      const audit = buildAuditRow({
        ...baseAudit,
        oldCategoryId: null,
        newCategoryId,
        storeLocation: aisle,
        confidence: ai.confidence,
        aiReason: ai.reason,
        action,
      });
      auditRows.push({ ...audit, phase: 0 });

      if (!dryRun && action === 'applied' && newCategoryId) {
        const conn = await mysql.getConnection();
        await conn.beginTransaction();
        try {
          await conn.execute(
            'INSERT INTO category_assignment_audit (source_table, source_item_id, source_item_name, old_category_id, new_category_id, heb_product_id, heb_product_name, store_location, confidence, ai_reason, action, run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [audit.source_table, audit.source_item_id, audit.source_item_name, audit.old_category_id, audit.new_category_id, audit.heb_product_id, audit.heb_product_name, audit.store_location, audit.confidence, audit.ai_reason, audit.action, audit.run_id]
          );
          await conn.execute(
            'UPDATE heb_frequent_products SET store_location = ?, store_id = ? WHERE id = ?',
            [aisle, storeId, product.id]
          );
          await conn.execute(`
            INSERT INTO heb_product_matches (grocery_item_id, grocery_item_name, heb_product_id, heb_product_name, heb_category, store_location, store_id, user_category_id, user_category_confidence, match_source, confidence)
            VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, 'frequently_purchased', ?)
            ON DUPLICATE KEY UPDATE
              store_location = VALUES(store_location),
              store_id = VALUES(store_id),
              user_category_id = VALUES(user_category_id),
              user_category_confidence = VALUES(user_category_confidence)
          `, [product.product_name, product.heb_product_id, product.product_name, product.category, aisle, storeId, newCategoryId, ai.confidence, ai.confidence]);
          await conn.commit();
        } catch (txErr) {
          await conn.rollback();
          throw txErr;
        } finally {
          conn.release();
        }
      }
      log.info(`[phase0] ${action} ${product.product_name} → ${ai.userCategory} (${aisle || 'no aisle'})`);
    } catch (e) {
      log.error(`[phase0] error for ${product.product_name}: ${e.message}`);
      const audit = buildAuditRow({ ...baseAudit, oldCategoryId: null, action: 'error', aiReason: e.message });
      auditRows.push({ ...audit, phase: 0 });
      if (!dryRun) {
        await mysql.execute(
          'INSERT INTO category_assignment_audit (source_table, source_item_id, source_item_name, action, ai_reason, run_id) VALUES (?, ?, ?, ?, ?, ?)',
          [audit.source_table, audit.source_item_id, audit.source_item_name, audit.action, audit.ai_reason, audit.run_id]
        );
      }
    }
    await sleep(jitter());
  }
  return auditRows;
}

module.exports = { runPhase0 };
```

- [ ] **Step 2: Commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add src/store-locations/phase0.js && git commit -m "feat(store-locations): phase 0 frequent-products enrichment"
```

---

### Task 4.3: Phase 1 — catalog scrape loop

**Files:**
- Create: `heb-coupon-scraper/src/store-locations/phase1.js`

- [ ] **Step 1: Implement Phase 1 module**

```javascript
// heb-coupon-scraper/src/store-locations/phase1.js
// Uses global fetch (Node 18+).
const { searchProducts } = require('../cart-manager');
const { extractProductLocationFromSearchResult } = require('./extract-product-location');
const { buildAuditRow } = require('./build-audit-row');

const SMART_MATCH_URL = 'https://n8n-grocery.needexcelexpert.com/webhook/smart_match_grocery';
const BETWEEN_OPS_DELAY_MS = 3000;
const JITTER_MS = 2000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter() { return BETWEEN_OPS_DELAY_MS + Math.floor(Math.random() * JITTER_MS); }

/**
 * Cache lookup: has this item already been categorized via heb_product_matches?
 * Returns { userCategoryId, storeLocation, hebProductId, hebProductName, confidence } or null.
 */
async function lookupCachedMatch(mysql, itemName) {
  const [rows] = await mysql.execute(`
    SELECT user_category_id, store_location, heb_product_id, heb_product_name, user_category_confidence AS confidence
    FROM heb_product_matches
    WHERE grocery_item_name = ?
      AND user_category_id IS NOT NULL
      AND user_category_confidence IN ('high','medium')
    ORDER BY updated_at DESC LIMIT 1
  `, [itemName]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    userCategoryId: r.user_category_id,
    storeLocation: r.store_location,
    hebProductId: r.heb_product_id,
    hebProductName: r.heb_product_name,
    confidence: r.confidence,
  };
}

/**
 * Calls Smart Match for a single item and returns the match (or null).
 * Captures productLocation from the search results so we don't need a second request.
 */
async function smartMatchSingle(page, mysql, item) {
  const results = await searchProducts(page, item.name, { maxResults: 12, fastMode: true });
  if (!results.success || !results.products?.length) return null;

  const res = await fetch(SMART_MATCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: String(item.id), name: item.name }],
      candidates: results.products.slice(0, 12),
      frequentProducts: [],
    }),
  });
  if (!res.ok) throw new Error(`smart_match returned ${res.status}`);
  const data = await res.json();
  const match = data.matches?.[0];
  if (!match) return null;
  const matchedProduct = results.products.find(p => p.id === match.hebProductId);
  if (!matchedProduct) return null; // hallucinated id, drop
  return {
    hebProductId: match.hebProductId,
    hebProductName: matchedProduct.name,
    userCategory: match.userCategory,
    confidence: match.matchConfidence,
    reason: match.matchReason,
    storeLocation: extractProductLocationFromSearchResult(matchedProduct),
  };
}

/**
 * Runs Phase 1 over rows from a catalog table (GroceryItems or ingredients).
 * Updates the catalog row's category_id, heb_product_id, store_location, store_id, store_loc_scraped_at.
 */
async function runPhase1ForTable({
  page, mysql, runId, storeId, sourceTable,
  idColumn, nameColumn, categoryColumn, dryRun = false, limit = null, log,
}) {
  const auditRows = [];
  const { buildWorkQueue } = require('./build-work-queue');

  const [items] = await mysql.execute(`
    SELECT ${idColumn} AS id, ${nameColumn} AS name, ${categoryColumn} AS old_category_id
    FROM ${sourceTable}
    WHERE store_loc_scraped_at IS NULL
       OR store_loc_scraped_at < NOW() - INTERVAL 90 DAY
    ${limit ? `LIMIT ${parseInt(limit, 10)}` : ''}
  `);
  const [audit] = await mysql.execute(
    'SELECT source_item_id, action, created_at FROM category_assignment_audit WHERE source_table = ?',
    [sourceTable]
  );
  const queue = buildWorkQueue(items, audit, { freshnessDays: 90 });
  log.info(`[phase1:${sourceTable}] ${queue.length} items to process (${items.length - queue.length} skipped via audit)`);

  for (const item of queue) {
    const baseAudit = {
      sourceTable, sourceItemId: item.id, sourceItemName: item.name,
      runId, oldCategoryId: item.old_category_id,
    };
    try {
      let match = await lookupCachedMatch(mysql, item.name);
      let cacheHit = match !== null;
      if (!match) match = await smartMatchSingle(page, mysql, item);

      if (!match) {
        const audit = buildAuditRow({ ...baseAudit, action: 'no_match' });
        auditRows.push({ ...audit, phase: 1 });
        if (!dryRun) await insertAudit(mysql, audit);
        log.info(`[phase1] no_match ${item.name}`);
        continue;
      }

      const action = dryRun ? 'dry_run'
        : (match.confidence === 'low' ? 'skipped_low_conf' : 'applied');

      const [catRow] = await mysql.execute(
        'SELECT id FROM categories WHERE name = ? COLLATE utf8mb4_unicode_ci',
        [match.userCategory]
      );
      const newCategoryId = catRow[0]?.id || null;

      const audit = buildAuditRow({
        ...baseAudit, newCategoryId,
        hebProductId: match.hebProductId,
        hebProductName: match.hebProductName,
        storeLocation: match.storeLocation,
        confidence: match.confidence,
        aiReason: match.reason || (cacheHit ? 'cached match from heb_product_matches' : ''),
        action,
      });
      auditRows.push({ ...audit, phase: 1 });

      if (!dryRun && action === 'applied' && newCategoryId) {
        const conn = await mysql.getConnection();
        await conn.beginTransaction();
        try {
          await conn.execute(
            `INSERT INTO category_assignment_audit (source_table, source_item_id, source_item_name, old_category_id, new_category_id, heb_product_id, heb_product_name, store_location, confidence, ai_reason, action, run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [audit.source_table, audit.source_item_id, audit.source_item_name, audit.old_category_id, audit.new_category_id, audit.heb_product_id, audit.heb_product_name, audit.store_location, audit.confidence, audit.ai_reason, audit.action, audit.run_id]
          );
          await conn.execute(
            `UPDATE ${sourceTable} SET category_id = ?, heb_product_id = ?, store_location = ?, store_id = ?, store_loc_scraped_at = NOW() WHERE ${idColumn} = ?`,
            [newCategoryId, match.hebProductId, match.storeLocation, storeId, item.id]
          );
          await conn.execute(`
            INSERT INTO heb_product_matches (grocery_item_id, grocery_item_name, heb_product_id, heb_product_name, store_location, store_id, user_category_id, user_category_confidence, match_source, confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'search', ?)
            ON DUPLICATE KEY UPDATE
              store_location = VALUES(store_location),
              store_id = VALUES(store_id),
              user_category_id = VALUES(user_category_id),
              user_category_confidence = VALUES(user_category_confidence)
          `, [item.id, item.name, match.hebProductId, match.hebProductName, match.storeLocation, storeId, newCategoryId, match.confidence, match.confidence]);
          await conn.commit();
        } catch (txErr) {
          await conn.rollback();
          throw txErr;
        } finally {
          conn.release();
        }
      } else if (!dryRun) {
        await insertAudit(mysql, audit);
      }
      log.info(`[phase1] ${action} ${item.name} → ${match.userCategory} (${match.storeLocation || 'no aisle'})${cacheHit ? ' [cached]' : ''}`);
    } catch (e) {
      log.error(`[phase1] error for ${item.name}: ${e.message}`);
      const audit = buildAuditRow({ ...baseAudit, action: 'error', aiReason: e.message });
      auditRows.push({ ...audit, phase: 1 });
      if (!dryRun) await insertAudit(mysql, audit);
    }
    await sleep(jitter());
  }
  return auditRows;
}

async function insertAudit(mysql, audit) {
  await mysql.execute(
    `INSERT INTO category_assignment_audit (source_table, source_item_id, source_item_name, old_category_id, new_category_id, heb_product_id, heb_product_name, store_location, confidence, ai_reason, action, run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [audit.source_table, audit.source_item_id, audit.source_item_name, audit.old_category_id, audit.new_category_id, audit.heb_product_id, audit.heb_product_name, audit.store_location, audit.confidence, audit.ai_reason, audit.action, audit.run_id]
  );
}

async function runPhase1(opts) {
  const fromGI = await runPhase1ForTable({
    ...opts, sourceTable: 'GroceryItems',
    idColumn: 'ItemID', nameColumn: 'ItemName', categoryColumn: 'category_id',
  });
  const fromIng = await runPhase1ForTable({
    ...opts, sourceTable: 'ingredients',
    idColumn: 'ingredient_id', nameColumn: 'ingredient_name', categoryColumn: 'category_id',
  });
  return [...fromGI, ...fromIng];
}

module.exports = { runPhase1 };
```

- [ ] **Step 2: Commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add src/store-locations/phase1.js && git commit -m "feat(store-locations): phase 1 catalog scrape with caching"
```

---

### Task 4.4: Main orchestrator + CLI

**Files:**
- Create: `heb-coupon-scraper/src/scrape-store-locations.js`

- [ ] **Step 1: Implement orchestrator**

```javascript
// heb-coupon-scraper/src/scrape-store-locations.js
const { Command } = require('commander');
const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const winston = require('winston');
const path = require('path');
const config = require('./config');
const { runPreflight, PreflightError } = require('./store-locations/preflight');
const { runPhase0 } = require('./store-locations/phase0');
const { runPhase1 } = require('./store-locations/phase1');
const { buildRunSummary, formatRunSummary } = require('./store-locations/build-run-summary');

const program = new Command();
program
  .option('--phase <n>', 'Run specific phase (0 or 1)')
  .option('--dry-run', 'Run pipeline without writing changes')
  .option('--limit <n>', 'Process at most N items (smoke test)')
  .option('--max-age-days <n>', 'Re-scrape items older than N days', '90')
  .parse(process.argv);

const opts = program.opts();

function makeRunId() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `run_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

const log = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.printf(({ level, message, timestamp }) => `${timestamp} [${level}] ${message}`)),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(config.logging.dir, 'scrape-store-locations.log') }),
  ],
});

(async () => {
  const runId = makeRunId();
  log.info(`Starting ${runId} (phase=${opts.phase || 'all'}, dryRun=${!!opts.dryRun}, limit=${opts.limit || 'none'})`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ storageState: config.browser.cookiePath });
  const page = await ctx.newPage();
  const pool = await mysql.createPool({
    host: config.db.host, port: config.db.port,
    user: config.db.user, password: config.db.password, database: config.db.database,
    connectionLimit: 4,
  });

  const startTs = Date.now();
  let auditRows = [];

  try {
    await runPreflight(page, pool);
    log.info('Preflight passed');

    const sharedOpts = {
      page, mysql: pool, runId, storeId: process.env.HEB_STORE_ID,
      dryRun: !!opts.dryRun, limit: opts.limit ? parseInt(opts.limit, 10) : null, log,
    };

    if (!opts.phase || opts.phase === '0') {
      log.info('--- Phase 0 ---');
      auditRows = auditRows.concat(await runPhase0(sharedOpts));
    }
    if (!opts.phase || opts.phase === '1') {
      log.info('--- Phase 1 ---');
      auditRows = auditRows.concat(await runPhase1(sharedOpts));
    }
  } catch (e) {
    if (e instanceof PreflightError) {
      log.error(`Preflight failed: ${e.message}\nHint: ${e.hint}`);
      process.exit(1);
    }
    log.error(`Run failed: ${e.message}\n${e.stack}`);
    process.exit(2);
  } finally {
    await browser.close();
  }

  const walltimeSec = Math.floor((Date.now() - startTs) / 1000);
  const summary = buildRunSummary(auditRows, runId, walltimeSec);
  console.log(formatRunSummary(summary));

  await pool.end();
  process.exit(0);
})();
```

- [ ] **Step 2: Add npm scripts to `package.json`**

Add to the `scripts` block:

```json
"scrape:store-locations": "node src/scrape-store-locations.js",
"scrape:store-locations:dry": "node src/scrape-store-locations.js --dry-run --limit=10"
```

- [ ] **Step 3: Commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add src/scrape-store-locations.js package.json && git commit -m "feat(store-locations): main orchestrator + npm scripts"
```

---

### Task 4.5: Live smoke test

- [ ] **Step 1: Set up `.env` and verify session**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && grep -q '^HEB_STORE_ID=' .env || echo 'HEB_STORE_ID=794' >> .env
cd "c:/New Grocery App/heb-coupon-scraper" && grep -q '^HEB_STORE_NAME=' .env || echo 'HEB_STORE_NAME=H-E-B McKinney' >> .env
```

Confirm session is bound to McKinney: open heb.com manually, change curbside store to **H-E-B McKinney (8700 Eldorado Pkwy)**, then:

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm run scrape:login
```

- [ ] **Step 2: Run dry-run smoke test**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm run scrape:store-locations:dry
```

Expected:
- Preflight passes
- 10 items processed (no DB writes)
- Run summary printed showing `Phase 0` and/or `Phase 1` counts
- Sample audit rows printed via the log
- Wall time 1-2 minutes

If preflight fails on store binding, manually inspect the path to `selectedStore`/`curbsideStore` in the homepage `__NEXT_DATA__` blob and update `preflight.js:checkStoreBinding`.

- [ ] **Step 3: Inspect dry-run output and verify category assignments look reasonable**

Pick 3 items from the log output. For each: does the assigned `userCategory` match what you'd expect? If anything looks egregiously wrong, capture the example for the golden-set fixture in Phase 6.

- [ ] **Step 4: Commit any preflight path adjustments**

If `preflight.js:checkStoreBinding` needed correction, commit:

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add src/store-locations/preflight.js && git commit -m "fix(store-locations): correct __NEXT_DATA__ path for store binding check"
```

---

## Phase 5 — Backend + frontend integration

### Task 5.1: Update `Pull Grocery Staples` workflow to return `store_location`

**Workflow:** `Pull Grocery Staples` (ID: `JoaR6klT950hwSLB`)

Per `MEMORY.md`: workflow joins GroceryItems + WGL + categories. Must add `store_location` to SELECT, COALESCE'd between `g.store_location` and `i.store_location`.

- [ ] **Step 1: Inspect the current workflow's main MySQL node query**

```bash
mcp__n8n-mcp__n8n_get_workflow with id="JoaR6klT950hwSLB"
```

Locate the MySQL node containing the SELECT/UNION that returns the user's grocery items. Record its node name.

- [ ] **Step 2: Modify the SELECT to include `store_location`**

For each branch of the UNION (staples / meals), add `store_location` to the SELECT list. The COALESCE shape:

```sql
-- staples branch
COALESCE(g.store_location, NULL) AS store_location,

-- meals branch
COALESCE(i.store_location, NULL) AS store_location,
```

Use `mcp__n8n-mcp__n8n_update_partial_workflow` with an `updateNode` operation to update the MySQL node's `query` field.

- [ ] **Step 3: Test via webhook**

```bash
curl 'https://n8n-grocery.needexcelexpert.com/webhook/grocery_items?weekDateRange=2026-04-26'
```

Expected: response items include `store_location` field (string or null).

- [ ] **Step 4: Memory-update + commit**

Add to MEMORY.md note for `Pull Grocery Staples (ID: JoaR6klT950hwSLB)`: "Updated 2026-04-XX (HEB store-locations Phase 5). Added `store_location` to SELECT via COALESCE(g.store_location, i.store_location)."

```bash
cd "c:/New Grocery App/grocery-checklist-app" && git add docs/superpowers/plans/2026-04-26-heb-store-locations.md && git commit -m "docs: memory update — Pull Grocery Staples returns store_location"
```

---

### Task 5.2: Update `InStoreMode.js` — secondary sort + aisle badge

**Files:**
- Modify: `grocery-checklist-app/src/components/InStoreMode.js`

- [ ] **Step 1: Locate the items-sort logic**

```bash
grep -n "sort\|walk_order\|category" "c:/New Grocery App/grocery-checklist-app/src/components/InStoreMode.js" | head -40
```

Identify where items are grouped by category and ordered. Note the line numbers.

- [ ] **Step 2: Add `aisleSortKey` helper near top of component file**

Insert after imports:

```javascript
function aisleSortKey(loc) {
  if (typeof loc !== 'string' || loc.trim() === '') return 9999;
  const m = loc.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return 8000;
}

function formatAisleBadge(loc) {
  if (!loc) return '—';
  const m = loc.match(/aisle\s*(\d+)/i);
  if (m) return `A${m[1]}`;
  return loc.slice(0, 4); // "Produce" → "Prod"
}
```

- [ ] **Step 3: Apply secondary sort within each category group**

Find the block that renders items per category (likely a `.filter(item => item.category_id === c.id).map(...)` or similar). Wrap the filter result in a sort:

```javascript
.filter(item => item.category_id === c.id)
.sort((a, b) => aisleSortKey(a.store_location) - aisleSortKey(b.store_location))
.map(item => /* existing render */)
```

- [ ] **Step 4: Add aisle badge to the item row JSX**

Locate the item-row JSX. Add a badge next to the item name:

```jsx
<span className="text-xs font-mono text-gray-500 ml-2">{formatAisleBadge(item.store_location)}</span>
```

Adjust `className` to match existing Tailwind conventions in the file.

- [ ] **Step 5: Manual smoke test in browser**

```bash
cd "c:/New Grocery App/grocery-checklist-app" && npm start
```

Navigate to `#shop`. Verify:
- Items still group by category
- Within a category, items with lower aisle numbers appear first
- Badge shows e.g. `A14`, `Prod`, or `—`

If `store_location` is null for every item (because Phase 4.5 was a `--dry-run`), the sort still works (everything sorts to end) and badges all show `—`. That's expected pre-real-run.

- [ ] **Step 6: Commit**

```bash
cd "c:/New Grocery App/grocery-checklist-app" && git add src/components/InStoreMode.js && git commit -m "feat(in-store): aisle-aware secondary sort + badge"
```

---

## Phase 6 — Acceptance: golden set + first real run + spot-check

### Task 6.1: Build `categorization-golden.json` fixture

**Files:**
- Create: `heb-coupon-scraper/test/fixtures/categorization-golden.json`

- [ ] **Step 1: Hand-curate ~30 items spanning all 14 categories**

```json
[
  {"name": "Banana", "expectedCategory": "Fruit & vegetables", "notes": "trivial Produce"},
  {"name": "Strawberries", "expectedCategory": "Fruit & vegetables", "notes": ""},
  {"name": "H-E-B Bakery French Bread", "expectedCategory": "Bakery & bread", "notes": ""},
  {"name": "H-E-B Bakery Tortillas", "expectedCategory": "Bakery & bread", "notes": "could be miscategorized as International"},
  {"name": "Boar's Head Sliced Turkey", "expectedCategory": "Deli & prepared food", "notes": ""},
  {"name": "H-E-B Boneless Skinless Chicken Breast", "expectedCategory": "Meat & seafood", "notes": ""},
  {"name": "Salmon Fillet", "expectedCategory": "Meat & seafood", "notes": ""},
  {"name": "H-E-B Whole Milk", "expectedCategory": "Dairy & eggs", "notes": ""},
  {"name": "Eggs", "expectedCategory": "Dairy & eggs", "notes": ""},
  {"name": "Greek Yogurt", "expectedCategory": "Dairy & eggs", "notes": ""},
  {"name": "Cheerios", "expectedCategory": "Cereal & breakfast", "notes": ""},
  {"name": "Quaker Oatmeal", "expectedCategory": "Cereal & breakfast", "notes": ""},
  {"name": "Spaghetti", "expectedCategory": "Pasta, rice & grains", "notes": ""},
  {"name": "Jasmine Rice", "expectedCategory": "Pasta, rice & grains", "notes": ""},
  {"name": "Olive Oil", "expectedCategory": "Pantry staples", "notes": "ambiguous: could be International"},
  {"name": "Peanut Butter", "expectedCategory": "Pantry staples", "notes": ""},
  {"name": "Honey", "expectedCategory": "Pantry staples", "notes": ""},
  {"name": "Kikkoman Soy Sauce", "expectedCategory": "Condiments & sauces", "notes": ""},
  {"name": "Heinz Ketchup", "expectedCategory": "Condiments & sauces", "notes": ""},
  {"name": "Cumin", "expectedCategory": "Spices & seasonings", "notes": ""},
  {"name": "Salt", "expectedCategory": "Spices & seasonings", "notes": ""},
  {"name": "Lays Potato Chips", "expectedCategory": "Snacks", "notes": ""},
  {"name": "Almonds", "expectedCategory": "Snacks", "notes": "could be Pantry"},
  {"name": "Coca-Cola", "expectedCategory": "Beverages", "notes": ""},
  {"name": "Topo Chico", "expectedCategory": "Beverages", "notes": ""},
  {"name": "Folgers Coffee", "expectedCategory": "Beverages", "notes": "could be Pantry"},
  {"name": "Bounty Paper Towels", "expectedCategory": "Household & other", "notes": ""},
  {"name": "Tide Detergent", "expectedCategory": "Household & other", "notes": ""},
  {"name": "Frozen Pizza", "expectedCategory": "Frozen food", "notes": ""},
  {"name": "Blue Bell Vanilla Ice Cream", "expectedCategory": "Frozen food", "notes": ""},
  {"name": "Random unique birthday card", "expectedCategory": "One-off items", "notes": "deliberately oddball"}
]
```

- [ ] **Step 2: Commit fixture**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add test/fixtures/categorization-golden.json && git commit -m "test(store-locations): golden-set fixture for categorization calibration"
```

---

### Task 6.2: Golden-set test runner

**Files:**
- Create: `heb-coupon-scraper/test/categorization-golden.test.js`

- [ ] **Step 1: Write the test**

```javascript
// heb-coupon-scraper/test/categorization-golden.test.js
const golden = require('./fixtures/categorization-golden.json');

const SMART_MATCH_URL = 'https://n8n-grocery.needexcelexpert.com/webhook/smart_match_grocery';
const MIN_AGREEMENT_PCT = 90;

describe('AI categorization — golden set', () => {
  const items = golden.map((g, i) => ({ id: String(i), name: g.name }));

  test(`Smart Match agrees on ≥${MIN_AGREEMENT_PCT}% of golden-set categories`, async () => {
    if (!process.env.RUN_GOLDEN_TEST) {
      console.warn('Skipping golden-set test (set RUN_GOLDEN_TEST=1 to run live)');
      return;
    }
    const res = await fetch(SMART_MATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, candidates: [], frequentProducts: [] }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    const matches = data.matches || [];

    let hits = 0;
    const mismatches = [];
    for (const item of golden) {
      const m = matches.find(x => x.groceryItemId === String(items.findIndex(i => i.name === item.name)));
      const got = m?.userCategory;
      if (got === item.expectedCategory) hits++;
      else mismatches.push({ name: item.name, expected: item.expectedCategory, got, notes: item.notes });
    }
    const pct = Math.round(100 * hits / golden.length);
    if (mismatches.length) {
      console.log('Mismatches:');
      console.log(mismatches.map(m => `  ${m.name}: expected "${m.expected}", got "${m.got}" ${m.notes ? `(${m.notes})` : ''}`).join('\n'));
    }
    expect(pct).toBeGreaterThanOrEqual(MIN_AGREEMENT_PCT);
  }, 60000);
});
```

- [ ] **Step 2: Run the golden-set test live**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && RUN_GOLDEN_TEST=1 npm test -- categorization-golden
```

Expected: agreement ≥ 90%. If lower, review the mismatches:
- If labels are wrong (your judgment, not AI's), update the golden-set fixture.
- If AI is wrong on multiple "easy" items, revisit the Smart Match prompt in Task 2.1.

- [ ] **Step 3: Commit**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && git add test/categorization-golden.test.js && git commit -m "test(store-locations): golden-set agreement test"
```

---

### Task 6.3: First real run + acceptance verification

- [ ] **Step 1: Pre-flight — ensure migrations are applied + .env set**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && grep HEB_STORE_ID .env
```

- [ ] **Step 2: Full dry-run preview (no writes, ~50 min)**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm run scrape:store-locations -- --dry-run
```

Save the run summary output. Scan the log for any category assignments that look obviously wrong. If you see ≥3 egregious miscategorizations on common items, pause and revisit the Smart Match prompt before doing a real run.

- [ ] **Step 3: First real run**

```bash
cd "c:/New Grocery App/heb-coupon-scraper" && npm run scrape:store-locations 2>&1 | tee logs/first-run.log
```

Expected wall time: ~50 min.

Acceptance criterion #1 — Run completes with exit 0.

- [ ] **Step 4: Verify coverage thresholds (acceptance #2)**

```sql
SELECT
  source_table,
  COUNT(*) AS total,
  SUM(action='applied') AS applied,
  ROUND(100*SUM(action='applied')/COUNT(*),0) AS applied_pct,
  SUM(action='applied' AND store_location IS NOT NULL) AS with_aisle,
  ROUND(100*SUM(action='applied' AND store_location IS NOT NULL)/NULLIF(SUM(action='applied'),0),0) AS aisle_pct
FROM category_assignment_audit
WHERE run_id = '<run_id from step 3>'
GROUP BY source_table;
```

Expected: `applied_pct ≥ 80`, `aisle_pct ≥ 70`. If lower, investigate the audit rows with `action != 'applied'`.

- [ ] **Step 5: Verify rollback works (acceptance #3)**

Pick a single item and verify rollback for that one row:

```sql
-- Capture current state of one item
SELECT id, ItemName, category_id, store_location FROM GroceryItems WHERE id = (SELECT source_item_id FROM category_assignment_audit WHERE run_id = '<run_id>' AND source_table = 'GroceryItems' AND action = 'applied' LIMIT 1);

-- Apply rollback for that one item
UPDATE GroceryItems g
JOIN category_assignment_audit a ON a.source_item_id = g.ItemID
SET g.category_id = a.old_category_id,
    g.store_location = NULL,
    g.heb_product_id = NULL,
    g.store_loc_scraped_at = NULL
WHERE a.run_id = '<run_id>'
  AND a.source_table = 'GroceryItems'
  AND a.action = 'applied'
  AND g.ItemID = <chosen_id>;

-- Verify row matches old state
SELECT id, ItemName, category_id, store_location FROM GroceryItems WHERE id = <chosen_id>;

-- Re-apply by re-running scraper for just that item (or accept it stays rolled back)
```

- [ ] **Step 6: Verify In-Store Mode renders correctly (acceptance #4)**

Open the app at `#shop` for the current week. Confirm:
- Items group by category
- Within a category, items sort by aisle number ascending
- Aisle badges appear and look reasonable

- [ ] **Step 7: Spot-check 50 random `applied` rows (acceptance #5)**

```sql
SELECT source_item_name, old_category_id, new_category_id,
       (SELECT name FROM categories WHERE id = old_category_id) AS old_name,
       (SELECT name FROM categories WHERE id = new_category_id) AS new_name,
       store_location, confidence, ai_reason
FROM category_assignment_audit
WHERE run_id = '<run_id>' AND action = 'applied'
ORDER BY RAND() LIMIT 50;
```

For each row: does the new category match what you'd expect for that item? Pass: ≥45/50 (90%) correct. Mismatches go in a notes file for follow-up.

- [ ] **Step 8: Commit log + acceptance notes**

```bash
mkdir -p "c:/New Grocery App/grocery-checklist-app/docs/superpowers/runlogs/"
cp "c:/New Grocery App/heb-coupon-scraper/logs/first-run.log" "c:/New Grocery App/grocery-checklist-app/docs/superpowers/runlogs/2026-04-XX-store-locations-first-run.log"
```

Create `docs/superpowers/runlogs/2026-04-XX-store-locations-acceptance.md` with the spot-check results and any miscategorizations you noticed (for use in future prompt iterations).

```bash
cd "c:/New Grocery App/grocery-checklist-app" && git add docs/superpowers/runlogs/ && git commit -m "docs: first run log + acceptance notes for store-locations scraper"
```

---

## Phase 7 — Documentation

### Task 7.1: Update MEMORY.md

**Files:**
- Modify: `C:/Users/Corey/.claude/projects/c--New-Grocery-App-grocery-checklist-app/memory/MEMORY.md`

- [ ] **Step 1: Add new memory section**

Append under "n8n Workflows Created" (or a new "HEB Store-Aligned Categories" topic file linked from MEMORY.md):

```markdown
## HEB Store-Aligned Categories (2026-04-XX)
- **Bug ref:** app_feedback #41
- **Spec:** docs/superpowers/specs/2026-04-26-heb-store-locations-design.md
- **Plan:** docs/superpowers/plans/2026-04-26-heb-store-locations.md
- **Store of record:** H-E-B McKinney #794. `HEB_STORE_ID=794` is required in `heb-coupon-scraper/.env`.
- **First run completed:** <date>, run_id `<run_id>`. Coverage: ~<applied_pct>% applied, ~<aisle_pct>% with aisle.
- **Refresh cadence:** 90-day freshness window. Re-run via `npm run scrape:store-locations`.
- **Rollback:** SQL one-liner from spec §9, scoped by run_id.
- **Smart Match extension:** workflow DDlygjzqHlLs4V1E now returns `userCategory` enum-constrained to the 14 walk-order categories.
- **New workflow:** `Categorize HEB Product` (ID: <id>) — POST /categorize_heb_product. Used for Phase 0 (cached frequent products).
- **`heb_product_id` is the canonical join key** for cross-table category consistency. One AI call per unique HEB product, regardless of catalog table count.
- **In-Store Mode now sorts by aisle within each category.** Items with no aisle data sort to the end of their group.
```

- [ ] **Step 2: Commit memory update**

Note: MEMORY.md lives outside the project repo, so commit happens in the appropriate location:

```bash
# If memory dir is git-tracked separately:
cd "C:/Users/Corey/.claude/projects/c--New-Grocery-App-grocery-checklist-app/memory" && git add MEMORY.md && git commit -m "memory: HEB store-aligned categories shipped"
```

If memory dir is not under git control, just save the file — the auto-memory system handles persistence.

---

## Self-review checklist

After implementation, verify against the spec:

- [ ] Spec §4.1 schema columns: all present (Tasks 1.1–1.5)
- [ ] Spec §4.2 audit table: created (Task 1.5)
- [ ] Spec §4.3 conditional `ingredients.category_id`: addressed (Task 1.2)
- [ ] Spec §5.1 5-stage pipeline: orchestrator wires it (Task 4.4)
- [ ] Spec §5.2 Smart Match extension + new Categorize workflow: both implemented (Tasks 2.1, 2.2)
- [ ] Spec §5.3 aisle capture (search-results path + product-detail path): both in phase0/phase1 modules
- [ ] Spec §5.4 audit-driven idempotency: implemented in `buildWorkQueue` (Task 3.3)
- [ ] Spec §5.5 per-item transactions: phase0 + phase1 use beginTransaction/commit
- [ ] Spec §5.6 cross-table consistency via `heb_product_id`: implemented in `lookupCachedMatch`
- [ ] Spec §5.7 confidence-gated overwrite: dryRun/skipped_low_conf/applied paths in both phases
- [ ] Spec §5.8 concurrency + WAF + session: BETWEEN_OPS_DELAY honored; WAF/session detection per existing patterns
- [ ] Spec §6 In-Store Mode integration: backend (Task 5.1) + frontend (Task 5.2)
- [ ] Spec §7 error handling: preflight + per-item try/catch + run summary canary all present
- [ ] Spec §8 CLI flags: `--phase`, `--dry-run`, `--limit`, `--max-age-days` in commander setup
- [ ] Spec §9 rollback: covered by audit-table queries; verified in Task 6.3 step 5
- [ ] Spec §10 testing: unit tests (Phase 3), golden-set (Task 6.2), smoke (Task 4.5), full dry-run (Task 6.3 step 2), acceptance criteria (Task 6.3 steps 4-7)

---

**End of plan.**
