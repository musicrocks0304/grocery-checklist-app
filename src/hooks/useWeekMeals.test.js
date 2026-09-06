import { renderHook, waitFor } from '@testing-library/react';
import useWeekMeals from './useWeekMeals';
import { ENDPOINTS } from '../config/api';

// apiJson calls apiFetch's own local reference internally (a same-module
// function call, not a re-export lookup), so jest.mock('../config/api',
// { apiFetch: jest.fn() }) does NOT intercept it — verified empirically:
// with that pattern the mocked apiFetch saw zero calls while apiJson made a
// real network request. Mock at the actual network boundary (global.fetch)
// instead, matching the pattern already used in useCategories.test.js.
const mockOk = (body) => Promise.resolve({
  ok: true, status: 200,
  text: () => Promise.resolve(JSON.stringify(body)),
  json: () => Promise.resolve(body),
});

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { delete global.fetch; });

describe('useWeekMeals', () => {
  test('loads meals and groups by mealName', async () => {
    global.fetch.mockImplementationOnce(() => mockOk([
      { mealName: 'Chicken tacos', ingredientNames: ['Chicken thighs', 'Cilantro'] },
      { mealName: 'Pasta alfredo', ingredientNames: ['Pasta', 'Heavy cream'] },
    ]));
    const { result } = renderHook(() => useWeekMeals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meals).toHaveLength(2);
    expect(result.current.meals[0].mealName).toBe('Chicken tacos');
    expect(result.current.meals[0].ingredientNames).toEqual(['Chicken thighs', 'Cilantro']);
  });

  test('returns empty array when API returns []', async () => {
    global.fetch.mockImplementationOnce(() => mockOk([]));
    const { result } = renderHook(() => useWeekMeals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meals).toEqual([]);
  });

  test('fetches with weekDateRange query param', async () => {
    global.fetch.mockImplementationOnce(() => mockOk([]));
    renderHook(() => useWeekMeals());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain(ENDPOINTS.fetchWeeklyMealIngredients);
    expect(url).toContain('weekDateRange=');
  });

  test('sets error state on API failure', async () => {
    // GET requests default to apiJson retries: 2, so apiFetch retries this
    // 5xx twice more before giving up — return it persistently, not once.
    global.fetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error', text: () => Promise.resolve('') });
    const { result } = renderHook(() => useWeekMeals());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10000 });
    expect(result.current.error).toBeTruthy();
    expect(result.current.meals).toEqual([]);
  }, 15000);
});
