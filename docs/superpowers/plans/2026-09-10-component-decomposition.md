# Component decomposition - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for the agreed execution in this session, or superpowers:executing-plans for a separately assigned execution session. Steps use checkbox (`- [ ]`) syntax. The approved spec governs conflicts; record implementation rulings in the ledger.

**Goal:** Decompose App, Shop, Cart, Cook and the two chat screens into focused hooks and views while preserving their current behavior, interfaces, accessibility and backend traffic.

**Architecture:** Extract one area at a time. State remains owned by hooks invoked from the same mounted screen, and existing conditional views retain their local state lifetime. Share chat send/retry mechanics through explicit planner/creator adapters; keep their history and domain workflows separate. Preserve effect registration order with named memoized callbacks where grouping effects into a hook would reorder them.

**Tech Stack:** Existing React 19, react-scripts 5/Jest 27/jsdom 16, Testing Library/user-event 13, framer-motion, Tailwind 3, Playwright 1.63 and scoped axe 4.13.0. No dependencies are added or upgraded.

**Spec:** `docs/superpowers/specs/2026-09-10-component-decomposition-design.md`, approved 2026-09-10. The source is the implementation baseline, not an invitation to normalize discovered quirks.

**Workspace:** `C:/New Grocery App/grocery-checklist-app-decomposition`, branch `refactor/component-decomposition`. Source baseline `45bcd4d`; approved spec commit `a5117c2`. Planning commits do not alter source. The original checkout remains `C:/New Grocery App/grocery-checklist-app`.

**Ledger:** Keep the canonical execution ledger in the ORIGINAL checkout at `.superpowers/sdd/2026-09-10-component-decomposition/progress.md`, first line `# SDD ledger - plan: docs/superpowers/plans/2026-09-10-component-decomposition.md`. Briefs, reports and review packages live beside it. Append one completion mirror to original `.superpowers/sdd/progress.md` as `[decomposition] Task N: ...`. Retain both ledger and sibling worktree through release; do not clean unrelated scratch artifacts.

## Execution contract

- Behavior-preserving only. Preserve storage keys and read/write timing, endpoint/method/body/header/timeout/retry distinctions, state snapshots and update ordering, closures, callback dependencies, effect cleanup, conditional mounts, provider boundaries, DOM/classes/keys/copy, focus and animations. A suspected bug becomes a documented follow-up. No incidental fix, new state machine, send guard, timer correction or cancellation policy.
- For unchanged bodies, this plan names source symbols and comment delimiters for verbatim moves. Those blocks remain authoritative even where line numbers shift. New glue is supplied as code. Do not mechanically paste a snippet over newer reviewed source; compare it with the task base.
- The shared API wrappers remain in use exactly where they are currently used. In particular, keep raw fetch in the Cart session/build paths and raw `apiFetch` at chat text-parsing sites; a global migration to `apiJson` would change the error/telemetry contract.
- All new tests are hermetic. Mock `global.fetch`, never `apiFetch`/`apiJson`. Use the existing `installMockFetch`/`restoreFetch`; use a fetch-level wrapper for delayed/rejected Promises because the helper does not await route-handler promises. Keep real production functions under test. Tests should assert behavior and requests, not duplicate the implementation as a local helper.
- Characterization comes before the corresponding stateful move and must pass against the current implementation. A refactor does not need an artificial failing test. If a new characterization fails on unchanged source, establish the real behavior and correct the test/harness; do not fix the application under D. Test examples in this document are planned code, not claims that those new tests have run.
- Use fake clocks only for the timing being exercised, flush pending React work inside `act`, and clean up mocks/timers/listeners after each test. CRA resets mocks between tests; reinstall implementations in `beforeEach`. Do not hide act warnings, unexpected errors or unmatched requests to obtain a green run.
- PowerShell: `npm.cmd`/`npx.cmd`, and `$env:CI='true'` in every fresh test shell. Run each listed command only after the previous required command succeeds. Keep Playwright attached in the foreground and poll its session until it exits. Never run multiple dev/test servers on port 3000 or background a test gate.
- Before every commit touching `src/`: lint with zero ESLint warnings, then full Jest with zero act warnings. Run focused browser gates where named and full hermetic Playwright before release. Run the existing live suite once at the release gate, not per task. No new live AI calls, recipe builds, HEB cart builds, Slack messages or backend changes.
- Fresh GPT-5.6 Sol implementer per task, one implementer at a time; GPT-6 Astra task reviewers and final whole-branch reviewer. Give reviewers only their brief, implementation report and review-package diff, never the whole implementation plan. A task reviewer checks both spec compliance and code quality. Follow scoped fix/re-review loops from the SDD skill.
- Capture each task's base SHA before dispatch. Commit with explicit file paths and a blank line followed by `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never stage repo-root PNG/JSON/YML scratch files or use `git add .`/`-A`. Additional reviewed fix commits stay inside the same task's base-to-head review range.
- No push or deployment is authorized for D yet. Prepare the tested branch, review findings and live result first; ask for concrete release approval covering the feature push, CI, main fast-forward/push and completion-doc push. Once granted, retain that authorization and do not ask again for those steps.

## Baseline confirmed during planning

At `a5117c2` in the sibling worktree on 2026-09-10:

| Check | Result |
| --- | --- |
| `npm.cmd ci --ignore-scripts --no-audit --no-fund` | Installed locked dependencies; no dependency-file changes |
| `npm.cmd run lint` | Exit 0, zero ESLint warnings |
| `CI=true npx.cmd react-scripts test --watchAll=false` | 38 suites / 282 tests passed, zero act warnings |
| `CI=true npm.cmd run test:e2e` | 102 passed, 2.6 minutes, foreground, 2 workers |
| Live suite | Not run during planning; reserved for the release gate |

Existing output includes Browserslist age/deprecation notices, the documented Deals key warning, deliberate error-path application logs and the approved scoped color-contrast deferrals. Keep those distinctions explicit; none waives a new failure.

## Task sequence and dependencies

| Task | Result | Depends on |
| --- | --- | --- |
| 1 | App lifecycle characterization | Baseline |
| 2 | App routing/meal hooks | 1 |
| 3 | Shop view/helper/voice moves | 2 |
| 4 | Shop progress and partner-session extraction | 3 |
| 5 | Cart panels and session extraction | 4 |
| 6 | Cart build/EventSource extraction | 5 |
| 7 | Cook views and timer extraction | 6 |
| 8 | Shared send/retry transport and Planner adapter | 7 |
| 9 | Creator adapter and transport integration | 8 |
| 10 | Audited dead-code removal and legacy route checks | 9 |
| 11 | Whole-branch review, final gates and approved release | 10 |

The sequence limits integration churn, even where areas could be coded independently. Task reviews and documentation inspection may run alongside controller work; implementers and test servers do not overlap.

## Controller setup and review packages

Read @superpowers:subagent-driven-development, @superpowers:requesting-code-review and @superpowers:test-driven-development at execution; use @superpowers:systematic-debugging if a check fails. The refactor's characterization-first protocol is deliberate; production changes must not be used to make baseline characterization pass.

The installed SDD script directory is `C:/Users/Corey/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/subagent-driven-development/scripts`. Use Git Bash only for these installed shell scripts; use native PowerShell for filesystem changes and test commands. Run `sdd-workspace` from the original checkout after the plan exists there to obtain the canonical ledger directory. Generate review packages from the implementation worktree with an explicit output in that canonical directory:

```powershell
$sddScripts = 'C:/Users/Corey/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/subagent-driven-development/scripts'
$planPath = 'docs/superpowers/plans/2026-09-10-component-decomposition.md'
$ledgerDir = 'C:/New Grocery App/grocery-checklist-app/.superpowers/sdd/2026-09-10-component-decomposition'
# Capture these once per task, at the indicated stages.
$taskBase = git rev-parse HEAD
# After implementation and any task fixes:
$taskHead = git rev-parse HEAD
& 'C:/Program Files/Git/bin/bash.exe' "$sddScripts/review-package" $planPath $taskBase $taskHead "$ledgerDir/task-N-review.diff"
```

Replace `N` with the actual task number and generate a distinct review file after each fix. Verify the paths printed by the tool. Do not substitute `HEAD~1` for a task base if a task has multiple commits. Perform the SDD preflight table before Task 1: one row per task and one row per pair sharing a file/interface, recording any ruling.

---

---

### Task 1: Characterize App routing, joins and selected meals

**Files:**
- Create: `src/components/App.lifecycle.test.js`.
- Read: `src/components/App.js`, `src/components/App.test.js`, `src/utils/screenRoute.js`, `src/utils/weekDates.js`, `src/utils/storageVersion.js`, `src/test-utils/mockFetch.js`.

**Contract:** Test the actual App orchestration with lightweight child-screen stubs. Network calls continue through the real API helpers. Preserve history state validation, unsaved-change confirmation, join storage/redirect/cancellation, selected-meal cache/setter/refresh, and week rollover. These tests must pass against the existing component before Task 2 changes it.

- [ ] **Step 1: Add the baseline characterization file below.** `holdEndpoint` wraps the existing fetch mock because `installMockFetch` does not await a Promise returned by one of its route handlers. Keep the response and fetch shapes shown. The motion stub isolates route state from animation; existing browser routing/G tests continue to cover real motion and focus.

```js
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { getWeekDates } from '../utils/weekDates';
import { CURRENT_VERSION, STORAGE_VERSION_KEY } from '../utils/storageVersion';

jest.mock('./AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('./Home', () => ({ selectedMeals }) => (
  <div>Home screen<output data-testid="meals">{JSON.stringify(selectedMeals)}</output></div>
));
jest.mock('./Deals', () => () => <div>Deals screen</div>);
jest.mock('./InStoreMode', () => () => <div>Shop screen</div>);
jest.mock('./Plan', () => ({ onUnsavedChanges, onNavigate }) => (
  <div>Plan screen
    <button onClick={() => onUnsavedChanges(true)}>Mark dirty</button>
    <button onClick={() => onUnsavedChanges(false)}>Mark saved</button>
    <button onClick={() => onNavigate('deals')}>Leave plan</button>
  </div>
));
jest.mock('./Meals', () => ({ selectedMeals, setSelectedMeals, refreshMeals }) => (
  <div>Meals screen
    <output data-testid="meals">{JSON.stringify(selectedMeals)}</output>
    <button onClick={() => setSelectedMeals([{ id: 'local' }])}>Set local meals</button>
    <button onClick={refreshMeals}>Refresh meals</button>
  </div>
));
jest.mock('framer-motion', () => {
  const React = require('react');
  return {
    AnimatePresence: ({ children }) => children,
    motion: {
      div: React.forwardRef(({ initial, animate, exit, transition, ...props }, ref) => (
        <div {...props} ref={ref} />
      )),
    },
  };
});

const originalLocation = window.location;
let backend;
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300, status, statusText: '', headers: new Map(),
  text: () => Promise.resolve(JSON.stringify(body)),
  json: () => Promise.resolve(body),
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
// Flush microtasks under act; the fetch/body/parser chain is asynchronous.
async function settle() {
  await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
}
function route(hash) { window.history.replaceState(null, '', hash); }
function holdEndpoint(fragment) {
  const held = deferred();
  const fallback = global.fetch;
  global.fetch = jest.fn((url, init) => (
    String(url).includes(fragment) ? held.promise : fallback(url, init)
  ));
  return held;
}

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date(2026, 8, 9, 12));
  // jsdom 16 Location methods cannot be spied on directly. Keep its real
  // descriptors/history integration and replace only the reload operation.
  delete window.location;
  window.location = Object.defineProperties({}, {
    ...Object.getOwnPropertyDescriptors(originalLocation),
    reload: { configurable: true, value: jest.fn() },
  });
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: jest.fn() });
  window.matchMedia = jest.fn((query) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  }));
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(STORAGE_VERSION_KEY, String(CURRENT_VERSION));
  route('#home');
  backend = installMockFetch({ fetch_weekly_meals: [] });
});
afterEach(() => {
  cleanup();
  restoreFetch();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete window.location;
  window.location = originalLocation;
});

test('shows cached meals, then removes the cache after an empty successful load', async () => {
  const key = `selectedMeals_${getWeekDates().startDate}`;
  localStorage.setItem(key, JSON.stringify([{ id: 'cached' }]));
  const pending = holdEndpoint('fetch_weekly_meals');
  render(<App />);
  expect(screen.getByTestId('meals')).toHaveTextContent('cached');
  pending.resolve(response([]));
  await settle();
  expect(screen.getByTestId('meals')).toHaveTextContent('[]');
  expect(localStorage.getItem(key)).toBeNull();
});

test('failed meal load preserves cached meals and storage', async () => {
  const key = `selectedMeals_${getWeekDates().startDate}`;
  localStorage.setItem(key, JSON.stringify([{ id: 'cached' }]));
  // A forbidden response exercises the existing catch without GET retry delay.
  backend = installMockFetch({ fetch_weekly_meals: { status: 403, body: {} } });
  render(<App />);
  await settle();
  expect(screen.getByTestId('meals')).toHaveTextContent('cached');
  expect(JSON.parse(localStorage.getItem(key))).toEqual([{ id: 'cached' }]);
});

test('nonempty meals normalize once and populate the current-week cache', async () => {
  backend = installMockFetch({ fetch_weekly_meals: [
    { selection_id: 17, recipe_id: 23, recipe_name: 'Soup', notes: 'batch' },
  ] });
  render(<App />);
  await settle();
  const expected = [{ id: 17, name: 'Soup', recipeId: '23', description: 'batch', ingredients: [] }];
  expect(JSON.parse(screen.getByTestId('meals').textContent)).toEqual(expected);
  expect(JSON.parse(localStorage.getItem(`selectedMeals_${getWeekDates().startDate}`))).toEqual(expected);
  expect(backend.for('fetch_weekly_meals')).toHaveLength(1);
});

test('child setter and refresh retain their separate state/cache behavior', async () => {
  route('#meals');
  render(<App />);
  await settle();
  fireEvent.click(screen.getByText('Set local meals'));
  expect(screen.getByTestId('meals')).toHaveTextContent('local');
  expect(localStorage.getItem(`selectedMeals_${getWeekDates().startDate}`)).toBeNull();
  fireEvent.click(screen.getByText('Refresh meals'));
  await settle();
  expect(screen.getByTestId('meals')).toHaveTextContent('[]');
  expect(backend.for('fetch_weekly_meals')).toHaveLength(2);
  expect(new URL(backend.for('fetch_weekly_meals')[0].url).searchParams.get('weekDateRange'))
    .toBe(getWeekDates().displayRange);
});

test('unsaved navigation cancellation keeps the route and acceptance clears the guard', async () => {
  route('#plan');
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<App />);
  await settle();
  fireEvent.click(screen.getByText('Mark dirty'));
  fireEvent.click(screen.getByText('Leave plan'));
  expect(window.location.hash).toBe('#plan');
  expect(screen.getByText('Plan screen')).toBeInTheDocument();
  expect(confirm).toHaveBeenCalledWith('You have unsaved changes that will be lost. Are you sure you want to leave?');
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByText('Leave plan'));
  expect(window.location.hash).toBe('#deals');
  expect(window.history.state).toEqual({ screen: 'deals' });
  act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: 'plan' } })));
  fireEvent.click(screen.getByText('Leave plan'));
  expect(confirm).toHaveBeenCalledTimes(2);
});

test.each([['grocery', 'Plan screen'], ['#plan', 'Home screen'], ['bogus', 'Home screen']])(
  'history state %s retains its whitelist semantics', async (stateScreen, expected) => {
    render(<App />);
    await settle();
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: stateScreen } })));
    expect(screen.getByText(expected)).toBeInTheDocument();
  }
);

test('join blocks regular screens, stores the returned session and replaces the route', async () => {
  route('#join/abcd');
  const pending = holdEndpoint('join_session');
  render(<App />);
  expect(screen.getByText(/Joining shopping session/)).toBeInTheDocument();
  expect(screen.queryByText('Home screen')).not.toBeInTheDocument();
  const joined = { code: 'ABCD', week_start_date: '2026-09-06', expires_at: '2026-09-13T00:00:00Z' };
  pending.resolve(response({ found: true, ...joined }));
  await settle();
  expect(screen.getByText('Shop screen')).toBeInTheDocument();
  expect(JSON.parse(sessionStorage.getItem('joinedShoppingSession'))).toEqual(joined);
  expect(window.location.hash).toBe('#shop');
  expect(window.history.state).toEqual({ screen: 'shop' });
  const joinCall = global.fetch.mock.calls.find(([url]) => String(url).includes('join_session'));
  expect(new URL(joinCall[0]).searchParams.get('code')).toBe('ABCD');
});

test.each([
  [{ found: false }, 200, 'That invite is invalid or expired.'],
  [{}, 403, "Couldn't reach the server \u2014 check your connection and try again."],
])('join errors keep their copy and Go home recovers', async (body, status, message) => {
  route('#join/ABCD');
  const pending = holdEndpoint('join_session');
  render(<App />);
  pending.resolve(response(body, status));
  await settle();
  expect(screen.getByText(message)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Go home'));
  expect(screen.getByText('Home screen')).toBeInTheDocument();
  expect(window.location.hash).toBe('#home');
});

test('unmounted join ignores its late result', async () => {
  route('#join/ABCD');
  const pending = holdEndpoint('join_session');
  const view = render(<App />);
  view.unmount();
  pending.resolve(response({ found: true, code: 'ABCD', week_start_date: '2026-09-06' }));
  await settle();
  expect(sessionStorage.getItem('joinedShoppingSession')).toBeNull();
  expect(window.location.hash).toBe('#join/ABCD');
});

test('manual join reloads instead of starting a second mount-only join request', async () => {
  render(<App />);
  await settle();
  route('#join/ABCD');
  act(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  expect(window.location.reload).toHaveBeenCalledTimes(1);
  expect(backend.for('join_session')).toHaveLength(0);
});

test('week rollover defers while dirty and reloads at the next saved tick', async () => {
  route('#plan');
  render(<App />);
  await settle();
  fireEvent.click(screen.getByText('Mark dirty'));
  jest.setSystemTime(new Date(2026, 8, 10, 0));
  act(() => jest.advanceTimersByTime(60000));
  expect(window.location.reload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Mark saved'));
  act(() => jest.advanceTimersByTime(60000));
  expect(window.location.reload).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(60000));
  expect(window.location.reload).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the new tests on unchanged App.**

```powershell
$env:CI='true'
npx.cmd react-scripts test --watchAll=false --runInBand --runTestsByPath src/components/App.lifecycle.test.js src/components/App.test.js src/utils/screenRoute.test.js
```

Expected: all new characterization and existing routing tests pass, with no act warnings. If a proposed assertion fails, inspect the source and harness to establish current behavior before editing production. The jsdom Location replacement and fake-clock setup are test code to validate here, not preverified execution evidence.

- [ ] **Step 3: Inspect baseline evidence.** Confirm both empty and nonempty cache results, the unchanged invalid-history-state fallback, and the ignored late join response are asserted by the real App. Record any harness adjustment and why it preserves the original contract. Do not weaken an assertion to make changed production behavior pass.

- [ ] **Step 4: Run lint/full Jest and commit the characterization.**

```powershell
$env:CI='true'
npm.cmd run lint
npx.cmd react-scripts test --watchAll=false
git add -- 'src/components/App.lifecycle.test.js'
git commit -m 'test(refactor): characterize app lifecycle contracts' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

Expected: zero ESLint warnings, all Jest suites/tests pass, zero act warnings. Execute each command only after the previous required check succeeds; the shell examples are not error-handling scripts.

### Task 2: Extract App routing and selected-meal hooks

**Files:**
- Create: `src/hooks/useHashRoute.js`, `src/hooks/useWeeklyMeals.js`.
- Modify: `src/components/App.js`.
- Reuse tests: `src/components/App.lifecycle.test.js`, `src/components/App.test.js`, `src/utils/screenRoute.test.js`, `e2e/routing.spec.js`, `e2e/a11y.spec.js`.

**Interfaces:** `useHashRoute({ hasUnsavedChangesRef })` returns the current route, navigation and join UI values/actions plus `resolveJoin` and `listenForRoutes` effect callbacks. `useWeeklyMeals()` returns the selected-meal state/setter, loading flag, loader and refresh callback. App keeps effect registration at the original positions so storage cleanup, meal loading, join handling and history listener registration do not reorder.

- [ ] **Step 1: Create the selected-meals hook with the exact current loader semantics.** The similar existing `useWeekMeals.js` stays untouched.

```js
import { useCallback, useState } from "react";
import { getWeekDates } from "../utils/weekDates";
import { ENDPOINTS, apiJson, normalizeDbMeals } from "../config/api";

export default function useWeeklyMeals() {
  const [selectedMeals, setSelectedMeals] = useState(() => {
    try {
      const weekKey = `selectedMeals_${getWeekDates().startDate}`;
      const stored = localStorage.getItem(weekKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [mealsLoading, setMealsLoading] = useState(true);

  // Shared helper: fetch meals from DB, normalize, and cache to localStorage
  const loadMealsFromDb = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setMealsLoading(true);
    try {
      const weekData = getWeekDates();
      const url = new URL(ENDPOINTS.fetchWeeklyMeals);
      url.searchParams.append("weekDateRange", weekData.displayRange);
      const data = await apiJson(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const normalized = normalizeDbMeals(data);
      setSelectedMeals(normalized);
      const weekKey = `selectedMeals_${weekData.startDate}`;
      if (normalized.length > 0) {
        localStorage.setItem(weekKey, JSON.stringify(normalized));
      } else {
        localStorage.removeItem(weekKey);
      }
    } catch {
      // Keep stale localStorage data on network failure
    } finally {
      if (showLoading) setMealsLoading(false);
    }
  }, []);

  // Callback for children to refresh meals from DB after mutations
  const refreshMeals = useCallback(() => loadMealsFromDb(), [loadMealsFromDb]);

  return { selectedMeals, setSelectedMeals, mealsLoading, loadMealsFromDb, refreshMeals };
}
```

- [ ] **Step 2: Create the route hook.** This preserves the current DOM lookup for scrolling. There is no App-owned main ref in the baseline; the design wording about that ref was a source-audit correction, not a request to introduce one. Keep whitelist validation before calling the resolver in the history-state branch.

```js
import { useCallback, useState } from "react";
import { ENDPOINTS, apiJson } from "../config/api";
import { resolveScreenFromHash, LEGACY_REDIRECT, VALID_SCREENS } from "../utils/screenRoute";

const extractJoinCode = () => resolveScreenFromHash(window.location.hash).join || null;
const JOINED_SESSION_STORAGE_KEY = "joinedShoppingSession";

export default function useHashRoute({ hasUnsavedChangesRef }) {
  const [joinState, setJoinState] = useState(() => (extractJoinCode() ? "joining" : "idle"));
  const [joinError, setJoinError] = useState(null);
  const [currentScreen, setCurrentScreen] = useState(() => {
    // `#join/CODE` has no screen — home is a placeholder while the join effect
    // resolves the invite and redirects to #shop.
    return resolveScreenFromHash(window.location.hash).screen || "home";
  });

  // Navigate with unsaved-changes confirmation and browser history push
  const navigateToScreen = useCallback((screen) => {
    // Redirect legacy IDs to new ones
    const target = LEGACY_REDIRECT[screen] || screen;

    if (hasUnsavedChangesRef.current) {
      const confirmed = window.confirm(
        "You have unsaved changes that will be lost. Are you sure you want to leave?"
      );
      if (!confirmed) return;
      hasUnsavedChangesRef.current = false;
    }
    setCurrentScreen(target);
    window.history.pushState({ screen: target }, "", `#${target}`);
    document.querySelector('main')?.scrollTo(0, 0);
  }, [hasUnsavedChangesRef]);

  // Partner invite: if URL hash is #join/CODE, validate the code via the
  // join_session webhook, stash the session in sessionStorage, and redirect
  // to #shop. Runs once on mount — the initial joinState='joining' means
  // App renders a blocking loading view until this resolves.
  const resolveJoin = useCallback(() => {
    const code = extractJoinCode();
    if (!code) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(ENDPOINTS.joinSession);
        url.searchParams.append("code", code);
        const data = await apiJson(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          timeout: 8000,
          retries: 1,
        });
        if (cancelled) return;
        if (data.found && data.week_start_date) {
          sessionStorage.setItem(
            JOINED_SESSION_STORAGE_KEY,
            JSON.stringify({
              code: data.code,
              week_start_date: data.week_start_date,
              expires_at: data.expires_at,
            })
          );
          setJoinState("idle");
          setCurrentScreen("shop");
          window.history.replaceState({ screen: "shop" }, "", "#shop");
        } else {
          setJoinError("That invite is invalid or expired.");
          setJoinState("error");
        }
      } catch (err) {
        if (cancelled) return;
        setJoinError("Couldn't reach the server — check your connection and try again.");
        setJoinState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Browser back/forward button support + hashes typed/pasted into an open tab
  const listenForRoutes = useCallback(() => {
    const initialRoute = resolveScreenFromHash(window.location.hash);
    // Skip the URL normalization when arriving via `#join/CODE` — the
    // partner-invite effect above reads the code then rewrites the URL to
    // `#shop` itself. Still wire up the listeners so back/forward work after.
    if (!initialRoute.join) {
      window.history.replaceState({ screen: initialRoute.screen }, "", `#${initialRoute.screen}`);
    }

    // Fires for back/forward (popstate) and for manual hash edits, which some
    // browsers report only as hashchange. `navigateToScreen`'s pushState fires
    // neither, so there is no double-handling from in-app navigation.
    const handleRouteChange = (event) => {
      const stateScreen = event?.state?.screen;
      if (stateScreen) {
        // History entry we pushed ourselves — trust its state.
        const next = VALID_SCREENS.includes(stateScreen)
          ? resolveScreenFromHash(stateScreen).screen
          : "home";
        setCurrentScreen((prev) => (prev === next ? prev : next));
        document.querySelector('main')?.scrollTo(0, 0);
        return;
      }

      // No history state — the hash was typed, pasted, or opened from a
      // bookmark while the app was already running. Resolve from the URL
      // instead of falling back to home (FB#54).
      const route = resolveScreenFromHash(window.location.hash);
      if (route.join) {
        // The join flow only runs at mount, so reload to let it pick up the code.
        window.location.reload();
        return;
      }
      window.history.replaceState({ screen: route.screen }, "", `#${route.screen}`);
      setCurrentScreen((prev) => (prev === route.screen ? prev : route.screen));
      document.querySelector('main')?.scrollTo(0, 0);
    };

    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);
    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      window.removeEventListener("hashchange", handleRouteChange);
    };
  }, []);

  const goHomeFromJoin = useCallback(() => {
    setJoinState("idle");
    setJoinError(null);
    window.history.replaceState({ screen: "home" }, "", "#home");
    setCurrentScreen("home");
  }, []);

  return { currentScreen, joinState, joinError, navigateToScreen, goHomeFromJoin, resolveJoin, listenForRoutes };
}
```

- [ ] **Step 3: Replace the App-owned declarations with hook calls, keeping providers/JSX unchanged.** Remove the moved route constants and API/route imports; add the two default hook imports. Immediately after `debugMode`, create `hasUnsavedChangesRef` (remove its later declaration), then insert:

```js
const {
  currentScreen, joinState, joinError, navigateToScreen, goHomeFromJoin,
  resolveJoin, listenForRoutes,
} = useHashRoute({ hasUnsavedChangesRef });
const { selectedMeals, setSelectedMeals, loadMealsFromDb, refreshMeals } = useWeeklyMeals();
```

Remove the moved state/loader/navigation declarations. Keep `setHasUnsavedChanges`, `ensureStorageVersion`/`gcWeekScopedKeys`, week rollover, and `handleStartShopping` in App. At the exact old meal-load effect position retain:

```js
useEffect(() => { loadMealsFromDb({ showLoading: true }); }, [loadMealsFromDb]);
```

Replace the original join and routing effect blocks at their respective positions with:

```js
useEffect(resolveJoin, [resolveJoin]);
useEffect(listenForRoutes, [listenForRoutes]);
```

Replace only the join-error button inline callback with `onClick={goHomeFromJoin}`. Preserve `React, useState, useEffect, useCallback, useRef` imports still used by App, its screen keys, Toaster, fullscreen Shop branch, providers, and all child props.

- [ ] **Step 4: Run Task 1 tests and existing routing/G browser coverage.**

```powershell
$env:CI='true'
npx.cmd react-scripts test --watchAll=false --runInBand --runTestsByPath src/components/App.lifecycle.test.js src/components/App.test.js src/utils/screenRoute.test.js
npx.cmd playwright test e2e/routing.spec.js e2e/a11y.spec.js --project=mobile --project=desktop
```

Expected: all pass; browser command stays attached in the foreground. No new API calls, focus/geometry changes or route changes. Preserve existing color-contrast reporting/deferral; do not widen it.

- [ ] **Step 5: Run lint/full Jest and commit.**

```powershell
$env:CI='true'
npm.cmd run lint
npx.cmd react-scripts test --watchAll=false
git add -- 'src/hooks/useHashRoute.js' 'src/hooks/useWeeklyMeals.js' 'src/components/App.js'
git commit -m 'refactor: extract app routing and selected meals' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

Expected: all gates green with no act warnings. Report the actual suite/test counts and the baseline comparison. Task review must specifically check effect dependencies/order, cached initialization, history-state whitelist and unchanged join error text.

---

### Task 3: Move Shop views, pure helpers and the existing voice hook

**Files:**

| Create | Exact source to move from `src/components/InStoreMode.js` | Imports owned by the new file |
| --- | --- | --- |
| `src/utils/shoppingVoiceMatch.js` | The transcript-strategy comment, `escapeRegExp`, `containsAsWord`, `stem`, and the complete exported `findBestMatch` (42–92) | None |
| `src/hooks/useHoldToTalk.js` | Hook documentation, `MIN_PRESS_MS`, `MAX_RECORD_MS`, `FETCH_TIMEOUT_MS`, complete exported `useHoldToTalk` through its closing `};` immediately before the expiry comment (94–417) | `{ useState, useEffect, useCallback, useRef }` from React; `{ apiJson }` from `../config/api` |
| `src/utils/shoppingSessions.js` | `JOINED_SESSION_STORAGE_KEY`, `HOST_SESSION_STORAGE_KEY`, expiry-format comment and `parseExpiryMs`, `readJoinedSession`, `readHostSession` (38–39, 419–465) | None; export all five declarations |
| `src/utils/shoppingList.js` | Complete `sortByWalkOrder`, `aisleSortKey`, exported `formatAisleBadge`, `groupByWalkOrder`, with their existing comments (467–532) | `{ DEFAULT_CATEGORY }` from `../constants/categories`; export the four helpers |
| `src/components/instore/ShoppingItems.js` | The contiguous `ProgressRing`, `Checkmark`, `CouponChip`, `QuantityPill`, `ItemRow`, `AisleSection` declarations, comments and every `.displayName` assignment (535–754) | React; `{ Check, Tag, ChevronDown }` from `lucide-react`; `{ motion, AnimatePresence }` from `framer-motion`; `{ formatAisleBadge }` from `../../utils/shoppingList`; append `export { ProgressRing, AisleSection };` |
| `src/components/instore/ReorderDrawer.js` | Complete `ReorderDrawer` (757–794) | React; `{ ChevronUp }` from `lucide-react`; append `export default ReorderDrawer;` |
| `src/components/instore/ModeMenu.js` | Complete exported `ModeMenu` (796–885) | React, `{ useRef, useEffect }`; `{ Filter, User, MessageSquarePlus, Smartphone }` from `lucide-react`; `{ motion }` from `framer-motion` |
| `src/components/instore/InviteModal.js` | Invite comment and complete exported `InviteModal` through its closing `};`, before `Quiet sage pill` (887–1030) | React, `{ useState, useEffect, useRef, useCallback }`; `{ Loader2, X, Copy, Check }` from `lucide-react`; `{ motion, useIsPresent }` from `framer-motion`; `{ fadeIn, modalSpring }` from `../../utils/animations`; `{ ENDPOINTS, apiJson }` from `../../config/api`; default `useDialog` from `../../hooks/useDialog`; `{ HOST_SESSION_STORAGE_KEY }` from `../../utils/shoppingSessions` |
| `src/components/instore/PartnerBadge.js` | Complete exported `PartnerBadge` (1038–1053) | React; `{ Users }` from `lucide-react`; `{ parseExpiryMs }` from `../../utils/shoppingSessions` |
| `src/components/instore/UndoToast.js` | Complete `UndoToast` (1056–1077) | React; `{ Check, Undo2 }` from `lucide-react`; `{ motion }` from `framer-motion`; append `export default UndoToast;` |
| `src/components/instore/TripSummaryCard.js` | Summary comment and complete `TripSummaryCard` (1079–1150) | React, `{ useEffect }`; `{ Clock, Check, ShoppingBag, Tag, PartyPopper }` from `lucide-react`; `{ motion }` from `framer-motion`; default `confetti` from `canvas-confetti`; `{ fadeIn, modalSpring, staggerContainer, staggerItem }` from `../../utils/animations`; append `export default TripSummaryCard;` |

Modify `src/components/InStoreMode.js` only for those moves and imports/re-exports. Do not create a barrel or pull the facade into an extracted module. Keep `WALK_ORDER_STORAGE_KEY` with the screen. Keep voice matching/wiring at its existing location in `InStoreMode`, and keep `useHoldToTalk` unconditionally called by that screen.

- [ ] **Step 1: Inspect exact imports and compatibility consumers.**

```powershell
rg -n 'InStoreMode|findBestMatch|useHoldToTalk|formatAisleBadge|ModeMenu|InviteModal|PartnerBadge' src e2e
```

- [ ] **Step 2: Move the pure declarations and voice hook verbatim.**

Keep all regexes, endpoint options, callback-ref updates, constants and dependency arrays unchanged. Only add the imports/exports specified above. Do not optimize the voice hook or unify its timeout with other API calls.

- [ ] **Step 3: Move the view declarations verbatim, in the bounded groups in the table.**

Preserve DOM, prop names, private helper ownership, `React.memo`, `.displayName`, keys, animation wrappers and local state. Each table row is one small move-and-inspect action. Move the `Quiet sage pill` comment with `PartnerBadge`. Preserve `useDialog({ open: isPresent, onClose, returnFocusRef })`, the 44px close control and negative margins. Keep the screen's existing `AnimatePresence` wrappers, focus-before-opening actions and trigger refs where they are.

- [ ] **Step 4: Install the concrete facade imports and compatibility re-exports.**

```js
import { findBestMatch } from "../utils/shoppingVoiceMatch";
import { useHoldToTalk } from "../hooks/useHoldToTalk";
import { readJoinedSession, readHostSession } from "../utils/shoppingSessions";
import { groupByWalkOrder } from "../utils/shoppingList";
import { ProgressRing, AisleSection } from "./instore/ShoppingItems";
import ReorderDrawer from "./instore/ReorderDrawer";
import { ModeMenu } from "./instore/ModeMenu";
import { InviteModal } from "./instore/InviteModal";
import { PartnerBadge } from "./instore/PartnerBadge";
import UndoToast from "./instore/UndoToast";
import TripSummaryCard from "./instore/TripSummaryCard";

export { findBestMatch } from "../utils/shoppingVoiceMatch";
export { useHoldToTalk } from "../hooks/useHoldToTalk";
export { formatAisleBadge } from "../utils/shoppingList";
export { ModeMenu } from "./instore/ModeMenu";
export { InviteModal } from "./instore/InviteModal";
export { PartnerBadge } from "./instore/PartnerBadge";
```

The facade keeps React's existing five hooks, `{ ArrowLeft, ShoppingBag, Loader2, AlertCircle, Mic, MicOff, MoreHorizontal }` used by its remaining JSX (confirm against source), `hotToast`, `AnimatePresence`, `EmptyState`, week-date helpers, API imports, `useCategories` and `useFeedback`. Remove imports used solely by moved declarations; make no formatting pass over the surviving body.

- [ ] **Step 5: Run existing preservation checks; no new tests are needed for these mechanical moves.**

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --testPathPattern='InStoreMode|FeedbackPanel|useDialog'
npx.cmd playwright test e2e/shop.spec.js e2e/a11y.spec.js --project mobile --project desktop --grep 'Shop|Invite|invite|feedback and invite close controls'
npm.cmd run lint
npm.cmd test -- --watchAll=false --runInBand
```

Run Playwright in the foreground using the configured hermetic production-build server. Expected: existing named-export tests, voice cases, Shop/menu/Invite focus, animation overlap and hit-target measurements all pass. In the task diff, inspect moves with rename detection and confirm unchanged props/JSX, not only suite counts.

- [ ] **Step 6: Commit the explicit files after gates pass, then request task review.**

```powershell
git add -- src/components/InStoreMode.js src/utils/shoppingVoiceMatch.js src/hooks/useHoldToTalk.js src/utils/shoppingSessions.js src/utils/shoppingList.js src/components/instore/ShoppingItems.js src/components/instore/ReorderDrawer.js src/components/instore/ModeMenu.js src/components/instore/InviteModal.js src/components/instore/PartnerBadge.js src/components/instore/UndoToast.js src/components/instore/TripSummaryCard.js
git diff --cached --check
git commit -m "refactor: separate Shop views and helpers" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: Characterize and extract Shop progress and partner session

**Files:**

- Create `src/test-utils/deferredFetch.js`.
- Create `src/components/InStoreMode.progress.test.js` and `src/components/InStoreMode.partnerSession.test.js`.
- Create `src/hooks/useShoppingProgress.js` and `src/hooks/usePartnerSession.js`.
- Modify `src/components/InStoreMode.js`; read the Task 3 helpers and existing checkoff/Invite/voice tests.

- [ ] **Step 1: Add a promise-returning fetch delay helper.**

Create `src/test-utils/deferredFetch.js` with this complete code. It wraps the real global-fetch mock installed by `installMockFetch`; every request still reaches that helper's recorder. The route map must return synchronous response descriptions. Do **not** return promises from its handlers: `installMockFetch` would serialize the Promise as `{}`.

```js
// Call after installMockFetch. Hold one real fetch response at the network seam.
export function deferNextFetch(fragment) {
  const delegatedFetch = global.fetch;
  let used = false;
  let release;
  let reject;
  const gate = new Promise((resolve, rejectPromise) => {
    release = resolve;
    reject = rejectPromise;
  });
  global.fetch = jest.fn((url, init = {}) => {
    const response = delegatedFetch(url, init);
    if (!used && String(url).includes(fragment)) {
      used = true;
      return gate.then(() => response);
    }
    return response;
  });
  return { release: () => release(), reject: (error) => reject(error) };
}
```

Use `release` to retain the response selected at request time and `reject(new TypeError('offline'))` to exercise a thrown network request. A held response must be released or rejected in its test; restore fetch after every test.

- [ ] **Step 2: Add and run progress characterization against the unchanged screen.**

Create `src/components/InStoreMode.progress.test.js` from this runnable starting suite. These tests observe the existing screen, storage and requests, not hook internals. Three items share one category so ordinary two-tap tests do not hide their checkbox through automatic collapse or invoke the completion card.

```js
import React from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { deferNextFetch } from '../test-utils/deferredFetch';
import InStoreMode from './InStoreMode';

const items = [
  { ItemID: 23, ItemName: 'Bread', Category: 'Groceries', IsSelected: 1, QuantitySelected: 1 },
  { ItemID: 31, ItemName: 'Milk', Category: 'Groceries', IsSelected: 1, QuantitySelected: 1 },
  { ItemID: 44, ItemName: 'Rice', Category: 'Groceries', IsSelected: 1, QuantitySelected: 1 },
];
const ok = { success: true };
const bad = { status: 400, body: { error: 'offline fixture' } };
const base = () => ({
  '/fetch_grocery_items': items,
  '/shopping_progress?': [],
  '/shopping_progress_check': ok,
  '/shopping_progress_uncheck': ok,
  '/api/heb/weekly-items': { items: [] },
  '/categories': [{ id: 1, name: 'Groceries', walk_order: 1 }],
  '/client_errors': ok,
});
const flush = () => act(async () => { await Promise.resolve(); });
const advance = (ms) => act(async () => {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
});
const row = (name) => screen.getByRole('checkbox', { name: new RegExp(`^${name}`) });
const renderShop = (inStoreData = null) => renderWithProviders(
  <InStoreMode inStoreData={inStoreData} onExit={() => {}} />
);
const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(window, 'scrollTo', { configurable: true, writable: true, value: jest.fn() });
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  restoreFetch();
  localStorage.clear();
  sessionStorage.clear();
  if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
  else delete document.visibilityState;
});

test('an older check acknowledgment cannot discard a newer failed uncheck', async () => {
  const mock = installMockFetch({ ...base(), '/shopping_progress_uncheck': bad });
  renderShop();
  await flush();
  const check = deferNextFetch('/shopping_progress_check');
  fireEvent.click(row('Bread'));
  const uncheck = deferNextFetch('/shopping_progress_uncheck');
  fireEvent.click(row('Bread'));
  expect(row('Bread')).toHaveAttribute('aria-checked', 'false');
  uncheck.release();
  await flush();
  check.release();
  await flush();
  act(() => window.dispatchEvent(new Event('online')));
  await flush();
  expect(mock.for('/shopping_progress_uncheck')).toHaveLength(2);
  expect(mock.for('/shopping_progress_uncheck')[1].body).toEqual({
    week_start_date: expect.any(String), item_id: '23',
  });
  expect(row('Bread')).toHaveAttribute('aria-checked', 'false');
  expect(mock.unmocked()).toEqual([]);
});

test('an older failed operation cannot requeue a newer acknowledged check', async () => {
  let checkCount = 0;
  const mock = installMockFetch({ ...base(), '/shopping_progress_check': () => {
    checkCount += 1;
    return checkCount === 1 ? bad : ok;
  } });
  renderShop();
  await flush();
  const oldCheck = deferNextFetch('/shopping_progress_check');
  fireEvent.click(row('Bread'));
  fireEvent.click(row('Bread'));
  fireEvent.click(row('Bread'));
  await flush();
  oldCheck.release();
  await flush();
  act(() => window.dispatchEvent(new Event('online')));
  await flush();
  expect(mock.for('/shopping_progress_check')).toHaveLength(2);
  expect(row('Bread')).toHaveAttribute('aria-checked', 'true');
});

test('failed operations retry only on a visible 10-second tick and remain optimistic', async () => {
  const mock = installMockFetch({ ...base(), '/shopping_progress_check': bad });
  const view = renderShop();
  await flush();
  fireEvent.click(row('Bread'));
  await flush();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  await advance(10000);
  expect(mock.for('/shopping_progress_check')).toHaveLength(1);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  await advance(10000);
  expect(mock.for('/shopping_progress_check')).toHaveLength(2);
  expect(row('Bread')).toHaveAttribute('aria-checked', 'true');
  // Solo mode has initial hydration only, even after five possible poll ticks.
  expect(mock.for('/shopping_progress?')).toHaveLength(1);
  view.unmount();
  await advance(10000);
  act(() => window.dispatchEvent(new Event('online')));
  await flush();
  expect(mock.for('/shopping_progress_check')).toHaveLength(2);
});

test('initial hydration still replaces a local toggle made while it is in flight', async () => {
  installMockFetch(base());
  const hydration = deferNextFetch('/shopping_progress?');
  renderShop();
  await flush();
  fireEvent.click(row('Bread'));
  expect(row('Bread')).toHaveAttribute('aria-checked', 'true');
  hydration.release();
  await flush();
  expect(row('Bread')).toHaveAttribute('aria-checked', 'false');
  // Existing hydration does not rewrite the optimistic local cache.
  expect(JSON.parse(localStorage.getItem('inStoreCheckedItems')).checkedIds).toEqual(['23']);
});

test.each([true, false])('cache fallback requires identical savedAt: %s', async (sameSavedAt) => {
  const seed = { items, savedAt: 'seed-version', weekStartDate: '2026-09-10', weekDateRange: 'seed-week' };
  localStorage.setItem('inStoreCheckedItems', JSON.stringify({
    savedAt: sameSavedAt ? 'seed-version' : 'older-version', checkedIds: ['23'],
  }));
  installMockFetch({ ...base(), '/fetch_grocery_items': bad, '/shopping_progress?': bad });
  renderShop(seed);
  await flush();
  expect(row('Bread')).toHaveAttribute('aria-checked', String(sameSavedAt));
  expect(localStorage.getItem('inStoreCheckedItems') !== null).toBe(sameSavedAt);
});

test('partner polling retains both mutation guards and overlays pending operations', async () => {
  sessionStorage.setItem('hostShoppingSession', JSON.stringify({
    code: 'HOST', week_start_date: '2026-09-10', expires_at: '2026-09-11T12:00:00Z',
  }));
  let progressReads = 0;
  const mock = installMockFetch({ ...base(), '/shopping_progress?': () => {
    progressReads += 1;
    return progressReads === 1 ? [] : [{ item_id: 23 }];
  } });
  const view = renderShop();
  await flush();
  await advance(3500);
  const slowCheck = deferNextFetch('/shopping_progress_check');
  fireEvent.click(row('Milk'));
  await advance(500);
  expect(mock.for('/shopping_progress?')).toHaveLength(1); // pre-fetch 2s guard
  await advance(4000);
  expect(row('Bread')).toHaveAttribute('aria-checked', 'true');
  expect(row('Milk')).toHaveAttribute('aria-checked', 'true'); // pending overlay
  const slowPoll = deferNextFetch('/shopping_progress?');
  await advance(4000);
  fireEvent.click(row('Bread'));
  slowPoll.release();
  await flush();
  expect(row('Bread')).toHaveAttribute('aria-checked', 'false'); // post-fetch 2s guard
  expect(row('Milk')).toHaveAttribute('aria-checked', 'true');
  slowCheck.release();
  await flush();
  const finalPoll = deferNextFetch('/shopping_progress?');
  await advance(4000);
  view.unmount();
  finalPoll.release();
  await flush();
  const readsAtUnmount = mock.for('/shopping_progress?').length;
  await advance(8000);
  expect(mock.for('/shopping_progress?')).toHaveLength(readsAtUnmount);
});

test('Undo uses the latest toast, shared toggle payload, and local cache', async () => {
  const mock = installMockFetch(base());
  renderShop();
  await flush();
  fireEvent.click(row('Bread'));
  fireEvent.click(row('Milk'));
  fireEvent.click(screen.getByRole('button', { name: 'UNDO' }));
  await flush();
  expect(screen.getByText('2 items left')).toBeInTheDocument();
  expect(mock.for('/shopping_progress_uncheck')[0].body.item_id).toBe('31');
  expect(JSON.parse(localStorage.getItem('inStoreCheckedItems')).checkedIds).toEqual(['23']);
  await advance(3000);
  expect(screen.queryByRole('button', { name: 'UNDO' })).not.toBeInTheDocument();
});

test('duplicate and stale server IDs do not inflate the visible count', async () => {
  installMockFetch({ ...base(), '/shopping_progress?': [{ item_id: 23 }, { item_id: '23' }, { item_id: 999 }] });
  renderShop();
  await flush();
  expect(screen.getByText('2 items left')).toBeInTheDocument();
  expect(screen.getByText('1/3')).toBeInTheDocument();
  await advance(800);
  expect(screen.queryByRole('heading', { name: 'All Done!' })).not.toBeInTheDocument();
});
```

The `400` fixtures isolate the caller's fallback/queue behavior without invoking apiFetch's intentional GET 5xx retry/backoff. Existing 500 checkoff coverage remains. Preserve that retry policy in production.

- [ ] **Step 3: Add and run the partner ownership characterization.**

Create `src/components/InStoreMode.partnerSession.test.js` with this code. Copying with an unavailable/rejected clipboard still persists the session in the current implementation. The timer assertions distinguish persistence at Copy from badge/poll enablement at close.

```js
import React from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import InStoreMode from './InStoreMode';

const session = { code: 'AB12', week_start_date: '2026-09-10', expires_at: '2026-09-11 12:00:00' };
const items = [{ ItemID: 23, ItemName: 'Bread', Category: 'Groceries', IsSelected: 1, QuantitySelected: 1 }];
const base = () => ({
  '/fetch_grocery_items': items, '/shopping_progress?': [],
  '/api/heb/weekly-items': { items: [] },
  '/categories': [{ id: 1, name: 'Groceries', walk_order: 1 }],
  '/create_session': session,
});
const flush = () => act(async () => { await Promise.resolve(); });
const advance = (ms) => act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); });
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(window, 'scrollTo', { configurable: true, writable: true, value: jest.fn() });
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  restoreFetch();
  localStorage.clear();
  sessionStorage.clear();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else delete navigator.clipboard;
  if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
  else delete document.visibilityState;
});
async function openInvite() {
  renderWithProviders(<InStoreMode inStoreData={null} onExit={() => {}} />);
  await flush();
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Invite partner' }));
  await flush();
}
test('Cancel creates no local host session or polling loop', async () => {
  const mock = installMockFetch(base());
  await openInvite();
  expect(mock.for('/create_session')).toHaveLength(1);
  expect(sessionStorage.getItem('hostShoppingSession')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await advance(4000);
  expect(sessionStorage.getItem('hostShoppingSession')).toBeNull();
  expect(screen.queryByText('Invite link active')).not.toBeInTheDocument();
  expect(mock.for('/shopping_progress?')).toHaveLength(1);
  expect(mock.for('/fetch_grocery_items')).toHaveLength(1);
});
test.each(['success', 'rejection', 'missing'])('Copy establishes presence after close: %s clipboard', async (mode) => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'missing' ? undefined : {
    writeText: jest.fn(() => mode === 'rejection' ? Promise.reject(new Error('denied')) : Promise.resolve()),
  } });
  const mock = installMockFetch(base());
  await openInvite();
  fireEvent.click(screen.getByRole('button', { name: /Copy link/i }));
  await flush();
  expect(JSON.parse(sessionStorage.getItem('hostShoppingSession'))).toEqual(session);
  await advance(899);
  expect(screen.queryByText('Invite link active')).not.toBeInTheDocument();
  await advance(1);
  expect(screen.getByText('Invite link active')).toBeInTheDocument();
  await advance(4000);
  expect(mock.for('/shopping_progress?')).toHaveLength(2);
  expect(mock.for('/fetch_grocery_items')).toHaveLength(1); // presence refresh does not reload list
});
test('joined session takes precedence, supplies the host week, and preserves solo list cache', async () => {
  sessionStorage.setItem('hostShoppingSession', JSON.stringify(session));
  sessionStorage.setItem('joinedShoppingSession', JSON.stringify({
    ...session, code: 'JOIN', week_start_date: '2026-09-03', expires_at: '2026-09-11T12:00:00Z',
  }));
  localStorage.setItem('inStoreShoppingList', 'solo-cache-sentinel');
  const mock = installMockFetch(base());
  renderWithProviders(<InStoreMode inStoreData={null} onExit={() => {}} />);
  await flush();
  expect(screen.getByText('Shopping with partner')).toBeInTheDocument();
  const listQuery = new URL(mock.for('/fetch_grocery_items')[0].url).searchParams;
  const progressQuery = new URL(mock.for('/shopping_progress?')[0].url).searchParams;
  expect(listQuery.get('weekStartDate')).toBe('2026-09-03');
  expect(progressQuery.get('week_start_date')).toBe('2026-09-03');
  expect(progressQuery.get('week_date_range')).toBe(listQuery.get('weekDateRange'));
  expect(localStorage.getItem('inStoreShoppingList')).toBe('solo-cache-sentinel');
});
test('expired joined data is removed and an unexpired naive host expiry is accepted', async () => {
  sessionStorage.setItem('hostShoppingSession', JSON.stringify(session));
  sessionStorage.setItem('joinedShoppingSession', JSON.stringify({ ...session, expires_at: '2026-09-09 12:00:00' }));
  installMockFetch(base());
  renderWithProviders(<InStoreMode inStoreData={null} onExit={() => {}} />);
  await flush();
  expect(screen.getByText('Invite link active')).toBeInTheDocument();
  expect(sessionStorage.getItem('joinedShoppingSession')).toBeNull();
});
```

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --runTestsByPath src/components/InStoreMode.progress.test.js src/components/InStoreMode.partnerSession.test.js src/components/InStoreMode.checkoff.test.js
```

Expected: PASS before moving state. If a selector or timing expectation disagrees with observed baseline, correct the characterization to the measured baseline and record the evidence. Never change source to satisfy an intended race fix.

- [ ] **Step 4: Create the partner hook and integrate it without a new effect.**

Complete `src/hooks/usePartnerSession.js`:

```js
import { useCallback, useState } from 'react';
import { readJoinedSession, readHostSession } from '../utils/shoppingSessions';

function readPartnerSession() {
  const joined = readJoinedSession();
  if (joined) return { ...joined, role: 'partner' };
  const hosted = readHostSession();
  return hosted ? { ...hosted, role: 'host' } : null;
}

export default function usePartnerSession() {
  const [partnerSession, setPartnerSession] = useState(readPartnerSession);
  const refreshPartnerSession = useCallback(() => {
    setPartnerSession(readPartnerSession());
  }, []);
  return { partnerSession, refreshPartnerSession };
}
```

Replace the old `partnerSession` initializer at the same screen location with:

```js
const { partnerSession, refreshPartnerSession } = usePartnerSession();
```

Replace only the Invite `onClose` body with:

```js
onClose={() => {
  setShowInvite(false);
  refreshPartnerSession();
}}
```

Import the default hook from `../hooks/usePartnerSession`. Keep the screen's `readJoinedSession` import for its list-resolution effect; remove its `readHostSession` import after the initializer/close move. Do not pass `partnerSession` into the list effect's dependencies: that effect remains `[inStoreData]` and rereads joined storage at its current point.

- [ ] **Step 5: Create the progress hook with exact moves and concrete effect glue.**

`src/hooks/useShoppingProgress.js` imports `{ useState, useRef, useCallback }` from React, `{ ENDPOINTS, apiJson }` from `../config/api`, and `{ getWeekDates }` from `../utils/weekDates`.

The following is the complete shell. Each `MOVE` insertion below denotes the specified unchanged source block, not a new implementation to invent. The insertion table identifies both delimiters. Preserve comments within each moved block.

```js
import { useState, useRef, useCallback } from 'react';
import { ENDPOINTS, apiJson } from '../config/api';
import { getWeekDates } from '../utils/weekDates';

export default function useShoppingProgress({ shoppingList, partnerSession }) {
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const lastLocalMutationRef = useRef(0);
  const pendingOpsRef = useRef(new Map());
  const opTokenRef = useRef(0);

  // MOVE P1: complete sendProgressOp declaration, unchanged.
  // MOVE P2: complete drainPendingOps declaration, unchanged.

  const retryProgressEffect = useCallback(() => {
    // MOVE P3: original retry useEffect callback BODY, including returned cleanup.
  }, [drainPendingOps]);

  const hydrateProgressEffect = useCallback(() => {
    // MOVE P4: original initial-hydration useEffect callback BODY, unchanged.
  }, [shoppingList]);

  const cleanupUndoToastEffect = useCallback(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // MOVE P5: complete handleToggleItem declaration, unchanged.
  // MOVE P6: complete handleUndo declaration, unchanged.

  const pollPartnerProgressEffect = useCallback(() => {
    // MOVE P7: original live-sync useEffect callback BODY, including local cancelled flag.
  }, [shoppingList, partnerSession]);

  return {
    checkedItems, toast, handleToggleItem, handleUndo,
    retryProgressEffect, hydrateProgressEffect,
    cleanupUndoToastEffect, pollPartnerProgressEffect,
  };
}
```

| Move | Exact original boundaries in `InStoreMode.js` |
| --- | --- |
| P1 | `const sendProgressOp = useCallback(` through its `}, []);`, immediately before the `Re-send failed ops` comment (1206–1223) |
| P2 | `Re-send failed ops` comment and `const drainPendingOps = useCallback(` through `}, [sendProgressOp]);` (1225–1234) |
| P3 | Body of the `useEffect` whose first statement is `const onOnline = () => drainPendingOps();`, through its cleanup return, excluding the `useEffect` call and dependency array (1236–1245) |
| P4 | Body under `Load checked items from DB, fall back to localStorage`, from `if (!shoppingList) return;` through `loadCheckedItems();`, excluding `useEffect` wrapper (1367–1403) |
| P5 | `Toggle check (+ toast on newly-checked)` comment and complete `handleToggleItem` through `[shoppingList, sendProgressOp]` closing call (1476–1516) |
| P6 | Complete `handleUndo` through `}, [toast, shoppingList, handleToggleItem]);` (1573–1578) |
| P7 | Body under `Live sync polling`, from `if (!shoppingList || !partnerSession) return undefined;` through cleanup, excluding effect wrapper (1661–1710) |

The hook owns one Set, one operation map, the operation-token counter, local-mutation timestamp, toast state/timer and all effect bodies. It deliberately returns memoized effect callbacks. The screen retains only their registrations at the original interleaved positions, preserving total effect order without adding lifecycle hooks or a scheduler.

- [ ] **Step 6: Integrate progress at the old retry block and retain registration order.**

Import default `useShoppingProgress` from `../hooks/useShoppingProgress`. Remove exactly the six state/ref declarations now owned by it (`checkedItems`, `toast`, `toastTimerRef`, `lastLocalMutationRef`, `pendingOpsRef`, `opTokenRef`). Keep all other state/refs. Where `sendProgressOp` previously began, insert:

```js
const {
  checkedItems, toast, handleToggleItem, handleUndo,
  retryProgressEffect, hydrateProgressEffect,
  cleanupUndoToastEffect, pollPartnerProgressEffect,
} = useShoppingProgress({ shoppingList, partnerSession });

useEffect(retryProgressEffect, [retryProgressEffect]);
```

Remove the moved `sendProgressOp`, `drainPendingOps`, retry effect and later toggle/undo declarations. At each other original effect's exact position, replace only that effect call with:

```js
// At the original checked-items hydration position, after list resolution / walk order:
useEffect(hydrateProgressEffect, [hydrateProgressEffect]);

// At the original cleanup-timers position, after wake lock / elapsed timer:
useEffect(cleanupUndoToastEffect, [cleanupUndoToastEffect]);

// At the original live-sync position, after voice hook / completion effect:
useEffect(pollPartnerProgressEffect, [pollPartnerProgressEffect]);
```

Dependency mapping is exact: retry reruns only when `drainPendingOps` changes; hydration only when `shoppingList` changes; toast cleanup remains mount/unmount only; poll reruns on `shoppingList` or `partnerSession`. Each callback's `useCallback` array is the original effect array. Do not wrap these effect callbacks in another async function or invoke them during render. Their return values must reach React unchanged. In particular, poll's `cancelled` stays local to each effect invocation; initial hydration gains no cancellation or pending overlay.

The screen's section collapse, totals, coupons, completion's existing 800ms timeout, elapsed timer, wake lock and voice result/error callbacks stay byte-for-byte in their current order. Tap, Undo and voice all use the single returned `handleToggleItem`. Do not move state-updater side effects outside the updater as cleanup work.

- [ ] **Step 7: Verify, review and commit.**

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --testPathPattern='InStoreMode|FeedbackPanel|useDialog'
npm.cmd run lint
npm.cmd test -- --watchAll=false --runInBand
git add -- src/test-utils/deferredFetch.js src/components/InStoreMode.progress.test.js src/components/InStoreMode.partnerSession.test.js src/hooks/usePartnerSession.js src/hooks/useShoppingProgress.js src/components/InStoreMode.js
git diff --cached --check
git commit -m "refactor: isolate Shop progress and partner session" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Task review must explicitly compare the effect ordering/dependency table, token equality checks, storage-write order and Invite close behavior to the baseline. No screen should acquire a second progress/session owner.

### Task 5: Characterize Cart session behavior, move panels and extract useClipSession

**Files:**

- Create `src/test-utils/cartFixtures.js`, `src/test-utils/FakeEventSource.js`, `src/components/HebCart.session.test.js`, `src/hooks/useClipSession.test.js` and `src/hooks/useClipSession.js`.
- Create `src/components/cart/StepIndicator.js`, `src/components/cart/ConnectionPanel.js`, `src/components/cart/MatchCard.js`, `src/components/cart/SearchModal.js`, `src/components/cart/BuildProgressPanel.js`.
- Modify `src/components/HebCart.js`.
- Read existing `HebCart.test.js`, `HebCart.ConnectionPanel.test.js`, `e2e/cart.spec.js`, and the Cart accessibility case in `e2e/a11y.spec.js`.

- [ ] **Step 1: Add hermetic Cart fixtures and a minimal EventSource fake.**

Complete `src/test-utils/cartFixtures.js`:

```js
export const activeSession = { active: true, loginSessionValid: true, idleSeconds: 0, sessionId: 'original-session' };
export const idleSession = { active: false, loginSessionValid: true, idleSeconds: 0 };
export const expiredSession = { active: false, loginSessionValid: false };
export const cartItems = [
  { ItemID: 23, ItemName: 'Bread', Category: 'Groceries', Quantity: 2 },
  { ItemID: 31, ItemName: 'Milk', Category: 'Groceries', Quantity: 0 },
  { ItemID: 44, ItemName: 'Rice', Category: 'Groceries', Quantity: 1 },
  { ItemID: 55, ItemName: 'Salt', Category: 'Groceries', Quantity: 1 },
];
export const savedMatches = cartItems.map((item, index) => ({
  grocery_item_id: item.ItemID,
  heb_product_id: `product-${item.ItemID}`,
  heb_sku_id: index === 0 ? 'sku-bread' : null,
  heb_product_name: `HEB ${item.ItemName}`,
  heb_product_url: index === 3 ? null : `https://www.heb.com/product-${item.ItemID}`,
  heb_price: 2,
  confidence: 'high',
  match_source: 'manual',
  user_confirmed: index === 2 ? 0 : 1,
}));
export function cartFetchMap(overrides = {}) {
  return {
    '/api/heb/session/status': activeSession,
    '/api/heb/session/start': { sessionId: 'reconnected-session' },
    '/api/heb/session/end': { success: true },
    '/api/heb/weekly-items': { items: cartItems },
    '/api/heb/matches/all': { matches: savedMatches },
    '/api/heb/matches/confirm': { success: true },
    '/api/heb/matches/reject': { success: true },
    '/api/heb/matches': { success: true },
    '/api/heb/build-cart': { jobId: 'job-1' },
    ...overrides,
  };
}
```

Complete `src/test-utils/FakeEventSource.js`:

```js
export default class FakeEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onopen = null;
    this.onerror = null;
    this.close = jest.fn();
    FakeEventSource.instances.push(this);
  }
  message(value) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
  raw(value) {
    this.onmessage?.({ data: value });
  }
  open() { this.onopen?.({}); }
  error() { this.onerror?.({}); }
}
```

This fake does not invent automatic reconnection, events after close, request cancellation, or browser delays. Tests explicitly drive the callbacks. It records `close` so complete/error/unmount outcomes can be distinguished.

- [ ] **Step 2: Characterize reachable session behavior on the original HebCart.**

Complete `src/components/HebCart.session.test.js`:

```js
import React from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import toast from 'react-hot-toast';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { deferNextFetch } from '../test-utils/deferredFetch';
import { activeSession, idleSession, expiredSession, cartFetchMap } from '../test-utils/cartFixtures';
import FakeEventSource from '../test-utils/FakeEventSource';
import HebCart from './HebCart';

jest.mock('react-hot-toast', () => {
  const fn = jest.fn();
  fn.success = jest.fn();
  fn.error = jest.fn();
  fn.loading = jest.fn();
  return { __esModule: true, default: fn, toast: fn };
});
const originalEventSource = global.EventSource;
const flush = () => act(async () => { await Promise.resolve(); });
const advance = (ms) => act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); });
const renderCart = () => renderWithProviders(<HebCart onNavigate={() => {}} />);
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  FakeEventSource.instances = [];
  global.EventSource = FakeEventSource;
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  restoreFetch();
  global.EventSource = originalEventSource;
  localStorage.clear();
  sessionStorage.clear();
});

test('unknown status stays neutral; HTTP and thrown checks resolve offline; recheck returns status', async () => {
  let statusReply = { status: 503, body: {} };
  const mock = installMockFetch(cartFetchMap({ '/api/heb/session/status': () => statusReply }));
  const first = deferNextFetch('/api/heb/session/status');
  renderCart();
  expect(screen.getByText('Checking connection…')).toBeInTheDocument();
  expect(screen.queryByText('HEB sign-in needed')).not.toBeInTheDocument();
  first.release();
  await flush();
  expect(screen.getByText('HEB sign-in needed')).toBeInTheDocument();
  const failedRecheck = deferNextFetch('/api/heb/session/status');
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled();
  failedRecheck.reject(new TypeError('offline'));
  await flush();
  expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  expect(toast).toHaveBeenCalledWith(expect.stringContaining('Still signed out'));
  statusReply = idleSession;
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  await flush();
  expect(screen.getByRole('button', { name: 'Connect to HEB' })).toBeInTheDocument();
  expect(toast.success).toHaveBeenCalledWith('Connected!');
  expect(mock.for('/api/heb/session/status')).toHaveLength(3);
});

test('connect sends headless true, preserves busy state and installs the synthetic active status', async () => {
  const mock = installMockFetch(cartFetchMap({ '/api/heb/session/status': idleSession }));
  renderCart();
  await flush();
  const start = deferNextFetch('/api/heb/session/start');
  fireEvent.click(screen.getByRole('button', { name: 'Connect to HEB' }));
  expect(screen.getByRole('button', { name: 'Launching browser...' })).toBeDisabled();
  expect(mock.for('/api/heb/session/start')[0].body).toEqual({ headless: true });
  start.release();
  await flush();
  expect(screen.getByText('Connected', { exact: true })).toBeInTheDocument();
  expect(screen.getByText('Bread', { exact: true })).toBeInTheDocument();
  // No extra status check was inserted after start; the result is synthetic.
  expect(mock.for('/api/heb/session/status')).toHaveLength(1);
});

test.each(['http', 'network'])('connect failure preserves connect controls: %s', async (failure) => {
  installMockFetch(cartFetchMap({
    '/api/heb/session/status': idleSession,
    '/api/heb/session/start': { status: 503, body: { message: 'start unavailable' } },
  }));
  renderCart();
  await flush();
  const start = failure === 'network' ? deferNextFetch('/api/heb/session/start') : null;
  fireEvent.click(screen.getByRole('button', { name: 'Connect to HEB' }));
  if (start) start.reject(new TypeError('offline'));
  await flush();
  expect(screen.getByRole('button', { name: 'Connect to HEB' })).toBeEnabled();
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Connection failed:'));
});

test('status polling continues in review at 30s and stops on screen unmount', async () => {
  let statusReply = activeSession;
  const mock = installMockFetch(cartFetchMap({ '/api/heb/session/status': () => statusReply }));
  const view = renderCart();
  await flush();
  expect(screen.getByText('Bread', { exact: true })).toBeInTheDocument();
  await advance(29999);
  expect(mock.for('/api/heb/session/status')).toHaveLength(1);
  statusReply = expiredSession;
  await advance(1);
  expect(mock.for('/api/heb/session/status')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  // Losing the session does not itself navigate away from review.
  expect(screen.getByText('Bread', { exact: true })).toBeInTheDocument();
  view.unmount();
  await advance(60000);
  expect(mock.for('/api/heb/session/status')).toHaveLength(2);
});

test.each(['active', 'inactive', 'http', 'network', 'start-http', 'start-network'])(
  'build consumes the existing ensure-session result: %s', async (outcome) => {
    let statusReply = activeSession;
    const mock = installMockFetch(cartFetchMap({
      '/api/heb/session/status': () => statusReply,
      '/api/heb/session/start': outcome === 'start-http'
        ? { status: 503, body: { message: 'cannot start' } } : { sessionId: 'new-session' },
    }));
    renderCart();
    await flush();
    // Give the parent an inactive status first so its existing active-session
    // auto-advance cannot immediately undo an ensure-failure connect transition.
    statusReply = expiredSession;
    await advance(30000);
    statusReply = outcome === 'active' ? activeSession
      : outcome === 'http' ? { status: 503, body: {} } : expiredSession;
    const failedStatus = outcome === 'network' ? deferNextFetch('/api/heb/session/status') : null;
    const failedStart = outcome === 'start-network' ? deferNextFetch('/api/heb/session/start') : null;
    fireEvent.click(screen.getByRole('button', { name: 'Build HEB Cart (3)' }));
    if (failedStatus) failedStatus.reject(new TypeError('offline'));
    await flush();
    if (failedStart) {
      expect(mock.for('/api/heb/session/start')).toHaveLength(1);
      failedStart.reject(new TypeError('offline'));
      await flush();
    }
    const failed = ['network', 'start-http', 'start-network'].includes(outcome);
    expect(mock.for('/api/heb/session/start')).toHaveLength(['active', 'network'].includes(outcome) ? 0 : 1);
    expect(mock.for('/api/heb/build-cart')).toHaveLength(failed ? 0 : 1);
    if (failed) {
      expect(screen.getByText('HEB sign-in needed')).toBeInTheDocument();
    } else {
      expect(screen.getByRole('heading', { name: 'Building Your HEB Cart...' })).toBeInTheDocument();
      expect(FakeEventSource.instances).toHaveLength(1);
      // An already-active verification does not publish its response in state;
      // a reconnect publishes the existing synthetic active status.
      expect(screen.queryByText('Connected', { exact: true }) !== null).toBe(outcome !== 'active');
    }
  }
);
```

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --runTestsByPath src/components/HebCart.session.test.js src/components/HebCart.test.js src/components/HebCart.ConnectionPanel.test.js
```

Expected: PASS before extracting session or panels. Existing smart-match coverage still exercises the unchanged matcher with `sessionStatus.active`; do not expand its algorithm coverage here. **Source correction to the context map:** `ensureSession` is called only by build in this baseline, not by matching. Do not introduce a new smart-match verification call.

- [ ] **Step 3: Move existing Cart view declarations with exact import ownership.**

| New file | Exact move from `HebCart.js` | Imports; export |
| --- | --- | --- |
| `src/components/cart/StepIndicator.js` | `STEPS` and complete `StepIndicator` (13–51), with step-indicator comment | React; `{ Check, ChevronRight }` from `lucide-react`; `export default StepIndicator;` |
| `src/components/cart/ConnectionPanel.js` | Complete `ConnectionPanel` (54–188), retain its five props | React, `{ useState }`; `{ Wifi, WifiOff, Loader2, RefreshCw, ChevronDown, ChevronUp }` from `lucide-react`; default `toast` from `react-hot-toast`; `export { ConnectionPanel };` |
| `src/components/cart/MatchCard.js` | Complete `React.memo` declaration `MatchCard` (194–302) | React; `{ Star, Check, X, CheckCircle2, Search }` from `lucide-react`; `export default MatchCard;` |
| `src/components/cart/SearchModal.js` | Complete `SearchModal` (305–431) | React, `{ useState, useRef, useEffect, useCallback }`; `{ Search, X, Loader2, ChevronRight }` from `lucide-react`; `{ ENDPOINTS }` from `../../config/api`; `export default SearchModal;` |
| `src/components/cart/BuildProgressPanel.js` | Complete `BuildProgressPanel` (434–510) | React; `{ CheckCircle2, Loader2, XCircle, SkipForward }` from `lucide-react`; `export default BuildProgressPanel;` |

Keep each comment with its declaration. Move each body verbatim, including `MatchCard`'s current unused `onSwap` prop, SearchModal's raw query handling/conditional lifetime, and ConnectionPanel's disclosure/rechecking state and exact G geometry. Do not add dialog behavior to SearchModal.

Add these facade imports and preserve the named export without a cycle:

```js
import StepIndicator from './cart/StepIndicator';
import { ConnectionPanel } from './cart/ConnectionPanel';
import MatchCard from './cart/MatchCard';
import SearchModal from './cart/SearchModal';
import BuildProgressPanel from './cart/BuildProgressPanel';
export { ConnectionPanel } from './cart/ConnectionPanel';
```

`HebCart` keeps React's screen hooks, `{ ShoppingCart, Wifi, AlertCircle, Zap, Loader2, CheckCircle2, ArrowRight, X }` for remaining JSX, `{ ENDPOINTS, apiJson }`, `getWeekDateRange`, and default `toast`. It continues owning the exact existing JSX conditions, step, weekly groceries, matches, matching progress/search warning, two-phase matching callbacks, review actions, SearchModal selection and totals. No new smart-match or review module belongs in D.

- [ ] **Step 4: Create useClipSession with this complete implementation.**

The bodies below are the original session declarations (530–615), with only explicit step-transition injection and its stable dependency added. Keep raw `fetch`; these endpoints were not `apiJson` callers.

```js
import { useState, useCallback, useEffect } from 'react';
import { ENDPOINTS } from '../config/api';
import toast from 'react-hot-toast';

export default function useClipSession({ onStepChange }) {
  const [sessionStatus, setSessionStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINTS.hebSessionStatus);
      if (res.ok) {
        const data = await res.json();
        setSessionStatus(data);
        return data;
      }
      const offline = { active: false, loginSessionValid: false };
      setSessionStatus(offline);
      return offline;
    } catch {
      const offline = { active: false, loginSessionValid: false };
      setSessionStatus(offline);
      return offline;
    }
  }, []);

  useEffect(() => {
    checkSession();
    const interval = setInterval(checkSession, 30000);
    return () => clearInterval(interval);
  }, [checkSession]);

  const startSession = useCallback(async () => {
    const res = await fetch(ENDPOINTS.hebSessionStart, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless: true }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `Failed (${res.status})`);
    }
    const data = await res.json();
    setSessionStatus({ active: true, sessionId: data.sessionId, loginSessionValid: true, idleSeconds: 0 });
    return data;
  }, []);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      await startSession();
      toast.success('Connected to HEB!');
      onStepChange('review');
    } catch (err) {
      toast.error(`Connection failed: ${err.message}`);
    } finally {
      setConnecting(false);
    }
  }, [startSession, onStepChange]);

  const ensureSession = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINTS.hebSessionStatus);
      if (res.ok) {
        const data = await res.json();
        if (data.active) return true;
      }
      toast.loading('Reconnecting to HEB...', { id: 'reconnect' });
      await startSession();
      toast.success('Reconnected to HEB!', { id: 'reconnect' });
      return true;
    } catch (err) {
      toast.error(`Could not reconnect: ${err.message}`, { id: 'reconnect' });
      return false;
    }
  }, [startSession]);

  const handleDisconnect = useCallback(async () => {
    try {
      await fetch(ENDPOINTS.hebSessionEnd, { method: 'POST' });
      setSessionStatus({ active: false, loginSessionValid: sessionStatus?.loginSessionValid });
      onStepChange('connect');
      toast.success('Disconnected from HEB');
    } catch {
      toast.error('Failed to disconnect');
    }
  }, [sessionStatus, onStepChange]);

  return { sessionStatus, connecting, checkSession, handleConnect, handleDisconnect, ensureSession };
}
```

When moving from source, retain the existing comments explaining `ensureSession`; the code above supplies the complete integration contract. `startSession` stays private. There is no new cancellation, visibility gate, poll overlap protection, reconnect verification fetch, or HTTP-status inspection for disconnect.

- [ ] **Step 5: Integrate the session hook at the original session-polling location.**

After the screen's `step` state declaration add the stable explicit transition callback:

```js
const transitionToStep = useCallback((nextStep) => {
  setStep(nextStep);
}, []);
```

Remove the screen's `sessionStatus` and `connecting` declarations and the complete original session block from `Session polling` through `handleDisconnect`, ending before `Load weekly grocery items + coupon data + existing matches`. Replace that block with:

```js
const {
  sessionStatus, connecting, checkSession,
  handleConnect, handleDisconnect, ensureSession,
} = useClipSession({ onStepChange: transitionToStep });
```

Import the default hook from `../hooks/useClipSession`. Call it unconditionally in `HebCart`, at the first original session effect's location. The 30s polling effect still precedes build cleanup and parent auto-advance/preload effects. Parent auto-advance (`[sessionStatus, step]`) and preload dependencies remain unchanged, as do matching/review callbacks. Pass the returned callbacks to the unchanged ConnectionPanel props.

- [ ] **Step 6: Add the bounded post-extraction disconnect test.**

`handleDisconnect` has no stable user-reachable full-screen state in the baseline: active ConnectionPanel is immediately replaced by review through the parent's existing auto-advance. Do not modify navigation to expose it. Its original body is a mandatory verbatim review target; after extraction, cover that already-existing branch through the real hook and real ConnectionPanel in `src/hooks/useClipSession.test.js`:

```js
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { deferNextFetch } from '../test-utils/deferredFetch';
import { activeSession, cartFetchMap } from '../test-utils/cartFixtures';
import { ConnectionPanel } from '../components/HebCart';
import useClipSession from './useClipSession';

function Harness({ onStepChange }) {
  const session = useClipSession({ onStepChange });
  return <ConnectionPanel sessionStatus={session.sessionStatus} connecting={session.connecting}
    onConnect={session.handleConnect} onDisconnect={session.handleDisconnect} onRecheck={session.checkSession} />;
}
afterEach(() => { cleanup(); restoreFetch(); });
test.each(['http', 'network'])('disconnect retains its HTTP/network distinction: %s', async (failure) => {
  const onStepChange = jest.fn();
  const mock = installMockFetch(cartFetchMap({
    '/api/heb/session/status': activeSession,
    '/api/heb/session/end': { status: 503, body: { message: 'server failed' } },
  }));
  render(<Harness onStepChange={onStepChange} />);
  await act(async () => { await Promise.resolve(); });
  const request = failure === 'network' ? deferNextFetch('/api/heb/session/end') : null;
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  if (request) request.reject(new TypeError('offline'));
  await act(async () => { await Promise.resolve(); });
  expect(mock.for('/api/heb/session/end')[0].method).toBe('POST');
  if (failure === 'http') {
    expect(onStepChange).toHaveBeenCalledWith('connect');
    expect(screen.getByRole('button', { name: 'Connect to HEB' })).toBeInTheDocument();
  } else {
    expect(onStepChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  }
});
```

This supplements the baseline screen characterization; it is not represented as a pre-extraction original-screen test.

- [ ] **Step 7: Run targeted Jest, foreground G browser checks, lint and full Jest; review and commit.**

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --testPathPattern='HebCart|useClipSession'
npx.cmd playwright test e2e/cart.spec.js e2e/a11y.spec.js --project mobile --project desktop --grep 'Cart|cart|HEB|HEB Cart'
npm.cmd run lint
npm.cmd test -- --watchAll=false --runInBand
git add -- src/test-utils/cartFixtures.js src/test-utils/FakeEventSource.js src/components/HebCart.session.test.js src/hooks/useClipSession.test.js src/hooks/useClipSession.js src/components/HebCart.js src/components/cart/StepIndicator.js src/components/cart/ConnectionPanel.js src/components/cart/MatchCard.js src/components/cart/SearchModal.js src/components/cart/BuildProgressPanel.js
git diff --cached --check
git commit -m "refactor: separate Cart panels and session lifecycle" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Expected: preserved 44px disclosure/hit geometry, local panel state, session polling in review, returned recheck status and all existing matching tests. Keep this source commit separate from build extraction.

### Task 6: Characterize and extract Cart build / EventSource ownership

**Files:**

- Create `src/components/HebCart.build.test.js` and `src/hooks/useCartBuild.js`.
- Modify `src/components/HebCart.js`.
- Reuse Task 4's `src/test-utils/deferredFetch.js` and Task 5's Cart fixtures/EventSource fake; do not modify backend fixtures or use a real HEB build.

- [ ] **Step 1: Add build characterization while the build body still resides in HebCart.**

Create `src/components/HebCart.build.test.js` with this suite. Add/run each related test group in a bounded increment: snapshot/filtering; progress/complete; distinct error paths; lifetime. These tests also run against the original build body after Task 5's session extraction. They must PASS before moving build state or SSE ownership.

```js
import React from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import toast from 'react-hot-toast';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { deferNextFetch } from '../test-utils/deferredFetch';
import { cartFetchMap } from '../test-utils/cartFixtures';
import FakeEventSource from '../test-utils/FakeEventSource';
import HebCart from './HebCart';

jest.mock('react-hot-toast', () => {
  const fn = jest.fn();
  fn.success = jest.fn();
  fn.error = jest.fn();
  fn.loading = jest.fn();
  return { __esModule: true, default: fn, toast: fn };
});
const originalEventSource = global.EventSource;
const flush = () => act(async () => { await Promise.resolve(); });
const advance = (ms) => act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); });
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  FakeEventSource.instances = [];
  global.EventSource = FakeEventSource;
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  restoreFetch();
  global.EventSource = originalEventSource;
  jest.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});
async function mountCart(overrides = {}) {
  const mock = installMockFetch(cartFetchMap(overrides));
  const view = renderWithProviders(<HebCart onNavigate={() => {}} />);
  await flush();
  expect(screen.getByRole('button', { name: 'Build HEB Cart (3)' })).toBeInTheDocument();
  return { mock, view };
}
async function startBuild() {
  fireEvent.click(screen.getByRole('button', { name: /Build HEB Cart/ }));
  await flush();
  expect(FakeEventSource.instances).toHaveLength(1);
  return FakeEventSource.instances[0];
}
const expectedItems = [
  { groceryItemId: 23, groceryItemName: 'Bread', productUrl: 'https://www.heb.com/product-23',
    hebProductId: 'product-23', hebSkuId: 'sku-bread', quantity: 2 },
  { groceryItemId: 31, groceryItemName: 'Milk', productUrl: 'https://www.heb.com/product-31',
    hebProductId: 'product-31', hebSkuId: null, quantity: 1 },
];

test('build snapshots eligible groceries before awaiting verification and retains payload defaults', async () => {
  const { mock } = await mountCart();
  const verification = deferNextFetch('/api/heb/session/status');
  fireEvent.click(screen.getByRole('button', { name: 'Build HEB Cart (3)' }));
  // Rice becomes confirmed while verification is outstanding. Salt is already
  // confirmed but lacks a URL; neither belonged to the captured eligible list.
  fireEvent.click(screen.getByTitle('Accept match'));
  await flush();
  expect(screen.getByRole('button', { name: 'Build HEB Cart (4)' })).toBeInTheDocument();
  expect(mock.for('/api/heb/build-cart')).toHaveLength(0);
  verification.release();
  await flush();
  expect(mock.for('/api/heb/build-cart')[0].body).toEqual({ items: expectedItems });
  expect(mock.for('/api/heb/build-cart')[0].method).toBe('POST');
  const calls = mock.calls();
  const buildIndex = calls.findIndex((call) => call.url.includes('/api/heb/build-cart'));
  const verificationIndex = calls.map((call) => call.url.includes('/api/heb/session/status')).lastIndexOf(true);
  expect(verificationIndex).toBeLessThan(buildIndex);
  expect(FakeEventSource.instances[0].url).toMatch(/\/api\/heb\/build-progress\/job-1$/);
  expect(mock.unmocked()).toEqual([]);
});

test('progress replaces strict indexes in arrival order; complete closes and shows the summary', async () => {
  const { view } = await mountCart();
  const source = await startBuild();
  act(() => {
    source.message({ type: 'progress', index: 2, status: 'adding', groceryItemName: 'row: first' });
    source.message({ type: 'progress', index: 0, status: 'added', groceryItemName: 'row: second' });
    source.message({ type: 'progress', index: 2, status: 'failed', groceryItemName: 'row: replaced', message: 'unavailable' });
    source.message({ type: 'progress', index: '2', status: 'skipped', groceryItemName: 'row: string index' });
  });
  expect(screen.getAllByText(/^row:/).map((element) => element.textContent)).toEqual([
    'row: replaced', 'row: second', 'row: string index',
  ]);
  expect(screen.queryByText('row: first')).not.toBeInTheDocument();
  expect(source.close).not.toHaveBeenCalled();
  act(() => source.message({ type: 'complete', summary: {
    added: 1, failed: 1, skipped: 0, cart: { total: 4.5 },
  } }));
  expect(screen.getByRole('heading', { name: 'Cart Built!' })).toBeInTheDocument();
  expect(screen.getByText('1 items added, $4.50 estimated total')).toBeInTheDocument();
  expect(source.close).toHaveBeenCalledTimes(1);
  expect(toast.success).toHaveBeenCalledWith('Cart built! 1 items added.');
  view.unmount();
  expect(source.close).toHaveBeenCalledTimes(2); // stored ref is not cleared on complete
});

test('a server error closes its stream while the screen remains in build', async () => {
  await mountCart();
  const source = await startBuild();
  act(() => source.message({ type: 'error', message: 'worker stopped' }));
  expect(source.close).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'Building Your HEB Cart...' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Match & Review' })).not.toBeInTheDocument();
  expect(toast.error).toHaveBeenCalledWith('Build error: worker stopped');
});

test('five consecutive transport errors return to review and open resets the counter', async () => {
  await mountCart();
  const source = await startBuild();
  act(() => { for (let index = 0; index < 4; index += 1) source.error(); });
  expect(source.close).not.toHaveBeenCalled();
  act(() => source.open());
  act(() => { for (let index = 0; index < 4; index += 1) source.error(); });
  expect(source.close).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Building Your HEB Cart...' })).toBeInTheDocument();
  act(() => source.error());
  expect(source.close).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'Match & Review' })).toBeInTheDocument();
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Lost connection to the build stream'));
});

test('malformed event JSON logs without closing or changing the build step', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  await mountCart();
  const source = await startBuild();
  act(() => source.raw('{broken'));
  expect(log).toHaveBeenCalledWith('[heb-cart] SSE parse error:', expect.any(Error));
  expect(source.close).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Building Your HEB Cart...' })).toBeInTheDocument();
  act(() => source.message({ type: 'progress', index: 0, status: 'adding', groceryItemName: 'still processing' }));
  expect(screen.getByText('still processing')).toBeInTheDocument();
});

test.each(['http', 'network'])('build-start failure returns to review: %s', async (failure) => {
  await mountCart({ '/api/heb/build-cart': { status: 503, body: { message: 'build unavailable' } } });
  const build = failure === 'network' ? deferNextFetch('/api/heb/build-cart') : null;
  fireEvent.click(screen.getByRole('button', { name: 'Build HEB Cart (3)' }));
  await flush();
  if (build) { build.reject(new TypeError('offline')); await flush(); }
  expect(screen.getByRole('heading', { name: 'Match & Review' })).toBeInTheDocument();
  expect(FakeEventSource.instances).toHaveLength(0);
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to start build:'));
});

test('session polling spans build and screen unmount closes the current stream', async () => {
  const { mock, view } = await mountCart();
  const source = await startBuild();
  expect(mock.for('/api/heb/session/status')).toHaveLength(2); // mount + build verification
  await advance(30000);
  expect(mock.for('/api/heb/session/status')).toHaveLength(3);
  expect(FakeEventSource.instances).toHaveLength(1);
  expect(source.close).not.toHaveBeenCalled();
  view.unmount();
  expect(source.close).toHaveBeenCalledTimes(1);
  await advance(30000);
  expect(mock.for('/api/heb/session/status')).toHaveLength(3);
});

test('late build-start resolution retains the existing lack of request cancellation', async () => {
  const { view } = await mountCart();
  const build = deferNextFetch('/api/heb/build-cart');
  fireEvent.click(screen.getByRole('button', { name: 'Build HEB Cart (3)' }));
  await flush();
  expect(FakeEventSource.instances).toHaveLength(0);
  view.unmount();
  build.release();
  await flush();
  expect(FakeEventSource.instances).toHaveLength(1);
  expect(FakeEventSource.instances[0].close).not.toHaveBeenCalled();
  // A fake has no socket. Dispose it explicitly after observing the baseline.
  FakeEventSource.instances[0].close();
});
```

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --runTestsByPath src/components/HebCart.build.test.js src/components/HebCart.session.test.js
```

Expected: PASS with build still screen-owned. The late-resolution test records an existing lifecycle quirk; add its evidence to the deferred-findings ledger, and preserve it here. Do not introduce cancellation, a disposed flag, EventSource deduplication, reset-on-step behavior or an error normalization helper.

- [ ] **Step 2: Create the build hook with the exact state and request-body move.**

Create `src/hooks/useCartBuild.js` using the complete shell below. B1 means a verbatim source move, with the two mechanical identifier/dependency changes specified afterward; no new request/EventSource implementation needs to be designed.

```js
import { useState, useRef, useCallback, useEffect } from 'react';
import { ENDPOINTS } from '../config/api';
import toast from 'react-hot-toast';

export default function useCartBuild({ groceryItems, matches, ensureSession, onStepChange }) {
  const [buildProgress, setBuildProgress] = useState([]);
  const [buildSummary, setBuildSummary] = useState(null);
  const eventSourceRef = useRef(null);

  // MOVE B1: the complete handleBuildCart useCallback declaration.

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return { buildProgress, buildSummary, handleBuildCart };
}
```

B1 is the entire declaration beginning `const handleBuildCart = useCallback(async () => {` beneath `Build Cart`, through `}, [groceryItems, matches, ensureSession]);`, before `Cleanup SSE on unmount` (original 1061–1162). Change each `setStep(...)` **inside that moved declaration only** to `onStepChange(...)`, and change its dependency array to:

```js
}, [groceryItems, matches, ensureSession, onStepChange]);
```

Every other statement is moved verbatim: `itemsToAdd` still computes before `await ensureSession()`, zero eligible items still returns without verification, failed verification still requests connect, successful verification still transitions build before clearing progress/summary, the build POST still sends `{ items: itemsToAdd }`, and all EventSource handlers retain their current order/closures and exact messages.

`onStepChange` is the stable callback already introduced in Task 5, so adding it to the callback's dependency array introduces no additional reruns. Keep the local `sseErrors` counter per EventSource construction; do not put it into state/a shared ref. Keep strict `p.index === data.index` replacement, arrival order, summary ownership and the currently stored source ref.

- [ ] **Step 3: Integrate the hook at the original build block, retaining the screen lifetime.**

Remove only the screen's `buildProgress`, `buildSummary` and `eventSourceRef` declarations. Import default `useCartBuild` from `../hooks/useCartBuild`. Replace `Build Cart` through `Cleanup SSE on unmount`, immediately before `Computed values`, with:

```js
const { buildProgress, buildSummary, handleBuildCart } = useCartBuild({
  groceryItems,
  matches,
  ensureSession,
  onStepChange: transitionToStep,
});
```

This unconditional call remains above HebCart's return, regardless of connect/review/build. Its cleanup effect stays after session polling and before auto-advance/preload, exactly as before. `useRef` is now unused in HebCart and can be removed from its React import; `useEffect`, `useState`, `useMemo`, `useCallback`, API imports and `toast` remain used by its untouched ownership.

The footer continues using `matchStats.confirmed`, while BuildProgressPanel continues receiving:

```jsx
<BuildProgressPanel
  progress={buildProgress}
  summary={buildSummary}
  totalItems={groceryItems.filter(i => matches[i.ItemID]?.userConfirmed && matches[i.ItemID]?.hebProductUrl).length}
/>
```

Do not replace that existing render-time total with the captured request length; the baseline can differ when a match changes during verification. Keep all current matching and review handlers and their state ownership in HebCart. Do not move the hook into BuildProgressPanel or reset it when the step changes.

- [ ] **Step 4: Verify, review and commit.**

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --testPathPattern='HebCart|useClipSession'
npm.cmd run lint
npm.cmd test -- --watchAll=false --runInBand
git add -- src/components/HebCart.build.test.js src/hooks/useCartBuild.js src/components/HebCart.js
git diff --cached --check
git commit -m "refactor: isolate Cart build and progress stream" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

The task reviewer compares the moved callback against its original body with `setStep`/dependency changes accounted for, confirms there are no new match/review abstractions, and checks the screen-wide session/stream lifetime. Full foreground hermetic Playwright and the single live release-gate run remain in the main plan's whole-branch gate; do not invoke a live cart build in these tasks.

**Contract observations to carry into task reports:** Shop's interleaved effects require retained screen registrations with hook-owned memoized callbacks; initial hydration still replaces pending local progress. Cart matching does not invoke `ensureSession`; disconnect has no stable active-panel screen state because of existing auto-advance. Failed build verification can briefly request connect and be immediately auto-advanced back to review if the screen still holds an active session status, so the session characterization deliberately publishes inactive status first when asserting persistent connect UI. A build-start response resolving after unmount currently creates an unclosed stream; preserve and record it as a separate follow-up. None of these observations authorizes a behavior fix in D.

---

### Task 7: Extract Cook views and the screen-lifetime cooking timer

**Files:**

- Create `src/components/RecipeInstructions.behavior.test.js`.
- Create `src/components/cook/RecipeSelectionView.js`.
- Create `src/components/cook/CookingView.js`.
- Create `src/hooks/useCookingTimer.js`.
- Modify `src/components/RecipeInstructions.js`.
- Reuse `src/components/RecipeInstructions.a11y.test.js`, `e2e/cook.spec.js`, and the Cook cases in `e2e/a11y.spec.js` unchanged.

- [ ] **Step 1: Add the following characterization file while RecipeInstructions is still the original implementation.** These tests should PASS before extraction. A failure is evidence to investigate against the original source, not an instruction to repair production behavior or manufacture a RED phase. The timer controls currently have no accessible names; the test locates their existing Lucide icons locally without introducing unrelated accessibility changes.

```jsx
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import RecipeInstructions from './RecipeInstructions';

jest.mock('canvas-confetti', () => jest.fn());
jest.mock('react-hot-toast', () => {
  const mockToast = jest.fn();
  mockToast.success = jest.fn();
  mockToast.error = jest.fn();
  return { __esModule: true, default: mockToast };
});

const meals = [{ id: 3, recipeId: 3, name: 'Timer supper' }];
const instructions = (durations = [1, 2, 0]) => [{
  output: durations.map((minutes, index) => ({
    recipe_id: 3, step_number: index + 1,
    instruction_text: ['First action', 'Second action', 'Third action'][index],
    time_minutes: minutes, ingredients_used: [],
  })),
  all_ingredients: [],
}];
const tick = async ms => {
  await act(async () => { jest.advanceTimersByTime(ms); });
};
const timerControl = icon => {
  const time = screen.getByText(/^\d{2}:\d{2}$/);
  return time.parentElement.querySelector(`svg.lucide-${icon}`).closest('button');
};
const readSaved = () => JSON.parse(localStorage.getItem('recipeInstructionState'));
async function mountCook(reply = instructions()) {
  const mock = installMockFetch({ '/grab_instructions_fast': reply });
  const view = renderWithProviders(<RecipeInstructions selectedMeals={meals} onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start Cooking' }));
  await screen.findByText('First action');
  expect(mock.for('/grab_instructions_fast')).toHaveLength(1);
  expect(mock.unmocked()).toEqual([]);
  return { mock, ...view };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-10T15:00:00Z'));
  localStorage.clear();
  localStorage.setItem('recipeSwipeHintShown', 'true');
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  restoreFetch();
  localStorage.clear();
});

test('running replacement keeps the existing tick cadence; decline, pause and cancel retain their contracts', async () => {
  await mountCook();
  fireEvent.click(screen.getByRole('button', { name: 'Start 1 mins Timer' }));
  await tick(500);
  fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole('button', { name: 'Start 2 mins Timer' }));
  expect(screen.getByText('01:00')).toBeInTheDocument();
  expect(window.confirm).toHaveBeenCalledWith('A timer is already running. Replace it?');
  fireEvent.click(screen.getByRole('button', { name: 'Start 2 mins Timer' }));
  expect(screen.getByText('02:00')).toBeInTheDocument();
  await tick(499);
  expect(screen.getByText('02:00')).toBeInTheDocument();
  await tick(1);
  expect(screen.getByText('01:59')).toBeInTheDocument();
  fireEvent.click(timerControl('pause'));
  await tick(3000);
  expect(screen.getByText('01:59')).toBeInTheDocument();
  const confirmations = window.confirm.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Start 2 mins Timer' }));
  expect(window.confirm).toHaveBeenCalledTimes(confirmations);
  fireEvent.click(timerControl('x'));
  expect(screen.queryByText(/^\d{2}:\d{2}$/)).not.toBeInTheDocument();
  expect(readSaved()).toEqual(expect.objectContaining({ timerSeconds: 0, timerStepIndex: null }));
});

test('timer belongs to its starting step; finish shows the existing toast without completing or advancing the step', async () => {
  await mountCook();
  fireEvent.click(screen.getByRole('button', { name: 'Start 1 mins Timer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  expect(screen.getByRole('heading', { name: 'Step 2' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Step 1', exact: true }));
  expect(screen.getByRole('heading', { name: 'Step 1' })).toBeInTheDocument();
  // Separate acts model individual React interval renders at the finish boundary.
  for (let index = 0; index < 60; index += 1) await tick(1000);
  expect(screen.queryByText(/^\d{2}:\d{2}$/)).not.toBeInTheDocument();
  expect(toast.success).toHaveBeenCalledWith('Timer complete! This step is done.', {
    duration: 6000, style: { fontSize: '16px', fontWeight: 'bold' },
  });
  expect(screen.getByRole('heading', { name: 'Step 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Complete', exact: true })).toBeInTheDocument();
  expect(readSaved()).toEqual(expect.objectContaining({ completedSteps: [], timerSeconds: 0, timerStepIndex: 0 }));
});

test('saved time restores paused without elapsed subtraction and survives selection while paused', async () => {
  localStorage.setItem('recipeInstructionState', JSON.stringify({
    selectedRecipeId: 3, currentStep: 1, completedSteps: [], timerSeconds: 47,
    timerStepIndex: 0, savedAt: Date.now() - 3600000, recipeName: 'Timer supper',
  }));
  const mock = installMockFetch({ '/grab_instructions_fast': instructions() });
  renderWithProviders(<RecipeInstructions selectedMeals={meals} onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Resume', exact: true }));
  await screen.findByText('Second action');
  expect(screen.getByText('00:47')).toBeInTheDocument();
  await tick(3000);
  expect(screen.getByText('00:47')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(screen.queryByText('00:47')).not.toBeInTheDocument();
  expect(localStorage.getItem('recipeInstructionState')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Start Cooking' }));
  await screen.findByText('First action');
  expect(screen.getByText('00:47')).toBeInTheDocument();
  expect(mock.for('/grab_instructions_fast')).toHaveLength(2);
  fireEvent.click(timerControl('play'));
  await tick(1000);
  expect(screen.getByText('00:46')).toBeInTheDocument();
});

test('running Back clears timer state and unmount clears its interval', async () => {
  const { unmount } = await mountCook();
  const setIntervalSpy = jest.spyOn(global, 'setInterval');
  const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
  fireEvent.click(screen.getByRole('button', { name: 'Start 1 mins Timer' }));
  const firstInterval = setIntervalSpy.mock.results[0].value;
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(clearIntervalSpy).toHaveBeenCalledWith(firstInterval);
  fireEvent.click(screen.getByRole('button', { name: 'Start Cooking' }));
  await screen.findByText('First action');
  expect(screen.queryByText(/^\d{2}:\d{2}$/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Start 1 mins Timer' }));
  const finalInterval = setIntervalSpy.mock.results[setIntervalSpy.mock.results.length - 1].value;
  unmount();
  expect(clearIntervalSpy).toHaveBeenCalledWith(finalInterval);
  await tick(61000);
  expect(toast.success).not.toHaveBeenCalledWith('Timer complete! This step is done.', expect.anything());
});

test.each([
  [1, '1 mins', '01:00'], [0.5, '0.5 mins', '00:30'],
  ['1-2', '1-2 mins', '01:00'], [-1, '-1 mins', '01:00'],
])('duration %p retains the current numeric-or-first-integer parser', async (value, label, time) => {
  await mountCook(instructions([value, 2, 0]));
  fireEvent.click(screen.getByRole('button', { name: `Start ${label} Timer` }));
  expect(screen.getByText(time)).toBeInTheDocument();
});

test('zero duration has no timer button and instruction fallback differs from request failure/retry', async () => {
  const view = await mountCook(instructions([0, 2, 0]));
  expect(screen.queryByRole('button', { name: /Start .* Timer/ })).not.toBeInTheDocument();
  view.unmount();
  localStorage.clear();
  let attempts = 0;
  const mock = installMockFetch({ '/grab_instructions_fast': () => {
    attempts += 1;
    return attempts === 1 ? { status: 403, body: { message: 'denied' } } : [];
  } });
  renderWithProviders(<RecipeInstructions selectedMeals={meals} onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start Cooking' }));
  await screen.findByRole('heading', { name: 'Unable to Load Recipe' });
  expect(screen.queryByText('(Sample)')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry', exact: true }));
  expect(await screen.findByText('(Sample)')).toBeInTheDocument();
  expect(mock.for('/grab_instructions_fast')).toHaveLength(2);
  expect(mock.unmocked()).toEqual([]);
});

test.each(['next', 'previous', 'jump', 'swipe'])('auto-advance retains the %s navigation policy', async navigation => {
  await mountCook();
  if (navigation === 'previous') fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  fireEvent.click(screen.getByRole('button', { name: 'Complete', exact: true }));
  if (navigation === 'next') fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  if (navigation === 'previous') fireEvent.click(screen.getByRole('button', { name: 'Previous Step' }));
  if (navigation === 'jump') {
    fireEvent.click(screen.getByRole('button', { name: 'All steps' }));
    fireEvent.click(screen.getByText('Second action').closest('button'));
  }
  if (navigation === 'swipe') {
    const paragraph = screen.getByText('First action');
    fireEvent.touchStart(paragraph, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(paragraph, { changedTouches: [{ clientX: 80, clientY: 100 }] });
  }
  await tick(500);
  const expected = navigation === 'next' ? 2 : navigation === 'previous' ? 1 : 3;
  expect(screen.getByRole('heading', { name: `Step ${expected}` })).toBeInTheDocument();
});

test('recipe selection retains the selectedMeals snapshot from mount', async () => {
  const mock = installMockFetch({ '/choose_recipe_instructions': [] });
  const view = render(<RecipeInstructions selectedMeals={[]} onNavigate={jest.fn()} />);
  await screen.findByText('No meals planned yet');
  view.rerender(<RecipeInstructions selectedMeals={meals} onNavigate={jest.fn()} />);
  expect(screen.getByText('No meals planned yet')).toBeInTheDocument();
  await waitFor(() => expect(mock.for('/choose_recipe_instructions')).toHaveLength(1));
});
```

- [ ] **Step 2: Run the new file and existing Cook component test against the original source.** From the implementation worktree, run:

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --runTestsByPath src/components/RecipeInstructions.behavior.test.js src/components/RecipeInstructions.a11y.test.js
```

Expected: all tests pass with the original source. Record actual results in the task ledger. The examples above are source-reviewed proposed tests, not claimed execution results. If an existing timer quirk produces an unexpected baseline result, inspect and document it; preserve the observed contract and adjust an incorrect assertion with reviewer agreement.

- [ ] **Step 3: Extract the timer without changing its effect cadence or screen lifetime.** Create `src/hooks/useCookingTimer.js` with this complete code:

```js
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

export default function useCookingTimer() {
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStepIndex, setTimerStepIndex] = useState(null);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    if (timerRunning && timerSeconds > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            setTimerRunning(false);
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
            toast.success('Timer complete! This step is done.', {
              duration: 6000,
              style: { fontSize: '16px', fontWeight: 'bold' },
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

  const startTimer = (minutes, stepIndex) => {
    if (minutes <= 0) return;
    if (timerRunning) {
      const confirmed = window.confirm('A timer is already running. Replace it?');
      if (!confirmed) return;
    }
    setTimerSeconds(minutes * 60);
    setTimerStepIndex(stepIndex);
    setTimerRunning(true);
    toast(`Timer started: ${minutes} minute${minutes !== 1 ? 's' : ''}`, { duration: 2000 });
  };

  const pauseResumeTimer = () => {
    setTimerRunning(prev => !prev);
  };

  const cancelTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(0);
    setTimerStepIndex(null);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  // Back currently resets state and lets effect cleanup clear the interval.
  // Keep this separate from the explicit timer Cancel action above.
  const resetTimerState = () => {
    setTimerRunning(false);
    setTimerSeconds(0);
    setTimerStepIndex(null);
  };

  const restorePausedTimer = (seconds, stepIndex) => {
    setTimerSeconds(seconds);
    setTimerStepIndex(stepIndex);
    setTimerRunning(false);
  };

  return {
    timerSeconds, timerRunning, timerStepIndex,
    startTimer, pauseResumeTimer, cancelTimer, resetTimerState, restorePausedTimer,
  };
}
```

In `RecipeInstructions.js`, import `useCookingTimer` from `../hooks/useCookingTimer`. Remove only the four declarations under `// Feature 6: Timer`; replace the countdown effect block from `// Feature 6: Timer countdown` through its `}, [timerRunning]);` with the following unconditional hook call. Keeping the hook at this effect location preserves its ordering after kitchen-mode persistence and before session persistence. Do not call it inside a branch or a new view.

```js
const {
  timerSeconds, timerRunning, timerStepIndex,
  startTimer, pauseResumeTimer: handlePauseResumeTimer,
  cancelTimer: handleCancelTimer, resetTimerState, restorePausedTimer,
} = useCookingTimer();
```

Replace the complete `handleStartTimer` declaration and remove the old `handlePauseResumeTimer` / `handleCancelTimer` declarations, stopping before `// Feature 3: Swipe handlers`:

```js
const handleStartTimer = () => {
  startTimer(parseTimeMinutes(currentInstruction), currentStep);
};
```

Inside `handleBackToSelection`, replace only the three timer setter calls with `resetTimerState()` inside its existing `if (timerRunning)` condition. Do not move the condition into the hook or call cancel unconditionally. Inside `handleResumeSession`, replace only the three timer setter calls with `restorePausedTimer(savedSessionData.timerSeconds, savedSessionData.timerStepIndex)` inside the existing positive-seconds condition. Keep both persistence effects, their dependencies, saved fields, 24-hour validation, navigation/confirmation, auto-advance, wake-lock effects, and recipe fetching byte-for-byte unchanged.

- [ ] **Step 4: Extract the two render bodies with explicit props.** Move rather than rewrite these JSX ranges. Do not add wrappers, keys, memoization, default props, effects, state, or motion boundaries.

| New module | Exact source range to move | Imports and signature |
| --- | --- | --- |
| `src/components/cook/RecipeSelectionView.js` | The `return (...)` body inside `if (showRecipeSelection)` after `// --- Render: Recipe Selection Screen ---`, stopping at that branch's closing `}` before `// --- Render: Step-by-Step Instruction View (Kitchen-Friendly) ---`. Retain the root div and every descendant exactly. | `React`; Lucide `ArrowLeft, Clock, Wifi, ChevronDown, ChevronUp, ChefHat, Utensils, Play`; default function `RecipeSelectionView` with the props below. |
| `src/components/cook/CookingView.js` | The final `return (...)` after `// --- Render: Step-by-Step Instruction View (Kitchen-Friendly) ---`, ending at its `);` before the component's closing `};`. Also move the complete `formatTimer` declaration from the utility section into this module at module scope. One inline handler becomes a parent callback as specified below. | `React`; Lucide `ChevronLeft, ChevronRight, ArrowLeft, Clock, CheckCircle, Wifi, ChevronDown, ChevronUp, ChefHat, Play, Smartphone, Sun, Moon, Timer, Pause, X, List`; default function `CookingView` with the props below. |

Use these exact function parameter destructurings; the moved return bodies use the same symbol names:

```js
export default function RecipeSelectionView({
  availableRecipes, debugMode, showDebug, setShowDebug, debugInfo,
  showResumePrompt, savedSessionData, handleResumeSession, handleDismissResume,
  handleBackToApp, onNavigate, handleRecipeSelect,
})
```

```js
export default function CookingView({
  kitchenMode, handleBackToSelection, activeRecipeData, currentStep, totalSteps,
  usingSampleData, wakeLockActive, showStepMenu, setShowStepMenu,
  handleToggleKitchenMode, debugMode, showDebug, setShowDebug, debugInfo,
  completedSteps, handleJumpToStep, handleToggleStepDrawer, showStepDrawer,
  setShowStepDrawer, showAllIngredients, setShowAllIngredients, showSwipeHint,
  handleTouchStart, handleTouchEnd, handleStepComplete, currentInstruction,
  parseTimeMinutes, handleStartTimer, handleNext, isLastStep, handlePrevious,
  isFirstStep, handleRecipeCompleteBack, timerRunning, timerSeconds,
  timerStepIndex, setCurrentStep, handlePauseResumeTimer, handleCancelTimer,
})
```

Each signature is followed by `{`, its moved `return (...)`, and `}`. Keep `parseTimeMinutes` in the parent unchanged and pass it to the cooking renderer so the timer button and start action still share exactly the same parser. Before the loading branches, add this complete parent callback by moving the current `Recipe Complete` button's inline body:

```js
const handleRecipeCompleteBack = () => {
  try { localStorage.removeItem('recipeInstructionState'); } catch {}
  handleBackToApp();
};
```

In the moved cooking JSX, change only that button's `onClick` expression to `onClick={handleRecipeCompleteBack}`. This keeps storage/navigation policy in the parent. Keep the timer-pill step callback as the existing direct `setCurrentStep(timerStepIndex)`; do not redirect it through Previous/Next or auto-advance cancellation.

Import the two views from `./cook/RecipeSelectionView` and `./cook/CookingView`. Replace their old branches with this complete glue; every prop maps the old symbol to itself:

```jsx
if (showRecipeSelection) {
  return <RecipeSelectionView
    availableRecipes={availableRecipes} debugMode={debugMode}
    showDebug={showDebug} setShowDebug={setShowDebug} debugInfo={debugInfo}
    showResumePrompt={showResumePrompt} savedSessionData={savedSessionData}
    handleResumeSession={handleResumeSession} handleDismissResume={handleDismissResume}
    handleBackToApp={handleBackToApp} onNavigate={onNavigate}
    handleRecipeSelect={handleRecipeSelect}
  />;
}
return <CookingView
  kitchenMode={kitchenMode} handleBackToSelection={handleBackToSelection}
  activeRecipeData={activeRecipeData} currentStep={currentStep} totalSteps={totalSteps}
  usingSampleData={usingSampleData} wakeLockActive={wakeLockActive}
  showStepMenu={showStepMenu} setShowStepMenu={setShowStepMenu}
  handleToggleKitchenMode={handleToggleKitchenMode} debugMode={debugMode}
  showDebug={showDebug} setShowDebug={setShowDebug} debugInfo={debugInfo}
  completedSteps={completedSteps} handleJumpToStep={handleJumpToStep}
  handleToggleStepDrawer={handleToggleStepDrawer} showStepDrawer={showStepDrawer}
  setShowStepDrawer={setShowStepDrawer} showAllIngredients={showAllIngredients}
  setShowAllIngredients={setShowAllIngredients} showSwipeHint={showSwipeHint}
  handleTouchStart={handleTouchStart} handleTouchEnd={handleTouchEnd}
  handleStepComplete={handleStepComplete} currentInstruction={currentInstruction}
  parseTimeMinutes={parseTimeMinutes} handleStartTimer={handleStartTimer}
  handleNext={handleNext} isLastStep={isLastStep} handlePrevious={handlePrevious}
  isFirstStep={isFirstStep} handleRecipeCompleteBack={handleRecipeCompleteBack}
  timerRunning={timerRunning} timerSeconds={timerSeconds} timerStepIndex={timerStepIndex}
  setCurrentStep={setCurrentStep} handlePauseResumeTimer={handlePauseResumeTimer}
  handleCancelTimer={handleCancelTimer}
/>;
```

The parent retains its three loading/error branches unchanged. Its Lucide import becomes `AlertCircle` only. Keep React's existing state/effect/ref/callback imports: the parent still uses each. No compatibility export currently exists for these new files.

- [ ] **Step 5: Rerun the identical characterization and accessibility tests; inspect the move diff.** Use Step 2's command unchanged. Inspect each new JSX body against the removed body; only indentation, imports, explicit prop plumbing, and the stated completion-button callback relocation may differ. Record paused timer survival and jump/swipe auto-advance as preserved observations, not repaired defects.

- [ ] **Step 6: Run the task's required checks and source review, then stage exact paths.**

```powershell
$env:CI = 'true'
npm.cmd run lint
npm.cmd test -- --watchAll=false --runInBand
npx.cmd playwright test e2e/cook.spec.js e2e/a11y.spec.js --project=mobile --project=desktop
git diff --check
git diff -- src/components/RecipeInstructions.js src/components/RecipeInstructions.behavior.test.js src/components/cook/RecipeSelectionView.js src/components/cook/CookingView.js src/hooks/useCookingTimer.js
```

Playwright runs in the foreground. Expected: lint has zero warnings/errors, full Jest passes, selected hermetic browser files pass, whitespace check is clean. Commit after these gates, then give the Astra reviewer the task brief, baseline/final test evidence, report and base-to-head review package. Resolve findings through reviewed fix commits; after review edits, rerun affected tests plus full lint/Jest. Stage and commit:

```powershell
git add -- src/components/RecipeInstructions.js src/components/RecipeInstructions.behavior.test.js src/components/cook/RecipeSelectionView.js src/components/cook/CookingView.js src/hooks/useCookingTimer.js
git diff --cached --check
git diff --cached --stat
git commit -m "refactor: separate cooking views and timer lifecycle" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: Share send/retry mechanics and integrate the Planner adapter

**Files:**

- Create `src/hooks/useChatTransport.js`.
- Create `src/components/chat/plannerChatAdapter.js`.
- Create `src/test-utils/chatTransportContract.js` (reused baseline component-test scenarios for both screens).
- Create `src/components/ChatBot.transport.test.js`.
- Modify `src/components/ChatBot.js`.
- Reuse `src/components/ChatBot.test.js` unchanged.

- [ ] **Step 1: Add the contract helper and Planner tests below against the original ChatBot.** The helper mocks `global.fetch` through the existing `installMockFetch` helper; it never mocks `apiFetch` or `apiJson`. Its delayed request wraps fetch itself because mockFetch's map functions are synchronous and do not await promises. The shared test scenarios exercise existing screen behavior, not hook internals. No phase/history functionality is moved as a consequence of this helper.

```jsx
// src/test-utils/chatTransportContract.js
import React from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './render';
import { installMockFetch, restoreFetch } from './mockFetch';
import { getWeekDates } from '../utils/weekDates';

export const chatProps = () => ({
  onBack: jest.fn(), onNavigate: jest.fn(), selectedMeals: [],
  setSelectedMeals: jest.fn(), refreshMeals: jest.fn(),
  groceryListData: null, setGroceryListData: jest.fn(),
});

export async function openChat(Component, endpoint, reply, props = chatProps(), history = []) {
  const mock = installMockFetch({ '/chat_history': history, [endpoint]: reply });
  const view = renderWithProviders(<Component {...props} />);
  await waitFor(() => expect(mock.for('/chat_history')).toHaveLength(1));
  // Flush fetch/text/history restoration before sending; a late history result
  // is allowed to replace messages by the production screen's current policy.
  await act(async () => {});
  return { mock, ...view };
}

export function sendChat(inputLabel, value) {
  fireEvent.change(screen.getByLabelText(inputLabel), { target: { value } });
  fireEvent.click(screen.getByLabelText('Send message'));
}

export function chatTransportContract({ Component, endpoint, inputLabel, context, sessionPrefix, retryName, okReply, okText, errorText, timeoutText, planner }) {
  beforeAll(() => { window.HTMLElement.prototype.scrollIntoView = jest.fn(); });
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    jest.restoreAllMocks();
    restoreFetch();
    localStorage.clear();
  });

  test('click events use trimmed input, Enter sends, Shift+Enter does not, and the legacy weekly session wins', async () => {
    const week = getWeekDates();
    localStorage.setItem(`${sessionPrefix}SessionId_${week.startDate}`, 'legacy-session');
    const { mock } = await openChat(Component, endpoint, okReply);
    sendChat(inputLabel, '  dinner idea  ');
    await screen.findByText(okText);
    const first = mock.for(endpoint)[0];
    expect(first.method).toBe('POST');
    expect(first.body).toEqual({
      message: 'dinner idea', sessionId: 'legacy-session', context,
      weekDateRange: week.displayRange, timestamp: expect.any(String),
      ...(planner ? { weekStartDate: week.startDate, weekEndDate: week.endDate } : {}),
    });
    expect(Number.isNaN(Date.parse(first.body.timestamp))).toBe(false);
    expect(screen.getByLabelText(inputLabel)).toHaveValue('');
    expect(screen.getByText('dinner idea')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(inputLabel), { target: { value: 'Enter idea' } });
    fireEvent.keyPress(screen.getByLabelText(inputLabel), { key: 'Enter', charCode: 13, shiftKey: true });
    expect(mock.for(endpoint)).toHaveLength(1);
    fireEvent.keyPress(screen.getByLabelText(inputLabel), { key: 'Enter', charCode: 13, shiftKey: false });
    await waitFor(() => expect(mock.for(endpoint)).toHaveLength(2));
    await act(async () => {});
    expect(mock.for(endpoint)[1].body.message).toBe('Enter idea');
    expect(mock.unmocked()).toEqual([]);
  });

  test('retry uses remembered text after clear, makes another bubble/new timestamp, and never automatically retries', async () => {
    let count = 0;
    const weekAtMount = getWeekDates();
    const { mock, container } = await openChat(Component, endpoint, () => {
      count += 1;
      return count === 1 ? { status: 503, body: 'unavailable' } : okReply;
    });
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-10T15:00:00Z'));
    sendChat(inputLabel, 'repeat this');
    await act(async () => {});
    expect(screen.getByText(errorText)).toBeInTheDocument();
    expect(container.querySelector('.animate-bounce')).toBeNull();
    expect(mock.for(endpoint)).toHaveLength(1);
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(mock.for(endpoint)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: retryName, exact: true }));
    await act(async () => {});
    expect(screen.getByText(okText)).toBeInTheDocument();
    expect(screen.getAllByText('repeat this')).toHaveLength(2);
    expect(mock.for(endpoint)).toHaveLength(2);
    expect(mock.for(endpoint)[1].body.message).toBe('repeat this');
    expect(mock.for(endpoint)[1].body.timestamp).not.toBe(mock.for(endpoint)[0].body.timestamp);
    expect(mock.for(endpoint)[1].body.sessionId).toBe(`${sessionPrefix}_${weekAtMount.startDate}`);
    expect(container.querySelector('.animate-bounce')).toBeNull();
    expect(mock.unmocked()).toEqual([]);
  });

  test('typing survives a pending response and timeout is exactly 120 seconds with no automatic retry', async () => {
    const { mock, container } = await openChat(Component, endpoint, okReply);
    const delegate = global.fetch;
    const observedSignals = [];
    global.fetch = jest.fn((url, init) => {
      const result = delegate(url, init); // records the endpoint call synchronously
      if (!String(url).includes(endpoint)) return result;
      observedSignals.push(init.signal);
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
      });
    });
    jest.useFakeTimers();
    sendChat(inputLabel, 'slow idea');
    expect(container.querySelector('.animate-bounce')).not.toBeNull();
    expect(screen.getByLabelText('Send message')).toBeDisabled();
    await act(async () => { jest.advanceTimersByTime(119999); });
    expect(observedSignals[0].aborted).toBe(false);
    expect(container.querySelector('.animate-bounce')).not.toBeNull();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(observedSignals[0].aborted).toBe(true);
    expect(screen.getByText(timeoutText)).toBeInTheDocument();
    expect(container.querySelector('.animate-bounce')).toBeNull();
    expect(screen.getByRole('button', { name: retryName, exact: true })).toBeInTheDocument();
    expect(mock.for(endpoint)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(inputLabel), { target: { value: 'another idea' } });
    expect(screen.getByLabelText('Send message')).toBeEnabled();
  });

  test.each(['', 'not json'])('invalid response %p clears typing and offers manual retry', async body => {
    const { mock, container } = await openChat(Component, endpoint, { status: 200, body });
    sendChat(inputLabel, 'bad response');
    await screen.findByText(errorText);
    expect(screen.getByRole('button', { name: retryName, exact: true })).toBeInTheDocument();
    expect(container.querySelector('.animate-bounce')).toBeNull();
    expect(mock.for(endpoint)).toHaveLength(1);
  });
}
```

The helper deliberately does not inspect hook state or mock time-dependent IDs. Existing IDs/time-stamps are verified by the mechanical adapter move and payload assertions. Avoid adding exported internals solely for testing.

```jsx
// src/components/ChatBot.transport.test.js
import { fireEvent, screen, waitFor } from '@testing-library/react';
import ChatBot from './ChatBot';
import { chatProps, chatTransportContract, openChat, sendChat } from '../test-utils/chatTransportContract';

const endpoint = '/call_grocery_agent';
const inputLabel = 'Type your message';
const errorText = "I'm having trouble connecting right now. Please try again in a moment.";
chatTransportContract({
  Component: ChatBot, endpoint, inputLabel, context: 'meal_planning', sessionPrefix: 'chat',
  retryName: 'Retry last message', okReply: [{ output: 'Planner reply' }], okText: 'Planner reply',
  errorText, timeoutText: errorText, planner: true,
});

test('Planner 500 remains non-retryable', async () => {
  const { mock, container } = await openChat(ChatBot, endpoint, { status: 500, body: 'workflow failed' });
  sendChat(inputLabel, 'idea');
  expect(await screen.findByText(/Sorry — I hit a snag answering that/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry last message' })).not.toBeInTheDocument();
  expect(container.querySelector('.animate-bounce')).toBeNull();
  expect(mock.for(endpoint)).toHaveLength(1);
});

const recipes = { responseType: 'recipe_list', message: 'Pick a meal', recipes: [{ id: 23, name: 'Lemon rice', description: 'Bright rice' }] };
test.each([
  ['structured', [{ output: recipes }], 'Pick a meal', 'Lemon rice'],
  ['body wrapper', [{ response: { body: [{ output: recipes }] } }], 'Pick a meal', 'Lemon rice'],
  ['numbered legacy', [{ output: '1. **Lemon rice** (ID: 23) - Bright rice' }], '1. **Lemon rice** (ID: 23) - Bright rice', 'Lemon rice'],
  ['bullet legacy', [{ output: '- **Lemon rice** (ID: 23)' }], '- **Lemon rice** (ID: 23)', 'Lemon rice'],
  ['text fallback', [{ text: 'Text-only reply' }], 'Text-only reply', null],
  ['string entry', ['String-entry reply'], 'String-entry reply', null],
  ['literal JSON output', [{ output: JSON.stringify(recipes) }], JSON.stringify(recipes), null],
  ['direct object', { output: recipes }, "I received your message but couldn't process it properly. Please try again!", null],
])('Planner retains %s live parsing', async (_name, reply, text, card) => {
  await openChat(ChatBot, endpoint, reply);
  sendChat(inputLabel, 'suggest dinner');
  await screen.findByText(text);
  if (card) expect(screen.getByRole('heading', { name: card })).toBeInTheDocument();
  else expect(screen.queryByRole('heading', { name: 'Lemon rice' })).not.toBeInTheDocument();
});

test('structured ingredient parsing retains the current parent-state update and recipe-ID mutation', async () => {
  const meal = { id: 'selected-1', name: 'Lemon rice' };
  const props = { ...chatProps(), selectedMeals: [meal] };
  await openChat(ChatBot, endpoint, [{ output: {
    responseType: 'ingredients_detail', recipeName: 'Lemon rice', recipeId: 23,
    ingredients: [{ category: 'Produce', items: [{ name: 'Lemon', quantity: 2, unit: 'each', amount: { metric: { value: 100, unit: 'g' } } }] }],
  } }], props);
  sendChat(inputLabel, 'ingredients');
  await screen.findByText('Ingredients for Lemon rice have been added to your meal plan.');
  expect(meal.recipeId).toBe(23);
  const update = props.setSelectedMeals.mock.calls[0][0];
  expect(update([meal])).toEqual([{ ...meal, ingredients: [{
    id: 1, name: 'Lemon', quantity: '2 each', metricValue: 100, metricUnit: 'g',
    category: 'Produce', needed: true, recipeId: 23,
  }] }]);
});

test('legacy ingredient response still updates the matching selected meal', async () => {
  const meal = { id: 'selected-1', name: 'Lemon rice', recipeId: 23 };
  const props = { ...chatProps(), selectedMeals: [meal] };
  await openChat(ChatBot, endpoint, [{ output: 'ingredients needed for Lemon rice\nProduce:\n- 2 cups rice' }], props);
  sendChat(inputLabel, 'ingredients');
  await waitFor(() => expect(props.setSelectedMeals).toHaveBeenCalled());
  const update = props.setSelectedMeals.mock.calls[0][0];
  expect(update([meal])[0].ingredients).toEqual([{ id: 1, name: 'rice', quantity: '2 cups', metricValue: null, metricUnit: null, category: 'Produce', needed: true }]);
});

test('old Retry controls use the latest remembered payload and can overlap', async () => {
  const { mock } = await openChat(ChatBot, endpoint, { status: 503, body: 'failed' });
  sendChat(inputLabel, 'first');
  await screen.findByText(errorText);
  sendChat(inputLabel, 'second');
  await waitFor(() => expect(screen.getAllByText(errorText)).toHaveLength(2));
  const retry = screen.getAllByRole('button', { name: 'Retry last message' })[0];
  fireEvent.click(retry);
  fireEvent.click(retry);
  await waitFor(() => expect(mock.for(endpoint)).toHaveLength(4));
  expect(mock.for(endpoint).map(call => call.body.message)).toEqual(['first', 'second', 'second', 'second']);
  await waitFor(() => expect(screen.getAllByText(errorText)).toHaveLength(4));
});

test('screen-owned history still prefers raw_content and restores cards', async () => {
  await openChat(ChatBot, endpoint, [], chatProps(), [{
    id: 9, message: { type: 'ai', content: 'ignored history text' },
    raw_content: JSON.stringify({ output: recipes }),
  }]);
  expect(await screen.findByRole('heading', { name: 'Lemon rice' })).toBeInTheDocument();
  expect(screen.queryByText('ignored history text')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the baseline contract tests before editing production source.**

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --runTestsByPath src/components/ChatBot.test.js src/components/ChatBot.transport.test.js
```

Expected: PASS on the original Planner implementation. Inspect failures rather than altering production to fit the proposed examples. Preserve current text/card rendering and the history-specific parser; correct an assertion if the untouched baseline disproves it.

- [ ] **Step 3: Create the shared hook with no effects, send lock, normalized response model, automatic retry, or added cancellation.**

```js
// src/hooks/useChatTransport.js
import { useRef } from 'react';
import { apiFetch } from '../config/api';

export default function useChatTransport({ inputMessage, setInputMessage, setMessages, setIsLoading, adapter }) {
  const lastPayloadRef = useRef(null);

  const removeTypingIndicator = typingId => {
    setMessages(prev => prev.filter(msg => msg.id !== typingId));
  };

  const sendMessage = async overrideText => {
    const rawText = typeof overrideText === 'string' ? overrideText : inputMessage;
    if (!rawText.trim()) return;
    const messageToSend = rawText.trim();
    const userMessage = {
      id: Date.now(), type: 'user', content: messageToSend,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    const typingMessage = adapter.createTypingMessage();
    const typingId = typingMessage.id;
    setMessages(prev => [...prev, typingMessage]);
    adapter.onSend(messageToSend);

    try {
      const payload = adapter.buildPayload(messageToSend);
      lastPayloadRef.current = payload;
      adapter.beforeRequest();
      const response = await apiFetch(adapter.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload), mode: 'cors', timeout: 120000, retries: 0,
      });
      await adapter.handleResponse(response, { typingId, removeTypingIndicator });
    } catch (error) {
      adapter.handleError(error, { typingId, removeTypingIndicator });
    } finally {
      setIsLoading(false);
    }
  };

  const retryLastMessage = () => {
    if (!lastPayloadRef.current) return;
    sendMessage(adapter.retryText(lastPayloadRef.current));
  };

  return { sendMessage, retryLastMessage };
}
```

`adapter` is an explicit screen-created object with methods `createTypingMessage`, `onSend`, `buildPayload`, `beforeRequest`, `handleResponse`, `handleError`, `retryText`, and endpoint string. The hook owns user append/input clear/loading/typing creation, remembered payload, fetch options, manual retry, and typing removal implementation. Adapters invoke the supplied typing-removal action at their existing outcome points; this preserves Planner's special 500 early cleanup and its existing extra `setIsLoading(false)`. The adapter closure is created each screen render, so each invocation captures the same render's selected-meal/session/logging values as the original send function. Do not introduce `useMemo`, `useCallback`, latest-value refs, or a shared provider.

- [ ] **Step 4: Create the named Planner adapter by exact source moves and the complete glue in Appendix P below.** The appendix is complete resulting adapter code, including verbatim moved response/error bodies; copying its original parser rather than rewriting it preserves IDs, logs, wrappers, regexes, fallback copy, and current selected-meal mutation. Domain state remains screen-owned: `selectedMeals` and `setSelectedMeals` are explicit adapter inputs, while `addMealToList`, `removeMeal`, `handleGenerateGroceryList`, the weekly session function, history parser/effect, and all UI/animation code remain in `ChatBot.js`.

Move audit boundaries in the original `sendMessage`:

- `createTypingMessage`: move the `typingMessage` literal inside `showTypingIndicator`; return it without appending. The shared hook performs the append.
- `onSend`: the original log immediately before `try`.
- `buildPayload`: from `addDebugLog('Webhook URL:', CHATBOT_WEBHOOK_URL)` through `addDebugLog('POST payload:', payload)` inclusive, then `return payload`. The payload-ref assignment moves to the shared hook.
- `beforeRequest`: the original `Making API call...` log after the ref assignment.
- `handleResponse`: from `addDebugLog('Response received:', {` through `addDebugLog('✅ Message exchange completed');` inclusive, ending before `} catch (error)`. Move unchanged, including the special 500 `setIsLoading(false); return;`, full parsing switch, and selected-meal updates.
- `handleError`: the original catch body from `addDebugLog('❌ Error in sendMessage:', error.message)` through `setMessages(prev => [...prev, errorMessage]);` inclusive. The original finally becomes the hook's finally.

- [ ] **Step 5: Integrate Planner at the old send declaration.** Add imports for `useChatTransport` from `../hooks/useChatTransport` and `{ createPlannerChatAdapter }` from `./chat/plannerChatAdapter`. Remove only `CHATBOT_WEBHOOK_URL`, `lastPayloadRef`, the two typing helper declarations, and the old send/retry declarations. Keep `apiFetch`: history and grocery generation still use it. Replace the old send/retry region with:

```js
const { sendMessage, retryLastMessage } = useChatTransport({
  inputMessage, setInputMessage, setMessages, setIsLoading,
  adapter: createPlannerChatAdapter({
    sessionId, selectedMeals, setSelectedMeals, setMessages, setIsLoading, addDebugLog,
  }),
});
```

Keep `handleKeyPress`, all callers of `sendMessage`, every Retry button, history/session effects, messages/phase/selection state, and the remainder of the screen unchanged. The hook lives inside ChatBot, not the Meals parent.

- [ ] **Step 6: Run the same contract tests and required whole-source checks; review and commit.**

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --runTestsByPath src/components/ChatBot.test.js src/components/ChatBot.transport.test.js
npm.cmd run lint
npm.cmd test -- --watchAll=false --runInBand
git diff --check
```

Expected: all pass. An Astra task reviewer compares the original/moved response and error bodies and examines the shared lifecycle order, raw-fetch policy, no-lock behavior, and unchanged history. Commit after the gates below and include all created files in the base-to-head review package. After any review edits, rerun relevant tests and full lint/Jest before a fix commit:

```powershell
git add -- src/hooks/useChatTransport.js src/components/chat/plannerChatAdapter.js src/test-utils/chatTransportContract.js src/components/ChatBot.transport.test.js src/components/ChatBot.js
git diff --cached --check
git diff --cached --stat
git commit -m "refactor: extract planner chat transport with explicit adapter" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: Integrate Creator's distinct proposal adapter

**Files:**

- Create `src/components/chat/creatorChatAdapter.js`.
- Create `src/components/MealCreator.transport.test.js`.
- Modify `src/components/MealCreator.js`.
- Reuse the Task 8 hook and test helper unchanged unless baseline evidence exposes a missing contract; a shared-hook change requires rerunning both screens' characterization.

- [ ] **Step 1: Add Creator's baseline component tests before touching MealCreator.** The Task 8 helper is now available but the production Creator is still original. Build/save coverage below is a single hermetic boundary flow, protecting proposal cards' connection to the existing screen-owned phases; it authorizes no domain extraction or live writes.

```jsx
import { fireEvent, screen } from '@testing-library/react';
import MealCreator from './MealCreator';
import { installMockFetch } from '../test-utils/mockFetch';
import { chatProps, chatTransportContract, openChat, sendChat } from '../test-utils/chatTransportContract';

const endpoint = '/meal_creator_propose';
const inputLabel = "Describe what you're craving";
const errorText = 'Something went wrong generating proposals. Please try again!';
chatTransportContract({
  Component: MealCreator, endpoint, inputLabel, context: 'meal_creation', sessionPrefix: 'creator',
  retryName: 'Retry', okReply: { output: { message: 'Creator reply' } }, okText: 'Creator reply',
  errorText, timeoutText: 'That took too long — please try again with a simpler description.', planner: false,
});

test('Creator 500 remains retryable', async () => {
  const { mock, container } = await openChat(MealCreator, endpoint, { status: 500, body: 'workflow failed' });
  sendChat(inputLabel, 'idea');
  await screen.findByText(errorText);
  expect(screen.getByRole('button', { name: 'Retry', exact: true })).toBeInTheDocument();
  expect(container.querySelector('.animate-bounce')).toBeNull();
  expect(mock.for(endpoint)).toHaveLength(1);
});

const proposal = { name: 'Lemon rice', description: 'Bright rice', cuisineStyle: 'Mediterranean', protein: 'Beans', kidVehicle: 'Bowl', adultTwist: 'Chili', estimatedTotalTime: 20 };
const output = { responseType: 'recipe_proposals', message: 'Pick an idea', proposals: [proposal] };
test.each([
  ['direct object', output], ['array', [output]], ['object output', { output }],
  ['JSON string output', { output: JSON.stringify(output) }],
])('Creator retains %s proposal parsing', async (_name, reply) => {
  await openChat(MealCreator, endpoint, reply);
  sendChat(inputLabel, 'invent dinner');
  await screen.findByText('Pick an idea');
  expect(screen.getByRole('heading', { name: 'Lemon rice' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Build This Recipe' })).toBeInTheDocument();
});

test.each([
  ['plain output string', { output: 'plain output' }],
  ['planner body wrapper', { response: { body: [{ output }] } }],
])('Creator keeps %s as its existing JSON fallback', async (_name, reply) => {
  await openChat(MealCreator, endpoint, reply);
  sendChat(inputLabel, 'invent dinner');
  await screen.findByText(JSON.stringify(reply));
  expect(screen.queryByRole('button', { name: 'Build This Recipe' })).not.toBeInTheDocument();
});

test('Creator history keeps message content and ignores planner raw_content', async () => {
  await openChat(MealCreator, endpoint, [], chatProps(), [{
    id: 1, message: { type: 'ai', content: JSON.stringify(output) }, raw_content: 'ignored creator history',
  }]);
  expect(await screen.findByRole('heading', { name: 'Lemon rice' })).toBeInTheDocument();
  expect(screen.queryByText('ignored creator history')).not.toBeInTheDocument();
});

test('proposal cards still feed screen-owned build, preview and save phases', async () => {
  await openChat(MealCreator, endpoint, output);
  const recipe = { recipe_name: 'Lemon rice', recipe_description: 'Built rice', ingredients: [], instructions: [], tags: [] };
  const mock = installMockFetch({
    [endpoint]: output,
    '/meal_creator_build': { output: { responseType: 'full_recipe', recipe } },
    '/meal_creator_save': { success: true, recipeName: 'Lemon rice', recipeId: 23, ingredientsProcessed: 0, instructionsProcessed: 0, tagsProcessed: 0 },
  });
  sendChat(inputLabel, 'invent dinner');
  fireEvent.click(await screen.findByRole('button', { name: 'Build This Recipe' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save to Recipe Book' }));
  expect(await screen.findByRole('heading', { name: 'Recipe Saved!' })).toBeInTheDocument();
  expect(mock.calls().map(call => new URL(call.url).pathname.split('/').pop())).toEqual(['meal_creator_propose', 'meal_creator_build', 'meal_creator_save']);
  expect(mock.for('/meal_creator_build')[0].body).toEqual(expect.objectContaining({ proposalName: proposal.name, proposalDescription: proposal.description }));
  expect(mock.for('/meal_creator_save')[0].body).toEqual({ recipe });
  expect(mock.unmocked()).toEqual([]);
});

test('failed build returns to the existing proposal conversation', async () => {
  await openChat(MealCreator, endpoint, output);
  const mock = installMockFetch({ [endpoint]: output, '/meal_creator_build': { status: 500, body: 'failed' } });
  sendChat(inputLabel, 'invent dinner');
  fireEvent.click(await screen.findByRole('button', { name: 'Build This Recipe' }));
  expect(await screen.findByLabelText(inputLabel)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Build This Recipe' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Save to Recipe Book' })).not.toBeInTheDocument();
  expect(mock.for('/meal_creator_build')).toHaveLength(1);
});
```

- [ ] **Step 2: Verify Creator's characterization on the original Creator source.**

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --runTestsByPath src/components/MealCreator.transport.test.js
```

Expected: PASS before extraction. Inspect any failing baseline assertion; do not change Creator history, copy, parser, or build/save behavior to make a proposed test pass.

- [ ] **Step 3: Create `creatorChatAdapter.js` using the complete Appendix C code and these exact move boundaries.**

- The original creator user-message append is shared; its typing object retains random ID and empty timestamp through `createTypingMessage`.
- `onSend`: original `Sending proposal request...` log before try.
- `buildPayload`: the original `const weekData = getWeekDates();` through the payload literal's closing `};`, ending before `lastProposeRef.current = payload;`; return the payload. Do not add Planner start/end fields or reorder payload fields.
- `handleResponse`: from `if (!response.ok) throw new Error(...)` through the success/fallback message append `if/else`, ending immediately before `} catch (error)`. Move unchanged apart from replacing the inline typing filter at its current point with `removeTypingIndicator(typingId)`.
- `handleError`: the catch body through its final `setMessages` append; replace only its inline typing filter with the same shared removal action. Preserve Date.now-only success/error IDs, every timestamp, AbortError wording, proposal state setter and debug log.
- `retryText`: `payload.message || payload.description || ''`, distinct from Planner's `payload.message`.

- [ ] **Step 4: Integrate only the proposal send/retry seam.** Import the shared hook and `{ createCreatorChatAdapter }`. Remove `PROPOSE_WEBHOOK_URL`, `lastProposeRef`, the old PHASE 1 send declaration, and the `retryLastPropose` declaration. Keep `apiFetch` for build/history and `apiJson` for save/domain writes. Replace the PHASE 1 send declaration with:

```js
const { sendMessage, retryLastMessage: retryLastPropose } = useChatTransport({
  inputMessage, setInputMessage, setMessages, setIsLoading,
  adapter: createCreatorChatAdapter({ sessionId, setMessages, setProposals, addDebugLog }),
});
```

Retain Creator's history parser/effect, session getter, messages, phase and domain state, `buildRecipe`, `saveRecipe`, `addToThisWeek`, removal, Start Over, keyboard handler, all JSX, and desktop AnimatePresence placement unchanged. No shared phase framework or history hook is introduced.

- [ ] **Step 5: Rerun both contracts, complete required lint/Jest, review and commit exact paths.**

```powershell
$env:CI = 'true'
npm.cmd test -- --watchAll=false --runInBand --runTestsByPath src/components/ChatBot.test.js src/components/ChatBot.transport.test.js src/components/MealCreator.transport.test.js
npm.cmd run lint
npm.cmd test -- --watchAll=false --runInBand
git diff --check
```

Expected: all pass. After committing, send the Astra reviewer baseline/final evidence, the base-to-head review package including new files, and the report. Review must compare Planner versus Creator 500 behavior, payload keys, wrapper/string parsing, typing timestamps, ID formulas, latest-payload manual retry, and unchanged history/phase ownership. Rerun affected tests and full lint/Jest after review fixes. Commit the initial task with:

```powershell
git add -- src/components/chat/creatorChatAdapter.js src/components/MealCreator.transport.test.js src/components/MealCreator.js
git diff --cached --check
git diff --cached --stat
git commit -m "refactor: use shared send lifecycle for recipe creator" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Whole-branch foreground hermetic Playwright and the single release-gate live suite remain in the parent plan's final verification task. These tasks make no live AI calls, real cart builds, backend changes, push, or deployment.


#### Appendix P: Complete Planner adapter for Task 8

```js
import { ENDPOINTS } from '../../config/api';
import { getWeekDates } from '../../utils/weekDates';

const CHATBOT_WEBHOOK_URL = ENDPOINTS.callGroceryAgent;

export function createPlannerChatAdapter({ sessionId, selectedMeals, setSelectedMeals, setMessages, setIsLoading, addDebugLog }) {
  return {
    endpoint: CHATBOT_WEBHOOK_URL,
    createTypingMessage() {
      return {
        id: Date.now() + Math.random(), // Ensure unique ID
        type: 'bot',
        content: '...',
        isTyping: true,
        timestamp: new Date().toLocaleTimeString()
      };
    },
    onSend(messageToSend) {
      addDebugLog('Sending message to n8n chatbot webhook...', messageToSend);
    },
    buildPayload(messageToSend) {
      addDebugLog('Webhook URL:', CHATBOT_WEBHOOK_URL);

      // Use POST method with JSON body
      const weekData = getWeekDates();

      const payload = {
        message: messageToSend,
        context: 'meal_planning',
        timestamp: new Date().toISOString(),
        sessionId: sessionId,
        weekStartDate: weekData.startDate,
        weekEndDate: weekData.endDate,
        weekDateRange: weekData.displayRange
      };

      addDebugLog('POST payload:', payload);
      return payload;
    },
    beforeRequest() {
      addDebugLog('Making API call to chatbot webhook with POST method...');
    },
    async handleResponse(response, { typingId, removeTypingIndicator }) {
      addDebugLog('Response received:', {
        status: response.status,
        statusText: response.statusText,
        type: response.type,
      });

      if (!response.ok) {
        // Log the error response for debugging
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = 'Could not read error response';
        }

        addDebugLog('❌ Server error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          url: CHATBOT_WEBHOOK_URL
        });

        // For 500 errors, provide a helpful fallback message. Note: the
        // exchange may still have been saved server-side (chat memory writes
        // during the workflow run), so a refresh often shows the real reply.
        if (response.status === 500) {
          removeTypingIndicator(typingId);
          const fallbackMessage = {
            id: Date.now() + Math.random(), // Ensure unique ID
            type: 'bot',
            content: "Sorry — I hit a snag answering that. Try rephrasing, or refresh the page: your message may have gone through anyway.",
            timestamp: new Date().toLocaleTimeString()
          };
          setMessages(prev => [...prev, fallbackMessage]);
          setIsLoading(false);
          return;
        }

        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      addDebugLog('Raw response:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
        addDebugLog('Parsed JSON data:', data);
      } catch (parseError) {
        addDebugLog('❌ JSON parse error:', parseError.message);
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}...`);
      }

      // Handle the AI Agent response format
      let botResponse = "I received your message but couldn't process it properly. Please try again!";
      let suggestedMeals = [];

      if (Array.isArray(data) && data.length > 0) {
        let responseData = data[0];

        // Handle nested webhook response structure
        if (responseData.response && responseData.response.body && Array.isArray(responseData.response.body)) {
          responseData = responseData.response.body[0];
        }

        // Check if it's the new structured format
        if (responseData.output && typeof responseData.output === 'object' && responseData.output.responseType) {
          // Handle structured response
          botResponse = responseData.output.message || "";

          switch (responseData.output.responseType) {
            case "recipe_list":
              // Convert recipes to meal suggestions
              if (responseData.output.recipes && Array.isArray(responseData.output.recipes)) {
                suggestedMeals = responseData.output.recipes.map(recipe => ({
                  name: recipe.name,
                  description: recipe.description,
                  recipeId: recipe.id,
                  servings: recipe.servings || 4,
                  totalTime: recipe.totalTime || null
                }));
              }
              break;

            case "ingredients_detail":
              if (responseData.output.ingredients && responseData.output.recipeName) {
                const targetMeal = selectedMeals.find(meal =>
                  meal.name.toLowerCase().includes(responseData.output.recipeName.toLowerCase()) ||
                  responseData.output.recipeName.toLowerCase().includes(meal.name.toLowerCase())
                );

                if (targetMeal) {
                  // Update the meal with recipe ID if it wasn't already set
                  if (responseData.output.recipeId && !targetMeal.recipeId) {
                    targetMeal.recipeId = responseData.output.recipeId;
                  }

                  // Convert structured ingredients to flat list
                  const ingredients = [];
                  let ingredientId = 1;

                  responseData.output.ingredients.forEach(category => {
                    const categoryName = category.category || 'General';

                    if (category.items && Array.isArray(category.items)) {
                      category.items.forEach(item => {
                        const quantity = item.quantity && item.unit ? `${item.quantity} ${item.unit}` : (item.quantity || '');

                        ingredients.push({
                          id: ingredientId++,
                          name: item.name,
                          quantity: quantity,
                          metricValue: item.amount && item.amount.metric ? item.amount.metric.value : null,
                          metricUnit: item.amount && item.amount.metric ? item.amount.metric.unit : null,
                          category: categoryName,
                          needed: true,
                          recipeId: responseData.output.recipeId || targetMeal.recipeId // Include recipe ID with each ingredient
                        });
                      });
                    }
                  });

                  // Update the meal with ingredients
                  setSelectedMeals(prev => prev.map(m =>
                    m.id === targetMeal.id
                      ? { ...m, ingredients: ingredients, recipeId: responseData.output.recipeId || targetMeal.recipeId }
                      : m
                  ));

                  // Removed ingredient selection since we're not showing ingredients in side panel

                  addDebugLog('✅ Structured ingredients added to meal:', {
                    meal: targetMeal.name,
                    recipeId: responseData.output.recipeId || targetMeal.recipeId,
                    ingredientCount: ingredients.length
                  });

                  botResponse = `Ingredients for ${responseData.output.recipeName} have been added to your meal plan.`;
                } else {
                  botResponse = `Ingredients for ${responseData.output.recipeName}:\n${JSON.stringify(responseData.output.ingredients, null, 2)}`;
                }
              }
              break;
            default:
              // Handle any other response types or do nothing
              break;
          }
        }
        // Handle legacy string format
        else if (responseData.output && typeof responseData.output === 'string') {
          botResponse = responseData.output;
        } else if (responseData.text) {
          botResponse = responseData.text;
        } else if (typeof responseData === 'string') {
          botResponse = responseData;
        }

        // Parse recipe suggestions from the AI response (legacy format)
        const responseText = typeof botResponse === 'string' ? botResponse : JSON.stringify(botResponse);

        // Extract numbered recipe lists (e.g., "1. Recipe Name")
        const numberedRecipePattern = /(\d+)\.\s*\*\*([^*]+)\*\*(?:\s*\(ID:\s*(\d+)\))?[^\n]*/g;
        let match;

        while ((match = numberedRecipePattern.exec(responseText)) !== null) {
          const recipeName = match[2].trim();
          const recipeId = match[3] || null;

          // Extract description after the recipe name
          const fullMatch = match[0];
          const descriptionMatch = fullMatch.match(/\*\*[^*]+\*\*(?:\s*\([^)]+\))?\s*-\s*(.+)/);
          const description = descriptionMatch ? descriptionMatch[1].trim() : '';

          suggestedMeals.push({
            name: recipeName,
            description: description || `Recipe ID: ${recipeId || 'N/A'}`,
            recipeId: recipeId
          });
        }

        // Also check for bullet points without numbers
        if (suggestedMeals.length === 0) {
          const bulletRecipePattern = /[-•]\s*\*\*([^*]+)\*\*(?:\s*\((?:ID:|Recipe ID:)\s*(\d+)\))?[^\n]*/g;

          while ((match = bulletRecipePattern.exec(responseText)) !== null) {
            const recipeName = match[1].trim();
            const recipeId = match[2] || null;

            suggestedMeals.push({
              name: recipeName,
              description: `Recipe ID: ${recipeId || 'N/A'}`,
              recipeId: recipeId
            });
          }
        }

        // Check if this is an ingredients response
        if (typeof responseText === 'string' && (responseText.includes('ingredients needed for') ||
            responseText.includes('Crust & Cheese:') ||
            responseText.includes('Fruits & Vegetables:'))) {

          // Extract the recipe name from the response
          const recipeNameMatch = responseText.match(/ingredients needed for (?:the\s+)?([^(]+)/i);
          const recipeName = recipeNameMatch ? recipeNameMatch[1].trim() : 'Current Recipe';

          // Parse ingredients from the formatted response
          const ingredients = [];
          let ingredientId = 1;

          // Parse sectioned ingredients (e.g., "Crust & Cheese:", "Fruits & Vegetables:")
          const sections = responseText.split(/\n(?=[A-Z][^:]+:)/);

          sections.forEach(section => {
            const lines = section.split('\n');
            let currentCategory = 'General';

            lines.forEach(line => {
              // Check if this is a category header
              if (line.includes(':') && !line.startsWith('-')) {
                currentCategory = line.replace(':', '').trim();
              }
              // Check if this is an ingredient line
              else if (line.startsWith('-') || line.match(/^\s*\d+/)) {
                const ingredientMatch = line.match(/[-\d.]+\s*(.+)/);
                if (ingredientMatch) {
                  const fullIngredient = ingredientMatch[1].trim();

                  // Parse quantity and name
                  const quantityMatch = fullIngredient.match(/^([\d./]+\s*\w+)?\s*(.+)/);
                  const quantity = quantityMatch[1] || '';
                  const name = quantityMatch[2] || fullIngredient;

                  ingredients.push({
                    id: ingredientId++,
                    name: name,
                    quantity: quantity,
                    metricValue: null,
                    metricUnit: null,
                    category: currentCategory,
                    needed: true
                  });
                }
              }
            });
          });

          // If ingredients were found, update the most recent meal in the selected meals
          if (ingredients.length > 0 && selectedMeals.length > 0) {
            // Find the meal that matches this recipe name
            const mealToUpdate = selectedMeals.find(meal =>
              meal.name.toLowerCase().includes(recipeName.toLowerCase()) ||
              recipeName.toLowerCase().includes(meal.name.toLowerCase())
            );

            if (mealToUpdate) {
              setSelectedMeals(prev => prev.map(m =>
                m.id === mealToUpdate.id
                  ? { ...m, ingredients: ingredients }
                  : m
              ));

              // Removed ingredient selection since we're not showing ingredients in side panel

              addDebugLog('✅ Ingredients parsed and added to meal:', { meal: mealToUpdate.name, ingredients });
            }
          }
        }
      }

      addDebugLog('✅ Real AI agent response:', botResponse);

      removeTypingIndicator(typingId);

      const botMessage = {
        id: Date.now() + Math.random(), // Ensure unique ID
        type: 'bot',
        content: botResponse,
        suggestedMeals: suggestedMeals,
        timestamp: new Date().toLocaleTimeString()
      };

      setMessages(prev => [...prev, botMessage]);
      addDebugLog('✅ Message exchange completed');
    },
    handleError(error, { typingId, removeTypingIndicator }) {
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
    },
    retryText(payload) {
      return payload.message;
    },
  };
}
```

#### Appendix C: Complete Creator adapter for Task 9

```js
import { ENDPOINTS } from '../../config/api';
import { getWeekDates } from '../../utils/weekDates';

const PROPOSE_WEBHOOK_URL = ENDPOINTS.mealCreatorPropose;

export function createCreatorChatAdapter({ sessionId, setMessages, setProposals, addDebugLog }) {
  return {
    endpoint: PROPOSE_WEBHOOK_URL,
    createTypingMessage() {
      const typingId = Date.now() + Math.random();
      return { id: typingId, type: 'bot', content: '...', isTyping: true, timestamp: '' };
    },
    onSend(messageToSend) {
      addDebugLog('Sending proposal request...', messageToSend);
    },
    buildPayload(messageToSend) {
      const weekData = getWeekDates();
      const payload = {
        message: messageToSend,
        sessionId: sessionId,
        context: 'meal_creation',
        weekDateRange: weekData.displayRange,
        timestamp: new Date().toISOString()
      };
      return payload;
    },
    beforeRequest() {},
    async handleResponse(response, { typingId, removeTypingIndicator }) {
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      const responseText = await response.text();
      addDebugLog('Raw propose response:', responseText);

      let data = JSON.parse(responseText);

      // Handle array wrapper from n8n
      if (Array.isArray(data) && data.length > 0) data = data[0];

      // Unwrap n8n AI Agent output
      let output = data;
      if (data.output && typeof data.output === 'object') output = data.output;
      else if (data.output && typeof data.output === 'string') {
        try { output = JSON.parse(data.output); } catch { output = data; }
      }

      addDebugLog('Parsed output:', output);

      // Remove typing indicator
      removeTypingIndicator(typingId);

      if (output.responseType === 'recipe_proposals' && output.proposals) {
        setProposals(output.proposals);
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'bot',
          content: output.message || "Here are some ideas! Pick one and I'll build the full recipe.",
          proposals: output.proposals,
          timestamp: new Date().toLocaleTimeString()
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'bot',
          content: output.message || output.text || JSON.stringify(output),
          timestamp: new Date().toLocaleTimeString()
        }]);
      }
    },
    handleError(error, { typingId, removeTypingIndicator }) {
      addDebugLog('Error in propose:', error.message);
      removeTypingIndicator(typingId);
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: 'bot',
        content: error.name === 'AbortError'
          ? "That took too long — please try again with a simpler description."
          : "Something went wrong generating proposals. Please try again!",
        isRetryable: true,
        timestamp: new Date().toLocaleTimeString()
      }]);
    },
    retryText(payload) {
      return payload.message || payload.description || '';
    },
  };
}
```

---

### Task 10: Remove confirmed dead SmartDeals code and preserve legacy routes

**Files:**
- Delete: `src/components/SmartDeals.js`, only after the reference audit below.
- Modify: `e2e/routing.spec.js`.
- Read/retain: `src/components/Coupons.js`, `src/components/App.js`, `src/utils/screenRoute.js`, `src/hooks/useClipCoupons.js`.

- [ ] **Step 1: Add route characterization before deleting the file.** Inside the existing routing describe block, add:

```js
test('legacy #smart-deals redirects to Deals', async ({ page, backend }) => {
  await open(page, 'smart-deals');
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#deals');
  await expect(page.locator('main').getByText('Deals & Coupons', { exact: false }).first()).toBeVisible();
});

test('legacy #coupons remains reachable', async ({ page, backend }) => {
  await open(page, 'coupons');
  await expect(page.locator('main').getByRole('heading', { name: 'HEB Digital Coupons' })).toBeVisible();
  expect(await page.evaluate(() => window.location.hash)).toBe('#coupons');
});
```

- [ ] **Step 2: Run the route tests against the pre-deletion tree.**

```powershell
$env:CI='true'
npx.cmd playwright test e2e/routing.spec.js --project=mobile --project=desktop
```

Expected: all pass, including both routes in both viewports. The existing mock backend serves coupon fixtures; do not record production fixtures for this change.

- [ ] **Step 3: Repeat the import/reference audit and delete only the unused component.**

```powershell
rg -n 'SmartDeals' src --glob '!SmartDeals.js'
rg -n 'smart-deals|Coupons|coupons' src/components/App.js src/utils/screenRoute.js
git ls-files -- 'src/components/SessionManager.js'
```

Expected: no SmartDeals import/render consumers outside the candidate itself (comments can remain); Coupons still imported/rendered; `smart-deals` still redirects to Deals; SessionManager already absent. A no-match `rg` exit 1 is expected for the first search. Investigate a real consumer before deletion rather than widening the change.

```powershell
git rm -- 'src/components/SmartDeals.js'
```

- [ ] **Step 4: Run lint, full Jest and the same route browser tests; commit.**

```powershell
$env:CI='true'
npm.cmd run lint
npx.cmd react-scripts test --watchAll=false
npx.cmd playwright test e2e/routing.spec.js --project=mobile --project=desktop
git add -- 'e2e/routing.spec.js'
git commit -m 'refactor: remove unused smart deals component' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

Expected: all pass, no act warnings. The source deletion was already staged by `git rm`; add only the modified routing test here. Report that Coupons was intentionally retained and SessionManager required no change.

### Task 11: Whole-branch review, final gates and release

**Files/artifacts:**
- Create: `docs/superpowers/reports/2026-09-10-component-decomposition-release.md` (use actual release date if later).
- Modify after shipment: `docs/superpowers/hardening-checklist.md`, D section only plus a clearly attributed D follow-up list if needed.
- Update: canonical D ledger/mirror and external `hardening_program.md` memory.
- No new production behavior or backend changes are introduced in this task.

- [ ] **Step 1: Assemble the whole-branch brief/report and review package.** Use the recorded implementation base, not a recently moved `main` ref. Include actual task commits, test results, contract decisions and follow-ups. Dispatch the GPT-6 Astra whole-branch reviewer with the brief/report/package and approved design, never the whole plan.

Review focus: unchanged provider/screen lifetimes; effect dependencies/order; original Shop Set/pending-operation ownership; stale/late responses; Cart snapshot/step/SSE distinctions; Cook paused-timer and persistence behavior; chat adapters preserving response and retry differences; compatibility exports and absence of import cycles; G DOM/focus/44px behavior; no incidental fixes or backend traffic changes. Verify tests exercise production behavior and cover the moved boundaries.

- [ ] **Step 2: Resolve review findings through the SDD final fix wave and scoped re-review.** Correct regressions and plan defects; retain pre-existing quirks as follow-ups. Record rulings with evidence. Do not mark D complete while an unresolved finding invalidates its preservation contract.

- [ ] **Step 3: Run final gates in order against the reviewed source.**

```powershell
$env:CI='true'
npm.cmd run lint
npx.cmd react-scripts test --watchAll=false
npm.cmd run test:e2e
```

Expected: zero ESLint warnings; all Jest tests with zero act warnings; all hermetic mobile/desktop tests pass. Keep Playwright in the foreground until completion. Record actual totals, new tests and any reruns; do not predict counts or treat a retry as an unqualified first-attempt pass. Rerun relevant gates after any later source/test change.

- [ ] **Step 4: Run the existing live suite once.**

```powershell
$env:CI='true'
npm.cmd run test:e2e:live
```

Expected: all four live specs pass. The suite has real backend effects; retain its existing isolation/residue conventions and permanent telemetry sentinel. Do not loop a failed suite, submit extra feedback, run live AI calls or build a cart to diagnose. A failure requires evidence and a read-only or hermetic diagnosis; the prior G initial-navigation timeout is not advance approval for a D live failure.

Use the available MySQL connector to record these read-only checks before and after live/deploy, without printing credentials:

```sql
SELECT COUNT(*) AS total,
       SUM(session_id = '00000000-0000-4000-8000-0000000e2e01'
           AND stack_hash = 'e2e00001') AS sentinel
FROM client_errors;
SELECT COUNT(*) AS residue FROM oneoff_items WHERE name = '__e2e_live__';
```

The last shipped state was total 1/sentinel 1, with zero named residue. Establish the current count rather than assuming it has stayed unchanged since G. Investigate new rows; never delete real telemetry or the sentinel. Remove only confirmed residue created by this suite under its existing cleanup convention. Record the live result truthfully.

- [ ] **Step 5: Prepare the concrete release report and request D release approval.** Include reviewed commits, behavior-preservation evidence, lint/Jest/hermetic/live results, retained quirks and any material limitation. Ask once for the feature push, CI, main fast-forward/push (Netlify deployment) and completion-doc push. All source work and required local verification must be complete before asking.

- [ ] **Step 6: After approval, push the branch and wait for CI on its exact head.**

```powershell
git push -u origin refactor/component-decomposition
gh run list --branch refactor/component-decomposition --limit 5 --json databaseId,headSha,status,conclusion,url
```

Identify the run whose head SHA equals `git rev-parse HEAD`, then run `gh run watch <actual-run-id> --exit-status`. Do not substitute a previous green run. If CI finds a source/test regression, repair and review it, then repeat the relevant gates and wait for the new exact head. Approval remains valid for the authorized release sequence unless the scope materially changes.

- [ ] **Step 7: Fast-forward main from the original checkout and push.** First verify its tracked worktree is clean and that main can fast-forward. Leave unrelated untracked scratch files untouched.

```powershell
git -C 'C:/New Grocery App/grocery-checklist-app' merge --ff-only refactor/component-decomposition
git -C 'C:/New Grocery App/grocery-checklist-app' push origin main
```

Do not force a merge or discard intervening work. Monitor the exact main CI run as well as Netlify; a main push alone does not prove deployment.

- [ ] **Step 8: Verify the deployed bundle and read-only live behavior.** Record the previous live bundle before pushing. Poll the deployed site until the new main bundle is served and associate it with the released commit through the deployment/CI evidence. Resolve the locally installed Playwright Chromium instead of hard-coding an old browser revision. Use a local ignored script like this from the implementation worktree:

```js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const route of ['plan', 'shop']) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, timezoneId: 'America/Chicago',
      });
      const page = await context.newPage();
      const errors = [];
      const telemetry = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.endsWith('/client_errors')) telemetry.push(request.method());
      });
      await page.goto(`https://grocery-checklist-app.netlify.app/?deploy-check=${Date.now()}#${route}`, {
        waitUntil: 'networkidle', timeout: 60000,
      });
      if (route === 'plan') await page.getByText('Grocery Staples', { exact: true }).first().waitFor();
      else await page.getByText(/items? left|All done!/).first().waitFor();
      const bundles = await page.locator('script[src]').evaluateAll((scripts) => (
        scripts.map((script) => script.src).filter((src) => /\/main\.[a-f0-9]+\.js/.test(src))
      ));
      console.log(JSON.stringify({ route, bundles, errors, telemetry }));
      if (bundles.length !== 1 || errors.length || telemetry.length) {
        throw new Error(`Post-deploy ${route} verification failed`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
```

Keep this process attached and report progress while it runs. Confirm both printed bundles match the deployed release. Expect zero page errors and zero `client_errors` requests, and no increase over the established telemetry count. Do not click mutation controls or submit feedback. Diagnose unexpected findings without clearing their evidence.

- [ ] **Step 9: Complete the shipped-state documentation and memory.** Tick D's header and six checklist entries only after its approved scope ships. The deletion entry must explain: SmartDeals removed, Coupons retained because routed, SessionManager already removed under A. Name extracted responsibilities, preserved behavior, reviewed commit/bundle, actual gates and any follow-ups in the release report.

Commit only the exact checklist/report paths with the required coauthor. Push completion docs under the existing release approval and verify their CI. Update external memory at `C:/Users/Corey/.claude/projects/C--New-Grocery-App-grocery-checklist-app/memory/hardening_program.md` with D shipped, release evidence and backlog C then F. Do not mark C's Slack leg enabled; its webhook remains unset until separately handled.

- [ ] **Step 10: Close the ledger and present the remaining backlog.** Mirror Task 11 completion, retain review artifacts, and report C (HEB session lifecycle) then F (scrape-time data quality), plus the deferred lists in A/B/E/G and any D follow-ups. Link the durable release report. Do not claim unrun gates, fixed quirks or delivery of Slack alerts.

## Plan acceptance map

| Approved requirement | Tasks |
| --- | --- |
| App routing/join and selected meals, same history whitelist | 1-2 |
| Shop views, voice/helpers, progress/pending ops and partner session | 3-4 |
| Cart views/session and build/SSE, unchanged matching/review | 5-6 |
| Cook views/timer with original ownership and persistence policy | 7 |
| Shared chat send/retry with separate Planner/Creator adapters | 8-9 |
| Reachability audit; retain Coupons and redirects | 10 |
| Behavior characterization, G protection and program release gates | 1-11 |

Execution uses the established subagent workflow. Spec approval is recorded; this plan is the concrete next artifact. Its new code/test examples must still be implemented and verified task by task.
