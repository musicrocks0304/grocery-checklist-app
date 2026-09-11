import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft,
  ShoppingBag,
  Loader2,
  AlertCircle,
  Mic,
  MicOff,
  MoreHorizontal,
} from "lucide-react";
import { toast as hotToast } from "react-hot-toast";
import { AnimatePresence } from "framer-motion";
import { EmptyState } from "./ui";
import { getWeekDates, getWeekDatesFor } from "../utils/weekDates";
import { ENDPOINTS, apiJson } from "../config/api";
import { useCategories } from "../hooks/useCategories";
import { useFeedback } from "../contexts/FeedbackContext";
import { findBestMatch } from "../utils/shoppingVoiceMatch";
import { useHoldToTalk } from "../hooks/useHoldToTalk";
import { readJoinedSession, readHostSession } from "../utils/shoppingSessions";
import { groupByWalkOrder } from "../utils/shoppingList";
import { ProgressRing, AisleSection } from "./instore/ShoppingItems";
import ReorderDrawer from "./instore/ReorderDrawer";
import { ModeMenu } from "./instore/ModeMenu";
import { InviteModal } from "./instore/InviteModal";
import { PartnerBadge } from "./instore/PartnerBadge";
import UndoToast from "./instore/UndoToast";
import TripSummaryCard from "./instore/TripSummaryCard";

export { findBestMatch } from "../utils/shoppingVoiceMatch";
export { useHoldToTalk } from "../hooks/useHoldToTalk";
export { formatAisleBadge } from "../utils/shoppingList";
export { ModeMenu } from "./instore/ModeMenu";
export { InviteModal } from "./instore/InviteModal";
export { PartnerBadge } from "./instore/PartnerBadge";

const WALK_ORDER_STORAGE_KEY = "inStoreWalkOrder";

const InStoreMode = ({ inStoreData, onExit }) => {
  const { openFeedback } = useFeedback();
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [shoppingList, setShoppingList] = useState(null);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [couponLookup, setCouponLookup] = useState({});
  const [couponLoadFailed, setCouponLoadFailed] = useState(false);
  const [showTripSummary, setShowTripSummary] = useState(false);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  // V5 state
  const { categories: dbCategories } = useCategories();
  const defaultWalkOrder = useMemo(
    () => (dbCategories && dbCategories.length > 0
      ? [...dbCategories].sort((a, b) => a.walk_order - b.walk_order).map((c) => c.name)
      : []),
    [dbCategories]
  );
  const [walkOrder, setWalkOrder] = useState([]);
  // Section names the user has manually collapsed. Default-expanded; adding
  // a name here hides that section's body until the user taps the header.
  const [collapsedSections, setCollapsedSections] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editOrder, setEditOrder] = useState(false);
  // Active partner session (either joined via invite or hosted). Refreshed
  // when the invite modal closes so the badge appears after "Copy link".
  const [partnerSession, setPartnerSession] = useState(() => {
    const joined = readJoinedSession();
    if (joined) return { ...joined, role: "partner" };
    const hosted = readHostSession();
    if (hosted) return { ...hosted, role: "host" };
    return null;
  });

  const wakeLockRef = useRef(null);
  const celebratedRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const toastTimerRef = useRef(null);
  const menuTriggerRef = useRef(null);
  // Tracks the timestamp of the last local check/uncheck. The polling sync
  // ignores remote updates that land within ~2s of a local mutation so the
  // in-flight POST has time to land server-side (avoids brief flip-back).
  const lastLocalMutationRef = useRef(0);
  // Check/uncheck mutations not yet acknowledged by the server:
  // itemId -> { desired, weekStart, token, failed }. The live-sync poll never
  // overrides these (store Wi-Fi makes slow/failed POSTs routine — the old
  // fire-and-forget approach let the next poll silently revert the tap), and
  // failed ones are re-sent when connectivity returns.
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

  useEffect(() => {
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

  // --- Shopping list resolution: fetch-fresh-first with cache as offline fallback ---
  // Always re-fetch on mount so a mid-week addition/removal on the Plan screen
  // shows up here. The localStorage cache is a fallback for the API-down case
  // (spotty reception in the store), not a source of truth. A stale cache used
  // to cause "42/7" style counters because shopping_progress kept growing
  // while the cached list stayed frozen.
  useEffect(() => {
    const joined = readJoinedSession();
    const isJoined = !!joined;
    // A joiner must adopt the HOST's week wholesale. Mixing the host's
    // week_start_date with this device's locally-computed display string
    // broke the list fetch and progress JOIN whenever the two devices sat on
    // opposite sides of the Thursday week flip.
    const weekData = (isJoined && getWeekDatesFor(joined.week_start_date)) || getWeekDates();
    const targetWeekStart = weekData.startDate;

    // 1) Seed from prop (explicit pass-through, e.g. "Start Shopping" button)
    //    or from localStorage (if the cache matches this week). This gives an
    //    instant paint so the user isn't staring at a spinner.
    let seeded = false;
    if (inStoreData && inStoreData.items && inStoreData.items.length > 0 && !isJoined) {
      setShoppingList(inStoreData);
      seeded = true;
    } else if (!isJoined) {
      const stored = localStorage.getItem("inStoreShoppingList");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (
            parsed &&
            parsed.items &&
            parsed.items.length > 0 &&
            parsed.weekStartDate === targetWeekStart
          ) {
            setShoppingList(parsed);
            seeded = true;
          } else {
            localStorage.removeItem("inStoreShoppingList");
            localStorage.removeItem("inStoreCheckedItems");
          }
        } catch {
          /* invalid JSON, ignore */
        }
      }
    }

    // 2) Always refresh from backend in the background. Overwrites the seed
    //    with live data — that's the whole point of this refactor.
    let cancelled = false;
    const fetchItemsForWeek = async () => {
      if (!seeded) setIsAutoLoading(true);
      try {
        const url = new URL(ENDPOINTS.fetchGroceryItems);
        url.searchParams.append("weekStartDate", targetWeekStart);
        url.searchParams.append("weekEndDate", weekData.endDate);
        url.searchParams.append("weekDateRange", weekData.displayRange);
        url.searchParams.append("timestamp", new Date().toISOString());
        const data = await apiJson(url.toString(), {
          method: "GET",
          mode: "cors",
          headers: { Accept: "application/json" },
        });
        if (cancelled || !Array.isArray(data)) return;
        const selectedItems = data
          .filter((item) => item.IsSelected === 1)
          .map((item) => ({ ...item, quantity: item.QuantitySelected || 1 }));
        const listData = {
          items: selectedItems,
          savedAt: new Date().toISOString(),
          weekDateRange: weekData.displayRange,
          weekStartDate: targetWeekStart,
          joined: isJoined ? { code: joined.code, expires_at: joined.expires_at } : undefined,
        };
        if (cancelled) return;
        setShoppingList(listData);
        if (!isJoined) {
          localStorage.setItem("inStoreShoppingList", JSON.stringify(listData));
        }
      } catch (err) {
        console.error("[in-store] Auto-fetch failed:", err.message);
        // Seed (if any) stays on screen. If there was no seed, caller sees the
        // empty-list state and can retry.
      } finally {
        if (!cancelled && !seeded) setIsAutoLoading(false);
      }
    };
    fetchItemsForWeek();
    return () => {
      cancelled = true;
    };
  }, [inStoreData]);

  // --- Load saved walk order (merge localStorage override with DB-sourced defaults) ---
  useEffect(() => {
    if (defaultWalkOrder.length === 0) return;
    try {
      const stored = localStorage.getItem(WALK_ORDER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = [...parsed, ...defaultWalkOrder.filter((n) => !parsed.includes(n))];
          setWalkOrder(merged);
          return;
        }
      }
    } catch {
      /* ignore bad storage */
    }
    setWalkOrder(defaultWalkOrder);
  }, [defaultWalkOrder]);

  const persistWalkOrder = useCallback((order) => {
    try {
      localStorage.setItem(WALK_ORDER_STORAGE_KEY, JSON.stringify(order));
    } catch {
      /* ignore quota */
    }
  }, []);

  // --- Load checked items from DB, fall back to localStorage ---
  useEffect(() => {
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

  // --- Coupon lookup ---
  useEffect(() => {
    if (!shoppingList?.weekDateRange) return;
    const fetchCoupons = async () => {
      try {
        const url = `${ENDPOINTS.hebWeeklyItems}?weekDateRange=${encodeURIComponent(
          shoppingList.weekDateRange
        )}`;
        const data = await apiJson(url, { timeout: 10000 });
        const items = data.items || data || [];
        const lookup = {};
        (Array.isArray(items) ? items : []).forEach((item) => {
          if (item.couponDiscount && item.ItemName) {
            lookup[item.ItemName.toLowerCase()] = {
              couponDiscount: item.couponDiscount,
              couponSavings: item.couponSavings,
              couponClipped: item.couponClipped,
              couponProductName: item.couponProductName,
            };
          }
        });
        setCouponLookup(lookup);
      } catch {
        setCouponLoadFailed(true);
      }
    };
    fetchCoupons();
  }, [shoppingList?.weekDateRange]);

  // --- Screen Wake Lock ---
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
          setWakeLockActive(true);
          wakeLockRef.current.addEventListener("release", () => setWakeLockActive(false));
        }
      } catch {
        /* wake lock not supported or denied */
      }
    };
    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

  // --- Shopping timer ---
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMinutes(Math.floor((Date.now() - startTimeRef.current) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // --- Cleanup timers on unmount ---
  useEffect(() => {
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

  // Grouped items in walk order
  const grouped = useMemo(
    () => (shoppingList ? groupByWalkOrder(shoppingList.items, checkedItems, walkOrder) : []),
    [shoppingList, checkedItems, walkOrder]
  );

  const toggleSection = useCallback((name) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Auto-collapse a section when its last unchecked item gets checked off.
  // Tracks the previous "done" state per section so we only fire on the
  // transition (not-done → done), not on every render — otherwise an expanded
  // completed section would keep snapping shut when the user re-expanded it.
  const prevDoneRef = useRef({});
  useEffect(() => {
    const updates = [];
    grouped.forEach((s) => {
      const isDone = s.totalCount > 0 && s.checkedCount === s.totalCount;
      const wasDone = prevDoneRef.current[s.name];
      if (isDone && !wasDone) updates.push(s.name);
      prevDoneRef.current[s.name] = isDone;
    });
    if (updates.length > 0) {
      setCollapsedSections((prev) => {
        const next = new Set(prev);
        updates.forEach((n) => next.add(n));
        return next;
      });
    }
  }, [grouped]);

  const handleMoveUp = useCallback(
    (idx) => {
      if (idx === 0) return;
      setWalkOrder((prev) => {
        const next = [...prev];
        const name = grouped[idx].name;
        const prevName = grouped[idx - 1].name;
        const a = next.indexOf(name);
        const b = next.indexOf(prevName);
        if (a < 0 || b < 0) return prev;
        [next[a], next[b]] = [next[b], next[a]];
        persistWalkOrder(next);
        return next;
      });
    },
    [grouped, persistWalkOrder]
  );

  const handleUndo = useCallback(() => {
    if (!toast) return;
    const item = shoppingList?.items.find((i) => i.ItemID.toString() === toast.itemId);
    if (item) handleToggleItem(item);
    else setToast(null);
  }, [toast, shoppingList, handleToggleItem]);

  // Voice check-off v2: hold-to-talk on the header mic button.
  // The hook handles audio capture + transcription. We wire the result to
  // findBestMatch + the existing handleToggleItem so a successful match
  // checks the item the same way a tap would.
  const handleVoiceResult = useCallback(
    (transcript) => {
      if (!transcript) {
        // Whisper returned "" (silence, unintelligible noise) or the spec's
        // empty-transcript success path. Distinct from "no match" — user
        // didn't say anything we could parse.
        hotToast("Didn't hear anything — try again", { icon: "🤔", duration: 3000 });
        return;
      }
      const allUnchecked = shoppingList
        ? shoppingList.items.filter((i) => !checkedItems.has(i.ItemID.toString()))
        : [];
      const matched = findBestMatch(transcript, allUnchecked);
      if (matched) {
        handleToggleItem(matched);
        // Name the item that was actually checked — if the matcher grabbed
        // the wrong one, the shopper sees it immediately and can undo.
        hotToast.success(`Heard "${transcript}" — checked off ${matched.ItemName} ✓`, { duration: 3500 });
      } else {
        hotToast(`Heard "${transcript}" — not on your list`, { icon: "🔍", duration: 4000 });
      }
    },
    [shoppingList, checkedItems, handleToggleItem]
  );

  const handleVoiceError = useCallback((reason) => {
    const messages = {
      permission: "Microphone access blocked. Allow mic for this site in your browser/OS settings.",
      "no-mic": "No microphone detected on this device.",
      "no-recorder": "Voice check-off isn't supported on this browser.",
      network: "Couldn't reach the transcription server. Check your connection.",
      server: "Transcription failed — try again or tap the item to check it.",
    };
    const durations = { permission: 6000, "no-mic": 4000, "no-recorder": 4000, network: 4000, server: 4000 };
    hotToast.error(messages[reason] || "Couldn't transcribe.", { duration: durations[reason] || 4000 });
  }, []);

  const voice = useHoldToTalk({
    endpoint: ENDPOINTS.transcribeGroceryItem,
    onResult: handleVoiceResult,
    onError: handleVoiceError,
  });

  // Totals + trip summary trigger. `totalChecked` intersects the raw checked
  // set against the items actually on the list — this makes the counter
  // resilient to stale shopping_progress rows (items that were once checked
  // but have since been removed from the weekly list).
  const totalItems = shoppingList ? shoppingList.items.length : 0;
  const totalChecked = useMemo(() => {
    if (!shoppingList) return 0;
    return shoppingList.items.reduce(
      (n, i) => (checkedItems.has(i.ItemID.toString()) ? n + 1 : n),
      0
    );
  }, [shoppingList, checkedItems]);
  const allDone = totalItems > 0 && shoppingList.items.every(
    (i) => checkedItems.has(String(i.ItemID))
  );

  useEffect(() => {
    if (allDone && !celebratedRef.current) {
      celebratedRef.current = true;
      setTimeout(() => setShowTripSummary(true), 800);
    }
    if (!allDone) {
      celebratedRef.current = false;
      setShowTripSummary(false);
    }
  }, [allDone]);

  // --- Live sync polling ---
  // Polls shopping_progress every 4s so two devices (host + invited partner)
  // see each other's check-offs within ~5s. Only runs during an active
  // partner session — solo shoppers get no benefit from the poll, only the
  // risk of a stale snapshot reverting a slow check-off. The snapshot is
  // merged over pending (unacknowledged) local mutations, never replacing
  // them. Stops when tab is hidden to save battery.
  useEffect(() => {
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

  const couponSavingsTotal = useMemo(() => {
    if (!shoppingList?.items || !couponLookup) return 0;
    return shoppingList.items.reduce((sum, item) => {
      if (checkedItems.has(item.ItemID.toString())) {
        const match = couponLookup[item.ItemName?.toLowerCase()];
        if (match?.couponSavings) return sum + parseFloat(match.couponSavings);
      }
      return sum;
    }, 0);
  }, [shoppingList, checkedItems, couponLookup]);

  const sectionsCleared = useMemo(
    () => grouped.filter((s) => s.checkedCount === s.totalCount && s.totalCount > 0).length,
    [grouped]
  );

  const handleExit = useCallback(() => {
    if (totalChecked > 0 && totalChecked < totalItems) {
      const confirmed = window.confirm(
        `You still have ${totalItems - totalChecked} item${
          totalItems - totalChecked === 1 ? "" : "s"
        } unchecked. Exit shopping mode?`
      );
      if (!confirmed) return;
    }
    onExit();
  }, [totalChecked, totalItems, onExit]);

  // Loading state
  if (isAutoLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="sticky top-0 z-10 bg-surface shadow-sm">
          <div className="flex items-center gap-3 px-4 h-14">
            <button
              onClick={onExit}
              className="p-2 -ml-2 rounded-xl text-body hover:text-heading hover:bg-background transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-lg font-bold font-display text-heading">Shopping List</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-primary mx-auto mb-3" />
            <p className="text-body">Loading this week's grocery list...</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!shoppingList || !shoppingList.items || shoppingList.items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="sticky top-0 z-10 bg-surface shadow-sm">
          <div className="flex items-center gap-3 px-4 h-14">
            <button
              onClick={onExit}
              className="p-2 -ml-2 rounded-xl text-body hover:text-heading hover:bg-background transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-lg font-bold font-display text-heading">Shopping List</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon={ShoppingBag}
            title="No Shopping List"
            description="No items selected for this week yet. Add items to your grocery list first."
            action={{ label: "Go to Grocery Selection", onClick: onExit }}
          />
        </div>
      </div>
    );
  }

  const itemsLeft = totalItems - totalChecked;

  return (
    <div data-testid="shop-screen" className="min-h-screen bg-background flex flex-col relative">
      {/* Header + (reorder drawer when editing walk order) */}
      <div className="sticky top-0 z-20 bg-surface">
        {/* Top row */}
        <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-default relative">
          <button
            type="button"
            onClick={handleExit}
            aria-label="Go back"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-body hover:text-heading hover:bg-background transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          <ProgressRing checked={totalChecked} total={totalItems} />
          <div className="flex-1 min-w-0 text-[14px] font-semibold text-heading truncate">
            {itemsLeft === 0 ? "All done!" : `${itemsLeft} item${itemsLeft === 1 ? "" : "s"} left`}
            {elapsedMinutes > 0 && (
              <span className="ml-2 text-[11px] font-normal text-muted">
                · {elapsedMinutes}m
              </span>
            )}
          </div>
          <button
            type="button"
            onPointerDown={voice.start}
            onPointerUp={voice.stop}
            onPointerLeave={voice.cancel}
            onPointerCancel={voice.cancel}
            // Prevent the browser's long-press context menu / text selection
            // on touch devices.
            onContextMenu={(e) => e.preventDefault()}
            aria-label={
              voice.blockedReason === "permission"
                ? "Microphone blocked — tap for help"
                : voice.blockedReason === "no-mic"
                  ? "No microphone detected"
                  : voice.blockedReason === "no-recorder"
                    ? "Voice not supported on this browser"
                    : "Hold to voice-check item"
            }
            title="Hold to voice-check item"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all touch-none select-none ${
              voice.blockedReason
                ? "bg-danger/10 text-danger"
                : voice.state === "recording"
                  ? "bg-danger text-white scale-110"
                  : voice.state === "transcribing"
                    ? "bg-primary-light text-primary"
                    : "hover:bg-background text-body"
            }`}
          >
            {voice.blockedReason ? (
              <MicOff size={18} />
            ) : voice.state === "transcribing" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Mic size={18} />
            )}
          </button>
          <button
            ref={menuTriggerRef}
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            aria-label="More"
            aria-expanded={showMenu}
            aria-haspopup="menu"
            aria-controls="shop-mode-menu"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-body hover:text-heading hover:bg-background transition-colors"
          >
            <MoreHorizontal size={20} />
          </button>

          <AnimatePresence>
            {showMenu && (
              <ModeMenu
                onReorder={() => {
                  setEditOrder((v) => !v);
                  setShowMenu(false);
                }}
                onInvite={() => {
                  setShowMenu(false);
                  menuTriggerRef.current?.focus({ preventScroll: true });
                  setShowInvite(true);
                }}
                onFeedback={() => {
                  setShowMenu(false);
                  menuTriggerRef.current?.focus({ preventScroll: true });
                  openFeedback({ returnFocusTo: menuTriggerRef.current });
                }}
                onClose={() => setShowMenu(false)}
                wakeLockActive={wakeLockActive}
                triggerRef={menuTriggerRef}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Reorder drawer shown when editing walk order */}
        {editOrder && (
          <ReorderDrawer
            sections={grouped}
            onMoveUp={handleMoveUp}
            onClose={() => setEditOrder(false)}
          />
        )}
      </div>

      {/* Scroll content — all aisles as collapsible sections, in walk order */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-24">
        {partnerSession && (
          <PartnerBadge role={partnerSession.role} expiresAt={partnerSession.expires_at} />
        )}

        {grouped.map((section) => (
          <AisleSection
            key={section.name}
            section={section}
            collapsed={collapsedSections.has(section.name)}
            onToggle={toggleSection}
            checkedItems={checkedItems}
            couponLookup={couponLookup}
            onItemToggle={handleToggleItem}
          />
        ))}

        {couponLoadFailed && (
          <div className="mt-4 px-2 text-xs text-muted flex items-center gap-1.5">
            <AlertCircle size={12} />
            Coupon reminders unavailable
          </div>
        )}
      </div>

      {/* Undo toast */}
      <AnimatePresence>
        {toast && <UndoToast itemName={toast.itemName} onUndo={handleUndo} />}
      </AnimatePresence>

      {/* Invite partner modal */}
      <AnimatePresence>
        {showInvite && (
          <InviteModal
            weekStartDate={shoppingList?.weekStartDate}
            returnFocusRef={menuTriggerRef}
            onClose={() => {
              setShowInvite(false);
              // Surface the presence badge as soon as the host has copied a link.
              const joined = readJoinedSession();
              if (joined) {
                setPartnerSession({ ...joined, role: "partner" });
                return;
              }
              const hosted = readHostSession();
              setPartnerSession(hosted ? { ...hosted, role: "host" } : null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Trip summary overlay */}
      <AnimatePresence>
        {showTripSummary && (
          <TripSummaryCard
            totalItems={totalItems}
            sectionsCleared={sectionsCleared}
            totalSections={grouped.length}
            shoppingMinutes={Math.round((Date.now() - startTimeRef.current) / 60000)}
            couponSavings={couponSavingsTotal}
            onExit={onExit}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

export default InStoreMode;
