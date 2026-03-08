# Full-Stack Systematic Audit Report

**Date:** 2026-03-08
**Scope:** All 6 primary screens + 6 legacy screens + n8n workflows + MySQL + PostgreSQL
**Method:** Phase 1 (Root Cause Investigation) of systematic debugging — evidence gathered before any fixes

---

## Backend Health Summary

| System | Status | Details |
|--------|--------|---------|
| n8n | Healthy | All 20 grocery-tagged workflows active. API responsive. |
| MySQL (hsa) | Healthy | 25 tables. Current week: 39 grocery items, 2 meal selections. |
| PostgreSQL | Healthy | 132 chat history entries across sessions. |
| Clip Server | Not tested | Requires Docker container + HEB login session. |
| Smart Deals Cache | Fresh | 2 entries, latest from today (2026-03-08). |
| HEB Coupons | 764 active, **975 expired** | Expired coupons not cleaned from DB. |
| Frequent Products | 322 cached | From "Buy it again" scraper. |

---

## Findings by Severity

### CRITICAL — Will Error or Fail

#### BUG-001: One-Off Item INSERT References Non-Existent Columns
- **Screen:** Plan > Grocery List (quick-add bar)
- **Location:** `heb-coupon-scraper/src/heb-cart-routes.js:1084-1085`
- **Root Cause:** The INSERT statement references 3 columns that do NOT exist in `WeeklyGroceryList`:
  - `GroceryStoreSection` (exists in `GroceryItems`, not `WeeklyGroceryList`)
  - `IsSelected` (computed in n8n SQL JOIN, not a real column)
  - `QuantitySelected` (computed in n8n SQL JOIN, not a real column)
- **Evidence:** `DESCRIBE WeeklyGroceryList` returns exactly 8 columns: `id, ItemID, ItemName, Category, Store, Quantity, WeekDateRange, DataSource`
- **Impact:** Every quick-add attempt returns HTTP 500. Feature is completely broken.
- **Additional:** `DataSource='OneOff'` also fails — enum only allows `('Staples','MealIngredients')`.

**Fix requires:**
1. ALTER TABLE to add `'OneOff'` to DataSource enum
2. Remove `GroceryStoreSection`, `IsSelected`, `QuantitySelected` from INSERT
3. Update n8n `Pull Grocery Staples` SQL to handle OneOff items in the UNION query

---

### HIGH — Wrong Behavior, No Error

#### BUG-002: Fetch HEB Coupons Returns 975 Expired Coupons
- **Screens:** Deals > All Coupons tab, Legacy Coupons.js
- **Location:** n8n workflow `Fetch HEB Coupons` (ID: K1kGPK4rJNImPnY1)
- **Root Cause:** SQL query filters `WHERE is_active = 1` but does NOT filter `WHERE expiration_date >= CURDATE()`.
- **Evidence:** `SELECT COUNT(*) FROM heb_coupons WHERE expiration_date < CURDATE()` = **975**
- **Impact:** Users see ~975 expired coupons mixed with 764 valid ones. Attempting to clip expired coupons will fail.
- **Note:** `expiration_date` is `VARCHAR(100)` storing 'YYYY-MM-DD' strings. Comparison with CURDATE() works via implicit cast but is fragile.

**Fix:** Add `AND expiration_date >= CURDATE()` to the n8n SQL query.

#### BUG-003: Deals.js EventSource Not Cleaned Up on Unmount
- **Screen:** Deals (during coupon clipping)
- **Location:** `src/components/Deals.js` — no useEffect cleanup for EventSource
- **Root Cause:** When `handleClipSelected()` opens an SSE connection, there's no cleanup function that closes it if the component unmounts during clipping.
- **Impact:** Memory leak. If user navigates away while clipping, SSE connection stays open consuming resources.

**Fix:** Store EventSource in a ref and close it in useEffect cleanup.

#### BUG-004: Home.js Silent API Failures Show "0 Items"
- **Screen:** Home
- **Location:** `src/components/Home.js:67,86,97` (all catch blocks)
- **Root Cause:** All 3 data-fetching catch blocks silently swallow errors. `listItems` initialized as `null`, displayed as "0".
- **Impact:** If n8n is down or network fails, user sees "0 Meals planned, 0 Items selected" with no error indicator. Indistinguishable from genuinely empty week.

**Fix:** Add error state + retry button, or at minimum show toast on failure.

#### BUG-005: RecipeInstructions Falls Back to Sample Data Silently
- **Screen:** Cook
- **Location:** `src/components/RecipeInstructions.js:274-316`
- **Root Cause:** If `grabInstructionsFast` webhook returns unexpected format or times out, component falls back to `RECIPE_INSTRUCTIONS_SAMPLE_DATA` without telling the user.
- **Impact:** User may follow sample instructions thinking they're their actual recipe's instructions.

**Fix:** Show banner "Could not load instructions — showing sample" or disable fallback.

---

### MEDIUM — Edge Cases, Degraded UX

#### BUG-006: Smart Deals Cache May Serve Stale Expired Coupons
- **Screen:** Deals > For My List tab, Home > Hot Deals
- **Location:** n8n workflow `Smart Deals` (ID: PSRbvFrHGRHdBjdf)
- **Root Cause:** Cache TTL is 1 hour. If a coupon expires during that window, cached response still includes it.
- **Impact:** Users see deals for coupons that expired within the last hour.

#### BUG-007: HebCart Phase 2 Search Failures Are Silent
- **Screen:** Cart (Step 2: Match & Review)
- **Location:** `src/components/HebCart.js` Phase 2 search loop
- **Root Cause:** If batch searches return 0 results (WAF blocking, stale session), component breaks out of loop with only a console.log.
- **Impact:** User thinks matching is complete when some items weren't searched.

#### BUG-008: HebCart Fire-and-Forget Match Saves
- **Screen:** Cart (Step 2: Match & Review)
- **Location:** `src/components/HebCart.js` match save calls
- **Root Cause:** Match results saved to DB via `.catch(() => {})` — completely silent failures.
- **Impact:** User confirms matches, navigates away, comes back — matches are gone.

#### BUG-009: ChatBot/MealCreator No Retry on Webhook Failures
- **Screens:** Plan > AI Meal Planner, Plan > Create Recipe
- **Root Cause:** API calls to `callGroceryAgent` and `mealCreatorPropose/Build` use toast errors but no retry mechanism.
- **Impact:** Network blip kills the interaction; user must re-type their request.

#### BUG-010: Plan.js Tab State Not Persisted
- **Screen:** Plan
- **Root Cause:** `activeTab` and `mealMode` are local state with no persistence.
- **Impact:** Navigating away from Plan and returning always resets to "Grocery List" tab, losing context.

#### BUG-011: InStoreMode Silent Coupon Reminder Failure
- **Screen:** Shop
- **Location:** `src/components/InStoreMode.js:253-271`
- **Root Cause:** If `hebWeeklyItems` fetch fails, catch block silently skips coupon data.
- **Impact:** User doesn't see coupon reminders but isn't told they failed to load.

#### BUG-012: RecipeInstructions Confetti Not Reset Between Recipes
- **Screen:** Cook
- **Location:** `src/components/RecipeInstructions.js:471-497`
- **Root Cause:** `celebratedRef.current` not reset when selecting a new recipe.
- **Impact:** Complete recipe A, go back, start recipe B — no celebration confetti for recipe B.

#### BUG-013: Clipping Code Duplicated in 3 Components
- **Screens:** SmartDeals.js, Deals.js, CouponMatchPanel.js
- **Root Cause:** Identical SSE clipping logic (POST to `/api/clip`, EventSource to `/api/clip-progress`) copy-pasted across 3 files.
- **Impact:** Bug fixes must be applied in 3 places. Inconsistencies will accumulate.

**Recommendation:** Extract into shared `useClipCoupons()` hook.

---

### LOW — Minor UX Issues

#### BUG-014: Home.js No Loading State for Badges
- **Screen:** Home
- **Root Cause:** No skeleton/spinner while `fetchGroceryItems` loads. Badges flash "0" then update.

#### BUG-015: Home.js Race Condition on Week Boundary
- **Screen:** Home
- **Root Cause:** `startDate` computed once on mount. If user is on Home at midnight when week rolls over, data is stale.

#### BUG-016: Plan.js groceryListData Stale After GroceryChecklist Changes
- **Screen:** Plan
- **Root Cause:** GroceryChecklist creates weekly list via webhook but doesn't update parent `groceryListData`. ChatBot may see outdated list.

#### BUG-017: Deals.js Clip Error Banner Persists Across Tabs
- **Screen:** Deals
- **Root Cause:** `clipError` state only cleared on clip start, not on tab switch.

#### BUG-018: InStoreMode Week Change Detection Is String-Only
- **Screen:** Shop
- **Root Cause:** Compares `weekDateRange` display string. If format ever changes, stale cache won't clear.

#### BUG-019: RecipeInstructions Swipe Hint Reappears Per Session
- **Screen:** Cook
- **Root Cause:** Uses `sessionStorage` (cleared on tab close) instead of `localStorage`.

#### BUG-020: RecipeInstructions Auto-Advance Race Condition
- **Screen:** Cook
- **Root Cause:** 500ms delay before auto-advance. If user manually clicks "Next" during that window, could skip a step.

#### BUG-021: Coupons.js No Pagination (748+ Items Client-Side)
- **Screen:** Legacy Coupons, Deals > All Coupons
- **Root Cause:** All coupons loaded at once, filtered in useMemo. Potential jank on lower-end devices.

---

## Screen-by-Screen Audit Matrix

| Screen | Renders | API Calls | Data Source | Critical Bugs | High Bugs | Med Bugs |
|--------|---------|-----------|-------------|:---:|:---:|:---:|
| **Home** | Stats + CTA + Hot Deals | `fetchGroceryItems`, `smartDeals` | n8n + localStorage | - | BUG-004 | - |
| **Plan** | 3-tab container (List/Planner/Creator) | Delegates to children | Props from App.js | BUG-001 | - | BUG-010, BUG-016 |
| **Deals** | Smart Deals + All Coupons tabs | `smartDeals`, `fetchHebCoupons`, clip SSE | n8n + clip server | - | BUG-002, BUG-003 | BUG-006, BUG-013, BUG-017 |
| **Cart** | 3-step HEB Cart Builder | 12+ endpoints (session, search, match, build) | clip server + n8n | - | - | BUG-007, BUG-008 |
| **Shop** | Fullscreen shopping checklist | `fetchGroceryItems`, `hebWeeklyItems` | n8n + localStorage | - | - | BUG-011, BUG-018 |
| **Cook** | Recipe selection + step-by-step | `chooseRecipeInstructions`, `grabInstructionsFast` | n8n + localStorage | - | BUG-005 | BUG-012, BUG-019, BUG-020 |
| **ChatBot** | Conversational AI meal planner | `callGroceryAgent`, `chatHistory` | n8n + Postgres | - | - | BUG-009 |
| **MealCreator** | 4-phase recipe builder | `propose`, `build`, `save`, `chatHistory` | n8n + Postgres | - | - | BUG-009 |
| **Coupons** | Coupon grid browser | `fetchHebCoupons` | n8n | - | BUG-002 | BUG-021 |
| **SmartDeals** | AI-matched deals + clipping | `smartDeals`, clip SSE | n8n + clip server | - | - | BUG-006, BUG-013 |

---

## n8n Workflow Status

| Workflow | ID | Active | Last Updated | Issues |
|----------|------|:---:|------|------|
| Pull Grocery Staples | JoaR6klT950hwSLB | Yes | Feb 16 | None |
| Create Grocery List | o0FnsnU6DaU9CqKD | Yes | Feb 16 | None |
| Add Grocery Item | Uo35akFGNGHrOKvl | Yes | Feb 16 | None |
| Deactivate Grocery Item | pUCo4xrd4KkI1mVP | Yes | Feb 16 | None |
| Fetch HEB Coupons | K1kGPK4rJNImPnY1 | Yes | Feb 20 | **BUG-002: No expiration filter** |
| Match Coupons AI | CuaKAgmacIOTN6vW | Yes | Feb 20 | None |
| Save Coupon Matches | nznc27SZO17zZQh0 | Yes | Feb 20 | None |
| Smart Match Grocery | DDlygjzqHlLs4V1E | Yes | Feb 21 | None |
| Smart Deals | PSRbvFrHGRHdBjdf | Yes | Mar 7 | BUG-006 (cache TTL) |
| AI Meal Creator - Propose | 0eSQFVwGsC8tuYli | Yes | Mar 7 | None |
| AI Meal Creator - Full Build | ATGuPNtocx6Xypyk | Yes | Mar 7 | None |
| AI Meal Creator - Save | n4lUGlBwxX34tpj7 | Yes | Feb 16 | None |
| Chat History API | Kz9hrwAH0hVzNR4Y | Yes | Feb 16 | None |
| Grab Instructions (Fast) | OQJthXLgBYglySdU | Yes | Feb 25 | None |
| Choose Instructions | jNR615vEH0pDFrs3 | Yes | Feb 16 | None |
| Blue Apron API Agent | UsrnHCWpe6zfIbcn | Yes | Feb 16 | None |
| Ingredient Agent | UqXlXX5uPWlGvhU6 | Yes | Feb 16 | None |
| Create Grocery List - Meals | CkLhcFEM9Tfc5uxO | Yes | Feb 16 | None |

---

## Database State (Current Week: Mar 8-14, 2026)

| Table | Record Count | Notes |
|-------|---:|------|
| WeeklyGroceryList (this week) | 39 | Healthy |
| weekly_selections (this week) | 2 | 2 meals selected |
| heb_coupons (active) | 764 | Good |
| heb_coupons (expired) | **975** | Not cleaned up |
| heb_frequent_products | 322 | Cached |
| smart_deals_cache | 2 | Fresh (today) |
| recipe_instructions | 600 (54 recipes) | Healthy |
| n8n_chat_histories (Postgres) | 132 | Healthy |

### Schema Mismatch Summary

| Column Referenced by Code | Table | Exists? |
|--------------------------|-------|:---:|
| `WeeklyGroceryList.IsSelected` | WeeklyGroceryList | **NO** (computed in SQL JOIN) |
| `WeeklyGroceryList.QuantitySelected` | WeeklyGroceryList | **NO** (computed in SQL JOIN) |
| `WeeklyGroceryList.GroceryStoreSection` | WeeklyGroceryList | **NO** (from GroceryItems table) |
| `WeeklyGroceryList.DataSource = 'OneOff'` | WeeklyGroceryList | **NO** (enum: Staples, MealIngredients) |

---

## Recommended Fix Priority

### Immediate (Blocking Features)
1. **BUG-001** — Fix OneOff INSERT (ALTER TABLE + fix SQL) — *one-off quick-add is completely broken*
2. **BUG-002** — Add expiration filter to Fetch HEB Coupons workflow

### This Sprint
3. **BUG-003** — Add EventSource cleanup in Deals.js
4. **BUG-004** — Add error states to Home.js API calls
5. **BUG-005** — Show fallback indicator in RecipeInstructions
6. **BUG-013** — Extract shared `useClipCoupons()` hook

### Backlog
7. BUG-006 through BUG-012 — Edge cases and UX polish
8. BUG-014 through BUG-021 — Low-severity improvements
9. Clean up 975 expired coupons from `heb_coupons` table
10. Consider changing `expiration_date` from VARCHAR to DATE type
