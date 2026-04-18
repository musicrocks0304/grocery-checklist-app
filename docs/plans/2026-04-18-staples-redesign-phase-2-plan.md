# Grocery Staples Redesign — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add meal-lens pills and a grouped "From your meals" card to the Staples screen, fully matching the prototype in `design_handoff_staples/source/staples-v5-best-of.jsx`. Tapping a meal pill lenses the visible list down to just that meal's ingredients. The "From your meals" card groups meal-ingredient items by meal name with subheaders.

**Architecture:** Zero-migration approach. A new read-only endpoint `/fetch_weekly_meal_ingredients` returns `[{mealName, ingredientNames: [...]}]` for the current week by JOINing `weekly_selections → recipe_summary → recipe_ingredients → ingredients`. The frontend correlates `ingredientNames` against the items returned by `fetch_grocery_items` (by lowercased+trimmed name) to build the in-memory `meals: [{name, itemIds}]` shape the prototype expects. No changes to the existing `meal_ingredients` insert workflow, no `WeeklyGroceryList` column additions. New component pair (`MealPillBar`, `MealsCard`) rendered by `StaplesScreen` with a `mealFocus: null | string` state.

**Tech Stack:** Same as Phase 1 — React 19 + CRA + Tailwind 3.4 JIT + CSS-var tokens + `lucide-react` + jest + `@testing-library/react` + n8n + MySQL.

---

## Open decisions (locked for this plan)

Resolved during Phase 1 wrap-up — not reopening here:

- **Meal origin resolution** — derive via JOIN endpoint at display time. No `MealName` column added. Unmatched ingredients silently drop. (Phase 1 audit Q1 alternative B.)
- **Correlation key** — `LOWER(TRIM(name))` in frontend matching. Matches the existing workflow normalization.
- **Staples-that-are-also-meal-ingredients** — keep existing behavior. The fetch workflow prefers `DataSource='Staples'` when both sources have the item; such items won't appear in MealsCard even if they're named in a meal's ingredient list. Acceptable for Phase 2; Phase 3 can revisit if it bites.
- **Meal pill visibility in empty weeks** — hide the pill bar entirely (not even "All items"). Nothing to filter.
- **MealsCard collapsibility** — keep it (chevron, expanded by default).
- **Review CTA** — unchanged from Phase 1 (navigates to `#shop`).

---

## File Structure

**Create**
- `src/components/staples/MealPillBar.js`
- `src/components/staples/MealPillBar.test.js`
- `src/components/staples/MealsCard.js`
- `src/components/staples/MealsCard.test.js`
- `src/hooks/useWeekMeals.js` — fetches meal-ingredient data, returns `{mealsWithIngredients, loading, error}`
- `src/hooks/useWeekMeals.test.js`

**Modify**
- `src/config/api.js` — add `fetchWeeklyMealIngredients` endpoint
- `src/index.css` — add `--color-meal` / `--color-meal-light` CSS vars (light + dark themes)
- `tailwind.config.js` — map new vars to `meal` / `meal-light` semantic classes
- `src/components/StaplesScreen.js` — add `mealFocus` state, `useWeekMeals` call, derived `mealsWithItemIds`, render `MealPillBar` + `MealsCard`, lens filter logic
- `src/components/StaplesScreen.test.js` — add tests for meal-filter behavior

---

## Task 1: Backend — `Fetch Weekly Meal Ingredients` n8n workflow

Read-only endpoint that joins `weekly_selections` → `recipe_summary` → `recipe_ingredients` → `ingredients` to return meals + their ingredient names for a given week.

Request: `GET /fetch_weekly_meal_ingredients?weekDateRange=...`
Response: `[{mealName: "Chicken tacos", ingredientNames: ["Chicken thighs", "Cilantro", ...]}, ...]`

SQL (tested shape):
```sql
SELECT rs.recipe_name AS mealName, i.ingredient_name AS ingredientName
FROM weekly_selections ws
JOIN recipe_summary rs   ON ws.recipe_id = rs.recipe_id
JOIN recipe_ingredients ri ON ws.recipe_id = ri.recipe_id
JOIN ingredients i       ON ri.ingredient_id = i.ingredient_id
WHERE ws.WeekDateRange = '{{ $json.query.weekDateRange }}'
  AND (ri.optional IS NULL OR ri.optional = 0)
ORDER BY rs.recipe_name, ri.ingredient_order
```

Aggregation into the response shape is done in an n8n Code node (runOnceForAllItems):
```js
// Input: flat rows from MySQL, one per (meal, ingredient)
const rows = $input.all().map(i => i.json);
const byMeal = {};
for (const r of rows) {
  if (!byMeal[r.mealName]) byMeal[r.mealName] = [];
  byMeal[r.mealName].push(r.ingredientName);
}
const result = Object.entries(byMeal).map(([mealName, ingredientNames]) => ({
  mealName,
  ingredientNames,
}));
return [{ json: { meals: result } }];
```

Pattern to mirror: the `Fetch Weekly Meals` workflow (ID `Fr7GvlXtcWmx2WlL`) — same webhook + MySQL + Code (aggregation) + Respond to Webhook pattern. Responds to both GET query params and POST body (the `$json.query.weekDateRange` expression already handles GET).

**Files:**
- No repo files for this task. n8n workflow creation only.

- [ ] **Step 1: Load the n8n MCP tools** via ToolSearch:
```
query: "select:mcp__n8n-mcp__n8n_create_workflow,mcp__n8n-mcp__n8n_get_workflow,mcp__mysql__mysql_query"
```

- [ ] **Step 2: Fetch the `Fetch Weekly Meals` template** (workflow ID `Fr7GvlXtcWmx2WlL`) via `mcp__n8n-mcp__n8n_get_workflow` to study the exact node shapes (webhook type, MySQL node version, Aggregate / Code node pattern, Respond to Webhook with CORS, `alwaysOutputData`, webhook `allowedOrigins: '*'`). Mirror these shapes.

- [ ] **Step 3: Create `Fetch Weekly Meal Ingredients` workflow** via `mcp__n8n-mcp__n8n_create_workflow`:

Node layout:
1. **Webhook** — path `fetch_weekly_meal_ingredients`, method `GET`, `responseMode: 'responseNode'`, `options.allowedOrigins: '*'`, webhookId `c9d8e7f6-5a4b-3c2d-1e0f-9a8b7c6d5e4f`.
2. **MySQL** — credentials `lqIXlvVVqfE4v7DF`, `executeQuery` with the SQL above. `alwaysOutputData: true` so a 0-row result doesn't stop the flow.
3. **Code** (Node type `n8n-nodes-base.code`, language `javaScript`, `mode: 'runOnceForAllItems'`) — the aggregation JS above.
4. **Respond to Webhook** — `respondWith: 'json'`, `responseBody: '={{ JSON.stringify($json.meals) }}'`, CORS headers (`*` origin, `GET, OPTIONS`, `Content-Type`).

Capture the assigned workflow ID from the create response.

- [ ] **Step 4: Activate the workflow** via the REST API:
```bash
source /c/hsa-automation/.env
curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "http://localhost:5679/api/v1/workflows/<ID>/activate"
```
Confirm response has `active: true`.

- [ ] **Step 5: Smoke test**. First verify SQL with mysql_query against a known week. For a week with no `weekly_selections` rows, the endpoint should return `[]` (empty array). For a week with meals planned:
```bash
curl -s -G "https://n8n-grocery.needexcelexpert.com/webhook/fetch_weekly_meal_ingredients" \
  --data-urlencode "weekDateRange=For the week of April 19th to April 25th, 2026"
```
Expected response: `[]` (no meals planned for this week) or an array of `{mealName, ingredientNames}` objects. Should not be empty bytes / 500 / deactivation-error.

- [ ] **Step 6: Update `C:\Users\Corey\.claude\projects\c--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md`** — append to "## n8n Workflows Created":
```
- `Fetch Weekly Meal Ingredients` (ID: <ID>) — GET webhook at `/fetch_weekly_meal_ingredients`. JOINs weekly_selections → recipe_summary → recipe_ingredients → ingredients. Returns `[{mealName, ingredientNames}]`. WebhookId: `c9d8e7f6-5a4b-3c2d-1e0f-9a8b7c6d5e4f`.
```

---

## Task 2: Add `fetchWeeklyMealIngredients` endpoint

**Files:**
- Modify: `src/config/api.js`
- Modify: `src/config/api.test.js`

- [ ] **Step 1: Append to `src/config/api.test.js`** (inside the existing `describe('ENDPOINTS …')` block at the bottom of the file, or add a new describe block — follow whatever pattern is there):

```js
describe('ENDPOINTS — weekly meal ingredients', () => {
  test('fetchWeeklyMealIngredients endpoint is defined', () => {
    expect(ENDPOINTS.fetchWeeklyMealIngredients).toMatch(/\/fetch_weekly_meal_ingredients$/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**:
```bash
npm test -- --watchAll=false src/config/api.test.js
```

- [ ] **Step 3: Add endpoint** to `src/config/api.js` inside the `ENDPOINTS` object, after the existing `fetchWeeklyMeals` entry:
```js
  fetchWeeklyMealIngredients: `${API_BASE_URL}/fetch_weekly_meal_ingredients`,
```

- [ ] **Step 4: Run test — expect PASS**:
```bash
npm test -- --watchAll=false src/config/api.test.js
```

- [ ] **Step 5: Commit**:
```bash
git add src/config/api.js src/config/api.test.js
git commit -m "feat(api): add fetchWeeklyMealIngredients endpoint"
```

---

## Task 3: `useWeekMeals` hook

Fetches `/fetch_weekly_meal_ingredients` on mount. Returns `{ meals, loading, error }` where `meals: [{mealName, ingredientNames}]`. Does NOT fetch the grocery items — that's `useWeekStaples`'s job.

**Files:**
- Create: `src/hooks/useWeekMeals.js`
- Create: `src/hooks/useWeekMeals.test.js`

- [ ] **Step 1: Write the failing test** at `src/hooks/useWeekMeals.test.js`:

```js
import { renderHook, waitFor } from '@testing-library/react';
import useWeekMeals from './useWeekMeals';

jest.mock('../config/api', () => {
  const actual = jest.requireActual('../config/api');
  return { ...actual, apiFetch: jest.fn() };
});
const { apiFetch, ENDPOINTS } = require('../config/api');

const mockOk = (body) => Promise.resolve({
  ok: true, status: 200,
  text: () => Promise.resolve(JSON.stringify(body)),
  json: () => Promise.resolve(body),
});

beforeEach(() => { apiFetch.mockReset(); });

describe('useWeekMeals', () => {
  test('loads meals and groups by mealName', async () => {
    apiFetch.mockImplementationOnce(() => mockOk([
      { mealName: 'Chicken tacos', ingredientNames: ['Chicken thighs', 'Cilantro'] },
      { mealName: 'Pasta alfredo', ingredientNames: ['Pasta', 'Heavy cream'] },
    ]));
    const { result } = renderHook(() => useWeekMeals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meals).toHaveLength(2);
    expect(result.current.meals[0].mealName).toBe('Chicken tacos');
    expect(result.current.meals[0].ingredientNames).toEqual(['Chicken thighs', 'Cilantro']);
  });

  test('returns empty array when API returns []', async () => {
    apiFetch.mockImplementationOnce(() => mockOk([]));
    const { result } = renderHook(() => useWeekMeals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meals).toEqual([]);
  });

  test('fetches with weekDateRange query param', async () => {
    apiFetch.mockImplementationOnce(() => mockOk([]));
    renderHook(() => useWeekMeals());
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const url = apiFetch.mock.calls[0][0];
    expect(url).toContain(ENDPOINTS.fetchWeeklyMealIngredients);
    expect(url).toContain('weekDateRange=');
  });

  test('sets error state on API failure', async () => {
    apiFetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500 }));
    const { result } = renderHook(() => useWeekMeals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.meals).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL** (`Cannot find module './useWeekMeals'`):
```bash
npm test -- --watchAll=false src/hooks/useWeekMeals.test.js
```

- [ ] **Step 3: Implement `useWeekMeals.js`** at `src/hooks/useWeekMeals.js`:

```js
import { useState, useEffect } from 'react';
import { ENDPOINTS, apiFetch, showApiError } from '../config/api';
import { getWeekDates } from '../utils/weekDates';

const useWeekMeals = () => {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const weekData = getWeekDates();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(ENDPOINTS.fetchWeeklyMealIngredients);
        url.searchParams.append('weekDateRange', weekData.displayRange);
        const res = await apiFetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setMeals(Array.isArray(data) ? data : []);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        showApiError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [weekData.displayRange]);

  return { meals, loading, error };
};

export default useWeekMeals;
```

- [ ] **Step 4: Run the test — expect PASS** (4/4).

- [ ] **Step 5: Commit**:
```bash
git add src/hooks/useWeekMeals.js src/hooks/useWeekMeals.test.js
git commit -m "feat(staples): add useWeekMeals hook for meal ingredient lookup"
```

---

## Task 4: Add periwinkle meal color tokens

Adds a new semantic color `meal` to the design system so MealPillBar and MealsCard can use `bg-meal`, `text-meal`, `border-meal`, `bg-meal-light` classes consistent with the rest of the app. Phase 1 audit flagged this as the only prototype-to-app token gap.

**Files:**
- Modify: `src/index.css` (add CSS vars in both `:root` and `.dark` blocks)
- Modify: `tailwind.config.js` (map vars to Tailwind color classes)

- [ ] **Step 1: Open `src/index.css`**. Find the `:root {` block (light mode colors) and the `.dark {` block (dark mode overrides). Add two new vars to each.

For `:root` (light mode) — add these lines alongside the existing `--color-*` definitions:
```css
  --color-meal: #6B7EC4;        /* periwinkle on light bg, darker than dark-mode for contrast */
  --color-meal-light: #EEF1FC;  /* pale lavender tint */
```

For `.dark` — add:
```css
  --color-meal: #8B9EE8;        /* periwinkle — matches prototype ST.meal */
  --color-meal-light: #1F2438;  /* deep indigo — matches prototype ST.mealLight */
```

- [ ] **Step 2: Open `tailwind.config.js`**. Find the `theme.extend.colors` (or `theme.colors`) block. Add entries for the new semantic tokens, mirroring how `primary` and `accent` are defined. Look for the existing pattern — something like `primary: 'var(--color-primary)'` — and add:

```js
        meal: 'var(--color-meal)',
        'meal-light': 'var(--color-meal-light)',
```

Exact placement depends on the file's style (object-keyed vs nested). Match the pattern already in use.

- [ ] **Step 3: Verify the classes compile**. Add a temporary sanity check — open a terminal and build:
```bash
CI=true npm run build 2>&1 | tail -10
```
Expect `Compiled successfully.`

- [ ] **Step 4: Visual sanity check**. Start the dev server (`npm start`, port 3000), open DevTools, and in the console run:
```js
getComputedStyle(document.documentElement).getPropertyValue('--color-meal')
```
In dark mode should return `#8B9EE8`. In light mode should return `#6B7EC4`. If both return empty, the CSS var wasn't loaded — double-check spelling.

Stop the dev server once verified.

- [ ] **Step 5: Commit**:
```bash
git add src/index.css tailwind.config.js
git commit -m "feat(staples): add periwinkle meal color token (light + dark)"
```

---

## Task 5: `MealPillBar` component

Horizontal scroll strip of meal pills. "All items" pill first (active when `mealFocus === null`), then per-meal pills in data order. Active pill highlights with the periwinkle `meal` color. Hides entirely when `meals.length === 0`.

**Files:**
- Create: `src/components/staples/MealPillBar.js`
- Create: `src/components/staples/MealPillBar.test.js`

- [ ] **Step 1: Write the failing test** at `src/components/staples/MealPillBar.test.js`:

```js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealPillBar from './MealPillBar';

describe('MealPillBar', () => {
  const meals = [
    { name: 'Chicken tacos', itemIds: [1, 2, 3, 4] },
    { name: 'Pasta alfredo', itemIds: [5, 6] },
  ];

  test('renders nothing when meals array is empty', () => {
    const { container } = render(
      <MealPillBar meals={[]} selected={new Set()} mealFocus={null} onFocusChange={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders "All items" pill + one pill per meal', () => {
    render(
      <MealPillBar meals={meals} selected={new Set()} mealFocus={null} onFocusChange={() => {}} />
    );
    expect(screen.getByText('All items')).toBeInTheDocument();
    expect(screen.getByText('Chicken tacos')).toBeInTheDocument();
    expect(screen.getByText('Pasta alfredo')).toBeInTheDocument();
  });

  test('shows N/M counter on meal pills', () => {
    render(
      <MealPillBar meals={meals} selected={new Set([1, 2])} mealFocus={null} onFocusChange={() => {}} />
    );
    // Chicken tacos has 2 selected of 4
    expect(screen.getByText('2/4')).toBeInTheDocument();
    // Pasta alfredo has 0 of 2
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  test('clicking a meal pill calls onFocusChange with the meal name', () => {
    const onFocusChange = jest.fn();
    render(
      <MealPillBar meals={meals} selected={new Set()} mealFocus={null} onFocusChange={onFocusChange} />
    );
    fireEvent.click(screen.getByText('Chicken tacos'));
    expect(onFocusChange).toHaveBeenCalledWith('Chicken tacos');
  });

  test('clicking "All items" calls onFocusChange with null', () => {
    const onFocusChange = jest.fn();
    render(
      <MealPillBar meals={meals} selected={new Set()} mealFocus={'Chicken tacos'} onFocusChange={onFocusChange} />
    );
    fireEvent.click(screen.getByText('All items'));
    expect(onFocusChange).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**:
```bash
npm test -- --watchAll=false src/components/staples/MealPillBar.test.js
```

- [ ] **Step 3: Implement `MealPillBar.js`** at `src/components/staples/MealPillBar.js`:

```js
import React from 'react';
import { List } from 'lucide-react';

const MealPillBar = ({ meals, selected, mealFocus, onFocusChange }) => {
  if (!meals || meals.length === 0) return null;

  return (
    <div className="mb-3 border-b border-default">
      <div
        className="flex items-center gap-1.5 overflow-x-auto py-2 px-0.5"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <button
          type="button"
          onClick={() => onFocusChange(null)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 border transition-colors ${
            mealFocus === null
              ? 'bg-primary-light text-primary border-primary'
              : 'bg-surface text-body border-default hover:border-primary/40'
          }`}
        >
          <List size={11} />
          All items
        </button>
        <div className="w-px h-5 bg-default flex-shrink-0 mx-1" />
        {meals.map((m) => {
          const count = m.itemIds.filter((id) => selected.has(id)).length;
          const active = mealFocus === m.name;
          return (
            <button
              key={m.name}
              type="button"
              onClick={() => onFocusChange(m.name)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 border transition-colors ${
                active
                  ? 'bg-meal-light text-meal border-meal'
                  : 'bg-surface text-body border-default hover:border-meal/40'
              }`}
            >
              {m.name}
              <span className="text-[10px] opacity-75 font-medium">
                {count}/{m.itemIds.length}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MealPillBar;
```

- [ ] **Step 4: Run the test — expect PASS** (5/5).

- [ ] **Step 5: Commit**:
```bash
git add src/components/staples/MealPillBar.js src/components/staples/MealPillBar.test.js
git commit -m "feat(staples): add MealPillBar with All items + per-meal pills"
```

---

## Task 6: `MealsCard` component

Groups a set of meal-ingredient items by `MealName` with subheaders, wrapped in a collapsible card with periwinkle accent. Has two display modes:
- `activeMeal = null`: shows the card header ("From your meals"), lists ALL meal items, subgrouped by meal name.
- `activeMeal = 'Chicken tacos'`: hides the card header (the meal pill bar already shows the focused meal), shows only that meal's items with no meal subheader.

**Files:**
- Create: `src/components/staples/MealsCard.js`
- Create: `src/components/staples/MealsCard.test.js`

- [ ] **Step 1: Write the failing test** at `src/components/staples/MealsCard.test.js`:

```js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealsCard from './MealsCard';

describe('MealsCard', () => {
  const items = [
    { ItemID: 1, ItemName: 'Chicken thighs', MealName: 'Chicken tacos' },
    { ItemID: 2, ItemName: 'Cilantro',       MealName: 'Chicken tacos' },
    { ItemID: 3, ItemName: 'Pasta',          MealName: 'Pasta alfredo' },
    { ItemID: 4, ItemName: 'Heavy cream',    MealName: 'Pasta alfredo' },
  ];

  test('renders header "From your meals" when activeMeal is null', () => {
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set()} onToggle={() => {}} />
    );
    expect(screen.getByText(/from your meals/i)).toBeInTheDocument();
  });

  test('renders meal subheaders when activeMeal is null', () => {
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set()} onToggle={() => {}} />
    );
    expect(screen.getByText('CHICKEN TACOS')).toBeInTheDocument();
    expect(screen.getByText('PASTA ALFREDO')).toBeInTheDocument();
  });

  test('hides header when activeMeal is set', () => {
    render(
      <MealsCard activeMeal="Chicken tacos" items={items.filter(i => i.MealName === 'Chicken tacos')} selected={new Set()} onToggle={() => {}} />
    );
    expect(screen.queryByText(/from your meals/i)).not.toBeInTheDocument();
  });

  test('renders an item row for each item', () => {
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set([1])} onToggle={() => {}} />
    );
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument();
    expect(screen.getByText('Cilantro')).toBeInTheDocument();
    expect(screen.getByText('Pasta')).toBeInTheDocument();
    expect(screen.getByText('Heavy cream')).toBeInTheDocument();
  });

  test('shows overall N/M counter in header', () => {
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set([1, 2])} onToggle={() => {}} />
    );
    // 2 of 4 meal items selected
    expect(screen.getByText('2/4')).toBeInTheDocument();
  });

  test('chevron click collapses and expands (smoke — header still visible)', () => {
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set()} onToggle={() => {}} />
    );
    // Starts expanded — Chicken thighs visible
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/from your meals/i));
    // After collapse, items are hidden but the header text stays
    expect(screen.queryByText('Chicken thighs')).not.toBeInTheDocument();
    expect(screen.getByText(/from your meals/i)).toBeInTheDocument();
  });

  test('clicking an item checkbox calls onToggle with ItemID', () => {
    const onToggle = jest.fn();
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set()} onToggle={onToggle} />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /chicken thighs/i }));
    expect(onToggle).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**:
```bash
npm test -- --watchAll=false src/components/staples/MealsCard.test.js
```

- [ ] **Step 3: Implement `MealsCard.js`** at `src/components/staples/MealsCard.js`:

```js
import React, { useState } from 'react';
import { ChefHat, ChevronDown, ChevronUp } from 'lucide-react';
import ItemRow from './ItemRow';

const MealsCard = ({ activeMeal, items, selected, onToggle }) => {
  const [expanded, setExpanded] = useState(true);

  // Group items by their MealName
  const byMeal = {};
  for (const it of items) {
    const key = it.MealName || 'Unknown';
    (byMeal[key] = byMeal[key] || []).push(it);
  }

  const mealNames = activeMeal ? [activeMeal] : Object.keys(byMeal);
  const totalItems = items.length;
  const doneCount = items.filter((i) => selected.has(i.ItemID)).length;
  const hideHeader = !!activeMeal;

  return (
    <div className="mb-3 bg-surface border border-meal/40 rounded-xl overflow-hidden">
      {!hideHeader && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        >
          <ChefHat size={13} className="text-meal flex-shrink-0" />
          <span className="flex-1 text-xs font-bold uppercase tracking-wide text-meal">
            From your meals
          </span>
          <span className="text-xs font-semibold text-meal opacity-85">
            {doneCount}/{totalItems}
          </span>
          {expanded ? (
            <ChevronUp size={16} className="text-meal" />
          ) : (
            <ChevronDown size={16} className="text-meal" />
          )}
        </button>
      )}
      {(hideHeader || expanded) && (
        <div className="p-2">
          {mealNames.map((meal) => {
            const mealItems = byMeal[meal] || [];
            if (mealItems.length === 0) return null;
            return (
              <div key={meal} className="mb-1">
                <div className="px-2 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-meal">
                  {meal}
                </div>
                <div className="bg-surface border border-default rounded-lg overflow-hidden">
                  {mealItems.map((it, idx) => (
                    <ItemRow
                      key={it.ItemID}
                      item={it}
                      checked={selected.has(it.ItemID)}
                      onToggle={onToggle}
                      divider={idx < mealItems.length - 1}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MealsCard;
```

- [ ] **Step 4: Run the test — expect PASS** (7/7).

- [ ] **Step 5: Commit**:
```bash
git add src/components/staples/MealsCard.js src/components/staples/MealsCard.test.js
git commit -m "feat(staples): add MealsCard with per-meal subgroups"
```

---

## Task 7: `StaplesScreen` integration — meal pills + lensing

Wire meal data into the container. Add `mealFocus` state. Fetch meals via `useWeekMeals`. Correlate meal ingredients with items to build `mealsWithItemIds`. Pass to `MealPillBar`. Inject `MealName` onto `MealIngredients` items via the same correlation so `MealsCard` can group them. Render `MealsCard` when appropriate. Apply lens filter.

**Files:**
- Modify: `src/components/StaplesScreen.js`
- Modify: `src/components/StaplesScreen.test.js`

- [ ] **Step 1: Update the test file** at `src/components/StaplesScreen.test.js` to add the new useWeekMeals mock and meal-focus tests.

First, at the top of the file (after the existing `jest.mock('../hooks/useWeekStaples')` block), add:
```js
jest.mock('../hooks/useWeekMeals');
const useWeekMeals = require('../hooks/useWeekMeals').default;
```

Then update the existing `beforeEach` to also seed the meals mock. Change:
```js
beforeEach(() => {
  useWeekStaples.mockReturnValue(baseHook);
});
```
to:
```js
const mealsHookBase = {
  meals: [
    { mealName: 'Chicken tacos', ingredientNames: ['Chicken thighs', 'Cilantro'] },
  ],
  loading: false,
  error: null,
};

beforeEach(() => {
  useWeekStaples.mockReturnValue(baseHook);
  useWeekMeals.mockReturnValue(mealsHookBase);
});
```

Also update `baseHook.items` to include a meal-ingredient item so the filter/lens tests have data to work with. Change:
```js
const baseHook = {
  items: [
    { ItemID: 1, ItemName: 'Milk',    Category: 'Dairy & eggs',     DataSource: 'Staples' },
    { ItemID: 2, ItemName: 'Bread',   Category: 'Bakery & bread',   DataSource: 'Staples' },
    { ItemID: 9, ItemName: 'Candles', Category: 'Household & other',DataSource: 'OneOff' },
  ],
  selected: new Set([1, 9]),
  ...
```
to:
```js
const baseHook = {
  items: [
    { ItemID: 1, ItemName: 'Milk',           Category: 'Dairy & eggs',       DataSource: 'Staples' },
    { ItemID: 2, ItemName: 'Bread',          Category: 'Bakery & bread',     DataSource: 'Staples' },
    { ItemID: 9, ItemName: 'Candles',        Category: 'Household & other',  DataSource: 'OneOff' },
    { ItemID: 100, ItemName: 'Chicken thighs', Category: 'Meat & seafood',   DataSource: 'MealIngredients' },
    { ItemID: 101, ItemName: 'Cilantro',       Category: 'Fruit & vegetables',DataSource: 'MealIngredients' },
  ],
  selected: new Set([1, 9, 100]),
  ...
```
(Keep `loading`, `error`, `toggle`, `quickAdd`, `removeOneOff` as they were.)

Now append four new tests inside the existing `describe('StaplesScreen', ...)` block:

```js
  test('renders MealPillBar when meals are present', () => {
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByText('All items')).toBeInTheDocument();
    expect(screen.getByText('Chicken tacos')).toBeInTheDocument();
  });

  test('does not render MealPillBar when meals array is empty', () => {
    useWeekMeals.mockReturnValue({ ...mealsHookBase, meals: [] });
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.queryByText('All items')).not.toBeInTheDocument();
  });

  test('renders MealsCard with meal-ingredient items in "all items" view', () => {
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByText(/from your meals/i)).toBeInTheDocument();
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument();
    expect(screen.getByText('Cilantro')).toBeInTheDocument();
  });

  test('clicking a meal pill hides category sections and shows only meal items', () => {
    render(<StaplesScreen onReview={() => {}} />);
    fireEvent.click(screen.getByText('Chicken tacos'));
    // Categories gone
    expect(screen.queryByText('Dairy & eggs')).not.toBeInTheDocument();
    expect(screen.queryByText('Bakery & bread')).not.toBeInTheDocument();
    // Meal items visible
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument();
    expect(screen.getByText('Cilantro')).toBeInTheDocument();
  });
```

Also add `fireEvent` to the import on line 2:
```js
import { render, screen, fireEvent } from '@testing-library/react';
```

- [ ] **Step 2: Run the tests — expect the 4 new ones to FAIL** (the existing 6 should still pass):
```bash
npm test -- --watchAll=false src/components/StaplesScreen.test.js
```

- [ ] **Step 3: Update `src/components/StaplesScreen.js`** to implement meal integration.

Add imports at the top (after the existing imports):
```js
import useWeekMeals from '../hooks/useWeekMeals';
import MealPillBar from './staples/MealPillBar';
import MealsCard from './staples/MealsCard';
```

Inside the component body, right after `const { items, selected, loading, toggle, quickAdd, removeOneOff } = useWeekStaples();`, add:
```js
  const { meals: rawMeals } = useWeekMeals();
  const [mealFocus, setMealFocus] = useState(null);
```

Replace the existing `useMemo` that computes `{ groups, oneOffs }` with an expanded version that also computes `mealsWithItemIds` and `mealItems` (items with MealName injected via correlation):

```js
  const { groups, oneOffs, mealItems, mealsWithItemIds } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (i) => !q || i.ItemName.toLowerCase().includes(q);

    // Correlate meal ingredient names with actual items to discover MealName per item
    // Key: lowercase+trimmed item name → MealName (first match wins if in multiple meals)
    const itemNameToMeal = {};
    for (const m of rawMeals) {
      for (const ingName of m.ingredientNames || []) {
        const key = ingName.trim().toLowerCase();
        if (!itemNameToMeal[key]) itemNameToMeal[key] = m.mealName;
      }
    }

    // Items with DataSource='MealIngredients' that matched a known meal get a MealName injected
    const enrichedMealItems = items
      .filter((i) => i.DataSource === 'MealIngredients')
      .map((i) => ({
        ...i,
        MealName: itemNameToMeal[i.ItemName.trim().toLowerCase()] || null,
      }))
      .filter((i) => i.MealName !== null);  // drop meal ingredients we can't attribute

    // Build meals array with itemIds: for each meal, find which items belong to it
    const mealsOut = rawMeals.map((m) => ({
      name: m.mealName,
      itemIds: enrichedMealItems
        .filter((i) => i.MealName === m.mealName && matches(i))
        .map((i) => i.ItemID),
    }));

    const oneOffsList = items.filter((i) => i.DataSource === 'OneOff' && matches(i));
    const stapleItems = items.filter(
      (i) => i.DataSource !== 'OneOff' && i.DataSource !== 'MealIngredients' && matches(i)
    );

    const byCat = {};
    stapleItems.forEach((i) => {
      const key = i.Category || 'Household & other';
      (byCat[key] = byCat[key] || []).push(i);
    });

    const ordered = GROCERY_CATEGORIES
      .filter((c) => byCat[c])
      .map((c) => ({
        name: c,
        items: byCat[c].sort((a, b) => a.ItemName.localeCompare(b.ItemName)),
      }));

    const visibleMealItems = enrichedMealItems.filter(matches);

    return {
      groups: ordered,
      oneOffs: oneOffsList,
      mealItems: visibleMealItems,
      mealsWithItemIds: mealsOut,
    };
  }, [items, query, rawMeals]);
```

Then update the render body. After the `<InputToolbar />` element, add the `MealPillBar`:
```jsx
        <MealPillBar
          meals={mealsWithItemIds}
          selected={selected}
          mealFocus={mealFocus}
          onFocusChange={setMealFocus}
        />
```

Lens logic: when `mealFocus !== null`, hide the `OneOffCard`, hide all `CategorySection`s, and render only a `MealsCard` filtered to that meal. Update the scroll region to:

```jsx
        {/* OneOffs — hidden when focused on a specific meal */}
        {!mealFocus && oneOffs.length > 0 && (
          <OneOffCard
            oneOffs={oneOffs}
            selected={selected}
            onToggle={toggle}
            onRemove={removeOneOff}
          />
        )}

        {/* MealsCard — always visible if there are meal items. Header hidden when a meal pill is active. */}
        {mealItems.length > 0 && (
          <MealsCard
            activeMeal={mealFocus}
            items={mealFocus ? mealItems.filter((i) => i.MealName === mealFocus) : mealItems}
            selected={selected}
            onToggle={toggle}
          />
        )}

        {/* Empty state */}
        {groups.length === 0 && oneOffs.length === 0 && mealItems.length === 0 && (
          <div className="mt-10 text-center text-sm text-muted">
            {query ? `No matches for "${query}"` : 'Nothing on this week\'s list yet'}
          </div>
        )}

        {/* Category sections — hidden when focused on a meal */}
        {!mealFocus && groups.map((g) => (
          <CategorySection
            key={g.name}
            group={g}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => handleToggleAll(g)}
          />
        ))}
```

- [ ] **Step 4: Run the tests — expect PASS** (10/10 for StaplesScreen, full suite no regressions):
```bash
npm test -- --watchAll=false
```

- [ ] **Step 5: Commit**:
```bash
git add src/components/StaplesScreen.js src/components/StaplesScreen.test.js
git commit -m "feat(staples): integrate meal pills and MealsCard into StaplesScreen"
```

---

## Task 8: Manual verification + final commit

- [ ] **Step 1: Ensure a meal is selected for the current week.** Open the app, go to `#meals`, and add at least one meal to this week's plan. Confirm it persists via `weekly_selections`:
```sql
SELECT * FROM weekly_selections WHERE WeekDateRange = '<current week>'
```

- [ ] **Step 2: Add meal ingredients to the weekly list.** From `#meals` → pick the meal → "Add ingredients to list" flow. Confirm `WeeklyGroceryList` has new rows with `DataSource='MealIngredients'`.

- [ ] **Step 3: Start the dev server** (`npm start`, port 3000) and navigate to `#plan`.

- [ ] **Step 4: Verify the following on the Staples screen**:
  - Meal pill bar appears under the input toolbar, with "All items" + one pill per planned meal. Counter (N/M) reflects selected/total items per meal.
  - "From your meals" card appears in the scroll region with expanded content. Each meal's ingredients are grouped under its uppercased meal-name subheader.
  - Clicking a meal pill: category sections disappear, OneOffCard disappears, only that meal's items remain (MealsCard without header).
  - Clicking "All items" returns to the full view.
  - Tapping a checkbox inside a meal item fires `/selection_check` or `/selection_uncheck` against the live backend (Network tab). Refresh — the toggle persists.
  - Search in meal-focused mode: filters items within that meal.
  - Dark mode toggle — periwinkle color adapts to both themes (check `bg-meal`, `border-meal` classes render visibly distinct from sage primary).
  - Weeks with no meals: pill bar absent, MealsCard absent. Fall-through to Phase 1 behavior.

- [ ] **Step 5: Run the full test suite** a final time:
```bash
npm test -- --watchAll=false
```
Expect all tests pass (66 total after Phase 2).

- [ ] **Step 6: Confirm production build passes CI-strict lint**:
```bash
CI=true npm run build 2>&1 | tail -5
```
Expect `Compiled successfully.`

- [ ] **Step 7: Commit the Phase 2 plan doc itself** (if not already committed):
```bash
git add docs/plans/2026-04-18-staples-redesign-phase-2-plan.md
git commit -m "docs(staples): archive Phase 2 implementation plan"
```

- [ ] **Step 8: Push the branch**:
```bash
git push origin feature/staples-redesign
```

---

## Open follow-ups (not in Phase 2)

- **Phase 3:** Delete legacy `GroceryChecklist.js`. Drop `Type` and `Group-by-Store` legacy filters from `api.js` if unused. `aria-live="polite"` on the running count strip. Keyboard arrow-key navigation on the meal pill bar (`role="tablist"`). Debounce on `handleToggleAll` to prevent the double-tap race flagged in Phase 1 code review. Consider returning the auto-generated DB `id` from `add_oneoff_item` so one-offs have stable IDs across sessions.
- **Name mismatch surfacing**: if the correlation misses some ingredients (e.g. meal says "Chicken breasts" but WeeklyGroceryList has "Chicken breast"), they silently drop. A Phase 3 diagnostic could surface a "Not on list" badge on meal pills with unmatched ingredients.
- **Multi-meal ingredients**: an ingredient in 2 meals currently appears under only the first-matched meal's subheader. If users complain, switch to duplicating the row under each meal or a "shared across X meals" badge.

---

## Test running reference

```bash
# Single test file
npm test -- --watchAll=false src/path/to/file.test.js

# Full suite
npm test -- --watchAll=false

# Production build (CI-strict lint — warnings fail the build)
CI=true npm run build
```
