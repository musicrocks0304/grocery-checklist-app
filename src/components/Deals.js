import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Tag, Search, AlertCircle, Calendar, DollarSign, Loader,
  Scissors, CheckCircle, XCircle, ShoppingCart, RefreshCw,
  ChevronDown, ChevronUp, Plus, Filter, Ticket, Percent, Gift, WifiOff, AlertTriangle,
} from 'lucide-react';
import { ENDPOINTS, apiFetch } from '../config/api';
import { getWeekDates } from '../utils/weekDates';
import { useClipCoupons } from '../hooks/useClipCoupons';
import { useClipServerHealth } from '../hooks/useClipServerHealth';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const CLIP_STATUS_STYLES = {
  pending: { icon: null, text: 'text-muted', label: 'Waiting...' },
  clipping: { icon: Loader, text: 'text-blue-600', label: 'Clipping...' },
  clipped: { icon: CheckCircle, text: 'text-primary', label: 'Clipped!' },
  already_clipped: { icon: CheckCircle, text: 'text-primary', label: 'Already clipped' },
  failed: { icon: XCircle, text: 'text-danger', label: 'Failed' },
  skipped: { icon: null, text: 'text-muted', label: 'Skipped' },
};

const CONFIDENCE_STYLES = {
  high: { bg: 'bg-primary-light', text: 'text-primary', label: 'High Match' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Possible' },
};

const TYPE_CONFIG = {
  all: { label: 'All', icon: Ticket, badgeClass: 'bg-blue-100 text-blue-700' },
  'dollar-off': { label: 'Dollar Off', icon: DollarSign, badgeClass: 'bg-primary-light text-primary' },
  percentage: { label: '% Off', icon: Percent, badgeClass: 'bg-purple-100 text-purple-700' },
  bogo: { label: 'BOGO', icon: Gift, badgeClass: 'bg-accent-light text-accent' },
  other: { label: 'Other', icon: Tag, badgeClass: 'bg-background text-heading' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getDaysLeft = (expirationDate) => {
  if (!expirationDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate);
  return Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
};

const ExpirationBadge = ({ expirationDate }) => {
  const daysLeft = getDaysLeft(expirationDate);
  if (daysLeft === null) return null;
  return (
    <span className={`text-xs font-medium flex items-center gap-1 ${
      daysLeft <= 3 ? 'text-danger' : daysLeft <= 7 ? 'text-accent' : 'text-muted'
    }`}>
      <Calendar size={12} />
      {daysLeft <= 0 ? 'Expired' : daysLeft === 1 ? '1 day left' : `${daysLeft} days`}
    </span>
  );
};

// ---------------------------------------------------------------------------
// SmartDeal card (list-style, with checkbox + add-to-list)
// ---------------------------------------------------------------------------

const SmartDealCard = ({
  deal, isSelected, onToggle, isClipping, clipStatus,
  addStatus, onAddToList,
}) => {
  const conf = CONFIDENCE_STYLES[deal.confidence] || CONFIDENCE_STYLES.medium;
  const isClipped = deal.coupon.clippedStatus === 1;

  return (
    <div className={`bg-surface rounded-2xl shadow-warm border overflow-hidden transition-all ${
      isSelected ? 'border-primary-border ring-1 ring-primary-border' : 'border-default'
    }`}>
      <div className="flex gap-3 p-3 sm:p-4">
        {/* Checkbox */}
        <label className="flex items-start pt-1 flex-shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(deal.coupon.hashId)}
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
            <ExpirationBadge expirationDate={deal.coupon.expirationDate} />

            {isClipped && !clipStatus && (
              <span className="text-xs font-medium text-primary flex items-center gap-1">
                <CheckCircle size={12} /> Clipped
              </span>
            )}

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

            {deal.reason && (
              <span className="text-xs text-muted italic">{deal.reason}</span>
            )}
          </div>
        </div>

        {/* Add to list */}
        <div className="flex-shrink-0 flex items-center">
          {addStatus === 'added' ? (
            <span className="text-xs font-medium text-primary flex items-center gap-1 px-2">
              <CheckCircle size={14} /> Added
            </span>
          ) : addStatus === 'exists' ? (
            <span className="text-xs font-medium text-accent flex items-center gap-1 px-2">
              <CheckCircle size={14} /> On List
            </span>
          ) : addStatus === 'error' ? (
            <button
              onClick={() => onAddToList(deal)}
              className="text-xs font-medium text-danger flex items-center gap-1 px-2 hover:text-danger"
              title="Retry"
            >
              <XCircle size={14} /> Retry
            </button>
          ) : (
            <button
              onClick={() => onAddToList(deal)}
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
};

// ---------------------------------------------------------------------------
// AllCoupons card (grid-style)
// ---------------------------------------------------------------------------

const CouponCard = ({ coupon, isSelected, onToggle, isClipping }) => {
  const typeConfig = TYPE_CONFIG[coupon.coupon_type] || TYPE_CONFIG.other;
  const TypeIcon = typeConfig.icon;
  const isClipped = coupon.clipped_status === 1;

  return (
    <div className={`border rounded-2xl overflow-hidden hover:shadow-warm transition-shadow bg-surface transition-colors duration-200 ${
      isSelected ? 'border-primary-border ring-1 ring-primary-border' : 'border-default'
    }`}>
      {/* Selection checkbox overlay */}
      <div className="flex items-center gap-2 px-3 pt-3">
        <label className="flex-shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(coupon.hash_id)}
            disabled={isClipping || isClipped}
            className="w-4 h-4 text-primary rounded focus:ring-focus cursor-pointer disabled:cursor-not-allowed"
          />
        </label>
        {isClipped && (
          <span className="text-xs font-medium text-primary flex items-center gap-1">
            <CheckCircle size={10} /> Clipped
          </span>
        )}
      </div>

      {/* Image */}
      {coupon.image_url && (
        <div className="w-full h-28 bg-background flex items-center justify-center overflow-hidden">
          <img
            src={coupon.image_url}
            alt={coupon.product_name}
            className="w-full h-full object-contain"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
      )}

      <div className="p-3">
        {/* Type badge + expiration */}
        <div className="flex items-center justify-between mb-2">
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeConfig.badgeClass}`}>
            <TypeIcon size={12} />
            {typeConfig.label}
          </span>
          <ExpirationBadge expirationDate={coupon.expiration_date} />
        </div>

        {/* Discount */}
        <div className="text-lg font-bold text-primary mb-1">
          {coupon.discount || 'Special Offer'}
        </div>

        {/* Product name */}
        <h3 className="text-sm font-semibold text-heading mb-1 line-clamp-2">
          {coupon.product_name}
        </h3>

        {/* Description */}
        {coupon.description && coupon.description !== coupon.product_name && (
          <p className="text-xs text-muted line-clamp-2">
            {coupon.description}
          </p>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Deals component
// ---------------------------------------------------------------------------

const Deals = ({ onNavigate }) => {
  // Tab state
  const [activeTab, setActiveTab] = useState('smart'); // 'smart' | 'all'

  // Smart Deals data
  const [deals, setDeals] = useState([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [smartLoading, setSmartLoading] = useState(true);
  const [smartError, setSmartError] = useState(null);

  // All Coupons data
  const [couponsData, setCouponsData] = useState([]);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [couponsError, setCouponsError] = useState(null);

  // Shared UI state
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('savings');
  const [showFilters, setShowFilters] = useState(false);

  // Smart Deals filters
  const [filterConfidence, setFilterConfidence] = useState('all');

  // All Coupons filters
  const [filterType, setFilterType] = useState('all');
  const [visibleCouponCount, setVisibleCouponCount] = useState(50);

  // Selection + clip state (shared hook)
  const [selectedCoupons, setSelectedCoupons] = useState(new Set());
  const { clipSelected, clipProgress, clipMessages, clipResults, clipError, isClipping, resetClipState } = useClipCoupons();
  const { status: clipServerStatus, health: clipServerHealth } = useClipServerHealth();
  const clipServerUnavailable = clipServerStatus === 'unreachable' || clipServerStatus === 'expired';

  // Add-to-list state (smart deals only)
  const [addingToList, setAddingToList] = useState(new Map());

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchSmartDeals = useCallback(async () => {
    setSmartLoading(true);
    setSmartError(null);
    try {
      const response = await apiFetch(ENDPOINTS.smartDeals, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({}),
        mode: 'cors',
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      const result = Array.isArray(data) ? data[0] : data;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const activeDeals = (result.deals || []).filter(d => {
        if (d.coupon.clippedStatus === 1) return false; // already clipped — not "available savings"
        if (!d.coupon.expirationDate) return true;
        return new Date(d.coupon.expirationDate) >= today;
      });
      setDeals(activeDeals);
      setTotalSavings(Math.round(activeDeals.reduce((s, d) => s + (d.coupon.savingsAmount || 0), 0) * 100) / 100);
    } catch (err) {
      console.error('[deals] Smart deals fetch error:', err.message);
      setSmartError(err.message);
    } finally {
      setSmartLoading(false);
    }
  }, []);

  const fetchAllCoupons = useCallback(async () => {
    setCouponsLoading(true);
    setCouponsError(null);
    try {
      const response = await apiFetch(ENDPOINTS.fetchHebCoupons, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        mode: 'cors',
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      setCouponsData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[deals] Coupons fetch error:', err.message);
      setCouponsError(err.message);
    } finally {
      setCouponsLoading(false);
    }
  }, []);

  // Fetch both on mount
  useEffect(() => {
    fetchSmartDeals();
    fetchAllCoupons();
  }, [fetchSmartDeals, fetchAllCoupons]);

  // -----------------------------------------------------------------------
  // Filtering + sorting
  // -----------------------------------------------------------------------

  const filteredDeals = useMemo(() => {
    let result = deals;
    if (filterConfidence !== 'all') {
      result = result.filter(d => d.confidence === filterConfidence);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(d =>
        (d.frequentProduct.name && d.frequentProduct.name.toLowerCase().includes(q)) ||
        (d.frequentProduct.brand && d.frequentProduct.brand.toLowerCase().includes(q)) ||
        (d.coupon.productName && d.coupon.productName.toLowerCase().includes(q)) ||
        (d.reason && d.reason.toLowerCase().includes(q))
      );
    }
    result = [...result].sort((a, b) => {
      if (sortBy === 'savings') return (b.coupon.savingsAmount || 0) - (a.coupon.savingsAmount || 0);
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

  const filteredCoupons = useMemo(() => {
    let result = couponsData;
    if (filterType !== 'all') {
      result = result.filter(c => c.coupon_type === filterType);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(c =>
        (c.product_name && c.product_name.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q)) ||
        (c.discount && c.discount.toLowerCase().includes(q))
      );
    }
    result = [...result].sort((a, b) => {
      if (sortBy === 'savings') return (b.savings_amount || 0) - (a.savings_amount || 0);
      const dateA = a.expiration_date ? new Date(a.expiration_date) : new Date('2099-12-31');
      const dateB = b.expiration_date ? new Date(b.expiration_date) : new Date('2099-12-31');
      return dateA - dateB;
    });
    return result;
  }, [couponsData, filterType, searchText, sortBy]);

  const confidenceCounts = useMemo(() => {
    const counts = { all: deals.length, high: 0, medium: 0 };
    deals.forEach(d => { counts[d.confidence] = (counts[d.confidence] || 0) + 1; });
    return counts;
  }, [deals]);

  const typeCounts = useMemo(() => {
    const counts = { all: couponsData.length };
    couponsData.forEach(c => { counts[c.coupon_type] = (counts[c.coupon_type] || 0) + 1; });
    return counts;
  }, [couponsData]);

  // -----------------------------------------------------------------------
  // Selection helpers
  // -----------------------------------------------------------------------

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
    if (activeTab === 'smart') {
      const ids = filteredDeals
        .filter(d => d.coupon.hashId && d.coupon.clippedStatus !== 1)
        .map(d => d.coupon.hashId);
      setSelectedCoupons(new Set(ids));
    } else {
      const ids = filteredCoupons
        .filter(c => c.hash_id && c.clipped_status !== 1)
        .map(c => c.hash_id);
      setSelectedCoupons(new Set(ids));
    }
  };

  const deselectAll = () => {
    if (isClipping) return;
    setSelectedCoupons(new Set());
  };

  const selectedCount = selectedCoupons.size;
  const selectedSavings = useMemo(() => {
    // savings_amount is MySQL DECIMAL → JSON string ("10.00"). Coerce before sum
    // or `0 + "10.00"` concatenates and the later .toFixed(2) crashes.
    if (activeTab === 'smart') {
      return deals
        .filter(d => selectedCoupons.has(d.coupon.hashId))
        .reduce((sum, d) => sum + (Number(d.coupon.savingsAmount) || 0), 0);
    }
    return couponsData
      .filter(c => selectedCoupons.has(c.hash_id))
      .reduce((sum, c) => sum + (Number(c.savings_amount) || 0), 0);
  }, [activeTab, deals, couponsData, selectedCoupons]);

  // Clear selection on tab change
  useEffect(() => {
    setSelectedCoupons(new Set());
    resetClipState();
    setVisibleCouponCount(50);
  }, [activeTab, resetClipState]);

  // Reset visible count when coupon filters change
  useEffect(() => {
    setVisibleCouponCount(50);
  }, [filterType, searchText, sortBy]);

  // Re-fetch data after clipping completes so backend clipped_status is current
  useEffect(() => {
    if (clipResults && !isClipping) {
      fetchAllCoupons();
      fetchSmartDeals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipResults, isClipping]);

  // -----------------------------------------------------------------------
  // Clip selected coupons via shared hook
  // -----------------------------------------------------------------------

  const handleClipSelected = async () => {
    if (selectedCount === 0) return;
    const selectedIds = Array.from(selectedCoupons);
    await clipSelected(selectedIds);
    // Per-coupon status comes from clipProgress (SSE events); the post-completion
    // refetch reconciles clipped_status from the DB. Don't optimistically set
    // clippedStatus=1 here — that would paint failed clips as "Clipped".
    setSelectedCoupons(new Set());
  };

  // -----------------------------------------------------------------------
  // Add to list (smart deals)
  // -----------------------------------------------------------------------

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
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const result = await response.json();
      setAddingToList(prev => new Map(prev).set(dealId, result.alreadyExisted ? 'exists' : 'added'));
    } catch (err) {
      console.error('[deals] Add to list error:', err.message);
      setAddingToList(prev => new Map(prev).set(dealId, 'error'));
    }
  };

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const isLoading = activeTab === 'smart' ? smartLoading : couponsLoading;
  const error = activeTab === 'smart' ? smartError : couponsError;
  const currentItems = activeTab === 'smart' ? filteredDeals : filteredCoupons;
  const totalItems = activeTab === 'smart' ? deals.length : couponsData.length;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-body">
            {activeTab === 'smart'
              ? 'Finding deals on your frequently purchased items...'
              : 'Loading HEB coupons...'}
          </p>
          {activeTab === 'smart' && (
            <p className="mt-1 text-sm text-muted">Matching 228+ products against active coupons</p>
          )}
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
              <h1 className="text-xl sm:text-2xl font-bold font-display text-heading">Deals & Coupons</h1>
              <p className="text-sm text-muted">
                {activeTab === 'smart'
                  ? deals.length > 0
                    ? `${deals.length} deal${deals.length !== 1 ? 's' : ''} — $${totalSavings.toFixed(2)} potential savings`
                    : 'No deals found for your frequent purchases'
                  : `${couponsData.length} active coupon${couponsData.length !== 1 ? 's' : ''}`}
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
              onClick={activeTab === 'smart' ? fetchSmartDeals : fetchAllCoupons}
              className="p-2 hover:bg-background rounded-xl transition-colors text-muted hover:text-heading"
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-4 bg-background rounded-xl p-1">
          <button
            onClick={() => setActiveTab('smart')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'smart'
                ? 'bg-primary text-white shadow-sm'
                : 'text-body hover:text-heading'
            }`}
          >
            For My List
            {!smartLoading && deals.length > 0 && (
              <span className={`ml-1.5 text-xs ${activeTab === 'smart' ? 'text-white/70' : 'text-muted'}`}>
                ({deals.length})
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'text-body hover:text-heading'
            }`}
          >
            All Coupons
            {!couponsLoading && couponsData.length > 0 && (
              <span className={`ml-1.5 text-xs ${activeTab === 'all' ? 'text-white/70' : 'text-muted'}`}>
                ({couponsData.length})
              </span>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-danger-light border border-danger rounded-xl flex items-start gap-2">
            <AlertCircle className="text-danger flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-sm font-medium text-danger">Failed to load {activeTab === 'smart' ? 'deals' : 'coupons'}</p>
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
            placeholder={activeTab === 'smart'
              ? 'Search deals... (product name, brand)'
              : 'Search coupons... (e.g., chicken, pasta, milk)'}
            className="w-full pl-10 pr-4 py-2.5 border border-default rounded-xl bg-surface text-heading focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent text-sm transition-colors duration-200"
          />
        </div>

        {/* Filters */}
        <div className={`space-y-3 ${showFilters ? '' : 'hidden sm:block'}`}>
          {/* Smart Deals: confidence filters */}
          {activeTab === 'smart' && (
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
                      isActive ? 'bg-primary text-white' : 'bg-background text-body hover:bg-default'
                    }`}
                  >
                    {label}
                    <span className={`text-xs ${isActive ? 'text-primary-light' : 'text-muted'}`}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* All Coupons: type filters */}
          {activeTab === 'all' && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(TYPE_CONFIG).map(([key, config]) => {
                const Icon = config.icon;
                const count = typeCounts[key] || 0;
                const isActive = filterType === key;
                return (
                  <button
                    key={key}
                    onClick={() => setFilterType(key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isActive ? 'bg-primary text-white' : 'bg-background text-body hover:bg-background'
                    }`}
                  >
                    <Icon size={14} />
                    {config.label}
                    <span className={`text-xs ${isActive ? 'text-white/70' : 'text-muted'}`}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Sort */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-body">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm border border-default rounded-xl px-2 py-1 bg-surface text-heading focus:outline-none focus:ring-2 focus:ring-focus transition-colors duration-200"
            >
              <option value="savings">Highest Savings</option>
              {activeTab === 'smart' && <option value="confidence">Confidence</option>}
              <option value="expiration">Expiring Soonest</option>
            </select>
          </div>
        </div>
      </div>

      {/* Selection toolbar */}
      {totalItems > 0 && (
        <div className="bg-surface rounded-2xl shadow-warm border border-default p-3 mb-4 flex flex-wrap items-center gap-2 transition-colors duration-200">
          <button
            onClick={selectAllUnclipped}
            disabled={isClipping || clipServerUnavailable}
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
                disabled={isClipping || clipServerUnavailable}
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

      {/* Clip server status banner */}
      {clipServerStatus === 'unreachable' && (
        <div className="mb-4 p-3 bg-danger-light border border-danger rounded-xl flex items-start gap-2">
          <WifiOff className="text-danger flex-shrink-0 mt-0.5" size={16} />
          <div>
            <p className="text-sm font-medium text-danger">Clip server offline</p>
            <p className="text-xs text-danger">Coupon clipping is unavailable. The clip server may need to be restarted.</p>
          </div>
        </div>
      )}
      {clipServerStatus === 'expired' && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2">
          <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
          <div>
            <p className="text-sm font-medium text-amber-700">HEB session expired</p>
            <p className="text-xs text-amber-600">Coupon clipping won't work until a new session is started in Session Manager.</p>
          </div>
        </div>
      )}
      {clipServerStatus === 'expiring' && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={16} />
          <div>
            <p className="text-sm font-medium text-amber-600">HEB session expiring soon</p>
            <p className="text-xs text-amber-500">
              Session expires in {clipServerHealth?.sessionExpiresIn || 'a few hours'}. Clip coupons soon or refresh the session.
            </p>
          </div>
        </div>
      )}

      {/* Clip error/results/progress banners */}
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

      {clipProgress.size > 0 && (isClipping || Array.from(clipProgress.values()).some(s => s === 'failed')) && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            {isClipping && <Loader size={14} className="animate-spin text-blue-600" />}
            <span className="text-sm font-medium text-blue-800">
              {isClipping ? 'Clipping coupons on HEB...' : 'Clipping results'}
            </span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {Array.from(clipProgress.entries()).map(([couponId, status]) => {
              const statusStyle = CLIP_STATUS_STYLES[status] || CLIP_STATUS_STYLES.pending;
              const StatusIcon = statusStyle.icon;
              // Find label — works for both tabs
              const deal = deals.find(d => d.coupon.hashId === couponId);
              const coupon = couponsData.find(c => c.hash_id === couponId);
              const label = deal?.frequentProduct?.name || coupon?.product_name || couponId;
              const detail = status === 'failed' ? clipMessages.get(couponId) : null;
              return (
                <div key={couponId} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      {StatusIcon ? (
                        <StatusIcon size={14} className={`${statusStyle.text} ${status === 'clipping' ? 'animate-spin' : ''}`} />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-default"></span>
                      )}
                    </span>
                    <span className="text-body truncate flex-1">{label}</span>
                    <span className={`font-medium ${statusStyle.text}`}>{statusStyle.label}</span>
                  </div>
                  {detail && (
                    <p className="ml-6 text-[11px] text-red-700 truncate" title={detail}>{detail}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Results count */}
      {(searchText.trim() || (activeTab === 'smart' && filterConfidence !== 'all') || (activeTab === 'all' && filterType !== 'all')) && (
        <p className="text-sm text-muted mb-3">
          Showing {currentItems.length} of {totalItems} {activeTab === 'smart' ? 'deals' : 'coupons'}
          {searchText.trim() && ` matching "${searchText}"`}
        </p>
      )}

      {/* Deal/Coupon list */}
      {currentItems.length > 0 ? (
        activeTab === 'smart' ? (
          <div className="space-y-3">
            {filteredDeals.map((deal) => (
              <SmartDealCard
                key={deal.id}
                deal={deal}
                isSelected={selectedCoupons.has(deal.coupon.hashId)}
                onToggle={toggleCouponSelection}
                isClipping={isClipping}
                clipStatus={clipProgress.get(deal.coupon.hashId)}
                addStatus={addingToList.get(deal.id)}
                onAddToList={handleAddToList}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {filteredCoupons.slice(0, visibleCouponCount).map((coupon) => (
                <CouponCard
                  key={coupon.hash_id}
                  coupon={coupon}
                  isSelected={selectedCoupons.has(coupon.hash_id)}
                  onToggle={toggleCouponSelection}
                  isClipping={isClipping}
                />
              ))}
            </div>
            {visibleCouponCount < filteredCoupons.length && (
              <div className="text-center mt-4">
                <button
                  onClick={() => setVisibleCouponCount(prev => prev + 50)}
                  className="px-6 py-2 bg-primary-light text-primary font-medium rounded-xl hover:bg-primary hover:text-white transition-colors"
                >
                  Show more ({filteredCoupons.length - visibleCouponCount} remaining)
                </button>
              </div>
            )}
          </>
        )
      ) : (
        <div className="text-center py-16 bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
          <Tag size={48} className="mx-auto text-default mb-4" />
          <h3 className="text-lg font-semibold text-body">
            {totalItems === 0
              ? activeTab === 'smart' ? 'No Deals Found' : 'No Coupons Available'
              : 'No matching results'}
          </h3>
          <p className="text-muted mt-1">
            {totalItems === 0
              ? activeTab === 'smart'
                ? 'None of your frequently purchased items currently have matching coupons.'
                : 'Could not load coupons. Try refreshing.'
              : 'Try a different search term or filter.'}
          </p>
          {totalItems === 0 && (
            <button
              onClick={activeTab === 'smart' ? fetchSmartDeals : fetchAllCoupons}
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

export default Deals;
