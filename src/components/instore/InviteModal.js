import React, { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, X, Copy, Check } from "lucide-react";
import { motion, useIsPresent } from "framer-motion";
import { fadeIn, modalSpring } from "../../utils/animations";
import { ENDPOINTS, apiJson } from "../../config/api";
import useDialog from "../../hooks/useDialog";
import { HOST_SESSION_STORAGE_KEY } from "../../utils/shoppingSessions";

// Invite modal: POSTs to /create_session on mount to reserve a short-lived
// code (4h TTL) server-side, then shows a shareable `#join/CODE` URL. Partner
// who opens the URL is redirected to the same week's list and both devices
// poll shopping_progress for live sync. The host session is only persisted
// to sessionStorage once the host actually copies the link (handleCopy) —
// Cancel / X / backdrop must leave no local trace, even though the
// short-lived server-side row from create_session already exists (harmless,
// 4h TTL) by the time this decision is made.
export const InviteModal = ({ weekStartDate, onClose, returnFocusRef }) => {
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const sessionDataRef = useRef(null);
  const isPresent = useIsPresent();
  const { ref: dialogRef, dialogProps } = useDialog({ open: isPresent, onClose, returnFocusRef });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson(ENDPOINTS.createSession, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(weekStartDate ? { week_start_date: weekStartDate } : {}),
          timeout: 10000,
          retries: 0,
        });
        if (!cancelled) {
          sessionDataRef.current = {
            code: data.code,
            week_start_date: data.week_start_date,
            expires_at: data.expires_at,
          };
          setCode(data.code);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Couldn't create invite — check your connection and try again.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekStartDate]);

  const url = code ? `${window.location.origin}/#join/${code}` : "";

  const handleCopy = useCallback(async () => {
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* ignore clipboard failure — still show copied feedback */
    }
    // Only now does the host's device remember it has an active invite —
    // stash for the presence indicator on the host's own device.
    try {
      if (sessionDataRef.current) {
        sessionStorage.setItem(HOST_SESSION_STORAGE_KEY, JSON.stringify(sessionDataRef.current));
      }
    } catch {
      /* quota — non-fatal */
    }
    setCopied(true);
    setTimeout(onClose, 900);
  }, [url, onClose]);

  return (
    <motion.div
      {...fadeIn}
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-5"
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        {...dialogProps}
        aria-labelledby="invite-title"
        {...modalSpring}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-[18px] shadow-warm-xl p-5 w-full max-w-[340px]"
      >
        <div className="flex items-start mb-1">
          <div id="invite-title" className="flex-1 text-[18px] font-bold text-heading">
            Invite a partner
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 shrink-0 -mt-2 -mb-2.5 -mr-2 flex items-center justify-center text-muted hover:text-heading"
          >
            <X size={18} />
          </button>
        </div>
        <div className="text-[13px] text-muted mb-3.5">
          Share a link so they can check off items live with you. Code expires in 4 hours.
        </div>

        {loading && (
          <div className="bg-background border border-default rounded-[10px] px-3 py-4 mb-3 flex items-center justify-center gap-2 text-muted text-[13px]">
            <Loader2 size={14} className="animate-spin" />
            Creating invite…
          </div>
        )}

        {error && (
          <div className="bg-danger-light border border-danger/30 rounded-[10px] px-3 py-3 mb-3 text-[13px] text-danger">
            {error}
          </div>
        )}

        {code && (
          <div className="bg-background border border-default rounded-[10px] px-3 py-2.5 text-[13px] text-body font-mono mb-3 break-all">
            {url}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-[10px] border border-default bg-transparent text-body font-semibold hover:bg-background transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!code}
            className="flex-1 py-2.5 rounded-[10px] bg-primary text-white font-bold hover:bg-primary-hover transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copied ? <Check size={16} strokeWidth={3} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
