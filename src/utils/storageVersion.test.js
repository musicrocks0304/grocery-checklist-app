import { ensureStorageVersion, CURRENT_VERSION, STORAGE_VERSION_KEY, INVALIDATED_KEYS } from './storageVersion';

describe('ensureStorageVersion', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('writes current version when no version is stored', () => {
    ensureStorageVersion();
    expect(localStorage.getItem(STORAGE_VERSION_KEY)).toBe(String(CURRENT_VERSION));
  });

  test('clears invalidated keys when version mismatches', () => {
    localStorage.setItem(STORAGE_VERSION_KEY, '1');
    INVALIDATED_KEYS.forEach((k) => localStorage.setItem(k, 'stale-value'));
    ensureStorageVersion();
    INVALIDATED_KEYS.forEach((k) => {
      expect(localStorage.getItem(k)).toBeNull();
    });
    expect(localStorage.getItem(STORAGE_VERSION_KEY)).toBe(String(CURRENT_VERSION));
  });

  test('leaves storage alone when version matches', () => {
    localStorage.setItem(STORAGE_VERSION_KEY, String(CURRENT_VERSION));
    localStorage.setItem(INVALIDATED_KEYS[0], 'fresh-value');
    ensureStorageVersion();
    expect(localStorage.getItem(INVALIDATED_KEYS[0])).toBe('fresh-value');
  });

  test('returns true if invalidation occurred, false otherwise', () => {
    expect(ensureStorageVersion()).toBe(true);
    expect(ensureStorageVersion()).toBe(false);
  });
});
