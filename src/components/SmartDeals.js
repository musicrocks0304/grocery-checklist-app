import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Tag, Search, AlertCircle, Calendar, DollarSign, Loader,
  Scissors, CheckCircle, XCircle, ShoppingCart, RefreshCw,
  ChevronDown, ChevronUp, Plus, Filter,
} from 'lucide-react';
import { ENDPOINTS, apiJson } from '../config/api';
import { getWeekDates } from '../utils/weekDates';
import { useClipCoupons } from '../hooks/useClipCoupons';

const CONFIDENCE_STYLES = {
  high: { bg: 'bg-primary-light', text: 'text-primary', label: 'High Match' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Possible' },
};

const CLIP_STATUS_STYLES = {
  pending: { icon: null, text: 'text-muted', label: 'Waiting...' },
  clipping: { icon: Loader, text: 'text-blue-600', label: 'Clipping...' },
  clipped: { icon: CheckCircle, text: 'text-primary', label: 'Clipped!' },
  already_clipped: { icon: CheckCircle, text: 'text-primary', label: 'Already clipped' },
  failed: { icon: XCircle, text: 'text-danger', label: 'Failed' },
  skipped: { icon: null, text: 'text-muted', label: 'Skipped' },
};

const SmartDeals = ({ onNavigate }) => {
  const [deals, setDeals] = useState([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('savings');
  const [filterConfidence, setFilterConfidence] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Clip state
  const [selectedCoupons, setSelectedCoupons] = useState(new Set());
  const { clipSelected, clipProgress, clipResults, clipError, isClipping } = useClipCoupons();

  // Add-to-list state
  const [addingToList, setAddingToList] = useState(new Map()); // dealId → 'adding' | 'added' | 'exists' | 'error'

  const fetchDeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiJson(ENDPOINTS.smartDeals, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({}),
        mode: 'cors',
        retries: 0,
      });
      // n8n respondToWebhook wraps in array
      const result = (Array.isArray(data) ? data[0] : data) || {};
      // Filter out deals with expired coupons (can come from cache)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const activeDeals = (result.deals || []).filter(d => {
        if (!d.coupon.expirationDate) return true;
        return new Date(d.coupon.expirationDate) >= today;
      });
      const activeSavings = activeDeals.reduce((sum, d) => sum + (d.coupon.savingsAmount || 0), 0);
      setDeals(activeDeals);
      setTotalSavings(Math.round(activeSavings * 100) / 100);
    } catch (err) {
      console.error('[smart-deals] Fetch error:', err.message);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  // Filtered + sorted deals
  const filteredDeals = useMemo(() => {
    let result = deals;

    if (filterConfidence !== 'all') {
      result = result.filter(d => d.confidence === filterConfidence);
    }

    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      result = result.filter(d =>
        (d.frequentProduct.name && d.frequentProduct.name.toLowerCase().includes(query)) ||
        (d.frequentProduct.brand && d.frequentProduct.brand.toLowerCase().includes(query)) ||
        (d.coupon.productName && d.coupon.productName.toLowerCase().includes(query)) ||
        (d.reason && d.reason.toLowerCase().includes(query))
      );
    }

    result = [...result].sort((a, b) => {
      if (sortBy === 'savings') {
        return (b.coupon.savingsAmount || 0) - (a.coupon.savingsAmount || 0);
      }
      if (sortBy === 'confidence') {
        const order = { high: 0, medium: 1 };
        return (order[a.confidence] || 2) - (order[b.confidence] || 2);
      }
      if (sortBy === 'expiration') {
        const dateA = a.coupon.expirationDate ? new Date(a.coupon.expirationDate) : new Date('2099-12-31');
        const dateB = b.coupon.expirationDate ? new Date(b.coupon.expirationDate) : new Date('2099-12-31');
        return dateA - dateB;
      }
      return 0;
    });

    return result;
  }, [deals, filterConfidence, searchText, sortBy]);

  // Selection helpers
  const toggleCouponSelection = (hashId) => {
    if (isClipping) return;
    setSelectedCoupons(prev => {
      const next = new Set(prev);
      next.has(hashId) ? next.delete(hashId) : next.add(hashId);
      return next;
    });
  };

  const selectAllUnclipped = () => {
    if (isClipping) return;
    const ids = filteredDeals
      .filter(d => d.coupon.hashId && d.coupon.clippedStatus !== 1)
      .map(d => d.coupon.hashId);
    setSelectedCoupons(new Set(ids));
  };

  const deselectAll = () => {
    if (isClipping) return;
    setSelectedCoupons(new Set());
  };

  const selectedCount = selectedCoupons.size;
  const selectedSavings = deals
    .filter(d => selectedCoupons.has(d.coupon.hashId))
    .reduce((sum, d) => sum + (d.coupon.savingsAmount || 0), 0);

  // Clip selected coupons via shared hook
  const handleClipSelected = async () => {
    if (selectedCount === 0) return;
    const selectedIds = Array.from(selectedCoupons);
    await clipSelected(selectedIds);
    // Mark clipped coupons in local deal state
    setDeals(prev => prev.map(d =>
      selectedCoupons.has(d.coupon.hashId)
        ? { ...d, coupon: { ...d.coupon, clippedStatus: 1 } }
        : d
    ));
  };

  // Add item to weekly grocery list
  const handleAddToList = async (deal) => {
    const dealId = deal.id;
    setAddingToList(prev => new Map(prev).set(dealId, 'adding'));

    try {
      const weekData = getWeekDates();
      const response = await fetch(ENDPOINTS.hebAddWeeklyItem, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: deal.frequentProduct.name,
          brand: deal.frequentProduct.brand || null,
          category: deal.frequentProduct.category || null,
          weekDateRange: weekData.displayRange,
          weekStartDate: weekData.startDate,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const result = await response.json();
      setAddingToList(prev => new Map(prev).set(dealId, result.alreadyExisted ? 'exists' : 'added'));
    } catch (err) {
      console.error('[smart-deals] Add to list error:', err.message);
      setAddingToList(prev => new Map(prev).set(dealId, 'error'));
    }
  };

  // Expiration helper
  const getDaysLeft = (expirationDate) => {
    if (!expirationDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expirationDate);
    return Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
  };

  // Confidence counts
  const confidenceCounts = useMemo(() => {
    const counts = { all: deals.length, high: 0, medium: 0 };
    deals.forEach(d => { counts[d.confidence] = (counts[d.confidence] || 0) + 1; });
    return counts;
  }, [deals]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-body">Finding deals on your frequently purchased items...</p>
          <p className="mt-1 text-sm text-muted">Matching 228+ products against active coupons</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="bg-surface rounded-2xl shadow-warm border border-default p-4 sm:p-6 mb-4 transition-colors duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-accent text-white p-2 rounded-xl">
              <Tag size={24} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-display text-heading">Smart Deals</h1>
              <p className="text-sm text-muted">
                {deals.length > 0
                  ? `${deals.length} deal${deals.length !== 1 ? 's' : ''} found — $${totalSavings.toFixed(2)} potential savings`
                  : 'No deals found for your frequent purchases'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1 text-sm text-body hover:text-heading sm:hidden"
            >
              <Filter size={16} />
              {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button
              onClick={fetchDeals}
              disabled={isLoading}
              className="p-2 hover:bg-background rounded-xl transition-colors text-muted hover:text-heading"
              title="Refresh deals"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger-light border border-danger rounded-xl flex items-start gap-2">
            <AlertCircle className="text-danger flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-sm font-medium text-danger">Failed to load deals</p>
              <p className="text-xs text-danger">{error}</p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search deals... (product name, brand)"
            className="w-full pl-10 pr-4 py-2.5 border border-default rounded-xl focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent text-sm"
          />
        </div>

        {/* Filters */}
        <div className={`space-y-3 ${showFilters ? '' : 'hidden sm:block'}`}>
          {/* Confidence filter pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All Deals' },
              { key: 'high', label: 'High Match' },
              { key: 'medium', label: 'Possible' },
            ].map(({ key, label }) => {
              const count = confidenceCounts[key] || 0;
              const isActive = filterConfidence === key;
              return (
                <button
                  key={key}
                  onClick={() => setFilterConfidence(key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'bg-background text-body hover:bg-default'
                  }`}
                >
                  {label}
                  <span className={`text-xs ${isActive ? 'text-primary-light' : 'text-muted'}`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-body">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm border border-default rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-focus"
            >
              <option value="savings">Highest Savings</option>
              <option value="confidence">Confidence</option>
              <option value="expiration">Expiring Soonest</option>
            </select>
          </div>
        </div>
      </div>

      {/* Selection toolbar — only if there are deals */}
      {deals.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-warm border border-default p-3 mb-4 flex flex-wrap items-center gap-2 transition-colors duration-200">
          <button
            onClick={selectAllUnclipped}
            disabled={isClipping}
            className="text-sm font-medium px-4 py-2 rounded-full bg-primary text-white hover:bg-primary-hover disabled:bg-default disabled:cursor-not-allowed transition-colors"
          >
            Select All Unclipped
          </button>
          {selectedCount > 0 && (
            <button
              onClick={deselectAll}
              disabled={isClipping}
              className="text-sm font-medium px-4 py-2 rounded-full bg-surface text-body border border-default hover:bg-background disabled:bg-default disabled:cursor-not-allowed transition-colors"
            >
              Deselect All
            </button>
          )}

          {selectedCount > 0 && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm text-body">{selectedCount} selected</span>
              {selectedSavings > 0 && (
                <span className="text-sm font-semibold text-primary flex items-center gap-1">
                  <DollarSign size={14} />
                  {selectedSavings.toFixed(2)} savings
                </span>
              )}
              <button
                onClick={handleClipSelected}
                disabled={isClipping}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:bg-default disabled:cursor-not-allowed transition-all text-sm font-medium shadow-sm"
              >
                {isClipping ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    Clipping...
                  </>
                ) : (
                  <>
                    <Scissors size={16} />
                    Clip {selectedCount}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Clip progress banner */}
      {clipError && (
        <div className="mb-4 p-3 bg-danger-light border border-danger rounded-xl flex items-start gap-2">
          <AlertCircle className="text-danger flex-shrink-0 mt-0.5" size={16} />
          <div>
            <p className="text-sm font-medium text-danger">Clipping failed</p>
            <p className="text-xs text-danger">{clipError}</p>
          </div>
        </div>
      )}

      {clipResults && !isClipping && (
        <div className="mb-4 p-3 bg-primary-light border border-primary-border rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={16} className="text-primary" />
            <span className="text-sm font-semibold text-primary">Clipping Complete!</span>
          </div>
          <p className="text-xs text-primary">
            {clipResults.clipped} clipped
            {clipResults.already_clipped > 0 && `, ${clipResults.already_clipped} already clipped`}
            {clipResults.failed > 0 && `, ${clipResults.failed} failed`}
            {clipResults.savings > 0 && ` — $${clipResults.savings.toFixed(2)} saved!`}
          </p>
        </div>
      )}

      {/* Clipping progress detail */}
      {isClipping && clipProgress.size > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Loader size={14} className="animate-spin text-blue-600" />
            <span className="text-sm font-medium text-blue-800">Clipping coupons on HEB...</span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {Array.from(clipProgress.entries()).map(([couponId, status]) => {
              const deal = deals.find(d => d.coupon.hashId === couponId);
              const statusStyle = CLIP_STATUS_STYLES[status] || CLIP_STATUS_STYLES.pending;
              const StatusIcon = statusStyle.icon;
              return (
                <div key={couponId} className="flex items-center gap-2 text-xs">
                  <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    {StatusIcon ? (
                      <StatusIcon size={14} className={`${statusStyle.text} ${status === 'clipping' ? 'animate-spin' : ''}`} />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-default"></span>
                    )}
                  </span>
                  <span className="text-body truncate flex-1">
                    {deal ? deal.frequentProduct.name : couponId}
                  </span>
                  <span className={`font-medium ${statusStyle.text}`}>{statusStyle.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Results count */}
      {(searchText.trim() || filterConfidence !== 'all') && (
        <p className="text-sm text-muted mb-3">
          Showing {filteredDeals.length} of {deals.length} deals
          {searchText.trim() && ` matching "${searchText}"`}
        </p>
      )}

      {/* Deal Cards */}
      {filteredDeals.length > 0 ? (
        <div className="space-y-3">
          {filteredDeals.map((deal) => {
            const conf = CONFIDENCE_STYLES[deal.confidence] || CONFIDENCE_STYLES.medium;
            const daysLeft = getDaysLeft(deal.coupon.expirationDate);
            const isSelected = selectedCoupons.has(deal.coupon.hashId);
            const addStatus = addingToList.get(deal.id);
            const isClipped = deal.coupon.clippedStatus === 1;
            const clipStatus = clipProgress.get(deal.coupon.hashId);

            return (
              <div
                key={deal.id}
                className={`bg-surface rounded-2xl shadow-warm border overflow-hidden transition-all ${
                  isSelected ? 'border-primary-border ring-1 ring-primary-border' : 'border-default'
                }`}
              >
                <div className="flex gap-3 p-3 sm:p-4">
                  {/* Checkbox */}
                  <label className="flex items-start pt-1 flex-shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCouponSelection(deal.coupon.hashId)}
                      disabled={isClipping || isClipped}
                      className="w-5 h-5 text-primary rounded focus:ring-focus cursor-pointer disabled:cursor-not-allowed"
                    />
                  </label>

                  {/* Product image */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 rounded-xl overflow-hidden bg-background">
                    {deal.frequentProduct.imageUrl ? (
                      <img
                        src={deal.frequentProduct.imageUrl}
                        alt=""
                        className="w-full h-full object-contain"
                        onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-default">
                        <ShoppingCart size={24} />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-semibold text-heading truncate">
                          {deal.frequentProduct.name}
                        </h3>
                        {deal.frequentProduct.brand && (
                          <p className="text-xs text-muted">{deal.frequentProduct.brand}</p>
                        )}
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${conf.bg} ${conf.text}`}>
                        {conf.label}
                      </span>
                    </div>

                    {/* Coupon details */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-base font-bold text-primary">
                        {deal.coupon.discount || 'Special Offer'}
                      </span>
                      {deal.coupon.savingsAmount > 0 && (
                        <span className="text-xs text-muted">
                          (save ${deal.coupon.savingsAmount.toFixed(2)})
                        </span>
                      )}
                      {deal.frequentProduct.price && (
                        <span className="text-xs text-muted">
                          reg. ${deal.frequentProduct.price.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted mb-1 line-clamp-1">
                      {deal.coupon.productName}
                    </p>

                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Expiration */}
                      {daysLeft !== null && (
                        <span className={`text-xs font-medium flex items-center gap-1 ${
                          daysLeft <= 3 ? 'text-danger' : daysLeft <= 7 ? 'text-accent' : 'text-muted'
                        }`}>
                          <Calendar size={12} />
                          {daysLeft <= 0 ? 'Expired' : daysLeft === 1 ? '1 day left' : `${daysLeft} days`}
                        </span>
                      )}

                      {/* Already clipped indicator */}
                      {isClipped && !clipStatus && (
                        <span className="text-xs font-medium text-primary flex items-center gap-1">
                          <CheckCircle size={12} />
                          Clipped
                        </span>
                      )}

                      {/* Live clip status */}
                      {clipStatus && (() => {
                        const style = CLIP_STATUS_STYLES[clipStatus];
                        const Icon = style?.icon;
                        return (
                          <span className={`text-xs font-medium flex items-center gap-1 ${style?.text}`}>
                            {Icon && <Icon size={12} className={clipStatus === 'clipping' ? 'animate-spin' : ''} />}
                            {style?.label}
                          </span>
                        );
                      })()}

                      {/* Reason */}
                      {deal.reason && (
                        <span className="text-xs text-muted italic">{deal.reason}</span>
                      )}
                    </div>
                  </div>

                  {/* Add to list button */}
                  <div className="flex-shrink-0 flex items-center">
                    {addStatus === 'added' ? (
                      <span className="text-xs font-medium text-primary flex items-center gap-1 px-2">
                        <CheckCircle size={14} />
                        Added
                      </span>
                    ) : addStatus === 'exists' ? (
                      <span className="text-xs font-medium text-accent flex items-center gap-1 px-2">
                        <CheckCircle size={14} />
                        On List
                      </span>
                    ) : addStatus === 'error' ? (
                      <button
                        onClick={() => handleAddToList(deal)}
                        className="text-xs font-medium text-danger flex items-center gap-1 px-2 hover:text-danger"
                        title="Retry"
                      >
                        <XCircle size={14} />
                        Retry
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAddToList(deal)}
                        disabled={addStatus === 'adding'}
                        className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-xl bg-primary-light text-primary hover:bg-primary-light/80 disabled:bg-background disabled:text-muted transition-colors"
                        title="Add to this week's grocery list"
                      >
                        {addStatus === 'adding' ? (
                          <Loader size={14} className="animate-spin" />
                        ) : (
                          <Plus size={14} />
                        )}
                        <span className="hidden sm:inline">Add</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
          <Tag size={48} className="mx-auto text-default mb-4" />
          <h3 className="text-lg font-semibold text-body">
            {deals.length === 0 ? 'No Deals Found' : 'No matching deals'}
          </h3>
          <p className="text-muted mt-1">
            {deals.length === 0
              ? 'None of your frequently purchased items currently have matching coupons.'
              : 'Try a different search term or filter.'}
          </p>
          {deals.length === 0 && (
            <button
              onClick={fetchDeals}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover transition-colors text-sm font-medium"
            >
              Try Again
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartDeals;
