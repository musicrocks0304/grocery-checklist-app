import React, { useState, useRef, useEffect } from 'react';
import { Zap, Plus, Search, X } from 'lucide-react';

const InputToolbar = ({ onQuickAdd, onSearchChange }) => {
  const [mode, setMode] = useState('quickAdd');
  const [quickAddText, setQuickAddText] = useState('');
  const [searchText, setSearchText] = useState('');
  const searchRef = useRef(null);
  const quickAddRef = useRef(null);

  useEffect(() => {
    if (mode === 'search') searchRef.current?.focus();
  }, [mode]);

  const commitQuickAdd = () => {
    const trimmed = quickAddText.trim();
    if (!trimmed) return;
    onQuickAdd(trimmed);
    setQuickAddText('');
  };

  if (mode === 'quickAdd') {
    return (
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Zap size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={quickAddRef}
            type="text"
            value={quickAddText}
            onChange={(e) => setQuickAddText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitQuickAdd(); }}
            placeholder="Quick add one-off item…"
            className="w-full pl-9 pr-3 py-2.5 border border-default rounded-xl bg-surface text-heading focus:outline-none focus:ring-2 focus:ring-focus text-sm"
          />
        </div>
        <button
          type="button"
          onClick={commitQuickAdd}
          disabled={!quickAddText.trim()}
          className="px-3.5 py-2.5 rounded-xl bg-accent text-white disabled:bg-muted disabled:cursor-not-allowed text-sm font-semibold flex items-center gap-1.5"
        >
          <Plus size={14} /> Add
        </button>
        <button
          type="button"
          onClick={() => setMode('search')}
          aria-label="Search items"
          className="px-3 py-2.5 rounded-xl border border-default text-muted hover:text-body"
        >
          <Search size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="relative flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
        <input
          ref={searchRef}
          type="text"
          value={searchText}
          onChange={(e) => { setSearchText(e.target.value); onSearchChange(e.target.value); }}
          placeholder="Search your items…"
          className="w-full pl-9 pr-9 py-2.5 border border-primary rounded-xl bg-surface text-heading focus:outline-none focus:ring-2 focus:ring-focus text-sm"
        />
        <button
          type="button"
          onClick={() => { setSearchText(''); onSearchChange(''); setMode('quickAdd'); }}
          aria-label="Close search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-heading p-1"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default InputToolbar;
