import { useState, useEffect } from 'react';
import { ENDPOINTS, apiFetch } from '../config/api';

export const CATEGORIES_CACHE_KEY = 'cachedCategories';

export function useCategories() {
  const [categories, setCategories] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetchFn = typeof apiFetch === 'function' ? apiFetch : fetch;
        const res = await fetchFn(ENDPOINTS.categories, { method: 'GET', retries: 0 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setCategories(data);
        try { localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
      } catch {
        if (cancelled) return;
        try {
          const cached = localStorage.getItem(CATEGORIES_CACHE_KEY);
          setCategories(cached ? JSON.parse(cached) : []);
        } catch {
          setCategories([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { categories, loading };
}
