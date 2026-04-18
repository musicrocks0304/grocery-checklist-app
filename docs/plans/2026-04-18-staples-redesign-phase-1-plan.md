# Grocery Staples Redesign — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tab-per-category `Plan` screen with a single-scroll sticky-header Grocery Staples screen that persists selection per-tap, matching the prototype spec in `design_handoff_staples/source/staples-v5-best-of.jsx`. Meal pills and the MealsCard are deferred to Phase 2 (they require a `MealName` column backfill). Phase 1 ships behavioral parity + the new layout at `#plan`.

**Architecture:** New `StaplesScreen` container + 5 presentational children (`ItemRow`, `CategorySection`, `OneOffCard`, `InputToolbar`, `ReviewBar`) + a `useWeekStaples` hook that wraps fetch, per-tap toggle, and one-off mutations. Selection persists to the existing `WeeklyGroceryList.IsSelected` column via two new n8n webhooks (`selection_check`, `selection_uncheck`) that mirror the `shopping_progress_check/uncheck` pattern. The Review CTA navigates directly to `#shop` — the legacy inline-review flow is dropped. The old `GroceryChecklist` component is left on disk; `Plan.js` rewires to `StaplesScreen`. Fall-back is `git revert`.

**Tech stack:** React 19 + CRA (react-scripts 5) + Tailwind 3.4 JIT + CSS-custom-property tokens (see `src/styles/tokens.js` + `src/index.css`) + `lucide-react` icons + `react-hot-toast` + jest + `@testing-library/react`. Backend: existing n8n at `https://n8n-grocery.needexcelexpert.com/webhook/`, MySQL `WeeklyGroceryList` on `hsa` db.

---

## File Structure

**Create**
- `src/components/StaplesScreen.js` — container (data → children)
- `src/components/StaplesScreen.test.js`
- `src/components/staples/ItemRow.js`
- `src/components/staples/ItemRow.test.js`
- `src/components/staples/CategorySection.js`
- `src/components/staples/CategorySection.test.js`
- `src/components/staples/OneOffCard.js`
- `src/components/staples/OneOffCard.test.js`
- `src/components/staples/InputToolbar.js`
- `src/components/staples/InputToolbar.test.js`
- `src/components/staples/ReviewBar.js`
- `src/components/staples/ReviewBar.test.js`
- `src/hooks/useWeekStaples.js`
- `src/hooks/useWeekStaples.test.js`

**Modify**
- `src/config/api.js` — add `selectionCheck` and `selectionUncheck` endpoints
- `src/components/Plan.js` — swap `GroceryChecklist` for `StaplesScreen`
- `src/components/App.js` — no change required; `#plan` already routes to `Plan`

**Leave alone (for now)**
- `src/components/GroceryChecklist.js` — dead after `Plan.js` rewire; deleted in Phase 3

---

## Task 0: Backend — create n8n webhooks for per-tap persistence

This is a one-time n8n operation that unblocks Tasks 7–8. Requires `mcp__n8n-mcp__*` tools loaded (deferred — load via `ToolSearch` with query `"n8n create workflow"`).

**Workflow A: `Selection Check`**

Pattern: Webhook (POST, `/selection_check`) → MySQL (update) → Respond to Webhook (CORS `*`).

Payload shape (note `weekDateRange` matches the existing `getWeekDateRange()` format — "For the week of April 19th to April 25th, 2026"):
```json
{
  "itemId": 123,
  "weekDateRange": "For the week of April 19th to April 25th, 2026",
  "quantitySelected": 1
}
```

SQL:
```sql
UPDATE WeeklyGroceryList
SET IsSelected = 1,
    QuantitySelected = {{ $json.body.quantitySelected }}
WHERE ItemID = {{ $json.body.itemId }}
  AND WeekDateRange = '{{ $json.body.weekDateRange }}'
```

Respond body: `{{ JSON.stringify({ success: true }) }}`. Status 200. CORS headers: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`.

**Workflow B: `Selection Uncheck`**

Same structure, path `/selection_uncheck`, SQL:
```sql
UPDATE WeeklyGroceryList
SET IsSelected = 0
WHERE ItemID = {{ $json.body.itemId }}
  AND WeekDateRange = '{{ $json.body.weekDateRange }}'
```

**Critical reminders** (from `MEMORY.md`):
- Webhook node MUST have a `webhookId` (any UUID) property. Suggested: `selection_check` = `1a2b3c4d-5e6f-7890-abcd-111111111111`; `selection_uncheck` = `1a2b3c4d-5e6f-7890-abcd-222222222222`.
- After creating, **deactivate then reactivate** the workflow via `POST /api/v1/workflows/{id}/(de)activate` using `N8N_API_KEY` from `C:\hsa-automation\.env` — the n8n MCP tool cannot toggle activation.
- MySQL credential ID: `lqIXlvVVqfE4v7DF`.

- [ ] **Step 1: Create `Selection Check` workflow** via `mcp__n8n-mcp__n8n_create_workflow` using the structure above.
- [ ] **Step 2: Create `Selection Uncheck` workflow** via the same tool.
- [ ] **Step 3: Activate both** via `curl` against the n8n REST API.
- [ ] **Step 4: Smoke-test both** with `curl -X POST` and verify an `UPDATE` against `WeeklyGroceryList` hits (`SELECT IsSelected FROM WeeklyGroceryList WHERE ItemID = <known_id>` before and after).
- [ ] **Step 5: Add to memory.** Append one line each to `MEMORY.md` under "n8n Workflows Created" with the workflow IDs assigned by n8n.

---

## Task 1: Add endpoints to `api.js`

**Files:**
- Modify: `src/config/api.js`
- Modify: `src/config/api.test.js`

- [ ] **Step 1: Write the failing test** — append to `src/config/api.test.js`:

```js
import { ENDPOINTS } from './api';

describe('ENDPOINTS — per-tap selection', () => {
  test('selectionCheck endpoint is defined', () => {
    expect(ENDPOINTS.selectionCheck).toMatch(/\/selection_check$/);
  });
  test('selectionUncheck endpoint is defined', () => {
    expect(ENDPOINTS.selectionUncheck).toMatch(/\/selection_uncheck$/);
  });
});
```

- [ ] **Step 2: Run the test** — expect FAIL:
```bash
npm test -- --watchAll=false src/config/api.test.js
```
Expected: `ENDPOINTS.selectionCheck is undefined`.

- [ ] **Step 3: Add the endpoints** — inside the `ENDPOINTS` object in `src/config/api.js`, after the existing `shoppingProgressUncheck` entry:

```js
  // Per-tap selection persistence (DB-backed)
  selectionCheck: `${API_BASE_URL}/selection_check`,
  selectionUncheck: `${API_BASE_URL}/selection_uncheck`,
```

- [ ] **Step 4: Run the test** — expect PASS:
```bash
npm test -- --watchAll=false src/config/api.test.js
```

- [ ] **Step 5: Commit**:
```bash
git add src/config/api.js src/config/api.test.js
git commit -m "feat(api): add selectionCheck + selectionUncheck endpoints"
```

---

## Task 2: `ItemRow` component

The prototype row is simpler than the existing `GroceryItem`: checkbox + name + optional right-side badge (e.g. `×1`). No quantity dropdown, no trash icon.

**Files:**
- Create: `src/components/staples/ItemRow.js`
- Create: `src/components/staples/ItemRow.test.js`

- [ ] **Step 1: Write the failing test**:

```js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ItemRow from './ItemRow';

describe('ItemRow', () => {
  const item = { ItemID: 42, ItemName: 'Oatmeal', Category: 'Cereal & breakfast' };

  test('renders the item name', () => {
    render(<ItemRow item={item} checked={false} onToggle={() => {}} />);
    expect(screen.getByText('Oatmeal')).toBeInTheDocument();
  });

  test('native checkbox reflects the checked prop', () => {
    render(<ItemRow item={item} checked={true} onToggle={() => {}} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('calls onToggle with the ItemID when clicked', () => {
    const onToggle = jest.fn();
    render(<ItemRow item={item} checked={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith(42);
  });

  test('renders a divider when divider prop is true', () => {
    const { container } = render(
      <ItemRow item={item} checked={false} onToggle={() => {}} divider />
    );
    expect(container.querySelector('.border-b')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test** — expect FAIL (`Cannot find module './ItemRow'`).
```bash
npm test -- --watchAll=false src/components/staples/ItemRow.test.js
```

- [ ] **Step 3: Implement `ItemRow.js`**:

```js
import React from 'react';

const ItemRow = React.memo(({ item, checked, onToggle, divider = false }) => {
  const inputId = `staple-item-${item.ItemID}`;
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] ${
        divider ? 'border-b border-default' : ''
      }`}
    >
      <input
        type="checkbox"
        id={inputId}
        checked={checked}
        onChange={() => onToggle(item.ItemID)}
        className="w-5 h-5 text-primary rounded focus:ring-focus flex-shrink-0"
      />
      <label
        htmlFor={inputId}
        className={`flex-1 text-sm cursor-pointer ${
          checked ? 'text-heading font-medium' : 'text-body'
        }`}
      >
        {item.ItemName}
      </label>
    </div>
  );
});

export default ItemRow;
```

- [ ] **Step 4: Run the test** — expect PASS.

- [ ] **Step 5: Commit**:
```bash
git add src/components/staples/ItemRow.js src/components/staples/ItemRow.test.js
git commit -m "feat(staples): add ItemRow component"
```

---

## Task 3: `CategorySection` component

Sticky-header block with a count (`N/M`) and an `All`/`Clear` bulk toggle. Matches `V5CategorySection` in the prototype.

**Files:**
- Create: `src/components/staples/CategorySection.js`
- Create: `src/components/staples/CategorySection.test.js`

- [ ] **Step 1: Write the failing test**:

```js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CategorySection from './CategorySection';

describe('CategorySection', () => {
  const group = {
    name: 'Dairy & eggs',
    items: [
      { ItemID: 1, ItemName: 'Whole milk' },
      { ItemID: 2, ItemName: 'Large eggs' },
    ],
  };

  test('renders the category name', () => {
    render(
      <CategorySection group={group} selected={new Set()} onToggle={() => {}} onToggleAll={() => {}} />
    );
    expect(screen.getByText('Dairy & eggs')).toBeInTheDocument();
  });

  test('renders 0/2 when nothing selected', () => {
    render(
      <CategorySection group={group} selected={new Set()} onToggle={() => {}} onToggleAll={() => {}} />
    );
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  test('renders 2/2 when all selected, and button text is "Clear"', () => {
    render(
      <CategorySection
        group={group}
        selected={new Set([1, 2])}
        onToggle={() => {}}
        onToggleAll={() => {}}
      />
    );
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  test('button reads "All" when not fully selected', () => {
    render(
      <CategorySection
        group={group}
        selected={new Set([1])}
        onToggle={() => {}}
        onToggleAll={() => {}}
      />
    );
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  test('clicking bulk button calls onToggleAll', () => {
    const onToggleAll = jest.fn();
    render(
      <CategorySection
        group={group}
        selected={new Set()}
        onToggle={() => {}}
        onToggleAll={onToggleAll}
      />
    );
    fireEvent.click(screen.getByText('All'));
    expect(onToggleAll).toHaveBeenCalled();
  });

  test('renders all items', () => {
    render(
      <CategorySection group={group} selected={new Set()} onToggle={() => {}} onToggleAll={() => {}} />
    );
    expect(screen.getByText('Whole milk')).toBeInTheDocument();
    expect(screen.getByText('Large eggs')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test** — expect FAIL.

- [ ] **Step 3: Implement `CategorySection.js`**:

```js
import React from 'react';
import ItemRow from './ItemRow';

const CategorySection = ({ group, selected, onToggle, onToggleAll }) => {
  const selectedCount = group.items.filter((i) => selected.has(i.ItemID)).length;
  const total = group.items.length;
  const allSelected = total > 0 && selectedCount === total;

  return (
    <div className="mb-3">
      <div className="sticky top-0 z-10 flex items-center gap-2 py-2 bg-background">
        <h2 className="text-sm font-semibold text-heading flex-1 truncate">
          {group.name}
        </h2>
        <span
          className={`text-xs font-semibold ${
            selectedCount > 0 ? 'text-primary' : 'text-muted'
          }`}
        >
          {selectedCount}/{total}
        </span>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-xs font-medium text-muted hover:text-body px-2 py-1 rounded"
        >
          {allSelected ? 'Clear' : 'All'}
        </button>
      </div>
      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        {group.items.map((item, idx) => (
          <ItemRow
            key={item.ItemID}
            item={item}
            checked={selected.has(item.ItemID)}
            onToggle={onToggle}
            divider={idx < group.items.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

export default CategorySection;
```

- [ ] **Step 4: Run the test** — expect PASS.

- [ ] **Step 5: Commit**:
```bash
git add src/components/staples/CategorySection.js src/components/staples/CategorySection.test.js
git commit -m "feat(staples): add CategorySection with sticky header and bulk toggle"
```

---

## Task 4: `OneOffCard` component

Collapsible card that renders session one-offs. Trash icon removes; checkbox toggles.

**Files:**
- Create: `src/components/staples/OneOffCard.js`
- Create: `src/components/staples/OneOffCard.test.js`

- [ ] **Step 1: Write the failing test**:

```js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import OneOffCard from './OneOffCard';

describe('OneOffCard', () => {
  const oneOffs = [
    { ItemID: 'oneoff_100', ItemName: 'Birthday candles' },
    { ItemID: 'oneoff_101', ItemName: 'Helium balloons' },
  ];

  test('renders a row per one-off', () => {
    render(
      <OneOffCard
        oneOffs={oneOffs}
        selected={new Set(['oneoff_100', 'oneoff_101'])}
        onToggle={() => {}}
        onRemove={() => {}}
      />
    );
    expect(screen.getByText('Birthday candles')).toBeInTheDocument();
    expect(screen.getByText('Helium balloons')).toBeInTheDocument();
  });

  test('shows N/M count', () => {
    render(
      <OneOffCard
        oneOffs={oneOffs}
        selected={new Set(['oneoff_100'])}
        onToggle={() => {}}
        onRemove={() => {}}
      />
    );
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  test('clicking the trash icon calls onRemove with the itemId', () => {
    const onRemove = jest.fn();
    render(
      <OneOffCard
        oneOffs={oneOffs}
        selected={new Set(['oneoff_100'])}
        onToggle={() => {}}
        onRemove={onRemove}
      />
    );
    const removeBtns = screen.getAllByLabelText(/remove one-off/i);
    fireEvent.click(removeBtns[0]);
    expect(onRemove).toHaveBeenCalledWith('oneoff_100');
  });

  test('clicking a checkbox calls onToggle with the itemId', () => {
    const onToggle = jest.fn();
    render(
      <OneOffCard
        oneOffs={oneOffs}
        selected={new Set()}
        onToggle={onToggle}
        onRemove={() => {}}
      />
    );
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onToggle).toHaveBeenCalledWith('oneoff_100');
  });
});
```

- [ ] **Step 2: Run the test** — expect FAIL.

- [ ] **Step 3: Implement `OneOffCard.js`**:

```js
import React, { useState } from 'react';
import { Zap, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

const OneOffCard = ({ oneOffs, selected, onToggle, onRemove }) => {
  const [expanded, setExpanded] = useState(true);
  const doneCount = oneOffs.filter((o) => selected.has(o.ItemID)).length;

  return (
    <div className="mb-3 bg-surface border border-accent/40 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <Zap size={14} className="text-accent flex-shrink-0" />
        <span className="flex-1 text-xs font-bold uppercase tracking-wide text-accent">
          One-offs this week
        </span>
        <span className="text-xs font-semibold text-accent/85">
          {doneCount}/{oneOffs.length}
        </span>
        {expanded ? (
          <ChevronUp size={16} className="text-accent" />
        ) : (
          <ChevronDown size={16} className="text-accent" />
        )}
      </button>
      {expanded && (
        <div className="bg-surface">
          {oneOffs.map((o, idx) => {
            const isChecked = selected.has(o.ItemID);
            const inputId = `oneoff-${o.ItemID}`;
            return (
              <div
                key={o.ItemID}
                className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] ${
                  idx < oneOffs.length - 1 ? 'border-b border-default' : ''
                }`}
              >
                <input
                  type="checkbox"
                  id={inputId}
                  checked={isChecked}
                  onChange={() => onToggle(o.ItemID)}
                  className="w-5 h-5 text-primary rounded focus:ring-focus flex-shrink-0"
                />
                <label
                  htmlFor={inputId}
                  className={`flex-1 text-sm cursor-pointer ${
                    isChecked ? 'text-heading font-medium' : 'text-body'
                  }`}
                >
                  {o.ItemName}
                </label>
                <button
                  type="button"
                  onClick={() => onRemove(o.ItemID)}
                  aria-label={`Remove one-off ${o.ItemName}`}
                  className="text-muted hover:text-danger p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OneOffCard;
```

- [ ] **Step 4: Run the test** — expect PASS.

- [ ] **Step 5: Commit**:
```bash
git add src/components/staples/OneOffCard.js src/components/staples/OneOffCard.test.js
git commit -m "feat(staples): add OneOffCard with toggle and remove"
```

---

## Task 5: `InputToolbar` component

Swaps between quick-add mode (primary, terracotta Add button) and search mode (sage, toggle-in via magnifying-glass icon). Owns ephemeral input state internally; emits `onQuickAdd(name)`, `onSearchChange(query)`.

**Files:**
- Create: `src/components/staples/InputToolbar.js`
- Create: `src/components/staples/InputToolbar.test.js`

- [ ] **Step 1: Write the failing test**:

```js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InputToolbar from './InputToolbar';

describe('InputToolbar', () => {
  test('renders quick-add input and Add button by default', () => {
    render(<InputToolbar onQuickAdd={() => {}} onSearchChange={() => {}} />);
    expect(screen.getByPlaceholderText(/quick add/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument();
  });

  test('Add button is disabled when quick-add input is empty', () => {
    render(<InputToolbar onQuickAdd={() => {}} onSearchChange={() => {}} />);
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
  });

  test('pressing Enter in quick-add fires onQuickAdd with trimmed name', () => {
    const onQuickAdd = jest.fn();
    render(<InputToolbar onQuickAdd={onQuickAdd} onSearchChange={() => {}} />);
    const input = screen.getByPlaceholderText(/quick add/i);
    fireEvent.change(input, { target: { value: '  Cilantro  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onQuickAdd).toHaveBeenCalledWith('Cilantro');
  });

  test('clicking the search toggle switches to search mode', () => {
    render(<InputToolbar onQuickAdd={() => {}} onSearchChange={() => {}} />);
    fireEvent.click(screen.getByLabelText(/search/i));
    expect(screen.getByPlaceholderText(/search your items/i)).toBeInTheDocument();
  });

  test('typing in search mode fires onSearchChange', () => {
    const onSearchChange = jest.fn();
    render(<InputToolbar onQuickAdd={() => {}} onSearchChange={onSearchChange} />);
    fireEvent.click(screen.getByLabelText(/search/i));
    fireEvent.change(screen.getByPlaceholderText(/search your items/i), {
      target: { value: 'milk' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('milk');
  });

  test('clearing search (X) returns to quick-add mode', () => {
    render(<InputToolbar onQuickAdd={() => {}} onSearchChange={() => {}} />);
    fireEvent.click(screen.getByLabelText(/search/i));
    fireEvent.click(screen.getByLabelText(/close search/i));
    expect(screen.getByPlaceholderText(/quick add/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test** — expect FAIL.

- [ ] **Step 3: Implement `InputToolbar.js`**:

```js
import React, { useState, useRef, useEffect } from 'react';
import { Zap, Plus, Search, X } from 'lucide-react';

const InputToolbar = ({ onQuickAdd, onSearchChange }) => {
  const [mode, setMode] = useState('quickAdd');
  const [quickAddText, setQuickAddText] = useState('');
  const [searchText, setSearchText] = useState('');
  const searchRef = useRef(null);
  const quickAddRef = useRef(null);

  useEffect(() => {
    if (mode === 'search') searchRef.current?.focus();
  }, [mode]);

  const commitQuickAdd = () => {
    const trimmed = quickAddText.trim();
    if (!trimmed) return;
    onQuickAdd(trimmed);
    setQuickAddText('');
  };

  if (mode === 'quickAdd') {
    return (
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Zap size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={quickAddRef}
            type="text"
            value={quickAddText}
            onChange={(e) => setQuickAddText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitQuickAdd(); }}
            placeholder="Quick add one-off item…"
            className="w-full pl-9 pr-3 py-2.5 border border-default rounded-xl bg-surface text-heading focus:outline-none focus:ring-2 focus:ring-focus text-sm"
          />
        </div>
        <button
          type="button"
          onClick={commitQuickAdd}
          disabled={!quickAddText.trim()}
          className="px-3.5 py-2.5 rounded-xl bg-accent text-white disabled:bg-muted disabled:cursor-not-allowed text-sm font-semibold flex items-center gap-1.5"
        >
          <Plus size={14} /> Add
        </button>
        <button
          type="button"
          onClick={() => setMode('search')}
          aria-label="Search items"
          className="px-3 py-2.5 rounded-xl border border-default text-muted hover:text-body"
        >
          <Search size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="relative flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
        <input
          ref={searchRef}
          type="text"
          value={searchText}
          onChange={(e) => { setSearchText(e.target.value); onSearchChange(e.target.value); }}
          placeholder="Search your items…"
          className="w-full pl-9 pr-9 py-2.5 border border-primary rounded-xl bg-surface text-heading focus:outline-none focus:ring-2 focus:ring-focus text-sm"
        />
        <button
          type="button"
          onClick={() => { setSearchText(''); onSearchChange(''); setMode('quickAdd'); }}
          aria-label="Close search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-heading p-1"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default InputToolbar;
```

- [ ] **Step 4: Run the test** — expect PASS.

- [ ] **Step 5: Commit**:
```bash
git add src/components/staples/InputToolbar.js src/components/staples/InputToolbar.test.js
git commit -m "feat(staples): add InputToolbar with quick-add and search toggle"
```

---

## Task 6: `ReviewBar` component

Fixed-position bottom bar. Shows `"N items in your list"` and a Review button. Button disabled at 0. Calls `onReview` when tapped.

**Files:**
- Create: `src/components/staples/ReviewBar.js`
- Create: `src/components/staples/ReviewBar.test.js`

- [ ] **Step 1: Write the failing test**:

```js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReviewBar from './ReviewBar';

describe('ReviewBar', () => {
  test('shows "Nothing selected yet" when count is 0', () => {
    render(<ReviewBar count={0} onReview={() => {}} />);
    expect(screen.getByText(/nothing selected yet/i)).toBeInTheDocument();
  });

  test('pluralizes correctly at 1 and 2', () => {
    const { rerender } = render(<ReviewBar count={1} onReview={() => {}} />);
    expect(screen.getByText(/1 item in your list/i)).toBeInTheDocument();
    rerender(<ReviewBar count={2} onReview={() => {}} />);
    expect(screen.getByText(/2 items in your list/i)).toBeInTheDocument();
  });

  test('Review button disabled when count is 0', () => {
    render(<ReviewBar count={0} onReview={() => {}} />);
    expect(screen.getByRole('button', { name: /review/i })).toBeDisabled();
  });

  test('clicking Review calls onReview when enabled', () => {
    const onReview = jest.fn();
    render(<ReviewBar count={3} onReview={onReview} />);
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(onReview).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test** — expect FAIL.

- [ ] **Step 3: Implement `ReviewBar.js`**:

```js
import React from 'react';
import { ArrowRight } from 'lucide-react';

const ReviewBar = ({ count, onReview }) => {
  const disabled = count === 0;
  const label =
    count === 0
      ? 'Nothing selected yet'
      : `${count} ${count === 1 ? 'item' : 'items'} in your list`;

  return (
    <div
      className="absolute left-0 right-0 bottom-0 pt-7 px-4 pb-3"
      style={{ background: 'linear-gradient(180deg, transparent, var(--color-background) 40%)' }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5 bg-surface border border-default rounded-2xl">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-muted">Ready when you are</div>
          <div className="text-sm font-medium text-body mt-0.5 truncate">{label}</div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onReview}
          className="px-4 py-2.5 rounded-xl bg-primary text-white hover:bg-primary-hover disabled:bg-muted disabled:cursor-not-allowed font-semibold text-sm flex items-center gap-1.5"
        >
          Review <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default ReviewBar;
```

- [ ] **Step 4: Run the test** — expect PASS.

- [ ] **Step 5: Commit**:
```bash
git add src/components/staples/ReviewBar.js src/components/staples/ReviewBar.test.js
git commit -m "feat(staples): add fixed-position ReviewBar"
```

---

## Task 7: `useWeekStaples` hook

Owns the data layer: fetch on mount, per-tap toggle (fires `selection_check`/`selection_uncheck`), quick-add (fires `add_oneoff_item`), remove (fires `remove_weekly_item`). Returns `{ items, selected, loading, error, toggle, quickAdd, removeOneOff }`.

Toggle is optimistic — mutate local `selected` immediately, roll back on API failure.

**Files:**
- Create: `src/hooks/useWeekStaples.js`
- Create: `src/hooks/useWeekStaples.test.js`

- [ ] **Step 1: Write the failing test**:

```js
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import useWeekStaples from './useWeekStaples';

// Mock the API module
jest.mock('../config/api', () => {
  const actual = jest.requireActual('../config/api');
  return {
    ...actual,
    apiFetch: jest.fn(),
  };
});
const { apiFetch, ENDPOINTS } = require('../config/api');

const mockItems = [
  { ItemID: 1, ItemName: 'Milk',  Category: 'Dairy & eggs', DataSource: 'Staples',         IsSelected: 1, QuantitySelected: 1 },
  { ItemID: 2, ItemName: 'Bread', Category: 'Bakery & bread', DataSource: 'Staples',       IsSelected: 0, QuantitySelected: 1 },
  { ItemID: 9, ItemName: 'Balloons', Category: 'Household & other', DataSource: 'OneOff',  IsSelected: 1, QuantitySelected: 1 },
];

beforeEach(() => {
  apiFetch.mockReset();
});

const mockOk = (body) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });

describe('useWeekStaples', () => {
  test('loads items and seeds selected from IsSelected', async () => {
    apiFetch.mockImplementationOnce(() => mockOk(mockItems));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(3);
    expect(result.current.selected.has(1)).toBe(true);
    expect(result.current.selected.has(2)).toBe(false);
    expect(result.current.selected.has(9)).toBe(true);
  });

  test('toggle adds id to selected and POSTs selection_check', async () => {
    apiFetch.mockImplementationOnce(() => mockOk(mockItems)); // initial fetch
    apiFetch.mockImplementationOnce(() => mockOk({ success: true })); // toggle
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggle(2); });
    expect(result.current.selected.has(2)).toBe(true);
    const callUrl = apiFetch.mock.calls[1][0];
    expect(callUrl).toBe(ENDPOINTS.selectionCheck);
  });

  test('toggle removes id from selected and POSTs selection_uncheck', async () => {
    apiFetch.mockImplementationOnce(() => mockOk(mockItems));
    apiFetch.mockImplementationOnce(() => mockOk({ success: true }));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggle(1); });
    expect(result.current.selected.has(1)).toBe(false);
    expect(apiFetch.mock.calls[1][0]).toBe(ENDPOINTS.selectionUncheck);
  });

  test('toggle rolls back on API failure', async () => {
    apiFetch.mockImplementationOnce(() => mockOk(mockItems));
    apiFetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500 }));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggle(2); });
    expect(result.current.selected.has(2)).toBe(false);
  });

  test('quickAdd appends a one-off and marks it selected', async () => {
    apiFetch.mockImplementationOnce(() => mockOk(mockItems));
    apiFetch.mockImplementationOnce(() =>
      mockOk({ success: true, itemId: 7777, itemName: 'Candles' })
    );
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.quickAdd('Candles'); });
    const added = result.current.items.find((i) => i.ItemName === 'Candles');
    expect(added).toBeTruthy();
    expect(added.DataSource).toBe('OneOff');
    expect(result.current.selected.has(added.ItemID)).toBe(true);
  });

  test('removeOneOff deletes from items and selected, POSTs remove_weekly_item', async () => {
    apiFetch.mockImplementationOnce(() => mockOk(mockItems));
    apiFetch.mockImplementationOnce(() => mockOk({ success: true }));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.removeOneOff(9); });
    expect(result.current.items.find((i) => i.ItemID === 9)).toBeUndefined();
    expect(result.current.selected.has(9)).toBe(false);
    expect(apiFetch.mock.calls[1][0]).toBe(ENDPOINTS.removeWeeklyItem);
  });
});
```

- [ ] **Step 2: Run the test** — expect FAIL.

- [ ] **Step 3: Implement `useWeekStaples.js`**:

```js
import { useState, useEffect, useCallback } from 'react';
import { ENDPOINTS, apiFetch, showApiError } from '../config/api';
import { getWeekDates } from '../utils/weekDates';

const useWeekStaples = () => {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const weekData = getWeekDates();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(ENDPOINTS.fetchGroceryItems);
        url.searchParams.append('weekStartDate', weekData.startDate);
        url.searchParams.append('weekEndDate', weekData.endDate);
        url.searchParams.append('weekDateRange', weekData.displayRange);
        const res = await apiFetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setItems(data);
        const sel = new Set();
        data.forEach((it) => { if (it.IsSelected === 1) sel.add(it.ItemID); });
        setSelected(sel);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        showApiError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [weekData.startDate, weekData.endDate, weekData.displayRange]);

  const toggle = useCallback(async (itemId) => {
    const wasSelected = selected.has(itemId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (wasSelected) next.delete(itemId); else next.add(itemId);
      return next;
    });
    const endpoint = wasSelected ? ENDPOINTS.selectionUncheck : ENDPOINTS.selectionCheck;
    const payload = wasSelected
      ? { itemId, weekDateRange: weekData.displayRange }
      : { itemId, weekDateRange: weekData.displayRange, quantitySelected: 1 };
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // roll back
      setSelected((prev) => {
        const next = new Set(prev);
        if (wasSelected) next.add(itemId); else next.delete(itemId);
        return next;
      });
      showApiError(err);
    }
  }, [selected, weekData.displayRange]);

  const quickAdd = useCallback(async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await apiFetch(ENDPOINTS.addOneOffItem, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ itemName: trimmed, weekDateRange: weekData.displayRange }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const newId = data.itemId || `oneoff_${Date.now()}`;
      const newItem = {
        ItemID: newId,
        ItemName: trimmed,
        Category: 'Household & other',
        DataSource: 'OneOff',
        Type: 'OneOff',
        IsSelected: 1,
        QuantitySelected: 1,
      };
      setItems((prev) => [...prev, newItem]);
      setSelected((prev) => new Set(prev).add(newId));
    } catch (err) {
      showApiError(err);
    }
  }, [weekData.displayRange]);

  const removeOneOff = useCallback(async (itemId) => {
    const target = items.find((i) => i.ItemID === itemId);
    if (!target) return;
    try {
      const res = await apiFetch(ENDPOINTS.removeWeeklyItem, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ itemName: target.ItemName, weekDateRange: weekData.displayRange }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((i) => i.ItemID !== itemId));
      setSelected((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
    } catch (err) {
      showApiError(err);
    }
  }, [items, weekData.displayRange]);

  return { items, selected, loading, error, toggle, quickAdd, removeOneOff };
};

export default useWeekStaples;
```

- [ ] **Step 4: Run the test** — expect PASS.

- [ ] **Step 5: Commit**:
```bash
git add src/hooks/useWeekStaples.js src/hooks/useWeekStaples.test.js
git commit -m "feat(staples): add useWeekStaples hook with per-tap persistence"
```

---

## Task 8: `StaplesScreen` container

Assembles everything. Groups items by category using the canonical order from `src/constants/categories.js`. Renders `OneOffCard` for `DataSource === 'OneOff'` items. Hides meal-ingredient items for Phase 1 (they land in Phase 2's `MealsCard`). Applies the search filter client-side.

**Files:**
- Create: `src/components/StaplesScreen.js`
- Create: `src/components/StaplesScreen.test.js`

- [ ] **Step 1: Write the failing test**:

```js
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StaplesScreen from './StaplesScreen';

jest.mock('../hooks/useWeekStaples');
const useWeekStaples = require('../hooks/useWeekStaples').default;

const baseHook = {
  items: [
    { ItemID: 1, ItemName: 'Milk',    Category: 'Dairy & eggs',     DataSource: 'Staples' },
    { ItemID: 2, ItemName: 'Bread',   Category: 'Bakery & bread',   DataSource: 'Staples' },
    { ItemID: 9, ItemName: 'Candles', Category: 'Household & other',DataSource: 'OneOff' },
  ],
  selected: new Set([1, 9]),
  loading: false,
  error: null,
  toggle: jest.fn(),
  quickAdd: jest.fn(),
  removeOneOff: jest.fn(),
};

beforeEach(() => {
  useWeekStaples.mockReturnValue(baseHook);
});

describe('StaplesScreen', () => {
  test('renders the title', () => {
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByText(/grocery staples/i)).toBeInTheDocument();
  });

  test('renders category sections for non-one-off items', () => {
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByText('Dairy & eggs')).toBeInTheDocument();
    expect(screen.getByText('Bakery & bread')).toBeInTheDocument();
  });

  test('renders one-offs in the OneOffCard, not in a category', () => {
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByText('One-offs this week')).toBeInTheDocument();
    expect(screen.getByText('Candles')).toBeInTheDocument();
  });

  test('running count shows selected count', () => {
    render(<StaplesScreen onReview={() => {}} />);
    // 2 items selected (ItemID 1, ItemID 9)
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('ReviewBar shows correct total', () => {
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByText(/2 items in your list/i)).toBeInTheDocument();
  });

  test('loading state renders a spinner', () => {
    useWeekStaples.mockReturnValue({ ...baseHook, loading: true, items: [], selected: new Set() });
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test** — expect FAIL.

- [ ] **Step 3: Implement `StaplesScreen.js`**:

```js
import React, { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import useWeekStaples from '../hooks/useWeekStaples';
import { getWeekDates } from '../utils/weekDates';
import { GROCERY_CATEGORIES } from '../constants/categories';
import InputToolbar from './staples/InputToolbar';
import CategorySection from './staples/CategorySection';
import OneOffCard from './staples/OneOffCard';
import ReviewBar from './staples/ReviewBar';

const formatMonthDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
};

const StaplesScreen = ({ onReview }) => {
  const { items, selected, loading, toggle, quickAdd, removeOneOff } = useWeekStaples();
  const [query, setQuery] = useState('');
  const weekData = getWeekDates();
  const weekCompact = `${formatMonthDay(weekData.startDate)} – ${formatMonthDay(weekData.endDate)}`;

  const { groups, oneOffs } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (i) => !q || i.ItemName.toLowerCase().includes(q);

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

    return { groups: ordered, oneOffs: oneOffsList };
  }, [items, query]);

  const handleToggleAll = (group) => {
    const ids = group.items.map((i) => i.ItemID);
    const allSelected = ids.every((id) => selected.has(id));
    ids.forEach((id) => {
      const isOn = selected.has(id);
      if (allSelected && isOn) toggle(id);
      else if (!allSelected && !isOn) toggle(id);
    });
  };

  const totalSelected = selected.size;

  if (loading) {
    return (
      <div className="relative h-full bg-background">
        <div className="flex items-center justify-center h-full">
          <div role="status" className="animate-spin rounded-full h-10 w-10 border-2 border-default border-t-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-background">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-32">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-6 h-6 rounded-full border-2 border-primary flex items-center justify-center flex-shrink-0">
            <Check size={12} className="text-primary" strokeWidth={3} />
          </div>
          <h1 className="text-lg font-extrabold text-heading">Grocery Staples</h1>
          <span className="ml-auto text-xs font-semibold text-primary px-2.5 py-1 rounded-full bg-primary-light border border-primary-border whitespace-nowrap">
            {weekCompact}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted mb-3">
          <span className="text-heading font-bold">{totalSelected}</span>
          <span>{totalSelected === 1 ? 'item' : 'items'}</span>
        </div>

        <InputToolbar onQuickAdd={quickAdd} onSearchChange={setQuery} />

        {oneOffs.length > 0 && (
          <OneOffCard
            oneOffs={oneOffs}
            selected={selected}
            onToggle={toggle}
            onRemove={removeOneOff}
          />
        )}

        {groups.length === 0 && oneOffs.length === 0 && (
          <div className="mt-10 text-center text-sm text-muted">
            {query ? `No matches for "${query}"` : 'Nothing on this week\'s list yet'}
          </div>
        )}

        {groups.map((g) => (
          <CategorySection
            key={g.name}
            group={g}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => handleToggleAll(g)}
          />
        ))}
      </div>

      <ReviewBar count={totalSelected} onReview={onReview} />
    </div>
  );
};

export default StaplesScreen;
```

- [ ] **Step 4: Run the test** — expect PASS.

- [ ] **Step 5: Commit**:
```bash
git add src/components/StaplesScreen.js src/components/StaplesScreen.test.js
git commit -m "feat(staples): add StaplesScreen container"
```

---

## Task 9: Rewire `Plan.js` to use `StaplesScreen`

The Plan tab currently delegates to `GroceryChecklist`. Swap the delegate. Review CTA navigates to `#shop`.

**Files:**
- Modify: `src/components/Plan.js`

- [ ] **Step 1: Read the current file** to confirm props:

```bash
cat src/components/Plan.js
```

- [ ] **Step 2: Replace the file** with:

```js
import React from 'react';
import StaplesScreen from './StaplesScreen';

const Plan = ({ onNavigate }) => {
  return <StaplesScreen onReview={() => onNavigate('shop')} />;
};

export default Plan;
```

- [ ] **Step 3: Run the existing App test** to confirm nothing breaks:

```bash
npm test -- --watchAll=false src/components/App.test.js
```

Expected: PASS (App.test.js smoke-tests rendering, not Plan internals).

- [ ] **Step 4: Run the full test suite**:

```bash
npm test -- --watchAll=false
```

Expected: all tests pass.

- [ ] **Step 5: Commit**:

```bash
git add src/components/Plan.js
git commit -m "feat(staples): wire Plan tab to new StaplesScreen"
```

---

## Task 10: Manual verification + end-of-phase commit

- [ ] **Step 1: Start the dev server**:

```bash
npm start
```

- [ ] **Step 2: Navigate to `#plan` and verify the following checklist** in a browser. Tick each one:

  - Screen title "Grocery Staples" + green week pill render.
  - Running count ("N items") reflects the DB state on load.
  - Each category renders as a sticky-header section, in the canonical order from `GROCERY_CATEGORIES`.
  - Tapping a checkbox in any category: toast-free, instantly flips the state; refresh the browser — the change persists (i.e. the `selection_check` / `selection_uncheck` webhook fired and the DB was updated).
  - Tapping a category's `All`/`Clear` button toggles the whole group; each toggled item fires its own webhook (confirm in Network tab).
  - Quick-add: type a name, press Enter or click Add. A new row appears in the "One-offs this week" card, checked by default. Refresh — it survives (DB row exists).
  - Trash icon on a one-off: removes it from the list; refresh confirms it's gone from the DB.
  - Search icon → search mode. Typing filters the list. Clearing (X) returns to quick-add mode.
  - Empty search: "No matches for …" message appears.
  - Review button disabled when count is 0. Enable it by selecting an item; clicking Review navigates to `#shop`.
  - Legacy `#grocery` hash still redirects to `#plan` (no regression).

- [ ] **Step 3: Run the full test suite a final time** to confirm nothing regressed:

```bash
npm test -- --watchAll=false
```

- [ ] **Step 4: If all green, commit the `design_handoff_staples/` folder** (prototype + audit + plan — kept in repo for history):

```bash
git add design_handoff_staples/
git commit -m "docs(staples): archive design handoff + audit + Phase 1 plan"
```

- [ ] **Step 5: Push the branch**:

```bash
git push -u origin feature/staples-redesign
```

---

## Open follow-ups (not in Phase 1)

- **Phase 2:** Meal pills + `MealsCard` — requires ALTER TABLE `WeeklyGroceryList ADD COLUMN MealName VARCHAR(255)` + backfill via the existing meal-ingredients insert workflow. New component: `src/components/staples/MealPillBar.js` + `MealsCard.js`. New CSS var for the periwinkle meal color (`--color-meal: #8B9EE8` / dark variant).
- **Phase 3:** Delete `GroceryChecklist.js`, drop the `Type` and `Group-by-Store` legacy filters from `api.js` if unused, add `aria-live="polite"` to the running count strip, keyboard-navigable meal pill bar.

---

## Test running reference

```bash
# Single test file
npm test -- --watchAll=false src/path/to/file.test.js

# Full suite
npm test -- --watchAll=false

# Watch mode
npm test
```

Linter runs on build; CI treats warnings as errors — remove unused imports immediately.
