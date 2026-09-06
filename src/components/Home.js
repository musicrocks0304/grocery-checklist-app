import React, { useState, useEffect, useMemo } from "react";
import {
  ClipboardList, Tag, Store, ShoppingBag, ChefHat,
  ArrowRight, TrendingUp, Sparkles, AlertCircle,
  Server, Key, RefreshCw, Scissors, PlayCircle, CheckCircle, Circle, Loader, History,
} from "lucide-react";
import { motion } from "framer-motion";
import { getWeekDates, parseLocalDay } from "../utils/weekDates";
import { TOKENS, THEMES } from "../styles/tokens";
import { staggerContainer, staggerItem } from "../utils/animations";
import { ENDPOINTS, apiJson } from "../config/api";
import { decodeHtmlEntities } from "../utils/text";

const t = THEMES.green;

// ---------------------------------------------------------------------------
// Smart "next step" logic — suggests what to do based on weekly progress
// ---------------------------------------------------------------------------

export function getNextStep({ mealsPlanned, listItems, shoppedCount, dealsChecked, cartBuilt }) {
  if (listItems > 0 && shoppedCount > 0 && shoppedCount < listItems) {
    const remaining = listItems - shoppedCount;
    return {
      label: "Finish shopping",
      screen: "shop",
      sublabel: `${remaining} item${remaining === 1 ? "" : "s"} left on your list`,
    };
  }
  if (listItems > 0 && shoppedCount >= listItems) {
    if (mealsPlanned > 0) {
      return { label: "Time to cook", screen: "cook", sublabel: "Everything's home — pick tonight's recipe" };
    }
    return { label: "Shopping done", screen: "plan", sublabel: "Start next week's list whenever you're ready" };
  }
  if (listItems === 0) {
    return {
      label: "Build your list",
      screen: "plan",
      sublabel: mealsPlanned === 0 ? "Pick staples or plan meals to get started" : "Add this week's items to your list",
    };
  }
  if (dealsChecked === false) {
    return { label: "Check Deals", screen: "deals", sublabel: "See coupons matching your list" };
  }
  if (cartBuilt === false) {
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
// Prep for Shopping — step definitions
// ---------------------------------------------------------------------------

const PREP_STEPS = [
  { key: 'docker-check',    label: 'Checking infrastructure',  icon: Server },
  { key: 'session-check',   label: 'Checking HEB session',     icon: Key },
  { key: 'scrape-frequent', label: 'Scraping frequent items',  icon: RefreshCw },
  { key: 'scrape-coupons',  label: 'Scraping coupons',         icon: Tag },
  { key: 'scrape-history',  label: 'Scraping purchase history', icon: History },
  { key: 'clip-session',    label: 'Starting clip server',     icon: Scissors },
  { key: 'done',            label: 'Ready to shop!',           icon: CheckCircle },
];

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
  const [shoppedCount, setShoppedCount] = useState(0);
  const [fetchError, setFetchError] = useState(false);

  // Prep job state — null | { status, jobId, currentStep, summary, error }
  const [prepJob, setPrepJob] = useState(null);

  // Load weekly status from existing endpoints
  useEffect(() => {
    const fetchList = async () => {
      try {
        const weekData = getWeekDates();
        const url = new URL(ENDPOINTS.fetchGroceryItems);
        url.searchParams.append("weekStartDate", weekData.startDate);
        url.searchParams.append("weekEndDate", weekData.endDate);
        url.searchParams.append("weekDateRange", weekData.displayRange);
        const data = await apiJson(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const items = Array.isArray(data) ? data : [];
        setListItems(items.length);
        setSelectedCount(items.filter(i => i.IsSelected === 1).length);
      } catch {
        setFetchError(true);
        setListItems(0);
      }
    };

    // Fetch top smart deals
    const fetchDeals = async () => {
      try {
        const data = await apiJson(ENDPOINTS.smartDeals, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          timeout: 15000,
          retries: 0,
        });
        const result = (Array.isArray(data) ? data[0] : data) || {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const allDeals = (result.deals || []).filter(d => {
          if (d.coupon?.clippedStatus === 1) return false; // already clipped
          if (!d.coupon?.expirationDate) return true;
          return parseLocalDay(d.coupon.expirationDate) >= today;
        });
        const deals = allDeals.slice(0, 3);
        const totalSavings = allDeals.reduce((s, d) => s + (d.coupon?.savingsAmount || 0), 0);
        setTopDeals({ deals, totalSavings: Math.round(totalSavings * 100) / 100, totalCount: allDeals.length });
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
        const data = await apiJson(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        setMealsCount(Array.isArray(data) ? data.length : 0);
      } catch {
        // Fall back to selectedMeals prop count
        setMealsCount(null);
      }
    };

    // Fetch shopping progress so Home can show how many items have been
    // checked off in-store — same source of truth as In-Store Mode.
    const fetchShoppingProgress = async () => {
      try {
        const weekData = getWeekDates();
        const url = new URL(ENDPOINTS.shoppingProgress);
        url.searchParams.append("week_start_date", weekData.startDate);
        // Backend JOINs shopping_progress with WeeklyGroceryList on
        // WeekDateRange, so this param is now required.
        url.searchParams.append("week_date_range", weekData.displayRange);
        const data = await apiJson(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          timeout: 8000,
          retries: 1,
        });
        setShoppedCount(Array.isArray(data) ? data.length : 0);
      } catch {
        /* silent — stat just won't show */
      }
    };

    fetchList();
    fetchDeals();
    fetchMeals();
    fetchShoppingProgress();
  }, []);

  // Prep: start a new prep job
  const startPrep = async () => {
    try {
      setPrepJob({ status: 'starting' });
      const data = await apiJson(ENDPOINTS.groceryPrep, { method: 'POST', retries: 0, timeout: 30000 });
      if (!data?.jobId) throw new Error('Prep did not return a job id');
      setPrepJob({ jobId: data.jobId, status: 'running', currentStep: 'docker-check' });
    } catch (err) {
      setPrepJob({ status: 'error', error: err.message });
    }
  };

  // Prep: poll for status every 3 seconds while running
  useEffect(() => {
    if (!prepJob?.jobId || prepJob.status !== 'running') return;

    // Hard cap: if the job never reaches a terminal status (server crash,
    // stranded row), stop spinning forever and tell the user.
    const startedAt = Date.now();
    const MAX_POLL_MS = 15 * 60 * 1000;

    const interval = setInterval(async () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        setPrepJob(prev => ({
          ...prev,
          status: 'error',
          error: 'Prep is taking longer than 15 minutes — the job may be stuck. Check the servers and retry.',
        }));
        return;
      }
      try {
        const url = new URL(ENDPOINTS.groceryPrepStatus);
        url.searchParams.append('jobId', prepJob.jobId);
        const data = await apiJson(url.toString(), { retries: 0, timeout: 8000 });

        if (data.status === 'completed') {
          setPrepJob(prev => ({ ...prev, status: 'completed', summary: data.summary, currentStep: 'done' }));
        } else if (data.status === 'failed') {
          setPrepJob(prev => ({ ...prev, status: 'error', error: data.error_message }));
        } else {
          let sessionExpired = false;
          try { sessionExpired = data.session_result ? !JSON.parse(data.session_result).valid : false; } catch { /* ignore */ }
          setPrepJob(prev => ({ ...prev, currentStep: data.current_step, sessionExpired: prev.sessionExpired || sessionExpired }));
        }
      } catch {
        // Silently retry on network error
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [prepJob?.jobId, prepJob?.status]);

  // Week boundary detection lives in App.js now (covers every screen, not
  // just Home).

  // Prefer backend meal count; fall back to selectedMeals prop (localStorage)
  const resolvedMeals = mealsCount !== null ? mealsCount : selectedMeals.length;

  const weeklyStatus = useMemo(() => ({
    mealsPlanned: resolvedMeals,
    listItems: selectedCount,
    shoppedCount,
    dealsChecked: topDeals !== null,
    cartBuilt: false, // Would need HEB session status — skip for now
  }), [resolvedMeals, selectedCount, shoppedCount, topDeals]);

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
              {shoppedCount > 0 && selectedCount > 0 && (
                <div className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-[70px]">
                  <div className="text-xl font-bold">{shoppedCount}/{selectedCount}</div>
                  <div className="text-xs text-white/70">Shopped</div>
                </div>
              )}
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

        {/* Prep for Shopping card */}
        <motion.div variants={staggerItem} className={`${TOKENS.cardBase} p-4`}>
          {(!prepJob || prepJob.status === 'starting') && (
            <button
              onClick={startPrep}
              disabled={prepJob?.status === 'starting'}
              className="w-full flex items-center gap-4 text-left"
            >
              <div className="p-3 rounded-xl bg-primary-light flex-shrink-0">
                <PlayCircle size={24} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-heading">Prep for Shopping</h3>
                <p className={TOKENS.caption}>Check infrastructure, scrape deals, get ready</p>
              </div>
              {prepJob?.status === 'starting' ? (
                <Loader size={20} className="text-muted flex-shrink-0 animate-spin" />
              ) : (
                <ArrowRight size={20} className="text-muted flex-shrink-0" />
              )}
            </button>
          )}

          {prepJob?.status === 'running' && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Loader size={16} className="text-primary animate-spin" />
                <h3 className="text-sm font-semibold text-heading">Prepping for Shopping…</h3>
              </div>
              <div className="space-y-2">
                {PREP_STEPS.map((step, i) => {
                  const currentIndex = PREP_STEPS.findIndex(s => s.key === prepJob.currentStep);
                  const isDone = i < currentIndex;
                  const isActive = i === currentIndex;
                  const StepIcon = step.icon;
                  return (
                    <div key={step.key} className="flex items-center gap-3">
                      <StepIcon size={16} className={isDone ? 'text-primary' : isActive ? 'text-primary' : 'text-muted'} />
                      <span className={`text-sm flex-1 ${isDone || isActive ? 'text-heading' : 'text-muted'}`}>
                        {step.label}
                      </span>
                      {isDone && <CheckCircle size={16} className="text-primary flex-shrink-0" />}
                      {isActive && <Loader size={16} className="text-primary flex-shrink-0 animate-spin" />}
                      {!isDone && !isActive && <Circle size={16} className="text-muted flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>
              {prepJob.sessionExpired && (
                <div className="mt-3 flex items-start gap-2 bg-danger-light border border-danger rounded-xl px-3 py-2">
                  <AlertCircle size={14} className="text-danger mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-danger">
                    <p className="font-semibold">HEB session expired.</p>
                    <a
                      href="https://heb-login.needexcelexpert.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 font-semibold underline"
                    >
                      Open Remote Login <ArrowRight size={12} />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {prepJob?.status === 'completed' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                {prepJob.summary?.sessionExpired ? (
                  <AlertCircle size={18} className="text-danger" />
                ) : (
                  <CheckCircle size={18} className="text-primary" />
                )}
                <h3 className="text-sm font-semibold text-heading">
                  {prepJob.summary?.sessionExpired ? 'Login Required Before Shopping' : 'Ready to Shop!'}
                </h3>
              </div>
              {prepJob.summary?.sessionExpired && (
                <div className="mb-3 flex items-start gap-2 bg-danger-light border border-danger rounded-xl px-3 py-2">
                  <AlertCircle size={14} className="text-danger mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-danger">
                    <p className="font-semibold">HEB session expired — coupon clipping and cart actions will fail until you re-authenticate.</p>
                    <a
                      href="https://heb-login.needexcelexpert.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 font-semibold underline"
                    >
                      Open Remote Login <ArrowRight size={12} />
                    </a>
                  </div>
                </div>
              )}
              {prepJob.summary && (
                <div className="mb-2 text-xs text-muted space-y-0.5">
                  {prepJob.summary.frequent?.output && (
                    <p>{prepJob.summary.frequent.output.split('\n').filter(l => l.includes('new') || l.includes('updated') || l.includes('total')).slice(-1)[0] || 'Frequent items scraped'}</p>
                  )}
                  {prepJob.summary.coupons?.output && (
                    <p>{prepJob.summary.coupons.output.split('\n').filter(l => l.includes('new') || l.includes('updated') || l.includes('total')).slice(-1)[0] || 'Coupons scraped'}</p>
                  )}
                </div>
              )}
              <button
                onClick={() => setPrepJob(null)}
                className={`${TOKENS.btnBase} ${TOKENS.btnSm} ${TOKENS.btnSecondary} mt-1`}
              >
                Dismiss
              </button>
            </div>
          )}

          {prepJob?.status === 'error' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={18} className="text-danger" />
                <h3 className="text-sm font-semibold text-heading">Prep Failed</h3>
              </div>
              {prepJob.error && (
                <p className="text-xs text-muted mb-3">{prepJob.error}</p>
              )}
              <button
                onClick={startPrep}
                className={`${TOKENS.btnBase} ${TOKENS.btnSm} bg-primary text-white hover:bg-primary-hover`}
              >
                Retry
              </button>
            </div>
          )}
        </motion.div>

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
                      {decodeHtmlEntities(deal.frequentProduct?.name)}
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
