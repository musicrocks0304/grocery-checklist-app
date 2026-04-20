import React, { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { getWeekDates } from '../utils/weekDates';
import { GROCERY_CATEGORIES } from '../constants/categories';
import InputToolbar from './staples/InputToolbar';
import CategorySection from './staples/CategorySection';
import OneOffCard from './staples/OneOffCard';
import ReviewBar from './staples/ReviewBar';
import MealPillBar from './staples/MealPillBar';
import MealsCard from './staples/MealsCard';

const formatMonthDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
};

// Receives hook data as props so Plan can share state with ReviewScreen.
const StaplesScreen = ({ onReview, staplesHook, mealsHook }) => {
  const { items, selected, loading, toggle, quickAdd, removeOneOff } = staplesHook;
  const { meals: rawMeals } = mealsHook;
  const [mealFocus, setMealFocus] = useState(null);
  const [query, setQuery] = useState('');
  const weekData = getWeekDates();
  const weekCompact = `${formatMonthDay(weekData.startDate)} – ${formatMonthDay(weekData.endDate)}`;

  const { groups, oneOffs, mealItems, mealsWithItemIds } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (i) => !q || i.ItemName.toLowerCase().includes(q);

    // Correlate meal ingredient names with actual items to discover MealName per item.
    // Key: lowercase+trimmed item name → MealName (first match wins if in multiple meals).
    const itemNameToMeal = {};
    for (const m of rawMeals) {
      for (const ingName of m.ingredientNames || []) {
        const key = ingName.trim().toLowerCase();
        if (!itemNameToMeal[key]) itemNameToMeal[key] = m.mealName;
      }
    }

    // MealIngredients items that matched a known meal get a MealName injected.
    // Drop unmatched ones (can't attribute to any meal).
    const enrichedMealItems = items
      .filter((i) => i.DataSource === 'MealIngredients')
      .map((i) => ({
        ...i,
        MealName: itemNameToMeal[i.ItemName.trim().toLowerCase()] || null,
      }))
      .filter((i) => i.MealName !== null);

    // Build meals-with-itemIds for MealPillBar.
    const mealsOut = rawMeals.map((m) => ({
      name: m.mealName,
      itemIds: enrichedMealItems
        .filter((i) => i.MealName === m.mealName && matches(i))
        .map((i) => i.ItemID),
    }));

    const oneOffsList = items.filter((i) => i.DataSource === 'OneOff' && matches(i));
    const stapleItems = items.filter(
      (i) => i.DataSource !== 'OneOff' && i.DataSource !== 'MealIngredients' && matches(i)
    );

    const byCat = {};
    stapleItems.forEach((i) => {
      const key = i.Category || 'Household & other';
      (byCat[key] = byCat[key] || []).push(i);
    });

    const ordered = GROCERY_CATEGORIES
      .filter((c) => byCat[c])
      .map((c) => ({
        name: c,
        items: byCat[c].sort((a, b) => a.ItemName.localeCompare(b.ItemName)),
      }));

    const visibleMealItems = enrichedMealItems.filter(matches);

    return {
      groups: ordered,
      oneOffs: oneOffsList,
      mealItems: visibleMealItems,
      mealsWithItemIds: mealsOut,
    };
  }, [items, query, rawMeals]);

  const handleToggleAll = (group) => {
    const ids = group.items.map((i) => i.ItemID);
    const allSelected = ids.every((id) => selected.has(id));
    ids.forEach((id) => {
      const isOn = selected.has(id);
      if (allSelected && isOn) toggle(id);
      else if (!allSelected && !isOn) toggle(id);
    });
  };

  const totalSelected = selected.size;

  if (loading) {
    return (
      <div className="relative h-full bg-background">
        <div className="flex items-center justify-center h-full">
          <div role="status" className="animate-spin rounded-full h-10 w-10 border-2 border-default border-t-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-background">
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-32">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-6 h-6 rounded-full border-2 border-primary flex items-center justify-center flex-shrink-0">
            <Check size={12} className="text-primary" strokeWidth={3} />
          </div>
          <h1 className="text-lg font-extrabold text-heading">Grocery Staples</h1>
          <span className="ml-auto text-xs font-semibold text-primary px-2.5 py-1 rounded-full bg-primary-light border border-primary-border whitespace-nowrap">
            {weekCompact}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted mb-3">
          <span className="text-heading font-bold">{totalSelected}</span>
          <span>{totalSelected === 1 ? 'item' : 'items'}</span>
        </div>

        <InputToolbar onQuickAdd={quickAdd} onSearchChange={setQuery} />

        <MealPillBar
          meals={mealsWithItemIds}
          selected={selected}
          mealFocus={mealFocus}
          onFocusChange={setMealFocus}
        />

        {/* OneOffs — hidden when focused on a specific meal */}
        {!mealFocus && oneOffs.length > 0 && (
          <OneOffCard
            oneOffs={oneOffs}
            selected={selected}
            onToggle={toggle}
            onRemove={removeOneOff}
          />
        )}

        {/* MealsCard — always visible if there are meal items. Header hidden when a meal pill is active. */}
        {mealItems.length > 0 && (
          <MealsCard
            activeMeal={mealFocus}
            items={mealFocus ? mealItems.filter((i) => i.MealName === mealFocus) : mealItems}
            selected={selected}
            onToggle={toggle}
          />
        )}

        {/* Empty state */}
        {groups.length === 0 && oneOffs.length === 0 && mealItems.length === 0 && (
          <div className="mt-10 text-center text-sm text-muted">
            {query ? `No matches for "${query}"` : 'Nothing on this week\'s list yet'}
          </div>
        )}

        {/* Category sections — hidden when focused on a meal */}
        {!mealFocus && groups.length > 0 && (
          <div className="lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4">
            {groups.map((g) => (
              <CategorySection
                key={g.name}
                group={g}
                selected={selected}
                onToggle={toggle}
                onToggleAll={() => handleToggleAll(g)}
              />
            ))}
          </div>
        )}
      </div>

      <ReviewBar count={totalSelected} onReview={onReview} />
    </div>
  );
};

export default StaplesScreen;
