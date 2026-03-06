import React, { useState, useRef, useEffect } from "react";
import { ShoppingCart, ShoppingBag, UtensilsCrossed, Store, Tag, MessageCircle, Sparkles, ChefHat, BookOpen, Receipt } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { slideUp } from "../utils/animations";

/**
 * Mobile bottom tab bar — 5 tabs grouping 9 screens.
 *
 * Tabs:
 *   1. Groceries → grocery
 *   2. Shop → in-store
 *   3. Meals → chatbot, meal-creator, recipe-instructions, recipe-ingredients
 *   4. Cart → heb-cart
 *   5. Deals → smart-deals, coupons
 */

const TABS = [
  { id: "grocery", label: "Groceries", icon: ShoppingCart },
  { id: "in-store", label: "Shop", icon: ShoppingBag },
  {
    id: "meals",
    label: "Meals",
    icon: UtensilsCrossed,
    children: [
      { id: "chatbot", label: "AI Meal Planner", icon: MessageCircle },
      { id: "meal-creator", label: "AI Meal Creator", icon: Sparkles },
      { id: "recipe-instructions", label: "Recipes", icon: ChefHat },
      { id: "recipe-ingredients", label: "Ingredients", icon: BookOpen },
    ],
  },
  { id: "heb-cart", label: "Cart", icon: Store },
  {
    id: "deals",
    label: "Deals",
    icon: Tag,
    children: [
      { id: "smart-deals", label: "Smart Deals", icon: Tag },
      { id: "coupons", label: "Coupons", icon: Receipt },
    ],
  },
];

// Map screen IDs back to their parent tab
const SCREEN_TO_TAB = {};
TABS.forEach((tab) => {
  if (tab.children) {
    tab.children.forEach((child) => {
      SCREEN_TO_TAB[child.id] = tab.id;
    });
  } else {
    SCREEN_TO_TAB[tab.id] = tab.id;
  }
});

const BottomTabBar = ({ currentScreen, onNavigate }) => {
  const [openPopover, setOpenPopover] = useState(null);
  const popoverRef = useRef(null);

  const activeTabId = SCREEN_TO_TAB[currentScreen] || "grocery";

  // Close popover on outside click
  useEffect(() => {
    if (!openPopover) return;
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpenPopover(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [openPopover]);

  const handleTabClick = (tab) => {
    if (tab.children) {
      setOpenPopover(openPopover === tab.id ? null : tab.id);
    } else {
      setOpenPopover(null);
      onNavigate(tab.id);
    }
  };

  const handleChildClick = (childId) => {
    setOpenPopover(null);
    onNavigate(childId);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden" ref={popoverRef}>
      {/* Popover for grouped tabs */}
      <AnimatePresence>
      {openPopover && (
        <motion.div
          className="absolute bottom-full left-0 right-0 px-3 pb-2"
          initial={slideUp.initial}
          animate={slideUp.animate}
          exit={slideUp.exit}
          transition={slideUp.transition}
        >
          <div className="bg-surface border border-default rounded-2xl shadow-warm-lg p-2 mx-auto max-w-sm">
            {TABS.find((t) => t.id === openPopover)?.children?.map((child) => {
              const Icon = child.icon;
              const isActive = currentScreen === child.id;
              return (
                <button
                  key={child.id}
                  onClick={() => handleChildClick(child.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 min-h-[44px] ${
                    isActive
                      ? "bg-primary-light text-primary font-semibold"
                      : "text-body hover:bg-background"
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-sm font-medium">{child.label}</span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Tab bar */}
      <div
        className="bg-surface/95 backdrop-blur-md border-t border-default"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-around px-2 pt-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTabId === tab.id;
            const isPopoverOpen = openPopover === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab)}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl min-w-[60px] min-h-[44px] transition-all duration-200 relative ${
                  isActive
                    ? "text-primary"
                    : isPopoverOpen
                    ? "text-primary"
                    : "text-muted hover:text-body"
                }`}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-[10px] leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BottomTabBar;
