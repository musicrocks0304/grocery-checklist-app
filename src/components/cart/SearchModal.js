import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Loader2, ChevronRight } from 'lucide-react';
import { ENDPOINTS } from '../../config/api';

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
      <div className="bg-surface rounded-2xl shadow-warm-xl w-full max-w-lg max-h-[80vh] flex flex-col transition-colors duration-200">
        {/* Header */}
        <div className="p-4 border-b border-default flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-heading">Find HEB Product</h3>
            <p className="text-xs text-muted">for: {item?.ItemName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-background">
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
              className={`px-4 py-2 rounded-xl font-medium text-sm ${
                searching || !sessionActive
                  ? 'bg-default text-muted'
                  : 'bg-primary text-white hover:bg-primary-hover'
              }`}
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
            </button>
          </div>
          {!sessionActive && (
            <p className="text-xs text-danger mt-1">Browser session required for search</p>
          )}
          {error && <p className="text-xs text-danger mt-1">{error}</p>}
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
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-default hover:border-primary hover:bg-primary-light transition-colors text-left"
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
                        <span className="text-sm font-medium text-primary">${Number(product.price).toFixed(2)}</span>
                      )}
                      {product.brand && <span className="text-xs text-muted">{product.brand}</span>}
                      {product.inStock === false && (
                        <span className="text-xs text-danger">Out of stock</span>
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

export default SearchModal;
