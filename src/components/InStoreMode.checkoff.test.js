import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import InStoreMode from './InStoreMode';

// Item controls render role="checkbox" (InStoreMode.js ~line 636), and the
// accessible name is the button's full text content, which starts with
// item.ItemName (ItemRow ~line 627). Bread/Milk are one-item sections, so
// checking either one drives that section's checkedCount to totalCount and
// auto-collapses it (~line 1492) — irrelevant here since the assertions
// below check the header count text, not the row's own checked state.
const items = [
  { ItemID: 23, ItemName: 'Bread', Category: 'Bakery & bread', Store: 'HEB', DataSource: 'Staples', IsSelected: 1, QuantitySelected: 1, store_location: 'Bakery, Back' },
  { ItemID: 31, ItemName: 'Milk', Category: 'Dairy & eggs', Store: 'HEB', DataSource: 'Staples', IsSelected: 1, QuantitySelected: 1, store_location: 'Dairy, Back' },
];
const base = () => ({
  '/fetch_grocery_items': items,
  '/shopping_progress?': [],
  '/shopping_progress_check': { success: true },
  '/shopping_progress_uncheck': { success: true },
  '/api/heb/weekly-items': { items: [] },
  '/categories': [{ id: 2, name: 'Bakery & bread', walk_order: 2 }, { id: 5, name: 'Dairy & eggs', walk_order: 5 }],
});

// jsdom doesn't implement window.scrollTo; framer-motion's height animation
// on the auto-collapsing section (AisleSection ~line 1492) calls it and logs
// a console.error otherwise (same fix as App.test.js's Element.scrollTo stub).
beforeAll(() => {
  Object.defineProperty(window, 'scrollTo', { writable: true, value: jest.fn() });
});

afterEach(() => { restoreFetch(); localStorage.clear(); sessionStorage.clear(); });

test('tapping an item posts shopping_progress_check with a string item_id and drops the count', async () => {
  const mock = installMockFetch(base());
  renderWithProviders(<InStoreMode inStoreData={null} onExit={() => {}} />);
  expect(await screen.findByText('2 items left')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox', { name: /^Bread/ }));

  expect(await screen.findByText('1 item left')).toBeInTheDocument();
  await waitFor(() => expect(mock.for('/shopping_progress_check')).toHaveLength(1));
  // item.ItemID.toString() — the backend column is a string, not the raw number.
  expect(mock.for('/shopping_progress_check')[0].body).toEqual({ week_start_date: expect.any(String), item_id: '23' });

  expect(mock.unmocked()).toEqual([]);
});

test('a 500 keeps the optimistic state and marks the op failed for retry on "online"', async () => {
  const mock = installMockFetch({ ...base(), '/shopping_progress_check': { status: 500, body: { success: false, error: 'Workflow error' } } });
  renderWithProviders(<InStoreMode inStoreData={null} onExit={() => {}} />);
  await screen.findByText('2 items left');

  fireEvent.click(screen.getByRole('checkbox', { name: /^Bread/ }));

  // Optimistic UI: the count drops immediately even though the POST will fail.
  expect(await screen.findByText('1 item left')).toBeInTheDocument();
  await waitFor(() => expect(mock.for('/shopping_progress_check')).toHaveLength(1));
  expect(mock.for('/shopping_progress_check')[0].body).toMatchObject({ item_id: '23' });

  // drainPendingOps re-sends failed ops on the window "online" event.
  window.dispatchEvent(new Event('online'));
  await waitFor(() => expect(mock.for('/shopping_progress_check')).toHaveLength(2));
  expect(mock.for('/shopping_progress_check')[1].body).toMatchObject({ item_id: '23' });

  expect(mock.unmocked()).toEqual([]);
});
