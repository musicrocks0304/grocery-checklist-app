import React, { useState } from 'react';
import { Zap, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

const OneOffCard = ({ oneOffs, selected, onToggle, onRemove }) => {
  const [expanded, setExpanded] = useState(true);
  const doneCount = oneOffs.filter((o) => selected.has(o.ItemID)).length;

  return (
    <div className="mb-3 bg-surface border border-accent/40 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <Zap size={14} className="text-accent flex-shrink-0" />
        <span className="flex-1 text-xs font-bold uppercase tracking-wide text-accent">
          One-offs this week
        </span>
        <span className="text-xs font-semibold text-accent/85">
          {doneCount}/{oneOffs.length}
        </span>
        {expanded ? (
          <ChevronUp size={16} className="text-accent" />
        ) : (
          <ChevronDown size={16} className="text-accent" />
        )}
      </button>
      {expanded && (
        <div className="bg-surface">
          {oneOffs.map((o, idx) => {
            const isChecked = selected.has(o.ItemID);
            const inputId = `oneoff-${o.ItemID}`;
            return (
              <div
                key={o.ItemID}
                className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] ${
                  idx < oneOffs.length - 1 ? 'border-b border-default' : ''
                }`}
              >
                <input
                  type="checkbox"
                  id={inputId}
                  checked={isChecked}
                  onChange={() => onToggle(o.ItemID)}
                  className="w-5 h-5 text-primary rounded focus:ring-focus flex-shrink-0"
                />
                <label
                  htmlFor={inputId}
                  className={`flex-1 text-sm cursor-pointer ${
                    isChecked ? 'text-heading font-medium' : 'text-body'
                  }`}
                >
                  {o.ItemName}
                </label>
                <button
                  type="button"
                  onClick={() => onRemove(o.ItemID)}
                  aria-label={`Remove one-off ${o.ItemName}`}
                  className="text-muted hover:text-danger p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OneOffCard;
