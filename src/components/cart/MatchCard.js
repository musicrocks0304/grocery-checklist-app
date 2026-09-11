import React from 'react';
import { Star, Check, X, CheckCircle2, Search } from 'lucide-react';

// ─── Match Card (single grocery item in review) ─────────────────
const MatchCard = React.memo(({ item, match, onConfirm, onReject, onSearch, onSwap }) => {
  const hasMatch = match && match.hebProductId;
  const isConfirmed = match?.userConfirmed;
  const confidence = match?.confidence;

  const confidenceColors = {
    high: 'bg-primary-light text-primary',
    medium: 'bg-accent-light text-accent',
    low: 'bg-danger-light text-danger',
  };

  const isCouponMatch = match?.matchSource === 'coupon';

  return (
    <div className={`border rounded-2xl p-3 transition-all ${
      isCouponMatch ? 'border-l-4 border-l-primary border-primary-border bg-primary-light/30' :
      isConfirmed ? 'border-primary-border bg-primary-light/50' :
      hasMatch ? 'border-default bg-surface' :
      'border-accent bg-accent-light/50'
    }`}>
      <div className="flex items-start gap-3">
        {/* Grocery item name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-heading truncate">{item.ItemName}</span>
            {(item.Quantity > 1 || item.Unit) && (
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                {item.Unit ? `${item.Quantity || 1} ${item.Unit}` : `x${item.Quantity}`}
              </span>
            )}
            <span className="text-xs text-muted bg-background px-1.5 py-0.5 rounded flex-shrink-0">
              {item.Category}
            </span>
          </div>

          {hasMatch ? (
            <div className="flex items-center gap-2 mt-1.5">
              {match.hebImageUrl && (
                <img
                  src={match.hebImageUrl}
                  alt={match.hebProductName}
                  className="w-10 h-10 object-contain rounded border border-default flex-shrink-0"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-body truncate">{match.hebProductName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {match.hebPrice && (
                    <span className="text-sm font-medium text-primary">${Number(match.hebPrice).toFixed(2)}</span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${confidenceColors[confidence] || 'bg-background text-body'}`}>
                    {confidence}
                  </span>
                  {match.matchSource === 'frequently_purchased' && (
                    <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
                      <Star size={10} /> Repeat buy
                    </span>
                  )}
                  {isCouponMatch && item.couponSavings && (
                    <span className="text-xs text-primary bg-primary-light px-1.5 py-0.5 rounded-full font-medium">
                      Save ${Number(item.couponSavings).toFixed(2)}{item.couponClipped ? ' | Clipped' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-accent mt-1">No match found — search manually</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          {hasMatch && !isConfirmed && (
            <>
              <button
                onClick={() => onConfirm(item.ItemID, match)}
                className="p-1.5 rounded-xl bg-primary-light text-primary hover:bg-primary-light/80 transition-colors"
                title="Accept match"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => onReject(item.ItemID, match)}
                className="p-1.5 rounded-xl bg-danger-light text-danger hover:bg-danger-light/80 transition-colors"
                title="Reject match"
              >
                <X size={16} />
              </button>
            </>
          )}
          {isConfirmed && (
            <div className="p-1.5 rounded-xl bg-primary-light text-primary" title="Confirmed">
              <CheckCircle2 size={16} />
            </div>
          )}
          <button
            onClick={() => onSearch(item)}
            className="p-1.5 rounded-xl bg-background text-body hover:bg-default transition-colors"
            title="Search for alternative"
          >
            <Search size={16} />
          </button>
        </div>
      </div>
    </div>
  );
});

export default MatchCard;
