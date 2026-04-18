import React from 'react';
import ItemRow from './ItemRow';

const CategorySection = ({ group, selected, onToggle, onToggleAll }) => {
  const selectedCount = group.items.filter((i) => selected.has(i.ItemID)).length;
  const total = group.items.length;
  const allSelected = total > 0 && selectedCount === total;

  return (
    <div className="mb-3">
      <div className="sticky top-0 z-10 flex items-center gap-2 py-2 bg-background">
        <h2 className="text-sm font-semibold text-heading flex-1 truncate">
          {group.name}
        </h2>
        <span
          className={`text-xs font-semibold ${
            selectedCount > 0 ? 'text-primary' : 'text-muted'
          }`}
        >
          {selectedCount}/{total}
        </span>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-xs font-medium text-muted hover:text-body px-2 py-1 rounded"
        >
          {allSelected ? 'Clear' : 'All'}
        </button>
      </div>
      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        {group.items.map((item, idx) => (
          <ItemRow
            key={item.ItemID}
            item={item}
            checked={selected.has(item.ItemID)}
            onToggle={onToggle}
            divider={idx < group.items.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

export default CategorySection;
