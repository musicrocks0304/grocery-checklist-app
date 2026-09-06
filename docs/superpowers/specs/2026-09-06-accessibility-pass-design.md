# Accessibility pass — design

Date: 2026-09-06. Sub-project G of the hardening program. Scope: keyboard and assistive-technology behaviour of the feedback panel, the invite modal, the Shop ⋯ menu and the Cart sign-in disclosure; 44 px minimum targets on seven secondary controls; a re-entry guard on `openFeedback`; keyboard e2e flows and a scoped axe audit. Visual design does not change.

## Goals

1. Both modal surfaces (feedback panel, invite modal) are real dialogs: `role="dialog"`, `aria-modal`, an accessible name, focus moves in on open, Tab never leaves, Escape closes, focus returns to the control that opened them.
2. The Shop ⋯ menu is a keyboard menu: focus moves to the first item on open, ArrowUp/ArrowDown move between items, Escape closes and returns focus to the ⋯ button.
3. The Cart "Show technical details" disclosure names what it controls.
4. Every secondary control the reviews measured below 44 px (Cook debug toggles ×2, Plan All/Clear, Cart disclosure, invite close, feedback close) meets 44×44 without changing its visual weight.
5. `openFeedback` cannot be re-entered while the panel is open; a second trigger focuses the textarea and leaves the screenshot and client id alone.
6. Jest (36 suites / 259 tests at start) and the hermetic Playwright suite (78 at start) stay green; new Jest tests cover the hook and each touched component; a new `e2e/a11y.spec.js` drives every flow above with the keyboard only and runs axe on the touched regions.

## Non-goals

- Whole-app axe enforcement (the scoped run prints, never fails on, violations outside the touched regions).
- Colour contrast, font sizes, copy changes beyond labels and ids.
- `inert` on the background while a dialog is open (the focus trap and `aria-modal` are sufficient for the two dialogs' sizes).
- Moving components into new files (sub-project D). `ModeMenu`, `InviteModal`, `FeedbackPanel` are edited in place.
- Voice check-off, the reorder drawer, the partner badge, ChatBot and MealCreator inputs.

## Decisions (2026-09-06)

| # | Question | Decision |
|---|----------|----------|
| 1 | Focus trap | Hand-rolled `src/hooks/useDialog.js`; no new runtime dependency |
| 2 | ⋯ menu | Escape + focus in/out + ArrowUp/ArrowDown; items are `role="menuitem"` buttons; Tab closes the menu and lets focus continue |
| 3 | 44 px targets | All seven listed in Goal 4; Deals Retry is already 44 px and is never rendered while `addStatus === 'adding'` (the status flips synchronously in `handleAddToList`), so it needs no change |
| 4 | Audit | `@axe-core/playwright` 4.13.0 (devDependency, exact) scoped to the open feedback panel, the open invite modal, the Shop screen with the menu open, and the Cart sign-in panel; fails only on `serious`/`critical` impact inside those regions |
| 5 | Escape on the feedback panel | Closes unconditionally, exactly like the backdrop click today; no discard confirmation |

## Current state (2026-09-06)

- `src/components/FeedbackPanel.js` (190 lines, presentational): backdrop `motion.div` with `onClick={onClose}`, panel `motion.div` with `data-feedback-panel`; h2 "Send Feedback"; close button `w-10 h-10` (40 px) with `aria-label="Close feedback"`; textarea via `textareaRef`; hidden file input (`className="hidden"`). No `role`, no `aria-modal`, no key handling. `FeedbackContext.openFeedback` sets `isOpen`, captures a screenshot, and focuses the textarea after a 300 ms `setTimeout`; calling it while open regenerates `clientIdRef` and replaces the screenshots. `handleClose` resets state after 300 ms.
- `InviteModal` (`src/components/InStoreMode.js:860`): backdrop `motion.div` `onClick={onClose}`, inner card `onClick={stopPropagation}`, title div "Invite a partner", close button `p-1` (about 26 px) `aria-label="Close"`. No `role`, no key handling. Opened from `ModeMenu.onInvite` (which closes the menu first), closed by `onClose`.
- `ModeMenu` (`InStoreMode.js:795`): three plain buttons, outside-click close on `mousedown`/`touchstart`, no key handling, no roles; trigger button has `aria-label="More"` and `aria-expanded` but no `aria-haspopup`/`aria-controls`. `onFeedback` calls `setShowMenu(false)` then `openFeedback()`.
- `ItemRow` check-offs are `<button role="checkbox" aria-checked>` — already keyboard-operable (Enter/Space). `AisleSection` headers are buttons with `aria-expanded`. A global `button:focus-visible` ring exists in `src/index.css:112`; 14 elements use `focus:outline-none` (inputs and textareas with their own ring).
- `HebCart.js:130-145`: disclosure button with `aria-expanded={showDetails}`, `text-xs`, no min height; the revealed block has no `id`.
- `RecipeInstructions.js:773-781` and `:980-988`: two debug toggle buttons (`text-sm`, no min size) rendered only when `debugMode`.
- `staples/CategorySection.js:36-42`: All/Clear button `text-xs px-2 py-1` (about 24 px tall).
- Tests: `src/components/FeedbackPanel.test.js` (renders the provider + AppShell, mocks `../utils/screenshot` and `../config/api`), `InStoreMode.test.js` (helpers, `ModeMenu`, `InviteModal`, `PartnerBadge`), `HebCart.test.js`, `staples/CategorySection.test.js`. `@testing-library/user-event` 13.5 (`userEvent.tab()`, `userEvent.keyboard('{esc}')`). Playwright 1.63 hermetic suite: `e2e/support/test.js` (`test`, `expect`, `open`), `backend` fixture, both viewports; `e2e/shop.spec.js` already opens the ⋯ menu and the invite modal; `e2e/feedback.spec.js` opens the panel via the visible trigger; `e2e/cart.spec.js` shows the sign-in panel with `backend.clip('expired')`.
- No Escape handler and no `role="dialog"` exist anywhere under `src/`.

## Design

### 1. `useDialog` — `src/hooks/useDialog.js`

```js
const { ref, dialogProps } = useDialog({ open, onClose, initialFocusRef, returnFocusRef });
// dialogProps = { role: 'dialog', 'aria-modal': true, tabIndex: -1, onKeyDown }
```

- **Opener capture.** When `open` becomes true, store `document.activeElement` in a ref (`openerRef`).
- **Initial focus.** In a layout effect after the container mounts (the container is inside `AnimatePresence`, so it exists only while open): focus `initialFocusRef.current` if present, else the first focusable, else the container itself (`tabIndex={-1}`). Focus is called with `{ preventScroll: true }`.
- **Focusable query** (exported as `getFocusable(container)` for tests): `a[href], button, input, textarea, select, [tabindex]` filtered to elements that are not `disabled`, do not have `tabindex="-1"`, and have no ancestor (inclusive) matching `[hidden], .hidden, [aria-hidden="true"]`. This keeps the hidden file input and desktop/mobile-only duplicates out without relying on layout, so it behaves identically in jsdom and Chromium.
- **Tab cycling.** `onKeyDown`: on `Tab`, compute focusables; if none, `preventDefault`; if `Shift+Tab` on the first (or the container), focus the last; if `Tab` on the last, focus the first. Other keys pass through.
- **Escape.** `onKeyDown`: on `Escape`, `stopPropagation` and call `onClose()`.
- **Return focus.** When `open` becomes false (effect cleanup), focus `openerRef.current` if `isConnected`, else `returnFocusRef?.current` if connected, else nothing. The restore runs synchronously at close time, before the exit animation unmounts anything.
- The hook owns no state and renders nothing; it never touches `document.body` or siblings.

### 2. Feedback panel and `FeedbackContext`

- `FeedbackPanel` receives `dialogRef` and `dialogProps` from the provider and spreads them on the panel `motion.div` (the animated element; the flex wrapper is untouched — see the file's load-bearing comment). The h2 gets `id="feedback-title"`; the panel gets `aria-labelledby="feedback-title"`. The backdrop gets `aria-hidden="true"`. Close button becomes `w-11 h-11` (44 px).
- `FeedbackProvider` calls `useDialog({ open: isOpen, onClose: handleClose, initialFocusRef: textareaRef, returnFocusRef })` and drops the 300 ms `setTimeout(() => textareaRef.current?.focus(), 300)`.
- `openFeedback(options)`:
  - If `isOpen` (tracked in a ref so the callback stays stable): focus the textarea and return without touching `clientIdRef`, `screenshots`, or `isCapturing`.
  - Optional `options.returnFocusTo` (an element) is stored in `returnFocusRef` before opening; used by Shop, whose menu item unmounts before the panel closes.
- Escape closes via the hook; behaviour identical to the backdrop click (Decision 5).

### 3. Invite modal, ⋯ menu, Cart disclosure

- **`InviteModal`** gains a `returnFocusRef` prop (the ⋯ trigger, passed by `InStoreMode`), calls `useDialog({ open: true, onClose, returnFocusRef })`, spreads `dialogProps` and `ref` on the inner card, `aria-labelledby="invite-title"` with the id on the title div. Close button becomes a 44×44 flex box (`w-11 h-11 -mt-2 -mr-2 flex items-center justify-center`). Initial focus lands on the first focusable (the close button while loading, then the operator can Tab to Copy).
- **`ModeMenu`**: container `role="menu"` with `id="shop-mode-menu"` and `aria-label="Shopping options"`; the three buttons `role="menuitem"`. On mount focus the first item. `onKeyDown` on the container: `ArrowDown`/`ArrowUp` move focus among the items (wrapping), `Home`/`End` jump, `Escape` calls `onClose()` and focuses `triggerRef.current`, `Tab` calls `onClose()` without preventing default. Outside-click closing stays. `InStoreMode` passes `triggerRef` (a new ref on the ⋯ button); the button gains `aria-haspopup="menu"` and `aria-controls="shop-mode-menu"`. `onFeedback` becomes `setShowMenu(false); openFeedback({ returnFocusTo: triggerRef.current })`; `onInvite` passes `returnFocusRef={triggerRef}` to the modal.
- **Cart disclosure**: button gains `aria-controls="heb-login-details"` and `min-h-[44px] -my-2` (the negative margin keeps the surrounding layout unchanged); the revealed block gets `id="heb-login-details"`.

### 4. 44 px targets

| Control | File | Change |
|---|---|---|
| Cook debug toggle (header) | `RecipeInstructions.js:773` | `min-h-[44px] min-w-[44px] justify-center` |
| Cook debug toggle (cooking mode) | `RecipeInstructions.js:980` | same |
| Plan All/Clear | `staples/CategorySection.js:36` | `min-h-[44px] min-w-[44px] px-3 -my-2` |
| Cart disclosure | `HebCart.js:131` | `min-h-[44px] -my-2` |
| Invite close | `InStoreMode.js:940` | `w-11 h-11 -mt-2 -mr-2 flex items-center justify-center` |
| Feedback close | `FeedbackPanel.js:78` | `w-11 h-11` |
| Deals Retry | `Deals.js:203` | none (already `min-h-[44px]`; not rendered during `adding`) |

Font sizes and icon sizes do not change; the negative margins compensate for the extra padding so rows keep their height.

### 5. Tests

**Jest**

- `src/hooks/useDialog.test.js`: a test dialog component; initial focus on `initialFocusRef`; first-focusable fallback; container fallback with `tabIndex=-1`; `userEvent.tab()` from the last element wraps to the first and `shift+tab` from the first wraps to the last; hidden (`.hidden`, `[hidden]`, `aria-hidden` ancestor) and disabled elements are skipped; Escape calls `onClose` once; closing returns focus to the opener; when the opener is disconnected, focus goes to `returnFocusRef`; `getFocusable` unit cases.
- `FeedbackPanel.test.js` (extend): the panel has `role="dialog"`, `aria-modal="true"`, and its accessible name is "Send Feedback"; Escape closes it; a second `openFeedback` while open calls `captureScreen` once and keeps the same `client_id` on submit; the close button has the 44 px classes.
- `InStoreMode.test.js` (extend): `ModeMenu` focuses its first item on mount, ArrowDown/ArrowUp cycle, Escape calls `onClose` and focuses the trigger; `InviteModal` has `role="dialog"` named "Invite a partner" and Escape calls `onClose`.
- `HebCart.test.js` (extend): the disclosure's `aria-controls` equals the id of the block that appears after a click.
- `staples/CategorySection.test.js` (extend): the All/Clear button carries the 44 px classes.

**Hermetic e2e** — `e2e/a11y.spec.js`, both viewports:

- Feedback: focus the visible "Send feedback" trigger, press Enter; the textarea is focused; press Tab eight times and assert `document.activeElement` stays inside `[role=dialog]` each time; press Escape; the trigger is focused again; no `submit_feedback` call.
- Shop: focus the "More" button, Enter; the first menuitem is focused; ArrowDown moves to "Invite partner"; Escape closes the menu and focuses "More". Then open the menu, ArrowDown, Enter (Invite); the dialog named "Invite a partner" appears and contains the focus; Escape closes it and focuses "More"; `create_session` was called once.
- Cart (`backend.clip('expired')`): the disclosure's `aria-controls` resolves to an element that becomes visible after Enter and whose text includes `npm run scrape:login`.
- Axe: `new AxeBuilder({ page }).include('[role="dialog"]')` on the open feedback panel and on the open invite modal; `.include('#shop-mode-menu')` plus the Shop header with the menu open; `.include('[data-testid="heb-signin-panel"]')` on the Cart sign-in panel (a `data-testid` is added to that container). Assert zero violations with `impact` `serious` or `critical`; print the rest with `console.log` so the report shows them. axe is injected from `node_modules` by the library (no network), so the catch-all route is unaffected.

**Gates**: `npm run lint` → Jest (zero `act()` warnings) → `npm run test:e2e` (78 + new) → `npm run test:e2e:live` once before merge (nothing server-side changes; this proves no regression in the three page-driven live specs).

### 6. Rollout

Branch `feat/accessibility-pass` off `main` (`490ea8d` or later); fast-forward into `main` after the whole-branch review; Netlify deploys; a headless load of `#plan` and `#shop` on the live bundle confirms no `client_errors` rows appear (E's telemetry is the regression signal). Checklist G ticked with a shipped-state paragraph.

## Risks

- **framer-motion and focus.** The panel animates from `y: 100%`; focusing the textarea during the spring is fine (focus does not depend on layout) but `preventScroll: true` avoids a jump. The exit animation keeps the dialog mounted for ~300 ms after `onClose`; the hook restores focus at close time, before that, so the opener never fights the unmount.
- **Two "Send feedback" triggers in the DOM** (mobile header icon, desktop sidebar; one hidden by Tailwind). The trap's `.hidden` ancestor filter is for elements inside the dialog only; the openers are outside. Return focus goes to whichever element was `activeElement`, which is the visible one.
- **`role="menu"` semantics** require the items to be `menuitem`s and the trigger to declare `aria-haspopup`; screen readers then announce "menu". Tab closing the menu matches the WAI-ARIA menu button pattern.
- **Axe noise.** The scoped includes keep pre-existing whole-app findings out of the gate; the printout gives sub-project D a list. If the feedback panel's category buttons (emoji plus label) trip a `serious` rule, the fix is an `aria-label` on the button, inside scope.
- **Negative margins** on the enlarged targets can overlap neighbours by 8 px; the hermetic screenshots on failure and the two-viewport run catch a broken row.
