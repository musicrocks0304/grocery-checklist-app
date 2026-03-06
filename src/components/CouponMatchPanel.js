import React, { useState } from 'react';
import { X, Check, AlertCircle, Sparkles, ChevronDown, ChevronUp, Scissors, CheckCircle, XCircle, Loader, DollarSign } from 'lucide-react';
import { CLIP_SERVER_URL } from '../config/api';

const CONFIDENCE_STYLES = {
  high: { bg: 'bg-primary-light', text: 'text-primary', label: 'High Match', border: 'border-primary-border' },
  medium: { bg: 'bg-accent-light', text: 'text-accent', label: 'Possible', border: 'border-accent' },
  low: { bg: 'bg-background', text: 'text-body', label: 'Maybe', border: 'border-default' },
};

const CLIP_STATUS_STYLES = {
  pending: { icon: null, text: 'text-muted', label: 'Waiting...' },
  clipping: { icon: Loader, text: 'text-blue-600', label: 'Clipping...' },
  clipped: { icon: CheckCircle, text: 'text-primary', label: 'Clipped!' },
  already_clipped: { icon: CheckCircle, text: 'text-primary', label: 'Already clipped' },
  failed: { icon: XCircle, text: 'text-danger', label: 'Failed' },
  skipped: { icon: null, text: 'text-muted', label: 'Skipped' },
};

const CouponMatchPanel = ({ matches, onDismiss }) => {
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [selectedCoupons, setSelectedCoupons] = useState(new Set());
  const [isClipping, setIsClipping] = useState(false);
  const [clipProgress, setClipProgress] = useState(new Map()); // couponHashId → status
  const [clipResults, setClipResults] = useState(null); // { clipped, failed, total, savings }
  const [clipError, setClipError] = useState(null);

  if (!matches || matches.length === 0) {
    return null;
  }

  // Group matches by grocery item
  const groupedByItem = matches.reduce((acc, match) => {
    const key = match.grocery_item;
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});

  const toggleItem = (itemName) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return next;
    });
  };

  const toggleCouponSelection = (hashId) => {
    if (isClipping) return;
    setSelectedCoupons(prev => {
      const next = new Set(prev);
      if (next.has(hashId)) {
        next.delete(hashId);
      } else {
        next.add(hashId);
      }
      return next;
    });
  };

  const selectAllHighConfidence = () => {
    if (isClipping) return;
    const highConfIds = matches
      .filter(m => m.confidence === 'high' && m.coupon_hash_id)
      .map(m => m.coupon_hash_id);
    setSelectedCoupons(new Set(highConfIds));
  };

  const selectAll = () => {
    if (isClipping) return;
    const allIds = matches
      .filter(m => m.coupon_hash_id)
      .map(m => m.coupon_hash_id);
    setSelectedCoupons(new Set(allIds));
  };

  const deselectAll = () => {
    if (isClipping) return;
    setSelectedCoupons(new Set());
  };

  // Calculate stats
  const totalMatches = matches.length;
  const highConfidence = matches.filter(m => m.confidence === 'high').length;
  const selectedCount = selectedCoupons.size;

  // Calculate potential savings for selected coupons
  const selectedSavings = matches
    .filter(m => selectedCoupons.has(m.coupon_hash_id) && m.savings_amount)
    .reduce((sum, m) => sum + parseFloat(m.savings_amount || 0), 0);

  const allSelected = matches.every(m => !m.coupon_hash_id || selectedCoupons.has(m.coupon_hash_id));

  // Handle clip selected coupons
  const handleClipSelected = async () => {
    if (selectedCount === 0) return;

    const selectedIds = Array.from(selectedCoupons);
    setIsClipping(true);
    setClipError(null);
    setClipResults(null);

    // Initialize progress for all selected coupons
    const initialProgress = new Map();
    selectedIds.forEach(id => initialProgress.set(id, 'pending'));
    setClipProgress(initialProgress);

    try {
      // Start the clip job
      const startResponse = await fetch(`${CLIP_SERVER_URL}/api/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponIds: selectedIds }),
      });

      if (!startResponse.ok) {
        const errData = await startResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned ${startResponse.status}`);
      }

      const { jobId } = await startResponse.json();

      // Listen for progress via SSE
      const eventSource = new EventSource(`${CLIP_SERVER_URL}/api/clip-progress/${jobId}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'progress') {
            setClipProgress(prev => {
              const next = new Map(prev);
              next.set(data.couponId, data.status);
              return next;
            });
          } else if (data.type === 'complete') {
            setClipResults(data.summary);
            setIsClipping(false);
            eventSource.close();
          } else if (data.type === 'error') {
            setClipError(data.message);
            setIsClipping(false);
            eventSource.close();
          }
        } catch {
          // Ignore malformed SSE data
        }
      };

      eventSource.onerror = () => {
        // SSE connection closed — check if we already have results
        eventSource.close();
        setIsClipping(false);
        if (!clipResults) {
          setClipError('Connection to clip server lost. Check if the server is running.');
        }
      };
    } catch (err) {
      setClipError(err.message);
      setIsClipping(false);
    }
  };

  return (
    <div className="mt-6 border-2 border-primary-border rounded-2xl overflow-hidden bg-surface shadow-warm transition-colors duration-200">
      {/* Header */}
      <div className="bg-primary text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="text-lg font-display font-bold">
                Coupon Matches Found!
              </h3>
              <p className="text-sm text-white/70">
                {totalMatches} coupon{totalMatches !== 1 ? 's' : ''} match your grocery list
                {highConfidence > 0 && ` (${highConfidence} high confidence)`}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            disabled={isClipping}
            aria-label="Dismiss coupon matches"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Selection toolbar */}
      <div className="border-b bg-background px-4 py-3 flex flex-wrap items-center gap-2">
        <button
          onClick={selectAllHighConfidence}
          disabled={isClipping}
          className="text-sm font-medium px-4 py-2 rounded-full bg-primary text-white hover:bg-primary-hover disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          Select All High Confidence ({highConfidence})
        </button>
        <button
          onClick={allSelected ? deselectAll : selectAll}
          disabled={isClipping}
          className="text-sm font-medium px-4 py-2 rounded-full bg-surface text-body border border-default hover:bg-background disabled:bg-default disabled:cursor-not-allowed transition-colors"
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>

        {/* Selected count and savings */}
        {selectedCount > 0 && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-body">
              {selectedCount} selected
            </span>
            {selectedSavings > 0 && (
              <span className="text-sm font-semibold text-primary flex items-center gap-1">
                <DollarSign size={14} />
                {selectedSavings.toFixed(2)} potential savings
              </span>
            )}
          </div>
        )}
      </div>

      {/* Clip progress / results banner */}
      {clipError && (
        <div className="px-4 py-3 bg-danger-light border-b border-danger flex items-start gap-2">
          <AlertCircle className="text-danger flex-shrink-0 mt-0.5" size={16} />
          <div>
            <p className="text-sm font-medium text-danger">Clipping failed</p>
            <p className="text-xs text-danger">{clipError}</p>
          </div>
        </div>
      )}

      {clipResults && !isClipping && (
        <div className="px-4 py-3 bg-primary-light border-b border-primary-border">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={16} className="text-primary" />
            <span className="text-sm font-semibold text-primary">Clipping Complete!</span>
          </div>
          <p className="text-xs text-primary">
            {clipResults.clipped} clipped successfully
            {clipResults.already_clipped > 0 && `, ${clipResults.already_clipped} already clipped`}
            {clipResults.failed > 0 && `, ${clipResults.failed} failed`}
            {clipResults.savings > 0 && ` — $${clipResults.savings.toFixed(2)} in savings!`}
          </p>
        </div>
      )}

      {/* Match cards grouped by grocery item */}
      <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto overscroll-contain">
        {Object.entries(groupedByItem).map(([itemName, itemMatches]) => {
          const isExpanded = expandedItems.has(itemName) || Object.keys(groupedByItem).length <= 3;

          return (
            <div key={itemName} className="border border-default rounded-xl overflow-hidden">
              {/* Grocery item header */}
              <button
                onClick={() => toggleItem(itemName)}
                className="w-full flex items-center justify-between p-3 bg-background hover:bg-background transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-primary" />
                  <span className="font-medium text-heading">{itemName}</span>
                  <span className="text-xs text-muted">
                    ({itemMatches.length} coupon{itemMatches.length !== 1 ? 's' : ''})
                  </span>
                </div>
                {isExpanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
              </button>

              {/* Matched coupons */}
              {isExpanded && (
                <div className="divide-y divide-default">
                  {itemMatches.map((match, idx) => {
                    const conf = CONFIDENCE_STYLES[match.confidence] || CONFIDENCE_STYLES.low;
                    const hashId = match.coupon_hash_id;
                    const isSelected = hashId && selectedCoupons.has(hashId);
                    const clipStatus = hashId && clipProgress.get(hashId);
                    const clipStyle = clipStatus ? CLIP_STATUS_STYLES[clipStatus] : null;
                    const ClipIcon = clipStyle?.icon;

                    return (
                      <div
                        key={idx}
                        className={`p-3 flex items-start gap-3 transition-colors ${isSelected ? 'bg-primary-light' : ''}`}
                      >
                        {/* Checkbox */}
                        {hashId && (
                          <label className="flex items-center flex-shrink-0 mt-0.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleCouponSelection(hashId)}
                              disabled={isClipping}
                              className="w-5 h-5 text-primary rounded focus:ring-focus cursor-pointer disabled:cursor-not-allowed"
                            />
                          </label>
                        )}

                        {/* Coupon image thumbnail */}
                        {match.image_url && (
                          <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-background">
                            <img
                              src={match.image_url}
                              alt=""
                              className="w-full h-full object-contain"
                              onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                            />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium text-sm text-heading truncate">
                              {match.coupon_name}
                            </span>
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${conf.bg} ${conf.text}`}>
                              {conf.label}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-primary mb-0.5">
                            {match.discount}
                            {match.savings_amount && parseFloat(match.savings_amount) > 0 && (
                              <span className="text-xs font-normal text-muted ml-2">
                                (save ${parseFloat(match.savings_amount).toFixed(2)})
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted">
                            {match.reason}
                          </p>
                        </div>

                        {/* Clip status indicator */}
                        {clipStyle && (
                          <div className={`flex items-center gap-1 flex-shrink-0 ${clipStyle.text}`}>
                            {ClipIcon && (
                              <ClipIcon
                                size={16}
                                className={clipStatus === 'clipping' ? 'animate-spin' : ''}
                              />
                            )}
                            <span className="text-xs font-medium">{clipStyle.label}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with Clip button */}
      <div className="border-t bg-background p-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted flex items-center gap-1">
          <AlertCircle size={12} />
          Matches are AI-suggested. Verify before clipping.
        </p>

        <div className="flex items-center gap-2">
          <button
            onClick={onDismiss}
            disabled={isClipping}
            className="text-sm text-body hover:text-heading font-medium disabled:text-muted"
          >
            Dismiss
          </button>

          <button
            onClick={handleClipSelected}
            disabled={selectedCount === 0 || isClipping}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:bg-gray-400 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-sm"
          >
            {isClipping ? (
              <>
                <Loader size={16} className="animate-spin" />
                Clipping...
              </>
            ) : (
              <>
                <Scissors size={16} />
                Clip {selectedCount} Coupon{selectedCount !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Clipping progress overlay */}
      {isClipping && clipProgress.size > 0 && (
        <div className="border-t px-4 py-3 bg-blue-50">
          <div className="flex items-center gap-2 mb-2">
            <Loader size={14} className="animate-spin text-blue-600" />
            <span className="text-sm font-medium text-blue-800">
              Clipping coupons on HEB...
            </span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {Array.from(clipProgress.entries()).map(([couponId, status]) => {
              const match = matches.find(m => m.coupon_hash_id === couponId);
              const statusStyle = CLIP_STATUS_STYLES[status] || CLIP_STATUS_STYLES.pending;
              const StatusIcon = statusStyle.icon;
              return (
                <div key={couponId} className="flex items-center gap-2 text-xs">
                  <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    {StatusIcon ? (
                      <StatusIcon
                        size={14}
                        className={`${statusStyle.text} ${status === 'clipping' ? 'animate-spin' : ''}`}
                      />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-muted"></span>
                    )}
                  </span>
                  <span className="text-body truncate flex-1">
                    {match ? match.coupon_name : couponId}
                  </span>
                  <span className={`font-medium ${statusStyle.text}`}>
                    {statusStyle.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CouponMatchPanel;
