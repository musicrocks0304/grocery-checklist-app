import { useState, useEffect, useCallback, useRef } from 'react';
import { ENDPOINTS } from '../config/api';

/** Advisory window before the auth cookies lapse. */
const EXPIRING_WINDOW_MS = 48 * 3600 * 1000;

/**
 * The one place that decides what the HEB session state is.
 *
 * Returns one of:
 *   'unreachable' | 'signedOut' | 'degraded' | 'wrongStore' | 'expiring' | 'ready'
 * (the hook adds 'checking' before the first answer arrives).
 *
 * Precedence, in order:
 *   unreachable → signedOut → degraded → wrongStore → expiring → ready
 *
 * Reachability, then login, then whether the server can actually serve data,
 * then store binding, then the expiry advisory. Store binding is meaningless
 * when logged out, so it never outranks signedOut. 'wrongStore' is advisory —
 * it reports, it does not block.
 */
export function deriveState(health) {
  if (!health) return 'unreachable';
  if (!health.sessionAuthenticated) return 'signedOut';

  // Fourth, NOT second. The first draft put this above signedOut, reasoning
  // that a DB outage might make sessionAuthenticated read false — it cannot,
  // that value comes from the session FILE. The inverse is what matters:
  // session import touches no database, so signing in works during an outage,
  // and ordering degraded first would hide a working remedy behind a broken
  // one. Blocking states outrank advisories; the login verdict is independent.
  //
  // An older clip-server omits `status` entirely: undefined is not 'degraded',
  // so it behaves exactly as before. Absent is not wrong.
  if (health.status === 'degraded') return 'degraded';

  // Compare only a store id that was actually OBSERVED, against an
  // expectation that actually EXISTS. Absent is not wrong.
  //
  // Both halves of "absent" are real and routine:
  //   storeId: null       HEB resolves the curbside store server-side from the
  //                       account, so a healthy live session carries no store
  //                       cookie at all. Measured on the live session: null.
  //   storeId: undefined  an older clip-server omits the field entirely.
  //
  // Neither is a condition the user can fix, so treating either as a fault
  // would show a permanent remedy prompt that complying can never clear.
  const observed = health.storeId !== undefined && health.storeId !== null;
  const expected = health.storeExpected !== undefined && health.storeExpected !== null;
  if (observed && expected && String(health.storeId) !== String(health.storeExpected)) {
    return 'wrongStore';
  }

  if (health.authExpiresAt) {
    const remaining = Date.parse(health.authExpiresAt) - Date.now();
    if (Number.isFinite(remaining) && remaining < EXPIRING_WINDOW_MS) return 'expiring';
  }

  return 'ready';
}

export function useHebSession() {
  const [state, setState] = useState('checking');
  const [health, setHealth] = useState(null);
  const mounted = useRef(true);

  // Set on mount as well as cleared on unmount: under StrictMode the effect
  // is torn down and re-run, and a ref that only ever goes false would leave
  // the remounted hook permanently unable to publish a result.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const recheck = useCallback(async () => {
    let next;
    let payload = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(ENDPOINTS.clipServerHealth, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        next = 'unreachable';
      } else {
        // A 200 with an unreadable body is a broken server, not a logout.
        payload = await res.json();
        next = deriveState(payload);
      }
    } catch {
      next = 'unreachable';
      payload = null;
    }

    if (mounted.current) {
      setHealth(payload);
      setState(next);
    }
    return next;
  }, []);

  useEffect(() => { recheck(); }, [recheck]);

  return { state, health, recheck };
}
