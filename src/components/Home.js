import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ClipboardList, Tag, Store, ShoppingBag, ChefHat,
  ArrowRight, TrendingUp, Sparkles, AlertCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { getWeekDates } from "../utils/weekDates";
import { TOKENS, THEMES } from "../styles/tokens";
import { staggerContainer, staggerItem } from "../utils/animations";
import { ENDPOINTS, apiFetch } from "../config/api";

const t = THEMES.green;

// ---------------------------------------------------------------------------
// Smart "next step" logic — suggests what to do based on weekly progress
// ---------------------------------------------------------------------------

function getNextStep(status) {
  if (status.mealsPlanned === 0) {
    return { label: "Plan Your Meals", screen: "plan", sublabel: "Start by planning this week's meals" };
  }
  if (status.listItems === 0) {
    return { label: "Build Grocery List", screen: "plan", sublabel: "Add items to your weekly list" };
  }
  if (status.dealsChecked === false) {
    return { label: "Check Deals", screen: "deals", sublabel: "See coupons matching your list" };
  }
  if (status.cartBuilt === false) {
    return { label: "Build HEB Cart", screen: "cart", sublabel: "Match items and fill your cart" };
  }
  return { label: "Ready to Shop!", screen: "shop", sublabel: "Your list is ready — head to the store" };
}

const StatBadgeSkeleton = () => (
  <div className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-[70px]">
    <div className="h-7 w-8 mx-auto bg-white/30 rounded animate-pulse mb-1" />
    <div className="h-3 w-10 mx-auto bg-white/20 rounded animate-pulse" />
  </div>
);

// ---------------------------------------------------------------------------
// Home dashboard
// ---------------------------------------------------------------------------

const Home = ({ onNavigate, selectedMeals = [] }) => {
  const { displayRange } = getWeekDates();

  // Weekly status data
  const [listItems, setListItems] = useState(null); // null = loading
  const [selectedCount, setSelectedCount] = useState(0);
  const [mealsCount, setMealsCount] = useState(null); // null = loading, falls back to prop
  const [topDeals, setTopDeals] = useState(null);
  const [fetchError, setFetchError] = useState(false);

  // Load weekly status from existing endpoints
  useEffect(() => {
    // Fetch grocery items for this week (GET with query params, matching GroceryChecklist)
    const fetchList = async () => {
      try {
        const weekData = getWeekDates();
        const url = new URL(ENDPOINTS.fetchGroceryItems);
        url.searchParams.append("weekStartDate", weekData.startDate);
        url.searchParams.append("weekEndDate", weekData.endDate);
        url.searchParams.append("weekDateRange", weekData.displayRange);
        const response = await apiFetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          const data = await response.json();
          const items = Array.isArray(data) ? data : [];
          setListItems(items.length);
          setSelectedCount(items.filter(i => i.IsSelected === 1).length);
        }
      } catch {
        setFetchError(true);
        setListItems(0);
      }
    };

    // Fetch top smart deals
    const fetchDeals = async () => {
      try {
        const response = await apiFetch(ENDPOINTS.smartDeals, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          timeout: 15000,
        });
        if (response.ok) {
          const data = await response.json();
          const result = Array.isArray(data) ? data[0] : data;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const allDeals = (result.deals || []).filter(d => {
            if (!d.coupon?.expirationDate) return true;
            return new Date(d.coupon.expirationDate) >= today;
          });
          const deals = allDeals.slice(0, 3);
          const totalSavings = allDeals.reduce((s, d) => s + (d.coupon?.savingsAmount || 0), 0);
          setTopDeals({ deals, totalSavings: Math.round(totalSavings * 100) / 100, totalCount: allDeals.length });
        }
      } catch { /* silent */ }
    };

    // Fetch weekly meal selections from backend (same endpoint as RecipeInstructions)
    const fetchMeals = async () => {
      try {
        const weekData = getWeekDates();
        const url = new URL(ENDPOINTS.chooseRecipeInstructions);
        url.searchParams.append("weekStartDate", weekData.startDate);
        url.searchParams.append("weekEndDate", weekData.endDate);
        url.searchParams.append("weekDateRange", weekData.displayRange);
        const response = await apiFetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          const data = await response.json();
          setMealsCount(Array.isArray(data) ? data.length : 0);
        }
      } catch {
        // Fall back to selectedMeals prop count
        setMealsCount(null);
      }
    };

    fetchList();
    fetchDeals();
    fetchMeals();
  }, []);

  // Week boundary detection — auto-refresh if the week rolls over while page is open
  const weekStartRef = useRef(getWeekDates().startDate);
  useEffect(() => {
    const checkWeekBoundary = setInterval(() => {
      const currentStart = getWeekDates().startDate;
      if (currentStart !== weekStartRef.current) {
        weekStartRef.current = currentStart;
        window.location.reload();
      }
    }, 60000);

    return () => clearInterval(checkWeekBoundary);
  }, []);

  // Prefer backend meal count; fall back to selectedMeals prop (localStorage)
  const resolvedMeals = mealsCount !== null ? mealsCount : selectedMeals.length;

  const weeklyStatus = useMemo(() => ({
    mealsPlanned: resolvedMeals,
    listItems: selectedCount,
    dealsChecked: topDeals !== null,
    cartBuilt: false, // Would need HEB session status — skip for now
  }), [resolvedMeals, selectedCount, topDeals]);

  const nextStep = getNextStep(weeklyStatus);

  return (
    <div className={`${TOKENS.containerPadding} ${TOKENS.maxWidth}`}>
      {/* Header */}
      <div className={`${t.headerGradient} rounded-2xl p-6 mb-6`}>
        <h1 className="text-2xl font-bold font-display mb-1">Grocery Planner</h1>
        <p className="text-white/80 text-sm">{displayRange}</p>

        {/* Offline warning */}
        {fetchError && (
          <div className="mt-2 flex items-center gap-2 bg-white/15 rounded-lg px-3 py-1.5 text-xs text-white/90">
            <AlertCircle size={14} />
            Couldn't load latest data — showing cached info
          </div>
        )}

        {/* Progress summary */}
        <div className="flex gap-4 mt-4 flex-wrap">
          {listItems === null ? (
            <>
              <StatBadgeSkeleton />
              <StatBadgeSkeleton />
            </>
          ) : (
            <>
              <div className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-[70px]">
                <div className="text-xl font-bold">{resolvedMeals}</div>
                <div className="text-xs text-white/70">Meals</div>
              </div>
              <div className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-[70px]">
                <div className="text-xl font-bold">{selectedCount}</div>
                <div className="text-xs text-white/70">Items</div>
              </div>
            </>
          )}
          {!topDeals && listItems !== null ? (
            <StatBadgeSkeleton />
          ) : topDeals ? (
            <>
              <div className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-[70px]">
                <div className="text-xl font-bold">{topDeals.totalCount}</div>
                <div className="text-xs text-white/70">Deals</div>
              </div>
              {topDeals.totalSavings > 0 && (
                <div className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-[70px]">
                  <div className="text-xl font-bold">${topDeals.totalSavings.toFixed(0)}</div>
                  <div className="text-xs text-white/70">Savings</div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="space-y-4"
      >
        {/* Next Step CTA */}
        <motion.button
          variants={staggerItem}
          onClick={() => onNavigate(nextStep.screen)}
          className="w-full flex items-center gap-4 p-4 rounded-2xl bg-primary text-white shadow-warm hover:shadow-warm-lg transition-all duration-200"
        >
          <div className="p-3 rounded-xl bg-white/20">
            <Sparkles size={24} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <h3 className="text-base font-semibold">{nextStep.label}</h3>
            <p className="text-sm text-white/70">{nextStep.sublabel}</p>
          </div>
          <ArrowRight size={20} className="flex-shrink-0 text-white/70" />
        </motion.button>

        {/* Hot Deals card */}
        {topDeals && topDeals.deals.length > 0 && (
          <motion.div variants={staggerItem} className={`${TOKENS.cardBase} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-accent" />
                <h3 className="text-sm font-semibold text-heading">Hot Deals</h3>
              </div>
              <button
                onClick={() => onNavigate("deals")}
                className="text-xs font-medium text-primary hover:text-primary-hover flex items-center gap-1"
              >
                See all {topDeals.totalCount} <ArrowRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {topDeals.deals.map((deal, i) => (
                <div key={i} className="flex items-center gap-3">
                  {deal.frequentProduct?.imageUrl ? (
                    <img
                      src={deal.frequentProduct.imageUrl}
                      alt=""
                      className="w-10 h-10 rounded-lg object-contain bg-background flex-shrink-0"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                      <Tag size={16} className="text-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-heading truncate">
                      {deal.frequentProduct?.name}
                    </p>
                    <p className="text-xs text-primary font-semibold">
                      {deal.coupon?.discount || 'Special Offer'}
                    </p>
                  </div>
                  {deal.coupon?.savingsAmount > 0 && (
                    <span className="text-xs font-bold text-primary flex-shrink-0">
                      -${deal.coupon.savingsAmount.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Quick links */}
        <motion.div variants={staggerItem}>
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Quick Access</h3>
        </motion.div>
        {[
          { id: "plan", label: "Plan Meals & List", icon: ClipboardList, description: "Plan meals and build your grocery list" },
          { id: "deals", label: "Browse Deals", icon: Tag, description: "Find coupons and smart deals" },
          { id: "cart", label: "Build HEB Cart", icon: Store, description: "Match items and build your HEB cart" },
          { id: "shop", label: "Shop In-Store", icon: ShoppingBag, description: "Full-screen shopping checklist" },
          { id: "cook", label: "Cook Recipes", icon: ChefHat, description: "Step-by-step recipe instructions" },
        ].map((link) => {
          const Icon = link.icon;
          return (
            <motion.button
              key={link.id}
              variants={staggerItem}
              onClick={() => onNavigate(link.id)}
              className={`${TOKENS.cardBase} w-full flex items-center gap-4 p-4 text-left hover:shadow-warm-lg transition-shadow duration-200`}
            >
              <div className="p-3 rounded-xl bg-primary-light">
                <Icon size={24} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-heading">{link.label}</h3>
                <p className={TOKENS.caption}>{link.description}</p>
              </div>
              <ArrowRight size={20} className="text-muted flex-shrink-0" />
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
};

export default Home;
