# Skip Meal-Ingredient Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to soft-remove items from this week's shopping list (Staples, MealIngredients, OneOff) without losing the recipe→ingredient relationship, by adding an `is_skipped` flag to `WeeklyGroceryList`.

**Architecture:** New nullable column on WGL with default 0. Three n8n workflows updated (one reader, two writers) plus one clip-server route updated to filter on the flag. No frontend changes — the soft-delete is transparent to the UI because reader semantics hide skipped items.

**Tech Stack:** MySQL 8 (`hsa` database, port 3307), n8n workflows (REST API + n8n-mcp tools), Node.js Express clip-server (Docker container `heb-clip-server`), React 19 frontend (no changes needed).

**Spec:** [docs/superpowers/specs/2026-04-25-skip-meal-ingredient-design.md](../specs/2026-04-25-skip-meal-ingredient-design.md)

**Rollout order (must follow):** migration → reader workflows → writer workflows. Reader changes are backward-compatible (column defaults to 0); writer changes assume the column exists.

---

## Task 1: Create + execute schema migration

**Files:**
- Create: n8n workflow "Migration: Add is_skipped to WeeklyGroceryList"

**Why this task first:** ADD COLUMN with default 0 is additive and behavior-preserving. Once it ships, all later tasks can reference the column.

- [ ] **Step 1: Create migration workflow via n8n MCP**

Use `mcp__n8n-mcp__n8n_create_workflow` with this body:

```json
{
  "name": "Migration: Add is_skipped to WeeklyGroceryList",
  "nodes": [
    {
      "id": "trigger",
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [250, 300],
      "parameters": {}
    },
    {
      "id": "mysql",
      "name": "Add is_skipped Column",
      "type": "n8n-nodes-base.mySql",
      "typeVersion": 2.5,
      "position": [500, 300],
      "parameters": {
        "operation": "executeQuery",
        "query": "ALTER TABLE WeeklyGroceryList ADD COLUMN is_skipped TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'User soft-removed from this weeks shopping list (already has on hand). Recipe link stays intact.', ADD COLUMN skipped_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Timestamp when is_skipped was last set to 1.', ADD INDEX idx_week_skipped (week_start_date, is_skipped);",
        "options": {}
      },
      "credentials": {
        "mySql": {
          "id": "lqIXlvVVqfE4v7DF",
          "name": "MySQL account"
        }
      }
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [[{ "node": "Add is_skipped Column", "type": "main", "index": 0 }]]
    }
  },
  "settings": {
    "executionOrder": "v1",
    "saveDataErrorExecution": "all",
    "saveDataSuccessExecution": "all"
  }
}
```

Capture the returned workflow ID — you'll need it for the next step.

- [ ] **Step 2: Activate the workflow via REST API**

```bash
source /c/hsa-automation/.env && curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<WORKFLOW_ID>/activate"
```

Expected: JSON body with `"active": true`. If you see `"active": false`, re-run the activate call (n8n sometimes needs a beat).

- [ ] **Step 3: Execute the migration via the n8n UI manual trigger, OR equivalent REST execution**

The simplest reliable path is to open the n8n UI at `http://localhost:5679` → find the workflow → click "Execute Workflow". Alternative: trigger via REST if the manual trigger exposes a webhook (it doesn't by default). Use the UI.

Watch the execution succeed (green check on every node). If MySQL errors with "Duplicate column name 'is_skipped'", the migration already ran — proceed to Step 4.

- [ ] **Step 4: Verify schema via MySQL MCP**

Use `mcp__mysql__mysql_query`:

```sql
SHOW COLUMNS FROM WeeklyGroceryList
```

Expected: rows include `is_skipped TINYINT(1) NOT NULL DEFAULT 0` and `skipped_at TIMESTAMP NULL`.

- [ ] **Step 5: Verify all existing rows have is_skipped=0**

```sql
SELECT is_skipped, COUNT(*) AS row_count FROM WeeklyGroceryList GROUP BY is_skipped
```

Expected: a single row `{is_skipped: 0, row_count: <N>}`. If any row already has `is_skipped=1`, something is wrong — investigate before proceeding.

- [ ] **Step 6: Deactivate the migration workflow**

```bash
source /c/hsa-automation/.env && curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<WORKFLOW_ID>/deactivate"
```

- [ ] **Step 7: Update memory.md with the new workflow ID**

Edit [C:\Users\Corey\.claude\projects\c--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md](C:\Users\Corey\.claude\projects\c--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md), in the "n8n Workflows Created" section, add a line:

```
- `Migration: Add is_skipped to WeeklyGroceryList` (ID: <WORKFLOW_ID>) — Executed and deactivated 2026-04-25. Added `is_skipped TINYINT(1) DEFAULT 0` + `skipped_at TIMESTAMP NULL` + `idx_week_skipped` index. Soft-delete support for staples uncheck.
```

---

## Task 2: Update `Pull Grocery Staples` reader

**Files:**
- Modify: n8n workflow `Pull Grocery Staples` (ID: `JoaR6klT950hwSLB`), node `Pull Current Week Grocery List` (the MySQL executeQuery node)

**Why next:** Reader change is backward-compatible — `is_skipped=0` for all existing rows means the new IsSelected derivation produces identical output. Safe to deploy before any writer changes.

- [ ] **Step 1: Read the current workflow definition**

Use `mcp__n8n-mcp__n8n_get_workflow` with `id: "JoaR6klT950hwSLB"`. Locate the node with `"name": "Pull Current Week Grocery List"`. Save its current `parameters.query` value somewhere (you'll need it as the rollback baseline).

- [ ] **Step 2: Update the SQL query in the workflow**

Use `mcp__n8n-mcp__n8n_update_partial_workflow` (or full update if partial isn't available) to replace the `Pull Current Week Grocery List` node's query with:

```sql
SELECT ItemID, ItemName, Category, Store, GroceryStoreSection, Type, IsActive, DataSource, QuantitySelected, IsSelected, Unit FROM (
  SELECT GI.ItemID, GI.ItemName,
         COALESCE(c1.name COLLATE utf8mb4_unicode_ci, GI.Category) AS Category,
         GI.Store, GI.GroceryStoreSection, GI.Type, GI.IsActive,
         COALESCE(CW.DataSource, 'Staples') AS DataSource,
         COALESCE(CW.MaxQuantity, 1) AS QuantitySelected,
         CASE WHEN CW.item_key IS NOT NULL AND COALESCE(CW.is_skipped, 0) = 0 THEN 1 ELSE 0 END AS IsSelected,
         CW.Unit
  FROM GroceryItems AS GI
  LEFT JOIN categories c1 ON c1.name COLLATE utf8mb4_unicode_ci = GI.Category
  LEFT JOIN (
    SELECT TRIM(LOWER(ItemName)) AS item_key,
           MAX(Quantity) AS MaxQuantity,
           MAX(Unit) AS Unit,
           CASE WHEN SUM(CASE WHEN DataSource = 'Staples' THEN 1 ELSE 0 END) > 0 THEN 'Staples' ELSE MAX(DataSource) END AS DataSource,
           MIN(is_skipped) AS is_skipped
    FROM WeeklyGroceryList
    WHERE WeekDateRange = '{{ $('Webhook').item.json.query.weekDateRange }}'
    GROUP BY TRIM(LOWER(ItemName))
  ) AS CW ON TRIM(LOWER(GI.ItemName)) = CW.item_key
  UNION
  SELECT MAX(WGL.ItemID) AS ItemID,
         MAX(WGL.ItemName) AS ItemName,
         MAX(c2.name) COLLATE utf8mb4_unicode_ci AS Category,
         MAX(WGL.Store) AS Store,
         MAX(c2.name) COLLATE utf8mb4_unicode_ci AS GroceryStoreSection,
         'Basic' AS Type, 1 AS IsActive,
         MAX(WGL.DataSource) AS DataSource,
         MAX(WGL.Quantity) AS QuantitySelected,
         CASE WHEN MIN(COALESCE(WGL.is_skipped, 0)) = 0 THEN 1 ELSE 0 END AS IsSelected,
         MAX(WGL.Unit) AS Unit
  FROM WeeklyGroceryList AS WGL
  LEFT JOIN categories c2 ON c2.id = WGL.category_id
  WHERE WGL.WeekDateRange = '{{ $('Webhook').item.json.query.weekDateRange }}'
    AND NOT EXISTS (
      SELECT 1 FROM GroceryItems GI
      WHERE TRIM(LOWER(GI.ItemName)) = TRIM(LOWER(WGL.ItemName))
    )
  GROUP BY TRIM(LOWER(WGL.ItemName))
) AS CombinedList
ORDER BY GroceryStoreSection, ItemName;
```

Two changes from the original: (1) added `MIN(is_skipped) AS is_skipped` to the LEFT JOIN subquery and `CASE WHEN ... AND COALESCE(CW.is_skipped, 0) = 0 ...` to IsSelected; (2) wrapped the UNION branch's IsSelected in `CASE WHEN MIN(COALESCE(WGL.is_skipped, 0)) = 0 THEN 1 ELSE 0 END`.

- [ ] **Step 3: Verify the workflow saved correctly**

Use `mcp__n8n-mcp__n8n_get_workflow` again, confirm the `Pull Current Week Grocery List` node's query now contains `is_skipped`.

- [ ] **Step 4: Smoke-test via webhook**

```bash
WDR='For the week of April 26th to May 2nd, 2026'
WSD='2026-04-26'
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/fetch_grocery_items?weekStartDate=$WSD&weekDateRange=$(printf %s "$WDR" | jq -sRr @uri)" | python -c "
import json, sys
d = json.load(sys.stdin)
selected = sum(1 for i in d if i.get('IsSelected') == 1)
total = len(d)
print(f'total={total} selected={selected}')
print('Sample:', [{'name': i['ItemName'], 'IsSelected': i['IsSelected']} for i in d[:3]])
"
```

Expected: same `selected` count as before the change (because no rows have is_skipped=1 yet). If the count differs, the query has a bug.

- [ ] **Step 5: Verify a known-checked item still appears as IsSelected=1**

Pick any item that you know is in `WeeklyGroceryList` for the current week (e.g., `Cinnamon Toast Crunch` if it's in your staples). Find it in the response and confirm `IsSelected: 1`. This is the regression check for the reader change.

- [ ] **Step 6: Commit (not applicable — this is an n8n workflow, no git change)**

There is no git commit for n8n workflow changes. Update memory.md instead in Task 6's wrap-up.

---

## Task 3: Update clip-server `/api/heb/weekly-items` route

**Files:**
- Modify: `C:\New Grocery App\heb-coupon-scraper\src\heb-cart-routes.js` lines 981-1047 (`router.get('/weekly-items', ...)`)

**Why next:** Same backward-compat property as Task 2 — adding `AND is_skipped = 0` is a no-op while all rows have `is_skipped=0`. **Also includes a latent bug fix:** the route currently selects `wgl.Category` which was dropped in WGL-Fix Phase 3, so the route is currently broken. We fix it here as part of the same PR.

- [ ] **Step 1: Read the current route**

```bash
sed -n '978,1047p' "C:/New Grocery App/heb-coupon-scraper/src/heb-cart-routes.js"
```

Confirm: the SELECT contains `wgl.Category` and there is no `is_skipped` filter.

- [ ] **Step 2: Edit the SQL query in the route**

Replace the `db.pool.execute(...)` call (lines 992-1005) with:

```js
    const [rows] = await db.pool.execute(
      `SELECT wgl.id, wgl.ItemID, wgl.ItemName, c.name AS Category, wgl.Store, wgl.Quantity,
              wgl.Unit, wgl.WeekDateRange,
              cm.coupon_hash_id, cm.confidence AS coupon_confidence, cm.user_accepted AS coupon_user_accepted,
              hc.product_name AS coupon_product_name, hc.savings_amount AS coupon_savings,
              hc.discount AS coupon_discount, hc.image_url AS coupon_image_url,
              hc.clipped_status AS coupon_clipped, hc.brand AS coupon_brand
       FROM WeeklyGroceryList wgl
       LEFT JOIN categories c ON c.id = wgl.category_id
       LEFT JOIN coupon_matches cm ON cm.grocery_list_id = wgl.id
       LEFT JOIN heb_coupons hc ON hc.hash_id = cm.coupon_hash_id AND hc.is_active = 1
       WHERE wgl.WeekDateRange = ?
         AND wgl.is_skipped = 0
       ORDER BY c.name, wgl.ItemName`,
      [weekDateRange]
    );
```

Three changes from the current SQL: (1) `wgl.Category` → `c.name AS Category`, (2) added `LEFT JOIN categories c ON c.id = wgl.category_id`, (3) added `AND wgl.is_skipped = 0` to WHERE, (4) `ORDER BY wgl.Category` → `ORDER BY c.name`.

- [ ] **Step 3: Verify no other reference to dropped `wgl.Category` in this file**

```bash
grep -n "wgl\.Category\|wgl\.Category" "C:/New Grocery App/heb-coupon-scraper/src/heb-cart-routes.js"
```

Expected: no output (other usages, if any, would be a separate latent bug — out of scope).

- [ ] **Step 4: Rebuild and restart the clip-server Docker container**

```bash
cd "C:/hsa-automation" && docker compose up -d --build heb-clip-server
```

Wait for the build to complete and the container to report "healthy" or "running":

```bash
docker compose ps heb-clip-server
```

- [ ] **Step 5: Smoke-test the route**

```bash
WDR='For the week of April 26th to May 2nd, 2026'
curl -s "https://clip.needexcelexpert.com/api/heb/weekly-items?weekDateRange=$(printf %s "$WDR" | jq -sRr @uri)" | python -c "
import json, sys
d = json.load(sys.stdin)
print('success:', d.get('success'))
print('count:', len(d.get('items', [])))
print('first:', d['items'][0] if d.get('items') else None)
"
```

Expected: `success: true`, non-zero count, first item has `Category` populated (the JOIN works) and matches a real WGL row for the current week. If `success: false` or Category is null, fix the SQL before proceeding.

- [ ] **Step 6: Commit the clip-server change**

```bash
cd "C:/New Grocery App/heb-coupon-scraper"
git add src/heb-cart-routes.js
git commit -m "fix(heb-cart): filter is_skipped + repair dropped Category column in /weekly-items

The route previously selected wgl.Category which was dropped in WGL-Fix
Phase 3 (the route had been silently broken). Replaces with a JOIN to
the categories table.

Adds wgl.is_skipped = 0 filter to support soft-delete of meal-ingredient
items from the staples view (paired with the Selection Uncheck workflow
update).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If the heb-coupon-scraper repo has an upstream that auto-deploys, push it. Otherwise leave as a local commit until the user pushes.

---

## Task 4: Update `Selection Uncheck` writer

**Files:**
- Modify: n8n workflow `Selection Uncheck` (ID: `IgQIsJCu5RZ9TYKJ`), the MySQL DELETE node

**Why next:** With reader updated, soft-deleting rows now produces the correct user-visible behavior (item disappears from the list).

- [ ] **Step 1: Read the current workflow**

Use `mcp__n8n-mcp__n8n_get_workflow` with `id: "IgQIsJCu5RZ9TYKJ"`. Locate the MySQL node and save its current query as the rollback baseline.

- [ ] **Step 2: Update the SQL to a soft-delete UPDATE**

Replace the MySQL node's `parameters.query` with:

```sql
UPDATE WeeklyGroceryList
SET is_skipped = 1, skipped_at = NOW()
WHERE LOWER(TRIM(ItemName)) = LOWER(TRIM('{{ $json.body.itemName }}'))
  AND week_start_date = STR_TO_DATE('{{ $json.body.weekStartDate }}', '%Y-%m-%d');
```

Note: removes the `DataSource = 'Staples'` filter that was in the original DELETE — soft-delete applies uniformly across DataSource.

- [ ] **Step 3: Verify the workflow saved**

Use `mcp__n8n-mcp__n8n_get_workflow` again, confirm the node's query contains `UPDATE WeeklyGroceryList SET is_skipped = 1`.

- [ ] **Step 4: Smoke-test with a known item that has is_skipped=0**

Pick an item you know is currently checked. Verify its current state in MySQL first:

```sql
SELECT ItemName, week_start_date, DataSource, is_skipped
FROM WeeklyGroceryList
WHERE LOWER(TRIM(ItemName)) = 'cinnamon toast crunch'
  AND week_start_date = '2026-04-26'
```

Expected: 1 row with `is_skipped: 0`. (Substitute a different item if Cinnamon Toast Crunch isn't in your week.)

Then call the webhook:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  "https://n8n-grocery.needexcelexpert.com/webhook/selection_uncheck" \
  -d '{"itemName":"Cinnamon Toast Crunch","weekDateRange":"For the week of April 26th to May 2nd, 2026","weekStartDate":"2026-04-26"}'
```

Expected: `{"success":true}` (or whatever the workflow returns).

- [ ] **Step 5: Verify the row was soft-deleted, not hard-deleted**

```sql
SELECT ItemName, week_start_date, DataSource, is_skipped, skipped_at
FROM WeeklyGroceryList
WHERE LOWER(TRIM(ItemName)) = 'cinnamon toast crunch'
  AND week_start_date = '2026-04-26'
```

Expected: 1 row, `is_skipped: 1`, `skipped_at: <recent timestamp>`. The row is still there (not DELETE'd).

If you see 0 rows, the workflow accidentally still has DELETE — revert.

- [ ] **Step 6: Verify the reader now hides the item**

```bash
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/fetch_grocery_items?weekStartDate=2026-04-26&weekDateRange=$(printf %s "For the week of April 26th to May 2nd, 2026" | jq -sRr @uri)" | python -c "
import json, sys
d = json.load(sys.stdin)
target = next((i for i in d if i['ItemName'] == 'Cinnamon Toast Crunch'), None)
print('IsSelected:', target['IsSelected'] if target else 'NOT FOUND')
"
```

Expected: `IsSelected: 0`. Together with Step 5, this confirms the round-trip works.

---

## Task 5: Update `Selection Check` writer

**Files:**
- Modify: n8n workflow `Selection Check` (ID: `DIOBZkmtBz543RLN`)

**Why last writer:** Allows users to un-skip an item they previously soft-deleted. Add an UPDATE step before the existing INSERT-WHERE-NOT-EXISTS so the order of operations is: re-activate first, insert if missing.

- [ ] **Step 1: Read the current workflow**

Use `mcp__n8n-mcp__n8n_get_workflow` with `id: "DIOBZkmtBz543RLN"`. Note the existing structure:
- Webhook → `Check Item` (MySQL INSERT...WHERE NOT EXISTS) → `Respond`

- [ ] **Step 2: Add a new MySQL node "Clear Skipped Flag" before "Check Item"**

Insert a new node between Webhook and Check Item. Use `mcp__n8n-mcp__n8n_update_full_workflow` (since you need to add a node and rewire connections — partial update may not handle node insertion cleanly).

The new node specification:

```json
{
  "id": "mysql-clear-skipped",
  "name": "Clear Skipped Flag",
  "type": "n8n-nodes-base.mySql",
  "typeVersion": 2.5,
  "position": [350, 300],
  "parameters": {
    "operation": "executeQuery",
    "query": "UPDATE WeeklyGroceryList SET is_skipped = 0, skipped_at = NULL WHERE LOWER(TRIM(ItemName)) = LOWER(TRIM('{{ $json.body.itemName }}')) AND week_start_date = STR_TO_DATE('{{ $json.body.weekStartDate }}', '%Y-%m-%d');",
    "options": {}
  },
  "credentials": {
    "mySql": {
      "id": "lqIXlvVVqfE4v7DF",
      "name": "MySQL account"
    }
  },
  "alwaysOutputData": true
}
```

New connections:
- `Webhook` → `Clear Skipped Flag`
- `Clear Skipped Flag` → `Check Item`
- `Check Item` → `Respond` (unchanged)

- [ ] **Step 3: Verify the existing `Check Item` INSERT still references the original `$json.body.*` paths**

The new `Clear Skipped Flag` node uses `{{ $json.body.* }}` which resolves the Webhook's body. The existing `Check Item` node also uses `{{ $json.body.* }}`. Both nodes see the original webhook body because n8n forwards `$json` from upstream by default. Confirm by checking the saved workflow that both nodes still reference `body.itemName`, `body.weekStartDate`, etc.

If the existing `Check Item` query uses `$('Webhook').item.json.body.*` instead, leave it alone — that path also works.

- [ ] **Step 4: Smoke-test the unskip flow**

The item from Task 4 (Cinnamon Toast Crunch) should currently have `is_skipped=1`. Call selection_check to re-activate:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  "https://n8n-grocery.needexcelexpert.com/webhook/selection_check" \
  -d '{"itemId":36,"itemName":"Cinnamon Toast Crunch","category":"Cereal & breakfast","store":"HEB","quantity":1,"weekDateRange":"For the week of April 26th to May 2nd, 2026","weekStartDate":"2026-04-26"}'
```

Expected: `{"success":true}`.

(If the item ID 36 doesn't match Cinnamon Toast Crunch in your DB, look it up via `SELECT ItemID FROM GroceryItems WHERE ItemName = 'Cinnamon Toast Crunch'` and substitute.)

- [ ] **Step 5: Verify `is_skipped` flipped back to 0**

```sql
SELECT ItemName, is_skipped, skipped_at
FROM WeeklyGroceryList
WHERE LOWER(TRIM(ItemName)) = 'cinnamon toast crunch'
  AND week_start_date = '2026-04-26'
```

Expected: 1 row, `is_skipped: 0`, `skipped_at: NULL`. The row exists (was UPDATE-ed back), and the INSERT step skipped because NOT EXISTS was false.

- [ ] **Step 6: Smoke-test the brand-new-add flow**

Verify that adding a never-before-checked item still works (the INSERT path):

```sql
-- Pre-state: confirm Apples is not in WGL for this week
SELECT * FROM WeeklyGroceryList WHERE LOWER(TRIM(ItemName)) = 'apples' AND week_start_date = '2026-04-26'
```

If 0 rows, proceed. If 1 row exists, pick a different item that's NOT in your current week.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  "https://n8n-grocery.needexcelexpert.com/webhook/selection_check" \
  -d '{"itemId":33,"itemName":"Apples","category":"Fruit & vegetables","store":"HEB","quantity":1,"weekDateRange":"For the week of April 26th to May 2nd, 2026","weekStartDate":"2026-04-26"}'
```

Expected: `{"success":true}`.

```sql
SELECT ItemName, is_skipped FROM WeeklyGroceryList WHERE LOWER(TRIM(ItemName)) = 'apples' AND week_start_date = '2026-04-26'
```

Expected: 1 row, `is_skipped: 0`. The INSERT path created a new row.

- [ ] **Step 7: Clean up the test row**

```bash
curl -s -X POST -H "Content-Type: application/json" \
  "https://n8n-grocery.needexcelexpert.com/webhook/selection_uncheck" \
  -d '{"itemName":"Apples","weekDateRange":"For the week of April 26th to May 2nd, 2026","weekStartDate":"2026-04-26"}'
```

This soft-deletes Apples. To fully delete (since you didn't intend to add it), run:

```sql
DELETE FROM WeeklyGroceryList WHERE LOWER(TRIM(ItemName)) = 'apples' AND week_start_date = '2026-04-26' AND DataSource = 'Staples'
```

via the MySQL UI or another migration. (MySQL MCP is read-only; use the host MySQL CLI: `docker exec -it <mysql_container> mysql -u root -p hsa -e "..."`.)

---

## Task 6: End-to-end behavioral verification (the user's actual bug)

**Files:** None (verification only)

**Why this task:** The whole reason for this work is bug #40 — let user actually un-check Sugar (a MealIngredient) and see it disappear. This is the acceptance test.

- [ ] **Step 1: Verify Sugar's current state in DB**

```sql
SELECT ItemName, ItemID, week_start_date, DataSource, is_skipped
FROM WeeklyGroceryList
WHERE LOWER(TRIM(ItemName)) = 'sugar'
  AND week_start_date = '2026-04-26'
```

Expected: 1 row, `DataSource: MealIngredients`, `is_skipped: 0`. (If 0 rows, the user has changed meals; substitute another MealIngredient item.)

- [ ] **Step 2: Verify Sugar appears as IsSelected=1 in the staples reader**

```bash
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/fetch_grocery_items?weekStartDate=2026-04-26&weekDateRange=$(printf %s "For the week of April 26th to May 2nd, 2026" | jq -sRr @uri)" | python -c "
import json, sys
d = json.load(sys.stdin)
sugar = next((i for i in d if i['ItemName'] == 'Sugar'), None)
print('Sugar IsSelected:', sugar['IsSelected'] if sugar else 'NOT FOUND')
"
```

Expected: `IsSelected: 1`.

- [ ] **Step 3: Soft-delete Sugar via the (now-updated) Selection Uncheck**

```bash
curl -s -X POST -H "Content-Type: application/json" \
  "https://n8n-grocery.needexcelexpert.com/webhook/selection_uncheck" \
  -d '{"itemName":"Sugar","weekDateRange":"For the week of April 26th to May 2nd, 2026","weekStartDate":"2026-04-26"}'
```

Expected: success response.

- [ ] **Step 4: Verify Sugar now appears as IsSelected=0 in the staples reader**

```bash
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/fetch_grocery_items?weekStartDate=2026-04-26&weekDateRange=$(printf %s "For the week of April 26th to May 2nd, 2026" | jq -sRr @uri)" | python -c "
import json, sys
d = json.load(sys.stdin)
sugar = next((i for i in d if i['ItemName'] == 'Sugar'), None)
print('Sugar IsSelected:', sugar['IsSelected'] if sugar else 'NOT FOUND')
"
```

Expected: `IsSelected: 0`. (Sugar still appears in the list — that's correct, it just shows as unchecked. The Plan UI will reflect this.)

- [ ] **Step 5: Verify HEB Cart Builder weekly-items now hides Sugar**

```bash
WDR='For the week of April 26th to May 2nd, 2026'
curl -s "https://clip.needexcelexpert.com/api/heb/weekly-items?weekDateRange=$(printf %s "$WDR" | jq -sRr @uri)" | python -c "
import json, sys
d = json.load(sys.stdin)
sugar = next((i for i in d['items'] if i['ItemName'] == 'Sugar'), None)
print('Sugar in HEB weekly-items:', sugar)
"
```

Expected: `None` (Sugar is excluded by the `is_skipped = 0` filter).

- [ ] **Step 6: Verify Recipe Ingredients screen still shows Sugar**

The Recipe Ingredients screen reads `recipe_ingredient_list`, not WGL — should be unaffected. Quick browser check:

1. Open `http://localhost:3000/#meals` → AI Planner → Meal Plans → Generate Grocery List
2. Confirm Sugar still appears under the Shawarma recipe

(Or skip the browser if no dev server running and rely on code review of [src/components/RecipeIngredients.js](../../../src/components/RecipeIngredients.js) — confirm no read of WGL.)

- [ ] **Step 7: Verify the user can RE-ADD Sugar by clicking the checkbox**

In the Plan UI (`http://localhost:3000/#plan`), find Sugar (will appear in Pantry Staples or wherever its category lives), click to check. After ~1s the network call completes; reload and confirm Sugar shows as checked.

Or via curl:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  "https://n8n-grocery.needexcelexpert.com/webhook/selection_check" \
  -d '{"itemId":1099,"itemName":"Sugar","category":"Pantry staples","store":"HEB","quantity":1,"weekDateRange":"For the week of April 26th to May 2nd, 2026","weekStartDate":"2026-04-26"}'
```

```sql
SELECT is_skipped FROM WeeklyGroceryList WHERE LOWER(TRIM(ItemName)) = 'sugar' AND week_start_date = '2026-04-26'
```

Expected: `is_skipped: 0`. Sugar is "back".

- [ ] **Step 8: Update bug #40's resolution notes via the feedback webhook**

```bash
curl -s -X POST -H "Content-Type: application/json" \
  "https://n8n-grocery.needexcelexpert.com/webhook/update_feedback_status" \
  -d '{"id": 40, "status": "fixed", "resolution_notes": "Fixed in two parts: (1) weekDates.js formatDateForSQL — date drift was breaking selection_uncheck; (2) is_skipped soft-delete on WGL — meal-ingredient items can now be unchecked from staples view (recipe link preserved). Plan: docs/superpowers/plans/2026-04-25-skip-meal-ingredient-plan.md"}'
```

Note: bug #40 was already marked `fixed` after the weekDates.js commit. This call updates the resolution notes to reflect the complete fix.

- [ ] **Step 9: Update memory.md with all the new/updated workflow IDs**

Edit [C:\Users\Corey\.claude\projects\c--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md](C:\Users\Corey\.claude\projects\c--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md), in the "n8n Workflows Created" section, update lines:

- `Selection Check` (DIOBZkmtBz543RLN) — note the addition of the "Clear Skipped Flag" UPDATE node
- `Selection Uncheck` (IgQIsJCu5RZ9TYKJ) — note the change from DELETE to UPDATE-soft-delete
- `Pull Grocery Staples` (JoaR6klT950hwSLB) — note the is_skipped filtering in IsSelected

Add a new top-level note in the appropriate section:

```
## Soft-delete via is_skipped (2026-04-25)
- WGL has `is_skipped TINYINT(1) DEFAULT 0` + `skipped_at TIMESTAMP NULL` columns.
- Selection Uncheck performs UPDATE SET is_skipped=1 (no longer DELETE). Removes DataSource='Staples' filter — uniform soft-delete.
- Selection Check has 2-step path: UPDATE is_skipped=0 then INSERT-WHERE-NOT-EXISTS.
- Pull Grocery Staples reader filters: `IsSelected = 1 only when row exists AND is_skipped=0`.
- Clip-server `/api/heb/weekly-items` route: filters `is_skipped=0` AND fixed dropped-Category bug (now JOINs categories).
- Limitation: skip is lost when meal is removed-and-readded (Cleanup Orphan Meal Ingredients hard-deletes the row).
```

---

## Self-Review checklist (run before declaring done)

After implementing all tasks, run this self-review:

- [ ] Migration completed: `SHOW COLUMNS FROM WeeklyGroceryList` shows `is_skipped` and `skipped_at`.
- [ ] Reader (Pull Grocery Staples) hides skipped items: tested with Sugar in Task 6.
- [ ] Reader (clip-server) hides skipped items: tested in Task 6 Step 5.
- [ ] Writer (Selection Uncheck) sets `is_skipped=1` regardless of DataSource: tested in Task 4.
- [ ] Writer (Selection Check) clears `is_skipped=0` for existing rows AND inserts new rows when missing: tested in Task 5.
- [ ] No WGL.Category references remain in clip-server: grep returns empty.
- [ ] Bug #40 resolution notes updated.
- [ ] memory.md reflects new state.

## Rollback plan

If something goes wrong mid-rollout, run in reverse order:

1. Revert clip-server `heb-cart-routes.js` (`git revert <commit>`) and rebuild container.
2. Revert `Selection Check` workflow to original single-INSERT.
3. Revert `Selection Uncheck` workflow to original DELETE.
4. Revert `Pull Grocery Staples` query to original.
5. Last resort: drop the column with `ALTER TABLE WeeklyGroceryList DROP COLUMN is_skipped, DROP COLUMN skipped_at, DROP INDEX idx_week_skipped`. (No data loss — no rows are deleted in the new flow, only flagged.)

After any rollback, verify with the smoke tests from the corresponding task to confirm prior behavior restored.

---

## Open follow-ups (out of scope)

These were called out in the spec as deferred. Don't do them in this plan; track separately if they bite:

- UI tooltip / source badge on meal-ingredient items in the Plan view ("From: Shawarma Bowls — uncheck to skip purchase")
- Periodic cleanup of stale `shopping_progress` rows pointing at skipped WGL rows
- "Permanently delete" affordance for skipped OneOff items
- Soft-delete the meal-ingredient row in `Remove Weekly Selection` cleanup so the skip persists across meal-remove-and-readd cycles
