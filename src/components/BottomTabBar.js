import React from "react";
import { ClipboardList, UtensilsCrossed, Tag, Store, ShoppingBag, ChefHat } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Mobile bottom tab bar — 6 tabs for the weekly flow.
 *
 * Tabs: Plan | Meals | Deals | Cart | Shop | Cook
 *
 * Home is accessed via the header logo, not a tab.
 */

const TABS = [
  { id: "plan", label: "Plan", icon: ClipboardList },
  { id: "meals", label: "Meals", icon: UtensilsCrossed },
  { id: "deals", label: "Deals", icon: Tag },
  { id: "cart", label: "Cart", icon: Store },
  { id: "shop", label: "Shop", icon: ShoppingBag },
  { id: "cook", label: "Cook", icon: ChefHat },
];

// Map legacy screen IDs to their parent tab for active-state highlighting
const SCREEN_TO_TAB = {
  // New IDs
  plan: "plan",
  meals: "meals",
  deals: "deals",
  cart: "cart",
  shop: "shop",
  cook: "cook",
  // Legacy IDs (still routable during transition)
  grocery: "plan",
  chatbot: "meals",
  "meal-creator": "meals",
  "recipe-ingredients": "meals",
  "smart-deals": "deals",
  coupons: "deals",
  "heb-cart": "cart",
  "in-store": "shop",
  "recipe-instructions": "cook",
};

const BottomTabBar = ({ currentScreen, onNavigate }) => {
  const activeTabId = SCREEN_TO_TAB[currentScreen] || null;

  return (
    <div className="shrink-0 lg:hidden">
      <div
        className="bg-surface border-t border-default"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-around px-2 pt-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTabId === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl min-w-[52px] min-h-[44px] transition-all duration-200 relative ${
                  isActive
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
