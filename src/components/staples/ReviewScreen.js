import React, { useMemo, useState } from 'react';
import { ArrowLeft, ShoppingBag, X, Utensils, Package, Tag, Sparkles, Loader } from 'lucide-react';
import { GROCERY_CATEGORIES } from '../../constants/categories';
import { getWeekDates } from '../../utils/weekDates';
import { ENDPOINTS, apiFetch } from '../../config/api';
import CouponMatchPanel from '../CouponMatchPanel';

const formatMonthDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
};

const SectionHeader = ({ icon: Icon, label, count }) => (
  <div className="flex items-center gap-2 mt-5 mb-2 px-1">
    <Icon size={14} className="text-muted" />
    <h2 className="text-xs font-bold uppercase tracking-wider text-muted flex-1">
      {label}
    </h2>
    <span className="text-xs font-semibold text-muted">{count}</span>
  </div>
);

const ReviewRow = ({ item, onRemove }) => (
  <div className="flex items-center gap-3 px-3 py-2.5 min-h-[48px] border-b border-default last:border-b-0">
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-heading truncate">
        {item.ItemName}
      </div>
    </div>
    <button
      type="button"
      onClick={() => onRemove(item)}
      aria-label={`Remove ${item.ItemName}`}
      className="text-muted hover:text-danger p-1.5 rounded-lg hover:bg-background transition-colors flex-shrink-0"
    >
      <X size={16} />
    </button>
  </div>
);

const ReviewScreen = ({
  items,
  selected,
  meals: rawMeals = [],
  onToggle,
  onRemoveOneOff,
  onBack,
  onStartShopping,
}) => {
  const weekData = getWeekDates();
  const weekCompact = `${formatMonthDay(weekData.startDate)} – ${formatMonthDay(weekData.endDate)}`;

  const { oneOffs, mealGroups, categoryGroups, totalCount } = useMemo(() => {
    const isOn = (i) => selected.has(i.ItemID);
    const oneOffsList = items.filter((i) => i.DataSource === 'OneOff' && isOn(i));

    // Correlate meal ingredients to meal names (same logic as StaplesScreen).
    const nameToMeal = {};
    for (const m of rawMeals) {
      for (const ingName of m.ingredientNames || []) {
        const key = ingName.trim().toLowerCase();
        if (!nameToMeal[key]) nameToMeal[key] = m.mealName;
      }
    }

    const mealIngredients = items
      .filter((i) => i.DataSource === 'MealIngredients' && isOn(i))
      .map((i) => ({
        ...i,
        MealName: nameToMeal[i.ItemName.trim().toLowerCase()] || 'Other meal ingredients',
      }));

    const mealsByName = {};
    mealIngredients.forEach((i) => {
      (mealsByName[i.MealName] = mealsByName[i.MealName] || []).push(i);
    });
    const mealList = Object.entries(mealsByName)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => ({
        name,
        items: list.sort((a, b) => a.ItemName.localeCompare(b.ItemName)),
      }));

    const staples = items.filter(
      (i) => i.DataSource !== 'OneOff' && i.DataSource !== 'MealIngredients' && isOn(i)
    );
    const byCat = {};
    staples.forEach((i) => {
      const key = i.Category || 'Household & other';
      (byCat[key] = byCat[key] || []).push(i);
    });
    const catList = GROCERY_CATEGORIES
      .filter((c) => byCat[c])
      .map((c) => ({
        name: c,
        items: byCat[c].sort((a, b) => a.ItemName.localeCompare(b.ItemName)),
      }));

    return {
      oneOffs: oneOffsList,
      mealGroups: mealList,
      categoryGroups: catList,
      totalCount: oneOffsList.length + mealIngredients.length + staples.length,
    };
  }, [items, selected, rawMeals]);

  const handleRemove = (item) => {
    if (item.DataSource === 'OneOff') onRemoveOneOff(item.ItemID);
    else onToggle(item.ItemID);
  };

  // ── Opt-in AI coupon matching (feedback #27) ────────────────────────────
  // 'idle' | 'matching' | 'done' | 'error'
  const [matchState, setMatchState] = useState('idle');
  const [couponMatches, setCouponMatches] = useState(null);

  const findCoupons = async () => {
    setMatchState('matching');
    setCouponMatches(null);
    try {
      const selectedItems = items
        .filter((i) => selected.has(i.ItemID))
        .map((i) => ({ name: i.ItemName, quantity: i.QuantitySelected || 1 }));

      // AI agent run: long timeout, never retry (each run costs 30-60s of LLM
      // tool-calling — the old auto-retry burned 3 runs per timeout, bug #28)
      const res = await apiFetch(ENDPOINTS.matchCoupons, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: selectedItems }),
        timeout: 120000,
        retries: 0,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const payload = Array.isArray(data) ? data[0] : data;
      const matches = payload?.matches || [];
      setCouponMatches(matches);
      setMatchState('done');

      // Persist matches so In-Store Mode coupon chips and the cart builder
      // can use them (fire-and-forget; the panel works without it).
      if (matches.length > 0) {
        apiFetch(ENDPOINTS.saveCouponMatches, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekDateRange: weekData.displayRange,
            matches: matches.map((m) => ({
              groceryItemName: m.grocery_item,
              couponHashId: m.coupon_hash_id,
              confidence: m.confidence,
              matchReason: m.reason,
            })),
          }),
        }).catch(() => {});
      }
    } catch (err) {
      setMatchState('error');
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      <div className="sticky top-0 z-10 bg-surface border-b border-default">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to edit"
            className="p-2 -ml-2 rounded-xl text-body hover:text-heading hover:bg-background transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-heading">Review your list</div>
            <div className="text-xs text-muted">
              {totalCount} {totalCount === 1 ? 'item' : 'items'} · {weekCompact}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 pt-2 pb-32">
          {totalCount === 0 && (
            <div className="mt-16 text-center text-sm text-muted">
              Nothing selected yet. Go back and add some items.
            </div>
          )}

          {oneOffs.length > 0 && (
            <>
              <SectionHeader icon={Tag} label="One-offs this week" count={oneOffs.length} />
              <div className="bg-surface border border-default rounded-xl overflow-hidden">
                {oneOffs.map((item) => (
                  <ReviewRow key={`oneoff-${item.ItemID}`} item={item} onRemove={handleRemove} />
                ))}
              </div>
            </>
          )}

          {mealGroups.length > 0 && (
            <>
              <SectionHeader
                icon={Utensils}
                label="From your meals"
                count={mealGroups.reduce((n, g) => n + g.items.length, 0)}
              />
              {mealGroups.map((g) => (
                <div key={g.name} className="mb-3">
                  <div className="text-[13px] font-semibold text-heading mb-1.5 px-1">
                    {g.name}
                  </div>
                  <div className="bg-surface border border-default rounded-xl overflow-hidden">
                    {g.items.map((item) => (
                      <ReviewRow
                        key={`meal-${item.ItemID}`}
                        item={item}
                        onRemove={handleRemove}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {categoryGroups.length > 0 && (
            <>
              <SectionHeader
                icon={Package}
                label="Staples"
                count={categoryGroups.reduce((n, g) => n + g.items.length, 0)}
              />
              {categoryGroups.map((g) => (
                <div key={g.name} className="mb-3">
                  <div className="text-[13px] font-semibold text-heading mb-1.5 px-1">
                    {g.name}
                  </div>
                  <div className="bg-surface border border-default rounded-xl overflow-hidden">
                    {g.items.map((item) => (
                      <ReviewRow
                        key={`staple-${item.ItemID}`}
                        item={item}
                        onRemove={handleRemove}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Opt-in coupon matching (feedback #27) */}
          {totalCount > 0 && (
            <div className="mt-6">
              {matchState === 'idle' && (
                <button
                  type="button"
                  onClick={findCoupons}
                  className="w-full py-3 rounded-xl border border-primary-border bg-primary-light text-primary font-semibold flex items-center justify-center gap-2 hover:bg-primary hover:text-white transition-colors"
                >
                  <Sparkles size={16} />
                  Find coupons for this list
                  <span className="text-xs font-normal opacity-75">(AI · ~30–60s)</span>
                </button>
              )}
              {matchState === 'matching' && (
                <div className="w-full py-3 rounded-xl border border-default bg-surface text-body font-medium flex items-center justify-center gap-2">
                  <Loader size={16} className="animate-spin" />
                  Matching coupons on HEB… this takes about 30–60 seconds
                </div>
              )}
              {matchState === 'error' && (
                <div className="w-full py-3 px-4 rounded-xl border border-danger bg-surface text-sm text-danger flex items-center justify-between gap-2">
                  <span>Coupon matching failed — you can still shop as normal.</span>
                  <button type="button" onClick={findCoupons} className="font-semibold underline">
                    Retry
                  </button>
                </div>
              )}
              {matchState === 'done' && couponMatches && couponMatches.length === 0 && (
                <div className="w-full py-3 rounded-xl border border-default bg-surface text-sm text-muted text-center">
                  No matching coupons found for this week's list.
                </div>
              )}
              {matchState === 'done' && couponMatches && couponMatches.length > 0 && (
                <CouponMatchPanel
                  matches={couponMatches}
                  onDismiss={() => { setCouponMatches(null); setMatchState('idle'); }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className="absolute left-0 right-0 bottom-0 pt-7 px-4 pb-4"
        style={{
          background:
            'linear-gradient(180deg, transparent, var(--color-background) 40%)',
        }}
      >
        <div className="max-w-3xl mx-auto flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 rounded-xl border border-default bg-surface text-body font-semibold hover:bg-background transition-colors"
          >
            Back to edit
          </button>
          <button
            type="button"
            onClick={onStartShopping}
            disabled={totalCount === 0}
            className="flex-[1.3] py-3 rounded-xl bg-primary text-white hover:bg-primary-hover disabled:bg-muted disabled:cursor-not-allowed font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <ShoppingBag size={18} />
            Start Shopping
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewScreen;
