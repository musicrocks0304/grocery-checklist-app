import React from 'react';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { useHebSessionImport } from '../../hooks/useHebSessionImport';

const LOGIN_URL = 'https://heb-login.needexcelexpert.com';
const SILENT_STATES = ['checking', 'ready'];

/**
 * The remedy copy for each session state from `useHebSession`.
 *
 * `offersSignIn` is deliberately named for what it DOES (offer the sign-in
 * route) rather than for a claim about the user, because 'wrongStore' offers it
 * without asserting anything is wrong.
 *
 * Note there is no 'noStore' case: HEB resolves the curbside store
 * server-side, so a healthy live session carries no store cookie and
 * `storeId: null` is normal. `deriveState` never emits it.
 */
function copyFor(state, health) {
  const expected = health?.storeExpected || '794';
  switch (state) {
    case 'unreachable':
      return {
        title: 'Clip server offline',
        // Keep the words "clip server" out of this sentence: the heading
        // already carries them, and tests match the phrase uniquely.
        body: 'Coupon clipping and the cart builder are unavailable until it is back. It usually just needs a restart.',
        offersSignIn: false,
      };
    case 'signedOut':
      return {
        title: 'HEB sign-in needed',
        body: 'The saved HEB login has expired, so clipping and the cart builder can’t reach HEB. Sign in with the link below — it opens a browser you can drive from your phone — then tap import. Signing in on the computer works just as well.',
        offersSignIn: true,
      };
    case 'wrongStore':
      // An OBSERVATION, not a verdict. The only signal is a transient,
      // non-authoritative cookie that has already produced one false alarm, so
      // this reports what it saw, offers the remedy in case it is real, and
      // never claims anything is blocked.
      return {
        title: 'Store selection may differ',
        body: `This session’s last store selection was #${health?.storeId}. The app’s aisle order and prices are set up for store #${expected}. HEB picks your curbside store server-side, so this is often nothing — if you did switch stores, sign in below, reselect #${expected}, then import.`,
        offersSignIn: true,
      };
    case 'expiring':
      return {
        title: 'HEB sign-in expiring soon',
        body: 'The HEB login lapses within two days. Clipping and the cart builder still work; you’ll get a sign-in prompt here when it runs out.',
        offersSignIn: false,
      };
    default:
      return null;
  }
}

const HebSignInPanel = ({ state, health, onRecheck }) => {
  const { importing, error, runImport } = useHebSessionImport({ recheck: onRecheck });

  // Never render for 'checking': flashing "sign-in needed" at everyone on
  // mount is a defect the 2026-09-05 UI review already fixed once.
  if (SILENT_STATES.includes(state)) return null;
  const copy = copyFor(state, health);
  if (!copy) return null;

  const Icon = state === 'unreachable' ? WifiOff : AlertTriangle;

  return (
    <div
      data-testid="heb-session-panel"
      className="mb-4 p-4 bg-surface border border-default rounded-2xl shadow-warm transition-colors duration-200"
    >
      <div className="flex items-start gap-3">
        <Icon className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold font-display text-heading">{copy.title}</h2>
          <p className="mt-1 text-sm text-body">{copy.body}</p>

          {copy.offersSignIn && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <a
                href={LOGIN_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl font-medium text-sm bg-primary text-white hover:bg-primary-hover transition-colors"
              >
                <ExternalLink size={16} />
                Sign in to HEB
              </a>
              <button
                type="button"
                onClick={runImport}
                disabled={importing}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl font-medium text-sm transition-colors ${
                  importing
                    ? 'bg-background text-muted cursor-wait'
                    : 'bg-background text-body hover:bg-default border border-default'
                }`}
              >
                {importing
                  ? <><Loader2 size={16} className="animate-spin" />Importing…</>
                  : <><RefreshCw size={16} />I've signed in — import it</>}
              </button>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-muted">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export { HebSignInPanel };
