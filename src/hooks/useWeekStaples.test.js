import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import useWeekStaples from './useWeekStaples';
import { ENDPOINTS } from '../config/api';

// apiJson calls apiFetch's own local reference internally (a same-module
// function call, not a re-export lookup), so jest.mock('../config/api',
// { apiFetch: jest.fn() }) does NOT intercept it — verified empirically:
// with that pattern the mocked apiFetch saw zero calls while apiJson made a
// real network request. Mock at the actual network boundary (global.fetch)
// instead, matching the pattern already used in useCategories.test.js.
beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

const mockItems = [
  { ItemID: 1, ItemName: 'Milk',  Category: 'Dairy & eggs', DataSource: 'Staples',         IsSelected: 1, QuantitySelected: 1 },
  { ItemID: 2, ItemName: 'Bread', Category: 'Bakery & bread', DataSource: 'Staples',       IsSelected: 0, QuantitySelected: 1 },
  { ItemID: 9, ItemName: 'Balloons', Category: 'Household & other', DataSource: 'OneOff',  IsSelected: 1, QuantitySelected: 1 },
];

const mockOk = (body) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });

describe('useWeekStaples', () => {
  test('loads items and seeds selected from IsSelected', async () => {
    global.fetch.mockImplementationOnce(() => mockOk(mockItems));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(3);
    expect(result.current.selected.has(1)).toBe(true);
    expect(result.current.selected.has(2)).toBe(false);
    expect(result.current.selected.has(9)).toBe(true);
  });

  test('toggle adds id to selected and POSTs selection_check with full row payload', async () => {
    global.fetch.mockImplementationOnce(() => mockOk(mockItems)); // initial fetch
    global.fetch.mockImplementationOnce(() => mockOk({ success: true })); // toggle
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggle(2); });
    expect(result.current.selected.has(2)).toBe(true);
    const [callUrl, callOpts] = global.fetch.mock.calls[1];
    expect(callUrl).toBe(ENDPOINTS.selectionCheck);
    const body = JSON.parse(callOpts.body);
    expect(body).toMatchObject({
      itemId: 2,
      itemName: 'Bread',
      quantity: 1,
      category: 'Bakery & bread',
    });
    expect(body.weekDateRange).toMatch(/week/i);
    // weekStartDate is required by the backend's Clear Skipped Flag step —
    // without it, re-checking a previously unchecked item is silently lost.
    expect(body.weekStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('toggle removes id from selected and POSTs selection_uncheck with itemName payload', async () => {
    global.fetch.mockImplementationOnce(() => mockOk(mockItems));
    global.fetch.mockImplementationOnce(() => mockOk({ success: true }));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggle(1); });
    expect(result.current.selected.has(1)).toBe(false);
    const [callUrl, callOpts] = global.fetch.mock.calls[1];
    expect(callUrl).toBe(ENDPOINTS.selectionUncheck);
    // Backend DELETE matches by itemName + weekDateRange (no itemId needed)
    const body = JSON.parse(callOpts.body);
    expect(body.itemName).toBe('Milk');
    expect(body.weekDateRange).toMatch(/week/i);
    // weekStartDate is required by the backend cascade-delete of shopping_progress
    expect(body.weekStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('removeOneOff payload includes weekStartDate for shopping_progress cascade', async () => {
    global.fetch.mockImplementationOnce(() => mockOk(mockItems));
    global.fetch.mockImplementationOnce(() => mockOk({ success: true }));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.removeOneOff(9); });
    const [, callOpts] = global.fetch.mock.calls[1];
    const body = JSON.parse(callOpts.body);
    expect(body.weekStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('toggle rolls back on API failure', async () => {
    global.fetch.mockImplementationOnce(() => mockOk(mockItems));
    global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error', text: () => Promise.resolve('') }));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggle(2); });
    expect(result.current.selected.has(2)).toBe(false);
  });

  test('toggle rolls back on an empty 200 (apiJson treats it as an error)', async () => {
    global.fetch.mockImplementationOnce(() => mockOk(mockItems));
    global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.reject(new Error('empty')) }));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggle(2); });
    expect(result.current.selected.has(2)).toBe(false);
  });

  test('quickAdd appends a one-off and marks it selected', async () => {
    global.fetch.mockImplementationOnce(() => mockOk(mockItems));
    global.fetch.mockImplementationOnce(() =>
      mockOk({ success: true, itemId: 7777, itemName: 'Candles' })
    );
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.quickAdd('Candles'); });
    const added = result.current.items.find((i) => i.ItemName === 'Candles');
    expect(added).toBeTruthy();
    expect(added.DataSource).toBe('OneOff');
    expect(result.current.selected.has(added.ItemID)).toBe(true);
  });

  test('removeOneOff deletes from items and selected, POSTs remove_weekly_item', async () => {
    global.fetch.mockImplementationOnce(() => mockOk(mockItems));
    global.fetch.mockImplementationOnce(() => mockOk({ success: true }));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.removeOneOff(9); });
    expect(result.current.items.find((i) => i.ItemID === 9)).toBeUndefined();
    expect(result.current.selected.has(9)).toBe(false);
    expect(global.fetch.mock.calls[1][0]).toBe(ENDPOINTS.removeWeeklyItem);
  });

  test('rapid double-tap on same item dispatches check then uncheck', async () => {
    global.fetch.mockImplementationOnce(() => mockOk(mockItems)); // initial fetch
    global.fetch.mockImplementation(() => mockOk({ success: true })); // any subsequent POST
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Tap twice in quick succession on the same item (ItemID 2 starts unselected)
    await act(async () => {
      await Promise.all([
        result.current.toggle(2),
        result.current.toggle(2),
      ]);
    });

    // After both toggles complete, ItemID 2 should be back to unselected (checked then unchecked)
    expect(result.current.selected.has(2)).toBe(false);

    // The two POSTs should be selectionCheck then selectionUncheck (not check twice)
    const postCalls = global.fetch.mock.calls.slice(1); // skip initial fetch
    expect(postCalls).toHaveLength(2);
    expect(postCalls[0][0]).toBe(ENDPOINTS.selectionCheck);
    expect(postCalls[1][0]).toBe(ENDPOINTS.selectionUncheck);
  });
});
