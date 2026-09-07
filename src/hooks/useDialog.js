// Accessible dialog behaviour (hardening sub-project G): focus capture on
// open, initial focus, Tab/Shift+Tab trapped inside, Escape → onClose, and
// focus returned to the opener (or a fallback) on close. Framework-free: it
// renders nothing, never touches document.body or siblings, and uses no
// layout queries, so it behaves identically in jsdom and Chromium.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const SELECTOR = 'a[href], button, input, textarea, select, [tabindex]';
const HIDDEN = '[hidden], .hidden, [aria-hidden="true"]';

/** Keyboard-reachable descendants of `container`, in DOM order. */
export function getFocusable(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return [];
  return Array.from(container.querySelectorAll(SELECTOR)).filter((el) => {
    if (el.disabled) return false;
    if (el.getAttribute('tabindex') === '-1') return false;
    if (el.closest(HIDDEN)) return false;
    return true;
  });
}

function focusEl(el) {
  if (!el || typeof el.focus !== 'function') return;
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
}

export default function useDialog({ open, onClose, initialFocusRef, returnFocusRef } = {}) {
  const ref = useRef(null);
  const openerRef = useRef(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnRef = useRef(returnFocusRef);
  returnRef.current = returnFocusRef;

  const restore = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    const fallback = returnRef.current && returnRef.current.current;
    if (opener && opener.isConnected && opener !== document.body) focusEl(opener);
    else if (fallback && fallback.isConnected) focusEl(fallback);
  }, []);

  // Runs after the dialog's DOM is committed (child effects run before the
  // parent's), so `ref.current` is populated when `open` turns true.
  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      openerRef.current = typeof document !== 'undefined' ? document.activeElement : null;
      const target = (initialFocusRef && initialFocusRef.current) || getFocusable(ref.current)[0] || ref.current;
      focusEl(target);
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      restore();
    }
  }, [open, initialFocusRef, restore]);

  // A dialog that unmounts while still "open" (InviteModal is mounted only
  // while shown) restores focus on unmount.
  useEffect(() => () => {
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      restore();
    }
  }, [restore]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (onCloseRef.current) onCloseRef.current();
      return;
    }
    if (e.key !== 'Tab') return;
    const container = ref.current;
    const items = getFocusable(container);
    if (items.length === 0) {
      e.preventDefault();
      focusEl(container);
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = container && container.contains(active);
    if (e.shiftKey) {
      if (!inside || active === first || active === container) {
        e.preventDefault();
        focusEl(last);
      }
    } else if (!inside || active === last) {
      e.preventDefault();
      focusEl(first);
    }
  }, []);

  return { ref, dialogProps: { role: 'dialog', 'aria-modal': true, tabIndex: -1, onKeyDown } };
}
