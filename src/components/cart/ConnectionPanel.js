import React, { useState } from 'react';
import { Wifi, WifiOff, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Connection Panel (Step 1) ──────────────────────────────────
const ConnectionPanel = ({ sessionStatus, onConnect, onDisconnect, onRecheck, connecting }) => {
  const isActive = sessionStatus?.active;
  const loginValid = sessionStatus?.loginSessionValid;
  // Until the first status lands, sessionStatus is null — don't flash the
  // "sign-in needed" state at everyone on mount.
  const isChecking = sessionStatus == null;
  const isExpired = sessionStatus != null && !loginValid && !isActive;
  const [rechecking, setRechecking] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

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

  const handleRecheck = async () => {
    setRechecking(true);
    try {
      const status = await onRecheck?.();
      if (status?.loginSessionValid) {
        toast.success('Connected!');
      } else {
        toast('Still signed out — sign in on the computer, then try again.');
      }
    } finally {
      setRechecking(false);
    }
  };

  return (
    <div data-testid="heb-signin-panel" className="bg-surface rounded-2xl shadow-warm border border-default p-4 sm:p-6 transition-colors duration-200">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-xl ${isActive ? 'bg-primary-light text-primary' : 'bg-background text-muted'}`}>
          {isActive ? <Wifi size={24} /> : <WifiOff size={24} />}
        </div>
        <div>
          <h2 className="text-lg font-semibold font-display text-heading">
            {isExpired ? 'HEB sign-in needed' : 'HEB Connection'}
          </h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      </div>

      {isExpired && (
        <div className="mb-4 space-y-3">
          <p className="text-sm text-body">
            The saved HEB login has expired, so the cart builder can't search products yet. Sign in again from the computer, then tap <strong>Check again</strong>.
          </p>
          <button
            onClick={handleRecheck}
            disabled={rechecking}
            className={`inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl font-medium text-sm transition-colors ${
              rechecking
                ? 'bg-primary/70 text-white cursor-wait'
                : 'bg-primary text-white hover:bg-primary-hover'
            }`}
          >
            {rechecking ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Check again
              </>
            )}
          </button>
          <div>
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              aria-expanded={showDetails}
              aria-controls="heb-login-details"
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-body transition-colors min-h-[44px] -my-2.5 align-top"
            >
              {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Show technical details
            </button>
            {showDetails && (
              <div id="heb-login-details" className="mt-2 text-xs text-muted space-y-1">
                <code className="block bg-background border border-default px-2 py-1 rounded text-body">npm run scrape:login</code>
                <p>Run this on the server, then re-check.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!isExpired && !isChecking && (
        <div className="flex gap-3">
          {!isActive ? (
            <button
              onClick={onConnect}
              disabled={connecting || !loginValid}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                connecting || !loginValid
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
