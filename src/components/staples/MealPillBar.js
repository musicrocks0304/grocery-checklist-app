import React from 'react';
import { List } from 'lucide-react';

const MealPillBar = ({ meals, selected, mealFocus, onFocusChange }) => {
  if (!meals || meals.length === 0) return null;

  return (
    <div className="mb-3 border-b border-default">
      <div
        className="flex items-center gap-1.5 overflow-x-auto py-2 px-0.5"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <button
          type="button"
          onClick={() => onFocusChange(null)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 border transition-colors ${
            mealFocus === null
              ? 'bg-primary-light text-primary border-primary'
              : 'bg-surface text-body border-default hover:border-primary/40'
          }`}
        >
          <List size={11} />
          All items
        </button>
        <div className="w-px h-5 bg-default flex-shrink-0 mx-1" />
        {meals.map((m) => {
          const count = m.itemIds.filter((id) => selected.has(id)).length;
          const active = mealFocus === m.name;
          return (
            <button
              key={m.name}
              type="button"
              onClick={() => onFocusChange(m.name)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 border transition-colors ${
                active
                  ? 'bg-meal-light text-meal border-meal'
                  : 'bg-surface text-body border-default hover:border-meal/40'
              }`}
            >
              {m.name}
              <span className="text-[10px] opacity-75 font-medium">
                {count}/{m.itemIds.length}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MealPillBar;
