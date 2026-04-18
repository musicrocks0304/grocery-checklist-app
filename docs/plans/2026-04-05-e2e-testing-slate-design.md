# E2E Testing Slate — Grocery Planner App

## Context

The app has grown to 8 major user flows across React UI, n8n webhooks, MySQL, Postgres, and a clip-server (Express+Playwright). No E2E tests exist today. The user needs a repeatable testing slate that:
- Validates every flow end-to-end against live production infrastructure
- Uses Playwright browser automation (not just API calls)
- Runs in parallel where possible via multiple Claude agents
- Documents expected outcomes for future regression testing
- Leaves test data for manual inspection

**Test week**: April 5-11, 2026 (database cleared to clean slate)

---

## Execution Schedule (4 Batches, ~10 min wall-clock)

```
Batch 1 (parallel, ~4 min)
  Agent A: Flow 1 — Plan Meals (ChatBot)
  Agent B: Flow 2 — Create Recipe (MealCreator)
  Agent C: Flow 5 — Smart Deals + Clip Coupons

Batch 2 (sequential, ~3 min)
  Agent D: Flow 3 — Build Grocery List

Batch 3 (parallel, ~4 min)
  Agent E: Flow 4 — Match Coupons (depends on Flow 3)
  Agent F: Flow 7 — In-Store Shopping (depends on Flow 3)
  Agent G: Flow 8 — Cook Recipe (depends on Flow 1 or 2)

Batch 4 (conditional, ~5 min)
  Agent H: Flow 6 — Build HEB Cart (depends on Flow 3, requires HEB session)
```

### Dependency Graph
```
Flow 1 (Meals) ──────────────────────────┐
Flow 2 (Create Recipe) ──────────────────┤──→ Flow 8 (Cook)
Flow 5 (Smart Deals) [independent]       │
                                          │
Flow 3 (Grocery List) ──┬──→ Flow 4 (Coupons)
                        ├──→ Flow 7 (In-Store Shopping)
                        └──→ Flow 6 (HEB Cart) [requires HEB session]
```

---

## Flow Specifications

### Flow 1: Plan Meals (ChatBot) — Agent A

**Pre-requisites**: None (independent)

**Steps**:
1. Navigate to `localhost:3000/#meals`
2. Click "AI Planner" tab if not already active
3. Type "suggest chicken recipes" in chat input, press Enter
4. Wait for AI response (up to 15s)
5. Verify response contains recipe suggestion cards with "Add to this week" buttons
6. Click "Add to this week" on the first suggestion
7. Verify toast notification confirms addition
8. Verify meals badge updates count (left floating icon shows "1")
9. Reload page
10. Verify chat history restores (previous messages visible)

**DB Verification**:
```sql
-- Verify meal was added
SELECT * FROM weekly_selections
WHERE weekDateRange LIKE '%April 5th%';
-- Expected: 1 row with a valid recipe_id

-- Verify chat history persists (Postgres)
-- Session ID: chat_2026-04-05
```

**Pass Criteria**: Recipe suggestion appears, meal added to DB, chat history survives reload

---

### Flow 2: Create Recipe (MealCreator) — Agent B

**Pre-requisites**: None (independent)

**Steps**:
1. Navigate to `localhost:3000/#meals`
2. Click "Create Recipe" tab
3. Verify Phase 1 (Describe) is active — stepper shows "1. Describe"
4. Type "I want something Italian with seafood" in input, press Enter
5. Wait for AI response (up to 15s)
6. Verify 2-3 recipe proposal cards render with name/description/time
7. Click on one of the proposals
8. Wait for full recipe build (up to 15s)
9. Verify Phase 3 (Preview) shows: ingredients list, instructions, nutrition
10. Click "Save Recipe" button
11. Verify Phase 4 (Saved) confirmation appears
12. Verify meals badge updates

**DB Verification**:
```sql
-- Verify recipe saved to weekly selections
SELECT ws.*, rs.recipe_name FROM weekly_selections ws
JOIN recipe_summary rs ON ws.recipe_id = rs.recipe_id
WHERE ws.weekDateRange LIKE '%April 5th%';
-- Expected: includes the newly created recipe
```

**Pass Criteria**: 4-phase progression completes, recipe saved to DB, appears in weekly selections

---

### Flow 3: Build Grocery List — Agent D

**Pre-requisites**: None (but runs after Batch 1 to avoid DB contention)

**Steps**:
1. Navigate to `localhost:3000/#plan`
2. Verify grocery items load grouped by store section (Bakery, Beverages, Dairy, etc.)
3. Expand "Filters & Grouping" on mobile, verify filter controls work
4. Select 5+ items across different sections, set quantities (2, 3, etc.)
5. Quick-add a one-off item: type "2 lbs chicken breast" in quick-add bar, click Add
6. Verify one-off item appears in the list
7. Click "+ Add Item" to open the Add Item panel
8. Fill form: ItemName="Test Granola", Category="Breakfast", Type="Basic", Store="HEB", Section="Pantry"
9. Submit the new item, verify it appears in the list
10. Select the newly added items
11. Click "Review Selection"
12. Verify review screen shows all selected items with correct quantities
13. Click "Save List"
14. Wait for save confirmation

**DB Verification**:
```sql
-- Verify items were saved to weekly grocery list
SELECT ItemName, Quantity, DataSource
FROM WeeklyGroceryList
WHERE WeekDateRange LIKE '%April 5th%';
-- Expected: 5+ Staples items + 1 OneOff item + 1 new catalog item
```

**Pass Criteria**: Items selectable, one-off adds work, new catalog item creates, list saves to DB

---

### Flow 4: Match Coupons — Agent E

**Pre-requisites**: Flow 3 must complete (needs saved grocery list)

**Steps**:
1. Flow 3's "Save List" should have auto-triggered coupon matching
2. If not, navigate to `localhost:3000/#plan`, re-save the list
3. Wait for CouponMatchPanel to render (up to 20s — AI matching is slow)
4. Verify match cards show: coupon name, discount amount, savings, confidence badge
5. Verify matches are grouped by grocery item
6. Note the coupon IDs displayed

**DB Verification**:
```sql
-- Verify coupon matches persisted
SELECT grocery_item_name, coupon_hash_id, confidence, match_reason
FROM coupon_matches
ORDER BY created_at DESC LIMIT 10;
-- Expected: rows matching the displayed coupons
```

**Pass Criteria**: CouponMatchPanel renders with matches, matches appear in `coupon_matches` table

---

### Flow 5: Smart Deals + Clip Coupons — Agent C

**Pre-requisites**: None (uses `heb_frequent_products` table which has 322 pre-cached items)

**Steps**:
1. Navigate to `localhost:3000/#deals`
2. Wait for Smart Deals to load (up to 15s for fresh, instant if cached)
3. Verify deal cards render with: product name, coupon discount, confidence badge, savings amount
4. Verify total savings banner shows
5. Select 1-2 coupons using checkboxes
6. Click "Clip Selected" button
7. Verify SSE progress indicators show clipping status
8. Wait for clip completion (up to 30s)
9. Verify clipped coupons show "Clipped" status

**DB Verification**:
```sql
-- Verify smart deals cache was populated
SELECT total_deals, total_savings, created_at FROM smart_deals_cache;
-- Expected: 1+ row with deals data

-- Verify clipped coupons updated
SELECT product_name, clipped_status FROM heb_coupons
WHERE clipped_status = 1 ORDER BY updated_at DESC LIMIT 5;
```

**Pass Criteria**: Deals load with data, clipping completes, coupon status updates

**Note**: Clipping requires the clip-server to be running and HEB session to be valid. If clip-server is down, the test should still pass the deals-display portion and mark clipping as "skipped".

---

### Flow 6: Build HEB Cart — Agent H

**Pre-requisites**: Flow 3 complete (needs weekly items), valid HEB session on clip-server

**Pre-flight Check**:
```bash
curl -s https://clip.needexcelexpert.com/api/health
# Must return { "status": "ok", "session": { "active": true } }
```
If session is not active, skip this flow entirely and report "HEB session expired".

**Steps**:
1. Navigate to `localhost:3000/#cart`
2. Verify Step 1 (Connect) is shown
3. Click "Connect" to start HEB session
4. Wait for session to become active (up to 30s)
5. Verify Step 2 (Match & Review) loads with weekly grocery items
6. Wait for AI smart-match to complete (up to 30s)
7. Verify matched products show with confidence levels and HEB product images
8. Confirm matches (click checkmarks on matched items)
9. Click "Build Cart"
10. Monitor SSE progress (items being added one by one, 5-8s per item)
11. Wait for build completion
12. Verify success summary

**DB Verification**:
```sql
-- Verify product matches saved
SELECT grocery_item_name, heb_product_name, confidence, user_confirmed
FROM heb_product_matches
ORDER BY created_at DESC LIMIT 10;

-- Verify cart session recorded
SELECT session_id, status, items_total, items_added_to_cart
FROM heb_cart_sessions
ORDER BY started_at DESC LIMIT 1;
-- Expected: status='completed', items_added > 0
```

**Pass Criteria**: Session connects, AI matches products, cart builds successfully

**Risk**: WAF blocking, session expiry, anti-bot detection. If build fails mid-way, the test should report partial success (e.g., "3/5 items added").

---

### Flow 7: In-Store Shopping — Agent F

**Pre-requisites**: Flow 3 complete (needs saved grocery list)

**Steps**:
1. Navigate to `localhost:3000/#shop`
2. Verify shopping list loads with items from the saved grocery list
3. Verify items grouped by store section with progress indicators (0/N)
4. Tap/click to check off 3 items
5. Verify strikethrough styling on checked items
6. Verify section progress updates (e.g., "2/5")
7. Verify progress ring updates at top of screen
8. Reload page
9. Verify checked items persist (progress restored from DB)

**DB Verification**:
```sql
-- Verify shopping progress saved
SELECT item_id, checked_at FROM shopping_progress
WHERE week_start_date = '2026-04-05';
-- Expected: 3 rows matching the items checked off
```

**Pass Criteria**: Items checkable, progress persists in DB, survives page reload

---

### Flow 8: Cook Recipe — Agent G

**Pre-requisites**: Flow 1 or 2 complete (needs selected meals)

**Steps**:
1. Navigate to `localhost:3000/#cook`
2. Verify available recipes grid loads (meals selected in Flow 1/2)
3. Click on a recipe to start cooking
4. Verify recipe instructions load with step-by-step format
5. Verify step counter shows "Step 1 of N"
6. Click forward to advance to Step 2
7. Verify step content changes
8. Click back to return to Step 1
9. If step has a time, verify timer displays
10. Start timer, verify countdown begins

**Pass Criteria**: Recipe loads, steps navigate correctly, timer works

---

## Agent Capability Summary

| Flow | Agent Can Fully Automate? | Notes |
|------|--------------------------|-------|
| 1. Plan Meals | Yes | AI responses may vary — verify structure not exact text |
| 2. Create Recipe | Yes | AI-generated recipes are unique each time |
| 3. Build Grocery List | Yes | Deterministic UI interactions |
| 4. Match Coupons | Yes | AI matching may vary — verify presence not exact matches |
| 5. Smart Deals | Mostly | Clip portion depends on clip-server + HEB session |
| 6. HEB Cart | Conditional | Requires valid HEB session; most fragile flow |
| 7. In-Store Shopping | Yes | Fully deterministic |
| 8. Cook Recipe | Yes | Fully deterministic after meal selection |

## What Cannot Be Automated by Agents
1. **HEB login session refresh** — requires `npm run scrape:login` + manual hCaptcha solve
2. **Clip-server restart** — requires Docker/host access
3. **n8n workflow fixes** — agents can report errors but can't modify workflow logic
4. **Network infrastructure** — MySQL/Postgres connectivity issues

---

## Failure Handling

- **Batch fails**: If any test in a batch fails, dependent batches still attempt to run (they may fail at their own pre-requisite check)
- **AI response timeout**: Retry once after 5s. If second attempt fails, mark test as "timeout"
- **DB verification fails**: Report actual vs expected, do not auto-retry (may indicate a real bug)
- **HEB session expired**: Skip Flow 6 entirely, report "skipped: session expired"
- **Clip-server down**: Skip clipping portion of Flow 5, skip all of Flow 6

---

## Verification Queries (Post-Test Summary)

After all tests complete, run this comprehensive check:

```sql
-- Meals added
SELECT COUNT(*) as meals FROM weekly_selections WHERE weekDateRange LIKE '%April 5th%';

-- Grocery items selected
SELECT COUNT(*) as items FROM WeeklyGroceryList WHERE WeekDateRange LIKE '%April 5th%';

-- Coupon matches found
SELECT COUNT(*) as matches FROM coupon_matches;

-- Shopping progress
SELECT COUNT(*) as checked FROM shopping_progress WHERE week_start_date = '2026-04-05';

-- Smart deals cached
SELECT COUNT(*) as cache_entries FROM smart_deals_cache;

-- HEB product matches
SELECT COUNT(*) as heb_matches FROM heb_product_matches;

-- Cart sessions
SELECT status, items_added_to_cart FROM heb_cart_sessions ORDER BY started_at DESC LIMIT 1;
```

Expected post-test state:
- meals >= 2 (one from ChatBot, one from MealCreator)
- items >= 6 (5 selected + 1 one-off + possibly more)
- matches >= 1 (at least some coupon matches)
- checked >= 3 (3 items checked in store)
- cache_entries >= 1 (smart deals cached)
- heb_matches >= 1 (if HEB cart ran)
