# Grocery Staples Redesign — Architectural Audit

## 1. Summary

The redesign is **behaviorally 70% of what [GroceryChecklist.js](src/components/GroceryChecklist.js) already does** (quick-add, search toggle, bulk select, DataSource filter, per-category grouping) but **architecturally a different screen**. The two biggest deltas are (a) per-meal lensing pills, which require persisted `MealName` that does not exist today, and (b) a single-scroll sticky-header layout, which replaces today's one-category-at-a-time tab model. A third notable gap is the prototype's implied per-tap toggle persistence, which the current app does not do — selection is local state until the user clicks "Review". Net-new code is roughly one container + 4 presentational children, one new hook, and one backend change (either a new join endpoint or a `MealName` column on `WeeklyGroceryList`). Expected touch surface: `GroceryChecklist.js` replaced, `Plan.js` rewritten, `api.js` extended, 1–2 new n8n workflows. Biggest risks are the meal-lens data model and the styling system mismatch — the prototype is all inline styles against a hard-coded dark `ST` palette, while the real app is Tailwind + CSS-var tokens with a light-default/dark-toggle theme.

## 2. Audit by Dimension

### 2a. Data model

- Existing item shape ([GroceryChecklist.js:254–267](src/components/GroceryChecklist.js#L254-L267), [fallbackData.js:6–13](src/utils/fallbackData.js#L6-L13)): `{ ItemID, ItemName, Category, Store, Type, DataSource, IsSelected, QuantitySelected, Unit, GroceryStoreSection, IsActive }`. Backed by MySQL `WeeklyGroceryList`.
- Field-by-field vs prototype (`S_ITEMS`):
  - `ItemID`, `ItemName`, `Category`, `Store`, `Type` — **match**.
  - `DataSource` — **matches**, same string values (`'Staples' | 'MealIngredients' | 'OneOff'`). Enumerated at [GroceryChecklist.js:1364](src/components/GroceryChecklist.js#L1364).
  - `MealName` — **absent in DB**. The prototype assumes every `MealIngredients` item carries its parent meal name. Today the meal origin is only constructed transiently inside [RecipeIngredients.js:196](src/components/RecipeIngredients.js#L196) and is never written back. This is the single most consequential gap.
- Meal ↔ item cardinality: prototype supports many-meals-per-item (`m.itemIds.includes(i.ItemID)`). Nothing in the real DB expresses this relation at all.
- Per-week selected list: already DB-backed via the `IsSelected` column. No separate `selected` set — it's a field on the item row.
- One-offs: already first-class. `add_oneoff_item` n8n workflow (ID: `ONzUncTlldVW6qJ1`) inserts into `WeeklyGroceryList` with `DataSource='OneOff'`. See [GroceryChecklist.js:558–608](src/components/GroceryChecklist.js#L558-L608).

### 2b. State management

| Prototype state | Maps to | Where it lives |
|---|---|---|
| `selected: Set<ItemID>` | `selectedItems: Set<string>` — [GroceryChecklist.js:100](src/components/GroceryChecklist.js#L100) | Local, seeded from `IsSelected`, persisted in bulk on "Review" via `createGroceryList` |
| `query` | `searchQuery` — [GroceryChecklist.js:1272](src/components/GroceryChecklist.js#L1272) | Component-local, ephemeral |
| `quickAdd` | `quickAddText` — existing [GroceryChecklist.js:1292](src/components/GroceryChecklist.js#L1292) | Component-local, ephemeral |
| `oneOffs: Array` | No separate state — one-offs are merged into `groceryData` as items with `DataSource='OneOff'` | DB-persisted, survives reload |
| `mealFocus: null \| mealName` | **New** — no analogue | Propose local state; does not need URL persistence for v1 |
| `mode: 'quickAdd' \| 'search'` | `searchExpanded` — [GroceryChecklist.js:1265](src/components/GroceryChecklist.js#L1265) | Local, ephemeral |

Survival flags:
- **Persist**: `selected`, one-offs (already DB-backed).
- **Ephemeral**: `query`, `quickAdd`, `mode`, `mealFocus`. Losing them on navigation is expected.
- **Resurrect on reload** (not in prototype but worth flagging): shopping progress for `#shop` already lives in the `shopping_progress` table — the Plan selection does NOT use that pattern today.

### 2c. Component inventory

| Prototype | Existing analogue | File:line | Verdict |
|---|---|---|---|
| `V5_BestOf` (container) | `GroceryChecklist` | [GroceryChecklist.js:94](src/components/GroceryChecklist.js#L94) | **Build fresh** (rewrite). Current layout is tab-per-category — prototype is single-scroll with sticky headers. Different mental model. |
| Input toolbar | Quick-add + search row | [GroceryChecklist.js:1263–1318](src/components/GroceryChecklist.js#L1263-L1318) | **Reuse logic, reshape markup**. Same `mode` toggle, same `parseQuickAdd` — just swap Tailwind classes for the prototype's visual spec. |
| `MealTab` (pill) | Only a flat Source toggle — [GroceryChecklist.js:1361–1378](src/components/GroceryChecklist.js#L1361-L1378) | **Build fresh**. No per-meal pill exists. Requires meal list input. |
| `MealsCard` | None | — | **Build fresh**. No grouped-by-meal render path today; `MealIngredients` items appear inline. |
| `OneOffCard` | No dedicated card (inline in list) | — | **Build fresh** — but trivial once `DataSource='OneOff'` filter is applied. |
| `V5CategorySection` | Inline category block + Select All — [GroceryChecklist.js:1441–1508](src/components/GroceryChecklist.js#L1441-L1508) | **Extend**. Bulk-toggle logic reusable verbatim; sticky positioning + compact header is net-new styling. |
| `ItemRow` | `GroceryItem` (memoized, native checkbox + `<label>`) — [GroceryChecklist.js:27–90](src/components/GroceryChecklist.js#L27-L90) | **Extend**. Existing row already does the right semantic thing; drop `<select>` qty and `<Trash2>` controls per prototype. No swipe actions to worry about. |
| Bottom Review bar | Inline submit button — [GroceryChecklist.js:1515–1521](src/components/GroceryChecklist.js#L1515-L1521) | **Build fresh**. Prototype's fixed-position bar with preview text is a new chrome element. |

### 2d. Routing & navigation

- Lives at hash `#plan` → rendered via [Plan.js:1–24](src/components/Plan.js#L1-L24) (thin wrapper around GroceryChecklist). Bottom tab bar ([BottomTabBar.js:13–20](src/components/BottomTabBar.js#L13-L20)) shows **six** tabs: Plan · Meals · Deals · Cart · Shop · Cook (note: [MEMORY.md](c:/Users/Corey/.claude/projects/c--New-Grocery-App-grocery-checklist-app/memory/MEMORY.md) says 5, it's stale).
- "Review" target is ambiguous. Current flow: `handleSubmit` → `showFinalList: true` (inline same-component review) → "Start Shopping" → `#shop`. The prototype's Review CTA most naturally maps to either (a) the inline review list, or (b) `#cart` (HebCart), or (c) `#shop` (InStoreMode). **Needs user decision** (see Q4).
- Back behavior: hash-based, no scroll restoration, no meal-focus-in-URL today. Meal focus would reset on back. Acceptable for v1.

### 2e. API & backend contracts

| Need | Endpoint | Status |
|---|---|---|
| Fetch current-week list | `GET /fetch_grocery_items` ([api.js:19](src/config/api.js#L19)) | **EXISTS** |
| Toggle item selection (per-tap) | None — only bulk `POST /create_grocery_list` ([api.js:22](src/config/api.js#L22)) | **MISSING**. Closest pattern is `shoppingProgressCheck`/`Uncheck` ([api.js:45–46](src/config/api.js#L45-L46)); would need a twin `selection_check`/`selection_uncheck` pair if we want prototype's implied per-tap persistence. |
| Add one-off | `POST /add_oneoff_item` ([api.js:102](src/config/api.js#L102)) | **EXISTS** |
| Remove one-off | `POST /remove_weekly_item` by `{itemName, weekDateRange}` ([api.js:23](src/config/api.js#L23)) | **PARTIAL** — matches by name, not ID. Fine as long as per-week names are unique. |
| Search staples | Client-side filter, 97 items | **N/A** — no endpoint needed. |
| Fetch meals with their item IDs | None (`normalizeDbMeals` stubs `ingredients: []` — [api.js:228](src/config/api.js#L228)) | **MISSING**. Required for meal pills. Either a new `/fetch_weekly_meal_items` endpoint returning `[{mealName, itemIds}]`, or extend `fetch_grocery_items` to include a per-item `MealName` column. The column approach is simpler — one change, no N+1 — **recommended**. |

### 2f. Migration

- Old screen: `GroceryChecklist` tab-per-category UI. Keep during a phased rollout; the hash `#grocery` still redirects to `#plan` via `LEGACY_REDIRECT`.
- Data: no schema migration needed if we use a client-side join (fetch meals via `fetch_weekly_meals`, then a new `fetch_weekly_meal_items` join). If we pick the MealName column route, one ALTER TABLE `WeeklyGroceryList ADD COLUMN MealName VARCHAR(255)` plus backfill from the existing meal-ingredients insert workflow.
- No feature flag infrastructure present — keep both implementations mounted behind a local boolean for a week of self-testing, then delete the old `GroceryChecklist` body.

### 2g. Performance

- ~97 items total. No virtualization needed; none exists in the codebase anyway.
- Current `GroceryItem` is `React.memo`'d ([GroceryChecklist.js:27](src/components/GroceryChecklist.js#L27)). Carry that forward — meal-pill toggles will re-render the whole list otherwise.
- Search filter: sync, single pass over 97 items — no debounce needed.
- Meals card: re-renders on every toggle. `useMemo` over `mealItems` keyed by `(selected.size, mealFocus)` is sufficient.

### 2h. Accessibility

- Existing `GroceryItem` uses native `<input type="checkbox">` + `<label htmlFor>` — **semantically correct**. Do not regress to the prototype's `<div onClick>` rows.
- Remove button has `aria-label` ([GroceryChecklist.js:84](src/components/GroceryChecklist.js#L84)). Category "Select All" ([GroceryChecklist.js:1449](src/components/GroceryChecklist.js#L1449)) has visible text but no category-scoped aria-label — minor gap, carry forward.
- Focus management when search toggles in: already implemented via `searchInputRef` ([GroceryChecklist.js:1309](src/components/GroceryChecklist.js#L1309)) — reuse.
- Running count strip + meal pills need `aria-live="polite"` on the count text so the totals are announced.
- Horizontal meal-pill bar: keyboard left/right-arrow nav is a small add — give the container `role="tablist"` only if meal pills behave like tabs (they do, mutually-exclusive-ish).

### Styling — the biggest integration risk (flagged separately)

- Existing app: Tailwind JIT + CSS custom properties (index.css) + semantic tokens ([tokens.js](src/styles/tokens.js)) + `THEMES.green/amber` objects ([tokens.js:79–133](src/styles/tokens.js#L79-L133)). Dark mode via `.dark` class on `<html>`, toggled by [ThemeContext.js](src/contexts/ThemeContext.js).
- Prototype: 100% inline `style={{}}` with hardcoded hex (`ST` object, [staples-shared.jsx:4–26](design_handoff_staples/source/staples-shared.jsx#L4-L26)). Dark-only.
- New color token: `ST.meal` (periwinkle `#8B9EE8`) — no current equivalent. Needs a new CSS var (e.g. `--meal` / `--meal-light`) in both light and dark blocks of `index.css`, surfaced as `bg-meal` / `text-meal` in `tailwind.config.js`.
- Policy: **port to Tailwind classes, not inline styles**. The `ST` palette is a design-time reference, not a runtime artifact — don't introduce a second token system.

## 3. File/Folder Plan

Current convention is flat `src/components/` + shared `src/constants`, `src/hooks`, `src/utils`. No `src/features/` directory exists. Match the current convention:

```
src/components/
├── StaplesScreen.js              ← NEW, replaces Plan.js body (Plan.js becomes trivial re-export or is deleted)
├── staples/
│   ├── InputToolbar.js           ← NEW (quick-add + search toggle — split from GroceryChecklist)
│   ├── MealPillBar.js            ← NEW
│   ├── MealsCard.js              ← NEW
│   ├── OneOffCard.js             ← NEW
│   ├── CategorySection.js        ← NEW (sticky header variant)
│   ├── ItemRow.js                ← extracted from GroceryChecklist (rename of GroceryItem)
│   └── ReviewBar.js              ← NEW (fixed bottom bar)
src/hooks/
├── useWeekStaples.js             ← NEW (fetch + toggle + one-off helpers)
└── useMealFocus.js               ← NEW (local UI state only)
src/config/
└── api.js                        ← extended: add fetchWeeklyMealItems if we go join-endpoint route
src/constants/
└── categories.js                 ← already has the canonical 14 categories — reuse verbatim
```

Name collisions: `GroceryItem` already exists — rename to `ItemRow` to match the prototype vocabulary. No other collisions. `GroceryChecklist.js` stays around for legacy `#grocery` route during rollout; delete after cutover.

## 4. Open Questions

1. **Meal origin persistence.** Preferred: add `MealName` column to `WeeklyGroceryList` and have the meal-ingredients insert workflow write it. Alternative: a new `/fetch_weekly_meal_items` endpoint that returns `[{mealName, itemIds}]`. The column is simpler; the join endpoint preserves normalization. Which do you want?
2. **Per-tap toggle persistence.** The prototype implies every tap persists (no explicit "Save" step). Today the Plan screen bulk-saves on Review. Match shopping_progress pattern (add `selection_check` / `selection_uncheck`), or keep the bulk-save-on-Review model?
3. **One-off removal.** Prototype's `onRemove` deletes locally only. Should tapping the trash icon on a one-off call `/remove_weekly_item` immediately?
4. **"Review" navigation target.** The CTA — does it (a) show the current inline review list, (b) jump to `#cart` (HebCart builder), or (c) jump to `#shop` (InStoreMode)?
5. **Filters dropped.** Prototype removes the Type filter (Basic/Periodic) and the Group-by-Store toggle. Confirmed OK, or keep either as a secondary control?
6. **Meal pill visibility.** Show pills even in weeks where no meals are planned? (Empty meal list → pill bar collapses to just "All items"?)
7. **MealsCard collapsibility.** PROMPT flags this as open. My read: keep it collapsible (low cost, matches prototype).

## 5. Proposed Phases

Three shippable slices:

- **Phase 1 — Shell + row-level parity.** Build the new `StaplesScreen` with single-scroll sticky-header layout, input toolbar, category sections, bottom bar. No meal pills, no meals card. Data fetched from existing `fetch_grocery_items`. Behavior should match today's Plan tab plus the new layout. Cutover `#plan` to point here; keep `GroceryChecklist` mounted at `#grocery` for fallback. **~1 day of work.**

- **Phase 2 — Meal pills + MealsCard.** Add `MealName` column (Q1 decision) and backfill workflow. Fetch meals; render meal pills; render `MealsCard` grouped by meal; wire `mealFocus` lensing. **~1 day of work after backend migration.**

- **Phase 3 — Per-tap persistence + polish.** If Q2 goes to per-tap: add `selection_check`/`selection_uncheck` webhooks and wire them. One-off removal endpoint (Q3). a11y: `aria-live` count strip, keyboard nav for pill bar. Delete legacy `GroceryChecklist`. **~half day.**

Each phase is independently deployable and independently testable. Phase 1 is the forcing function that tells us whether any layout assumptions break; Phase 2 is where the DB migration lands; Phase 3 is polish.
