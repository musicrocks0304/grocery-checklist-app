import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  PartyPopper,
  Smartphone,
  Loader2,
  Tag,
  AlertCircle,
  Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { modalSpring, staggerContainer, staggerItem, fadeIn } from "../utils/animations";
import { EmptyState } from './ui';
import confetti from "canvas-confetti";
import { getWeekDates } from "../utils/weekDates";
import { ENDPOINTS, apiFetch } from "../config/api";

// Motivational messages based on shopping progress
const getMotivationalMessage = (percentage) => {
  if (percentage === 0) return "Let's go!";
  if (percentage < 25) return "Great start!";
  if (percentage < 50) return "Making progress!";
  if (percentage < 75) return "Over halfway!";
  if (percentage < 90) return "Almost there!";
  if (percentage < 100) return "Final stretch!";
  return "";
};

// Memoized individual shopping item with large tap target
const InStoreItem = React.memo(({ item, isChecked, onToggle, couponMatch }) => {
  return (
    <button
      onClick={() => onToggle(item.ItemID.toString())}
      className={`w-full flex items-center gap-4 px-4 py-3 min-h-[56px] rounded-xl transition-all duration-200 active:scale-[0.98] ${
        isChecked
          ? "bg-background"
          : "bg-surface hover:bg-primary-light"
      }`}
    >
      {/* Custom circle checkbox */}
      <div
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
          isChecked
            ? "bg-primary border-primary"
            : "border-default"
        }`}
      >
        {isChecked && <Check size={16} className="text-white" />}
      </div>

      {/* Item name + coupon reminder */}
      <div className="flex-1 text-left min-w-0">
        <span
          className={`text-lg transition-all duration-200 ${
            isChecked
              ? "line-through text-muted opacity-50"
              : "text-heading font-medium"
          }`}
        >
          {item.ItemName}
        </span>
        {couponMatch && !isChecked && (
          <div className="flex items-center gap-1 mt-0.5">
            <Tag size={12} className="text-accent flex-shrink-0" />
            <span className="text-xs font-medium text-accent truncate">
              {couponMatch.couponDiscount}{couponMatch.couponClipped ? ' (clipped)' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Quantity badge */}
      <span
        className={`text-sm font-medium px-2 py-1 rounded-lg flex-shrink-0 transition-all duration-200 ${
          isChecked
            ? "bg-background text-muted"
            : "bg-primary-light text-primary"
        }`}
      >
        {item.Unit ? `${item.quantity || 1} ${item.Unit}` : `x${item.quantity || 1}`}
      </span>
    </button>
  );
});

// Section header with collapse toggle, progress, and completion animation
const SectionHeader = ({ name, checkedCount, totalCount, isCollapsed, onToggle, justCompleted }) => {
  const allDone = checkedCount === totalCount && totalCount > 0;

  return (
    <motion.button
      onClick={onToggle}
      animate={justCompleted ? {
        boxShadow: [
          '0 0 0px rgba(91,138,114,0)',
          '0 0 16px rgba(91,138,114,0.35)',
          '0 0 0px rgba(91,138,114,0)',
        ],
      } : { boxShadow: '0 0 0px rgba(91,138,114,0)' }}
      transition={{ duration: 1.2, ease: 'easeInOut' }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors duration-200 ${
        allDone
          ? "bg-primary-light border border-primary-border"
          : "bg-background border border-default"
      }`}
    >
      {/* Animated section complete indicator */}
      {allDone && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0"
        >
          <Check size={14} className="text-white" />
        </motion.div>
      )}

      <span
        className={`flex-1 text-left font-bold text-lg ${
          allDone ? "text-primary" : "text-heading"
        }`}
      >
        {name}
      </span>

      {/* Done badge or progress count */}
      {allDone ? (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
          className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary text-white"
        >
          Done!
        </motion.span>
      ) : (
        <span className="text-sm font-medium px-2 py-1 rounded-full bg-default text-body">
          {checkedCount}/{totalCount}
        </span>
      )}

      {/* Collapse chevron */}
      {isCollapsed ? (
        <ChevronDown size={20} className="text-muted flex-shrink-0" />
      ) : (
        <ChevronUp size={20} className="text-muted flex-shrink-0" />
      )}
    </motion.button>
  );
};

// SVG progress ring
const ProgressRing = ({ checked, total }) => {
  const size = 48;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = total > 0 ? (checked / total) * 100 : 0;
  const offset = circumference * (1 - percentage / 100);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold text-heading leading-none">
          {checked}/{total}
        </span>
        <span className="text-[9px] text-muted leading-none mt-0.5">items</span>
      </div>
    </div>
  );
};

// Scrollable aisle quick-jump chips
const AisleChips = ({ sections, onChipClick }) => (
  <div
    className="flex gap-2 px-4 py-2 overflow-x-auto"
    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
  >
    {sections.map((section) => {
      const isComplete = section.checkedCount === section.totalCount && section.totalCount > 0;
      return (
        <button
          key={section.name}
          onClick={() => onChipClick(section.name)}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 min-h-[36px] ${
            isComplete
              ? "bg-primary-light border border-primary-border text-primary"
              : "bg-surface border border-default text-body"
          }`}
        >
          {isComplete && <Check size={12} className="text-primary" />}
          <span className="whitespace-nowrap">
            {isComplete ? section.name : `${section.name} ${section.checkedCount}/${section.totalCount}`}
          </span>
        </button>
      );
    })}
  </div>
);

// Trip summary card overlay
const TripSummaryCard = ({ totalItems, sectionsCleared, totalSections, shoppingMinutes, couponSavings, onExit }) => {
  useEffect(() => {
    const colors = ['#5B8A72', '#7CB896', '#C17849', '#E09565', '#f59e0b'];
    const fire = () => {
      confetti({ particleCount: 80, spread: 70, origin: { x: 0.1, y: 0.6 }, colors });
      confetti({ particleCount: 80, spread: 70, origin: { x: 0.9, y: 0.6 }, colors });
    };
    const t1 = setTimeout(fire, 400);
    const t2 = setTimeout(fire, 700);
    const t3 = setTimeout(() => {
      confetti({ particleCount: 120, spread: 100, origin: { x: 0.5, y: 0.4 }, colors });
    }, 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const stats = [
    { icon: Clock, label: 'Shopping Time', value: shoppingMinutes < 1 ? 'Under 1 min' : `${shoppingMinutes} min` },
    { icon: Check, label: 'Items Checked', value: `${totalItems}` },
    { icon: ShoppingBag, label: 'Aisles Cleared', value: `${sectionsCleared}/${totalSections}` },
  ];
  if (couponSavings > 0) {
    stats.push({ icon: Tag, label: 'Coupon Savings', value: `$${couponSavings.toFixed(2)}` });
  }

  return (
    <motion.div
      {...fadeIn}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <motion.div
        {...modalSpring}
        className="bg-surface rounded-2xl shadow-warm-xl p-6 max-w-sm w-full"
      >
        {/* Header */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
          className="flex items-center justify-center gap-2 mb-6"
        >
          <PartyPopper size={28} className="text-primary" />
          <h2 className="text-2xl font-bold font-display text-heading">All Done!</h2>
          <PartyPopper size={28} className="text-primary" />
        </motion.div>

        {/* Stats */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-3 mb-6"
        >
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                variants={staggerItem}
                className="flex items-center gap-3 p-3 rounded-xl bg-background"
              >
                <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted">{stat.label}</p>
                  <p className="text-lg font-bold text-heading">{stat.value}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Exit button */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.3 }}
          onClick={onExit}
          className="w-full py-3.5 bg-primary text-white rounded-xl font-bold text-lg hover:bg-primary-hover transition-colors min-h-[56px]"
        >
          Return to Planner
        </motion.button>
      </motion.div>
    </motion.div>
  );
};

const InStoreMode = ({ inStoreData, onExit }) => {
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [shoppingList, setShoppingList] = useState(null);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [couponLookup, setCouponLookup] = useState({}); // ItemName → coupon data
  const [couponLoadFailed, setCouponLoadFailed] = useState(false);
  const [showTripSummary, setShowTripSummary] = useState(false);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [recentlyCompletedSection, setRecentlyCompletedSection] = useState(null);
  const wakeLockRef = useRef(null);
  const celebratedRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const autoCollapseTimerRef = useRef(null);
  const sectionRefs = useRef({});

  // Resolve shopping list from prop, localStorage, or auto-fetch from backend
  useEffect(() => {
    // Priority 1: Data passed from "Start Shopping" button
    if (inStoreData && inStoreData.items && inStoreData.items.length > 0) {
      setShoppingList(inStoreData);
      return;
    }

    // Priority 2: Check localStorage for cached data from this week
    const stored = localStorage.getItem("inStoreShoppingList");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.items && parsed.items.length > 0) {
          // Check if the stored list is for the current week
          const weekData = getWeekDates();
          if (parsed.weekStartDate === weekData.startDate) {
            setShoppingList(parsed);
            return;
          }
          // Stale week — clear it and fetch fresh
          localStorage.removeItem("inStoreShoppingList");
          localStorage.removeItem("inStoreCheckedItems");
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Priority 3: Auto-fetch current week's selected items from backend
    const fetchCurrentWeekItems = async () => {
      setIsAutoLoading(true);
      try {
        const weekData = getWeekDates();
        const url = new URL(ENDPOINTS.fetchGroceryItems);
        url.searchParams.append("weekStartDate", weekData.startDate);
        url.searchParams.append("weekEndDate", weekData.endDate);
        url.searchParams.append("weekDateRange", weekData.displayRange);
        url.searchParams.append("timestamp", new Date().toISOString());

        const response = await apiFetch(url.toString(), {
          method: "GET",
          mode: "cors",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) return;

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) return;

        // Filter to only selected items (IsSelected === 1)
        const selectedItems = data
          .filter((item) => item.IsSelected === 1)
          .map((item) => ({
            ...item,
            quantity: item.QuantitySelected || 1,
          }));

        if (selectedItems.length === 0) return;

        const listData = {
          items: selectedItems,
          savedAt: new Date().toISOString(),
          weekDateRange: weekData.displayRange,
          weekStartDate: weekData.startDate,
        };

        setShoppingList(listData);
        // Cache it so it loads instantly next time
        localStorage.setItem("inStoreShoppingList", JSON.stringify(listData));
      } catch (err) {
        console.error("[in-store] Auto-fetch failed:", err.message);
      } finally {
        setIsAutoLoading(false);
      }
    };

    fetchCurrentWeekItems();
  }, [inStoreData]);

  // Load checked items from DB, fall back to localStorage
  useEffect(() => {
    if (!shoppingList) return;

    const loadCheckedItems = async () => {
      try {
        const weekData = getWeekDates();
        const url = new URL(ENDPOINTS.shoppingProgress);
        url.searchParams.append("week_start_date", weekData.startDate);
        const response = await apiFetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          const data = await response.json();
          const checkedIds = Array.isArray(data) ? data.map(row => String(row.item_id)) : [];
          setCheckedItems(new Set(checkedIds));
          return;
        }
      } catch {
        // Fall through to localStorage fallback
      }

      // Offline fallback: try localStorage
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

  // Fetch coupon matches for inline reminders
  useEffect(() => {
    if (!shoppingList?.weekDateRange) return;
    const fetchCoupons = async () => {
      try {
        const url = `${ENDPOINTS.hebWeeklyItems}?weekDateRange=${encodeURIComponent(shoppingList.weekDateRange)}`;
        const response = await apiFetch(url, { timeout: 10000 });
        if (response.ok) {
          const data = await response.json();
          const items = data.items || data || [];
          const lookup = {};
          (Array.isArray(items) ? items : []).forEach(item => {
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
        }
      } catch { setCouponLoadFailed(true); }
    };
    fetchCoupons();
  }, [shoppingList?.weekDateRange]);

  // Screen Wake Lock
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
          setWakeLockActive(true);

          wakeLockRef.current.addEventListener("release", () => {
            setWakeLockActive(false);
          });
        }
      } catch {
        // Wake Lock not supported or denied
      }
    };

    requestWakeLock();

    // Re-acquire on visibility change (browser may release when tab is hidden)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
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

  // Shopping timer — updates every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMinutes(Math.floor((Date.now() - startTimeRef.current) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup auto-collapse timer on unmount
  useEffect(() => {
    return () => {
      if (autoCollapseTimerRef.current) {
        clearTimeout(autoCollapseTimerRef.current);
      }
    };
  }, []);

  // Toggle an item's checked state
  const handleToggleItem = useCallback(
    (itemId) => {
      setCheckedItems((prev) => {
        const next = new Set(prev);
        const isChecking = !next.has(itemId);

        if (isChecking) {
          next.add(itemId);
        } else {
          next.delete(itemId);
        }

        // Persist to DB (fire-and-forget, don't block UI)
        const weekData = getWeekDates();
        const endpoint = isChecking
          ? ENDPOINTS.shoppingProgressCheck
          : ENDPOINTS.shoppingProgressUncheck;
        apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            week_start_date: weekData.startDate,
            item_id: itemId,
          }),
        }).catch(() => {
          // Silently fail — localStorage is backup
        });

        // Also cache to localStorage (offline backup)
        if (shoppingList) {
          localStorage.setItem(
            "inStoreCheckedItems",
            JSON.stringify({
              savedAt: shoppingList.savedAt,
              checkedIds: Array.from(next),
            })
          );
        }

        // Section completion detection (only when checking)
        if (isChecking && shoppingList) {
          const item = shoppingList.items.find(i => i.ItemID.toString() === itemId);
          if (item) {
            const sectionName = item.GroceryStoreSection || 'Other';
            const sectionItems = shoppingList.items.filter(
              i => (i.GroceryStoreSection || 'Other') === sectionName
            );
            const allSectionChecked = sectionItems.every(
              i => next.has(i.ItemID.toString())
            );
            if (allSectionChecked) {
              setRecentlyCompletedSection(sectionName);
              if (autoCollapseTimerRef.current) {
                clearTimeout(autoCollapseTimerRef.current);
              }
              autoCollapseTimerRef.current = setTimeout(() => {
                setCollapsedSections(prev => {
                  const s = new Set(prev);
                  s.add(sectionName);
                  return s;
                });
                setRecentlyCompletedSection(null);
              }, 1200);
            }
          }
        }

        return next;
      });
    },
    [shoppingList]
  );

  // Toggle section collapse
  const handleToggleSection = useCallback((sectionName) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionName)) {
        next.delete(sectionName);
      } else {
        next.add(sectionName);
      }
      return next;
    });
  }, []);

  // Scroll to section from aisle chip
  const handleChipClick = useCallback((sectionName) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.delete(sectionName);
      return next;
    });
    setTimeout(() => {
      sectionRefs.current[sectionName]?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 100);
  }, []);

  // Group items by GroceryStoreSection, sort unchecked first within each group
  const getGroupedItems = useCallback(() => {
    if (!shoppingList || !shoppingList.items) return [];

    const groups = {};
    shoppingList.items.forEach((item) => {
      const section = item.GroceryStoreSection || "Other";
      if (!groups[section]) {
        groups[section] = [];
      }
      groups[section].push(item);
    });

    // Sort sections alphabetically, then sort items within each section
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sectionName, items]) => {
        const unchecked = items
          .filter((item) => !checkedItems.has(item.ItemID.toString()))
          .sort((a, b) => a.ItemName.localeCompare(b.ItemName));
        const checked = items
          .filter((item) => checkedItems.has(item.ItemID.toString()))
          .sort((a, b) => a.ItemName.localeCompare(b.ItemName));

        return {
          name: sectionName,
          items: [...unchecked, ...checked],
          checkedCount: checked.length,
          totalCount: items.length,
        };
      });
  }, [shoppingList, checkedItems]);

  // Celebration when all items checked
  const totalItems = shoppingList ? shoppingList.items.length : 0;
  const totalChecked = checkedItems.size;
  const allDone = totalItems > 0 && totalChecked === totalItems;

  useEffect(() => {
    if (allDone && !celebratedRef.current) {
      celebratedRef.current = true;
      setTimeout(() => {
        setShowTripSummary(true);
      }, 800);
    }
    if (!allDone) {
      celebratedRef.current = false;
      setShowTripSummary(false);
    }
  }, [allDone]);

  // Computed values for trip summary
  const couponSavingsTotal = useMemo(() => {
    if (!shoppingList?.items || !couponLookup) return 0;
    return shoppingList.items.reduce((sum, item) => {
      if (checkedItems.has(item.ItemID.toString())) {
        const match = couponLookup[item.ItemName?.toLowerCase()];
        if (match?.couponSavings) {
          return sum + parseFloat(match.couponSavings);
        }
      }
      return sum;
    }, 0);
  }, [shoppingList, checkedItems, couponLookup]);

  const groupedItems = getGroupedItems();

  const sectionsCleared = useMemo(() => {
    return groupedItems.filter(s => s.checkedCount === s.totalCount && s.totalCount > 0).length;
  }, [groupedItems]);

  // Exit handler with confirmation
  const handleExit = useCallback(() => {
    if (totalChecked > 0 && totalChecked < totalItems) {
      const confirmed = window.confirm(
        `You still have ${totalItems - totalChecked} item${totalItems - totalChecked === 1 ? "" : "s"} unchecked. Exit shopping mode?`
      );
      if (!confirmed) return;
    }
    onExit();
  }, [totalChecked, totalItems, onExit]);

  // Loading state while auto-fetching
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

  // No data fallback
  if (!shoppingList || !shoppingList.items || shoppingList.items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
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

        {/* Empty state */}
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

  const progressPercentage = totalItems > 0 ? (totalChecked / totalItems) * 100 : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-surface shadow-sm">
        {/* Top row: back, ring, message, timer, wake lock */}
        <div className="flex items-center gap-3 px-4 py-2">
          <button
            onClick={handleExit}
            className="p-2 -ml-2 rounded-lg text-body hover:text-heading hover:bg-background transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Go back"
          >
            <ArrowLeft size={24} />
          </button>

          <ProgressRing checked={totalChecked} total={totalItems} />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-heading truncate">
              {getMotivationalMessage(progressPercentage)}
            </p>
            {elapsedMinutes > 0 && (
              <p className="text-xs text-muted flex items-center gap-1">
                <Clock size={10} />
                Shopping for {elapsedMinutes} min
              </p>
            )}
          </div>

          {wakeLockActive && (
            <Smartphone size={16} className="text-primary flex-shrink-0" title="Screen stays awake" />
          )}
        </div>

        {/* Aisle quick-jump chips */}
        <AisleChips sections={groupedItems} onChipClick={handleChipClick} />
      </div>

      {/* Week info */}
      {shoppingList.weekDateRange && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-sm text-muted">{shoppingList.weekDateRange}</p>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 px-4 py-3 space-y-4 pb-24">
        {groupedItems.map((section) => (
          <div
            key={section.name}
            ref={el => { sectionRefs.current[section.name] = el; }}
          >
            <SectionHeader
              name={section.name}
              checkedCount={section.checkedCount}
              totalCount={section.totalCount}
              isCollapsed={collapsedSections.has(section.name)}
              onToggle={() => handleToggleSection(section.name)}
              justCompleted={recentlyCompletedSection === section.name}
            />

            {/* Section items with animated collapse */}
            <AnimatePresence initial={false}>
              {!collapsedSections.has(section.name) && (
                <motion.div
                  key={`items-${section.name}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="mt-1 space-y-1">
                    {section.items.map((item) => (
                      <InStoreItem
                        key={item.ItemID}
                        item={item}
                        isChecked={checkedItems.has(item.ItemID.toString())}
                        onToggle={handleToggleItem}
                        couponMatch={couponLookup[item.ItemName?.toLowerCase()]}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
        {couponLoadFailed && (
          <div className="px-4 py-2 text-xs text-muted flex items-center gap-1.5">
            <AlertCircle size={12} />
            Coupon reminders unavailable
          </div>
        )}
      </div>

      {/* Trip Summary overlay */}
      <AnimatePresence>
        {showTripSummary && (
          <TripSummaryCard
            totalItems={totalItems}
            sectionsCleared={sectionsCleared}
            totalSections={groupedItems.length}
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
