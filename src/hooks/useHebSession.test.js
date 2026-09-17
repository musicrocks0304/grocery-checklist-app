import { act, renderHook, waitFor } from '@testing-library/react';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { useHebSession, deriveState } from './useHebSession';

const HOUR = 3600 * 1000;
const future = (ms) => new Date(Date.now() + ms).toISOString();

const healthy = {
  status: 'ok',
  sessionAuthenticated: true,
  sessionReason: 'ok',
  authExpiresAt: future(30 * 24 * HOUR),
  storeId: '794',
  storeSource: 'curr',
  storeExpected: '794',
};

afterEach(() => restoreFetch());

// Describes are prefixed with the hook name so the gate command
// `react-scripts test -t useHebSession` (a test-NAME filter, not a path
// filter) selects the whole file rather than only the hook block.
describe('useHebSession / deriveState', () => {
  test('authenticated, right store, long-lived → ready', () => {
    expect(deriveState(healthy)).toBe('ready');
  });

  test('not authenticated → signedOut', () => {
    expect(deriveState({ ...healthy, sessionAuthenticated: false })).toBe('signedOut');
  });

  test('signedOut outranks a wrong store', () => {
    expect(deriveState({ ...healthy, sessionAuthenticated: false, storeId: '809' })).toBe('signedOut');
  });

  test('REGRESSION: a null storeId is UNKNOWN, not "no store" — it must not nag a healthy user', () => {
    // Measured against the live authenticated session: it carries ZERO store
    // cookies, because HEB resolves the curbside store server-side from the
    // account. So storeId: null is the NORMAL reading for a correctly
    // configured user, not a missing store. An earlier rule mapped null to a
    // 'noStore' remedy ("Choose your HEB store") — a permanent false alarm
    // shown to everyone, which no amount of complying could clear.
    const live = {
      status: 'ok',
      sessionValid: true,
      sessionAuthenticated: true,
      sessionReason: 'ok',
      // The live payload read 2027-09-17T04:13:37.495Z; expressed relatively
      // here so the test does not rot into 'expiring' on that date.
      authExpiresAt: future(365 * 24 * HOUR),
      storeId: null,
      storeSource: null,
      storeExpected: '794',
      sessionAgeHours: 1.5,
      lastScrapeAt: null,
      couponCount: 826,
      activeJobs: 0,
      activeScraperJob: null,
    };
    expect(deriveState(live)).toBe('ready');
  });

  test('mismatched store → wrongStore', () => {
    expect(deriveState({ ...healthy, storeId: '809', storeSource: 'shopping' })).toBe('wrongStore');
  });

  test('COMPATIBILITY: undefined storeId skips the store check entirely', () => {
    // An old container that has not been rebuilt omits the field. Treating
    // undefined as a mismatch would put every user in wrongStore. Same single
    // rule as the null case above, approached from the other direction: only
    // a store id that was actually observed is ever compared.
    const old = { sessionAuthenticated: true, authExpiresAt: future(30 * 24 * HOUR) };
    expect(deriveState(old)).toBe('ready');
  });

  test('an absent storeExpected cannot make an observed store wrong', () => {
    // If the clip-server has no configured store, there is nothing to be
    // wrong against. Comparing '794' to undefined would otherwise pin every
    // user in wrongStore — the same permanent-false-alarm shape as the
    // null-storeId regression above.
    const noExpectation = { ...healthy, storeExpected: undefined };
    expect(deriveState(noExpectation)).toBe('ready');
  });

  test('store comparison is by string, not identity', () => {
    expect(deriveState({ ...healthy, storeId: 794, storeExpected: '794' })).toBe('ready');
  });

  test('auth expiring inside 48h → expiring', () => {
    expect(deriveState({ ...healthy, authExpiresAt: future(6 * HOUR) })).toBe('expiring');
  });

  test('auth expiring beyond 48h → ready', () => {
    expect(deriveState({ ...healthy, authExpiresAt: future(72 * HOUR) })).toBe('ready');
  });

  test('null authExpiresAt (session cookies) → ready, not expiring', () => {
    expect(deriveState({ ...healthy, authExpiresAt: null })).toBe('ready');
  });

  test('a wrong store outranks expiring', () => {
    expect(deriveState({ ...healthy, storeId: '809', authExpiresAt: future(1 * HOUR) })).toBe('wrongStore');
  });

  test('a degraded server derives degraded', () => {
    expect(deriveState({ ...healthy, status: 'degraded', degradedReason: 'db_unreachable' }))
      .toBe('degraded');
  });

  test('signedOut OUTRANKS degraded — the sign-in remedy still works', () => {
    // sessionAuthenticated comes from the session FILE (buildSessionHealth ->
    // evaluateSession), which the health handler's DB code never touches, so a
    // DB outage cannot move it. And session-import.js has zero DB references,
    // so signing in works fine during an outage. Ordering degraded first would
    // hide a working remedy behind a broken one.
    expect(deriveState({ ...healthy, status: 'degraded', sessionAuthenticated: false }))
      .toBe('signedOut');
  });

  test('degraded outranks wrongStore and expiring — blocking beats advisory', () => {
    expect(deriveState({ ...healthy, status: 'degraded', storeId: '809', storeSource: 'curr' }))
      .toBe('degraded');
    expect(deriveState({ ...healthy, status: 'degraded', authExpiresAt: future(HOUR) }))
      .toBe('degraded');
  });

  test('COMPATIBILITY: a payload with NO status field behaves exactly as today', () => {
    // An old container omits the field entirely. Absent is not wrong.
    const old = { sessionAuthenticated: true, authExpiresAt: future(30 * 24 * HOUR) };
    expect(deriveState(old)).toBe('ready');
  });

  test('an explicit status ok is not degraded', () => {
    expect(deriveState({ ...healthy, status: 'ok' })).toBe('ready');
  });

  test('null health → unreachable', () => {
    expect(deriveState(null)).toBe('unreachable');
  });
});

describe('useHebSession hook', () => {
  test('starts in checking, then resolves to ready', async () => {
    installMockFetch({ '/api/health': healthy });
    const { result } = renderHook(() => useHebSession());
    expect(result.current.state).toBe('checking');
    await waitFor(() => expect(result.current.state).toBe('ready'));
  });

  test('a 500 from health is unreachable, not signedOut', async () => {
    installMockFetch({ '/api/health': { status: 500, body: { error: 'boom' } } });
    const { result } = renderHook(() => useHebSession());
    await waitFor(() => expect(result.current.state).toBe('unreachable'));
  });

  test('an unparseable body is unreachable', async () => {
    installMockFetch({ '/api/health': { status: 200, body: 'not json at all' } });
    const { result } = renderHook(() => useHebSession());
    await waitFor(() => expect(result.current.state).toBe('unreachable'));
  });

  test('expired session surfaces signedOut', async () => {
    installMockFetch({ '/api/health': { ...healthy, sessionAuthenticated: false } });
    const { result } = renderHook(() => useHebSession());
    await waitFor(() => expect(result.current.state).toBe('signedOut'));
  });

  test('recheck resolves to the new state', async () => {
    installMockFetch({ '/api/health': healthy });
    const { result } = renderHook(() => useHebSession());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    // act() around the manual call: recheck sets state as it resolves, and an
    // unwrapped update logs a React act() warning on every run.
    let resolved;
    await act(async () => { resolved = await result.current.recheck(); });
    expect(resolved).toBe('ready');
  });

  test('health payload is exposed for copy that names the bound store', async () => {
    installMockFetch({ '/api/health': { ...healthy, storeId: '809', storeSource: 'shopping' } });
    const { result } = renderHook(() => useHebSession());
    await waitFor(() => expect(result.current.state).toBe('wrongStore'));
    expect(result.current.health.storeId).toBe('809');
  });
});
