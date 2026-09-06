# Accessibility pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The feedback panel and invite modal become real dialogs (focus trap, Escape, return focus), the Shop ⋯ menu becomes a keyboard menu, the Cart disclosure names its target, seven secondary controls reach 44 px, `openFeedback` cannot be re-entered, and keyboard-only e2e flows plus a scoped axe audit guard all of it.

**Architecture:** One framework-free hook, `src/hooks/useDialog.js`, owns focus capture, initial focus, Tab cycling, Escape and focus return; the two dialogs spread its props. `ModeMenu` gets its own small key handler (menu semantics differ from dialogs). Every other change is attributes and Tailwind classes. Tests: Jest with `@testing-library/user-event` 13 (`userEvent.tab()` honours `preventDefault`), and a new hermetic Playwright spec driving the flows with the keyboard plus `@axe-core/playwright` scoped to the touched regions.

**Tech Stack:** React 19 / react-scripts 5 (Jest 27, jsdom 16, Testing Library, user-event 13.5), framer-motion, Tailwind 3, `@playwright/test` 1.63 (Chromium), `@axe-core/playwright` 4.13.0.

**Spec:** `docs/superpowers/specs/2026-09-06-accessibility-pass-design.md` (approved 2026-09-06). Read its "Current state" (measured sizes, existing test files) and "Design" sections first; the Decisions table is binding.

Branch: `feat/accessibility-pass` off `main` (`2d1ec65` or later). Ledger: `.superpowers/sdd/2026-09-06-accessibility-pass/progress.md` (created by the SDD skill); mirror one task-complete line per task into `.superpowers/sdd/progress.md` as `[a11y] Task N: …`.

## Global Constraints

- **Visual design does not change.** Font sizes, icon sizes, colours and row heights stay; larger hit targets come from `min-h`/`min-w`/padding with compensating negative margins (`-my-2`, `-mt-2 -mr-2`). No new UI elements, no copy changes beyond `aria-label`s and `id`s.
- **Dialog contract** (`useDialog`): `role="dialog"`, `aria-modal="true"`, `tabIndex={-1}` on the container, `aria-labelledby` added by the caller; focus moves in on open (`initialFocusRef`, else first focusable, else the container); Tab/Shift+Tab wrap inside; Escape calls `onClose` and stops propagation; on close, focus returns to the element that was `document.activeElement` when the dialog opened if it is still connected, else to `returnFocusRef.current`, else nowhere. Focus calls use `{ preventScroll: true }`.
- **Focusable query**: `a[href], button, input, textarea, select, [tabindex]` minus `disabled`, `tabindex="-1"`, and anything with an inclusive ancestor matching `[hidden], .hidden, [aria-hidden="true"]`. Exported as `getFocusable(container)`. No layout-based checks (must behave identically in jsdom and Chromium).
- **Menu contract** (`ModeMenu`): container `role="menu"` `id="shop-mode-menu"` `aria-label="Shopping options"`; items `role="menuitem"`; first item focused on mount; ArrowDown/ArrowUp wrap, Home/End jump; Escape closes and focuses the trigger; Tab closes without `preventDefault`; outside click still closes. Trigger: `aria-haspopup="menu"`, `aria-controls="shop-mode-menu"`, `aria-expanded` (already present).
- **Escape on the feedback panel closes unconditionally** (Decision 5), identical to the backdrop click.
- **`openFeedback(options?)`**: when already open, focus the textarea and return without touching `clientIdRef`, screenshots or `isCapturing`; `options.returnFocusTo` (an `Element`) sets the return-focus fallback. It is also used as a raw `onClick` handler, so a React event object passed as `options` must be ignored.
- **44 px set** (Decision 3): Cook debug toggles ×2, Plan All/Clear, Cart disclosure, invite close, feedback close. Deals Retry: no change.
- **Axe** (Decision 4): `@axe-core/playwright` `4.13.0` exact devDependency; scoped `include`s only; fail on `impact` `serious`/`critical`; print the rest. Never a whole-page run in the gate.
- **Hermetic rules** (from B): every n8n/clip request is served by `e2e/support/mock-backend.js`; the `backend` fixture teardown fails a test on any unmocked path, missing `X-API-Key`, or third-party host. Axe injects its script from `node_modules` via `page.evaluate` (no network). Playwright runs in the **foreground** only; never the `live` project except once in Task 6.
- **Jest** mocks `global.fetch` via `src/test-utils/mockFetch.js` (`installMockFetch`/`restoreFetch`), never `apiFetch`/`apiJson`; react-scripts has `resetMocks: true`; zero `act()` warnings; `npm run lint` 0 warnings.
- **Gates before every commit touching `src/`:** `npm run lint` → `CI=true npx react-scripts test --watchAll=false` (36 suites / 259 tests at start). Before merge: `npm run test:e2e` (78 at start) → `npm run test:e2e:live` (4) → whole-branch review.
- **Commits:** one per task, `feat(a11y): …` / `test(a11y): …` / `docs: …`, ending with a blank line then `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage by explicit path; never `git add -A`/`git add .` (untracked scratch files in the repo root). Do not push until Task 6.
- **Shell:** Bash tool (Git Bash) from `C:\New Grocery App\grocery-checklist-app`.

---

## File map

| Path | Change | Responsibility |
|---|---|---|
| `src/hooks/useDialog.js` | create | dialog focus management hook + `getFocusable` |
| `src/hooks/useDialog.test.js` | create | hook tests |
| `src/components/FeedbackPanel.js` | modify | dialog attributes, 44 px close, `dialogRef`/`dialogProps` props |
| `src/contexts/FeedbackContext.js` | modify | `useDialog`, re-entry guard, `returnFocusTo` |
| `src/components/FeedbackPanel.test.js` | modify | dialog role/name, Escape, re-entry, close size |
| `src/components/InStoreMode.js` | modify | `ModeMenu` menu semantics + keys, trigger attrs, `InviteModal` dialog + 44 px close |
| `src/components/InStoreMode.test.js` | modify | `ModeMenu` and `InviteModal` a11y tests |
| `src/components/HebCart.js` | modify | `aria-controls`/`id`, 44 px disclosure, `data-testid="heb-signin-panel"` |
| `src/components/HebCart.test.js` | modify | `aria-controls` resolves |
| `src/components/RecipeInstructions.js` | modify | debug toggles 44 px + `aria-label` |
| `src/components/staples/CategorySection.js` | modify | All/Clear 44 px |
| `src/components/staples/CategorySection.test.js` | modify | class assertion |
| `package.json` | modify | `@axe-core/playwright` devDependency |
| `e2e/a11y.spec.js` | create | keyboard flows + scoped axe |
| `e2e/README.md` | modify | a11y spec documented |
| `docs/superpowers/hardening-checklist.md` | modify | G ticked |

---

### Task 1: `useDialog` hook with tests

**Files:**
- Create: `src/hooks/useDialog.js`
- Test: `src/hooks/useDialog.test.js`

**Interfaces:**
- Produces: `export default function useDialog({ open, onClose, initialFocusRef, returnFocusRef }) → { ref, dialogProps }` where `dialogProps = { role: 'dialog', 'aria-modal': true, tabIndex: -1, onKeyDown }`; `export function getFocusable(container) → HTMLElement[]`. Tasks 2 and 3 consume both.

- [ ] **Step 1: Write the failing tests**

`src/hooks/useDialog.test.js`:

```js
import React, { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useDialog, { getFocusable } from './useDialog';

// A page with an opener button, a dialog that mounts only while open (like
// AnimatePresence does), and a fallback element for return focus.
function Page({ initialOpen = false, useInitial = false, withFallback = false, empty = false }) {
  const [open, setOpen] = useState(initialOpen);
  const initialRef = useRef(null);
  const fallbackRef = useRef(null);
  const { ref, dialogProps } = useDialog({
    open,
    onClose: () => setOpen(false),
    initialFocusRef: useInitial ? initialRef : undefined,
    returnFocusRef: withFallback ? fallbackRef : undefined,
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>opener</button>
      <button type="button" ref={fallbackRef}>fallback</button>
      {open && (
        <div ref={ref} {...dialogProps} aria-labelledby="t">
          <h2 id="t">Dialog</h2>
          {!empty && (
            <>
              <button type="button">first</button>
              <input placeholder="middle" ref={initialRef} />
              <button type="button" disabled>disabled</button>
              <div className="hidden"><button type="button">hidden-class</button></div>
              <div hidden><button type="button">hidden-attr</button></div>
              <div aria-hidden="true"><button type="button">aria-hidden</button></div>
              <button type="button" tabIndex={-1}>minus-one</button>
              <button type="button">last</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const dialog = () => screen.getByRole('dialog');
const byName = (n) => screen.getByRole('button', { name: n });

describe('getFocusable', () => {
  test('skips disabled, tabindex=-1, and hidden ancestors', () => {
    render(<Page initialOpen />);
    expect(getFocusable(dialog()).map((el) => el.textContent || el.placeholder)).toEqual(['first', 'middle', 'last']);
    expect(getFocusable(null)).toEqual([]);
  });
});

describe('useDialog', () => {
  test('has dialog attributes and focuses the first focusable on open', () => {
    render(<Page />);
    byName('opener').focus();
    fireEvent.click(byName('opener'));
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(dialog()).toHaveAttribute('tabindex', '-1');
    expect(byName('first')).toHaveFocus();
  });

  test('focuses initialFocusRef when given, and the container when nothing is focusable', () => {
    const { unmount } = render(<Page useInitial />);
    fireEvent.click(byName('opener'));
    expect(screen.getByPlaceholderText('middle')).toHaveFocus();
    unmount();
    render(<Page empty />);
    fireEvent.click(byName('opener'));
    expect(dialog()).toHaveFocus();
  });

  test('Tab wraps last → first and Shift+Tab wraps first → last', () => {
    render(<Page />);
    fireEvent.click(byName('opener'));
    byName('last').focus();
    userEvent.tab();
    expect(byName('first')).toHaveFocus();
    userEvent.tab({ shift: true });
    expect(byName('last')).toHaveFocus();
    userEvent.tab();
    expect(byName('first')).toHaveFocus();
    userEvent.tab();
    expect(screen.getByPlaceholderText('middle')).toHaveFocus();
  });

  test('Escape closes and focus returns to the opener', () => {
    render(<Page />);
    byName('opener').focus();
    fireEvent.click(byName('opener'));
    expect(byName('first')).toHaveFocus();
    userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(byName('opener')).toHaveFocus();
  });

  test('Escape does not bubble past the dialog', () => {
    const outer = jest.fn();
    render(<div onKeyDown={outer}><Page /></div>);
    fireEvent.click(byName('opener'));
    userEvent.keyboard('{Escape}');
    expect(outer).not.toHaveBeenCalled();
  });

  test('when the opener is gone, focus returns to returnFocusRef', () => {
    function Wrapper() {
      const [showOpener, setShowOpener] = useState(true);
      return (
        <div>
          {showOpener && <button type="button" onClick={() => setShowOpener(false)}>temporary</button>}
          <Page withFallback />
        </div>
      );
    }
    render(<Wrapper />);
    byName('temporary').focus();
    fireEvent.click(byName('opener'));   // opener captured = "temporary" (jsdom clicks do not move focus)
    fireEvent.click(byName('temporary')); // removes it; the dialog stays open
    userEvent.keyboard('{Escape}');
    expect(byName('fallback')).toHaveFocus();
  });

  test('restores focus (to the fallback) when the dialog unmounts while open', () => {
    function Unmounter() {
      const [show, setShow] = useState(true);
      return (
        <div>
          <button type="button" onClick={() => setShow(false)}>kill</button>
          {show && <Page initialOpen withFallback />}
        </div>
      );
    }
    render(<Unmounter />);
    // Mounted open: the opener captured at mount is document.body, so the
    // fallback is the only restore target once the dialog unmounts.
    expect(byName('first')).toHaveFocus();
    fireEvent.click(byName('kill'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(byName('fallback')).toHaveFocus();
  });
});
```

Note on the "opener is gone" test: in jsdom, `fireEvent.click` does not move focus, so the active element when the dialog opens is whatever the test focused last. That test focuses `temporary`, opens the dialog (opener captured = `temporary`), removes `temporary`, then closes: the captured opener is disconnected, so focus must land on `fallback`. Keep the sequence exactly: focus temporary → click opener → click temporary (removes it; the dialog stays open) → Escape.

- [ ] **Step 2: Run to see it fail**

```bash
CI=true npx react-scripts test --watchAll=false src/hooks/useDialog.test.js 2>&1 | tail -15
```
Expected: FAIL, `Cannot find module './useDialog'`.

- [ ] **Step 3: Write the hook**

`src/hooks/useDialog.js`:

```js
// Accessible dialog behaviour (hardening sub-project G): focus capture on
// open, initial focus, Tab/Shift+Tab trapped inside, Escape → onClose, and
// focus returned to the opener (or a fallback) on close. Framework-free: it
// renders nothing, never touches document.body or siblings, and uses no
// layout queries, so it behaves identically in jsdom and Chromium.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const SELECTOR = 'a[href], button, input, textarea, select, [tabindex]';
const HIDDEN = '[hidden], .hidden, [aria-hidden="true"]';

/** Keyboard-reachable descendants of `container`, in DOM order. */
export function getFocusable(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return [];
  return Array.from(container.querySelectorAll(SELECTOR)).filter((el) => {
    if (el.disabled) return false;
    if (el.getAttribute('tabindex') === '-1') return false;
    if (el.closest(HIDDEN)) return false;
    return true;
  });
}

function focusEl(el) {
  if (!el || typeof el.focus !== 'function') return;
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
}

export default function useDialog({ open, onClose, initialFocusRef, returnFocusRef } = {}) {
  const ref = useRef(null);
  const openerRef = useRef(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnRef = useRef(returnFocusRef);
  returnRef.current = returnFocusRef;

  const restore = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    const fallback = returnRef.current && returnRef.current.current;
    if (opener && opener.isConnected && opener !== document.body) focusEl(opener);
    else if (fallback && fallback.isConnected) focusEl(fallback);
  }, []);

  // Runs after the dialog's DOM is committed (child effects run before the
  // parent's), so `ref.current` is populated when `open` turns true.
  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      openerRef.current = typeof document !== 'undefined' ? document.activeElement : null;
      const target = (initialFocusRef && initialFocusRef.current) || getFocusable(ref.current)[0] || ref.current;
      focusEl(target);
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      restore();
    }
  }, [open, initialFocusRef, restore]);

  // A dialog that unmounts while still "open" (InviteModal is mounted only
  // while shown) restores focus on unmount.
  useEffect(() => () => { if (wasOpenRef.current) { wasOpenRef.current = false; restore(); } }, [restore]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (onCloseRef.current) onCloseRef.current();
      return;
    }
    if (e.key !== 'Tab') return;
    const container = ref.current;
    const items = getFocusable(container);
    if (items.length === 0) { e.preventDefault(); focusEl(container); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = container && container.contains(active);
    if (e.shiftKey) {
      if (!inside || active === first || active === container) { e.preventDefault(); focusEl(last); }
    } else if (!inside || active === last) {
      e.preventDefault(); focusEl(first);
    }
  }, []);

  return { ref, dialogProps: { role: 'dialog', 'aria-modal': true, tabIndex: -1, onKeyDown } };
}
```

- [ ] **Step 4: Run to see it pass**

```bash
CI=true npx react-scripts test --watchAll=false src/hooks/useDialog.test.js 2>&1 | tail -20
```
Expected: PASS, 8 tests. If `userEvent.tab()` does not honour `preventDefault` on this user-event build, switch those assertions to `fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey })` and report the substitution.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint && git add src/hooks/useDialog.js src/hooks/useDialog.test.js && git commit -m "feat(a11y): useDialog hook (focus trap, Escape, return focus)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Feedback panel as a dialog; `openFeedback` re-entry guard

**Files:**
- Modify: `src/components/FeedbackPanel.js` (panel `motion.div`, h2, close button), `src/contexts/FeedbackContext.js` (`openFeedback`, `handleClose`, render), `src/components/FeedbackPanel.test.js`

**Interfaces:**
- Consumes: `useDialog` from Task 1.
- Produces: `openFeedback(options?)` with `options.returnFocusTo: Element`; `FeedbackPanel` props `dialogRef`, `dialogProps` (spread onto the panel). Task 3 calls `openFeedback({ returnFocusTo })`.

- [ ] **Step 1: Write the failing tests** — append to the `describe` in `src/components/FeedbackPanel.test.js` (add `import userEvent from '@testing-library/user-event';` to the imports):

```js
  test('the panel is a labelled modal dialog with a 44px close button', async () => {
    renderWithProviders(<Opener />);
    fireEvent.click(screen.getByText('open from context'));
    const dialog = await screen.findByRole('dialog', { name: 'Send Feedback' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close feedback' }).className).toMatch(/\bw-11\b/);
    expect(screen.getByRole('button', { name: 'Close feedback' }).className).toMatch(/\bh-11\b/);
  });

  test('the textarea is focused on open and Escape closes the panel, returning focus to the opener', async () => {
    renderWithProviders(<Opener />);
    const opener = screen.getByText('open from context');
    opener.focus();
    fireEvent.click(opener);
    const textarea = await screen.findByPlaceholderText('What happened? What would make it better?');
    await waitFor(() => expect(textarea).toHaveFocus());
    userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  test('openFeedback while open is a no-op for capture and client_id', async () => {
    const { apiJson } = require('../config/api');
    apiJson.mockResolvedValue({ success: true });
    renderWithProviders(<Opener />);
    await openAndFill();
    fireEvent.click(screen.getByText('open from context'));
    fireEvent.click(screen.getByText('open from context'));
    await waitFor(() => expect(captureScreen).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText('What happened? What would make it better?')).toHaveValue('it broke');
    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));
    await waitFor(() => expect(apiJson).toHaveBeenCalledTimes(1));
    expect(JSON.parse(apiJson.mock.calls[0][1].body).client_id).toMatch(V4);
  });

  test('a React event passed to openFeedback is ignored as options', async () => {
    renderWithProviders(<Opener />);
    fireEvent.click(screen.getByText('open from context')); // Opener passes the click event straight through
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to see them fail**

```bash
CI=true npx react-scripts test --watchAll=false src/components/FeedbackPanel.test.js 2>&1 | grep -E "✕|✓|Tests:"
```
Expected: the four new tests fail (no `dialog` role; `captureScreen` called twice).

- [ ] **Step 3: Implement**

`src/contexts/FeedbackContext.js`:

```js
import useDialog from '../hooks/useDialog';
```
inside `FeedbackProvider`, after the existing refs:

```js
  const handleCloseRef = useRef(() => {});
  const isOpenRef = useRef(false);
  const returnFocusRef = useRef(null);
  const { ref: dialogRef, dialogProps } = useDialog({ open: isOpen, onClose: () => handleCloseRef.current(), initialFocusRef: textareaRef, returnFocusRef });
```

replace `openFeedback`:

```js
  const openFeedback = useCallback(async (options) => {
    // Re-entry guard: a second trigger (keyboard users can Tab back to the
    // header button) must not re-capture the screen or reset the client id.
    if (isOpenRef.current) {
      textareaRef.current?.focus({ preventScroll: true });
      return;
    }
    const returnFocusTo = options && typeof options === 'object' && options.returnFocusTo instanceof Element ? options.returnFocusTo : null;
    returnFocusRef.current = returnFocusTo;
    isOpenRef.current = true;
    clientIdRef.current = randomUUID();
    setIsCapturing(true);
    setIsOpen(true);
    // Auto-capture screenshot of current screen
    const img = await captureScreen();
    if (img) {
      setScreenshots([img]);
    }
    setIsCapturing(false);
  }, []);
```

replace `handleClose` and keep the ref in sync:

```js
  const handleClose = useCallback(() => {
    isOpenRef.current = false;
    setIsOpen(false);
    // Delay reset so exit animation plays
    setTimeout(reset, 300);
  }, [reset]);
  handleCloseRef.current = handleClose;
```

In the render, pass `dialogRef={dialogRef}` and `dialogProps={dialogProps}` to `<FeedbackPanel>`.

`src/components/FeedbackPanel.js`: add `dialogRef` and `dialogProps` to the destructured props; on the panel `motion.div` add `ref={dialogRef}`, `{...dialogProps}`, `aria-labelledby="feedback-title"`; the h2 gets `id="feedback-title"`; the backdrop `motion.div` gets `aria-hidden="true"`; the close button class `w-10 h-10` → `w-11 h-11`. `dialogProps` must be spread AFTER framer-motion's props and before `className` so `onKeyDown` lands on the element (framer-motion forwards unknown props and `ref`).

- [ ] **Step 4: Run the file, then the full Jest suite and lint**

```bash
CI=true npx react-scripts test --watchAll=false src/components/FeedbackPanel.test.js 2>&1 | grep -E "✕|Tests:"
CI=true npx react-scripts test --watchAll=false 2>&1 | grep -E "Tests:|Test Suites:|act\(|✕"
npm run lint
```
Expected: 12 tests in the file; suite `37 passed` / `271 passed` (259 + 8 + 4); no `act(` lines; lint clean. If the Escape test's focus assertion fails because framer-motion keeps the exiting panel mounted, the return-focus still ran at close time — assert `opener` focus before the `queryByRole` wait instead, and report it.

- [ ] **Step 5: Commit**

```bash
git add src/components/FeedbackPanel.js src/contexts/FeedbackContext.js src/components/FeedbackPanel.test.js && git commit -m "feat(a11y): feedback panel is a modal dialog; openFeedback re-entry guard

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Shop ⋯ menu keyboard semantics and the invite dialog

**Files:**
- Modify: `src/components/InStoreMode.js` (`ModeMenu` ~795-850, `InviteModal` ~860-990, the ⋯ trigger block ~1815-1845, the `InviteModal` usage ~1890), `src/components/InStoreMode.test.js`

**Interfaces:**
- Consumes: `useDialog` (Task 1), `openFeedback({ returnFocusTo })` (Task 2).
- Produces: `ModeMenu` prop `triggerRef`; `InviteModal` prop `returnFocusRef`; ids `shop-mode-menu`, `invite-title`.

- [ ] **Step 1: Write the failing tests** — append to `src/components/InStoreMode.test.js` (imports: add `React`, `render, screen, fireEvent, waitFor` from `@testing-library/react`, `userEvent` from `@testing-library/user-event`, `'@testing-library/jest-dom'`, `{ ModeMenu, InviteModal }` from `./InStoreMode`, `{ installMockFetch, restoreFetch }` from `../test-utils/mockFetch`):

```js
describe('ModeMenu keyboard', () => {
  function Host({ onClose = () => {}, onInvite = () => {} }) {
    const triggerRef = React.useRef(null);
    return (
      <div>
        <button type="button" ref={triggerRef} aria-label="More">more</button>
        <ModeMenu onReorder={() => {}} onInvite={onInvite} onFeedback={() => {}} onClose={onClose} wakeLockActive={false} triggerRef={triggerRef} />
      </div>
    );
  }
  test('is a menu of menuitems and focuses the first item on mount', () => {
    render(<Host />);
    const menu = screen.getByRole('menu', { name: 'Shopping options' });
    expect(menu).toHaveAttribute('id', 'shop-mode-menu');
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent.trim())).toEqual(['Reorder aisles', 'Invite partner', 'Send feedback']);
    expect(items[0]).toHaveFocus();
  });
  test('ArrowDown/ArrowUp wrap, Home/End jump', () => {
    render(<Host />);
    const items = screen.getAllByRole('menuitem');
    userEvent.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(items[0]).toHaveFocus();
    userEvent.keyboard('{ArrowUp}');
    expect(items[2]).toHaveFocus();
    userEvent.keyboard('{Home}');
    expect(items[0]).toHaveFocus();
    userEvent.keyboard('{End}');
    expect(items[2]).toHaveFocus();
  });
  test('Escape closes and returns focus to the trigger; Tab closes without preventing default', () => {
    const onClose = jest.fn();
    render(<Host onClose={onClose} />);
    userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();
    screen.getAllByRole('menuitem')[0].focus();
    const notPrevented = fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(notPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('InviteModal dialog', () => {
  afterEach(restoreFetch);
  test('is a labelled modal dialog with a 44px close button; Escape calls onClose', async () => {
    installMockFetch({ create_session: { code: 'AB12', week_start_date: '2026-09-06', expires_at: '2026-09-06 23:59:59' } });
    const onClose = jest.fn();
    render(<InviteModal weekStartDate="2026-09-06" onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Invite a partner' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.className).toMatch(/\bw-11\b/);
    expect(close.className).toMatch(/\bh-11\b/);
    expect(close).toHaveFocus();
    await waitFor(() => expect(screen.getByText(/AB12/)).toBeInTheDocument());
    userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

```bash
CI=true npx react-scripts test --watchAll=false src/components/InStoreMode.test.js 2>&1 | grep -E "✕|✓|Tests:"
```
Expected: the four new tests fail (no `menu`/`dialog` roles).

- [ ] **Step 3: Implement in `src/components/InStoreMode.js`**

Add the import: `import useDialog from "../hooks/useDialog";`

`ModeMenu`:

```js
export const ModeMenu = ({ onReorder, onInvite, onFeedback, onClose, wakeLockActive, triggerRef }) => {
  const menuRef = useRef(null);
  useEffect(() => {
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [onClose]);
  // Menu-button pattern: focus moves into the menu when it opens.
  useEffect(() => {
    const first = menuRef.current?.querySelector('[role="menuitem"]');
    if (first) { try { first.focus({ preventScroll: true }); } catch { first.focus(); } }
  }, []);
  const handleKeyDown = (e) => {
    const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || []);
    const i = items.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      triggerRef?.current?.focus();
    } else if (e.key === "Tab") {
      onClose(); // let the browser move focus on
    }
  };
  return (
    <motion.div
      ref={menuRef}
      role="menu"
      id="shop-mode-menu"
      aria-label="Shopping options"
      onKeyDown={handleKeyDown}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="absolute right-2.5 top-[58px] z-30 w-[200px] bg-surface border border-default rounded-[14px] shadow-warm-lg p-1.5"
    >
```
and add `role="menuitem"` to each of the three buttons (keep their existing `onClick`, `aria-label`, classes and icons).

`InviteModal`: signature `({ weekStartDate, onClose, returnFocusRef })`; after the state hooks add
```js
  const { ref: dialogRef, dialogProps } = useDialog({ open: true, onClose, returnFocusRef });
```
On the inner card `motion.div` add `ref={dialogRef} {...dialogProps} aria-labelledby="invite-title"`; the title div gets `id="invite-title"`; the close button class becomes `"w-11 h-11 -mt-2 -mr-2 flex items-center justify-center text-muted hover:text-heading"`; the backdrop `motion.div` gets `aria-hidden="true"`.

The ⋯ trigger block: declare `const menuTriggerRef = useRef(null);` with the other refs in the main component; on the "More" button add `ref={menuTriggerRef} aria-haspopup="menu" aria-controls="shop-mode-menu"`; pass `triggerRef={menuTriggerRef}` to `<ModeMenu>`; change `onFeedback` to
```js
                onFeedback={() => {
                  setShowMenu(false);
                  openFeedback({ returnFocusTo: menuTriggerRef.current });
                }}
```
and pass `returnFocusRef={menuTriggerRef}` to `<InviteModal>`.

- [ ] **Step 4: Run the file, the full suite, lint**

```bash
CI=true npx react-scripts test --watchAll=false src/components/InStoreMode.test.js src/components/FeedbackPanel.test.js 2>&1 | grep -E "✕|Tests:"
CI=true npx react-scripts test --watchAll=false 2>&1 | grep -E "Tests:|Test Suites:|act\(|✕"
npm run lint
```
Expected: `275 passed` (271 + 4), no `act(` lines (wrap the `InviteModal` render in the existing `waitFor` for the code text so the `create_session` resolution is awaited), lint clean. The pre-existing "Shop menu 'Send feedback' calls the handler" test in `FeedbackPanel.test.js` renders `ModeMenu` without `triggerRef` — it must still pass (the prop is optional).

- [ ] **Step 5: Commit**

```bash
git add src/components/InStoreMode.js src/components/InStoreMode.test.js && git commit -m "feat(a11y): Shop menu keyboard semantics; invite modal is a dialog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Cart disclosure, Cook debug toggles, Plan All/Clear

**Files:**
- Modify: `src/components/HebCart.js:88-146`, `src/components/HebCart.test.js`, `src/components/RecipeInstructions.js:773-781` and `:980-988`, `src/components/staples/CategorySection.js:36-42`, `src/components/staples/CategorySection.test.js`

**Interfaces:**
- Produces: `id="heb-login-details"`, `data-testid="heb-signin-panel"` (Task 5's axe include), `aria-label="Toggle debug log"` on both Cook toggles.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/HebCart.test.js`:

```js
test('the sign-in panel disclosure names the block it reveals', async () => {
  installMockFetch({ '/api/heb/session/status': expired, '/api/heb/weekly-items': weekly, '/api/heb/matches/all': { matches: [] } });
  renderWithProviders(<HebCart onNavigate={() => {}} />);
  expect(await screen.findByText('HEB sign-in needed')).toBeInTheDocument();
  const disclosure = screen.getByRole('button', { name: 'Show technical details' });
  expect(disclosure.className).toMatch(/min-h-\[44px\]/);
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  const id = disclosure.getAttribute('aria-controls');
  expect(id).toBe('heb-login-details');
  expect(document.getElementById(id)).toBeNull();
  fireEvent.click(disclosure);
  expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  expect(document.getElementById(id)).toHaveTextContent('npm run scrape:login');
  expect(screen.getByTestId('heb-signin-panel')).toContainElement(disclosure);
});
```

Append to `src/components/staples/CategorySection.test.js` inside the describe:

```js
  test('the All/Clear control is at least 44px', () => {
    render(<CategorySection group={group} selected={new Set()} onToggle={() => {}} onToggleAll={() => {}} />);
    const btn = screen.getByRole('button', { name: 'All' });
    expect(btn.className).toMatch(/min-h-\[44px\]/);
    expect(btn.className).toMatch(/min-w-\[44px\]/);
  });
```

Create `src/components/RecipeInstructions.a11y.test.js`:

```js
import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import RecipeInstructions from './RecipeInstructions';

afterEach(restoreFetch);

test('the Cook debug toggle is labelled and at least 44px', async () => {
  installMockFetch({ choose_recipe_instructions: [], grab_instructions_fast: {} });
  renderWithProviders(<RecipeInstructions onNavigate={() => {}} recipeId={null} selectedMeals={[]} debugMode />);
  const toggles = await screen.findAllByRole('button', { name: 'Toggle debug log' });
  expect(toggles.length).toBeGreaterThanOrEqual(1);
  for (const t of toggles) {
    expect(t.className).toMatch(/min-h-\[44px\]/);
    expect(t.className).toMatch(/min-w-\[44px\]/);
  }
});
```
If `RecipeInstructions` needs other mocked endpoints to render its selection screen, add them to the `installMockFetch` map with empty arrays/objects and report which; the assertion is only about the toggle.

- [ ] **Step 2: Run to see them fail**

```bash
CI=true npx react-scripts test --watchAll=false src/components/HebCart.test.js src/components/staples/CategorySection.test.js src/components/RecipeInstructions.a11y.test.js 2>&1 | grep -E "✕|✓|Tests:"
```
Expected: the three new tests fail.

- [ ] **Step 3: Implement**

`src/components/HebCart.js`: the `ConnectionPanel` root `<div className="bg-surface rounded-2xl …">` gains `data-testid="heb-signin-panel"`; the disclosure button gains `aria-controls="heb-login-details"` and its class becomes `"inline-flex items-center gap-1 text-xs text-muted hover:text-body transition-colors min-h-[44px] -my-2"`; the revealed `<div className="mt-2 text-xs …">` gains `id="heb-login-details"`.

`src/components/RecipeInstructions.js`: both debug toggle buttons gain `type="button"`, `aria-label="Toggle debug log"`, `aria-expanded={showDebug}`, and `min-h-[44px] min-w-[44px] justify-center` appended to their className.

`src/components/staples/CategorySection.js`: the All/Clear button class becomes `"text-xs font-medium text-muted hover:text-body px-3 min-h-[44px] min-w-[44px] -my-2 ml-1 rounded inline-flex items-center justify-center"`.

- [ ] **Step 4: Run the files, full suite, lint**

```bash
CI=true npx react-scripts test --watchAll=false src/components/HebCart.test.js src/components/staples/CategorySection.test.js src/components/RecipeInstructions.a11y.test.js 2>&1 | grep -E "✕|Tests:"
CI=true npx react-scripts test --watchAll=false 2>&1 | grep -E "Tests:|Test Suites:|act\(|✕"
npm run lint
```
Expected: `38 suites` / `278 passed` (275 + 3), no `act(` lines, lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/HebCart.js src/components/HebCart.test.js src/components/RecipeInstructions.js src/components/RecipeInstructions.a11y.test.js src/components/staples/CategorySection.js src/components/staples/CategorySection.test.js && git commit -m "feat(a11y): Cart disclosure aria-controls; 44px Cook debug and Plan All/Clear controls

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Keyboard e2e flows and scoped axe audit

**Files:**
- Modify: `package.json` (devDependencies), `package-lock.json`, `e2e/README.md`
- Create: `e2e/a11y.spec.js`

**Interfaces:**
- Consumes: everything from Tasks 2–4 (`role=dialog` names "Send Feedback" / "Invite a partner", `#shop-mode-menu`, `aria-controls="heb-login-details"`, `[data-testid="heb-signin-panel"]`).

- [ ] **Step 1: Install the audit library**

```bash
npm install --save-dev --save-exact @axe-core/playwright@4.13.0 2>&1 | tail -2 && grep -n "axe-core" package.json
```
Expected: `"@axe-core/playwright": "4.13.0"` in devDependencies.

- [ ] **Step 2: Write the spec**

`e2e/a11y.spec.js`:

```js
const { test, expect, open } = require('./support/test.js');
const AxeBuilder = require('@axe-core/playwright').default;

// Keyboard-only flows for the surfaces sub-project G touched, plus a scoped
// axe audit. axe is injected from node_modules by the library (page.evaluate),
// so the hermetic catch-all never sees a network request.

const feedbackTrigger = (page) => page.getByRole('button', { name: 'Send feedback' }).filter({ visible: true }).first();
const activeInside = (page, selector) => page.evaluate((s) => !!(document.activeElement && document.activeElement.closest(s)), selector);

async function expectNoSeriousViolations(page, include, label) {
  const results = await new AxeBuilder({ page }).include(include).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const rest = results.violations.filter((v) => !blocking.includes(v));
  if (rest.length) console.log(`[axe ${label}] non-blocking: ${rest.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`).join(', ')}`);
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), `axe ${label}`).toEqual([]);
}

test.describe('Accessibility', () => {
  test('feedback panel: keyboard open, trapped Tab, Escape returns focus', async ({ page, backend }) => {
    await open(page, 'plan');
    const trigger = feedbackTrigger(page);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Send Feedback' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByPlaceholder('What happened? What would make it better?')).toBeFocused();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await activeInside(page, '[role="dialog"]'), `Tab #${i + 1} stayed inside`).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await activeInside(page, '[role="dialog"]')).toBe(true);
    await expectNoSeriousViolations(page, '[role="dialog"]', 'feedback panel');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(backend.calls('submit_feedback')).toHaveLength(0);
  });

  test('a second activation of the feedback trigger does not re-capture', async ({ page, backend }) => {
    await open(page, 'plan');
    const trigger = feedbackTrigger(page);
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'Send Feedback' })).toBeVisible();
    const before = await page.locator('[role="dialog"] img').count();
    await trigger.focus({ timeout: 1000 }).catch(() => {});
    await trigger.dispatchEvent('click');
    await page.waitForTimeout(400);
    expect(await page.locator('[role="dialog"] img').count()).toBe(before);
    await expect(page.getByPlaceholder('What happened? What would make it better?')).toBeFocused();
  });

  test('Shop menu: focus in, arrows, Escape returns focus; Invite dialog via keyboard', async ({ page, backend }) => {
    await open(page, 'shop');
    const more = page.getByRole('button', { name: 'More' });
    await expect(more).toHaveAttribute('aria-haspopup', 'menu');
    await expect(more).toHaveAttribute('aria-controls', 'shop-mode-menu');
    await more.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Shopping options' });
    await expect(menu).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Reorder aisles' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Invite partner' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('menuitem', { name: 'Send feedback' })).toBeFocused();
    await expectNoSeriousViolations(page, '#shop-mode-menu', 'shop menu');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const invite = page.getByRole('dialog', { name: 'Invite a partner' });
    await expect(invite).toBeVisible();
    await expect(invite).toHaveAttribute('aria-modal', 'true');
    expect(await activeInside(page, '[role="dialog"]')).toBe(true);
    await expect(invite.getByText('E2E1')).toBeVisible();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await activeInside(page, '[role="dialog"]'), `Tab #${i + 1} stayed inside`).toBe(true);
    }
    await expectNoSeriousViolations(page, '[role="dialog"]', 'invite modal');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(more).toBeFocused();
    expect(backend.calls('create_session')).toHaveLength(1);
  });

  test('Shop menu: Send feedback via keyboard returns focus to More on Escape', async ({ page, backend }) => {
    await open(page, 'shop');
    const more = page.getByRole('button', { name: 'More' });
    await more.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Send Feedback' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(more).toBeFocused();
    expect(backend.calls('submit_feedback')).toHaveLength(0);
  });

  test('Cart sign-in disclosure names the block it reveals', async ({ page, backend }) => {
    await open(page, 'cart');
    const main = page.locator('main');
    await expect(main.getByText('HEB sign-in needed')).toBeVisible();
    const disclosure = main.getByRole('button', { name: 'Show technical details' });
    const id = await disclosure.getAttribute('aria-controls');
    expect(id).toBe('heb-login-details');
    await expect(page.locator(`#${id}`)).toHaveCount(0);
    await disclosure.focus();
    await page.keyboard.press('Enter');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`#${id}`)).toContainText('npm run scrape:login');
    const box = await disclosure.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expectNoSeriousViolations(page, '[data-testid="heb-signin-panel"]', 'cart sign-in panel');
  });

  test('enlarged secondary controls measure at least 44px', async ({ page, backend }) => {
    await open(page, 'plan');
    const allClear = page.locator('main').getByRole('button', { name: /^(All|Clear)$/ }).first();
    const b1 = await allClear.boundingBox();
    expect(b1.height).toBeGreaterThanOrEqual(44);
    expect(b1.width).toBeGreaterThanOrEqual(44);
    await feedbackTrigger(page).click();
    const close = page.getByRole('button', { name: 'Close feedback' });
    const b2 = await close.boundingBox();
    expect(b2.height).toBeGreaterThanOrEqual(44);
    expect(b2.width).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await open(page, 'shop');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Invite partner' }).click();
    const inviteClose = page.getByRole('dialog').getByRole('button', { name: 'Close' });
    const b3 = await inviteClose.boundingBox();
    expect(b3.height).toBeGreaterThanOrEqual(44);
    expect(b3.width).toBeGreaterThanOrEqual(44);
  });
});
```

- [ ] **Step 3: Run the spec alone, then the whole hermetic suite (foreground)**

```bash
npx playwright test e2e/a11y.spec.js 2>&1 | tail -25
npm run test:e2e 2>&1 | tail -8
```
Expected: 12 passed (6 × 2 viewports), then `90 passed`. If axe reports a `serious`/`critical` violation inside a scoped region, fix it in the component (an `aria-label` on the emoji category buttons is the anticipated case), re-run, and report the rule id and fix. If a menuitem focus assertion is flaky because framer-motion's enter animation delays the mount effect, add `await expect(menu).toBeVisible()` (already there) and a `toBeFocused` with the default 5 s timeout; do not add fixed sleeps. On mobile the Plan All/Clear buttons may be the desktop-hidden duplicates — `main` scoping plus `.first()` handles it; if `boundingBox()` is null, use `.filter({ visible: true }).first()`.

- [ ] **Step 4: README**

In `e2e/README.md`, under the "## Scripts" section's spec list (or the first list of hermetic specs), add:

```
- `e2e/a11y.spec.js` — keyboard-only flows for the feedback dialog, the Shop
  ⋯ menu + invite dialog and the Cart sign-in disclosure, 44px target
  measurements, and a scoped `@axe-core/playwright` audit (fails only on
  serious/critical violations inside those regions; other findings are
  printed). Whole-page axe is deliberately not enforced.
```

- [ ] **Step 5: Lint, Jest (package.json unchanged for src), commit**

```bash
npm run lint && git add package.json package-lock.json e2e/a11y.spec.js e2e/README.md && git commit -m "test(a11y): keyboard e2e flows and scoped axe audit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Whole-branch review, live check, merge, deploy, checklist

**Files:**
- Modify: `docs/superpowers/hardening-checklist.md` (G section)

- [ ] **Step 1: Review package and whole-branch review** (`scripts/review-package PLAN MERGE_BASE HEAD`; opus). Focus prompts: can the trap lock focus with no focusables (Escape must still work); does the return-focus ever land on a hidden desktop/mobile duplicate; can `openFeedback`'s guard get stuck `true` if `captureScreen` throws (it must reset on close only — verify `handleClose` always runs); does spreading `dialogProps` after framer-motion props break the exit animation; do the negative margins overlap neighbours in either viewport (read the failure screenshots if any); does `Tab` closing the menu strand focus on `body`; is anything visually different.

- [ ] **Step 2: One fix wave, one scoped re-review**, gates re-run (`npm run lint`, Jest, `npm run test:e2e` foreground).

- [ ] **Step 3: Live regression, push, CI, merge**

```bash
npm run test:e2e:live 2>&1 | tail -6
git push -u origin feat/accessibility-pass && gh run list --branch feat/accessibility-pass --limit 1
gh run watch <run-id> --exit-status
git checkout main && git merge --ff-only feat/accessibility-pass && git push origin main
```
Expected: live 4 passed; CI green; `main` fast-forwarded.

- [ ] **Step 4: Post-deploy**

```bash
for i in $(seq 1 36); do B=$(curl -s "https://grocery-checklist-app.netlify.app/?n=$i" | grep -o 'main\.[0-9a-f]*\.js' | head -1); [ "$B" != "main.9a7ac9c4.js" ] && [ -n "$B" ] && break; sleep 10; done; echo "$B"
```
Then a headless Chromium load of `#plan` and `#shop` on the live site (scratchpad script with `page.on('request')` for `client_errors` and `page.on('pageerror')`), expecting zero telemetry requests and zero page errors, and `SELECT COUNT(*) FROM client_errors` unchanged (sentinel only) via the MySQL MCP.

- [ ] **Step 5: Checklist and memory**

Tick G's five items and header `[x]`; add a "Shipped state (2026-09-06)" paragraph naming `useDialog`, the menu contract, the seven targets, `e2e/a11y.spec.js` and the axe scope, and a deferred list with anything the axe printout surfaced outside the gate. Commit `docs: tick hardening checklist G` on `main`, push. Update memory (`hardening_program.md`: G shipped, backlog D → C → F).

---

## Self-review against the spec

- §1 hook contract (opener capture, initial focus order, focusable query, Tab wrap, Escape stopPropagation, return focus with fallback, unmount restore) → Task 1 code and 8 tests.
- §2 feedback panel (role/aria-modal/labelledby, backdrop aria-hidden, 44 px close, initial focus via ref replacing the 300 ms timeout, Escape unconditional, re-entry guard, `returnFocusTo`) → Task 2.
- §3 invite modal (dialog, labelledby, 44 px close, returnFocusRef), ⋯ menu (roles, ids, focus in, arrows/Home/End, Escape → trigger, Tab closes, haspopup/controls on the trigger), Cart disclosure (aria-controls, id, 44 px) → Tasks 3 and 4.
- §4 table → Task 2 (feedback close), Task 3 (invite close), Task 4 (Cook ×2, Plan, Cart); Deals Retry no change (Decision 3).
- §5 tests → Tasks 1–4 (Jest) and Task 5 (e2e keyboard flows, 44 px measurements, scoped axe with `data-testid="heb-signin-panel"` from Task 4). Live regression → Task 6.
- §6 rollout → Task 6.
- Type consistency: `useDialog({ open, onClose, initialFocusRef, returnFocusRef }) → { ref, dialogProps }` in Tasks 1–3; `openFeedback({ returnFocusTo })` in Tasks 2 and 3; `triggerRef`/`returnFocusRef` props in Task 3 and its tests; ids `feedback-title`, `invite-title`, `shop-mode-menu`, `heb-login-details`, testid `heb-signin-panel` consistent across Tasks 2–5.
- Jest totals: 259 → 267 (T1) → 271 (T2) → 275 (T3) → 278 (T4); suites 36 → 37 → 38.
