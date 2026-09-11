import React from "react";
import { ChevronUp } from "lucide-react";

const ReorderDrawer = ({ sections, onMoveUp, onClose }) => (
  <div className="bg-primary-light border-b border-primary-border px-[14px] py-2.5">
    <div className="flex items-center mb-2">
      <div className="flex-1 text-[12px] font-bold text-primary uppercase tracking-[0.4px]">
        Walk order · tap ↑ to move up
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-primary text-[12px] font-bold px-2 py-1 rounded-md hover:bg-surface/60"
      >
        Done
      </button>
    </div>
    <div className="flex flex-col gap-1">
      {sections.map((section, i) => (
        <div
          key={section.name}
          className="bg-surface rounded-[10px] px-2.5 py-2 flex items-center gap-2 text-[13px]"
        >
          <span className="text-muted font-bold w-4 text-center">{i + 1}</span>
          <span className="flex-1 font-semibold text-heading">{section.name}</span>
          <button
            type="button"
            onClick={() => onMoveUp(i)}
            disabled={i === 0}
            aria-label={`Move ${section.name} up`}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-opacity ${
              i === 0 ? "opacity-30 cursor-not-allowed" : "bg-primary-light"
            }`}
          >
            <ChevronUp size={16} className="text-primary" />
          </button>
        </div>
      ))}
    </div>
  </div>
);

export default ReorderDrawer;
