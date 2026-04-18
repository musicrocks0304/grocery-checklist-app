import { useState, useEffect } from 'react';
import { ENDPOINTS, apiFetch, showApiError } from '../config/api';
import { getWeekDates } from '../utils/weekDates';

const useWeekMeals = () => {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const weekData = getWeekDates();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(ENDPOINTS.fetchWeeklyMealIngredients);
        url.searchParams.append('weekDateRange', weekData.displayRange);
        const res = await apiFetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setMeals(Array.isArray(data) ? data : []);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        showApiError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [weekData.displayRange]);

  return { meals, loading, error };
};

export default useWeekMeals;
