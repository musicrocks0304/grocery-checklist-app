# LocalStorage → Database Migration Design

**Date:** 2026-03-08
**Goal:** Multi-device sync — DB as single source of truth, localStorage as stale-while-revalidate cache only.
**Approach:** DB-First with localStorage Cache (Approach A)

---

## 1. LocalStorage Audit Summary

### 13 Keys Found Across 8 Files

| # | Key | Category | Action |
|---|-----|----------|--------|
| 1 | `selectedMeals_${weekStart}` | DATA — dual-write problem | **MIGRATE** to DB-primary |
| 2 | `inStoreCheckedItems` | DATA — no DB backing | **MIGRATE** to new DB table |
| 3 | `chatSessionId_${weekStart}` | SESSION — random UUID | **MAKE DETERMINISTIC** |
| 4 | `creatorSessionId_${weekStart}` | SESSION — random UUID | **MAKE DETERMINISTIC** |
| 5 | `inStoreShoppingList` | CACHE — already DB-backed | **KEEP** as cache (no change) |
| 6 | `theme` | UI preference | **KEEP** in localStorage |
| 7 | `planTabState` | UI preference | **KEEP** in localStorage |
| 8 | `recipeKitchenMode` | UI preference | **KEEP** in localStorage |
| 9 | `recipeSwipeHintShown` | UI hint flag | **KEEP** in localStorage |
| 10 | `recipeInstructionState` | Temp step progress | **KEEP** in localStorage |
| 11 | `n8n_recipe_ingredients` | DEAD CODE | **REMOVE** |
| 12 | `n8n_recipe_ingredients_raw` | DEAD CODE | **REMOVE** |

---

## 2. Database Changes

### Existing Tables (no schema changes)

**`weekly_selections`** — Already stores meal selections per week.
```
selection_id (PK AUTO_INCREMENT)
WeekDateRange VARCHAR(255)     -- 'For the week of March 8th to March 14th, 2026'
recipe_id INT                  -- FK to recipe_summary.recipe_id
notes TEXT
created_at TIMESTAMP
```

**`recipe_summary`** — Rich meal data (name, description, times, servings, difficulty, tags).

**`WeeklyGroceryList`** — Grocery items with IsSelected, Quantity, WeekDateRange, DataSource.

### New Table: `shopping_progress`

Tracks which items a user has checked off during in-store shopping.

```sql
CREATE TABLE shopping_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  week_start_date VARCHAR(20) NOT NULL,       -- '2026-03-08'
  item_id INT NOT NULL,                        -- WeeklyGroceryList item ID
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_week_item (week_start_date, item_id)
);
```

**Design rationale:**
- Row-per-checked-item: queryable, easy to add/remove individual items via INSERT/DELETE
- `week_start_date` scopes to grocery week (matches existing week-keying pattern)
- UNIQUE constraint prevents duplicate checks
- Uncheck = DELETE row. Get progress = SELECT all rows for week.

### Tables NOT Needed

- No `user_preferences` table — theme/planTab/kitchenMode are UI preferences, fine in localStorage
- No `user_sessions` table — session IDs become deterministic (computed, not stored)

---

## 3. Data Flow Changes

### 3.1 selectedMeals — localStorage-primary → DB-primary

**Current flow (BROKEN for multi-device):**
```
App mount → localStorage.getItem('selectedMeals_${week}') → React state → props
Mutation → setSelectedMeals() → useEffect writes localStorage
MealCreator also writes to DB (dual-write)
ChatBot does NOT always write to DB (inconsistent)
```

**New flow:**
```
App mount → show cached localStorage instantly (stale-while-revalidate)
         → GET /choose_recipe_instructions (existing endpoint)
         → update React state + localStorage cache
         → props to children (unchanged interface)

Add meal    → POST /add_weekly_selection → DB insert → return updated list → setState
Remove meal → POST /remove_weekly_selection → DB delete → return updated list → setState
```

**Key principle:** Mutations go through DB first. Local state refreshes from DB response. This guarantees DB and UI stay in sync.

**selectedMeals object shape reconciliation:**

Current localStorage shape:
```json
{ "id": 1741419600000, "name": "Turkey Tacos", "recipeId": "61", "ingredients": [] }
```

DB JOIN shape (from chooseRecipeInstructions):
```json
{
  "selection_id": 70, "recipe_id": 61, "recipe_name": "Classic Turkey Taco Night...",
  "recipe_description": "...", "prep_time_minutes": 10, "cook_time_minutes": 15,
  "servings": 4, "difficulty_level": "easy", "tags": "..."
}
```

**Mapping:** Components use `meal.name` and `meal.recipeId`. The DB response provides `recipe_name` and `recipe_id`. A thin mapping layer in App.js normalizes the DB response to match the existing prop interface:
```js
const normalizedMeals = dbResponse.map(row => ({
  id: row.selection_id,
  name: row.recipe_name,
  recipeId: String(row.recipe_id),
  // bonus fields from DB:
  description: row.recipe_description,
  prepTime: row.prep_time_minutes,
  cookTime: row.cook_time_minutes,
  servings: row.servings,
  difficulty: row.difficulty_level,
  tags: row.tags
}));
```

### 3.2 Session IDs — Random → Deterministic

**Current:** `session_2026-03-08_a1b2c3d4e` (random, stored in localStorage)
**New:** `chat_2026-03-08` and `creator_2026-03-08` (deterministic, computed)

**Migration strategy:**
- On component mount, check localStorage for existing session ID for current week
- If found → use it (backward compatible, preserves active conversation)
- If not found → use deterministic format
- New weeks always use deterministic format
- Old week histories naturally expire (already inaccessible due to week-keying)

### 3.3 inStoreCheckedItems — localStorage → DB

**Current:** Read/write `inStoreCheckedItems` in localStorage only.

**New n8n endpoints:**
- `POST /shopping_progress/check` — body: `{ week_start_date, item_id }` → INSERT row
- `POST /shopping_progress/uncheck` — body: `{ week_start_date, item_id }` → DELETE row
- `GET /shopping_progress?week_start_date=2026-03-08` → return all checked item_ids for week

**InStoreMode mount sequence:**
1. Fetch checked items from `GET /shopping_progress?week_start_date=...`
2. Fall back to localStorage if fetch fails (offline resilience)
3. On toggle: write to DB, update local state, cache to localStorage

### 3.4 inStoreShoppingList — No change

Already has 3-tier resolution: prop → localStorage → API fetch. This is a good pattern. Keep as-is.

---

## 4. New n8n Webhooks Required

| Endpoint | Method | Purpose | DB Operation |
|----------|--------|---------|-------------|
| `/add_weekly_selection` | POST | Add meal to week | INSERT into weekly_selections |
| `/remove_weekly_selection` | POST | Remove meal from week | DELETE from weekly_selections |
| `/shopping_progress_check` | POST | Mark item checked | INSERT into shopping_progress |
| `/shopping_progress_uncheck` | POST | Unmark item | DELETE from shopping_progress |
| `/shopping_progress` | GET | Get checked items | SELECT from shopping_progress |

All follow the existing pattern: Webhook (responseMode: responseNode) → MySQL → Respond to Webhook (with CORS `*`).

---

## 5. Component Changes

| Component | Change | Risk Level |
|-----------|--------|------------|
| **App.js** | Fetch selectedMeals from DB on mount (stale-while-revalidate). Add loading state. Normalize DB response to match existing prop shape. Remove localStorage useEffect for selectedMeals. | LOW |
| **ChatBot.js** | Add meal: call `/add_weekly_selection` first, update state from response. Remove meal: call `/remove_weekly_selection`. Session ID: deterministic with legacy fallback. | MEDIUM |
| **MealCreator.js** | Already saves to DB via `/meal_creator_save`. Ensure setSelectedMeals updates from DB response. Session ID: deterministic with legacy fallback. | LOW |
| **InStoreMode.js** | Replace `inStoreCheckedItems` localStorage with shopping_progress API. Keep localStorage as offline fallback. | MEDIUM |
| **Home.js** | No change — already fetches from DB endpoint. | NONE |
| **RecipeInstructions.js** | No change — already has DB fallback. | NONE |
| **Plan.js** | No change — planTabState stays in localStorage. | NONE |
| **RecipeIngredients.js** | Remove dead `n8n_recipe_ingredients` localStorage cleanup code. | NONE |

---

## 6. Downstream Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Network latency on App mount** | Brief loading state before meals appear | Stale-while-revalidate: show localStorage cache instantly, update when DB responds |
| **ChatBot mutation latency** | Add/remove meal feels slower (DB round-trip) | Toast "Saving..." feedback. DB round-trip is ~200ms via n8n. |
| **Offline shopping** | Can't check/uncheck items without network | Keep localStorage as offline fallback for InStoreMode. Sync on reconnect. |
| **selectedMeals shape change** | Components expect `meal.name`, DB returns `recipe_name` | Normalization layer in App.js maps DB shape to existing interface |
| **Session ID migration** | Lose current-week chat history if session ID changes | Check localStorage first, keep existing ID if found for current week |
| **ChatBot ingredient tracking** | ChatBot stores `ingredients[]` on meal objects in localStorage; DB doesn't have this | Ingredients are fetched on-demand from DB via `/get_recipe_items`. Not needed on the meal object. |
| **RecipeIngredients.js** | Sends `selectedMeals` JSON to n8n for ingredient extraction | Still works — meal objects will have `name` and `recipeId`, which is all the webhook needs |

---

## 7. Migration Sequence

1. Create `shopping_progress` table (n8n migration workflow)
2. Create 5 new n8n webhook workflows
3. Update App.js (DB-first fetch, normalization layer, remove localStorage write)
4. Update ChatBot.js (DB-first mutations, deterministic session ID)
5. Update MealCreator.js (ensure DB response drives state, deterministic session ID)
6. Update InStoreMode.js (shopping_progress API)
7. Clean up dead code (RecipeIngredients.js localStorage removals)
8. Test end-to-end on localhost
9. Deploy and verify on Netlify
