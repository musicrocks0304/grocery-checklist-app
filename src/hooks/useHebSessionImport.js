import { useState, useCallback, useRef, useEffect } from 'react';
import { ENDPOINTS, apiJson, userMessage } from '../config/api';

const POLL_INTERVAL_MS = 3000;

/**
 * How long to keep asking health before giving up on an import.
 *
 * Measured against the live clip server: a full import takes about 25 seconds
 * (two passes, with a 5s cookie-flush wait between them). 60s is ~2.4x that,
 * which covers tunnel latency on both the import and each poll, while halving
 * the wait a user eats on the common mistake — tapping "I've signed in" BEFORE
 * actually signing in, where health never leaves signedOut and the only way out
 * is this ceiling. Do not shorten it below ~40s: a premature "try again"
 * message while the import is still running invites a second import.
 */
const POLL_CEILING_MS = 60000;

/** The import's usual first-tap outcome: Chrome has not flushed cookies yet. */
const NOT_SYNCED_MESSAGE = 'Give it a few seconds after signing in, then try again.';

export function useHebSessionImport({ recheck }) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  // Set on mount as well as cleared on unmount. Under <React.StrictMode>
  // (src/index.js) React runs the effect, tears it down, and runs it again, so
  // a ref that only ever goes false would be false before any async work
  // resolved — the hook would run the whole import and silently publish
  // nothing.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const runImport = useCallback(async () => {
    setImporting(true);
    setError(null);
    try {
      // The import is expensive and not idempotent-cheap; never retry it
      // automatically. The timeout is generous on purpose: the webhook
      // normally answers 202 in well under a second, but if a cold n8n makes
      // us abort a request the server did honour, the user retries and starts
      // a second import.
      await apiJson(ENDPOINTS.hebSessionImport, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        retries: 0,
        timeout: 90000,
      });

      // The webhook returns as soon as the import STARTS (202
      // {started:true}), so the real answer comes from polling health until
      // the session flips.
      const deadline = Date.now() + POLL_CEILING_MS;
      // `mounted.current` is part of the loop condition, not just a setState
      // guard: without it the poll keeps running after the component goes
      // away, which leaves timers open in Jest and risks act() warnings
      // against a suite that gates on zero.
      while (mounted.current && Date.now() < deadline) {
        const state = await recheck();
        if (state !== 'signedOut' && state !== 'unreachable') {
          if (mounted.current) setImporting(false);
          return state;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      if (!mounted.current) return null;
      setError(NOT_SYNCED_MESSAGE);
    } catch (err) {
      // A 4xx is the expected "profile not synced yet" case, not an incident.
      if (mounted.current) {
        setError(err?.status >= 400 && err?.status < 500 ? NOT_SYNCED_MESSAGE : userMessage(err, 'Import failed.'));
      }
    } finally {
      if (mounted.current) setImporting(false);
    }
    return null;
  }, [recheck]);

  return { importing, error, runImport };
}
