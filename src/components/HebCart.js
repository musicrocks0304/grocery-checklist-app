import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ShoppingCart, Wifi, WifiOff, Search, Check, X, RefreshCw,
  AlertCircle, ChevronRight, Zap, Loader2,
  CheckCircle2, XCircle, SkipForward, ArrowRight, Eye, Star,
} from 'lucide-react';
import { ENDPOINTS, apiFetch } from '../config/api';
import { getWeekDateRange } from '../utils/weekDates';
import toast from 'react-hot-toast';

// ─── Step indicator ─────────────────────────────────────────────
const STEPS = [
  { id: 'connect', label: 'Connect' },
  { id: 'match', label: 'Smart Match' },
  { id: 'review', label: 'Review' },
  { id: 'build', label: 'Build Cart' },
];

const StepIndicator = ({ currentStep }) => {
  const stepIndex = STEPS.findIndex(s => s.id === currentStep);

  return (
    <div className="flex items-center gap-1 sm:gap-2 mb-6">
      {STEPS.map((step, i) => {
        const isActive = i === stepIndex;
        const isDone = i < stepIndex;
        return (
          <React.Fragment key={step.id}>
            {i > 0 && (
              <div className={`flex-1 h-0.5 ${isDone ? 'bg-primary' : 'bg-gray-200'}`} />
            )}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                isDone ? 'bg-primary text-white' :
                isActive ? 'bg-primary text-white ring-2 ring-primary ring-offset-2' :
                'bg-gray-200 text-muted'
              }`}>
                {isDone ? <Check size={14} /> : i + 1}
              </div>
              <span className={`text-xs sm:text-sm font-medium hidden sm:inline ${
                isActive ? 'text-heading' : isDone ? 'text-primary' : 'text-muted'
              }`}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── Connection Panel (Step 1) ──────────────────────────────────
const ConnectionPanel = ({ sessionStatus, onConnect, onDisconnect, connecting }) => {
  const isActive = sessionStatus?.active;
  const loginValid = sessionStatus?.loginSessionValid;

  return (
    <div className="bg-surface rounded-xl shadow-lg border border-default p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {isActive ? <Wifi size={24} /> : <WifiOff size={24} />}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-heading">HEB Connection</h2>
          <p className="text-sm text-muted">
            {isActive
              ? `Browser session active (idle ${sessionStatus.idleSeconds}s)`
              : loginValid
                ? 'Ready to connect'
                : 'HEB login session expired'}
          </p>
        </div>
      </div>

      {!loginValid && !isActive && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm font-medium text-amber-800">HEB login expired</p>
            <p className="text-xs text-amber-700 mt-1">
              Run <code className="bg-amber-100 px-1 rounded">npm run scrape:login</code> on the server to re-authenticate with HEB.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {!isActive ? (
          <button
            onClick={onConnect}
            disabled={connecting || !loginValid}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
              connecting || !loginValid
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary-hover'
            }`}
          >
            {connecting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Launching browser...
              </>
            ) : (
              <>
                <Wifi size={16} />
                Connect to HEB
              </>
            )}
          </button>
        ) : (
          <button
            onClick={onDisconnect}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-gray-100 text-body hover:bg-gray-200 transition-colors"
          >
            <WifiOff size={16} />
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Match Card (single grocery item in review) ─────────────────
const MatchCard = React.memo(({ item, match, onConfirm, onReject, onSearch, onSwap }) => {
  const hasMatch = match && match.hebProductId;
  const isConfirmed = match?.userConfirmed;
  const confidence = match?.confidence;

  const confidenceColors = {
    high: 'bg-green-100 text-green-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-red-100 text-red-700',
  };

  const isCouponMatch = match?.matchSource === 'coupon';

  return (
    <div className={`border rounded-lg p-3 transition-all ${
      isCouponMatch ? 'border-l-4 border-l-green-500 border-green-200 bg-green-50/30' :
      isConfirmed ? 'border-green-300 bg-green-50/50' :
      hasMatch ? 'border-default bg-surface' :
      'border-amber-200 bg-amber-50/50'
    }`}>
      <div className="flex items-start gap-3">
        {/* Grocery item name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-heading truncate">{item.ItemName}</span>
            {item.Quantity > 1 && (
              <span className="text-xs font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                x{item.Quantity}
              </span>
            )}
            <span className="text-xs text-muted bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">
              {item.Category}
            </span>
          </div>

          {hasMatch ? (
            <div className="flex items-center gap-2 mt-1.5">
              {match.hebImageUrl && (
                <img
                  src={match.hebImageUrl}
                  alt={match.hebProductName}
                  className="w-10 h-10 object-contain rounded border border-gray-100 flex-shrink-0"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-body truncate">{match.hebProductName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {match.hebPrice && (
                    <span className="text-sm font-medium text-green-700">${Number(match.hebPrice).toFixed(2)}</span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${confidenceColors[confidence] || 'bg-gray-100 text-gray-600'}`}>
                    {confidence}
                  </span>
                  {match.matchSource === 'frequently_purchased' && (
                    <span className="text-xs text-blue-600 flex items-center gap-0.5">
                      <Star size={10} /> Repeat buy
                    </span>
                  )}
                  {isCouponMatch && item.couponSavings && (
                    <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full font-medium">
                      Save ${Number(item.couponSavings).toFixed(2)}{item.couponClipped ? ' | Clipped' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-600 mt-1">No match found — search manually</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          {hasMatch && !isConfirmed && (
            <>
              <button
                onClick={() => onConfirm(item.ItemID, match)}
                className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                title="Accept match"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => onReject(item.ItemID, match)}
                className="p-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                title="Reject match"
              >
                <X size={16} />
              </button>
            </>
          )}
          {isConfirmed && (
            <div className="p-1.5 rounded-lg bg-green-100 text-green-700" title="Confirmed">
              <CheckCircle2 size={16} />
            </div>
          )}
          <button
            onClick={() => onSearch(item)}
            className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            title="Search for alternative"
          >
            <Search size={16} />
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── Search Modal ───────────────────────────────────────────────
const SearchModal = ({ item, onSelect, onClose, sessionActive }) => {
  const [query, setQuery] = useState(item?.ItemName || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);

    try {
      const res = await fetch(`${ENDPOINTS.hebSearch}?q=${encodeURIComponent(query)}&maxResults=12`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'NO_SESSION') throw new Error('Browser session disconnected. Please reconnect.');
        throw new Error(`Search failed (${res.status})`);
      }
      const data = await res.json();
      setResults(data.products || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 sm:pt-20 px-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-default flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-heading">Find HEB Product</h3>
            <p className="text-xs text-muted">for: {item?.ItemName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={20} className="text-muted" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-4 border-b border-default">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search HEB products..."
                className="w-full pl-9 pr-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-focus text-sm"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !sessionActive}
              className={`px-4 py-2 rounded-lg font-medium text-sm ${
                searching || !sessionActive
                  ? 'bg-gray-300 text-gray-500'
                  : 'bg-primary text-white hover:bg-primary-hover'
              }`}
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
            </button>
          </div>
          {!sessionActive && (
            <p className="text-xs text-red-600 mt-1">Browser session required for search</p>
          )}
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {results.length === 0 && !searching ? (
            <p className="text-center text-muted text-sm py-8">
              {query.trim() ? 'No results. Try a different search.' : 'Enter a search term'}
            </p>
          ) : (
            <div className="space-y-2">
              {results.map((product) => (
                <button
                  key={product.id}
                  onClick={() => onSelect(item.ItemID, product)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-default hover:border-primary hover:bg-green-50 transition-colors text-left"
                >
                  {product.imageUrl && (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-12 h-12 object-contain rounded flex-shrink-0"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-heading truncate">{product.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {product.price && (
                        <span className="text-sm font-medium text-green-700">${Number(product.price).toFixed(2)}</span>
                      )}
                      {product.brand && <span className="text-xs text-muted">{product.brand}</span>}
                      {product.inStock === false && (
                        <span className="text-xs text-red-600">Out of stock</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-muted flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Build Progress Panel (Step 4) ──────────────────────────────
const BuildProgressPanel = ({ progress, summary, totalItems }) => {
  const completedCount = progress.filter(p =>
    p.status === 'added' || p.status === 'failed' || p.status === 'skipped'
  ).length;

  const isComplete = !!summary;
  const pct = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  return (
    <div className="bg-surface rounded-xl shadow-lg border border-default p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${isComplete ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          {isComplete ? <CheckCircle2 size={24} /> : <Loader2 size={24} className="animate-spin" />}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-heading">
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
      <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
        <div
          className="bg-primary h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${isComplete ? 100 : pct}%` }}
        />
      </div>

      {/* Summary stats */}
      {isComplete && summary && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-700">{summary.added}</div>
            <div className="text-xs text-green-600">Added</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="text-2xl font-bold text-red-700">{summary.failed}</div>
            <div className="text-xs text-red-600">Failed</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-gray-700">{summary.skipped}</div>
            <div className="text-xs text-gray-600">Skipped</div>
          </div>
        </div>
      )}

      {/* Item-by-item progress */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {progress.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {p.status === 'adding' && <Loader2 size={14} className="animate-spin text-blue-500 flex-shrink-0" />}
            {p.status === 'added' && <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />}
            {p.status === 'failed' && <XCircle size={14} className="text-red-600 flex-shrink-0" />}
            {p.status === 'skipped' && <SkipForward size={14} className="text-gray-400 flex-shrink-0" />}
            <span className={`truncate ${
              p.status === 'added' ? 'text-green-700' :
              p.status === 'failed' ? 'text-red-600' :
              p.status === 'skipped' ? 'text-gray-400' :
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

// ─── Main HEB Cart Component ────────────────────────────────────
const HebCart = ({ onNavigate, onToggleSidebar }) => {
  // --- State ---
  const [step, setStep] = useState('connect');
  const [sessionStatus, setSessionStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [groceryItems, setGroceryItems] = useState([]);
  const [matches, setMatches] = useState({}); // { [ItemID]: matchObj }
  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState('');
  const [searchItem, setSearchItem] = useState(null); // item being searched
  const [buildProgress, setBuildProgress] = useState([]);
  const [buildSummary, setBuildSummary] = useState(null);
  const [loadingGroceries, setLoadingGroceries] = useState(false);
  const eventSourceRef = useRef(null);

  // --- Session polling ---
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINTS.hebSessionStatus);
      if (res.ok) {
        const data = await res.json();
        setSessionStatus(data);
        return data;
      }
    } catch {
      setSessionStatus({ active: false, loginSessionValid: false });
    }
    return null;
  }, []);

  useEffect(() => {
    checkSession();
    const interval = setInterval(checkSession, 30000);
    return () => clearInterval(interval);
  }, [checkSession]);

  // --- Connect ---
  const startSession = useCallback(async () => {
    const res = await fetch(ENDPOINTS.hebSessionStart, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless: true }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `Failed (${res.status})`);
    }
    const data = await res.json();
    setSessionStatus({ active: true, sessionId: data.sessionId, loginSessionValid: true, idleSeconds: 0 });
    return data;
  }, []);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      await startSession();
      toast.success('Connected to HEB!');
      setStep('match');
    } catch (err) {
      toast.error(`Connection failed: ${err.message}`);
    } finally {
      setConnecting(false);
    }
  }, [startSession]);

  /**
   * Ensures an active browser session exists. If the session timed out
   * (10-min inactivity), it automatically reconnects.
   * Returns true if session is active (or was reconnected), false on failure.
   */
  const ensureSession = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINTS.hebSessionStatus);
      if (res.ok) {
        const data = await res.json();
        if (data.active) return true;
      }
      // Session not active — try to reconnect
      toast.loading('Reconnecting to HEB...', { id: 'reconnect' });
      await startSession();
      toast.success('Reconnected to HEB!', { id: 'reconnect' });
      return true;
    } catch (err) {
      toast.error(`Could not reconnect: ${err.message}`, { id: 'reconnect' });
      return false;
    }
  }, [startSession]);

  const handleDisconnect = useCallback(async () => {
    try {
      await fetch(ENDPOINTS.hebSessionEnd, { method: 'POST' });
      setSessionStatus({ active: false, loginSessionValid: sessionStatus?.loginSessionValid });
      setStep('connect');
      toast.success('Disconnected from HEB');
    } catch {
      toast.error('Failed to disconnect');
    }
  }, [sessionStatus]);

  // --- Load weekly grocery items + coupon data + existing matches ---
  const loadGroceryItems = useCallback(async () => {
    setLoadingGroceries(true);
    setMatchProgress('Loading your weekly grocery list...');
    try {
      // Fetch current week's grocery list with coupon data
      const weekDateRange = getWeekDateRange();
      const weeklyRes = await fetch(
        `${ENDPOINTS.hebWeeklyItems}?weekDateRange=${encodeURIComponent(weekDateRange)}`
      );
      if (!weeklyRes.ok) throw new Error('Failed to load weekly grocery list');
      const weeklyData = await weeklyRes.json();
      const items = weeklyData.items || [];

      if (items.length === 0) {
        setGroceryItems([]);
        setMatches({});
        return { items: [], savedMatches: {} };
      }

      setGroceryItems(items);

      // Load existing saved matches for these items
      setMatchProgress('Loading saved product matches...');
      const matchRes = await fetch(ENDPOINTS.hebMatchesAll);
      let savedMatches = {};
      if (matchRes.ok) {
        const matchData = await matchRes.json();
        if (matchData.matches) {
          for (const m of matchData.matches) {
            // Key by grocery_item_id, prefer confirmed
            if (!savedMatches[m.grocery_item_id] || m.user_confirmed) {
              savedMatches[m.grocery_item_id] = {
                hebProductId: m.heb_product_id,
                hebSkuId: m.heb_sku_id,
                hebProductName: m.heb_product_name,
                hebProductUrl: m.heb_product_url,
                hebImageUrl: m.heb_image_url,
                hebPrice: m.heb_price,
                hebCategory: m.heb_category,
                confidence: m.confidence,
                matchSource: m.match_source,
                matchReason: m.match_reason,
                userConfirmed: !!m.user_confirmed,
              };
            }
          }
        }
      }
      setMatches(savedMatches);

      return { items, savedMatches };
    } catch (err) {
      toast.error(err.message);
      return { items: [], savedMatches: {} };
    } finally {
      setLoadingGroceries(false);
    }
  }, []);

  // --- Smart Match (AI) ---
  const runSmartMatch = useCallback(async () => {
    setIsMatching(true);
    setMatchProgress('Loading grocery list...');

    try {
      const { items, savedMatches } = await loadGroceryItems();
      if (items.length === 0) {
        toast.error('No items found for this week. Save your grocery list first!');
        setIsMatching(false);
        return;
      }

      // Determine which items need AI matching (no confirmed match)
      const needsMatch = items.filter(item => !savedMatches[item.ItemID]?.userConfirmed);
      const alreadyMatched = items.filter(item => savedMatches[item.ItemID]?.userConfirmed);

      if (needsMatch.length === 0) {
        toast.success(`All ${alreadyMatched.length} items have confirmed matches!`);
        setStep('review');
        setIsMatching(false);
        return;
      }

      // Fetch cached frequently purchased products (no browser session needed)
      setMatchProgress('Loading your frequently purchased items...');
      let frequentProducts = [];
      try {
        const freqRes = await fetch(ENDPOINTS.hebFrequentCached);
        if (freqRes.ok) {
          const freqData = await freqRes.json();
          frequentProducts = freqData.products || [];
          if (frequentProducts.length > 0) {
            console.log(`[heb-cart] Loaded ${frequentProducts.length} cached frequent products`);
          } else {
            console.log('[heb-cart] No cached frequent products — run scrape:frequent to populate');
          }
        }
      } catch {} // non-critical

      // Batch items for AI matching (up to 10 at a time to avoid token limits)
      const BATCH_SIZE = 10;
      const batches = [];
      for (let i = 0; i < needsMatch.length; i += BATCH_SIZE) {
        batches.push(needsMatch.slice(i, i + BATCH_SIZE));
      }

      const newMatches = { ...savedMatches };

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        const batchStart = batchIdx * BATCH_SIZE + 1;
        const batchEnd = Math.min((batchIdx + 1) * BATCH_SIZE, needsMatch.length);

        // Step 1: Batch search HEB for all items in this batch (parallel on server)
        setMatchProgress(
          `Searching HEB for items ${batchStart}-${batchEnd} of ${needsMatch.length} (3 parallel workers)...`
        );

        // Build search queries — use generic item name as primary search
        // Coupon product names are often too specific (e.g. "H-E-B Natural Lean Ground Turkey, 93% Lean")
        // and may not return results, so search with the generic grocery item name instead.
        const searchQueries = batch.map(item => item.ItemName);

        // Also prepare coupon-specific searches for items that have coupons
        const couponQueries = [];
        const couponQueryIndexes = [];
        batch.forEach((item, idx) => {
          if (item.couponProductName) {
            const couponSearch = item.couponProductName.split(',')[0].trim().substring(0, 60);
            if (couponSearch.toLowerCase() !== item.ItemName.toLowerCase()) {
              couponQueries.push(couponSearch);
              couponQueryIndexes.push(idx);
            }
          }
        });

        let searchResultsMap = {};
        try {
          // Primary search with generic item names
          const batchSearchRes = await fetch(ENDPOINTS.hebSearchBatch, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              queries: searchQueries,
              maxResults: 12,
            }),
          });
          if (batchSearchRes.ok) {
            const batchSearchData = await batchSearchRes.json();
            searchResultsMap = batchSearchData.results || {};
          }

          // Secondary search with coupon product names (if any)
          if (couponQueries.length > 0) {
            const couponSearchRes = await fetch(ENDPOINTS.hebSearchBatch, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                queries: couponQueries,
                maxResults: 6,
              }),
            });
            if (couponSearchRes.ok) {
              const couponSearchData = await couponSearchRes.json();
              const couponResults = couponSearchData.results || {};

              // Merge coupon search results into the primary results
              couponQueries.forEach((cq, i) => {
                const itemName = searchQueries[couponQueryIndexes[i]];
                const existing = searchResultsMap[itemName]?.products || [];
                const couponProducts = couponResults[cq]?.products || [];

                // Add coupon search results that aren't already in the primary results
                const existingIds = new Set(existing.map(p => String(p.id)));
                const newProducts = couponProducts.filter(p => !existingIds.has(String(p.id)));

                if (newProducts.length > 0) {
                  searchResultsMap[itemName] = {
                    ...searchResultsMap[itemName],
                    success: true,
                    products: [...existing, ...newProducts],
                  };
                  console.log(`[heb-cart] Added ${newProducts.length} coupon search results for "${itemName}" from coupon query "${cq}"`);
                }
              });
            }
          }
        } catch (err) {
          console.error('[heb-cart] Batch search error:', err.message);
        }

        // Step 2: Build AI match request
        setMatchProgress(
          `AI matching items ${batchStart}-${batchEnd} of ${needsMatch.length}...`
        );

        const batchItems = batch.map((item, idx) => ({
          groceryItemId: item.ItemID,
          groceryItemName: item.ItemName,
          category: item.Category,
          quantity: item.Quantity || 1,
          coupon: item.couponHashId ? {
            productName: item.couponProductName,
            savings: item.couponSavings,
            discount: item.couponDiscount,
            clipped: item.couponClipped,
          } : null,
          searchResults: (searchResultsMap[searchQueries[idx]]?.products || []).map(sr => ({
            name: sr.name,
            id: sr.id,
            skuId: sr.skuId,
            price: sr.price,
            brand: sr.brand,
            inStock: sr.inStock,
            productUrl: sr.productUrl,
            imageUrl: sr.imageUrl,
            category: sr.category,
          })),
        }));

        // Send frequent products at batch level (not per-item) to save tokens
        const batchFrequentProducts = frequentProducts.map(fp => ({
          name: fp.name,
          id: fp.id,
          skuId: fp.skuId,
          price: fp.price,
          category: fp.category,
          productUrl: fp.productUrl,
          imageUrl: fp.imageUrl,
        }));

        // Step 3: Call AI Smart Match
        try {
          const aiRes = await apiFetch(ENDPOINTS.hebSmartMatch, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: batchItems, frequentProducts: batchFrequentProducts }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            // n8n returns array, take first item
            const resultObj = Array.isArray(aiData) ? aiData[0] : aiData;
            const aiMatches = resultObj?.matches || [];

            // Log server-side validation drops (if any)
            if (resultObj?.droppedCount > 0) {
              console.warn(`[heb-cart] Server dropped ${resultObj.droppedCount} hallucinated match(es):`, resultObj.droppedMatches);
            }

            // Client-side validation: ensure every match references a real product
            const allValidProductIds = new Set();
            for (const query of searchQueries) {
              const products = searchResultsMap[query]?.products || [];
              for (const p of products) {
                if (p.id) allValidProductIds.add(String(p.id));
              }
            }
            for (const fp of frequentProducts) {
              if (fp.id) allValidProductIds.add(String(fp.id));
            }

            const validatedAiMatches = aiMatches.filter(m => {
              if (!m.hebProductId) return false;
              return allValidProductIds.has(String(m.hebProductId));
            });

            if (validatedAiMatches.length < aiMatches.length) {
              const dropped = aiMatches.length - validatedAiMatches.length;
              console.warn(`[heb-cart] Client-side validation dropped ${dropped} match(es) with unknown product IDs`);
            }

            for (const m of validatedAiMatches) {
              newMatches[m.groceryItemId] = {
                hebProductId: m.hebProductId,
                hebSkuId: m.hebSkuId,
                hebProductName: m.hebProductName,
                hebProductUrl: m.hebProductUrl,
                hebImageUrl: m.hebImageUrl,
                hebPrice: m.hebPrice,
                hebCategory: m.hebCategory,
                confidence: m.confidence,
                matchSource: m.matchSource,
                matchReason: m.matchReason,
                userConfirmed: false,
              };

              // Save to DB (fire and forget)
              fetch(ENDPOINTS.hebMatches, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  groceryItemId: m.groceryItemId,
                  groceryItemName: m.groceryItemName,
                  hebProductId: m.hebProductId,
                  hebSkuId: m.hebSkuId,
                  hebProductName: m.hebProductName,
                  hebProductUrl: m.hebProductUrl,
                  hebImageUrl: m.hebImageUrl,
                  hebPrice: m.hebPrice,
                  hebCategory: m.hebCategory,
                  matchSource: m.matchSource,
                  confidence: m.confidence,
                  matchReason: m.matchReason,
                }),
              }).catch(() => {}); // Non-critical, fire and forget
            }

            // Update matches progressively so user sees results appearing
            setMatches(prev => ({ ...prev, ...newMatches }));
          }
        } catch (err) {
          console.error('[heb-cart] AI match batch error:', err.message);
          toast.error(`AI matching failed for batch ${batchIdx + 1}: ${err.message}`);
        }
      }

      setMatches(newMatches);

      const matchCount = Object.keys(newMatches).length;
      const confirmedCount = Object.values(newMatches).filter(m => m.userConfirmed).length;
      toast.success(`Smart matching complete! ${matchCount} matches (${confirmedCount} pre-confirmed)`);
      setStep('review');
    } catch (err) {
      toast.error(`Smart matching failed: ${err.message}`);
    } finally {
      setIsMatching(false);
      setMatchProgress('');
    }
  }, [loadGroceryItems]);

  // --- Confirm / Reject / Manual Select ---
  const handleConfirm = useCallback(async (itemId, match) => {
    setMatches(prev => ({
      ...prev,
      [itemId]: { ...match, userConfirmed: true },
    }));

    // Persist to DB
    try {
      await fetch(ENDPOINTS.hebMatchConfirm, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groceryItemId: itemId, hebProductId: match.hebProductId }),
      });
    } catch {} // Non-critical
  }, []);

  const handleReject = useCallback(async (itemId, match) => {
    // Remove the match from local state
    setMatches(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

    // Persist rejection
    try {
      await fetch(ENDPOINTS.hebMatchReject, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groceryItemId: itemId, hebProductId: match.hebProductId }),
      });
    } catch {} // Non-critical
  }, []);

  const handleManualSelect = useCallback(async (itemId, product) => {
    const newMatch = {
      hebProductId: product.id,
      hebSkuId: product.skuId,
      hebProductName: product.name,
      hebProductUrl: product.productUrl,
      hebImageUrl: product.imageUrl,
      hebPrice: product.price,
      hebCategory: product.category,
      confidence: 'high',
      matchSource: 'manual',
      matchReason: 'User selected manually',
      userConfirmed: true,
    };

    setMatches(prev => ({ ...prev, [itemId]: newMatch }));
    setSearchItem(null);

    // Save to DB
    try {
      const item = groceryItems.find(i => i.ItemID === itemId);
      await fetch(ENDPOINTS.hebMatches, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groceryItemId: itemId,
          groceryItemName: item?.ItemName || '',
          hebProductId: product.id,
          hebSkuId: product.skuId,
          hebProductName: product.name,
          hebProductUrl: product.productUrl,
          hebImageUrl: product.imageUrl,
          hebPrice: product.price,
          hebCategory: product.category,
          matchSource: 'manual',
          confidence: 'high',
          matchReason: 'User selected manually',
        }),
      });
      await fetch(ENDPOINTS.hebMatchConfirm, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groceryItemId: itemId, hebProductId: product.id }),
      });
    } catch {} // Non-critical

    toast.success(`Selected: ${product.name}`);
  }, [groceryItems]);

  // --- Confirm All ---
  const handleConfirmAll = useCallback(async () => {
    const updated = { ...matches };
    for (const [itemId, match] of Object.entries(updated)) {
      if (!match.userConfirmed && match.hebProductId) {
        updated[itemId] = { ...match, userConfirmed: true };
        // Persist
        try {
          await fetch(ENDPOINTS.hebMatchConfirm, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groceryItemId: itemId, hebProductId: match.hebProductId }),
          });
        } catch {}
      }
    }
    setMatches(updated);
    toast.success('All matches confirmed!');
  }, [matches]);

  // --- Build Cart ---
  const handleBuildCart = useCallback(async () => {
    const itemsToAdd = groceryItems
      .map(item => {
        const match = matches[item.ItemID];
        if (!match || !match.hebProductUrl) return null;
        return {
          groceryItemId: item.ItemID,
          groceryItemName: item.ItemName,
          productUrl: match.hebProductUrl,
          hebProductId: match.hebProductId,
        };
      })
      .filter(Boolean);

    if (itemsToAdd.length === 0) {
      toast.error('No items to add. Confirm at least one match.');
      return;
    }

    // Ensure browser session is still active (may have timed out during review)
    const sessionOk = await ensureSession();
    if (!sessionOk) {
      toast.error('Cannot build cart without an active HEB session. Please reconnect.');
      setStep('connect');
      return;
    }

    setStep('build');
    setBuildProgress([]);
    setBuildSummary(null);

    try {
      const res = await fetch(ENDPOINTS.hebBuildCart, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToAdd }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Failed (${res.status})`);
      }

      const { jobId } = await res.json();

      // Connect to SSE for progress
      const evtSource = new EventSource(`${ENDPOINTS.hebBuildProgress}/${jobId}`);
      eventSourceRef.current = evtSource;

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'progress') {
            setBuildProgress(prev => {
              const updated = [...prev];
              // Update or add progress entry
              const existingIdx = updated.findIndex(p => p.index === data.index);
              if (existingIdx >= 0) {
                updated[existingIdx] = data;
              } else {
                updated.push(data);
              }
              return updated;
            });
          }

          if (data.type === 'complete') {
            setBuildSummary(data.summary);
            evtSource.close();
            toast.success(`Cart built! ${data.summary.added} items added.`);
          }

          if (data.type === 'error') {
            evtSource.close();
            toast.error(`Build error: ${data.message}`);
          }
        } catch (err) {
          console.error('[heb-cart] SSE parse error:', err);
        }
      };

      evtSource.onerror = () => {
        evtSource.close();
      };
    } catch (err) {
      toast.error(`Failed to start build: ${err.message}`);
      setStep('review');
    }
  }, [groceryItems, matches, ensureSession]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // --- Computed values ---
  const matchStats = useMemo(() => {
    const total = groceryItems.length;
    const matched = groceryItems.filter(i => matches[i.ItemID]?.hebProductId).length;
    const confirmed = groceryItems.filter(i => matches[i.ItemID]?.userConfirmed).length;
    const unmatched = total - matched;
    return { total, matched, confirmed, unmatched };
  }, [groceryItems, matches]);

  const estimatedTotal = useMemo(() => {
    return groceryItems.reduce((sum, item) => {
      const m = matches[item.ItemID];
      const qty = item.Quantity || 1;
      return sum + (m?.hebPrice ? Number(m.hebPrice) * qty : 0);
    }, 0);
  }, [groceryItems, matches]);

  const couponSavingsTotal = useMemo(() => {
    return groceryItems.reduce((sum, item) => {
      const m = matches[item.ItemID];
      if (m?.matchSource === 'coupon' && item.couponSavings) {
        const qty = item.Quantity || 1;
        return sum + (Number(item.couponSavings) * qty);
      }
      return sum;
    }, 0);
  }, [groceryItems, matches]);

  // --- Auto-advance from connect when session is already active ---
  useEffect(() => {
    if (sessionStatus?.active && step === 'connect') {
      setStep('match');
    }
  }, [sessionStatus, step]);

  // --- Pre-load weekly items when entering the match step ---
  useEffect(() => {
    if (step === 'match' && groceryItems.length === 0 && !loadingGroceries) {
      loadGroceryItems();
    }
  }, [step, groceryItems.length, loadingGroceries, loadGroceryItems]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="bg-surface rounded-xl shadow-lg border border-default p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 text-white p-2 rounded-lg">
              <ShoppingCart size={24} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-heading">HEB Cart Builder</h1>
              <p className="text-sm text-muted">AI-powered grocery cart building</p>
            </div>
          </div>
          {sessionStatus?.active && (
            <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">
              <Wifi size={12} />
              Connected
            </div>
          )}
        </div>

        <StepIndicator currentStep={step} />
      </div>

      {/* Step 1: Connection */}
      {step === 'connect' && (
        <ConnectionPanel
          sessionStatus={sessionStatus}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          connecting={connecting}
        />
      )}

      {/* Step 2: Smart Match */}
      {step === 'match' && (
        <div className="bg-surface rounded-xl shadow-lg border border-default p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
              <Zap size={24} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-heading">Smart Match</h2>
              <p className="text-sm text-muted">
                AI will match your grocery list to HEB products using search results and your purchase history.
              </p>
            </div>
          </div>

          {isMatching ? (
            <div className="text-center py-8">
              <Loader2 size={40} className="animate-spin text-primary mx-auto mb-4" />
              <p className="text-body font-medium">{matchProgress}</p>
              <p className="text-sm text-muted mt-1">This may take a minute...</p>
            </div>
          ) : groceryItems.length === 0 && !loadingGroceries ? (
            <div className="text-center py-8 space-y-3">
              <AlertCircle size={40} className="text-amber-500 mx-auto" />
              <p className="text-body font-medium">No weekly grocery list found</p>
              <p className="text-sm text-muted">
                Save your grocery list from the Weekly Grocery Selection screen first.
              </p>
              <button
                onClick={() => onNavigate?.('grocery')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
              >
                <ShoppingCart size={16} />
                Go to Grocery Checklist
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-body">
                AI will match your {groceryItems.length > 0 ? `${groceryItems.length} weekly items` : 'grocery list'} to HEB products.
                {groceryItems.some(i => i.couponHashId) && ' Items with clipped coupons will be prioritized.'}
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={runSmartMatch}
                  disabled={!sessionStatus?.active}
                  className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-colors ${
                    sessionStatus?.active
                      ? 'bg-primary text-white hover:bg-primary-hover'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <Zap size={18} />
                  Run Smart Match
                </button>

                {/* Skip directly to review if we have saved matches */}
                {Object.keys(matches).length > 0 && (
                  <button
                    onClick={() => {
                      loadGroceryItems().then(() => setStep('review'));
                    }}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-sm bg-gray-100 text-body hover:bg-gray-200 transition-colors"
                  >
                    <Eye size={18} />
                    Review Existing Matches ({Object.keys(matches).length})
                  </button>
                )}
              </div>

              {!sessionStatus?.active && (
                <p className="text-xs text-red-600">
                  Browser session required. <button onClick={() => setStep('connect')} className="underline">Go back to connect</button>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="bg-surface rounded-xl shadow-lg border border-default p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-heading">Review Matches</h2>
                <p className="text-sm text-muted">
                  {matchStats.confirmed} confirmed, {matchStats.matched - matchStats.confirmed} pending, {matchStats.unmatched} unmatched
                </p>
              </div>
              <div className="flex items-center gap-3">
                {couponSavingsTotal > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-muted">Coupon Savings</p>
                    <p className="text-sm font-bold text-green-600">-${couponSavingsTotal.toFixed(2)}</p>
                  </div>
                )}
                {estimatedTotal > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-muted">Estimated Total</p>
                    <p className="text-lg font-bold text-green-700">${estimatedTotal.toFixed(2)}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={handleConfirmAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
              >
                <CheckCircle2 size={14} />
                Accept All
              </button>
              <button
                onClick={() => {
                  setStep('match');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-body hover:bg-gray-200 transition-colors"
              >
                <RefreshCw size={14} />
                Re-match
              </button>
            </div>

            {/* Progress bar for confirmations */}
            <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${matchStats.total > 0 ? (matchStats.confirmed / matchStats.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-muted">{matchStats.confirmed} of {matchStats.total} items confirmed</p>
          </div>

          {/* Item list */}
          <div className="space-y-2">
            {groceryItems.map(item => (
              <MatchCard
                key={item.ItemID}
                item={item}
                match={matches[item.ItemID]}
                onConfirm={handleConfirm}
                onReject={handleReject}
                onSearch={() => setSearchItem(item)}
              />
            ))}
          </div>

          {/* Build Cart button */}
          <div className="sticky bottom-4 bg-surface rounded-xl shadow-xl border border-default p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-heading">
                {matchStats.matched} items ready
              </p>
              <div className="flex items-center gap-2">
                {estimatedTotal > 0 && (
                  <span className="text-xs text-muted">~${estimatedTotal.toFixed(2)}</span>
                )}
                {couponSavingsTotal > 0 && (
                  <span className="text-xs text-green-600 font-medium">(-${couponSavingsTotal.toFixed(2)} coupons)</span>
                )}
              </div>
            </div>
            <button
              onClick={handleBuildCart}
              disabled={matchStats.matched === 0}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-colors ${
                matchStats.matched > 0
                  ? 'bg-primary text-white hover:bg-primary-hover'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <ShoppingCart size={18} />
              Build HEB Cart
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Building */}
      {step === 'build' && (
        <BuildProgressPanel
          progress={buildProgress}
          summary={buildSummary}
          totalItems={groceryItems.filter(i => matches[i.ItemID]?.hebProductUrl).length}
        />
      )}

      {/* Search Modal */}
      {searchItem && (
        <SearchModal
          item={searchItem}
          onSelect={handleManualSelect}
          onClose={() => setSearchItem(null)}
          sessionActive={sessionStatus?.active}
        />
      )}
    </div>
  );
};

export default HebCart;
