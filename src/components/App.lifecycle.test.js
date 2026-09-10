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
