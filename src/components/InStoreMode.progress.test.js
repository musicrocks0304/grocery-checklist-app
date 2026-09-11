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
