import { renderHook, waitFor } from '@testing-library/react';
import { useCategories, CATEGORIES_CACHE_KEY } from './useCategories';
import { ENDPOINTS } from '../config/api';

describe('useCategories', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('returns null categories while loading', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '[]', json: async () => [] });
    const { result } = renderHook(() => useCategories());
    expect(result.current.categories).toBeNull();
    expect(result.current.loading).toBe(true);
    // Let the mocked fetch's pending state updates settle before the test ends.
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  test('returns fetched categories on success', async () => {
    const mockCats = [
      { id: 1, name: 'Fruit & vegetables', walk_order: 1 },
      { id: 2, name: 'Bakery & bread', walk_order: 2 },
    ];
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(mockCats), json: async () => mockCats });
    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.categories).toEqual(mockCats);
    expect(global.fetch).toHaveBeenCalledWith(ENDPOINTS.categories, expect.any(Object));
  });

  test('caches result to localStorage on success', async () => {
    const mockCats = [{ id: 1, name: 'Fruit & vegetables', walk_order: 1 }];
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(mockCats), json: async () => mockCats });
    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(JSON.parse(localStorage.getItem(CATEGORIES_CACHE_KEY))).toEqual(mockCats);
  });

  test('falls back to localStorage cache on fetch failure', async () => {
    const cachedCats = [{ id: 1, name: 'Cached cat', walk_order: 1 }];
    localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(cachedCats));
    global.fetch.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.categories).toEqual(cachedCats);
  });

  test('returns empty array as final fallback', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.categories).toEqual([]);
  });
});
