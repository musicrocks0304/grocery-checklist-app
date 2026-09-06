import { useState, useEffect } from 'react';
import { ENDPOINTS, apiJson } from '../config/api';

export const CATEGORIES_CACHE_KEY = 'cachedCategories';

export function useCategories() {
  const [categories, setCategories] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetchFn = typeof apiJson === 'function' ? apiJson : async (u, o) => { const r = await fetch(u, o); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
        const data = await fetchFn(ENDPOINTS.categories, { method: 'GET', retries: 0 });
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
