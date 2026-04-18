import React, { useState } from 'react';
import { ChefHat, ChevronDown, ChevronUp } from 'lucide-react';
import ItemRow from './ItemRow';

const MealsCard = ({ activeMeal, items, selected, onToggle }) => {
  const [expanded, setExpanded] = useState(true);

  const byMeal = {};
  for (const it of items) {
    const key = it.MealName || 'Unknown';
    (byMeal[key] = byMeal[key] || []).push(it);
  }

  const mealNames = activeMeal ? [activeMeal] : Object.keys(byMeal);
  const totalItems = items.length;
  const doneCount = items.filter((i) => selected.has(i.ItemID)).length;
  const hideHeader = !!activeMeal;

  return (
    <div className="mb-3 bg-surface border border-meal/40 rounded-xl overflow-hidden">
      {!hideHeader && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        >
          <ChefHat size={13} className="text-meal flex-shrink-0" />
          <span className="flex-1 text-xs font-bold uppercase tracking-wide text-meal">
            From your meals
          </span>
          <span className="text-xs font-semibold text-meal opacity-85">
            {doneCount}/{totalItems}
          </span>
          {expanded ? (
            <ChevronUp size={16} className="text-meal" />
          ) : (
            <ChevronDown size={16} className="text-meal" />
          )}
        </button>
      )}
      {(hideHeader || expanded) && (
        <div className="p-2">
          {mealNames.map((meal) => {
            const mealItems = byMeal[meal] || [];
            if (mealItems.length === 0) return null;
            return (
              <div key={meal} className="mb-1">
                <div className="px-2 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-meal">
                  {meal.toUpperCase()}
                </div>
                <div className="bg-surface border border-default rounded-lg overflow-hidden">
                  {mealItems.map((it, idx) => (
                    <ItemRow
                      key={it.ItemID}
                      item={it}
                      checked={selected.has(it.ItemID)}
                      onToggle={onToggle}
                      divider={idx < mealItems.length - 1}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MealsCard;
