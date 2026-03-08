# LocalStorage → Database Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate localStorage-backed state to DB-backed state for multi-device sync, using the DB as single source of truth and localStorage as stale-while-revalidate cache.

**Architecture:** DB-First with localStorage cache. Mutations go through n8n webhooks to MySQL first, then update React state from the DB response. Existing `weekly_selections` + `recipe_summary` tables store meal selections. New `shopping_progress` table stores in-store checked items. Session IDs become deterministic (computed, not stored).

**Tech Stack:** React (CRA), n8n webhooks (MySQL), MySQL 8 (`hsa` database on localhost:3307)

**Design doc:** `docs/plans/2026-03-08-localstorage-to-db-design.md`

---

## Task 1: Create `shopping_progress` Table

**Files:**
- n8n workflow (new migration workflow)

**Step 1: Create the n8n migration workflow**

Create a new n8n workflow named `Create shopping_progress Table` with this structure:
- Manual Trigger node
- MySQL node with credential ID `lqIXlvVVqfE4v7DF` running:

```sql
CREATE TABLE IF NOT EXISTS shopping_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  week_start_date VARCHAR(20) NOT NULL,
  item_id INT NOT NULL,
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_week_item (week_start_date, item_id)
);
```

**Step 2: Execute the migration**

Run the workflow manually via n8n UI. Verify table exists:
```sql
DESCRIBE shopping_progress;
```

**Step 3: Deactivate the migration workflow**

Deactivate after successful run (one-time migration).

---

## Task 2: Create n8n Webhook — `GET /fetch_weekly_meals`

This endpoint fetches the current week's selected meals with rich recipe data. While `chooseRecipeInstructions` already exists, we need a dedicated endpoint that returns the normalized shape App.js expects (including `recipe_description`, `prep_time_minutes`, etc. from `recipe_summary`).

**Files:**
- n8n workflow (new)

**Step 1: Create the n8n workflow**

Name: `Fetch Weekly Meals`
Structure: Webhook (GET, path: `fetch_weekly_meals`, responseMode: `responseNode`) → MySQL → Respond to Webhook

**CRITICAL:** Add a `webhookId` property (any UUID, e.g. `c1d2e3f4-a5b6-7890-cdef-1234567890ab`) to the Webhook node.

MySQL query:
```sql
SELECT
  ws.selection_id,
  ws.WeekDateRange,
  ws.recipe_id,
  ws.notes,
  ws.created_at,
  rs.recipe_name,
  rs.recipe_description,
  rs.prep_time_minutes,
  rs.cook_time_minutes,
  rs.total_time_minutes,
  rs.servings,
  rs.difficulty_level,
  rs.tags
FROM weekly_selections ws
LEFT JOIN recipe_summary rs ON ws.recipe_id = rs.recipe_id
WHERE ws.WeekDateRange = '{{ $json.query.weekDateRange }}'
ORDER BY ws.created_at ASC
```

Respond to Webhook: return the MySQL results array with CORS headers `Access-Control-Allow-Origin: *`.

**Step 2: Test the endpoint**

```
GET https://n8n-grocery.needexcelexpert.com/webhook/fetch_weekly_meals?weekDateRange=For+the+week+of+March+8th+to+March+14th%2C+2026
```

Expected: Array of meal objects with `recipe_name`, `recipe_description`, `prep_time_minutes`, etc.

**Step 3: Activate the workflow**

Deactivate then reactivate to register the webhookId.

---

## Task 3: Create n8n Webhook — `POST /add_weekly_selection`

**Files:**
- n8n workflow (new)

**Step 1: Create the n8n workflow**

Name: `Add Weekly Selection`
Structure: Webhook (POST, path: `add_weekly_selection`, responseMode: `responseNode`) → MySQL INSERT → MySQL SELECT (return updated list) → Respond to Webhook

**CRITICAL:** Add `webhookId` (e.g. `d2e3f4a5-b6c7-8901-defg-234567890abc`).

MySQL INSERT:
```sql
INSERT INTO weekly_selections (WeekDateRange, recipe_id, notes)
VALUES ('{{ $json.body.weekDateRange }}', {{ $json.body.recipeId }}, '{{ $json.body.notes || "" }}')
```

MySQL SELECT (return updated list — same query as Task 2):
```sql
SELECT
  ws.selection_id,
  ws.WeekDateRange,
  ws.recipe_id,
  ws.notes,
  ws.created_at,
  rs.recipe_name,
  rs.recipe_description,
  rs.prep_time_minutes,
  rs.cook_time_minutes,
  rs.total_time_minutes,
  rs.servings,
  rs.difficulty_level,
  rs.tags
FROM weekly_selections ws
LEFT JOIN recipe_summary rs ON ws.recipe_id = rs.recipe_id
WHERE ws.WeekDateRange = '{{ $json.body.weekDateRange }}'
ORDER BY ws.created_at ASC
```

Respond to Webhook: return the SELECT results array with CORS `*`.

**Step 2: Test**

```
POST /add_weekly_selection
Body: { "weekDateRange": "For the week of March 8th to March 14th, 2026", "recipeId": 45, "notes": "" }
```

Expected: Returns full updated meals array.

---

## Task 4: Create n8n Webhook — `POST /remove_weekly_selection`

**Files:**
- n8n workflow (new)

**Step 1: Create the n8n workflow**

Name: `Remove Weekly Selection`
Structure: Webhook (POST, path: `remove_weekly_selection`, responseMode: `responseNode`) → MySQL DELETE → MySQL SELECT (return updated list) → Respond to Webhook

**CRITICAL:** Add `webhookId` (e.g. `e3f4a5b6-c7d8-9012-efgh-34567890abcd`).

MySQL DELETE:
```sql
DELETE FROM weekly_selections
WHERE recipe_id = {{ $json.body.recipeId }}
  AND WeekDateRange = '{{ $json.body.weekDateRange }}'
LIMIT 1
```

MySQL SELECT: Same query as Task 2/3 (return remaining meals for the week).

Set `alwaysOutputData: true` on both MySQL nodes (handles 0-row results).

Respond to Webhook: return the SELECT results (may be empty array) with CORS `*`.

**Step 2: Test**

```
POST /remove_weekly_selection
Body: { "weekDateRange": "For the week of March 8th to March 14th, 2026", "recipeId": 45 }
```

Expected: Returns updated meals array (without the removed meal).

---

## Task 5: Create n8n Webhooks — Shopping Progress (3 endpoints)

**Files:**
- n8n workflow (new, single workflow with 3 webhook paths)

**Step 1: Create `GET /shopping_progress` workflow**

Name: `Shopping Progress`
Structure: Webhook (GET, path: `shopping_progress`, responseMode: `responseNode`) → MySQL SELECT → Respond to Webhook

**CRITICAL:** Add `webhookId` (e.g. `f4a5b6c7-d8e9-0123-fghi-4567890abcde`).

MySQL:
```sql
SELECT item_id, checked_at
FROM shopping_progress
WHERE week_start_date = '{{ $json.query.week_start_date }}'
```

**Step 2: Create `POST /shopping_progress_check` workflow**

Name: `Shopping Progress Check`
Structure: Webhook (POST, path: `shopping_progress_check`, responseMode: `responseNode`) → MySQL INSERT → Respond to Webhook

**CRITICAL:** Add `webhookId`.

MySQL:
```sql
INSERT IGNORE INTO shopping_progress (week_start_date, item_id)
VALUES ('{{ $json.body.week_start_date }}', {{ $json.body.item_id }})
```

Respond with `{ "success": true }`.

**Step 3: Create `POST /shopping_progress_uncheck` workflow**

Name: `Shopping Progress Uncheck`
Structure: Webhook (POST, path: `shopping_progress_uncheck`, responseMode: `responseNode`) → MySQL DELETE → Respond to Webhook

**CRITICAL:** Add `webhookId`.

MySQL:
```sql
DELETE FROM shopping_progress
WHERE week_start_date = '{{ $json.body.week_start_date }}'
  AND item_id = {{ $json.body.item_id }}
```

Respond with `{ "success": true }`.

**Step 4: Activate all three workflows**

Deactivate then reactivate each.

---

## Task 6: Add New Endpoints to `api.js`

**Files:**
- Modify: `src/config/api.js:17-86`

**Step 1: Add the new endpoint URLs**

Add these lines to the ENDPOINTS object in `src/config/api.js`, after the existing `chooseRecipeInstructions` line (line 35):

```javascript
  // Weekly meal selections (DB-backed)
  fetchWeeklyMeals: `${API_BASE_URL}/fetch_weekly_meals`,
  addWeeklySelection: `${API_BASE_URL}/add_weekly_selection`,
  removeWeeklySelection: `${API_BASE_URL}/remove_weekly_selection`,

  // Shopping progress (DB-backed)
  shoppingProgress: `${API_BASE_URL}/shopping_progress`,
  shoppingProgressCheck: `${API_BASE_URL}/shopping_progress_check`,
  shoppingProgressUncheck: `${API_BASE_URL}/shopping_progress_uncheck`,
```

**Step 2: Verify no import changes needed**

The `ENDPOINTS` object is already exported. No other changes needed.

**Step 3: Commit**

```bash
git add src/config/api.js
git commit -m "feat: add DB-backed endpoints for weekly meals and shopping progress"
```

---

## Task 7: Add `normalizeDbMeals` Utility

**Files:**
- Modify: `src/config/api.js` (add utility function at bottom, before final export)

**Step 1: Add the normalizer function**

Add after the `showApiError` function (after line 183), before the final export:

```javascript
/**
 * Normalize DB meal response to match the component prop interface.
 * DB returns: { selection_id, recipe_id, recipe_name, recipe_description, ... }
 * Components expect: { id, name, recipeId, description, ... }
 */
export function normalizeDbMeals(dbRows) {
  if (!Array.isArray(dbRows)) return [];
  return dbRows.map(row => ({
    id: row.selection_id,
    name: row.recipe_name,
    recipeId: String(row.recipe_id),
    description: row.recipe_description || row.notes || '',
    prepTime: row.prep_time_minutes,
    cookTime: row.cook_time_minutes,
    totalTime: row.total_time_minutes,
    servings: row.servings,
    difficulty: row.difficulty_level,
    tags: row.tags,
    ingredients: [],
  }));
}
```

**Step 2: Commit**

```bash
git add src/config/api.js
git commit -m "feat: add normalizeDbMeals utility for DB response mapping"
```

---

## Task 8: Update App.js — DB-First selectedMeals

**Files:**
- Modify: `src/components/App.js:1-89` (imports, state init, useEffect)

**Step 1: Add imports**

At the top of App.js (line 1), add `normalizeDbMeals` to the import from api.js. Find the existing import (there may not be one from api.js in App.js — check). If no existing import, add:

```javascript
import { ENDPOINTS, apiFetch, normalizeDbMeals } from "../config/api";
```

**Step 2: Replace selectedMeals useState initializer (lines 62-70)**

Replace the current localStorage-based initializer with a stale-while-revalidate pattern:

```javascript
  // Initialize from localStorage cache (stale-while-revalidate)
  const [selectedMeals, setSelectedMeals] = useState(() => {
    try {
      const weekKey = `selectedMeals_${getWeekDates().startDate}`;
      const stored = localStorage.getItem(weekKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [mealsLoading, setMealsLoading] = useState(true);
```

Note: Keep the localStorage init for instant display. We'll add a DB fetch useEffect next.

**Step 3: Replace the localStorage persistence useEffect (lines 79-89)**

Replace with a DB-fetch-on-mount + cache-write pattern:

```javascript
  // Fetch selectedMeals from DB on mount (stale-while-revalidate)
  useEffect(() => {
    const fetchMeals = async () => {
      try {
        const weekData = getWeekDates();
        const url = new URL(ENDPOINTS.fetchWeeklyMeals);
        url.searchParams.append("weekDateRange", weekData.displayRange);
        const response = await apiFetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          const data = await response.json();
          const normalized = normalizeDbMeals(data);
          setSelectedMeals(normalized);
          // Update localStorage cache
          const weekKey = `selectedMeals_${weekData.startDate}`;
          if (normalized.length > 0) {
            localStorage.setItem(weekKey, JSON.stringify(normalized));
          } else {
            localStorage.removeItem(weekKey);
          }
        }
      } catch {
        // Keep stale localStorage data on network failure
      } finally {
        setMealsLoading(false);
      }
    };
    fetchMeals();
  }, []);
```

**Step 4: Add a `refreshMeals` callback for children to call after mutations**

Add after the useEffect above:

```javascript
  // Callback for children to refresh meals from DB after mutations
  const refreshMeals = useCallback(async () => {
    try {
      const weekData = getWeekDates();
      const url = new URL(ENDPOINTS.fetchWeeklyMeals);
      url.searchParams.append("weekDateRange", weekData.displayRange);
      const response = await apiFetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const data = await response.json();
        const normalized = normalizeDbMeals(data);
        setSelectedMeals(normalized);
        const weekKey = `selectedMeals_${weekData.startDate}`;
        if (normalized.length > 0) {
          localStorage.setItem(weekKey, JSON.stringify(normalized));
        } else {
          localStorage.removeItem(weekKey);
        }
      }
    } catch { /* silent — stale data is better than no data */ }
  }, []);
```

**Step 5: Pass `refreshMeals` as prop to components that mutate meals**

In the renderScreen function, add `refreshMeals` prop to:
- `Plan` component (case "plan", line ~166): add `refreshMeals={refreshMeals}`
- `ChatBot` component (case "chatbot", line ~181): add `refreshMeals={refreshMeals}`
- `MealCreator` component (case "meal-creator", line ~193): add `refreshMeals={refreshMeals}`

**Step 6: Verify build**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && npm run build
```

Expected: Build succeeds (components don't use refreshMeals yet, so unused prop is fine).

**Step 7: Commit**

```bash
git add src/components/App.js
git commit -m "feat: fetch selectedMeals from DB on mount with stale-while-revalidate cache"
```

---

## Task 9: Update ChatBot.js — DB-First Mutations + Deterministic Session ID

**Files:**
- Modify: `src/components/ChatBot.js`

**Step 1: Update the `getSessionId` function (lines 7-17)**

Replace with deterministic ID + legacy fallback:

```javascript
const getSessionId = () => {
  const weekStart = getWeekDates().startDate;
  const storageKey = `chatSessionId_${weekStart}`;
  // Legacy fallback: if existing random session ID for this week, keep using it
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  // New deterministic format — same on any device
  const sessionId = `chat_${weekStart}`;
  return sessionId;
};
```

**Step 2: Add `refreshMeals` to the destructured props (line 22)**

Find the component signature:
```javascript
const ChatBot = ({ onBack, onNavigate, selectedMeals: parentSelectedMeals, setSelectedMeals: setParentSelectedMeals, groceryListData, setGroceryListData, debugMode = false }) => {
```

Add `refreshMeals` to it:
```javascript
const ChatBot = ({ onBack, onNavigate, selectedMeals: parentSelectedMeals, setSelectedMeals: setParentSelectedMeals, refreshMeals, groceryListData, setGroceryListData, debugMode = false }) => {
```

**Step 3: Add import for ENDPOINTS and apiFetch**

Check if ChatBot.js already imports from api.js. If not, add:
```javascript
import { ENDPOINTS, apiFetch } from "../config/api";
```

**Step 4: Update `addMealToList` (lines 241-256) to persist to DB first**

Replace the function body:

```javascript
  const addMealToList = async (mealName, mealDescription, recipeId = null, totalTime = null) => {
    if (!recipeId) {
      addDebugLog('⚠️ Cannot add meal without recipeId');
      return;
    }
    try {
      const weekData = getWeekDates();
      const response = await apiFetch(ENDPOINTS.addWeeklySelection, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekDateRange: weekData.displayRange,
          recipeId: Number(recipeId),
          notes: '',
        }),
      });
      if (response.ok) {
        if (refreshMeals) await refreshMeals();
        toast.success(`Added "${mealName}" to this week!`);
        addDebugLog('Added meal to DB and refreshed:', mealName);
      } else {
        toast.error(`Failed to add "${mealName}".`);
      }
    } catch (error) {
      toast.error(`Failed to add "${mealName}". Check connection.`);
      addDebugLog('Error adding meal:', error.message);
    }
  };
```

**Step 5: Update `removeMeal` (lines 261-313) to use new endpoint**

The existing `removeMeal` already calls a webhook. Replace the `setSelectedMeals` calls with `refreshMeals`:

Find line 303:
```javascript
        setSelectedMeals(prev => prev.filter(m => m.id !== mealId));
```

Replace with:
```javascript
        if (refreshMeals) await refreshMeals();
```

Also add a call to the new `removeWeeklySelection` endpoint. In the payload section, ADD a call to the dedicated endpoint alongside the existing agent call:

After the existing webhook succeeds (inside the `if (response.ok)` block at ~line 301), add:
```javascript
        // Also remove from weekly_selections via dedicated endpoint
        await apiFetch(ENDPOINTS.removeWeeklySelection, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekDateRange: weekData.displayRange,
            recipeId: Number(mealToRemove.recipeId),
          }),
        });
        if (refreshMeals) await refreshMeals();
```

**Step 6: Verify build**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && npm run build
```

**Step 7: Commit**

```bash
git add src/components/ChatBot.js
git commit -m "feat: ChatBot uses DB-first meal mutations and deterministic session ID"
```

---

## Task 10: Update Plan.js — Pass Through `refreshMeals` Prop

**Files:**
- Modify: `src/components/Plan.js`

**Step 1: Add `refreshMeals` to destructured props (line ~27)**

Find the Plan component signature and add `refreshMeals`:
```javascript
  refreshMeals,
```

**Step 2: Pass `refreshMeals` to ChatBot and MealCreator children**

Find where Plan renders ChatBot (around line 132) and add the prop:
```javascript
  refreshMeals={refreshMeals}
```

Find where Plan renders MealCreator (around line 144) and add:
```javascript
  refreshMeals={refreshMeals}
```

**Step 3: Commit**

```bash
git add src/components/Plan.js
git commit -m "feat: Plan passes refreshMeals prop to ChatBot and MealCreator"
```

---

## Task 11: Update MealCreator.js — DB-First + Deterministic Session ID

**Files:**
- Modify: `src/components/MealCreator.js`

**Step 1: Update `getCreatorSessionId` function (lines 7-17)**

Replace with deterministic + legacy fallback:

```javascript
const getCreatorSessionId = () => {
  const weekStart = getWeekDates().startDate;
  const storageKey = `creatorSessionId_${weekStart}`;
  // Legacy fallback: keep existing random ID for current week
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  // New deterministic format
  const sessionId = `creator_${weekStart}`;
  return sessionId;
};
```

**Step 2: Add `refreshMeals` to destructured props (line 26)**

```javascript
const MealCreator = ({ onBack, onNavigate, selectedMeals, setSelectedMeals, refreshMeals, debugMode = false }) => {
```

**Step 3: Update `addToThisWeek` — replace `setSelectedMeals` with `refreshMeals` (line ~436)**

Find line 436:
```javascript
        setSelectedMeals(prev => [...prev, newMeal]);
```

Replace with:
```javascript
        if (refreshMeals) await refreshMeals();
```

The MealCreator's `addToThisWeek` already calls a webhook that saves to `weekly_selections`. So the DB write is already happening — we just need to refresh from DB instead of optimistically updating local state.

**Step 4: Fix legacy `startOver` session ID (line 540)**

Find the `startOver` function (line ~533). Replace line 540:
```javascript
    localStorage.setItem('creatorSessionId', newSessionId);
```

With:
```javascript
    const weekStart = getWeekDates().startDate;
    localStorage.setItem(`creatorSessionId_${weekStart}`, newSessionId);
```

**Step 5: Commit**

```bash
git add src/components/MealCreator.js
git commit -m "feat: MealCreator uses refreshMeals and deterministic session ID"
```

---

## Task 12: Update InStoreMode.js — DB-Backed Shopping Progress

**Files:**
- Modify: `src/components/InStoreMode.js`

**Step 1: Add imports**

Add at top of file (if not already present):
```javascript
import { ENDPOINTS, apiFetch } from "../config/api";
import { getWeekDates } from "../utils/weekDates";
```

**Step 2: Replace the checked items load useEffect (lines 236-248)**

Replace the localStorage-based load with a DB-first + localStorage fallback:

```javascript
  // Load checked items from DB, fall back to localStorage
  useEffect(() => {
    if (!shoppingList) return;

    const loadCheckedItems = async () => {
      try {
        const weekData = getWeekDates();
        const url = new URL(ENDPOINTS.shoppingProgress);
        url.searchParams.append("week_start_date", weekData.startDate);
        const response = await apiFetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          const data = await response.json();
          const checkedIds = Array.isArray(data) ? data.map(row => row.item_id) : [];
          setCheckedItems(new Set(checkedIds));
          return;
        }
      } catch {
        // Fall through to localStorage fallback
      }

      // Offline fallback: try localStorage
      try {
        const stored = localStorage.getItem("inStoreCheckedItems");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.savedAt === shoppingList.savedAt) {
            setCheckedItems(new Set(parsed.checkedIds));
          } else {
            localStorage.removeItem("inStoreCheckedItems");
          }
        }
      } catch {
        localStorage.removeItem("inStoreCheckedItems");
      }
    };

    loadCheckedItems();
  }, [shoppingList]);
```

**Step 3: Update `handleToggleItem` (lines 316-341)**

Replace with DB-first + localStorage cache:

```javascript
  const handleToggleItem = useCallback(
    (itemId) => {
      setCheckedItems((prev) => {
        const next = new Set(prev);
        const isChecking = !next.has(itemId);

        if (isChecking) {
          next.add(itemId);
        } else {
          next.delete(itemId);
        }

        // Persist to DB (fire-and-forget, don't block UI)
        const weekData = getWeekDates();
        const endpoint = isChecking
          ? ENDPOINTS.shoppingProgressCheck
          : ENDPOINTS.shoppingProgressUncheck;
        apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            week_start_date: weekData.startDate,
            item_id: itemId,
          }),
        }).catch(() => {
          // Silently fail — localStorage is backup
        });

        // Also cache to localStorage (offline backup)
        if (shoppingList) {
          localStorage.setItem(
            "inStoreCheckedItems",
            JSON.stringify({
              savedAt: shoppingList.savedAt,
              checkedIds: Array.from(next),
            })
          );
        }

        return next;
      });
    },
    [shoppingList]
  );
```

**Step 4: Verify build**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && npm run build
```

**Step 5: Commit**

```bash
git add src/components/InStoreMode.js
git commit -m "feat: InStoreMode uses DB-backed shopping progress with localStorage fallback"
```

---

## Task 13: Clean Up Dead Code

**Files:**
- Modify: `src/components/RecipeIngredients.js:56-61`

**Step 1: Remove dead localStorage cleanup**

Find and remove these lines (around lines 56-61):
```javascript
  // Clear any cached data on component mount
  useEffect(() => {
    // Remove any cached webhook responses to ensure fresh data
    localStorage.removeItem('n8n_recipe_ingredients');
    localStorage.removeItem('n8n_recipe_ingredients_raw');
    addDebugLog('🧹 Cleared cached webhook data to ensure fresh responses');
  }, []);
```

**Step 2: Commit**

```bash
git add src/components/RecipeIngredients.js
git commit -m "chore: remove dead localStorage cleanup for n8n_recipe_ingredients"
```

---

## Task 14: End-to-End Testing

**Step 1: Start dev server**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && npm start
```

**Step 2: Test selectedMeals flow**

1. Open app → Home should show correct meal count (fetched from DB)
2. Navigate to Plan → Meals tab → ChatBot
3. Add a meal via ChatBot → verify it appears in the meal panel
4. Refresh the page → verify meal persists (loaded from DB, not just localStorage)
5. Open in incognito/another browser → verify same meals appear (multi-device sync)
6. Remove a meal → verify it disappears and stays gone after refresh

**Step 3: Test shopping progress flow**

1. Navigate to Plan → select items → Start Shopping
2. In Shop mode, check off a few items
3. Refresh the page → verify checked items persist
4. Open in incognito → verify same checked items (multi-device sync)
5. Uncheck an item → refresh → verify it's unchecked

**Step 4: Test session ID migration**

1. If you have an existing chat session for this week, verify it still loads (legacy fallback)
2. Clear localStorage chatSessionId key → reload → verify deterministic ID works
3. Chat should start fresh (new deterministic session has no history)

**Step 5: Test offline fallback**

1. Start shopping, check some items
2. Disable network (DevTools → Offline)
3. Check/uncheck items → should still work (localStorage fallback)
4. Re-enable network → items should persist on next load

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete localStorage to DB migration for multi-device sync"
```

---

## Summary of All Changes

| File | Type | Description |
|------|------|-------------|
| `shopping_progress` table | NEW | Stores checked items per shopping session |
| n8n `Fetch Weekly Meals` | NEW | GET endpoint, weekly_selections JOIN recipe_summary |
| n8n `Add Weekly Selection` | NEW | POST, inserts meal to weekly_selections, returns list |
| n8n `Remove Weekly Selection` | NEW | POST, deletes from weekly_selections, returns list |
| n8n `Shopping Progress` | NEW | GET, returns checked items for week |
| n8n `Shopping Progress Check` | NEW | POST, marks item checked |
| n8n `Shopping Progress Uncheck` | NEW | POST, unmarks item |
| `src/config/api.js` | MODIFY | Add 6 new endpoint URLs + normalizeDbMeals utility |
| `src/components/App.js` | MODIFY | DB-first fetch on mount, refreshMeals callback, stale-while-revalidate |
| `src/components/ChatBot.js` | MODIFY | DB-first mutations, deterministic session ID |
| `src/components/Plan.js` | MODIFY | Pass through refreshMeals prop |
| `src/components/MealCreator.js` | MODIFY | refreshMeals after save, deterministic session ID, fix legacy startOver |
| `src/components/InStoreMode.js` | MODIFY | DB-backed shopping progress with localStorage fallback |
| `src/components/RecipeIngredients.js` | MODIFY | Remove dead localStorage cleanup |
