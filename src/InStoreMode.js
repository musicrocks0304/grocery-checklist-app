import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  PartyPopper,
  Smartphone,
} from "lucide-react";
import toast from "react-hot-toast";

// Memoized individual shopping item with large tap target
const InStoreItem = React.memo(({ item, isChecked, onToggle }) => {
  return (
    <button
      onClick={() => onToggle(item.ItemID.toString())}
      className={`w-full flex items-center gap-4 px-4 py-3 min-h-[56px] rounded-lg transition-all duration-200 active:scale-[0.98] ${
        isChecked
          ? "bg-gray-50"
          : "bg-white hover:bg-blue-50"
      }`}
    >
      {/* Custom circle checkbox */}
      <div
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
          isChecked
            ? "bg-green-500 border-green-500"
            : "border-gray-300"
        }`}
      >
        {isChecked && <Check size={16} className="text-white" />}
      </div>

      {/* Item name */}
      <span
        className={`flex-1 text-left text-lg transition-all duration-200 ${
          isChecked
            ? "line-through text-gray-400 opacity-50"
            : "text-gray-800 font-medium"
        }`}
      >
        {item.ItemName}
      </span>

      {/* Quantity badge */}
      {item.quantity > 1 && (
        <span
          className={`text-sm font-medium px-2 py-1 rounded flex-shrink-0 transition-all duration-200 ${
            isChecked
              ? "bg-gray-100 text-gray-400"
              : "bg-blue-50 text-blue-600"
          }`}
        >
          x{item.quantity}
        </span>
      )}
    </button>
  );
});

// Section header with collapse toggle and progress
const SectionHeader = ({ name, checkedCount, totalCount, isCollapsed, onToggle }) => {
  const allDone = checkedCount === totalCount && totalCount > 0;

  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        allDone
          ? "bg-green-50 border border-green-200"
          : "bg-gray-50 border border-gray-200"
      }`}
    >
      {/* Section complete indicator */}
      {allDone && (
        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
          <Check size={14} className="text-white" />
        </div>
      )}

      <span
        className={`flex-1 text-left font-bold text-lg ${
          allDone ? "text-green-700" : "text-gray-800"
        }`}
      >
        {name}
      </span>

      {/* Progress count */}
      <span
        className={`text-sm font-medium px-2 py-1 rounded-full ${
          allDone
            ? "bg-green-100 text-green-700"
            : "bg-gray-200 text-gray-600"
        }`}
      >
        {checkedCount}/{totalCount}
      </span>

      {/* Collapse chevron */}
      {isCollapsed ? (
        <ChevronDown size={20} className="text-gray-400 flex-shrink-0" />
      ) : (
        <ChevronUp size={20} className="text-gray-400 flex-shrink-0" />
      )}
    </button>
  );
};

// Thin progress bar
const ProgressBar = ({ checked, total }) => {
  const percentage = total > 0 ? (checked / total) * 100 : 0;

  return (
    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
      <div
        className="h-full bg-green-500 rounded-full transition-all duration-300 ease-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

const InStoreMode = ({ inStoreData, onExit }) => {
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [shoppingList, setShoppingList] = useState(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef(null);
  const celebratedRef = useRef(false);

  // Resolve shopping list from prop or localStorage
  useEffect(() => {
    if (inStoreData && inStoreData.items && inStoreData.items.length > 0) {
      setShoppingList(inStoreData);
    } else {
      const stored = localStorage.getItem("inStoreShoppingList");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.items && parsed.items.length > 0) {
            setShoppingList(parsed);
          }
        } catch {
          // Invalid JSON, ignore
        }
      }
    }
  }, [inStoreData]);

  // Load checked items from localStorage, invalidate if list changed
  useEffect(() => {
    if (!shoppingList) return;

    const stored = localStorage.getItem("inStoreCheckedItems");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.savedAt === shoppingList.savedAt) {
          setCheckedItems(new Set(parsed.checkedIds));
        } else {
          localStorage.removeItem("inStoreCheckedItems");
        }
      } catch {
        localStorage.removeItem("inStoreCheckedItems");
      }
    }
  }, [shoppingList]);

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

  // Toggle an item's checked state
  const handleToggleItem = useCallback(
    (itemId) => {
      setCheckedItems((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }

        // Persist to localStorage
        if (shoppingList) {
          localStorage.setItem(
            "inStoreCheckedItems",
            JSON.stringify({
              savedAt: shoppingList.savedAt,
              checkedIds: Array.from(next),
            })
          );
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
      toast.success("You got everything! Shopping complete!", {
        icon: "🎉",
        duration: 4000,
        style: {
          fontSize: "16px",
          fontWeight: "bold",
        },
      });
    }
    if (!allDone) {
      celebratedRef.current = false;
    }
  }, [allDone]);

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

  // No data fallback
  if (!shoppingList || !shoppingList.items || shoppingList.items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white shadow-sm">
          <div className="flex items-center gap-3 px-4 h-14">
            <button
              onClick={onExit}
              className="p-2 -ml-2 rounded-lg text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-lg font-bold text-gray-800">Shopping List</h1>
          </div>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <ShoppingBag size={64} className="text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-600 mb-2">
              No Shopping List
            </h2>
            <p className="text-gray-500 mb-6">
              Save a grocery list first, then come back to start shopping.
            </p>
            <button
              onClick={onExit}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Go to Grocery Selection
            </button>
          </div>
        </div>
      </div>
    );
  }

  const groupedItems = getGroupedItems();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={handleExit}
            className="p-2 -ml-2 rounded-lg text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>

          <h1 className="flex-1 text-lg font-bold text-gray-800">
            Shopping List
          </h1>

          {/* Wake lock indicator */}
          {wakeLockActive && (
            <Smartphone
              size={16}
              className="text-green-500 flex-shrink-0"
              title="Screen will stay awake"
            />
          )}

          {/* Progress count */}
          <span className="text-sm font-semibold text-gray-600 flex-shrink-0">
            {totalChecked}/{totalItems}
          </span>
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-2">
          <ProgressBar checked={totalChecked} total={totalItems} />
        </div>
      </div>

      {/* Week info */}
      {shoppingList.weekDateRange && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-sm text-gray-500">{shoppingList.weekDateRange}</p>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 px-4 py-3 space-y-4 pb-24">
        {groupedItems.map((section) => (
          <div key={section.name}>
            <SectionHeader
              name={section.name}
              checkedCount={section.checkedCount}
              totalCount={section.totalCount}
              isCollapsed={collapsedSections.has(section.name)}
              onToggle={() => handleToggleSection(section.name)}
            />

            {/* Section items */}
            {!collapsedSections.has(section.name) && (
              <div className="mt-1 space-y-1">
                {section.items.map((item) => (
                  <InStoreItem
                    key={item.ItemID}
                    item={item}
                    isChecked={checkedItems.has(item.ItemID.toString())}
                    onToggle={handleToggleItem}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* All done banner */}
      {allDone && (
        <div className="fixed bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-green-500 to-green-400 p-6 shadow-lg">
          <div className="flex items-center justify-center gap-3 mb-3">
            <PartyPopper size={28} className="text-white" />
            <span className="text-xl font-bold text-white">All Done!</span>
            <PartyPopper size={28} className="text-white" />
          </div>
          <button
            onClick={onExit}
            className="w-full py-3 bg-white text-green-600 rounded-lg font-bold text-lg hover:bg-green-50 transition-colors"
          >
            Return to Grocery List
          </button>
        </div>
      )}
    </div>
  );
};

export default InStoreMode;
