import { useState, useEffect, useCallback } from 'react';
import { ENDPOINTS } from '../config/api';

/**
 * Lightweight hook to check clip server reachability and HEB session status.
 * Fetches GET /api/health on mount (non-blocking). Exposes a recheck function.
 *
 * Returns:
 *   status: 'loading' | 'reachable' | 'expired' | 'expiring' | 'unreachable'
 *   health: full health payload or null
 *   recheck: () => void
 */
export function useClipServerHealth() {
  const [status, setStatus] = useState('loading');
  const [health, setHealth] = useState(null);

  const recheck = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(ENDPOINTS.clipServerHealth, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        setHealth(null);
        setStatus('unreachable');
        return 'unreachable';
      }

      const data = await res.json();
      setHealth(data);

      // sessionAuthenticated (newer servers) checks the cookies actually look
      // logged-in; sessionValid alone is only file-mtime freshness.
      const sessionOk = data.sessionAuthenticated !== undefined
        ? data.sessionAuthenticated
        : data.sessionValid;
      if (!sessionOk) {
        setStatus('expired');
        return 'expired';
      }
      if (data.sessionAgeHours > 20) {
        setStatus('expiring');
        return 'expiring';
      }
      setStatus('reachable');
      return 'reachable';
    } catch {
      setHealth(null);
      setStatus('unreachable');
      return 'unreachable';
    }
  }, []);

  useEffect(() => {
    recheck();
  }, [recheck]);

  return { status, health, recheck };
}
