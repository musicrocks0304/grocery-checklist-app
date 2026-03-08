# Backlog Bug Fix Implementation Plan (BUG-006 through BUG-021)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 15 remaining audit bugs + database housekeeping in 3 batches.

**Architecture:** Batch 1 extracts shared `useClipCoupons` hook (BUG-013), Batch 2 adds error handling/resilience to 6 components, Batch 3 polishes UX with 8 quick fixes. Database cleanup at end.

**Tech Stack:** React hooks, Tailwind CSS, n8n workflows, MySQL

---

## Task 1: Create `useClipCoupons` Hook (BUG-013)

**Files:**
- Create: `src/hooks/useClipCoupons.js`

**Step 1: Create the hook**

Create `src/hooks/useClipCoupons.js` with this exact content:

```javascript
import { useState, useRef, useEffect, useCallback } from 'react';
import { CLIP_SERVER_URL } from '../config/api';

/**
 * Shared hook for SSE-based coupon clipping.
 * Replaces duplicated logic in Deals.js, SmartDeals.js, CouponMatchPanel.js.
 * Handles EventSource lifecycle and cleanup on unmount.
 */
export function useClipCoupons() {
  const [isClipping, setIsClipping] = useState(false);
  const [clipProgress, setClipProgress] = useState(new Map());
  const [clipResults, setClipResults] = useState(null);
  const [clipError, setClipError] = useState(null);
  const eventSourceRef = useRef(null);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const resetClipState = useCallback(() => {
    setClipResults(null);
    setClipError(null);
    setClipProgress(new Map());
  }, []);

  const clipSelected = useCallback(async (couponIds) => {
    if (!couponIds || couponIds.length === 0) return;

    // Close any existing SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsClipping(true);
    setClipError(null);
    setClipResults(null);

    const initialProgress = new Map();
    couponIds.forEach(id => initialProgress.set(id, 'pending'));
    setClipProgress(initialProgress);

    try {
      const startResponse = await fetch(`${CLIP_SERVER_URL}/api/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponIds }),
      });

      if (!startResponse.ok) {
        const errData = await startResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned ${startResponse.status}`);
      }

      const { jobId } = await startResponse.json();
      const eventSource = new EventSource(`${CLIP_SERVER_URL}/api/clip-progress/${jobId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'progress') {
            setClipProgress(prev => {
              const next = new Map(prev);
              next.set(data.couponId, data.status);
              return next;
            });
          } else if (data.type === 'complete') {
            setClipResults(data.summary);
            setIsClipping(false);
            eventSource.close();
            eventSourceRef.current = null;
          } else if (data.type === 'error') {
            setClipError(data.message);
            setIsClipping(false);
            eventSource.close();
            eventSourceRef.current = null;
          }
        } catch {
          // Ignore malformed SSE data
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setIsClipping(false);
        setClipError('Connection to clip server lost.');
      };
    } catch (err) {
      setClipError(err.message);
      setIsClipping(false);
    }
  }, []);

  return {
    clipSelected,
    clipProgress,
    clipResults,
    clipError,
    isClipping,
    resetClipState,
  };
}
```

**Step 2: Build to verify no syntax errors**

Run: `cd /mnt/c/New\ Grocery\ App/grocery-checklist-app && npx react-scripts build 2>&1 | tail -5`
Expected: Compiled successfully (hook not imported yet, but file should parse)

---

## Task 2: Refactor SmartDeals.js to Use Hook (BUG-013)

**Files:**
- Modify: `src/components/SmartDeals.js`

**Step 1: Replace clipping state + logic with hook**

In SmartDeals.js, make these changes:

1. Add hook import — change line 1 area imports to include:
```javascript
import { useClipCoupons } from '../hooks/useClipCoupons';
```

2. Remove the 5 clipping state declarations (lines 35-39):
```javascript
// DELETE these lines:
const [selectedCoupons, setSelectedCoupons] = useState(new Set());
const [isClipping, setIsClipping] = useState(false);
const [clipProgress, setClipProgress] = useState(new Map());
const [clipResults, setClipResults] = useState(null);
const [clipError, setClipError] = useState(null);
```

Replace with:
```javascript
const [selectedCoupons, setSelectedCoupons] = useState(new Set());
const { clipSelected, clipProgress, clipResults, clipError, isClipping, resetClipState } = useClipCoupons();
```

3. Replace the entire `handleClipSelected` function (lines 150-216) with:
```javascript
const handleClipSelected = async () => {
  if (selectedCoupons.size === 0) return;
  const selectedIds = Array.from(selectedCoupons);
  await clipSelected(selectedIds);
  // Update local deal state after clip completes
  setDeals(prev => prev.map(d =>
    selectedCoupons.has(d.coupon.hashId)
      ? { ...d, coupon: { ...d.coupon, clippedStatus: 1 } }
      : d
  ));
};
```

4. Remove the `CLIP_SERVER_URL` import from the config import line (if it was only used for clipping — check if `handleAddToList` uses it too; if so, keep it).

**Step 2: Build to verify**

Run: `cd /mnt/c/New\ Grocery\ App/grocery-checklist-app && npx react-scripts build 2>&1 | tail -5`
Expected: Compiled successfully

---

## Task 3: Refactor CouponMatchPanel.js to Use Hook (BUG-013)

**Files:**
- Modify: `src/components/CouponMatchPanel.js`

**Step 1: Replace clipping state + logic with hook**

1. Add hook import:
```javascript
import { useClipCoupons } from '../hooks/useClipCoupons';
```

2. Remove clipping state declarations (lines 23-26), keep `selectedCoupons`:
```javascript
// Keep this:
const [selectedCoupons, setSelectedCoupons] = useState(new Set());
// DELETE these:
const [isClipping, setIsClipping] = useState(false);
const [clipProgress, setClipProgress] = useState(new Map());
const [clipResults, setClipResults] = useState(null);
const [clipError, setClipError] = useState(null);
```

Add after selectedCoupons:
```javascript
const { clipSelected, clipProgress, clipResults, clipError, isClipping, resetClipState } = useClipCoupons();
```

3. Replace entire `handleClipSelected` function (lines 99-166) with:
```javascript
const handleClipSelected = async () => {
  if (selectedCoupons.size === 0) return;
  await clipSelected(Array.from(selectedCoupons));
};
```

4. Remove `CLIP_SERVER_URL` import from line 3 (no longer needed directly):
```javascript
// Change:
import { CLIP_SERVER_URL } from '../config/api';
// To: (remove the line entirely if nothing else uses CLIP_SERVER_URL)
```

**Step 2: Build to verify**

Run: `cd /mnt/c/New\ Grocery\ App/grocery-checklist-app && npx react-scripts build 2>&1 | tail -5`

---

## Task 4: Refactor Deals.js Clipping to Use Hook (BUG-013 + BUG-017)

**Files:**
- Modify: `src/components/Deals.js`

**Step 1: Replace clipping state + logic with hook**

1. Add hook import:
```javascript
import { useClipCoupons } from '../hooks/useClipCoupons';
```

2. Remove the clipping-related state declarations. Keep `selectedCoupons`. Remove:
- `isClipping` useState
- `clipProgress` useState
- `clipResults` useState
- `clipError` useState
- `eventSourceRef` useRef
- The EventSource cleanup useEffect

Add the hook:
```javascript
const { clipSelected, clipProgress, clipResults, clipError, isClipping, resetClipState } = useClipCoupons();
```

3. Replace the `handleClipSelected` function with:
```javascript
const handleClipSelected = async () => {
  if (selectedCoupons.size === 0) return;
  const selectedIds = Array.from(selectedCoupons);
  await clipSelected(selectedIds);
};
```

4. **BUG-017 fix**: In the tab-switch useEffect, call `resetClipState()`:
```javascript
useEffect(() => {
  setSelectedCoupons(new Set());
  resetClipState();
}, [activeTab, resetClipState]);
```

**Step 2: Build to verify**

Run: `cd /mnt/c/New\ Grocery\ App/grocery-checklist-app && npx react-scripts build 2>&1 | tail -5`

---

## Task 5: Client-Side Expiration Filter for Smart Deals (BUG-006)

**Files:**
- Modify: `src/components/Home.js`

SmartDeals.js already has this filter (lines 63-68). Home.js does not.

**Step 1: Add expiration filter to Home.js deals fetch**

In Home.js, in the `fetchDeals` function (around line 83-88), after parsing the deals, add a filter:

Change:
```javascript
const deals = (result.deals || []).slice(0, 3);
const totalSavings = (result.deals || []).reduce((s, d) => s + (d.coupon?.savingsAmount || 0), 0);
setTopDeals({ deals, totalSavings: Math.round(totalSavings * 100) / 100, totalCount: (result.deals || []).length });
```

To:
```javascript
const today = new Date();
today.setHours(0, 0, 0, 0);
const allDeals = (result.deals || []).filter(d => {
  if (!d.coupon?.expirationDate) return true;
  return new Date(d.coupon.expirationDate) >= today;
});
const deals = allDeals.slice(0, 3);
const totalSavings = allDeals.reduce((s, d) => s + (d.coupon?.savingsAmount || 0), 0);
setTopDeals({ deals, totalSavings: Math.round(totalSavings * 100) / 100, totalCount: allDeals.length });
```

**Step 2: Build to verify**

---

## Task 6: HebCart Search Failure Feedback (BUG-007)

**Files:**
- Modify: `src/components/HebCart.js`

**Step 1: Add search warning state**

Near the existing state declarations (around line 450), add:
```javascript
const [searchWarning, setSearchWarning] = useState(null);
const [skippedBatches, setSkippedBatches] = useState(0);
```

**Step 2: Update the 0-results break to set warning**

Change the block at lines 802-805 from:
```javascript
if (totalSearchResults === 0) {
  console.log('[heb-cart] Phase 2: All searches returned 0 results (WAF likely blocking). Skipping remaining.');
  break;
}
```

To:
```javascript
if (totalSearchResults === 0) {
  console.log('[heb-cart] Phase 2: All searches returned 0 results (WAF likely blocking). Skipping remaining.');
  setSkippedBatches(prev => prev + 1);
  setSearchWarning('Some items couldn\'t be searched. Try ending and restarting your HEB session, then re-run matching.');
  break;
}
```

**Step 3: Add warning banner in the review UI**

In the review step UI, add a warning banner at the top (find where Step 2 content renders, before the match cards):
```javascript
{searchWarning && (
  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-sm text-amber-800">
    <AlertCircle size={16} className="flex-shrink-0" />
    <span>{searchWarning}</span>
    <button onClick={() => setSearchWarning(null)} className="ml-auto text-amber-600 hover:text-amber-800">
      <X size={16} />
    </button>
  </div>
)}
```

Make sure `X` is imported from lucide-react (check existing imports).

**Step 4: Build to verify**

---

## Task 7: Match Save Confirmation (BUG-008)

**Files:**
- Modify: `src/components/HebCart.js`

**Step 1: Replace fire-and-forget with awaited save + toast**

Change the match save block at lines 642-660 from:
```javascript
// Save to DB (fire and forget)
fetch(ENDPOINTS.hebMatches, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    groceryItemId: m.groceryItemId,
    groceryItemName: m.groceryItemName,
    hebProductId: m.hebProductId,
    hebSkuId: m.hebSkuId,
    hebProductName: m.hebProductName,
    hebProductUrl: m.hebProductUrl,
    hebImageUrl: m.hebImageUrl,
    hebPrice: m.hebPrice,
    hebCategory: m.hebCategory,
    matchSource: m.matchSource,
    confidence: m.confidence,
    matchReason: m.matchReason,
  }),
}).catch(() => {});
```

To:
```javascript
// Save to DB with error feedback
try {
  const saveRes = await fetch(ENDPOINTS.hebMatches, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      groceryItemId: m.groceryItemId,
      groceryItemName: m.groceryItemName,
      hebProductId: m.hebProductId,
      hebSkuId: m.hebSkuId,
      hebProductName: m.hebProductName,
      hebProductUrl: m.hebProductUrl,
      hebImageUrl: m.hebImageUrl,
      hebPrice: m.hebPrice,
      hebCategory: m.hebCategory,
      matchSource: m.matchSource,
      confidence: m.confidence,
      matchReason: m.matchReason,
    }),
  });
  if (!saveRes.ok) {
    console.error('[heb-cart] Match save failed:', saveRes.status);
  }
} catch (err) {
  console.error('[heb-cart] Match save error:', err.message);
  toast.error(`Failed to save match for ${m.groceryItemName}. It may not persist.`);
}
```

Note: `processAiMatches` is a `useCallback` — make sure it's `async` (it likely already is). Check that `toast` is imported.

**Step 2: Build to verify**

---

## Task 8: ChatBot Retry on Failure (BUG-009)

**Files:**
- Modify: `src/components/ChatBot.js`

**Step 1: Add retry ref and retry function**

Near the top of the ChatBot component, add a ref to store the last payload:
```javascript
const lastPayloadRef = useRef(null);
```

**Step 2: Store payload before send**

In `sendMessage()`, right before the `apiFetch` call (before line 351), add:
```javascript
lastPayloadRef.current = payload;
```

**Step 3: Add retry button to error message**

Change the catch block (lines 643-654) from:
```javascript
} catch (error) {
  addDebugLog('❌ Error in sendMessage:', error.message);
  removeTypingIndicator(typingId);

  const errorMessage = {
    id: Date.now() + Math.random(),
    type: 'bot',
    content: "I'm having trouble connecting to my meal planning brain right now! 🧠💭 But I can still help with some basic suggestions. What type of meals are you thinking about?",
    timestamp: new Date().toLocaleTimeString()
  };

  setMessages(prev => [...prev, errorMessage]);
}
```

To:
```javascript
} catch (error) {
  addDebugLog('❌ Error in sendMessage:', error.message);
  removeTypingIndicator(typingId);

  const errorMessage = {
    id: Date.now() + Math.random(),
    type: 'bot',
    content: "I'm having trouble connecting right now. Please try again in a moment.",
    isRetryable: true,
    timestamp: new Date().toLocaleTimeString()
  };

  setMessages(prev => [...prev, errorMessage]);
}
```

**Step 4: Add retry handler**

Add a function near `sendMessage`:
```javascript
const retryLastMessage = () => {
  if (!lastPayloadRef.current) return;
  setInputMessage(lastPayloadRef.current.message);
  // Small delay to let the input update, then send
  setTimeout(() => sendMessage(), 50);
};
```

**Step 5: Render retry button in message display**

In the message rendering section, where bot messages are displayed, add a retry button for retryable messages. Find the bot message rendering and add after the content:
```javascript
{msg.isRetryable && (
  <button
    onClick={retryLastMessage}
    className="mt-2 text-xs text-primary hover:text-primary-hover underline"
  >
    Retry last message
  </button>
)}
```

**Step 6: Build to verify**

---

## Task 9: MealCreator Retry on Failure (BUG-009)

**Files:**
- Modify: `src/components/MealCreator.js`

**Step 1: Add retry ref**

Near the top of the MealCreator component, add:
```javascript
const lastProposeRef = useRef(null);
```

**Step 2: Store payload before propose**

In `proposeRecipes()`, right before the `apiFetch` call (before line 223), add:
```javascript
lastProposeRef.current = payload;
```

**Step 3: Add retry to error handling**

Change the catch block (lines 271-282) — update the error message content to include retry info:
```javascript
} catch (error) {
  addDebugLog('Error in propose:', error.message);
  setMessages(prev => prev.filter(msg => msg.id !== typingId));
  setMessages(prev => [...prev, {
    id: Date.now(),
    type: 'bot',
    content: error.name === 'AbortError'
      ? "That took too long — please try again with a simpler description."
      : "Something went wrong generating proposals. Please try again!",
    isRetryable: true,
    timestamp: new Date().toLocaleTimeString()
  }]);
}
```

**Step 4: Add retry handler**

```javascript
const retryLastPropose = () => {
  if (!lastProposeRef.current) return;
  setInputMessage(lastProposeRef.current.message || lastProposeRef.current.description || '');
  setTimeout(() => proposeRecipes(), 50);
};
```

**Step 5: Render retry button in message display**

Same pattern as ChatBot — find bot message rendering and add:
```javascript
{msg.isRetryable && (
  <button
    onClick={retryLastPropose}
    className="mt-2 text-xs text-primary hover:text-primary-hover underline"
  >
    Retry
  </button>
)}
```

**Step 6: Build to verify**

---

## Task 10: InStoreMode Coupon Failure Indicator (BUG-011) + ISO Week Detection (BUG-018)

**Files:**
- Modify: `src/components/InStoreMode.js`

**Step 1: BUG-011 — Add coupon load failure state**

Add state declaration near other state:
```javascript
const [couponLoadFailed, setCouponLoadFailed] = useState(false);
```

Change the silent catch in `fetchCoupons` (around line 271) from:
```javascript
} catch { /* silent — coupon reminders are informational */ }
```

To:
```javascript
} catch {
  setCouponLoadFailed(true);
}
```

**Step 2: BUG-011 — Show subtle indicator**

In the JSX, after the shopping list items but before the footer, add:
```javascript
{couponLoadFailed && (
  <div className="px-4 py-2 text-xs text-muted flex items-center gap-1.5">
    <AlertCircle size={12} />
    Coupon reminders unavailable
  </div>
)}
```

Make sure `AlertCircle` is imported from lucide-react.

**Step 3: BUG-018 — Use ISO date for week comparison**

Change the week comparison at line 165 from:
```javascript
if (parsed.weekDateRange === weekData.displayRange) {
```

To:
```javascript
if (parsed.weekStartDate === weekData.startDate) {
```

And when saving to localStorage, include `weekStartDate`:
Find where the shopping list is saved to localStorage and add `weekStartDate: weekData.startDate` to the saved object.

**Step 4: Build to verify**

---

## Task 11: Plan.js Tab Persistence (BUG-010) + List Refresh (BUG-016)

**Files:**
- Modify: `src/components/Plan.js`

**Step 1: BUG-010 — Persist tab state**

Change the state initialization at line 35-36 from:
```javascript
const [activeTab, setActiveTab] = useState('list');
const [mealMode, setMealMode] = useState('planner');
```

To:
```javascript
const [activeTab, setActiveTab] = useState(() => {
  try {
    const saved = localStorage.getItem('planTabState');
    return saved ? JSON.parse(saved).activeTab || 'list' : 'list';
  } catch { return 'list'; }
});
const [mealMode, setMealMode] = useState(() => {
  try {
    const saved = localStorage.getItem('planTabState');
    return saved ? JSON.parse(saved).mealMode || 'planner' : 'planner';
  } catch { return 'planner'; }
});
```

Add a useEffect to persist changes:
```javascript
useEffect(() => {
  try {
    localStorage.setItem('planTabState', JSON.stringify({ activeTab, mealMode }));
  } catch { /* ignore */ }
}, [activeTab, mealMode]);
```

**Step 2: BUG-016 — Add list change callback**

Add a callback that child components can call:
```javascript
const handleListChanged = useCallback(() => {
  // Re-fetch grocery list data so other tabs (ChatBot) see current items
  if (typeof onListDataRefresh === 'function') {
    onListDataRefresh();
  }
}, [onListDataRefresh]);
```

Pass it to GroceryChecklist:
```javascript
<GroceryChecklist
  onNavigate={onNavigate}
  onUnsavedChanges={onUnsavedChanges}
  onStartShopping={onStartShopping}
  onListChanged={handleListChanged}
  debugMode={debugMode}
/>
```

Note: `onListDataRefresh` needs to be passed from App.js as a prop to Plan.js. In App.js, this should trigger a re-fetch of `groceryListData`. Check if App.js already has a fetch function for this — if so, pass it as `onListDataRefresh`.

**Step 3: Build to verify**

---

## Task 12: Home.js Loading Skeletons (BUG-014) + Week Boundary (BUG-015)

**Files:**
- Modify: `src/components/Home.js`

**Step 1: BUG-014 — Add skeleton component helper**

Add a small helper above the Home component:
```javascript
const StatBadgeSkeleton = () => (
  <div className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-[70px]">
    <div className="h-7 w-8 mx-auto bg-white/30 rounded animate-pulse mb-1" />
    <div className="h-3 w-10 mx-auto bg-white/20 rounded animate-pulse" />
  </div>
);
```

**Step 2: BUG-014 — Use skeletons while loading**

Change the stat badges section (lines 133-154). Replace the Meals and Items badges with conditional rendering:

```javascript
<div className="flex gap-4 mt-4 flex-wrap">
  {listItems === null ? (
    <>
      <StatBadgeSkeleton />
      <StatBadgeSkeleton />
    </>
  ) : (
    <>
      <div className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-[70px]">
        <div className="text-xl font-bold">{mealsPlanned}</div>
        <div className="text-xs text-white/70">Meals</div>
      </div>
      <div className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-[70px]">
        <div className="text-xl font-bold">{selectedCount}</div>
        <div className="text-xs text-white/70">Items</div>
      </div>
    </>
  )}
  {topDeals && (
    <div className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-[70px]">
      <div className="text-xl font-bold">{topDeals.totalCount}</div>
      <div className="text-xs text-white/70">Deals</div>
    </div>
  )}
  {topDeals && topDeals.totalSavings > 0 && (
    <div className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-[70px]">
      <div className="text-xl font-bold">${topDeals.totalSavings.toFixed(0)}</div>
      <div className="text-xs text-white/70">Savings</div>
    </div>
  )}
  {!topDeals && listItems !== null && <StatBadgeSkeleton />}
</div>
```

**Step 3: BUG-015 — Add week boundary interval**

Add a ref to track the initial week and an interval:

```javascript
const weekStartRef = useRef(getWeekDates().startDate);
```

Add a useEffect for week boundary detection:
```javascript
useEffect(() => {
  const checkWeekBoundary = setInterval(() => {
    const currentStart = getWeekDates().startDate;
    if (currentStart !== weekStartRef.current) {
      weekStartRef.current = currentStart;
      window.location.reload(); // Simplest: reload the whole page on week change
    }
  }, 60000); // Check every minute

  return () => clearInterval(checkWeekBoundary);
}, []);
```

Add `useRef` to the React imports if not already there.

**Step 4: Build to verify**

---

## Task 13: RecipeInstructions Quick Fixes (BUG-019 + BUG-020)

**Files:**
- Modify: `src/components/RecipeInstructions.js`

**Step 1: BUG-019 — Swap sessionStorage to localStorage**

At line 463, change:
```javascript
const hintShown = sessionStorage.getItem('recipeSwipeHintShown');
```
To:
```javascript
const hintShown = localStorage.getItem('recipeSwipeHintShown');
```

At line 467, change:
```javascript
sessionStorage.setItem('recipeSwipeHintShown', 'true');
```
To:
```javascript
localStorage.setItem('recipeSwipeHintShown', 'true');
```

**Step 2: BUG-020 — Cancel auto-advance on manual navigation**

In `handlePrevious` and `handleNext` (around lines 504-510), add timeout cancellation:

Change:
```javascript
const handlePrevious = () => {
  if (!isFirstStep) setCurrentStep(currentStep - 1);
};

const handleNext = () => {
  if (!isLastStep) setCurrentStep(currentStep + 1);
};
```

To:
```javascript
const handlePrevious = () => {
  if (autoAdvanceTimeoutRef.current) {
    clearTimeout(autoAdvanceTimeoutRef.current);
    autoAdvanceTimeoutRef.current = null;
  }
  if (!isFirstStep) setCurrentStep(currentStep - 1);
};

const handleNext = () => {
  if (autoAdvanceTimeoutRef.current) {
    clearTimeout(autoAdvanceTimeoutRef.current);
    autoAdvanceTimeoutRef.current = null;
  }
  if (!isLastStep) setCurrentStep(currentStep + 1);
};
```

**Step 3: Build to verify**

---

## Task 14: Coupons.js Load-More Pagination (BUG-021)

**Files:**
- Modify: `src/components/Coupons.js`

**Step 1: Add visible count state**

Add near other state declarations:
```javascript
const [visibleCount, setVisibleCount] = useState(50);
```

**Step 2: Reset on filter/search change**

Add a useEffect to reset when filters change:
```javascript
useEffect(() => {
  setVisibleCount(50);
}, [filterType, searchText, sortBy]);
```

**Step 3: Slice the rendered coupons**

Change the coupon grid at lines 272-277 from:
```javascript
{filteredCoupons.length > 0 ? (
  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
    {filteredCoupons.map((coupon) => (
      <CouponCard key={coupon.hash_id} coupon={coupon} />
    ))}
  </div>
```

To:
```javascript
{filteredCoupons.length > 0 ? (
  <>
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {filteredCoupons.slice(0, visibleCount).map((coupon) => (
        <CouponCard key={coupon.hash_id} coupon={coupon} />
      ))}
    </div>
    {visibleCount < filteredCoupons.length && (
      <div className="text-center mt-4">
        <button
          onClick={() => setVisibleCount(prev => prev + 50)}
          className="px-6 py-2 bg-primary-light text-primary font-medium rounded-xl hover:bg-primary hover:text-white transition-colors"
        >
          Show more ({filteredCoupons.length - visibleCount} remaining)
        </button>
      </div>
    )}
  </>
```

Update the "Showing X of Y" text to reflect visible count:
```javascript
<p className="text-sm text-muted mb-3">
  Showing {Math.min(visibleCount, filteredCoupons.length)} of {couponsData.length} coupons
  {searchText.trim() && ` matching "${searchText}"`}
</p>
```

**Step 4: Build to verify**

---

## Task 15: Database Housekeeping

**Step 1: Delete expired coupons**

Via MySQL MCP:
```sql
DELETE FROM heb_coupons WHERE expiration_date < CURDATE() AND is_active = 0;
```

Expected: ~975 rows deleted.

**Step 2: Create n8n migration workflow for VARCHAR → DATE**

Create a new n8n workflow with:
- Name: `Migration: heb_coupons expiration_date VARCHAR to DATE`
- Manual Trigger → MySQL node
- SQL: `ALTER TABLE heb_coupons MODIFY COLUMN expiration_date DATE NULL;`
- Add webhookId to trigger node

Then have the user run it manually.

**Step 3: Verify expiration filter still works**

After migration, test:
```sql
SELECT COUNT(*) FROM heb_coupons WHERE expiration_date >= CURDATE() AND is_active = 1;
```

Should return ~764 (active, non-expired coupons).

---

## Task 16: Final Verification

**Step 1: Full build**

Run: `cd /mnt/c/New\ Grocery\ App/grocery-checklist-app && npx react-scripts build 2>&1 | tail -10`
Expected: Compiled successfully

**Step 2: Run tests**

Run: `cd /mnt/c/New\ Grocery\ App/grocery-checklist-app && npx react-scripts test --watchAll=false 2>&1`
Expected: All 16 tests pass (3 suites)

**Step 3: Verify no lint warnings in build output**

Check the build output for any new warnings. Address if found.

---

## Summary of Changes

| Task | Bug(s) | File(s) | Type |
|------|--------|---------|------|
| 1 | BUG-013 | NEW `src/hooks/useClipCoupons.js` | Create |
| 2 | BUG-013 | `SmartDeals.js` | Refactor |
| 3 | BUG-013 | `CouponMatchPanel.js` | Refactor |
| 4 | BUG-013, BUG-017 | `Deals.js` | Refactor |
| 5 | BUG-006 | `Home.js` | Fix |
| 6 | BUG-007 | `HebCart.js` | Fix |
| 7 | BUG-008 | `HebCart.js` | Fix |
| 8 | BUG-009 | `ChatBot.js` | Fix |
| 9 | BUG-009 | `MealCreator.js` | Fix |
| 10 | BUG-011, BUG-018 | `InStoreMode.js` | Fix |
| 11 | BUG-010, BUG-016 | `Plan.js` | Fix |
| 12 | BUG-014, BUG-015 | `Home.js` | Fix |
| 13 | BUG-019, BUG-020 | `RecipeInstructions.js` | Fix |
| 14 | BUG-021 | `Coupons.js` | Fix |
| 15 | — | MySQL + n8n | DB cleanup |
| 16 | — | — | Verify |
