export const STORAGE_VERSION_KEY = 'schema_version';
export const CURRENT_VERSION = 3;

export const INVALIDATED_KEYS = [
  'inStoreCheckedItems',
  'inStoreShoppingList',
  'inStoreWalkOrder',
];

export function ensureStorageVersion() {
  let stored;
  try {
    stored = localStorage.getItem(STORAGE_VERSION_KEY);
  } catch {
    return false;
  }
  if (stored === String(CURRENT_VERSION)) return false;
  INVALIDATED_KEYS.forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
  try { localStorage.setItem(STORAGE_VERSION_KEY, String(CURRENT_VERSION)); } catch { /* ignore */ }
  return true;
}

// Week-scoped keys look like `selectedMeals_2026-07-12`, `chat_2026-07-12`,
// `creator_2026-07-12_draft`, etc. They otherwise accumulate forever — one
// or more new keys every week since March.
const WEEK_KEY_RE = /^(selectedMeals|chat|creator|chatSessionId|creatorSessionId)_(\d{4}-\d{2}-\d{2})/;

/**
 * Remove week-scoped localStorage entries older than `keepDays` (default 21:
 * current week plus two before it — enough for any "what did we plan last
 * week?" backtracking).
 */
export function gcWeekScopedKeys(keepDays = 21) {
  let removed = 0;
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const m = key && key.match(WEEK_KEY_RE);
      if (!m) continue;
      const keyDate = new Date(`${m[2]}T00:00:00`);
      if (!Number.isNaN(keyDate.getTime()) && keyDate < cutoff) doomed.push(key);
    }
    doomed.forEach((k) => { localStorage.removeItem(k); removed += 1; });
  } catch { /* storage unavailable — nothing to clean */ }
  return removed;
}
