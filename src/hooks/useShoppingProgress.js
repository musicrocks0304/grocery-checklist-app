import { useState, useRef, useCallback } from 'react';
import { ENDPOINTS, apiJson } from '../config/api';
import { getWeekDates } from '../utils/weekDates';

export default function useShoppingProgress({ shoppingList, partnerSession }) {
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const lastLocalMutationRef = useRef(0);
  const pendingOpsRef = useRef(new Map());
  const opTokenRef = useRef(0);

  const sendProgressOp = useCallback((itemId, desired, weekStart, token) => {
    const endpoint = desired ? ENDPOINTS.shoppingProgressCheck : ENDPOINTS.shoppingProgressUncheck;
    apiJson(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_start_date: weekStart, item_id: itemId }),
    })
      .then(() => {
        const entry = pendingOpsRef.current.get(itemId);
        if (!entry || entry.token !== token) return; // superseded by a newer toggle
        pendingOpsRef.current.delete(itemId);
      })
      .catch(() => {
        const entry = pendingOpsRef.current.get(itemId);
        if (entry && entry.token === token) entry.failed = true;
      });
  }, []);

  // Re-send failed ops when the network returns (or on a slow background
  // tick — grocery-store dead spots end when you walk three aisles over).
  const drainPendingOps = useCallback(() => {
    pendingOpsRef.current.forEach((entry, itemId) => {
      if (!entry.failed) return;
      entry.failed = false;
      entry.token = ++opTokenRef.current;
      sendProgressOp(itemId, entry.desired, entry.weekStart, entry.token);
    });
  }, [sendProgressOp]);

  const retryProgressEffect = useCallback(() => {
    const onOnline = () => drainPendingOps();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") drainPendingOps();
    }, 10000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [drainPendingOps]);

  const hydrateProgressEffect = useCallback(() => {
    if (!shoppingList) return;
    const loadCheckedItems = async () => {
      try {
        const weekStart = shoppingList.weekStartDate || getWeekDates().startDate;
        const weekRange = shoppingList.weekDateRange || getWeekDates().displayRange;
        const url = new URL(ENDPOINTS.shoppingProgress);
        url.searchParams.append("week_start_date", weekStart);
        // Backend JOINs against WeeklyGroceryList on WeekDateRange so stale
        // rows (items no longer on the list) are filtered out server-side.
        url.searchParams.append("week_date_range", weekRange);
        const data = await apiJson(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const checkedIds = Array.isArray(data) ? data.map((row) => String(row.item_id)) : [];
        setCheckedItems(new Set(checkedIds));
        return;
      } catch {
        /* fall through to localStorage fallback */
      }
      try {
        const stored = localStorage.getItem("inStoreCheckedItems");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.savedAt === shoppingList.savedAt) {
            setCheckedItems(new Set(parsed.checkedIds));
          } else {
            localStorage.removeItem("inStoreCheckedItems");
          }
        }
      } catch {
        localStorage.removeItem("inStoreCheckedItems");
      }
    };
    loadCheckedItems();
  }, [shoppingList]);

  const cleanupUndoToastEffect = useCallback(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // --- Toggle check (+ toast on newly-checked) ---
  const handleToggleItem = useCallback(
    (item) => {
      const itemId = item.ItemID.toString();
      lastLocalMutationRef.current = Date.now();
      setCheckedItems((prev) => {
        const next = new Set(prev);
        const isChecking = !next.has(itemId);
        if (isChecking) next.add(itemId);
        else next.delete(itemId);

        const weekStart = shoppingList?.weekStartDate || getWeekDates().startDate;
        const token = ++opTokenRef.current;
        pendingOpsRef.current.set(itemId, { desired: isChecking, weekStart, token, failed: false });
        sendProgressOp(itemId, isChecking, weekStart, token);

        if (shoppingList) {
          localStorage.setItem(
            "inStoreCheckedItems",
            JSON.stringify({ savedAt: shoppingList.savedAt, checkedIds: Array.from(next) })
          );
        }

        if (isChecking) {
          setToast({ itemId, itemName: item.ItemName });
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => setToast(null), 3000);
        } else {
          // If we're un-checking the item currently shown in the toast, clear it.
          setToast((current) => (current && current.itemId === itemId ? null : current));
          if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
          }
        }

        return next;
      });
    },
    [shoppingList, sendProgressOp]
  );

  const handleUndo = useCallback(() => {
    if (!toast) return;
    const item = shoppingList?.items.find((i) => i.ItemID.toString() === toast.itemId);
    if (item) handleToggleItem(item);
    else setToast(null);
  }, [toast, shoppingList, handleToggleItem]);

  const pollPartnerProgressEffect = useCallback(() => {
    if (!shoppingList || !partnerSession) return undefined;
    const weekStart = shoppingList.weekStartDate;
    if (!weekStart) return undefined;

    let cancelled = false;

    const weekRange = shoppingList.weekDateRange;

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLocalMutationRef.current < 2000) return;
      try {
        const url = new URL(ENDPOINTS.shoppingProgress);
        url.searchParams.append("week_start_date", weekStart);
        if (weekRange) url.searchParams.append("week_date_range", weekRange);
        const data = await apiJson(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          timeout: 8000,
          retries: 0,
        });
        if (cancelled) return;
        const remoteIds = Array.isArray(data) ? data.map((r) => String(r.item_id)) : [];
        // Re-check mutation timestamp in case user toggled during the fetch.
        if (Date.now() - lastLocalMutationRef.current < 2000) return;
        setCheckedItems((prev) => {
          const next = new Set(remoteIds);
          // Local taps the server hasn't acknowledged yet always win —
          // otherwise a failed/slow POST gets silently reverted by the poll.
          pendingOpsRef.current.forEach((entry, itemId) => {
            if (entry.desired) next.add(itemId);
            else next.delete(itemId);
          });
          if (prev.size === next.size && Array.from(prev).every((id) => next.has(id))) {
            return prev;
          }
          return next;
        });
      } catch {
        /* network hiccup — try again next tick */
      }
    };

    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [shoppingList, partnerSession]);

  return {
    checkedItems, toast, handleToggleItem, handleUndo,
    retryProgressEffect, hydrateProgressEffect,
    cleanupUndoToastEffect, pollPartnerProgressEffect,
  };
}
