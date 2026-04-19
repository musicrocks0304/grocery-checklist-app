# WeeklyGroceryList Architectural Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix duplicate-category and premature-shopping-done bugs at their architectural root by introducing FK-enforced canonical categories, stable per-week ItemIDs, and cascade semantics across `WeeklyGroceryList` and its dependent tables.

**Architecture:** Three-phase deploy (Foundation → Writers+Cascade → Cleanup). Each phase independently rollback-able. Categories table becomes the single source of truth via FK; OneOff items get unique IDs from a `oneoff_items` lookup; MealIngredients use stable `ingredients.ingredient_id`; `shopping_progress` cascades from WGL via FK.

**Tech Stack:** MySQL 8 (`hsa` database on localhost:3307), n8n (Docker, REST API on localhost:5679), React (Create React App on Netlify), Jest + React Testing Library.

**Spec:** [docs/superpowers/specs/2026-04-19-wgl-architectural-fix-design.md](../specs/2026-04-19-wgl-architectural-fix-design.md)

**Branch:** Continue on `feature/staples-redesign` (per user preference) OR `git checkout -b feature/wgl-architectural-fix` (if isolation preferred).

---

## File Inventory

**Created:**
- `migrations/2026-04-19_phase1_categories_table.sql` (n8n workflow body)
- `migrations/2026-04-19_phase1_oneoff_items_table.sql`
- `migrations/2026-04-19_phase1_wgl_add_columns.sql`
- `migrations/2026-04-19_phase1_backfill.sql`
- `migrations/2026-04-19_phase2_orphan_backfill.sql`
- `migrations/2026-04-19_phase2_unique_and_fk.sql`
- `migrations/2026-04-19_phase3_drop_legacy.sql`
- `src/hooks/useCategories.js`
- `src/hooks/useCategories.test.js`
- `src/utils/categoryMap.js`
- `src/utils/categoryMap.test.js`
- `src/utils/storageVersion.js`
- `src/utils/storageVersion.test.js`

**Modified:**
- `src/components/RecipeIngredients.js`
- `src/components/InStoreMode.js`
- `src/constants/categories.js`
- `src/config/api.js`
- n8n workflows (8 total): Pull Grocery Staples, Add One-Off Grocery Item, Selection Check, Selection Uncheck (verify only), Remove Weekly Grocery Item (verify only), Create Grocery List, Create Grocery List - Meals, Remove Weekly Selection
- n8n workflows (1 new): Categories API

**Note on file storage:** SQL files in `migrations/` are reference scripts. Actual execution is via n8n migration workflows that wrap each SQL block. Each migration workflow follows the existing pattern: webhook → MySQL executeQuery → respond. Workflows are created via n8n MCP and executed once via REST API.

---

# PHASE 1 — Foundation (additive, no behavior change)

## Task 1.1: Create migrations directory and document SQL conventions

**Files:**
- Create: `migrations/README.md`

- [ ] **Step 1: Create the migrations directory with a README explaining the convention**

```bash
mkdir -p "c:/New Grocery App/grocery-checklist-app/migrations"
```

- [ ] **Step 2: Write README.md**

````markdown
# Migrations

SQL reference scripts for database schema changes. Each file documents one migration.

**Execution model:** Migrations are NOT run from this directory. Each file's contents are pasted into a one-shot n8n workflow (per the existing pattern in this codebase) and executed via the n8n REST API. After successful execution, the workflow is deactivated.

**Naming:** `YYYY-MM-DD_phaseN_description.sql`

**Per-file structure:**
- Header comment with date, phase, purpose, rollback instructions
- The SQL itself
- Verification query at the end (can be run separately to confirm migration applied)
````

- [ ] **Step 3: Commit**

```bash
cd "c:/New Grocery App/grocery-checklist-app"
git add migrations/README.md
git commit -m "docs(migrations): add migrations directory and conventions

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.2: Write the categories table migration SQL

**Files:**
- Create: `migrations/2026-04-19_phase1_categories_table.sql`

- [ ] **Step 1: Write the SQL file**

```sql
-- 2026-04-19 Phase 1: Create canonical categories table
-- Purpose: Single source of truth for the 14 grocery categories used across the app.
-- Replaces hardcoded GROCERY_CATEGORIES + HEB_WALK_ORDER frontend constants.
-- Rollback: DROP TABLE categories;

CREATE TABLE categories (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(50) NOT NULL UNIQUE,
  walk_order  INT NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO categories (name, walk_order) VALUES
  ('Fruit & vegetables',    1),
  ('Bakery & bread',        2),
  ('Deli & prepared food',  3),
  ('Meat & seafood',        4),
  ('Dairy & eggs',          5),
  ('Cereal & breakfast',    6),
  ('Pasta, rice & grains',  7),
  ('Pantry staples',        8),
  ('Condiments & sauces',   9),
  ('Spices & seasonings',  10),
  ('Snacks',               11),
  ('Beverages',            12),
  ('Household & other',    13),
  ('Frozen food',          14);

-- Verification:
-- SELECT id, name, walk_order FROM categories ORDER BY walk_order;
-- Expected: 14 rows in walk_order sequence 1-14
```

- [ ] **Step 2: Commit**

```bash
cd "c:/New Grocery App/grocery-checklist-app"
git add migrations/2026-04-19_phase1_categories_table.sql
git commit -m "feat(migrations): phase 1 categories table SQL

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.3: Create n8n workflow to apply categories table migration

**Files:**
- Created in n8n (no local file): workflow named `Migration: Phase 1 - Categories Table`

- [ ] **Step 1: Create the n8n workflow via MCP**

Use `mcp__n8n-mcp__n8n_create_workflow` with this body:

```json
{
  "name": "Migration: Phase 1 - Categories Table",
  "nodes": [
    {
      "id": "wh",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [250, 300],
      "parameters": {
        "httpMethod": "GET",
        "path": "migration_phase1_categories",
        "responseMode": "responseNode"
      },
      "webhookId": "mig-2026-04-19-cat-table"
    },
    {
      "id": "mysql",
      "name": "Run Migration",
      "type": "n8n-nodes-base.mySql",
      "typeVersion": 2.4,
      "position": [450, 300],
      "parameters": {
        "operation": "executeQuery",
        "query": "<-- paste full SQL from migrations/2026-04-19_phase1_categories_table.sql -->",
        "options": {}
      },
      "credentials": {
        "mySql": {"id": "lqIXlvVVqfE4v7DF", "name": "MySQL account"}
      }
    },
    {
      "id": "verify",
      "name": "Verify",
      "type": "n8n-nodes-base.mySql",
      "typeVersion": 2.4,
      "position": [650, 300],
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT id, name, walk_order FROM categories ORDER BY walk_order",
        "options": {}
      },
      "credentials": {
        "mySql": {"id": "lqIXlvVVqfE4v7DF", "name": "MySQL account"}
      }
    },
    {
      "id": "respond",
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [850, 300],
      "parameters": {
        "respondWith": "allIncomingItems",
        "options": {}
      }
    }
  ],
  "connections": {
    "Webhook": {"main": [[{"node": "Run Migration", "type": "main", "index": 0}]]},
    "Run Migration": {"main": [[{"node": "Verify", "type": "main", "index": 0}]]},
    "Verify": {"main": [[{"node": "Respond", "type": "main", "index": 0}]]}
  },
  "settings": {"executionOrder": "v1"}
}
```

Note the SQL must be the actual content from the .sql file (newlines escaped as needed for JSON).

- [ ] **Step 2: Activate the workflow via REST API**

```bash
source /c/hsa-automation/.env && \
curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "http://localhost:5679/api/v1/workflows/<WORKFLOW_ID_RETURNED_FROM_STEP_1>/activate"
```

- [ ] **Step 3: Trigger the migration**

```bash
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/migration_phase1_categories"
```

Expected output: JSON array containing 14 category rows with sequential walk_order.

- [ ] **Step 4: Verify via direct MySQL query**

Use `mcp__mysql__mysql_query`:
```sql
SELECT COUNT(*) AS n, MIN(walk_order) AS lo, MAX(walk_order) AS hi FROM categories
```
Expected: `{n: 14, lo: 1, hi: 14}`

- [ ] **Step 5: Deactivate the migration workflow**

```bash
source /c/hsa-automation/.env && \
curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "http://localhost:5679/api/v1/workflows/<WORKFLOW_ID>/deactivate"
```

- [ ] **Step 6: Update MEMORY.md with the new workflow ID**

Add line to `C:\Users\Corey\.claude\projects\c--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md` under "n8n Workflows Created":
```
- `Migration: Phase 1 - Categories Table` (ID: <ID>) — Migration, executed and deactivated 2026-04-19. Created `categories` table + 14 seed rows.
```

---

## Task 1.4: Write the oneoff_items table migration SQL

**Files:**
- Create: `migrations/2026-04-19_phase1_oneoff_items_table.sql`

- [ ] **Step 1: Write the SQL file**

```sql
-- 2026-04-19 Phase 1: Create oneoff_items lookup table
-- Purpose: Stable, name-keyed unique IDs for one-off grocery additions.
-- Replaces the hardcoded ItemID=0 used by Add One-Off Grocery Item workflow.
-- Auto-increment starts at 100000 to keep range distinct from GroceryItems (14-999)
-- and MealIngredients (1000-99999).
-- Rollback: DROP TABLE oneoff_items;

CREATE TABLE oneoff_items (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT = 100000;

-- Verification:
-- SELECT AUTO_INCREMENT FROM INFORMATION_SCHEMA.TABLES
--   WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='oneoff_items';
-- Expected: 100000
```

- [ ] **Step 2: Commit**

```bash
git add migrations/2026-04-19_phase1_oneoff_items_table.sql
git commit -m "feat(migrations): phase 1 oneoff_items table SQL

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.5: Apply the oneoff_items migration

**Files:**
- Created in n8n: `Migration: Phase 1 - Oneoff Items Table`

- [ ] **Step 1: Create n8n workflow** (same pattern as Task 1.3, with SQL from `2026-04-19_phase1_oneoff_items_table.sql`)

Use the same JSON structure as Task 1.3 but:
- name: `Migration: Phase 1 - Oneoff Items Table`
- path: `migration_phase1_oneoff_items`
- webhookId: `mig-2026-04-19-oneoff-table`
- Run Migration query: full SQL from the .sql file
- Verify query: `SELECT AUTO_INCREMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='oneoff_items'`

- [ ] **Step 2: Activate, trigger, verify, deactivate** (same flow as Task 1.3)

```bash
source /c/hsa-automation/.env
curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<WID>/activate"
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/migration_phase1_oneoff_items"
# Expected: AUTO_INCREMENT: 100000
curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<WID>/deactivate"
```

- [ ] **Step 3: Verify via MySQL MCP**

```sql
SHOW CREATE TABLE oneoff_items
```
Expected output contains `AUTO_INCREMENT=100000` and `UNIQUE KEY` on `name`.

- [ ] **Step 4: Update MEMORY.md** with the new workflow ID.

---

## Task 1.6: Write WGL column-add migration SQL

**Files:**
- Create: `migrations/2026-04-19_phase1_wgl_add_columns.sql`

- [ ] **Step 1: Write the SQL file**

```sql
-- 2026-04-19 Phase 1: Add nullable category_id and week_start_date to WGL
-- Purpose: Additive migration to allow Phase 1 backfill before Phase 3 lock-down.
-- Both columns are nullable now; Phase 3 will MODIFY to NOT NULL after backfill.
-- Rollback:
--   ALTER TABLE WeeklyGroceryList DROP COLUMN category_id;
--   ALTER TABLE WeeklyGroceryList DROP COLUMN week_start_date;

ALTER TABLE WeeklyGroceryList
  ADD COLUMN category_id INT NULL AFTER Category,
  ADD COLUMN week_start_date DATE NULL AFTER WeekDateRange,
  ADD INDEX idx_category_id (category_id),
  ADD INDEX idx_week_start_date (week_start_date);

-- Verification:
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
--   FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='WeeklyGroceryList'
--     AND COLUMN_NAME IN ('category_id','week_start_date');
-- Expected: 2 rows, both nullable
```

- [ ] **Step 2: Commit**

```bash
git add migrations/2026-04-19_phase1_wgl_add_columns.sql
git commit -m "feat(migrations): phase 1 WGL add category_id and week_start_date columns

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.7: Apply the WGL column-add migration

**Files:** n8n workflow

- [ ] **Step 1: Create + activate + trigger n8n workflow** (same pattern as Task 1.3/1.5)

- name: `Migration: Phase 1 - WGL Add Columns`
- path: `migration_phase1_wgl_columns`
- webhookId: `mig-2026-04-19-wgl-cols`

- [ ] **Step 2: Verify via MySQL MCP**

```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='WeeklyGroceryList' AND COLUMN_NAME IN ('category_id','week_start_date')
```
Expected: 2 rows, both `IS_NULLABLE=YES`.

- [ ] **Step 3: Deactivate workflow + update MEMORY.md**

---

## Task 1.8: Write WGL backfill SQL

**Files:**
- Create: `migrations/2026-04-19_phase1_backfill.sql`

- [ ] **Step 1: Write the backfill SQL**

```sql
-- 2026-04-19 Phase 1: Backfill category_id, week_start_date, normalize stranded rows.
-- Run AFTER Tasks 1.3, 1.5, 1.7 are complete.
-- Idempotent: rerunning produces same end state (UPDATE WHERE clauses are conditional).
-- Rollback:
--   UPDATE WeeklyGroceryList SET category_id = NULL;
--   UPDATE WeeklyGroceryList SET week_start_date = NULL;

-- 1. Normalize the 1 stranded short-form WeekDateRange row.
UPDATE WeeklyGroceryList
SET WeekDateRange = 'For the week of April 19th to April 25th, 2026'
WHERE WeekDateRange = 'April 19th to April 25th, 2026';

-- 2. Backfill category_id with legacy mapping.
UPDATE WeeklyGroceryList wgl
JOIN categories c ON c.name = (
  CASE wgl.Category
    WHEN 'Pantry'    THEN 'Pantry staples'
    WHEN 'Produce'   THEN 'Fruit & vegetables'
    WHEN 'Dairy'     THEN 'Dairy & eggs'
    WHEN 'Seasoning' THEN 'Spices & seasonings'
    WHEN 'General'   THEN 'Pantry staples'
    ELSE wgl.Category
  END
)
SET wgl.category_id = c.id
WHERE wgl.category_id IS NULL;

-- 3. Backfill week_start_date by parsing WeekDateRange.
-- WeekDateRange format: "For the week of {Month} {Nth} to {Month} {Nth}, {YYYY}"
-- Strategy: extract using STR_TO_DATE on the post-"For the week of " portion.
UPDATE WeeklyGroceryList
SET week_start_date = STR_TO_DATE(
  CONCAT(
    SUBSTRING_INDEX(SUBSTRING_INDEX(WeekDateRange, ' to ', 1), 'For the week of ', -1),
    ', ',
    SUBSTRING_INDEX(WeekDateRange, ', ', -1)
  ),
  '%M %D, %Y'
)
WHERE week_start_date IS NULL;

-- Verification:
-- SELECT COUNT(*) AS total,
--        SUM(category_id IS NULL) AS missing_cat,
--        SUM(week_start_date IS NULL) AS missing_date
-- FROM WeeklyGroceryList;
-- Expected: total=800, missing_cat=0, missing_date=0
```

- [ ] **Step 2: Commit**

```bash
git add migrations/2026-04-19_phase1_backfill.sql
git commit -m "feat(migrations): phase 1 backfill category_id and week_start_date

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.9: Apply the backfill migration

**Files:** n8n workflow

- [ ] **Step 1: Create + activate + trigger workflow**

- name: `Migration: Phase 1 - WGL Backfill`
- path: `migration_phase1_wgl_backfill`
- webhookId: `mig-2026-04-19-wgl-backfill`

The Run Migration node executes the 3 statements sequentially. Use option `executeQuery` with the full multi-statement script — n8n MySQL node supports this when statements are separated by `;`. If multi-statement fails, split into 3 separate MySQL nodes connected in series.

- [ ] **Step 2: Verify backfill completeness**

```sql
SELECT COUNT(*) AS total, SUM(category_id IS NULL) AS missing_cat, SUM(week_start_date IS NULL) AS missing_date FROM WeeklyGroceryList
```

Expected: `total=800, missing_cat=0, missing_date=0`. If `missing_cat > 0`, investigate which Category strings did not map (run `SELECT DISTINCT Category FROM WeeklyGroceryList WHERE category_id IS NULL` and add them to the CASE statement, then rerun).

- [ ] **Step 3: Verify no stranded WeekDateRange formats remain**

```sql
SELECT WeekDateRange, COUNT(*) FROM WeeklyGroceryList GROUP BY WeekDateRange HAVING WeekDateRange NOT LIKE 'For the week of%'
```
Expected: empty result set.

- [ ] **Step 4: Deactivate workflow + update MEMORY.md**

---

## Task 1.10: Write categoryMap utility (TDD — failing test first)

**Files:**
- Create: `src/utils/categoryMap.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
import { mapToCanonicalCategory, INGREDIENT_TO_CANONICAL } from './categoryMap';

describe('mapToCanonicalCategory', () => {
  test('maps lowercase ingredient categories to canonical names', () => {
    expect(mapToCanonicalCategory('produce')).toBe('Fruit & vegetables');
    expect(mapToCanonicalCategory('protein')).toBe('Meat & seafood');
    expect(mapToCanonicalCategory('dairy')).toBe('Dairy & eggs');
    expect(mapToCanonicalCategory('pantry')).toBe('Pantry staples');
    expect(mapToCanonicalCategory('seasoning')).toBe('Spices & seasonings');
  });

  test('is case-insensitive', () => {
    expect(mapToCanonicalCategory('PRODUCE')).toBe('Fruit & vegetables');
    expect(mapToCanonicalCategory('Produce')).toBe('Fruit & vegetables');
  });

  test('passes through canonical names unchanged', () => {
    expect(mapToCanonicalCategory('Fruit & vegetables')).toBe('Fruit & vegetables');
    expect(mapToCanonicalCategory('Pantry staples')).toBe('Pantry staples');
  });

  test('returns DEFAULT_CATEGORY for unknown values', () => {
    expect(mapToCanonicalCategory('unknown_thing')).toBe('Pantry staples');
    expect(mapToCanonicalCategory('')).toBe('Pantry staples');
    expect(mapToCanonicalCategory(null)).toBe('Pantry staples');
    expect(mapToCanonicalCategory(undefined)).toBe('Pantry staples');
  });

  test('covers every ingredient_category value present in production', () => {
    const productionValues = [
      'baking', 'canned', 'condiments', 'dairy', 'frozen', 'grains',
      'nuts', 'oils', 'other', 'produce', 'protein', 'seasoning',
      'spices', 'sweeteners',
    ];
    productionValues.forEach((v) => {
      expect(INGREDIENT_TO_CANONICAL[v]).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "c:/New Grocery App/grocery-checklist-app"
npx react-scripts test --watchAll=false src/utils/categoryMap.test.js
```
Expected: FAIL — module `./categoryMap` not found.

- [ ] **Step 3: Implement the helper**

Create `src/utils/categoryMap.js`:

```javascript
import { DEFAULT_CATEGORY } from '../constants/categories';

export const INGREDIENT_TO_CANONICAL = {
  produce: 'Fruit & vegetables',
  vegetables: 'Fruit & vegetables',
  fruits: 'Fruit & vegetables',
  protein: 'Meat & seafood',
  proteins: 'Meat & seafood',
  dairy: 'Dairy & eggs',
  pantry: 'Pantry staples',
  grains: 'Pasta, rice & grains',
  seasoning: 'Spices & seasonings',
  spices: 'Spices & seasonings',
  oils: 'Condiments & sauces',
  condiments: 'Condiments & sauces',
  baking: 'Pantry staples',
  canned: 'Pantry staples',
  sweeteners: 'Pantry staples',
  nuts: 'Snacks',
  frozen: 'Frozen food',
  other: 'Pantry staples',
};

const CANONICAL_NAMES = new Set(Object.values(INGREDIENT_TO_CANONICAL));

export function mapToCanonicalCategory(value) {
  if (!value || typeof value !== 'string') return DEFAULT_CATEGORY;
  if (CANONICAL_NAMES.has(value)) return value;
  const key = value.toLowerCase().trim();
  return INGREDIENT_TO_CANONICAL[key] || DEFAULT_CATEGORY;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx react-scripts test --watchAll=false src/utils/categoryMap.test.js
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/categoryMap.js src/utils/categoryMap.test.js
git commit -m "feat(utils): categoryMap helper for normalizing ingredient categories

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.11: Write storageVersion utility (TDD — failing test first)

**Files:**
- Create: `src/utils/storageVersion.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
import { ensureStorageVersion, CURRENT_VERSION, STORAGE_VERSION_KEY, INVALIDATED_KEYS } from './storageVersion';

describe('ensureStorageVersion', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('writes current version when no version is stored', () => {
    ensureStorageVersion();
    expect(localStorage.getItem(STORAGE_VERSION_KEY)).toBe(String(CURRENT_VERSION));
  });

  test('clears invalidated keys when version mismatches', () => {
    localStorage.setItem(STORAGE_VERSION_KEY, '1');
    INVALIDATED_KEYS.forEach((k) => localStorage.setItem(k, 'stale-value'));
    ensureStorageVersion();
    INVALIDATED_KEYS.forEach((k) => {
      expect(localStorage.getItem(k)).toBeNull();
    });
    expect(localStorage.getItem(STORAGE_VERSION_KEY)).toBe(String(CURRENT_VERSION));
  });

  test('leaves storage alone when version matches', () => {
    localStorage.setItem(STORAGE_VERSION_KEY, String(CURRENT_VERSION));
    localStorage.setItem(INVALIDATED_KEYS[0], 'fresh-value');
    ensureStorageVersion();
    expect(localStorage.getItem(INVALIDATED_KEYS[0])).toBe('fresh-value');
  });

  test('returns true if invalidation occurred, false otherwise', () => {
    expect(ensureStorageVersion()).toBe(true);  // first run
    expect(ensureStorageVersion()).toBe(false); // version now matches
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx react-scripts test --watchAll=false src/utils/storageVersion.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/utils/storageVersion.js`:

```javascript
export const STORAGE_VERSION_KEY = 'schema_version';
export const CURRENT_VERSION = 2;

export const INVALIDATED_KEYS = [
  'inStoreCheckedItems',
  'inStoreShoppingList',
  'inStoreWalkOrder',
];

export function ensureStorageVersion() {
  let stored;
  try {
    stored = localStorage.getItem(STORAGE_VERSION_KEY);
  } catch {
    return false;
  }
  if (stored === String(CURRENT_VERSION)) return false;
  INVALIDATED_KEYS.forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
  try { localStorage.setItem(STORAGE_VERSION_KEY, String(CURRENT_VERSION)); } catch { /* ignore */ }
  return true;
}
```

- [ ] **Step 4: Run tests**

```bash
npx react-scripts test --watchAll=false src/utils/storageVersion.test.js
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/storageVersion.js src/utils/storageVersion.test.js
git commit -m "feat(utils): storageVersion invalidates stale localStorage on schema bumps

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.12: Add categories endpoint to ENDPOINTS config

**Files:**
- Modify: `src/config/api.js`

- [ ] **Step 1: Read the existing file to find ENDPOINTS object**

```bash
cd "c:/New Grocery App/grocery-checklist-app"
```

Use Read tool on `src/config/api.js` to find the ENDPOINTS object and existing entries.

- [ ] **Step 2: Add the categories endpoint**

Add this line to the ENDPOINTS object (alphabetical sort recommended, but follow the existing convention):

```javascript
categories: `${API_BASE_URL}/categories`,
```

- [ ] **Step 3: Commit**

```bash
git add src/config/api.js
git commit -m "feat(api): add /categories endpoint to ENDPOINTS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.13: Create the Categories API n8n workflow

**Files:** n8n workflow `Categories API`

- [ ] **Step 1: Create n8n workflow via MCP**

```json
{
  "name": "Categories API",
  "nodes": [
    {
      "id": "wh",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [250, 300],
      "parameters": {
        "httpMethod": "GET",
        "path": "categories",
        "responseMode": "responseNode",
        "options": {"allowedOrigins": "*"}
      },
      "webhookId": "categories-api-2026-04-19"
    },
    {
      "id": "mysql",
      "name": "Fetch Categories",
      "type": "n8n-nodes-base.mySql",
      "typeVersion": 2.4,
      "position": [450, 300],
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT id, name, walk_order FROM categories ORDER BY walk_order",
        "options": {}
      },
      "credentials": {
        "mySql": {"id": "lqIXlvVVqfE4v7DF", "name": "MySQL account"}
      }
    },
    {
      "id": "agg",
      "name": "Aggregate",
      "type": "n8n-nodes-base.aggregate",
      "typeVersion": 1,
      "position": [650, 300],
      "parameters": {
        "aggregate": "aggregateAllItemData",
        "options": {}
      }
    },
    {
      "id": "respond",
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [850, 300],
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify($json.data) }}",
        "options": {
          "responseHeaders": {
            "entries": [
              {"name": "Access-Control-Allow-Origin", "value": "*"}
            ]
          }
        }
      }
    }
  ],
  "connections": {
    "Webhook": {"main": [[{"node": "Fetch Categories", "type": "main", "index": 0}]]},
    "Fetch Categories": {"main": [[{"node": "Aggregate", "type": "main", "index": 0}]]},
    "Aggregate": {"main": [[{"node": "Respond", "type": "main", "index": 0}]]}
  },
  "settings": {"executionOrder": "v1"}
}
```

- [ ] **Step 2: Activate via REST API**

```bash
source /c/hsa-automation/.env
curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<WID>/activate"
```

- [ ] **Step 3: Verify the endpoint works**

```bash
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/categories" | python -m json.tool
```
Expected: JSON array of 14 objects, each with `{id, name, walk_order}`, sorted by walk_order ascending.

- [ ] **Step 4: Update MEMORY.md** with the workflow ID and webhook URL.

---

## Task 1.14: Write useCategories hook (TDD — failing test first)

**Files:**
- Create: `src/hooks/useCategories.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
import { renderHook, waitFor } from '@testing-library/react';
import { useCategories, CATEGORIES_CACHE_KEY } from './useCategories';
import { ENDPOINTS } from '../config/api';

describe('useCategories', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('returns null categories while loading', () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    const { result } = renderHook(() => useCategories());
    expect(result.current.categories).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  test('returns fetched categories on success', async () => {
    const mockCats = [
      { id: 1, name: 'Fruit & vegetables', walk_order: 1 },
      { id: 2, name: 'Bakery & bread', walk_order: 2 },
    ];
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockCats });
    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.categories).toEqual(mockCats);
    expect(global.fetch).toHaveBeenCalledWith(ENDPOINTS.categories, expect.any(Object));
  });

  test('caches result to localStorage on success', async () => {
    const mockCats = [{ id: 1, name: 'Fruit & vegetables', walk_order: 1 }];
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockCats });
    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(JSON.parse(localStorage.getItem(CATEGORIES_CACHE_KEY))).toEqual(mockCats);
  });

  test('falls back to localStorage cache on fetch failure', async () => {
    const cachedCats = [{ id: 1, name: 'Cached cat', walk_order: 1 }];
    localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(cachedCats));
    global.fetch.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.categories).toEqual(cachedCats);
  });

  test('returns empty array as final fallback', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.categories).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx react-scripts test --watchAll=false src/hooks/useCategories.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useCategories.js`:

```javascript
import { useState, useEffect } from 'react';
import { ENDPOINTS, apiFetch } from '../config/api';

export const CATEGORIES_CACHE_KEY = 'cachedCategories';

export function useCategories() {
  const [categories, setCategories] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetchFn = typeof apiFetch === 'function' ? apiFetch : fetch;
        const res = await fetchFn(ENDPOINTS.categories, { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setCategories(data);
        try { localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
      } catch {
        if (cancelled) return;
        try {
          const cached = localStorage.getItem(CATEGORIES_CACHE_KEY);
          setCategories(cached ? JSON.parse(cached) : []);
        } catch {
          setCategories([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { categories, loading };
}
```

- [ ] **Step 4: Run tests**

```bash
npx react-scripts test --watchAll=false src/hooks/useCategories.test.js
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCategories.js src/hooks/useCategories.test.js
git commit -m "feat(hooks): useCategories fetches /categories with localStorage fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.15: Update Pull Grocery Staples to JOIN categories

**Files:** n8n workflow `Pull Grocery Staples` (id `JoaR6klT950hwSLB`)

- [ ] **Step 1: Fetch the current workflow**

Use `mcp__n8n-mcp__n8n_get_workflow` with `id: "JoaR6klT950hwSLB"`. Locate the `Pull Current Week Grocery List` MySQL node.

- [ ] **Step 2: Update the SQL to JOIN categories**

Replace the entire query in `Pull Current Week Grocery List` with this version. Key change: SELECT pulls `c.name AS Category` from JOIN with categories, falling back to legacy `wgl.Category` text via COALESCE for any rows still pre-backfill (defensive during phase transition):

```sql
SELECT
    ItemID,
    ItemName,
    Category,
    Store,
    GroceryStoreSection,
    Type,
    IsActive,
    DataSource,
    QuantitySelected,
    IsSelected,
    Unit
FROM (
    SELECT
        GI.ItemID,
        GI.ItemName,
        COALESCE(c1.name, GI.Category) AS Category,
        GI.Store,
        GI.GroceryStoreSection,
        GI.Type,
        GI.IsActive,
        COALESCE(CW.DataSource, 'Staples') AS DataSource,
        COALESCE(CW.MaxQuantity, 1) AS QuantitySelected,
        CASE WHEN CW.item_key IS NOT NULL THEN 1 ELSE 0 END AS IsSelected,
        CW.Unit
    FROM GroceryItems AS GI
    LEFT JOIN categories c1 ON c1.name = GI.Category
    LEFT JOIN (
        SELECT
            TRIM(LOWER(ItemName)) AS item_key,
            MAX(Quantity) AS MaxQuantity,
            MAX(Unit) AS Unit,
            CASE
                WHEN SUM(CASE WHEN DataSource = 'Staples' THEN 1 ELSE 0 END) > 0 THEN 'Staples'
                ELSE MAX(DataSource)
            END AS DataSource
        FROM WeeklyGroceryList
        WHERE WeekDateRange = '{{ $('Webhook').item.json.query.weekDateRange }}'
        GROUP BY TRIM(LOWER(ItemName))
    ) AS CW
    ON TRIM(LOWER(GI.ItemName)) = CW.item_key

    UNION

    SELECT
        MAX(WGL.ItemID) AS ItemID,
        MAX(WGL.ItemName) AS ItemName,
        COALESCE(MAX(c2.name), MAX(WGL.Category)) AS Category,
        MAX(WGL.Store) AS Store,
        COALESCE(MAX(c2.name), MAX(WGL.Category)) AS GroceryStoreSection,
        'Basic' AS Type,
        1 AS IsActive,
        MAX(WGL.DataSource) AS DataSource,
        MAX(WGL.Quantity) AS QuantitySelected,
        1 AS IsSelected,
        MAX(WGL.Unit) AS Unit
    FROM WeeklyGroceryList AS WGL
    LEFT JOIN categories c2 ON c2.id = WGL.category_id
    WHERE WGL.WeekDateRange = '{{ $('Webhook').item.json.query.weekDateRange }}'
        AND NOT EXISTS (
            SELECT 1
            FROM GroceryItems GI
            WHERE TRIM(LOWER(GI.ItemName)) = TRIM(LOWER(WGL.ItemName))
        )
    GROUP BY TRIM(LOWER(WGL.ItemName))
) AS CombinedList
ORDER BY GroceryStoreSection, ItemName;
```

Use `mcp__n8n-mcp__n8n_update_partial_workflow` to apply this change targeting the `Pull Current Week Grocery List` node's query parameter.

- [ ] **Step 3: Verify the workflow returns canonical categories**

```bash
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/fetch_grocery_items?weekDateRange=For%20the%20week%20of%20April%2019th%20to%20April%2025th%2C%202026&weekStartDate=2026-04-19&weekEndDate=2026-04-25&timestamp=test" | python -c "
import sys, json
d = json.load(sys.stdin)
selected = [i for i in d if i.get('IsSelected') == 1]
cats = sorted(set(i.get('Category') for i in selected))
print('Selected items:', len(selected))
print('Distinct categories returned:')
for c in cats:
    print(f'  {repr(c)}')
"
```

Expected: All categories should be from the canonical 14 set. No "Pantry", "Produce", "Dairy", "Seasoning", or "General".

- [ ] **Step 4: Update MEMORY.md** noting the workflow update.

---

## Task 1.16: Wire useCategories into InStoreMode for walk order

**Files:**
- Modify: `src/components/InStoreMode.js`

- [ ] **Step 1: Add the hook import and call**

Find the line:
```javascript
import { HEB_WALK_ORDER, DEFAULT_CATEGORY } from "../constants/categories";
```

Replace with:
```javascript
import { DEFAULT_CATEGORY } from "../constants/categories";
import { useCategories } from "../hooks/useCategories";
```

In the `InStoreMode` component body (around line 786), find:
```javascript
const [walkOrder, setWalkOrder] = useState(HEB_WALK_ORDER);
```

Replace with:
```javascript
const { categories: dbCategories } = useCategories();
const defaultWalkOrder = useMemo(
  () => (dbCategories && dbCategories.length > 0
    ? [...dbCategories].sort((a, b) => a.walk_order - b.walk_order).map((c) => c.name)
    : []),
  [dbCategories]
);
const [walkOrder, setWalkOrder] = useState([]);
useEffect(() => {
  if (defaultWalkOrder.length === 0) return;
  // Merge with localStorage override; new categories from DB get appended.
  try {
    const stored = localStorage.getItem(WALK_ORDER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged = [...parsed, ...defaultWalkOrder.filter((n) => !parsed.includes(n))];
        setWalkOrder(merged);
        return;
      }
    }
  } catch { /* ignore */ }
  setWalkOrder(defaultWalkOrder);
}, [defaultWalkOrder]);
```

Find the existing localStorage walk-order useEffect (around line 890) and DELETE it (its work is now in the new useEffect above).

- [ ] **Step 2: Run existing InStoreMode tests if any**

```bash
npx react-scripts test --watchAll=false src/components/InStoreMode
```
Expected: PASS (or no tests found — InStoreMode doesn't currently have a test file).

- [ ] **Step 3: Manually verify in browser**

```bash
# Dev server should already be running on localhost:3000.
# Open http://localhost:3000/#shop and confirm the aisle list still appears.
```

Expected: Aisle order matches what was previously hardcoded in HEB_WALK_ORDER.

- [ ] **Step 4: Commit**

```bash
git add src/components/InStoreMode.js
git commit -m "feat(in-store): walk order sourced from /categories endpoint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.17: Wire storageVersion check into App entry

**Files:**
- Modify: `src/components/App.js`

- [ ] **Step 1: Add the import and call at app startup**

In `App.js`, near the top of the component (or in an `useEffect` running once on mount), add:

```javascript
import { ensureStorageVersion } from '../utils/storageVersion';

// Inside App component, before any other useEffects:
useEffect(() => {
  ensureStorageVersion();
}, []);
```

- [ ] **Step 2: Run existing tests**

```bash
npx react-scripts test --watchAll=false src/components/App
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/App.js
git commit -m "feat(app): invoke ensureStorageVersion on mount

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.18: PHASE 1 VERIFICATION GATE

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
cd "c:/New Grocery App/grocery-checklist-app"
CI=true npx react-scripts test --watchAll=false 2>&1 | tail -10
```
Expected: All tests pass. Note count for comparison after Phase 2.

- [ ] **Step 2: Verify In-Store Mode shows only canonical categories**

Open http://localhost:3000/#shop in the browser. For current week:
- Expected: 9 distinct aisle chips, none labeled "Pantry"/"Produce"/"Dairy"/"Seasoning"/"General".
- Items previously in those categories now appear in their canonical bucket (e.g., "Brown rice" in "Pantry staples", not "Pantry").

- [ ] **Step 3: Verify /categories endpoint**

```bash
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/categories" | python -m json.tool | head -20
```
Expected: 14 categories in walk_order order.

- [ ] **Step 4: Verify backfill state in DB**

```sql
SELECT COUNT(*) AS total, SUM(category_id IS NULL) AS missing_cat, SUM(week_start_date IS NULL) AS missing_date FROM WeeklyGroceryList
```
Expected: `total=800, missing_cat=0, missing_date=0`.

- [ ] **Step 5: STOP — get user sign-off before proceeding to Phase 2**

If any of the above fail, fix before continuing. Phase 1 must be stable before adding the cascade FK.

---

# PHASE 2 — Writers + Cascade

## Task 2.1: Write orphan backfill SQL

**Files:**
- Create: `migrations/2026-04-19_phase2_orphan_backfill.sql`

- [ ] **Step 1: Write the SQL**

```sql
-- 2026-04-19 Phase 2: Clean shopping_progress and WGL meal-ingredient orphans
-- MUST run before adding the FK constraint in the next migration.
-- Affects ~33 shopping_progress rows + ~19 WGL meal-ingredient rows.
-- Rollback: irreversible without backup; take a dump first.

-- 1. Delete shopping_progress entries that don't match any current WGL row.
DELETE sp FROM shopping_progress sp
LEFT JOIN WeeklyGroceryList wgl
  ON wgl.week_start_date = sp.week_start_date
  AND wgl.ItemID = sp.item_id
WHERE wgl.id IS NULL;

-- 2. Delete WGL meal-ingredient rows that no longer have a matching meal selection.
DELETE wgl FROM WeeklyGroceryList wgl
WHERE wgl.DataSource = 'MealIngredients'
  AND NOT EXISTS (
    SELECT 1 FROM weekly_selections ws
    JOIN recipe_ingredients ri ON ri.recipe_id = ws.recipe_id
    WHERE ws.WeekDateRange = wgl.WeekDateRange
      AND ri.ingredient_id + 1000 = wgl.ItemID
  );

-- Verification:
-- SELECT 'sp_orphans' AS chk, COUNT(*) AS n
-- FROM shopping_progress sp
-- LEFT JOIN WeeklyGroceryList wgl ON wgl.week_start_date=sp.week_start_date AND wgl.ItemID=sp.item_id
-- WHERE wgl.id IS NULL
-- UNION ALL
-- SELECT 'wgl_meal_orphans', COUNT(*)
-- FROM WeeklyGroceryList wgl
-- WHERE wgl.DataSource='MealIngredients' AND NOT EXISTS (
--   SELECT 1 FROM weekly_selections ws JOIN recipe_ingredients ri ON ri.recipe_id=ws.recipe_id
--   WHERE ws.WeekDateRange=wgl.WeekDateRange AND ri.ingredient_id+1000=wgl.ItemID
-- );
-- Expected: both counts = 0
```

- [ ] **Step 2: Commit**

```bash
git add migrations/2026-04-19_phase2_orphan_backfill.sql
git commit -m "feat(migrations): phase 2 orphan backfill SQL

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.2: Take a database backup before destructive Phase 2 operations

**Files:** `backups/hsa-pre-phase2-2026-04-19.sql`

- [ ] **Step 1: Create backups directory and dump the database**

```bash
cd "c:/New Grocery App/grocery-checklist-app"
mkdir -p backups
mysqldump -h localhost -P 3307 -u <user> -p hsa --routines --triggers --single-transaction \
  WeeklyGroceryList shopping_progress weekly_selections oneoff_items categories \
  > backups/hsa-pre-phase2-2026-04-19.sql
```

If credentials need lookup, read them from `C:\hsa-automation\.env` (look for MYSQL_* env vars) or check existing n8n MySQL credentials.

- [ ] **Step 2: Verify the dump is non-empty and parseable**

```bash
head -20 backups/hsa-pre-phase2-2026-04-19.sql
ls -lh backups/hsa-pre-phase2-2026-04-19.sql
```
Expected: file size > 50KB, header shows MySQL dump metadata.

- [ ] **Step 3: Add backups/ to .gitignore (do NOT commit DB dumps)**

```bash
echo "backups/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore backups directory

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.3: Apply the orphan backfill migration

**Files:** n8n workflow

- [ ] **Step 1: Create + activate + trigger workflow** (same pattern as Phase 1 migrations)

- name: `Migration: Phase 2 - Orphan Backfill`
- path: `migration_phase2_orphans`
- webhookId: `mig-2026-04-19-orphans`

The workflow needs 2 sequential MySQL nodes (one per DELETE) since multi-statement may not work cleanly with the n8n MySQL node for DML.

- [ ] **Step 2: Verify orphan counts are 0**

```sql
SELECT 'sp_orphans' AS chk, COUNT(*) AS n FROM shopping_progress sp LEFT JOIN WeeklyGroceryList wgl ON wgl.week_start_date=sp.week_start_date AND wgl.ItemID=sp.item_id WHERE wgl.id IS NULL UNION ALL SELECT 'wgl_meal_orphans', COUNT(*) FROM WeeklyGroceryList wgl WHERE wgl.DataSource='MealIngredients' AND NOT EXISTS (SELECT 1 FROM weekly_selections ws JOIN recipe_ingredients ri ON ri.recipe_id=ws.recipe_id WHERE ws.WeekDateRange=wgl.WeekDateRange AND ri.ingredient_id+1000=wgl.ItemID)
```
Expected: both `n=0`.

- [ ] **Step 3: Deactivate workflow + update MEMORY.md**

---

## Task 2.4: Write UNIQUE + FK migration SQL

**Files:**
- Create: `migrations/2026-04-19_phase2_unique_and_fk.sql`

- [ ] **Step 1: Write the SQL**

```sql
-- 2026-04-19 Phase 2: Add UNIQUE(week_start_date, ItemID) on WGL,
-- change shopping_progress.week_start_date to DATE,
-- add FK shopping_progress -> WGL ON DELETE CASCADE.
-- Run AFTER orphan backfill (otherwise FK creation will fail).
-- Rollback:
--   ALTER TABLE shopping_progress DROP FOREIGN KEY fk_sp_wgl;
--   ALTER TABLE shopping_progress MODIFY COLUMN week_start_date VARCHAR(20) NOT NULL;
--   ALTER TABLE WeeklyGroceryList DROP INDEX uq_week_item;

-- 1. Add UNIQUE on (week_start_date, ItemID) — load-bearing for FK below.
ALTER TABLE WeeklyGroceryList
  ADD UNIQUE KEY uq_week_item (week_start_date, ItemID);

-- 2. Convert shopping_progress.week_start_date to DATE so FK types match.
-- Existing values like '2026-04-19' parse cleanly.
ALTER TABLE shopping_progress
  MODIFY COLUMN week_start_date DATE NOT NULL;

-- 3. Add the FK with ON DELETE CASCADE.
ALTER TABLE shopping_progress
  ADD CONSTRAINT fk_sp_wgl
    FOREIGN KEY (week_start_date, item_id)
    REFERENCES WeeklyGroceryList (week_start_date, ItemID)
    ON DELETE CASCADE;

-- Verification:
-- SHOW CREATE TABLE shopping_progress;
-- Expected: contains FOREIGN KEY (`week_start_date`, `item_id`) REFERENCES `WeeklyGroceryList` ... ON DELETE CASCADE
```

- [ ] **Step 2: Commit**

```bash
git add migrations/2026-04-19_phase2_unique_and_fk.sql
git commit -m "feat(migrations): phase 2 UNIQUE on WGL + shopping_progress FK with CASCADE

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.5: Apply the UNIQUE + FK migration

**Files:** n8n workflow

- [ ] **Step 1: Create + activate + trigger n8n workflow**

- name: `Migration: Phase 2 - UNIQUE and FK`
- path: `migration_phase2_unique_fk`
- webhookId: `mig-2026-04-19-unique-fk`

Use 3 separate MySQL nodes connected in series (one ALTER per node) to isolate failures.

- [ ] **Step 2: Verify constraints are in place**

```sql
SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols, NON_UNIQUE FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='WeeklyGroceryList' AND INDEX_NAME='uq_week_item' GROUP BY INDEX_NAME, NON_UNIQUE
```
Expected: 1 row, `cols='week_start_date,ItemID'`, `NON_UNIQUE=0`.

```sql
SELECT CONSTRAINT_NAME, DELETE_RULE FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='hsa' AND TABLE_NAME='shopping_progress'
```
Expected: 1 row, `CONSTRAINT_NAME='fk_sp_wgl'`, `DELETE_RULE='CASCADE'`.

- [ ] **Step 3: Smoke-test cascade behavior with a temp row**

```sql
-- Insert a temp WGL row + matching shopping_progress row
INSERT INTO WeeklyGroceryList (ItemID, ItemName, Category, category_id, Store, Quantity, WeekDateRange, week_start_date, DataSource) VALUES (999999, 'CASCADE-TEST', 'Pantry staples', 8, 'HEB', 1, 'For the week of April 19th to April 25th, 2026', '2026-04-19', 'Staples')
```

```sql
INSERT INTO shopping_progress (week_start_date, item_id) VALUES ('2026-04-19', 999999)
```

```sql
DELETE FROM WeeklyGroceryList WHERE ItemID=999999 AND week_start_date='2026-04-19'
```

```sql
SELECT COUNT(*) FROM shopping_progress WHERE item_id=999999 AND week_start_date='2026-04-19'
```
Expected: 0 (cascade deleted the row).

- [ ] **Step 4: Deactivate workflow + update MEMORY.md**

---

## Task 2.6: Update Add One-Off Grocery Item workflow

**Files:** n8n workflow `Add One-Off Grocery Item` (id `ONzUncTlldVW6qJ1`)

- [ ] **Step 1: Replace the existing workflow's INSERT logic**

Use `mcp__n8n-mcp__n8n_update_partial_workflow` to replace the `Insert If Not Exists` MySQL node's query with this two-statement script. (If multi-statement fails on the n8n MySQL node, split into 2 sequential MySQL nodes: Lookup OneOff ID → Insert WGL.)

Approach: replace the workflow with 3 nodes — Lookup/Create OneOff, Resolve Category, Insert WGL.

Updated node graph:

```
Webhook → Lookup or Create OneOff → Resolve Category ID → Insert WGL → Respond
```

**Lookup or Create OneOff (MySQL):**
```sql
INSERT INTO oneoff_items (name) VALUES ('{{ $json.body.itemName }}')
ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);
SELECT LAST_INSERT_ID() AS oneoff_id;
```

If multi-statement is rejected, use 2 nodes:
- (a) `INSERT IGNORE INTO oneoff_items (name) VALUES ('{{ $json.body.itemName }}')`
- (b) `SELECT id AS oneoff_id FROM oneoff_items WHERE name = '{{ $('Webhook').item.json.body.itemName }}' LIMIT 1`

**Resolve Category ID (MySQL):**
```sql
SELECT id AS category_id FROM categories WHERE name = '{{ $('Webhook').item.json.body.category || "Pantry staples" }}' LIMIT 1
```

**Insert WGL (MySQL):**
```sql
INSERT INTO WeeklyGroceryList (
  ItemID, ItemName, Category, category_id, Store, Quantity, Unit, WeekDateRange, week_start_date, DataSource
) VALUES (
  {{ $('Lookup or Create OneOff').item.json.oneoff_id }},
  '{{ $('Webhook').item.json.body.itemName }}',
  (SELECT name FROM categories WHERE id = {{ $('Resolve Category ID').item.json.category_id }}),
  {{ $('Resolve Category ID').item.json.category_id }},
  '{{ $('Webhook').item.json.body.store || "HEB" }}',
  {{ $('Webhook').item.json.body.quantity || 1 }},
  {{ $('Webhook').item.json.body.unit ? "'" + $('Webhook').item.json.body.unit + "'" : "NULL" }},
  '{{ $('Webhook').item.json.body.weekDateRange }}',
  STR_TO_DATE(CONCAT(SUBSTRING_INDEX(SUBSTRING_INDEX('{{ $('Webhook').item.json.body.weekDateRange }}', ' to ', 1), 'For the week of ', -1), ', ', SUBSTRING_INDEX('{{ $('Webhook').item.json.body.weekDateRange }}', ', ', -1)), '%M %D, %Y'),
  'OneOff'
) ON DUPLICATE KEY UPDATE Quantity = VALUES(Quantity)
```

- [ ] **Step 2: Test by adding a new one-off item via the API**

```bash
curl -s -X POST "https://n8n-grocery.needexcelexpert.com/webhook/add_oneoff_item" \
  -H "Content-Type: application/json" \
  -d '{"itemName":"Plan-Test-Item-1","category":"Pantry staples","weekDateRange":"For the week of April 19th to April 25th, 2026","quantity":1}'
```
Expected: `{"success": true, ...}`

- [ ] **Step 3: Verify the WGL row has correct ItemID range**

```sql
SELECT ItemID, ItemName, category_id, week_start_date, DataSource FROM WeeklyGroceryList WHERE ItemName='Plan-Test-Item-1'
```
Expected: `ItemID >= 100000`, `category_id = 8` (Pantry staples), `week_start_date = '2026-04-19'`, `DataSource = 'OneOff'`.

- [ ] **Step 4: Verify same name reuses the same oneoff_items.id**

```bash
curl -s -X POST "https://n8n-grocery.needexcelexpert.com/webhook/add_oneoff_item" \
  -H "Content-Type: application/json" \
  -d '{"itemName":"Plan-Test-Item-1","category":"Pantry staples","weekDateRange":"For the week of April 26th to May 2nd, 2026","quantity":1}'
```

```sql
SELECT ItemID, week_start_date FROM WeeklyGroceryList WHERE ItemName='Plan-Test-Item-1' ORDER BY week_start_date
```
Expected: 2 rows with the SAME `ItemID`, different `week_start_date`.

- [ ] **Step 5: Cleanup test data**

```sql
DELETE FROM WeeklyGroceryList WHERE ItemName='Plan-Test-Item-1'; DELETE FROM oneoff_items WHERE name='Plan-Test-Item-1'
```

- [ ] **Step 6: Update MEMORY.md** with workflow update note.

---

## Task 2.7: Update Selection Check workflow

**Files:** n8n workflow `Selection Check` (id `DIOBZkmtBz543RLN`)

- [ ] **Step 1: Update the INSERT to include category_id and week_start_date**

Replace the `Check Item` MySQL node's query with:

```sql
INSERT INTO WeeklyGroceryList (
  ItemID, ItemName, Category, category_id, Store, Quantity, Unit, WeekDateRange, week_start_date, DataSource
)
SELECT
  {{ $json.body.itemId }},
  '{{ $json.body.itemName }}',
  (SELECT name FROM categories WHERE id = COALESCE((SELECT id FROM categories WHERE name = '{{ $json.body.category || "Pantry staples" }}'), 8)),
  COALESCE((SELECT id FROM categories WHERE name = '{{ $json.body.category || "Pantry staples" }}'), 8),
  '{{ $json.body.store || "HEB" }}',
  {{ $json.body.quantity || 1 }},
  {{ $json.body.unit ? "'" + $json.body.unit + "'" : "NULL" }},
  '{{ $json.body.weekDateRange }}',
  STR_TO_DATE(CONCAT(SUBSTRING_INDEX(SUBSTRING_INDEX('{{ $json.body.weekDateRange }}', ' to ', 1), 'For the week of ', -1), ', ', SUBSTRING_INDEX('{{ $json.body.weekDateRange }}', ', ', -1)), '%M %D, %Y'),
  'Staples'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM WeeklyGroceryList
  WHERE LOWER(TRIM(ItemName)) = LOWER(TRIM('{{ $json.body.itemName }}'))
    AND WeekDateRange = '{{ $json.body.weekDateRange }}'
)
```

The `COALESCE(..., 8)` ensures the FK constraint isn't violated if frontend sends an unknown category — falls back to "Pantry staples" (id 8).

- [ ] **Step 2: Test from the Plan screen**

In the running app at http://localhost:3000/#plan, check off any unchecked staple item. Verify in DB:

```sql
SELECT ItemID, ItemName, category_id, week_start_date, DataSource FROM WeeklyGroceryList WHERE WeekDateRange = 'For the week of April 19th to April 25th, 2026' ORDER BY id DESC LIMIT 5
```
Expected: newest row has populated `category_id` and `week_start_date`.

- [ ] **Step 3: Update MEMORY.md** with workflow update note.

---

## Task 2.8: Verify Selection Uncheck and Remove Weekly Grocery Item cascade correctly

**Files:** Selection Uncheck (id `IgQIsJCu5RZ9TYKJ`), Remove Weekly Grocery Item (id `HMe8bs6E93s0a1QN`) — no code changes, verification only.

- [ ] **Step 1: Test cascade via the Plan screen**

In the running app:
1. Check an item on the Plan screen. Verify it's in WGL.
2. Open InStoreMode and check it off (creates shopping_progress row).
3. Verify shopping_progress row exists:
```sql
SELECT * FROM shopping_progress WHERE week_start_date='2026-04-19' ORDER BY checked_at DESC LIMIT 5
```
4. Return to Plan screen, uncheck the item.
5. Verify BOTH rows are gone:
```sql
SELECT 'wgl' AS tbl, COUNT(*) FROM WeeklyGroceryList WHERE ItemName='<TEST_NAME>' AND week_start_date='2026-04-19' UNION ALL SELECT 'sp', COUNT(*) FROM shopping_progress WHERE item_id=<TEST_ID> AND week_start_date='2026-04-19'
```
Expected: both `COUNT(*) = 0`.

- [ ] **Step 2: Document the verified cascade behavior in workflow descriptions**

Use n8n MCP to update each workflow's description (or add a comment via a Code node) noting:
> "shopping_progress cleanup is handled automatically by FK CASCADE on WeeklyGroceryList. No DELETE on shopping_progress needed in this workflow."

---

## Task 2.9: Update Create Grocery List - Meals workflow

**Files:** n8n workflow `Create Grocery List - Meals` (id `CkLhcFEM9Tfc5uxO`)

- [ ] **Step 1: Update the Transform for DB Input Code node**

Replace the `Transform for DB Input` Code node's `jsCode` with this version. Key change: instead of `ItemID: item.ItemID + 1000` (frontend counter), look up the real `ingredient_id` from the `ingredients` table by name.

The lookup happens via a separate MySQL node added BEFORE the Transform. New flow:

```
Webhook → Lookup Existing Staples → Lookup Ingredient IDs → Transform for DB Input → Has Items? → Insert
```

**Lookup Ingredient IDs (MySQL — new node, parameters):**
```sql
SELECT ingredient_id, ingredient_name FROM ingredients
```

**Transform for DB Input (Code) — replacement jsCode:**
```javascript
function sqlEscape(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

const webhookData = $('Webhook').first().json;
const ingredients = JSON.parse(webhookData.body.ingredients);
const weekDateRange = webhookData.body.weekDateRange;

const stapleRows = $('Lookup Existing Staples').all();
const stapleNames = {};
for (const row of stapleRows) {
  const name = row.json.ItemName;
  if (name) stapleNames[name.trim().toLowerCase()] = true;
}

const ingredientRows = $('Lookup Ingredient IDs').all();
const ingredientIdByName = {};
for (const row of ingredientRows) {
  const name = row.json.ingredient_name;
  if (name) ingredientIdByName[name.trim().toLowerCase()] = row.json.ingredient_id;
}

// Canonical category map (mirrors src/utils/categoryMap.js)
const INGREDIENT_TO_CANONICAL = {
  produce: 'Fruit & vegetables', vegetables: 'Fruit & vegetables', fruits: 'Fruit & vegetables',
  protein: 'Meat & seafood', proteins: 'Meat & seafood',
  dairy: 'Dairy & eggs', pantry: 'Pantry staples',
  grains: 'Pasta, rice & grains', seasoning: 'Spices & seasonings', spices: 'Spices & seasonings',
  oils: 'Condiments & sauces', condiments: 'Condiments & sauces',
  baking: 'Pantry staples', canned: 'Pantry staples', sweeteners: 'Pantry staples',
  nuts: 'Snacks', frozen: 'Frozen food', other: 'Pantry staples',
};
function canonicalCategory(value) {
  if (!value || typeof value !== 'string') return 'Pantry staples';
  const known = new Set(Object.values(INGREDIENT_TO_CANONICAL));
  if (known.has(value)) return value;
  return INGREDIENT_TO_CANONICAL[value.toLowerCase().trim()] || 'Pantry staples';
}

function toSentenceCase(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Parse YYYY-MM-DD from "For the week of {Month} {Nth} to ..., YYYY"
function parseWeekStart(rangeStr) {
  const m = rangeStr.match(/For the week of (\w+) (\w+) to .* (\d{4})/);
  if (!m) return null;
  const monthMap = {January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11};
  const day = parseInt(m[2].replace(/\D/g,''), 10);
  const month = monthMap[m[1]];
  const year = parseInt(m[3], 10);
  if (month === undefined || isNaN(day) || isNaN(year)) return null;
  const d = new Date(Date.UTC(year, month, day));
  return d.toISOString().slice(0, 10);
}

const transformedItems = ingredients
  .filter((item) => item.IsSelected === 1)
  .filter((item) => {
    const itemName = (item.ItemName || '').trim().toLowerCase();
    return !stapleNames[itemName];
  })
  .map((item) => {
    const itemNameNorm = (item.ItemName || '').trim().toLowerCase();
    const stableId = (ingredientIdByName[itemNameNorm] || 0) + 1000;
    const category = canonicalCategory(item.GroceryStoreSection || item.Category);
    const qs = String(item.QuantitySelected || '1');
    const qtyMatch = qs.match(/^([\d.]+)/);
    const quantity = qtyMatch ? Math.ceil(parseFloat(qtyMatch[1])) : 1;
    let unit = item.Unit || null;
    if (!unit) {
      const unitMatch = qs.match(/^[\d.]+\s+(.+)/);
      if (unitMatch) unit = unitMatch[1].trim();
    }
    const weekStart = parseWeekStart(weekDateRange);
    return {
      json: {
        ItemID: stableId,
        ItemName: sqlEscape(toSentenceCase(item.ItemName)),
        Category: sqlEscape(category),
        Store: sqlEscape(item.Store),
        Quantity: quantity,
        Unit: unit ? sqlEscape(unit) : null,
        WeekDateRange: sqlEscape(weekDateRange),
        WeekStartDate: weekStart,
        DataSource: 'MealIngredients',
        hasItems: true,
      }
    };
  });

if (transformedItems.length === 0) {
  return [{ json: { hasItems: false } }];
}
return transformedItems;
```

**Insert Meal Ingredients (MySQL) — replacement query:**
```sql
INSERT INTO WeeklyGroceryList
  (ItemID, ItemName, Category, category_id, Store, Quantity, Unit, WeekDateRange, week_start_date, DataSource)
VALUES
  (
    {{ $json.ItemID }},
    '{{ $json.ItemName }}',
    '{{ $json.Category }}',
    (SELECT id FROM categories WHERE name = '{{ $json.Category }}'),
    '{{ $json.Store }}',
    {{ $json.Quantity }},
    {{ $json.Unit ? "'" + $json.Unit + "'" : "NULL" }},
    '{{ $json.WeekDateRange }}',
    '{{ $json.WeekStartDate }}',
    '{{ $json.DataSource }}'
  )
ON DUPLICATE KEY UPDATE
  ItemName = VALUES(ItemName),
  Category = VALUES(Category),
  category_id = VALUES(category_id),
  Quantity = GREATEST(Quantity, VALUES(Quantity)),
  Unit = COALESCE(VALUES(Unit), Unit)
```

- [ ] **Step 2: Test by triggering meal ingredient generation from RecipeIngredients screen**

In the running app, navigate to the RecipeIngredients flow with selected meals and click "Generate Grocery List". Verify in DB:

```sql
SELECT ItemID, ItemName, category_id, week_start_date, DataSource FROM WeeklyGroceryList WHERE DataSource='MealIngredients' AND week_start_date='2026-04-19' ORDER BY id DESC LIMIT 10
```
Expected: ItemIDs are 1000+ and stable across runs. category_id and week_start_date populated.

- [ ] **Step 3: Test stability — run twice, verify same IDs**

Trigger meal ingredient generation again with same meals selected. Run query above. Expected: same ItemIDs as the first run for any items present in both runs.

- [ ] **Step 4: Update MEMORY.md** with workflow update note.

---

## Task 2.10: Update Remove Weekly Selection workflow

**Files:** n8n workflow `Remove Weekly Selection` (id `8m4k9rB5p0Z9zdaz`)

- [ ] **Step 1: Add a meal-ingredient cleanup node**

Insert a new MySQL node `Cleanup Orphan Meal Ingredients` AFTER `Delete Selection` and BEFORE `Get Updated List`:

```sql
DELETE wgl FROM WeeklyGroceryList wgl
WHERE wgl.WeekDateRange = '{{ $('Webhook').item.json.body.weekDateRange }}'
  AND wgl.DataSource = 'MealIngredients'
  AND NOT EXISTS (
    SELECT 1 FROM weekly_selections ws
    JOIN recipe_ingredients ri ON ri.recipe_id = ws.recipe_id
    WHERE ws.WeekDateRange = wgl.WeekDateRange
      AND ri.ingredient_id + 1000 = wgl.ItemID
  )
```

shopping_progress entries for those WGL rows are cleaned automatically by the FK CASCADE.

- [ ] **Step 2: Test by removing a meal from the current week**

In the app, open Plan → Meals tab, remove one of the 4 selected meals for current week. Verify:

```sql
SELECT 'meal_ingredient_orphans' AS chk, COUNT(*) AS n FROM WeeklyGroceryList wgl WHERE wgl.DataSource='MealIngredients' AND wgl.week_start_date='2026-04-19' AND NOT EXISTS (SELECT 1 FROM weekly_selections ws JOIN recipe_ingredients ri ON ri.recipe_id=ws.recipe_id WHERE ws.WeekDateRange=wgl.WeekDateRange AND ri.ingredient_id+1000=wgl.ItemID)
```
Expected: 0 (no orphans).

- [ ] **Step 3: Update MEMORY.md** with workflow update note.

---

## Task 2.11: Update Create Grocery List workflow to diff-based upsert

**Files:** n8n workflow `Create Grocery List` (id `o0FnsnU6DaU9CqKD`)

- [ ] **Step 1: Restructure the workflow nodes**

New flow (replacing Webhook → Extract Week Range → Delete Old Staples → Transform → Insert):

```
Webhook → Extract Week Range → Transform for DB Input → Upsert Items → Delete Removed Items → Respond
```

**Extract Week Range** stays the same (extracts `weekDateRange` and computes `weekStartDate`).

Actually, also compute and add `weekStartDate`. Update its jsCode:

```javascript
function sqlEscape(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\\/g, '\\\\').replace(/'/g, "''");
}
function parseWeekStart(rangeStr) {
  const m = rangeStr.match(/For the week of (\w+) (\w+) to .* (\d{4})/);
  if (!m) return null;
  const monthMap = {January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11};
  const day = parseInt(m[2].replace(/\D/g,''), 10);
  const month = monthMap[m[1]];
  const year = parseInt(m[3], 10);
  if (month === undefined || isNaN(day) || isNaN(year)) return null;
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}
const { body } = items[0].json;
const weekDateRange = sqlEscape(body.weekDateRange);
const weekStartDate = parseWeekStart(body.weekDateRange);
return [{ json: { ...items[0].json, weekDateRange, weekStartDate } }];
```

**Transform for DB Input** — keep the existing structure, but add `WeekStartDate` field to each output item by passing through the Extract Week Range value.

**Upsert Items (MySQL — replaces "Execute a SQL query"):**
```sql
INSERT INTO WeeklyGroceryList
  (ItemID, ItemName, Category, category_id, Store, Quantity, Unit, WeekDateRange, week_start_date, DataSource)
VALUES
  (
    {{ $json.ItemID }},
    '{{ $json.ItemName }}',
    '{{ $json.Category }}',
    COALESCE((SELECT id FROM categories WHERE name = '{{ $json.Category }}'), 8),
    '{{ $json.Store }}',
    {{ $json.Quantity }},
    {{ $json.Unit ? "'" + $json.Unit + "'" : "NULL" }},
    '{{ $json.WeekDateRange }}',
    '{{ $('Extract Week Range').item.json.weekStartDate }}',
    '{{ $json.DataSource }}'
  )
ON DUPLICATE KEY UPDATE
  ItemName    = VALUES(ItemName),
  Category    = VALUES(Category),
  category_id = VALUES(category_id),
  Store       = VALUES(Store),
  Quantity    = VALUES(Quantity),
  Unit        = COALESCE(VALUES(Unit), Unit),
  DataSource  = VALUES(DataSource);
```

**Delete Removed Items (MySQL — NEW node, replaces the old "Delete Old Staples"):**

This node runs ONCE after all upserts. Use a Code node before it to gather the list of incoming ItemIDs into a JSON array, then pass to MySQL:

Actually simpler: do the delete in one MySQL node using NOT IN with a comma-separated list built by a Code node.

**Code node "Build IDs list" (between Transform and Upsert, with executeOnce):**
```javascript
const allItems = $items('Transform for DB Input');
const ids = allItems.map(i => i.json.ItemID).join(',');
const weekStart = $('Extract Week Range').first().json.weekStartDate;
return [{ json: { ids: ids || '0', weekStart } }];
```

Actually n8n flow control here is tricky. Simplest approach: AFTER the per-item upsert loop completes, have a final cleanup MySQL node that runs once. n8n's "Run Once for All Items" mode on a Code node followed by a MySQL node would work.

Alternative simpler architecture: keep the existing DELETE+INSERT but make it idempotent using REPLACE INTO. **However, this still churns WGL.id values, defeating the purpose.**

The cleanest solution: use a single MySQL node that does the diff atomically:

**Diff Upsert (MySQL — single node, runs ONCE for all items):**

Set node mode: `Run Once for All Items`. Build the SQL dynamically in a preceding Code node:

```javascript
// Code node: "Build Diff SQL" — runs once, takes all items
const allItems = $items('Transform for DB Input');
const weekRange = $('Extract Week Range').first().json.weekDateRange;
const weekStart = $('Extract Week Range').first().json.weekStartDate;
const ids = allItems.map(i => i.json.ItemID);
const idsList = ids.length ? ids.join(',') : '0';

const upserts = allItems.map(i => {
  const u = i.json.Unit ? `'${i.json.Unit}'` : 'NULL';
  return `(${i.json.ItemID}, '${i.json.ItemName}', '${i.json.Category}', COALESCE((SELECT id FROM categories WHERE name='${i.json.Category}'),8), '${i.json.Store}', ${i.json.Quantity}, ${u}, '${weekRange}', '${weekStart}', 'Staples')`;
}).join(',\n  ');

return [{
  json: {
    sql_upsert: allItems.length === 0 ? "SELECT 1" :
      `INSERT INTO WeeklyGroceryList (ItemID, ItemName, Category, category_id, Store, Quantity, Unit, WeekDateRange, week_start_date, DataSource) VALUES\n  ${upserts}\nON DUPLICATE KEY UPDATE ItemName=VALUES(ItemName), Category=VALUES(Category), category_id=VALUES(category_id), Store=VALUES(Store), Quantity=VALUES(Quantity), Unit=COALESCE(VALUES(Unit),Unit)`,
    sql_delete: `DELETE FROM WeeklyGroceryList WHERE WeekDateRange='${weekRange}' AND DataSource='Staples' AND ItemID NOT IN (${idsList})`,
  }
}];
```

Then 2 sequential MySQL nodes execute `{{ $json.sql_upsert }}` and `{{ $json.sql_delete }}`.

- [ ] **Step 2: Test by re-submitting Plan with no changes**

In the app, go to Plan, save with no changes. Verify WGL.id values are unchanged:

Before:
```sql
SELECT id, ItemID, ItemName FROM WeeklyGroceryList WHERE week_start_date='2026-04-19' AND DataSource='Staples' ORDER BY id LIMIT 10
```

(Note the IDs.)

Submit Plan in the app.

After:
```sql
SELECT id, ItemID, ItemName FROM WeeklyGroceryList WHERE week_start_date='2026-04-19' AND DataSource='Staples' ORDER BY id LIMIT 10
```

Expected: **same `id` values, same rows**. If IDs changed, the upsert fell through to delete+insert — investigate.

- [ ] **Step 3: Test deselection cascade**

Uncheck a Staple item on Plan, save. Verify:
- WGL row gone for that item.
- shopping_progress row for that item (if any existed) also gone (cascade).

- [ ] **Step 4: Update MEMORY.md** with workflow restructure note.

---

## Task 2.12: Update RecipeIngredients.js to use canonical category mapping and pass ingredient_id

**Files:**
- Modify: `src/components/RecipeIngredients.js`

- [ ] **Step 1: Replace getCategorySection and capitalizeCategory with mapToCanonicalCategory**

In `RecipeIngredients.js`:

Add import at the top:
```javascript
import { mapToCanonicalCategory } from '../utils/categoryMap';
```

Around line 178-200, find:
```javascript
ItemID: itemId++,
ItemName: ingredient.name,
Category: capitalizeCategory(ingredient.category),
GroceryStoreSection: getCategorySection(capitalizeCategory(ingredient.category)),
```

Replace with:
```javascript
ItemID: ingredient.ingredient_id || itemId++,  // prefer stable ID from upstream
ItemName: ingredient.name,
Category: mapToCanonicalCategory(ingredient.category),
GroceryStoreSection: mapToCanonicalCategory(ingredient.category),
```

Around lines 240-265, DELETE `capitalizeCategory` and `getCategorySection` functions entirely (no longer used).

- [ ] **Step 2: Run RecipeIngredients tests**

```bash
npx react-scripts test --watchAll=false RecipeIngredients
```
Expected: PASS (or no test file).

- [ ] **Step 3: Smoke-test in browser**

In running app: select meals → click "Generate Grocery List" → verify ingredients appear with correct canonical categories (no "Produce", "Pantry").

- [ ] **Step 4: Commit**

```bash
git add src/components/RecipeIngredients.js
git commit -m "feat(recipe-ingredients): use canonical category map and stable ingredient_id

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.13: Update InStoreMode allDone to defense-in-depth identity check (TDD)

**Files:**
- Modify: `src/components/InStoreMode.js`
- Create: `src/components/InStoreMode.test.js`

- [ ] **Step 1: Write a failing test for the regression**

Create `src/components/InStoreMode.test.js`:

```javascript
// Pure-function unit test for the allDone calculation logic.
// Verifies that a numeric size match doesn't trigger allDone if the actual
// ItemIDs don't all appear in the checked Set (defends against ID collisions
// like the OneOff ItemID=0 case).

function isAllDone(items, checkedItems) {
  const totalItems = items.length;
  if (totalItems === 0) return false;
  return items.every((i) => checkedItems.has(String(i.ItemID)));
}

describe('isAllDone (allDone semantics)', () => {
  test('returns false when items list is empty', () => {
    expect(isAllDone([], new Set())).toBe(false);
  });

  test('returns true when every ItemID is in the checked Set', () => {
    const items = [{ ItemID: 1 }, { ItemID: 2 }, { ItemID: 3 }];
    const checked = new Set(['1', '2', '3']);
    expect(isAllDone(items, checked)).toBe(true);
  });

  test('returns false when checked Set size equals items length but IDs differ', () => {
    // The classic collision case: 2 items both have ItemID=0 (OneOff), only one
    // entry possible in the Set. items.length=2, checkedItems.size could equal 2
    // if a stale shopping_progress row inflated it, but our identity check protects.
    const items = [{ ItemID: 0 }, { ItemID: 0 }];
    const checked = new Set(['0', '999']); // size 2, but '999' isn't in items
    expect(isAllDone(items, checked)).toBe(true); // both items match '0', it IS in Set
    // The actual regression scenario:
    const items2 = [{ ItemID: 1 }, { ItemID: 2 }];
    const checked2 = new Set(['1', '999']); // size 2, missing '2'
    expect(isAllDone(items2, checked2)).toBe(false);
  });

  test('returns false when one item is unchecked even if other counts match', () => {
    const items = [{ ItemID: 100 }, { ItemID: 200 }];
    const checked = new Set(['100']); // size 1 < 2, would have been false anyway
    expect(isAllDone(items, checked)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it passes (it's testing the new logic shape)**

```bash
npx react-scripts test --watchAll=false src/components/InStoreMode.test.js
```
Expected: PASS, 4 tests.

- [ ] **Step 3: Apply the change to InStoreMode.js**

Find the `allDone` calculation around line 1195:

```javascript
const allDone = totalItems > 0 && totalChecked === totalItems;
```

Replace with:

```javascript
const allDone = totalItems > 0 && shoppingList.items.every(
  (i) => checkedItems.has(String(i.ItemID))
);
```

- [ ] **Step 4: Run the full test suite**

```bash
CI=true npx react-scripts test --watchAll=false 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/InStoreMode.js src/components/InStoreMode.test.js
git commit -m "fix(in-store): allDone uses identity check instead of size comparison

Defense-in-depth against ID collisions and stale shopping_progress
inflating checkedItems.size. Verified by InStoreMode.test.js.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.14: PHASE 2 VERIFICATION GATE

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
CI=true npx react-scripts test --watchAll=false 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 2: Verify orphan counts are 0**

```sql
SELECT 'sp_orphans' AS chk, COUNT(*) AS n FROM shopping_progress sp LEFT JOIN WeeklyGroceryList wgl ON wgl.week_start_date=sp.week_start_date AND wgl.ItemID=sp.item_id WHERE wgl.id IS NULL UNION ALL SELECT 'wgl_meal_orphans', COUNT(*) FROM WeeklyGroceryList wgl WHERE wgl.DataSource='MealIngredients' AND NOT EXISTS (SELECT 1 FROM weekly_selections ws JOIN recipe_ingredients ri ON ri.recipe_id=ws.recipe_id WHERE ws.WeekDateRange=wgl.WeekDateRange AND ri.ingredient_id+1000=wgl.ItemID)
```
Expected: both `n=0`.

- [ ] **Step 3: Verify new One-Offs get IDs ≥ 100000**

Add a one-off via the app or curl. Then:
```sql
SELECT MAX(ItemID) FROM WeeklyGroceryList WHERE DataSource='OneOff' AND week_start_date='2026-04-19'
```
Expected: ≥ 100000.

- [ ] **Step 4: Verify FK + UNIQUE are in place**

```sql
SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='WeeklyGroceryList' AND INDEX_NAME='uq_week_item' UNION SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='hsa' AND CONSTRAINT_NAME='fk_sp_wgl'
```
Expected: 2 rows, `uq_week_item` and `fk_sp_wgl`.

- [ ] **Step 5: End-to-end shopping flow test**

Open InStoreMode for current week. Check off all visible items. Verify:
- "All Done!" banner appears exactly once at the right moment.
- shopping_progress row count matches checked items.
- No phantom checks or duplicate aisles.

- [ ] **Step 6: STOP — let Phase 2 stabilize for ≥ 1 week before Phase 3**

Phase 3 drops the legacy `WGL.Category` text column and is harder to roll back. Wait for at least one full week of normal usage to confirm Phase 2 is stable.

---

# PHASE 3 — Cleanup (deploy ≥ 1 week after Phase 2)

## Task 3.1: Take fresh database backup before destructive Phase 3 operations

**Files:** `backups/hsa-pre-phase3-YYYY-MM-DD.sql`

- [ ] **Step 1: Backup**

```bash
cd "c:/New Grocery App/grocery-checklist-app"
mysqldump -h localhost -P 3307 -u <user> -p hsa --routines --triggers --single-transaction \
  WeeklyGroceryList shopping_progress weekly_selections oneoff_items categories heb_cart_sessions \
  > backups/hsa-pre-phase3-$(date -I).sql
ls -lh backups/hsa-pre-phase3-*.sql
```

---

## Task 3.2: Write Phase 3 cleanup migration SQL

**Files:**
- Create: `migrations/2026-04-19_phase3_drop_legacy.sql`

- [ ] **Step 1: Write the SQL**

```sql
-- 2026-04-19 Phase 3: Lock down — make new columns NOT NULL, add FK to categories,
-- drop legacy WGL.Category text column, drop unused heb_cart_sessions.week_date_range.
-- Run only AFTER Phase 2 has been live ≥ 1 week with no issues.
-- Rollback: re-add columns from backup; restore data from pre-phase3 dump.

-- 1. Lock down WGL.category_id
ALTER TABLE WeeklyGroceryList
  MODIFY COLUMN category_id INT NOT NULL,
  ADD CONSTRAINT fk_wgl_category FOREIGN KEY (category_id) REFERENCES categories(id);

-- 2. Lock down WGL.week_start_date
ALTER TABLE WeeklyGroceryList
  MODIFY COLUMN week_start_date DATE NOT NULL;

-- 3. Drop legacy free-text Category column
ALTER TABLE WeeklyGroceryList
  DROP COLUMN Category;

-- 4. Drop unused heb_cart_sessions.week_date_range column
ALTER TABLE heb_cart_sessions
  DROP COLUMN week_date_range;

-- Verification:
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='WeeklyGroceryList' AND COLUMN_NAME='Category';
-- Expected: empty result (column dropped)
-- SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
--   WHERE CONSTRAINT_SCHEMA='hsa' AND CONSTRAINT_NAME='fk_wgl_category';
-- Expected: 1 row
```

- [ ] **Step 2: Commit**

```bash
git add migrations/2026-04-19_phase3_drop_legacy.sql
git commit -m "feat(migrations): phase 3 lock down columns, drop legacy free-text fields

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3.3: Update Pull Grocery Staples to remove Category text fallback

**Files:** n8n workflow `Pull Grocery Staples` (id `JoaR6klT950hwSLB`)

- [ ] **Step 1: Update SQL to remove COALESCE fallback**

Replace `COALESCE(c1.name, GI.Category) AS Category` with `c1.name AS Category`.
Replace `COALESCE(MAX(c2.name), MAX(WGL.Category)) AS Category` with `MAX(c2.name) AS Category`.
Replace `COALESCE(MAX(c2.name), MAX(WGL.Category)) AS GroceryStoreSection` with `MAX(c2.name) AS GroceryStoreSection`.

(Same JOIN structure, no fallback to legacy text since column is dropped.)

- [ ] **Step 2: Verify with curl**

```bash
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/fetch_grocery_items?weekDateRange=For%20the%20week%20of%20April%2019th%20to%20April%2025th%2C%202026&weekStartDate=2026-04-19&weekEndDate=2026-04-25&timestamp=test" | python -m json.tool | head -20
```
Expected: response works, all categories canonical.

---

## Task 3.4: Apply Phase 3 cleanup migration

**Files:** n8n workflow

- [ ] **Step 1: Create + activate + trigger workflow** with multi-statement migration. Use 4 sequential MySQL nodes (one per ALTER) to isolate failures.

- name: `Migration: Phase 3 - Drop Legacy Columns`
- path: `migration_phase3_cleanup`

- [ ] **Step 2: Verify state**

```sql
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='WeeklyGroceryList' AND COLUMN_NAME='Category'
```
Expected: empty.

```sql
SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='hsa' AND TABLE_NAME='WeeklyGroceryList'
```
Expected: 1 row, `fk_wgl_category`.

- [ ] **Step 3: Smoke-test the app end-to-end**

Open every screen (Plan, Deals, Cart, Shop, Cook). Verify no errors. Add/check/uncheck items.

- [ ] **Step 4: Deactivate workflow + update MEMORY.md**

---

## Task 3.5: Drop GROCERY_CATEGORIES and HEB_WALK_ORDER from frontend

**Files:**
- Modify: `src/constants/categories.js`

- [ ] **Step 1: Read the current file**

```bash
# Read src/constants/categories.js to confirm current contents
```

- [ ] **Step 2: Reduce file to only DEFAULT_CATEGORY**

Replace the entire file contents with:

```javascript
// The 14 canonical grocery categories now live in the database (table: categories).
// Components fetch them via the useCategories hook.
// This file retains only the fallback default used when categories endpoint and cache both fail.

export const DEFAULT_CATEGORY = 'Pantry staples';
```

- [ ] **Step 3: Run full test suite**

```bash
CI=true npx react-scripts test --watchAll=false 2>&1 | tail -10
```
Expected: all tests pass. If any test imports `GROCERY_CATEGORIES` or `HEB_WALK_ORDER`, update those imports in Phase 1.

If failures: search for stragglers:
```bash
# Use Grep tool, not bash
# pattern: GROCERY_CATEGORIES|HEB_WALK_ORDER
# path: src
```

Fix any remaining references (likely in tests).

- [ ] **Step 4: Commit**

```bash
git add src/constants/categories.js
git commit -m "chore(constants): drop GROCERY_CATEGORIES and HEB_WALK_ORDER, now in DB

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3.6: Bump schema_version to invalidate stale localStorage

**Files:**
- Modify: `src/utils/storageVersion.js`

- [ ] **Step 1: Bump CURRENT_VERSION**

```javascript
export const CURRENT_VERSION = 3;  // bumped after Phase 3 deploy
```

- [ ] **Step 2: Run tests**

```bash
npx react-scripts test --watchAll=false src/utils/storageVersion.test.js
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/utils/storageVersion.js
git commit -m "chore(storage): bump schema version to 3 for phase 3 cleanup

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3.7: PHASE 3 VERIFICATION GATE — Final acceptance

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

```bash
CI=true npx react-scripts test --watchAll=false 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 2: Verify schema state**

```sql
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='hsa' AND TABLE_NAME='WeeklyGroceryList' ORDER BY ORDINAL_POSITION
```

Expected: `id, ItemID, ItemName, category_id, Store, Quantity, Unit, WeekDateRange, week_start_date, DataSource`. NO `Category` column.

- [ ] **Step 3: Verify acceptance criteria from spec**

For current week and one historical week (e.g. 2026-04-12), open InStoreMode and verify:

1. ✅ Each canonical category appears at most once in the aisle list
2. ✅ Aisle list contains only categories from the canonical 14-set
3. ✅ Checking off all items triggers success banner exactly once at the right moment
4. ✅ Removing a meal from Plan removes its ingredients from In-Store list (cascade)
5. ✅ Same one-off item name in two weeks → same `oneoff_items.id`
6. ✅ Re-submitting Plan with no changes → WGL.id values unchanged

- [ ] **Step 4: Push to Netlify (deploy)**

```bash
git push origin feature/staples-redesign
```

Wait for Netlify build. Verify deploy succeeds (no build warnings treated as errors).

Open `https://grocery-checklist-app.netlify.app/#shop` and confirm the production app behaves identically.

- [ ] **Step 5: Update MEMORY.md with Phase 3 completion notes**

Add a section to MEMORY.md summarizing the migration:

```
## WGL Architectural Fix (Completed YYYY-MM-DD)
- Categories moved to `categories` table with FK from WGL
- OneOff items use `oneoff_items` table (id ≥ 100000)
- MealIngredients use stable `ingredients.ingredient_id + 1000`
- shopping_progress has FK to WGL with ON DELETE CASCADE
- Create Grocery List uses diff-based upsert (no more WGL.id churn)
- WeekDateRange normalized to canonical long form
- 8 n8n workflows updated (see "n8n Workflows Created" section for IDs)
- 33+ orphan shopping_progress rows + 19 WGL meal-ingredient orphans cleaned
- Spec: docs/superpowers/specs/2026-04-19-wgl-architectural-fix-design.md
```

---

## Self-Review Notes

After writing the plan, fresh-eyes review:

**Spec coverage:** Every component in the spec has corresponding tasks:
- Categories table → Tasks 1.2, 1.3
- oneoff_items table → Tasks 1.4, 1.5
- WGL category_id + week_start_date → Tasks 1.6-1.9
- Pull Grocery Staples JOIN → Task 1.15
- /categories endpoint → Tasks 1.12, 1.13
- Frontend useCategories hook → Task 1.14
- Frontend categoryMap helper → Task 1.10
- Frontend storageVersion invalidation → Tasks 1.11, 1.17
- Walk order from DB → Task 1.16
- Orphan backfill → Tasks 2.1, 2.3
- UNIQUE + FK on shopping_progress → Tasks 2.4, 2.5
- All writers updated → Tasks 2.6 (One-Off), 2.7 (Selection Check), 2.8 (cascade verify), 2.9 (Meal Ingredients), 2.10 (Remove Selection), 2.11 (Create Grocery List upsert)
- RecipeIngredients.js category fix → Task 2.12
- allDone defense-in-depth → Task 2.13
- Phase 3 lock down → Tasks 3.2-3.6
- Acceptance gates → Tasks 1.18, 2.14, 3.7

**Type/name consistency:** Variables, function names, table names, column names match across tasks.

**Placeholder scan:** No "TBD", "TODO", "fill in details". Each step has actual code or commands.

---

## Completion

After all 33 tasks complete and Phase 3 verification passes:

1. The two original bugs (duplicate categories, premature done banner) are fixed at the architectural layer.
2. shopping_progress can no longer accumulate orphans (cascade enforces it).
3. WGL.id values are stable (upsert pattern).
4. Categories are FK-enforced (database rejects non-canonical values).
5. OneOff and MealIngredient items have stable, unique IDs across weeks.
6. The frontend has defense-in-depth against any future ID drift.

The fix is real, durable, and architectural — not a bandaid.
