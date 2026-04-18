import { useState, useEffect, useCallback } from 'react';
import { ENDPOINTS, apiFetch, showApiError } from '../config/api';
import { getWeekDates } from '../utils/weekDates';

const useWeekStaples = () => {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const weekData = getWeekDates();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(ENDPOINTS.fetchGroceryItems);
        url.searchParams.append('weekStartDate', weekData.startDate);
        url.searchParams.append('weekEndDate', weekData.endDate);
        url.searchParams.append('weekDateRange', weekData.displayRange);
        const res = await apiFetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setItems(data);
        const sel = new Set();
        data.forEach((it) => { if (it.IsSelected === 1) sel.add(it.ItemID); });
        setSelected(sel);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        showApiError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [weekData.startDate, weekData.endDate, weekData.displayRange]);

  const toggle = useCallback(async (itemId) => {
    const wasSelected = selected.has(itemId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (wasSelected) next.delete(itemId); else next.add(itemId);
      return next;
    });
    const endpoint = wasSelected ? ENDPOINTS.selectionUncheck : ENDPOINTS.selectionCheck;
    const payload = wasSelected
      ? { itemId, weekDateRange: weekData.displayRange }
      : { itemId, weekDateRange: weekData.displayRange, quantitySelected: 1 };
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // roll back
      setSelected((prev) => {
        const next = new Set(prev);
        if (wasSelected) next.add(itemId); else next.delete(itemId);
        return next;
      });
      showApiError(err);
    }
  }, [selected, weekData.displayRange]);

  const quickAdd = useCallback(async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await apiFetch(ENDPOINTS.addOneOffItem, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ itemName: trimmed, weekDateRange: weekData.displayRange }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const newId = data.itemId || `oneoff_${Date.now()}`;
      const newItem = {
        ItemID: newId,
        ItemName: trimmed,
        Category: 'Household & other',
        DataSource: 'OneOff',
        Type: 'OneOff',
        IsSelected: 1,
        QuantitySelected: 1,
      };
      setItems((prev) => [...prev, newItem]);
      setSelected((prev) => new Set(prev).add(newId));
    } catch (err) {
      showApiError(err);
    }
  }, [weekData.displayRange]);

  const removeOneOff = useCallback(async (itemId) => {
    const target = items.find((i) => i.ItemID === itemId);
    if (!target) return;
    try {
      const res = await apiFetch(ENDPOINTS.removeWeeklyItem, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ itemName: target.ItemName, weekDateRange: weekData.displayRange }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((i) => i.ItemID !== itemId));
      setSelected((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
    } catch (err) {
      showApiError(err);
    }
  }, [items, weekData.displayRange]);

  return { items, selected, loading, error, toggle, quickAdd, removeOneOff };
};

export default useWeekStaples;
