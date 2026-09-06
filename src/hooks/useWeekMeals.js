import { useState, useEffect } from 'react';
import { ENDPOINTS, apiJson, showApiError } from '../config/api';
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
        const data = await apiJson(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
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
