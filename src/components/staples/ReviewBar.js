import React from 'react';
import { ArrowRight } from 'lucide-react';

const ReviewBar = ({ count, onReview }) => {
  const disabled = count === 0;
  const label =
    count === 0
      ? 'Nothing selected yet'
      : `${count} ${count === 1 ? 'item' : 'items'} in your list`;

  return (
    <div
      className="absolute left-0 right-0 bottom-0 pt-7 px-4 pb-3"
      style={{ background: 'linear-gradient(180deg, transparent, var(--color-background) 40%)' }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5 bg-surface border border-default rounded-2xl">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-muted">Ready when you are</div>
          <div className="text-sm font-medium text-body mt-0.5 truncate">{label}</div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onReview}
          className="px-4 py-2.5 rounded-xl bg-primary text-white hover:bg-primary-hover disabled:bg-muted disabled:cursor-not-allowed font-semibold text-sm flex items-center gap-1.5"
        >
          Review <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default ReviewBar;
