# Backlog Bug Fix Design — All 15 Remaining Audit Items

**Date:** 2026-03-08
**Scope:** BUG-006 through BUG-021 + database housekeeping
**Prerequisite:** BUG-001 through BUG-005 already fixed (see `docs/2026-03-08-full-stack-audit.md`)

---

## Batch 1: Shared Infrastructure

### BUG-013 — Extract `useClipCoupons()` hook

**Problem:** Identical SSE clipping logic (POST to `/api/clip`, EventSource to `/api/clip-progress`) copy-pasted across 3 files: Deals.js, SmartDeals.js, CouponMatchPanel.js. ~250 lines duplicated.

**Design:**
- Create `src/hooks/useClipCoupons.js` — custom hook encapsulating:
  - `clipSelected(couponIds)` — POST to clip server, open SSE, track progress
  - `clipProgress` — `{ current, total, results[] }` state
  - `clipError` — error string or null
  - `isClipping` — boolean
  - `clipComplete` — boolean with summary
  - Automatic EventSource cleanup on unmount (ref-based)
  - `resetClipState()` — clear all clip state for reuse
- Refactor all 3 consumers to use the hook
- SmartDeals.js and CouponMatchPanel.js gain EventSource cleanup they were missing

**Interface:**
```javascript
const {
  clipSelected,    // (couponIds: string[]) => Promise<void>
  clipProgress,    // { current: number, total: number, results: ClipResult[] }
  clipError,       // string | null
  isClipping,      // boolean
  clipComplete,    // { clipped: number, failed: number, alreadyClipped: number } | null
  resetClipState,  // () => void
} = useClipCoupons();
```

---

## Batch 2: Error Handling & Resilience

### BUG-006 — Client-side expiration filter for cached smart deals

**Problem:** Smart deals cache has 1hr TTL. Coupons expiring within that hour still appear.

**Design:** In Home.js and Deals.js, after receiving smart deals response, filter out deals where `coupon.expirationDate < today`. Simple client-side post-filter — no backend change needed.

### BUG-007 — HebCart search failure feedback

**Problem:** Batch searches returning 0 results (WAF block, stale session) silently break out of loop.

**Design:**
- Add `searchWarning` state to HebCart.js
- When batch search returns 0 results or errors, set warning: "Some items couldn't be searched — try ending and restarting your HEB session"
- Show dismissible warning banner above match results
- Track `skippedItems[]` so user knows which items were missed

### BUG-008 — Match save confirmation with retry

**Problem:** Match saves use `.catch(() => {})` — completely silent failures.

**Design:**
- Await the save call, show toast on failure with retry button (using existing `showApiError` pattern from `api.js`)
- On success, brief success toast: "Matches saved"
- Add `isSaving` state to disable confirm button during save

### BUG-009 — Retry on ChatBot/MealCreator webhook failures

**Problem:** Network blip kills the interaction; user must re-type.

**Design:**
- Store last request payload in ref before sending
- On failure, show error toast with "Retry" button (using `showApiError`)
- Retry button re-sends the stored payload
- Add to both ChatBot.js and MealCreator.js

### BUG-011 — Coupon reminder failure indicator in InStoreMode

**Problem:** If `hebWeeklyItems` fetch fails, coupon reminders silently disappear.

**Design:**
- Add `couponLoadFailed` state
- Show subtle inline text at bottom of item list: "⚠ Coupon reminders unavailable"
- Non-intrusive since coupon reminders are supplementary info

### BUG-017 — Clip error banner auto-dismiss and tab-clear

**Problem:** `clipError` state only cleared on new clip start, not on tab switch.

**Design:**
- Clear `clipError` when switching between Smart Deals / All Coupons tabs
- Add auto-dismiss after 8 seconds
- Add dismiss "×" button on error banner
- Now handled inside `useClipCoupons()` hook's `resetClipState()`

---

## Batch 3: UX Polish

### BUG-010 — Persist Plan.js tab state

**Problem:** Navigating away from Plan and returning resets to "Grocery List" tab.

**Design:**
- On tab change, save to `localStorage` key `planTabState` (value: `{ activeTab, mealMode }`)
- On mount, restore from localStorage
- No week-keying needed — tab preference is user preference, not data

### BUG-014 — Home.js loading skeletons

**Problem:** Badges flash "0" then update when data loads.

**Design:**
- When `listItems === null` (loading), show pulsing placeholder instead of "0"
- Use Tailwind `animate-pulse bg-white/30 rounded` placeholder divs
- Replace stat values with placeholder only while their specific fetch is pending

### BUG-015 — Week boundary detection in Home.js

**Problem:** If user is on Home at midnight Monday, data goes stale.

**Design:**
- Add `setInterval` (every 60 seconds) that compares current `getWeekDates().startDate` against the one captured on mount
- If different, reload data (re-run all fetches)
- Clear interval on unmount

### BUG-016 — Refresh groceryListData after GroceryChecklist changes

**Problem:** GroceryChecklist creates weekly list via webhook but parent Plan.js doesn't know.

**Design:**
- Pass `onListChanged` callback from Plan.js to GroceryChecklist
- GroceryChecklist calls it after successful webhook operations (create list, add item, deactivate)
- Plan.js re-fetches `groceryListData` when callback fires
- This ensures ChatBot tab sees current data

### BUG-018 — ISO date comparison for week detection in InStoreMode

**Problem:** Week change detection compares display strings like "Mar 3-9, 2026".

**Design:**
- Change comparison to use `getWeekDates().startDate` (ISO format `YYYY-MM-DD`) instead of `displayRange`
- Store `startDate` in localStorage alongside shopping list data
- Compare against current `startDate` on load

### BUG-019 — Persist swipe hint with localStorage

**Problem:** Swipe hint reappears every browser session.

**Design:**
- Change `sessionStorage.getItem('swipeHintShown')` → `localStorage.getItem('swipeHintShown')`
- Same for `setItem`. One-line change.

### BUG-020 — Cancel auto-advance on manual navigation

**Problem:** 500ms auto-advance delay can conflict with manual navigation.

**Design:**
- In manual next/prev handlers, clear `autoAdvanceTimeoutRef.current` via `clearTimeout()`
- Ensures user action always takes priority over auto-advance

### BUG-021 — "Load more" pagination for coupons

**Problem:** 748+ coupons rendered at once, potential jank.

**Design:**
- Add `visibleCount` state, default 50
- Slice `filteredCoupons` to `visibleCount` for rendering
- "Show more" button at bottom loads next 50
- Reset `visibleCount` to 50 when search/filter changes
- Zero new dependencies

---

## Database Housekeeping

### Clean expired coupons
```sql
DELETE FROM heb_coupons WHERE expiration_date < CURDATE() AND is_active = 0;
```
Run via MySQL MCP. Expected: ~975 rows removed.

### Migrate expiration_date VARCHAR → DATE
- Create n8n migration workflow (Manual Trigger → MySQL)
- SQL: `ALTER TABLE heb_coupons MODIFY COLUMN expiration_date DATE NULL;`
- Existing YYYY-MM-DD strings will auto-convert
- Update n8n Fetch HEB Coupons workflow SQL if needed (DATE comparison is native, no change needed)
- Update scraper INSERT to use DATE format (already YYYY-MM-DD, no change needed)

---

## Files Changed

| File | Bugs Addressed |
|------|---------------|
| **NEW** `src/hooks/useClipCoupons.js` | BUG-013 |
| `src/components/Deals.js` | BUG-006, BUG-013, BUG-017 |
| `src/components/SmartDeals.js` | BUG-006, BUG-013 |
| `src/components/CouponMatchPanel.js` | BUG-013 |
| `src/components/HebCart.js` | BUG-007, BUG-008 |
| `src/components/Plan.js` | BUG-010, BUG-016 |
| `src/components/Home.js` | BUG-014, BUG-015 |
| `src/components/InStoreMode.js` | BUG-011, BUG-018 |
| `src/components/RecipeInstructions.js` | BUG-019, BUG-020 |
| `src/components/ChatBot.js` | BUG-009 |
| `src/components/MealCreator.js` | BUG-009 |
| `src/components/Coupons.js` | BUG-021 |
| **n8n** migration workflow | DB: VARCHAR→DATE |
| **MySQL** direct | DB: DELETE expired rows |
