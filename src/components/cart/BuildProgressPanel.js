import React from 'react';
import { CheckCircle2, Loader2, XCircle, SkipForward } from 'lucide-react';

// ─── Build Progress Panel (Step 4) ──────────────────────────────
const BuildProgressPanel = ({ progress, summary, totalItems }) => {
  const completedCount = progress.filter(p =>
    p.status === 'added' || p.status === 'failed' || p.status === 'skipped'
  ).length;

  const isComplete = !!summary;
  const pct = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  return (
    <div className="bg-surface rounded-2xl shadow-warm border border-default p-4 sm:p-6 transition-colors duration-200">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-xl ${isComplete ? 'bg-primary-light text-primary' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}`}>
          {isComplete ? <CheckCircle2 size={24} /> : <Loader2 size={24} className="animate-spin" />}
        </div>
        <div>
          <h2 className="text-lg font-semibold font-display text-heading">
            {isComplete ? 'Cart Built!' : 'Building Your HEB Cart...'}
          </h2>
          <p className="text-sm text-muted">
            {isComplete
              ? `${summary.added} items added, $${summary.cart?.total?.toFixed(2) || '?'} estimated total`
              : `${completedCount} of ${totalItems} items processed`}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-default rounded-full h-2.5 mb-4">
        <div
          className="bg-primary h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${isComplete ? 100 : pct}%` }}
        />
      </div>

      {/* Summary stats */}
      {isComplete && summary && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 bg-primary-light rounded-xl border border-primary-border">
            <div className="text-2xl font-bold text-primary">{summary.added}</div>
            <div className="text-xs text-primary">Added</div>
          </div>
          <div className="text-center p-3 bg-danger-light rounded-xl border border-danger">
            <div className="text-2xl font-bold text-danger">{summary.failed}</div>
            <div className="text-xs text-danger">Failed</div>
          </div>
          <div className="text-center p-3 bg-background rounded-xl border border-default">
            <div className="text-2xl font-bold text-heading">{summary.skipped}</div>
            <div className="text-xs text-body">Skipped</div>
          </div>
        </div>
      )}

      {/* Item-by-item progress */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {progress.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {p.status === 'adding' && <Loader2 size={14} className="animate-spin text-blue-500 flex-shrink-0" />}
            {p.status === 'added' && <CheckCircle2 size={14} className="text-primary flex-shrink-0" />}
            {p.status === 'failed' && <XCircle size={14} className="text-danger flex-shrink-0" />}
            {p.status === 'skipped' && <SkipForward size={14} className="text-muted flex-shrink-0" />}
            <span className={`truncate ${
              p.status === 'added' ? 'text-primary' :
              p.status === 'failed' ? 'text-danger' :
              p.status === 'skipped' ? 'text-muted' :
              'text-body'
            }`}>
              {p.groceryItemName}
            </span>
            {p.message && p.status !== 'adding' && (
              <span className="text-xs text-muted flex-shrink-0">— {p.message}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BuildProgressPanel;
