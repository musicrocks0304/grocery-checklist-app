# Grocery Category Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace inconsistent grocery categories with a 14-category HEB-aligned taxonomy, migrate existing data, and ensure all insertion points use the new categories.

**Architecture:** A MySQL mapping table (`grocery_category_map`) defines HEB → app category mappings. Existing data is batch-migrated via n8n workflows. Frontend dropdowns and groupBy logic are updated. All code paths that insert items default to proper categories instead of "General".

**Tech Stack:** MySQL (via n8n workflows for DDL), React frontend, n8n webhooks, Express routes (heb-cart-routes.js)

**Design doc:** `docs/plans/2026-04-11-grocery-category-redesign-design.md`

---

## The 14 New Categories (reference)

```
Bakery & bread, Beverages, Cereal & breakfast, Condiments & sauces,
Dairy & eggs, Deli & prepared food, Frozen food, Fruit & vegetables,
Meat & seafood, Pasta, rice & grains, Pantry staples, Snacks,
Spices & seasonings, Household & other
```

---

### Task 1: Create the Category Mapping Table

Create an n8n migration workflow that creates `grocery_category_map` and populates it with HEB → app category mappings.

**Files:**
- Create: n8n workflow "Create grocery_category_map Table"

**Step 1: Create the n8n migration workflow**

Use `mcp__n8n-mcp__n8n_create_workflow` to create a workflow with:
- Webhook node (GET, path: `create_grocery_category_map`, responseMode: responseNode)
- MySQL node with this SQL:

```sql
CREATE TABLE IF NOT EXISTS grocery_category_map (
  id INT AUTO_INCREMENT PRIMARY KEY,
  heb_pattern VARCHAR(200) NOT NULL,
  app_category VARCHAR(100) NOT NULL,
  priority INT DEFAULT 0,
  UNIQUE KEY uk_pattern (heb_pattern)
);

INSERT IGNORE INTO grocery_category_map (heb_pattern, app_category, priority) VALUES
-- Pantry sub-splits (higher priority, matched first)
('Pantry/Snacks & candy%', 'Snacks', 10),
('Pantry/Cereal & breakfast%', 'Cereal & breakfast', 10),
('Pantry/Spices & seasonings%', 'Spices & seasonings', 10),
('Pantry/Pasta & rice%', 'Pasta, rice & grains', 10),
('Pantry/Condiments%', 'Condiments & sauces', 10),
('Pantry/Sauces & marinades%', 'Condiments & sauces', 10),
('Pantry/Dressing, oil & vinegar%', 'Condiments & sauces', 10),
('Pantry/Salsa & dip%', 'Condiments & sauces', 10),
-- Pantry remainder (lower priority catchall)
('Pantry%', 'Pantry staples', 1),
-- Direct HEB L1 mappings
('Bakery & bread%', 'Bakery & bread', 5),
('Beverages%', 'Beverages', 5),
('Dairy & eggs%', 'Dairy & eggs', 5),
('Deli & prepared food%', 'Deli & prepared food', 5),
('Frozen food%', 'Frozen food', 5),
('Fruit & vegetables%', 'Fruit & vegetables', 5),
('Meat & seafood%', 'Meat & seafood', 5),
-- Non-food catchalls
('Baby & kids%', 'Household & other', 1),
('Everyday essentials%', 'Household & other', 1),
('Home & outdoor%', 'Household & other', 1),
('Health & beauty%', 'Household & other', 1);
```

- Respond to Webhook node (with CORS headers `*`)

**Step 2: Activate and trigger the workflow**

```bash
# Activate
source /c/hsa-automation/.env && curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<ID>/activate"
# Trigger
curl -s "https://n8n-grocery.needexcelexpert.com/webhook/create_grocery_category_map"
```

**Step 3: Verify the table exists with correct data**

```sql
SELECT * FROM grocery_category_map ORDER BY priority DESC, app_category;
```

Expected: 21 rows with Pantry sub-splits at priority 10, HEB L1 at 5, catchalls at 1.

**Step 4: Deactivate the migration workflow**

```bash
source /c/hsa-automation/.env && curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<ID>/deactivate"
```

---

### Task 2: Migrate GroceryItems Categories

Reclassify all 81 items in `GroceryItems` from old categories to new 14-category taxonomy.

**Step 1: Audit current state**

```sql
SELECT Category, GroceryStoreSection, COUNT(*) as cnt 
FROM GroceryItems WHERE IsActive = 1 
GROUP BY Category, GroceryStoreSection ORDER BY Category, GroceryStoreSection;
```

**Step 2: Build and run the migration UPDATE**

The mapping logic uses `GroceryStoreSection` as the primary signal (it's closer to store-aisle than the old meal-context Category). Run these UPDATEs via n8n MySQL node or a temporary workflow:

```sql
-- Map using GroceryStoreSection (most reliable signal)
UPDATE GroceryItems SET Category = 'Fruit & vegetables' WHERE GroceryStoreSection = 'Produce';
UPDATE GroceryItems SET Category = 'Dairy & eggs' WHERE GroceryStoreSection = 'Dairy';
UPDATE GroceryItems SET Category = 'Dairy & eggs' WHERE GroceryStoreSection = 'Refrigerated' AND ItemName LIKE '%milk%' OR ItemName LIKE '%cheese%' OR ItemName LIKE '%yogurt%' OR ItemName LIKE '%egg%' OR ItemName LIKE '%butter%' OR ItemName LIKE '%cream%';
UPDATE GroceryItems SET Category = 'Meat & seafood' WHERE GroceryStoreSection IN ('Meat', 'Meat & Seafood');
UPDATE GroceryItems SET Category = 'Frozen food' WHERE GroceryStoreSection = 'Frozen';
UPDATE GroceryItems SET Category = 'Bakery & bread' WHERE GroceryStoreSection = 'Bakery';
UPDATE GroceryItems SET Category = 'Beverages' WHERE GroceryStoreSection = 'Beverages';
UPDATE GroceryItems SET Category = 'Snacks' WHERE GroceryStoreSection = 'Snacks';
UPDATE GroceryItems SET Category = 'Household & other' WHERE GroceryStoreSection = 'Health';

-- For remaining Pantry and Refrigerated items, use heb_frequent_products lookup
UPDATE GroceryItems gi
JOIN heb_frequent_products hfp ON LOWER(gi.ItemName) LIKE CONCAT('%', LOWER(hfp.product_name), '%')
JOIN grocery_category_map gcm ON hfp.category_path LIKE gcm.heb_pattern
SET gi.Category = gcm.app_category
WHERE gi.Category IN ('Pantry', 'Lunch', 'Breakfast', 'Dinner')
  AND gcm.priority = (
    SELECT MAX(gcm2.priority) FROM grocery_category_map gcm2 
    WHERE hfp.category_path LIKE gcm2.heb_pattern
  );

-- Catch remaining old-category items that didn't match HEB
UPDATE GroceryItems SET Category = 'Pantry staples' 
WHERE Category IN ('Pantry', 'Lunch', 'Breakfast', 'Dinner') AND GroceryStoreSection = 'Pantry';

UPDATE GroceryItems SET Category = 'Pantry staples' 
WHERE Category IN ('Pantry', 'Lunch', 'Breakfast', 'Dinner') AND GroceryStoreSection = 'Refrigerated';
```

**Important:** These queries need to be run carefully. Run each UPDATE individually and check affected rows. For the JOIN query, test with a SELECT first to preview what would change.

**Step 3: Verify migration**

```sql
SELECT Category, COUNT(*) as cnt FROM GroceryItems WHERE IsActive = 1 GROUP BY Category ORDER BY Category;
```

Expected: Only the 14 new categories. No "Lunch", "Breakfast", "Dinner", "Pantry", or "General".

**Step 4: Handle any stragglers manually**

```sql
SELECT ItemID, ItemName, Category, GroceryStoreSection FROM GroceryItems 
WHERE Category NOT IN ('Bakery & bread','Beverages','Cereal & breakfast','Condiments & sauces','Dairy & eggs','Deli & prepared food','Frozen food','Fruit & vegetables','Meat & seafood','Pasta, rice & grains','Pantry staples','Snacks','Spices & seasonings','Household & other');
```

If any remain, manually UPDATE them based on item name.

---

### Task 3: Migrate WeeklyGroceryList Categories

Fix the 58 "General" items and inconsistent category names in WeeklyGroceryList.

**Step 1: Fix inconsistent naming first**

```sql
UPDATE WeeklyGroceryList SET Category = 'Dairy & eggs' WHERE Category = 'Dairy';
UPDATE WeeklyGroceryList SET Category = 'Spices & seasonings' WHERE Category IN ('Seasoning', 'Spices & Seasonings');
UPDATE WeeklyGroceryList SET Category = 'Meat & seafood' WHERE Category = 'Meat & Seafood';
UPDATE WeeklyGroceryList SET Category = 'Snacks' WHERE Category = 'Nuts';
UPDATE WeeklyGroceryList SET Category = 'Fruit & vegetables' WHERE Category = 'Produce';
```

**Step 2: Reclassify "General" items using HEB product lookup**

```sql
-- Preview first
SELECT wgl.id, wgl.ItemName, wgl.Category, hfp.category, hfp.category_path, gcm.app_category
FROM WeeklyGroceryList wgl
JOIN heb_frequent_products hfp ON LOWER(wgl.ItemName) LIKE CONCAT('%', LOWER(hfp.product_name), '%')
JOIN grocery_category_map gcm ON hfp.category_path LIKE gcm.heb_pattern
WHERE wgl.Category = 'General'
AND gcm.priority = (
    SELECT MAX(gcm2.priority) FROM grocery_category_map gcm2 
    WHERE hfp.category_path LIKE gcm2.heb_pattern
)
GROUP BY wgl.id
LIMIT 20;

-- Then apply
UPDATE WeeklyGroceryList wgl
JOIN (
    SELECT wgl2.id, gcm.app_category,
           ROW_NUMBER() OVER (PARTITION BY wgl2.id ORDER BY gcm.priority DESC) as rn
    FROM WeeklyGroceryList wgl2
    JOIN heb_frequent_products hfp ON LOWER(wgl2.ItemName) LIKE CONCAT('%', LOWER(hfp.product_name), '%')
    JOIN grocery_category_map gcm ON hfp.category_path LIKE gcm.heb_pattern
    WHERE wgl2.Category = 'General'
) matched ON wgl.id = matched.id AND matched.rn = 1
SET wgl.Category = matched.app_category;
```

**Step 3: Handle remaining "General" items**

```sql
SELECT id, ItemName, Category FROM WeeklyGroceryList WHERE Category = 'General';
```

For any remaining, either:
- Manually UPDATE based on item name (for small numbers)
- Or set to "Pantry staples" as the safe default:

```sql
UPDATE WeeklyGroceryList SET Category = 'Pantry staples' WHERE Category = 'General';
```

**Step 4: Verify**

```sql
SELECT Category, COUNT(*) as cnt FROM WeeklyGroceryList GROUP BY Category ORDER BY Category;
```

Expected: No "General", no "Dairy" (only "Dairy & eggs"), no "Seasoning", etc.

---

### Task 4: Add Category Constants to Frontend

Create a shared constants file for the 14 categories used across components.

**Files:**
- Create: `src/constants/categories.js`

**Step 1: Create the constants file**

```javascript
// The 14 HEB-aligned grocery categories
export const GROCERY_CATEGORIES = [
  'Bakery & bread',
  'Beverages',
  'Cereal & breakfast',
  'Condiments & sauces',
  'Dairy & eggs',
  'Deli & prepared food',
  'Frozen food',
  'Fruit & vegetables',
  'Meat & seafood',
  'Pasta, rice & grains',
  'Pantry staples',
  'Snacks',
  'Spices & seasonings',
  'Household & other',
];

export const DEFAULT_CATEGORY = 'Pantry staples';
```

**Step 2: Commit**

```bash
git add src/constants/categories.js
git commit -m "feat: add grocery category constants for HEB-aligned taxonomy"
```

---

### Task 5: Update GroceryChecklist.js

Replace hardcoded dropdowns, update groupBy, and fix "General" defaults.

**Files:**
- Modify: `src/components/GroceryChecklist.js`

**Step 1: Import categories**

At the top of the file, add:
```javascript
import { GROCERY_CATEGORIES, DEFAULT_CATEGORY } from '../constants/categories';
```

**Step 2: Replace hardcoded Category dropdown (lines 997-1021)**

Replace the 6 hardcoded `<option>` elements with a dynamic list:

```jsx
<option value="">Select category...</option>
{GROCERY_CATEGORIES.map(cat => (
  <option key={cat} value={cat}>{cat}</option>
))}
```

**Step 3: Remove GroceryStoreSection dropdown (lines 1094-1122)**

Delete the entire GroceryStoreSection `<select>` block and its label. Since Category now serves as the store section, this field is redundant.

Also remove `groceryStoreSection` from `newItemForm` state (line 104-110) and from the form reset logic.

**Step 4: Fix "General" defaults**

- Line 463: Change `Category: newItemForm.category || "General"` → `Category: newItemForm.category || DEFAULT_CATEGORY`
- Line 583: Change `Category: "General"` → `Category: DEFAULT_CATEGORY`
- Line 585: Remove `GroceryStoreSection: "Other"` (field no longer used)

**Step 5: Simplify groupBy toggle (line 116, lines 1386-1397)**

Change default groupBy:
- Line 116: `const [groupBy, setGroupBy] = useState("Category");`

Update the toggle buttons array to only show two options:
```javascript
["Category", "Store"]
```

Remove "GroceryStoreSection" from the toggle. Since Category IS the store section now, "Section" is redundant.

**Step 6: Update handleAddItem payload (around line 470-490)**

Remove `groceryStoreSection` from the POST body sent to `ENDPOINTS.addGroceryItems`. The backend will derive it from Category or ignore it.

**Step 7: Update handleQuickAddOneOff local state (around line 580-590)**

Remove `GroceryStoreSection` from the optimistic local item. Keep only `Category: DEFAULT_CATEGORY`.

**Step 8: Run tests**

```bash
cd "C:\New Grocery App\grocery-checklist-app" && npm test
```

Expected: All tests pass. If any fail due to snapshot or mock data changes, update them.

**Step 9: Commit**

```bash
git add src/components/GroceryChecklist.js
git commit -m "feat: replace hardcoded categories with HEB-aligned taxonomy in GroceryChecklist"
```

---

### Task 6: Update InStoreMode.js

Switch from `GroceryStoreSection` to `Category` for grouping.

**Files:**
- Modify: `src/components/InStoreMode.js`

**Step 1: Update getGroupedItems() (lines 643-673)**

Change line 648:
```javascript
// Before
const section = item.GroceryStoreSection || "Other";
// After
const section = item.Category || "Pantry staples";
```

**Step 2: Update section completion detection (lines 581-606)**

Change line 584:
```javascript
// Before
const section = item.GroceryStoreSection || 'Other';
// After
const section = item.Category || 'Pantry staples';
```

**Step 3: Search for any other GroceryStoreSection references**

Grep the file for `GroceryStoreSection` and update all occurrences to use `Category`.

**Step 4: Run tests**

```bash
npm test
```

**Step 5: Commit**

```bash
git add src/components/InStoreMode.js
git commit -m "feat: switch InStoreMode grouping from GroceryStoreSection to Category"
```

---

### Task 7: Update fallbackData.js

Fix the sample data to use new categories.

**Files:**
- Modify: `src/utils/fallbackData.js`

**Step 1: Update all Category and GroceryStoreSection values**

Replace the 5 sample items' categories:
- `"Lunches"` → `"Fruit & vegetables"` or `"Meat & seafood"` (based on item)
- `"Breakfast"` → `"Cereal & breakfast"` or `"Dairy & eggs"` (based on item)
- `"Snacks"` → `"Snacks"`
- `"General"` → `"Pantry staples"`

Set `GroceryStoreSection` to match `Category` for each item (or remove it if components no longer read it).

**Step 2: Commit**

```bash
git add src/utils/fallbackData.js
git commit -m "fix: update fallback data to use new HEB-aligned categories"
```

---

### Task 8: Update heb-cart-routes.js Defaults

Fix the Express routes that insert items with "General" default.

**Files:**
- Modify: `C:\New Grocery App\heb-coupon-scraper\src\heb-cart-routes.js`

**Step 1: Update add-oneoff-item route (line 1089)**

```javascript
// Before
category || 'General'
// After
category || 'Pantry staples'
```

**Step 2: Update add-weekly-item route (line 1150)**

```javascript
// Before
category || 'General', store || 'HEB', groceryStoreSection || 'Pantry'
// After  
category || 'Pantry staples', store || 'HEB', category || 'Pantry staples'
```

Note: `groceryStoreSection` parameter can stay in the route signature for backward compat but defaults to the category value.

**Step 3: Commit**

```bash
cd "C:\New Grocery App\heb-coupon-scraper"
git add src/heb-cart-routes.js
git commit -m "fix: default category to 'Pantry staples' instead of 'General' in HEB cart routes"
```

---

### Task 9: Update n8n Add One-Off Workflow

Fix the n8n workflow that defaults to "General".

**Workflow:** Add One-Off Grocery Item (ID: `ONzUncTlldVW6qJ1`)

**Step 1: Get current workflow**

```bash
source /c/hsa-automation/.env && curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/ONzUncTlldVW6qJ1" | jq '.nodes[] | select(.name | test("Insert|MySQL|SQL"; "i")) | .parameters'
```

**Step 2: Update the SQL node**

Use `mcp__n8n-mcp__n8n_update_partial_workflow` to change `"General"` to `"Pantry staples"` in the SQL expression:

```
'{{ $json.body.category || "Pantry staples" }}'
```

**Step 3: Verify by deactivating and reactivating the workflow**

```bash
source /c/hsa-automation/.env
curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/ONzUncTlldVW6qJ1/deactivate"
curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/ONzUncTlldVW6qJ1/activate"
```

---

### Task 10: Update AI Workflow Prompts for Category Assignment

Update the Meal Creator Build workflow to output grocery-compatible categories for ingredients.

**Workflow:** AI Meal Creator - Full Build (ID: `ATGuPNtocx6Xypyk`)

**Step 1: Get current system prompt**

Use `mcp__n8n-mcp__n8n_get_workflow` for ID `ATGuPNtocx6Xypyk` and find the LLM system prompt.

**Step 2: Add grocery category to the structured output**

The Build workflow outputs ingredients with `ingredient_category` (protein, produce, dairy, etc.). Add a `grocery_category` field to the output schema with instructions:

```
For each ingredient, also assign a grocery_category from this list:
Bakery & bread, Beverages, Cereal & breakfast, Condiments & sauces,
Dairy & eggs, Deli & prepared food, Frozen food, Fruit & vegetables,
Meat & seafood, Pasta rice & grains, Pantry staples, Snacks,
Spices & seasonings, Household & other

This grocery_category represents the store aisle where the item is found.
```

**Step 3: Update the downstream node that inserts into WeeklyGroceryList**

Ensure the `Category` field uses the new `grocery_category` from the AI output instead of defaulting to "General".

**Step 4: Test with a sample meal build**

Trigger the workflow manually and verify the output includes proper `grocery_category` values.

---

### Task 11: Smoke Test End-to-End

Verify the full flow works after all changes.

**Step 1: Test the Grocery Staples page**

- Load the page — items should group by the new 14 categories
- The "Category" groupBy should be default
- The "Section" toggle should be gone
- Click through each category tab — items should be reasonably distributed

**Step 2: Test adding a new staple item**

- Open "Add Item" form
- Verify dropdown shows all 14 categories (not the old 6)
- Add an item with a selected category → verify it appears in the correct group

**Step 3: Test quick-add one-off item**

- Use the quick-add input
- Verify the item appears under "Pantry staples" (not "General")

**Step 4: Test In-Store Mode**

- Navigate to Shop screen
- Verify items are grouped by the new categories (not GroceryStoreSection)
- Check off some items — verify progress works correctly

**Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: complete grocery category redesign — HEB-aligned 14-category taxonomy"
```

---

## Task Dependency Order

```
Task 1 (mapping table) → Task 2 (migrate GroceryItems) → Task 3 (migrate WeeklyGroceryList)
                       ↘
Task 4 (constants) → Task 5 (GroceryChecklist.js) → Task 6 (InStoreMode.js) → Task 7 (fallbackData.js)
                                                  ↘
Task 8 (heb-cart-routes) ─── can run in parallel with Task 5-7
Task 9 (n8n one-off workflow) ─── can run in parallel
Task 10 (AI workflow prompts) ─── can run in parallel
Task 11 (smoke test) ─── must be last
```

Tasks 1→2→3 are sequential (DB migration).
Tasks 4→5→6→7 are sequential (frontend, each builds on prior).
Tasks 8, 9, 10 are independent and can run in parallel with the frontend tasks.
Task 11 runs after everything else.
