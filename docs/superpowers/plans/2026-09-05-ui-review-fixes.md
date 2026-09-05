# UI review fixes — 2026-09-05

Fixes for the 15 bugs logged as `app_feedback` ids 42–56 by the 2026-09-05 Playwright UI review.
Branch: `fix/ui-review-2026-09-05`. Deploy target: Netlify auto-deploys from `main`.

## Global Constraints

- React 19 SPA with hash routing (`#home #plan #meals #deals #cart #shop #cook`; legacy ids in `LEGACY_REDIRECT` in `src/components/App.js`). Navigation goes through `navigateToScreen` / the `onNavigate` prop — never set `window.location.hash` directly.
- Tailwind 3.4 with JIT: **no dynamic class names** (`bg-${x}`). Use the semantic tokens already in `tailwind.config.js` (`bg-surface`, `text-heading`, `text-body`, `text-muted`, `border-default`, `bg-primary`, `bg-primary-light`, `bg-accent`, `bg-background`, `shadow-warm`, `rounded-2xl`).
- Netlify CI treats ESLint warnings as build errors: no unused imports/vars. Run `npx eslint src --max-warnings=0` before committing.
- Tests: `CI=true npx react-scripts test --watchAll=false` (Jest + Testing Library). Run the focused test file while iterating; run the full suite once before committing. Pure functions get unit tests; write the failing test first (TDD) where the task says so.
- Touch targets ≥ 44px. Keep existing fonts (`font-display` = Fraunces, body = DM Sans), 16px card radius (`rounded-2xl`), and dark-mode support via the CSS-variable tokens (never hard-code light colors).
- No new dependencies. No changes to n8n workflows or the clip server in this plan — fixes are frontend-only.
- Commit per task. Commit message: `fix(<area>): <summary> (FB#<ids>)`, ending with a blank line and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Do not push.
- Do not touch the untracked `*.png`, `*.json`, `*.yml` files in the repo root.

---

## Task 1: Hash navigation while the app is open (FB#54)

**File:** `src/components/App.js` (+ new test in `src/components/App.test.js` or a new `src/utils/screenRoute.js` + `screenRoute.test.js`).

**Bug:** Changing the URL hash while the app is already open (bookmark, pasting a `#join/CODE` invite link into an open tab, editing the hash) updates the address bar but the app keeps rendering Home. Cause: the `popstate` handler in `App.js` reads `event.state?.screen` and falls back to `"home"` when history state is absent, which is exactly the case for a typed/pasted hash.

**Fix:**
1. Extract a pure helper `resolveScreenFromHash(hash)` into `src/utils/screenRoute.js` (export it, along with `VALID_SCREENS` and `LEGACY_REDIRECT` moved from `App.js`). Rules: strip a leading `#`; empty → `"home"`; `join/…` → return `{ join: CODE }` (uppercase, trimmed) ; legacy id → its redirect; valid id → itself; anything else → `"home"`. Return shape: `{ screen }` or `{ join }`.
2. In `App.js`, use the helper for the initial `currentScreen` state and in the `popstate` handler: when `event.state?.screen` is missing, resolve from `window.location.hash` instead of defaulting to home. If the resolution is a `join`, call `window.location.reload()` so the existing mount-time join effect runs (the join flow already handles `#join/CODE` at load). After resolving a screen from the hash, `history.replaceState({ screen }, "", "#" + screen)` so back/forward keep working.
3. Also listen for `hashchange` (same handler) — some browsers only fire `hashchange` for manual URL edits. Guard so that a `pushState` from `navigateToScreen` does not double-handle (it never fires either event, so simply resolving from the hash is safe; ensure no re-render loop: only `setCurrentScreen` when the resolved screen differs).
4. Tests (TDD): `screenRoute.test.js` covering `""`, `"#home"`, `"deals"`, `"#grocery"` → `plan`, `"#smart-deals"` → `deals`, `"#nonsense"` → `home`, `"#join/gs62"` → `{ join: "GS62" }`, `"#join/"` → `home`.

**Acceptance:** With the app open on `#home`, setting `location.hash = "#deals"` renders the Deals screen; `#plan` renders Plan; `#join/CODE` triggers the join flow (reload). Browser back/forward still work. Existing `App.test.js` passes.

---

## Task 2: Cook screen header and empty-state route (FB#43, FB#47)

**File:** `src/components/RecipeInstructions.js`.

**Bug A (FB#43):** the empty-state button "Go to Meal Planner" calls `onNavigate('chatbot')` (legacy route without the AI Planner / Create Recipe segmented control). **Fix:** call `onNavigate('meals')`.

**Bug B (FB#47):** on the recipe-selection screen (`showRecipeSelection` branch, header around line 776) the header stacks a "Back to Grocery List" text button beside a two-line "Select Recipe for Instructions" title into a ~130px header on a 390px phone, and "Back to Grocery List" is misleading because Cook is a top-level tab.

**Fix B:** Replace that header row with a compact one-line header:
- Left: a 40×40 icon-only back button (`ArrowLeft` 20px, `aria-label="Back to grocery list"`, `min-h-[44px] min-w-[44px]`) that keeps calling `handleBackToApp`.
- Middle (flex-1, `min-w-0`): `<h1 className="text-lg font-display font-bold text-heading truncate">Cook</h1>` with `<p className="text-xs text-muted truncate">Choose a recipe to cook</p>`; when `availableRecipes.length > 0` the subtitle instead reads `"{n} meal(s) planned this week"`.
- Right: the existing debug toggle (only when `debugMode`) — keep it; otherwise an empty `w-10` spacer so the title stays centered-left.
- Total header height must not exceed 64px at 390px width.
- Empty-state copy: title "No meals planned yet", body "Pick meals in the Meal Planner and they'll show up here with step-by-step instructions.", button "Plan meals" → `onNavigate('meals')`.
- Also change `handleBackToApp` to `onNavigate('plan')` (the `grocery` legacy id still works but should not be used for new code).

**Acceptance:** On `#cook` with no recipes, the header is one line ≤ 64px tall, the CTA navigates to `#meals` (not `#chatbot`). No new ESLint warnings.

---

## Task 3: Home next-step logic and HTML entity decoding (FB#46, FB#44)

**Files:** `src/components/Home.js`, new `src/utils/text.js` + `src/utils/text.test.js`, `src/components/Deals.js` (title/product-name render only).

**Bug A (FB#46):** `getNextStep` in `Home.js` says "Plan Your Meals" whenever `mealsPlanned === 0`, even when the list is built and 9/12 items are already shopped. It never looks at shopping progress.

**Fix A:** Export `getNextStep` (named export) and change it to take `{ mealsPlanned, listItems, shoppedCount, dealsChecked, cartBuilt }` with this priority:
1. `listItems > 0 && shoppedCount > 0 && shoppedCount < listItems` → `{ label: "Finish shopping", screen: "shop", sublabel: "{listItems - shoppedCount} items left on your list" }`
2. `listItems > 0 && shoppedCount >= listItems` → if `mealsPlanned > 0` → `{ label: "Time to cook", screen: "cook", sublabel: "Everything's home — pick tonight's recipe" }` else `{ label: "Shopping done", screen: "plan", sublabel: "Start next week's list whenever you're ready" }`
3. `listItems === 0` → `{ label: "Build your list", screen: "plan", sublabel: mealsPlanned === 0 ? "Pick staples or plan meals to get started" : "Add this week's items to your list" }`
4. `dealsChecked === false` → existing "Check Deals"
5. `cartBuilt === false` → existing "Build HEB Cart"
6. else → existing "Ready to Shop!"
Pass `shoppedCount` into `weeklyStatus` (it is already fetched in `Home.js`). Sublabel pluralization: "1 item left", "3 items left".
Tests (TDD): unit-test `getNextStep` for each branch (import from `./Home`).

**Bug B (FB#44):** product names from the scraper contain literal HTML entities (`"…Strawberry & Watermelon&nbsp;"`) and render verbatim on Home > Hot Deals and on Deals cards.

**Fix B:** Add `decodeHtmlEntities(str)` in `src/utils/text.js`: returns `""` for non-strings; decodes `&nbsp;` (to a normal space), `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`/`&apos;`, and numeric entities `&#NNN;` / `&#xHH;`; then trims and collapses runs of whitespace to one space. No DOM usage (must work in Jest). Tests (TDD): the sample string above → `"…Strawberry & Watermelon"`, `"A&amp;B"` → `"A&B"`, `"x&#39;y"` → `"x'y"`, `null` → `""`.
Apply it at render time to `deal.frequentProduct?.name` in `Home.js` (Hot Deals row) and in `Deals.js` `SmartDealCard` for `deal.frequentProduct.name` and `deal.coupon.productName`, and in the `CouponCard` title/product name fields. Do not change the search/filter logic.

**Acceptance:** Home next-step reflects shopping progress; no literal `&nbsp;` in rendered names; unit tests pass.

---

## Task 4: Deals cards and toolbar (FB#49, FB#51, FB#55)

**File:** `src/components/Deals.js` (`SmartDealCard`, selection toolbar, `handleAddToList`).

**Bug A (FB#49):** `SmartDealCard` title uses `truncate` while the confidence badge is `flex-shrink-0` on the same row, so titles truncate to ~10 chars on mobile. **Fix:** title `<h3>` becomes `text-sm sm:text-base font-semibold text-heading leading-snug line-clamp-2` (Tailwind 3.4 has `line-clamp-*` built in) and takes the full row (drop the `justify-between` wrapper); move the confidence badge into the footer row next to `ExpirationBadge` (first item). The "Add" button label must always be visible (remove `hidden sm:inline`, label text "Add to list", `min-h-[36px]`).

**Bug B (FB#51):** In dark mode the disabled "Select All Unclipped" button renders as a bright pill (`disabled:bg-default`), and the selection toolbar card is shown even when the clip server is unavailable (its only control is permanently disabled).
**Fix:** (1) Do not render the selection toolbar card at all when `clipServerUnavailable` is true (the status banners below it already explain why). (2) For the remaining disabled state (`isClipping`), use `disabled:bg-background disabled:text-muted disabled:border disabled:border-default` instead of `disabled:bg-default` on both the "Select All Unclipped" and "Clip N" buttons.

**Bug C (FB#55):** `handleAddToList` POSTs to the clip server `hebAddWeeklyItem`, which creates a permanent `GroceryItems` staple (category_id NULL) with no way to remove it in the app.
**Fix:** Route "Add to list" through the same one-off path the Plan screen uses:
1. Before adding, GET `ENDPOINTS.fetchGroceryItems` with `weekStartDate`, `weekEndDate`, `weekDateRange` (see `useWeekStaples.js` lines 18–30 for the exact params) and if any returned item has `ItemName` equal (case-insensitive, trimmed) to the decoded product name → set status `'exists'` and stop.
2. Otherwise POST `ENDPOINTS.addOneOffItem` with `{ itemName, weekDateRange }` via `apiFetch` (mirror `useWeekStaples.quickAdd`), using `decodeHtmlEntities(deal.frequentProduct.name)` from `src/utils/text.js` (Task 3) as `itemName`. Success → `'added'`; failure → `'error'` (existing Retry UI).
3. Remove the `hebAddWeeklyItem` usage from `Deals.js` (leave the constant in `api.js`; `SmartDeals.js` is legacy and untouched).
Rendered states stay: "Added" (primary), "On List" (accent), "Retry" (danger).

**Acceptance:** Titles wrap to 2 lines; badge sits in the footer row; toolbar hidden when clip server unavailable; adding a deal creates a one-off (visible under "ONE-OFFS THIS WEEK" on Plan with a trash icon) and never a `GroceryItems` row; a second add of the same item shows "On List".

---

## Task 5: In-store aisle badge, wake-lock icon, invite/partner state (FB#50, FB#52, FB#45)

**File:** `src/components/InStoreMode.js` (+ `src/components/InStoreMode.test.js`).

**Bug A (FB#50):** `formatAisleBadge` returns `"—"` for empty locations, rendering "Eggs —". **Fix:** export `formatAisleBadge`; return `""` for null/empty; in `ItemRow` render the location `<span>` only when the badge string is non-empty (keep the `aria-label` on the row: `"Location unknown"` case stays on a visually-hidden `<span className="sr-only">` or on the button — either is fine, but no visible dash). Tests (TDD): `formatAisleBadge` for `null`, `""`, `"Aisle 14"`, `"In Produce on the Front Wall"` → `"Produce, Front"`.

**Bug B (FB#52):** the `<Smartphone>` wake-lock indicator in the header looks like a tappable button. **Fix:** remove it from the header. In `ModeMenu`, add a non-interactive footer line rendered only when `wakeLockActive` is true: `<div className="px-3 pt-2 pb-1 text-[11px] text-muted flex items-center gap-1.5"><Smartphone size={12}/> Screen stays awake while shopping</div>` (pass `wakeLockActive` down as a prop). Remove the `Smartphone` import if no longer used elsewhere.

**Bug C (FB#45):** opening "Invite partner" immediately stores a host session and the badge says "Shopping with partner · 4h left" even after Cancel and with nobody joined.
**Fix:**
1. `InviteModal`: do **not** write `HOST_SESSION_STORAGE_KEY` when the code is created. Write it only inside `handleCopy` (after the copy attempt, before closing). Cancel / X / backdrop simply close (no storage). The server-side row created on open is harmless (4h TTL) — leave it.
2. `partnerSession` state gets a `role`: `readJoinedSession()` → `{ ...s, role: "partner" }`, `readHostSession()` → `{ ...s, role: "host" }` (both at the initial state and in the `InviteModal onClose` refresh).
3. `PartnerBadge` takes `role` and shows: host → `"Invite link active"`; partner → `"Shopping with partner"`; both keep the `· Nh left` suffix. Update the component comment accordingly.

**Acceptance:** No dash after items without a location; no wake-lock icon in the header, note shown inside the ⋯ menu when active; opening Invite then Cancel leaves no badge and no `hostShoppingSession` in sessionStorage; after "Copy link" the badge reads "Invite link active · 4h left".

---

## Task 6: HEB Cart connection panel (FB#48)

**File:** `src/components/HebCart.js` (`StepIndicator` ~lines 20–50, `ConnectionPanel` ~lines 53–120, the `checkSession` callback ~line 461).

**Bug:** The expired-login state shows a developer instruction ("Run `npm run scrape:login` on the server…"), and the stepper hides step labels below `sm`.

**Fix:**
1. Stepper: always show labels; use `text-[11px] sm:text-sm` and shorter labels on mobile is not required — keep the existing labels ("Connect", "Match & Review", "Build Cart") but drop `hidden sm:inline`. Make sure the row still fits at 390px (labels may wrap under the circle: switch each step to `flex-col items-center gap-1 w-[72px] text-center` on mobile, row layout unchanged on `sm+` is acceptable but not required).
2. `ConnectionPanel` expired state (`!loginValid && !isActive`):
   - Title line: "HEB sign-in needed" (keep the `WifiOff` icon).
   - Subtitle: `Last connected {formatted sessionStatus.lastLoginAt}` if the status object carries such a field (check `checkSession`'s response shape: use whatever timestamp field exists, else omit the subtitle).
   - Body (`text-sm text-body`): "The saved HEB login has expired, so the cart builder can't search products yet. Sign in again from the computer, then tap **Check again**."
   - Primary button "Check again" (`RefreshCw` icon, `bg-primary text-white`, full-width on mobile, `min-h-[44px]`) that calls a new `onRecheck` prop wired to `checkSession` in the parent; show a spinner while the check is in flight (local `rechecking` state, cleared in `finally`).
   - A "Show technical details" disclosure (`ChevronDown`/`ChevronUp`, `text-xs text-muted`, `aria-expanded`) that toggles a `<code>` block containing `npm run scrape:login` and the sentence "Run this on the server, then re-check."
   - Remove the "Connect to HEB" button from the expired state (it is permanently disabled there); keep it for the `loginValid && !isActive` state.
3. No copy changes to other states.

**Acceptance:** At 390px the expired state reads as plain English with a working "Check again" button, the npm command is hidden until "Show technical details" is tapped, and the stepper shows labels.

---

## Task 7: Meals chat toolbar on mobile (FB#56)

**File:** `src/components/ChatBot.js` (toolbar ~lines 822–860).

**Bug:** The toolbar with "Meal Plans (n)" and "New Chat" is `hidden lg:flex`, so phones have no way to start a new session or see the plan count.

**Fix:** Render the toolbar on all sizes (`flex`), compact on mobile: `px-3 py-1.5 lg:px-4 lg:py-2`; the "Meal Plans" button keeps its count badge; "New Chat" keeps its confirm dialog. Keep `min-h-[44px]` on both buttons (use `min-h-[44px]` with `py-1.5` and vertical centering). The meals side-panel toggle on mobile should behave the same as desktop (if `showMealsPanel` is desktop-only in layout, keep the existing behaviour: on `<lg` the panel opens as it already does elsewhere in the file — do not build a new drawer; if it cannot open on mobile, disable that button below `lg` and keep only "New Chat" visible on mobile. State which you did in the report).

**Acceptance:** On a 390px viewport the Meals > AI Planner screen shows "New Chat" in the chat toolbar and clicking it prompts the confirm dialog. Desktop unchanged.

---

## Task 8: Plan desktop layout (FB#53)

**Files:** `src/components/StaplesScreen.js` (grid wrapper ~line 143), `src/components/staples/CategorySection.js`.

**Bug:** `lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4` makes every category a grid cell, so collapsed categories leave tall empty holes next to expanded ones.

**Fix:** Replace the wrapper classes with `lg:columns-2 xl:columns-3 lg:gap-4` and add `break-inside-avoid` to the root `<div>` of `CategorySection` (keep `mb-3`). Keep the mobile layout identical. Update/extend `StaplesScreen.test.js` only if a class assertion breaks.

**Acceptance:** At 1280px, collapsed category headers pack tightly under each other; no empty columns; mobile unchanged.

---

## Task 9: Feedback entry points replace the floating button (FB#42)

**Files:** `src/components/FeedbackFAB.js` (→ panel + provider), new `src/contexts/FeedbackContext.js`, `src/components/App.js`, `src/components/AppShell.js`, `src/components/Sidebar.js`, `src/components/InStoreMode.js` (`ModeMenu`), `src/components/FeedbackFAB.test.js`.

**Bug:** The fixed bottom-right FAB covers the Plan "Review" button (mobile and desktop), the Review overlay rows, the last Deals card's Add button, and Shop section chevrons.

**Fix — move feedback into the chrome, no floating button anywhere:**
1. `src/contexts/FeedbackContext.js`: `FeedbackProvider({ currentScreen, children })` owns `isOpen` and all the state currently inside `FeedbackFAB` (category, description, screenshots, capture, submit). Exposes `useFeedback()` → `{ openFeedback }`. It renders the existing panel + backdrop markup (moved out of `FeedbackFAB.js` into a `FeedbackPanel` component in the same file or in `FeedbackFAB.js` — keep the submit payload, screenshot capture on open, paste support, and toasts exactly as they are).
2. Remove the `motion.button` FAB entirely. Delete the `currentScreen`-based bottom offsets.
3. `App.js`: wrap the app (inside `ThemeProvider`, outside `HeaderProvider` and the Shop branch) with `<FeedbackProvider currentScreen={currentScreen}>`; remove both `<FeedbackFAB currentScreen=… />` usages. The join loading/error branches don't need feedback.
4. `AppShell.js` mobile header: add a button before `ThemeToggle`: `MessageSquarePlus` 20px, `aria-label="Send feedback"`, `min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-body hover:text-heading`, `onClick={openFeedback}`. The header stays 48px tall; the center slot keeps working (Meals pills).
5. `Sidebar.js` footer: add a "Send feedback" button above the theme toggle, same classes as the theme toggle button, `MessageSquarePlus` icon.
6. `InStoreMode.js` `ModeMenu`: add a third item "Send feedback" (`MessageSquarePlus` 16px) that closes the menu and calls `openFeedback` (get it via `useFeedback()` inside `InStoreMode` and pass as `onFeedback` prop).
7. Update `FeedbackFAB.test.js` (rename to `FeedbackPanel.test.js` if the component is renamed): test that `openFeedback` from the context opens the panel and that the header button in `AppShell` opens it (render `AppShell` inside `FeedbackProvider` + `HeaderProvider` + `ThemeProvider`). Keep whatever the existing tests mock (html2canvas etc.).
8. Keep the `FeedbackFAB.js` filename only if the component keeps that name; otherwise rename consistently and update imports.

**Acceptance:** No element with `aria-label="Send feedback"` is `position: fixed`; the header icon (mobile), sidebar link (desktop) and Shop ⋯ menu item all open the panel; submitting still POSTs the same payload; nothing overlaps the Plan Review bar.
