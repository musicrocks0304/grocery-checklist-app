import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShoppingCart, Wifi, AlertCircle, Zap, Loader2,
  CheckCircle2, ArrowRight, X,
} from 'lucide-react';
import { ENDPOINTS, apiJson } from '../config/api';
import { getWeekDateRange } from '../utils/weekDates';
import toast from 'react-hot-toast';
import useClipSession from '../hooks/useClipSession';
import useCartBuild from '../hooks/useCartBuild';
import { useHebSession } from '../hooks/useHebSession';
import StepIndicator from './cart/StepIndicator';
import { ConnectionPanel } from './cart/ConnectionPanel';
import MatchCard from './cart/MatchCard';
import SearchModal from './cart/SearchModal';
import BuildProgressPanel from './cart/BuildProgressPanel';
export { ConnectionPanel } from './cart/ConnectionPanel';
// ─── Main HEB Cart Component ────────────────────────────────────
const HebCart = ({ onNavigate }) => {
  // --- State ---
  const [step, setStep] = useState('connect');
  const transitionToStep = useCallback((nextStep) => {
    setStep(nextStep);
  }, []);
  const [groceryItems, setGroceryItems] = useState([]);
  const [matches, setMatches] = useState({}); // { [ItemID]: matchObj }
  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState('');
  const [searchItem, setSearchItem] = useState(null); // item being searched
  const [loadingGroceries, setLoadingGroceries] = useState(false);
  const [searchWarning, setSearchWarning] = useState(null);

  const {
    sessionStatus, connecting,
    handleConnect, handleDisconnect, ensureSession,
  } = useClipSession({ onStepChange: transitionToStep });

  // The shared HEB session state. `sessionStatus` above describes the clip
  // server's *browser* session; this describes whether HEB itself still
  // accepts our cookies. They disagree routinely, and this one wins.
  const { state: hebState, health: hebHealth, recheck: hebRecheck } = useHebSession();

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
  // Helper: process AI match response, validate, save, and update state
  const processAiMatches = useCallback(async (resultObj, validProductIds, frequentProducts, matchesAccum) => {
    const aiMatches = resultObj?.matches || [];

    if (resultObj?.droppedCount > 0) {
      console.warn(`[heb-cart] Server dropped ${resultObj.droppedCount} hallucinated match(es):`, resultObj.droppedMatches);
    }

    // Client-side validation: ensure every match references a real product
    const allValidIds = new Set([...validProductIds]);
    for (const fp of frequentProducts) {
      if (fp.id) allValidIds.add(String(fp.id));
    }

    const validated = aiMatches.filter(m => {
      if (!m.hebProductId) return false;
      return allValidIds.has(String(m.hebProductId));
    });

    if (validated.length < aiMatches.length) {
      console.warn(`[heb-cart] Client-side validation dropped ${aiMatches.length - validated.length} match(es) with unknown product IDs`);
    }

    for (const m of validated) {
      matchesAccum[m.groceryItemId] = {
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

      // Save to DB with error feedback
      try {
        const saveRes = await fetch(ENDPOINTS.hebMatches, {
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
        });
        if (!saveRes.ok) {
          console.error('[heb-cart] Match save failed:', saveRes.status);
        }
      } catch (err) {
        console.error('[heb-cart] Match save error:', err.message);
        toast.error(`Failed to save match for ${m.groceryItemName}. It may not persist.`);
      }
    }

    return validated.length;
  }, []);

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
          console.log(`[heb-cart] Loaded ${frequentProducts.length} cached frequent products`);
        }
      } catch {} // non-critical

      const batchFrequentProducts = frequentProducts.map(fp => ({
        name: fp.name, id: fp.id, skuId: fp.skuId, price: fp.price,
        category: fp.category, productUrl: fp.productUrl, imageUrl: fp.imageUrl,
      }));

      const newMatches = { ...savedMatches };
      const frequentProductIds = new Set(frequentProducts.map(fp => String(fp.id)).filter(Boolean));

      // ────────────────────────────────────────────────────────────────
      // PHASE 1: Match against cached frequently purchased products (instant, no browser)
      // ────────────────────────────────────────────────────────────────
      setMatchProgress(
        `Matching ${needsMatch.length} items against ${frequentProducts.length} frequently purchased products...`
      );

      const BATCH_SIZE = 10;
      const phase1Batches = [];
      for (let i = 0; i < needsMatch.length; i += BATCH_SIZE) {
        phase1Batches.push(needsMatch.slice(i, i + BATCH_SIZE));
      }

      let phase1Matched = 0;
      for (let batchIdx = 0; batchIdx < phase1Batches.length; batchIdx++) {
        const batch = phase1Batches[batchIdx];
        const batchItems = batch.map(item => ({
          groceryItemId: item.ItemID,
          groceryItemName: item.ItemName,
          category: item.Category,
          quantity: item.Quantity || 1,
          unit: item.Unit || null,
          coupon: item.couponHashId ? {
            productName: item.couponProductName,
            savings: item.couponSavings,
            discount: item.couponDiscount,
            clipped: item.couponClipped,
          } : null,
          searchResults: [], // No live search — match against frequent products only
        }));

        try {
          const aiData = await apiJson(ENDPOINTS.hebSmartMatch, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: batchItems, frequentProducts: batchFrequentProducts }),
            timeout: 120000,
            retries: 0,
          });
          const resultObj = Array.isArray(aiData) ? aiData[0] : aiData;
          const count = await processAiMatches(resultObj, frequentProductIds, frequentProducts, newMatches);
          phase1Matched += count;
          setMatches(prev => ({ ...prev, ...newMatches }));

          setMatchProgress(
            `Phase 1: Matched ${phase1Matched} of ${needsMatch.length} from purchase history...`
          );
        } catch (err) {
          console.error(`[heb-cart] Phase 1 AI match error (batch ${batchIdx + 1}):`, err.message);
        }
      }

      console.log(`[heb-cart] Phase 1 complete: ${phase1Matched} matched from frequent products`);

      // ────────────────────────────────────────────────────────────────
      // PHASE 2: Live search for unmatched items (single worker, slow & careful)
      // ────────────────────────────────────────────────────────────────
      const unmatchedItems = needsMatch.filter(item => !newMatches[item.ItemID]);

      if (unmatchedItems.length > 0 && sessionStatus?.active) {
        setMatchProgress(
          `${phase1Matched} matched from history. Searching HEB for ${unmatchedItems.length} remaining items...`
        );

        // Search one at a time to avoid WAF (single query per request)
        for (let i = 0; i < unmatchedItems.length; i += BATCH_SIZE) {
          const batch = unmatchedItems.slice(i, Math.min(i + BATCH_SIZE, unmatchedItems.length));
          const searchQueries = batch.map(item => item.ItemName);

          setMatchProgress(
            `Searching HEB for items ${i + 1}-${Math.min(i + BATCH_SIZE, unmatchedItems.length)} of ${unmatchedItems.length} remaining...`
          );

          let searchResultsMap = {};
          try {
            const batchSearchRes = await fetch(ENDPOINTS.hebSearchBatch, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ queries: searchQueries, maxResults: 12 }),
            });
            if (batchSearchRes.ok) {
              const batchSearchData = await batchSearchRes.json();
              searchResultsMap = batchSearchData.results || {};
            }
          } catch (err) {
            console.error('[heb-cart] Phase 2 search error:', err.message);
          }

          // Check if searches actually returned results
          const totalSearchResults = Object.values(searchResultsMap).reduce(
            (sum, r) => sum + (r.products?.length || 0), 0
          );

          if (totalSearchResults === 0) {
            console.log('[heb-cart] Phase 2: All searches returned 0 results (WAF likely blocking). Skipping remaining.');
            setSearchWarning('Some items couldn\'t be searched. Try ending and restarting your HEB session, then re-run matching.');
            break; // Don't waste time on more searches
          }

          // Build AI match request with search results
          const batchItems = batch.map((item, idx) => ({
            groceryItemId: item.ItemID,
            groceryItemName: item.ItemName,
            category: item.Category,
            quantity: item.Quantity || 1,
            unit: item.Unit || null,
            coupon: item.couponHashId ? {
              productName: item.couponProductName,
              savings: item.couponSavings,
              discount: item.couponDiscount,
              clipped: item.couponClipped,
            } : null,
            searchResults: (searchResultsMap[searchQueries[idx]]?.products || []).map(sr => ({
              name: sr.name, id: sr.id, skuId: sr.skuId, price: sr.price,
              brand: sr.brand, inStock: sr.inStock, productUrl: sr.productUrl,
              imageUrl: sr.imageUrl, category: sr.category,
            })),
          }));

          // Collect valid search product IDs for client-side validation
          const searchProductIds = new Set();
          for (const query of searchQueries) {
            for (const p of (searchResultsMap[query]?.products || [])) {
              if (p.id) searchProductIds.add(String(p.id));
            }
          }

          setMatchProgress(
            `AI matching ${unmatchedItems.length - i > BATCH_SIZE ? BATCH_SIZE : unmatchedItems.length - i} remaining items with search results...`
          );

          try {
            const aiData = await apiJson(ENDPOINTS.hebSmartMatch, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: batchItems, frequentProducts: batchFrequentProducts }),
              timeout: 120000,
              retries: 0,
            });
            const resultObj = Array.isArray(aiData) ? aiData[0] : aiData;
            const allValidIds = new Set([...searchProductIds, ...frequentProductIds]);
            await processAiMatches(resultObj, allValidIds, frequentProducts, newMatches);
            setMatches(prev => ({ ...prev, ...newMatches }));
          } catch (err) {
            console.error(`[heb-cart] Phase 2 AI match error:`, err.message);
          }
        }
      } else if (unmatchedItems.length > 0) {
        console.log(`[heb-cart] ${unmatchedItems.length} items unmatched but no browser session — skipping live search`);
      }

      setMatches(newMatches);

      const matchCount = Object.values(newMatches).filter(m => m.hebProductId).length;
      const confirmedCount = Object.values(newMatches).filter(m => m.userConfirmed).length;
      const totalNeeded = needsMatch.length + alreadyMatched.length;
      toast.success(`Smart matching complete! ${matchCount} of ${totalNeeded} matched (${confirmedCount} pre-confirmed)`);
      setStep('review');
    } catch (err) {
      toast.error(`Smart matching failed: ${err.message}`);
    } finally {
      setIsMatching(false);
      setMatchProgress('');
    }
  }, [loadGroceryItems, processAiMatches, sessionStatus]);

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

  const { buildProgress, buildSummary, handleBuildCart } = useCartBuild({
    groceryItems,
    matches,
    ensureSession,
    onStepChange: transitionToStep,
  });

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
  // A live browser session is not permission to skip the remedy: HEB may have
  // rejected its cookies already, so signedOut and unreachable keep us on
  // 'connect' where the way out is on screen. 'checking' is in the list for
  // the same reason — the two probes race and the browser status usually wins,
  // so advancing on it would sail past a signedOut verdict landing a tick
  // later, and the `step === 'connect'` guard means we never come back.
  // 'degraded' is here for the same reason: runBuildJob calls db.connect() and
  // inserts into heb_cart_sessions OUTSIDE its inner try/catches, so a DB
  // outage fails the whole build. Advancing would sail past Connect and fail
  // later with a raw connection error instead of an explanation.
  const autoAdvanceAllowed = hebState !== 'checking' && hebState !== 'signedOut'
    && hebState !== 'unreachable' && hebState !== 'degraded';
  useEffect(() => {
    if (sessionStatus?.active && step === 'connect' && autoAdvanceAllowed) {
      setStep('review');
    }
  }, [sessionStatus, step, autoAdvanceAllowed]);

  // --- Pre-load weekly items when entering the review step ---
  useEffect(() => {
    if (step === 'review' && groceryItems.length === 0 && !loadingGroceries) {
      loadGroceryItems();
    }
  }, [step, groceryItems.length, loadingGroceries, loadGroceryItems]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="bg-surface rounded-2xl shadow-warm border border-default p-4 sm:p-6 mb-4 transition-colors duration-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="bg-danger text-white p-2 rounded-xl">
              <ShoppingCart size={24} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-display text-heading">HEB Cart Builder</h1>
              <p className="text-sm text-muted">AI-powered grocery cart building</p>
            </div>
          </div>
          {sessionStatus?.active && (
            <div className="flex items-center gap-1.5 text-xs text-primary bg-primary-light px-2 py-1 rounded-full">
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
          hebState={hebState}
          hebHealth={hebHealth}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onRecheck={hebRecheck}
          connecting={connecting}
        />
      )}

      {/* Step 2: Match & Review (combined) */}
      {step === 'review' && (
        <div className="space-y-4">
          {/* Matching in progress overlay */}
          {isMatching && (
            <div className="bg-surface rounded-2xl shadow-warm border border-primary-border p-4 sm:p-6 transition-colors duration-200">
              <div className="flex items-center gap-3">
                <Loader2 size={24} className="animate-spin text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-heading">{matchProgress}</p>
                  <p className="text-xs text-muted mt-0.5">This may take a minute...</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty state — no grocery list */}
          {!isMatching && groceryItems.length === 0 && !loadingGroceries && (
            <div className="bg-surface rounded-2xl shadow-warm border border-default p-4 sm:p-6 text-center py-8 space-y-3 transition-colors duration-200">
              <AlertCircle size={40} className="text-accent mx-auto" />
              <p className="text-body font-medium">No weekly grocery list found</p>
              <p className="text-sm text-muted">
                Save your grocery list from the Plan screen first.
              </p>
              <button
                onClick={() => onNavigate?.('plan')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
              >
                <ShoppingCart size={16} />
                Go to Plan
              </button>
            </div>
          )}

          {/* Loading grocery items */}
          {loadingGroceries && !isMatching && (
            <div className="bg-surface rounded-2xl shadow-warm border border-default p-4 sm:p-6 text-center py-8 transition-colors duration-200">
              <Loader2 size={32} className="animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-body">Loading your weekly grocery list...</p>
            </div>
          )}

          {/* Search warning banner */}
          {searchWarning && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{searchWarning}</span>
              <button onClick={() => setSearchWarning(null)} className="ml-auto text-amber-600 dark:text-amber-400 hover:text-amber-800">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Summary bar + actions (show when we have items) */}
          {groceryItems.length > 0 && (
            <div className="bg-surface rounded-2xl shadow-warm border border-default p-4 sm:p-6 transition-colors duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold font-display text-heading">Match & Review</h2>
                  <p className="text-sm text-muted">
                    {matchStats.matched > 0
                      ? `${matchStats.confirmed} confirmed, ${matchStats.matched - matchStats.confirmed} pending, ${matchStats.unmatched} unmatched`
                      : `${groceryItems.length} items ready to match`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {couponSavingsTotal > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-muted">Coupon Savings</p>
                      <p className="text-sm font-bold text-primary">-${couponSavingsTotal.toFixed(2)}</p>
                    </div>
                  )}
                  {estimatedTotal > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-muted">Estimated Total</p>
                      <p className="text-lg font-bold text-primary">${estimatedTotal.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={runSmartMatch}
                  disabled={isMatching || !sessionStatus?.active}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                    isMatching || !sessionStatus?.active
                      ? 'bg-default text-muted cursor-not-allowed'
                      : matchStats.matched > 0
                        ? 'bg-background text-body hover:bg-default'
                        : 'bg-primary text-white hover:bg-primary-hover'
                  }`}
                >
                  {isMatching ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  {matchStats.matched > 0 ? 'Re-match' : 'Run Smart Match'}
                </button>
                {matchStats.matched > 0 && (
                  <button
                    onClick={handleConfirmAll}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-primary-light text-primary hover:bg-primary-light/80 transition-colors"
                  >
                    <CheckCircle2 size={14} />
                    Accept All
                  </button>
                )}
              </div>

              {!sessionStatus?.active && (
                <p className="text-xs text-danger mb-3">
                  Browser session required for matching. <button onClick={() => setStep('connect')} className="underline">Connect</button>
                </p>
              )}

              {/* Progress bar for confirmations */}
              {matchStats.matched > 0 && (
                <>
                  <div className="w-full bg-default rounded-full h-2 mb-1">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${matchStats.total > 0 ? (matchStats.confirmed / matchStats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted">{matchStats.confirmed} of {matchStats.total} items confirmed</p>
                </>
              )}
            </div>
          )}

          {/* Item list */}
          {groceryItems.length > 0 && (
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
          )}

          {/* Build Cart button (sticky footer) */}
          {matchStats.confirmed > 0 && (
            <div className="sticky bottom-4 bg-surface rounded-2xl shadow-warm-lg border border-default p-4 flex items-center justify-between transition-colors duration-200">
              <div>
                <p className="text-sm font-medium text-heading">
                  {matchStats.confirmed} items confirmed
                </p>
                <div className="flex items-center gap-2">
                  {estimatedTotal > 0 && (
                    <span className="text-xs text-muted">~${estimatedTotal.toFixed(2)}</span>
                  )}
                  {couponSavingsTotal > 0 && (
                    <span className="text-xs text-primary font-medium">(-${couponSavingsTotal.toFixed(2)} coupons)</span>
                  )}
                </div>
              </div>
              <button
                onClick={handleBuildCart}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm bg-primary text-white hover:bg-primary-hover transition-colors"
              >
                <ShoppingCart size={18} />
                Build HEB Cart ({matchStats.confirmed})
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Building */}
      {step === 'build' && (
        <BuildProgressPanel
          progress={buildProgress}
          summary={buildSummary}
          totalItems={groceryItems.filter(i => matches[i.ItemID]?.userConfirmed && matches[i.ItemID]?.hebProductUrl).length}
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
