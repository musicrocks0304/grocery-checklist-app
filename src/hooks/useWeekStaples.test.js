import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import useWeekStaples from './useWeekStaples';

// Mock the API module
jest.mock('../config/api', () => {
  const actual = jest.requireActual('../config/api');
  return {
    ...actual,
    apiFetch: jest.fn(),
  };
});
const { apiFetch, ENDPOINTS } = require('../config/api');

const mockItems = [
  { ItemID: 1, ItemName: 'Milk',  Category: 'Dairy & eggs', DataSource: 'Staples',         IsSelected: 1, QuantitySelected: 1 },
  { ItemID: 2, ItemName: 'Bread', Category: 'Bakery & bread', DataSource: 'Staples',       IsSelected: 0, QuantitySelected: 1 },
  { ItemID: 9, ItemName: 'Balloons', Category: 'Household & other', DataSource: 'OneOff',  IsSelected: 1, QuantitySelected: 1 },
];

beforeEach(() => {
  apiFetch.mockReset();
});

const mockOk = (body) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });

describe('useWeekStaples', () => {
  test('loads items and seeds selected from IsSelected', async () => {
    apiFetch.mockImplementationOnce(() => mockOk(mockItems));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(3);
    expect(result.current.selected.has(1)).toBe(true);
    expect(result.current.selected.has(2)).toBe(false);
    expect(result.current.selected.has(9)).toBe(true);
  });

  test('toggle adds id to selected and POSTs selection_check', async () => {
    apiFetch.mockImplementationOnce(() => mockOk(mockItems)); // initial fetch
    apiFetch.mockImplementationOnce(() => mockOk({ success: true })); // toggle
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggle(2); });
    expect(result.current.selected.has(2)).toBe(true);
    const callUrl = apiFetch.mock.calls[1][0];
    expect(callUrl).toBe(ENDPOINTS.selectionCheck);
  });

  test('toggle removes id from selected and POSTs selection_uncheck', async () => {
    apiFetch.mockImplementationOnce(() => mockOk(mockItems));
    apiFetch.mockImplementationOnce(() => mockOk({ success: true }));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggle(1); });
    expect(result.current.selected.has(1)).toBe(false);
    expect(apiFetch.mock.calls[1][0]).toBe(ENDPOINTS.selectionUncheck);
  });

  test('toggle rolls back on API failure', async () => {
    apiFetch.mockImplementationOnce(() => mockOk(mockItems));
    apiFetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500 }));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggle(2); });
    expect(result.current.selected.has(2)).toBe(false);
  });

  test('quickAdd appends a one-off and marks it selected', async () => {
    apiFetch.mockImplementationOnce(() => mockOk(mockItems));
    apiFetch.mockImplementationOnce(() =>
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
    apiFetch.mockImplementationOnce(() => mockOk(mockItems));
    apiFetch.mockImplementationOnce(() => mockOk({ success: true }));
    const { result } = renderHook(() => useWeekStaples());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.removeOneOff(9); });
    expect(result.current.items.find((i) => i.ItemID === 9)).toBeUndefined();
    expect(result.current.selected.has(9)).toBe(false);
    expect(apiFetch.mock.calls[1][0]).toBe(ENDPOINTS.removeWeeklyItem);
  });
});
