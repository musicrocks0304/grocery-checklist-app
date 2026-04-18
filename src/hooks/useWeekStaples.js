import { useState, useEffect, useCallback, useRef } from 'react';
import { ENDPOINTS, apiFetch, showApiError } from '../config/api';
import { getWeekDates } from '../utils/weekDates';

const useWeekStaples = () => {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const selectedRef = useRef(selected);
  const itemsRef = useRef(items);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { itemsRef.current = items; }, [items]);
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
    const item = itemsRef.current.find((i) => i.ItemID === itemId);
    if (!item) return;
    const wasSelected = selectedRef.current.has(itemId);
    // Update ref immediately (before re-render) so rapid back-to-back calls read
    // the correct optimistic state rather than the stale closed-over value.
    const next = new Set(selectedRef.current);
    if (wasSelected) next.delete(itemId); else next.add(itemId);
    selectedRef.current = next;
    setSelected(next);
    const endpoint = wasSelected ? ENDPOINTS.selectionUncheck : ENDPOINTS.selectionCheck;
    // Backend has no IsSelected flag — presence of the row IS the selection.
    // Check INSERTs a new row; uncheck DELETEs by itemName+week+DataSource='Staples'.
    const payload = wasSelected
      ? { itemName: item.ItemName, weekDateRange: weekData.displayRange }
      : {
          itemId,
          itemName: item.ItemName,
          category: item.Category,
          store: item.Store,
          quantity: 1,
          weekDateRange: weekData.displayRange,
        };
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // roll back both ref and state
      const rolled = new Set(selectedRef.current);
      if (wasSelected) rolled.add(itemId); else rolled.delete(itemId);
      selectedRef.current = rolled;
      setSelected(rolled);
      showApiError(err);
    }
  }, [weekData.displayRange]);

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
    const target = itemsRef.current.find((i) => i.ItemID === itemId);
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
  }, [weekData.displayRange]);

  return { items, selected, loading, error, toggle, quickAdd, removeOneOff };
};

export default useWeekStaples;
