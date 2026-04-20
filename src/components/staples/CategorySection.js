import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ItemRow from './ItemRow';

const CategorySection = ({ group, selected, onToggle, onToggleAll }) => {
  const selectedCount = group.items.filter((i) => selected.has(i.ItemID)).length;
  const total = group.items.length;
  const allSelected = total > 0 && selectedCount === total;
  const [expanded, setExpanded] = useState(selectedCount > 0);

  return (
    <div className="mb-3">
      <div className="flex items-center bg-background">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex-1 flex items-center gap-2 py-2 text-left"
        >
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
          {expanded ? (
            <ChevronUp size={16} className="text-muted" />
          ) : (
            <ChevronDown size={16} className="text-muted" />
          )}
        </button>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-xs font-medium text-muted hover:text-body px-2 py-1 ml-1 rounded"
        >
          {allSelected ? 'Clear' : 'All'}
        </button>
      </div>
      {expanded && (
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
      )}
    </div>
  );
};

export default CategorySection;
