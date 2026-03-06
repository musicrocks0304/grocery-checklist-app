import React, { useState, useEffect, useMemo } from 'react';
import { Ticket, Search, AlertCircle, ChevronDown, ChevronUp, Calendar, DollarSign, Percent, Gift, Tag } from 'lucide-react';
import { ENDPOINTS, apiFetch } from '../config/api';

const WEBHOOK_URL = ENDPOINTS.fetchHebCoupons;

const TYPE_CONFIG = {
  'all': { label: 'All', icon: Ticket, badgeClass: 'bg-blue-100 text-blue-700' },
  'dollar-off': { label: 'Dollar Off', icon: DollarSign, badgeClass: 'bg-primary-light text-primary' },
  'percentage': { label: '% Off', icon: Percent, badgeClass: 'bg-purple-100 text-purple-700' },
  'bogo': { label: 'BOGO', icon: Gift, badgeClass: 'bg-accent-light text-accent' },
  'other': { label: 'Other', icon: Tag, badgeClass: 'bg-background text-heading' },
};

const CouponCard = ({ coupon }) => {
  const daysLeft = useMemo(() => {
    if (!coupon.expiration_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(coupon.expiration_date);
    return Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
  }, [coupon.expiration_date]);

  const typeConfig = TYPE_CONFIG[coupon.coupon_type] || TYPE_CONFIG['other'];
  const TypeIcon = typeConfig.icon;

  return (
    <div className="border border-default rounded-2xl overflow-hidden hover:shadow-warm transition-shadow bg-surface transition-colors duration-200">
      {/* Image */}
      {coupon.image_url && (
        <div className="w-full h-36 bg-background flex items-center justify-center overflow-hidden">
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
          {daysLeft !== null && (
            <span className={`text-xs font-medium flex items-center gap-1 ${
              daysLeft <= 3 ? 'text-danger' : daysLeft <= 7 ? 'text-accent' : 'text-muted'
            }`}>
              <Calendar size={12} />
              {daysLeft <= 0 ? 'Expired' : daysLeft === 1 ? '1 day left' : `${daysLeft} days`}
            </span>
          )}
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

        {/* Uses limit */}
        {coupon.uses_limit && (
          <p className="text-xs text-muted mt-1">
            {coupon.uses_limit}
          </p>
        )}
      </div>
    </div>
  );
};

const Coupons = ({ onNavigate, onToggleSidebar }) => {
  const [couponsData, setCouponsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('expiration'); // 'expiration' or 'savings'
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchCoupons = async () => {
      try {
        setError(null);
        const response = await apiFetch(WEBHOOK_URL, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          mode: 'cors',
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();
        setCouponsData(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('[coupons] Fetch error:', err.message);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCoupons();
  }, []);

  const filteredCoupons = useMemo(() => {
    let result = couponsData;

    // Type filter
    if (filterType !== 'all') {
      result = result.filter(c => c.coupon_type === filterType);
    }

    // Search filter
    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      result = result.filter(c =>
        (c.product_name && c.product_name.toLowerCase().includes(query)) ||
        (c.description && c.description.toLowerCase().includes(query)) ||
        (c.discount && c.discount.toLowerCase().includes(query))
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === 'savings') {
        return (b.savings_amount || 0) - (a.savings_amount || 0);
      }
      // Default: expiration (soonest first)
      const dateA = a.expiration_date ? new Date(a.expiration_date) : new Date('2099-12-31');
      const dateB = b.expiration_date ? new Date(b.expiration_date) : new Date('2099-12-31');
      return dateA - dateB;
    });

    return result;
  }, [couponsData, filterType, searchText, sortBy]);

  // Count by type
  const typeCounts = useMemo(() => {
    const counts = { all: couponsData.length };
    couponsData.forEach(c => {
      counts[c.coupon_type] = (counts[c.coupon_type] || 0) + 1;
    });
    return counts;
  }, [couponsData]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-body">Loading HEB coupons...</p>
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
            <div className="bg-danger text-white p-2 rounded-xl">
              <Ticket size={24} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-bold text-heading">HEB Digital Coupons</h1>
              <p className="text-sm text-muted">
                {couponsData.length} active coupon{couponsData.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1 text-sm text-body hover:text-heading sm:hidden"
          >
            Filters {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger-light border border-danger rounded-xl flex items-start gap-2">
            <AlertCircle className="text-danger flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-sm font-medium text-danger">Failed to load coupons</p>
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
            placeholder="Search coupons... (e.g., chicken, pasta, milk)"
            className="w-full pl-10 pr-4 py-2.5 border border-default rounded-xl focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent text-sm"
          />
        </div>

        {/* Filters — always visible on desktop, toggle on mobile */}
        <div className={`space-y-3 ${showFilters ? '' : 'hidden sm:block'}`}>
          {/* Type filter pills */}
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
                    isActive
                      ? 'bg-primary text-white'
                      : 'bg-background text-body hover:bg-background'
                  }`}
                >
                  <Icon size={14} />
                  {config.label}
                  <span className={`text-xs ${isActive ? 'text-white/70' : 'text-muted'}`}>
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
              <option value="expiration">Expiring Soonest</option>
              <option value="savings">Highest Savings</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results count */}
      {searchText.trim() || filterType !== 'all' ? (
        <p className="text-sm text-muted mb-3">
          Showing {filteredCoupons.length} of {couponsData.length} coupons
          {searchText.trim() && ` matching "${searchText}"`}
        </p>
      ) : null}

      {/* Coupon Grid */}
      {filteredCoupons.length > 0 ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {filteredCoupons.map((coupon) => (
            <CouponCard key={coupon.hash_id} coupon={coupon} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-surface rounded-2xl shadow-warm border border-default transition-colors duration-200">
          <Ticket size={48} className="mx-auto text-muted mb-4" />
          <h3 className="text-lg font-semibold text-body">No coupons found</h3>
          <p className="text-muted mt-1">
            {searchText.trim()
              ? 'Try a different search term.'
              : 'No coupons match the selected filter.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Coupons;
