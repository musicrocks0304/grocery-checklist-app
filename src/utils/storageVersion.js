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
