import React from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { HebSignInPanel } from '../heb/HebSignInPanel';

// ─── Connection Panel (Step 1) ──────────────────────────────────
//
// The login verdict is no longer this component's to make. `hebState` comes
// from `useHebSession`, the one place that derives it, and the remedy copy
// comes from the shared `HebSignInPanel`. What is left here is the browser
// session — connect, disconnect, idle time — which is a different fact.
const ConnectionPanel = ({ sessionStatus, hebState, hebHealth, onConnect, onDisconnect, onRecheck, connecting }) => {
  const isActive = sessionStatus?.active;
  const loginValid = sessionStatus?.loginSessionValid;

  // `blocked` gates the Connect/Disconnect row: these are the states where
  // driving a browser session cannot work. 'degraded' is one of them — the
  // build job connects to MySQL and inserts into heb_cart_sessions outside
  // its inner try/catches, so a browser session bought here could only fail
  // later with a raw connection error.
  //
  // It deliberately EXCLUDES two states:
  //   'expiring'   advisory — the session still works, so connecting must
  //                stay available.
  //   'wrongStore' advisory (ruling R14) — its only signal is a transient,
  //                non-authoritative store cookie that has already produced
  //                one false positive in the field. Blocking on it would stop
  //                a user who is in fact correctly configured, with no action
  //                available that could clear the block.
  // There is no 'noStore' state to exclude (ruling R13): HEB resolves the
  // curbside store server-side, so a healthy live session carries no store
  // cookie and `deriveState` never emits one.
  const blocked = ['signedOut', 'unreachable', 'degraded'].includes(hebState);

  // Two independently unknown things, and neither may flash a verdict at the
  // user on mount: the shared session state before its first answer, and the
  // browser-session status before its first poll lands.
  const isChecking = hebState === 'checking' || sessionStatus == null;

  const lastLoginLabel = sessionStatus?.lastLoginAt
    ? `Last connected ${new Date(sessionStatus.lastLoginAt).toLocaleString()}`
    : null;

  const subtitle = isChecking
    ? 'Checking connection…'
    : isActive
      ? `Browser session active (idle ${sessionStatus.idleSeconds}s)`
      : loginValid
        ? 'Ready to connect'
        : lastLoginLabel;

  return (
    <div data-testid="heb-signin-panel" className="bg-surface rounded-2xl shadow-warm border border-default p-4 sm:p-6 transition-colors duration-200">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-xl ${isActive ? 'bg-primary-light text-primary' : 'bg-background text-muted'}`}>
          {isActive ? <Wifi size={24} /> : <WifiOff size={24} />}
        </div>
        <div>
          {/* The heading stays generic on purpose. HebSignInPanel supplies the
              state-specific title ("HEB sign-in needed", "Clip server
              offline"); repeating it here would both duplicate the text and
              mislabel states like 'unreachable' as a sign-in problem. */}
          <h2 className="text-lg font-semibold font-display text-heading">HEB Connection</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      </div>

      {/* Rendered unconditionally: the panel silences itself on 'checking' and
          'ready', and rendering it here is what finally gives Cart the
          'expiring' warning it has never had. */}
      <HebSignInPanel state={hebState} health={hebHealth} onRecheck={onRecheck} />

      {!blocked && !isChecking && (
        <div className="flex gap-3">
          {!isActive ? (
            <button
              onClick={onConnect}
              disabled={connecting}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                connecting
                  ? 'bg-default text-muted cursor-not-allowed'
                  : 'bg-primary text-white hover:bg-primary-hover'
              }`}
            >
              {connecting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Launching browser...
                </>
              ) : (
                <>
                  <Wifi size={16} />
                  Connect to HEB
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onDisconnect}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm bg-background text-body hover:bg-default transition-colors"
            >
              <WifiOff size={16} />
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export { ConnectionPanel };
