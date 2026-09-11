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
