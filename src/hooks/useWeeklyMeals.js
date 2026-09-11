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
      if (normalized.length > 0) localStorage.setItem(weekKey, JSON.stringify(normalized));
      else localStorage.removeItem(weekKey);
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
