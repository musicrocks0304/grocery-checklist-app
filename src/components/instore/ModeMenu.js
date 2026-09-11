import React, { useRef, useEffect } from "react";
import { Filter, User, MessageSquarePlus, Smartphone } from "lucide-react";
import { motion } from "framer-motion";

export const ModeMenu = ({ onReorder, onInvite, onFeedback, onClose, wakeLockActive, triggerRef }) => {
  const menuRef = useRef(null);
  useEffect(() => {
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [onClose]);
  useEffect(() => {
    const first = menuRef.current?.querySelector('[role="menuitem"]');
    if (first) {
      try { first.focus({ preventScroll: true }); } catch { first.focus(); }
    }
  }, []);
  const handleKeyDown = (e) => {
    const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || []);
    const index = items.indexOf(document.activeElement);
    const go = (next) => {
      e.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(index + 1);
    else if (e.key === "ArrowUp") go(index - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      triggerRef?.current?.focus();
    } else if (e.key === "Tab") onClose();
  };
  return (
    <motion.div
      ref={menuRef}
      role="menu"
      id="shop-mode-menu"
      aria-label="Shopping options"
      onKeyDown={handleKeyDown}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="absolute right-2.5 top-[58px] z-30 w-[200px] bg-surface border border-default rounded-[14px] shadow-warm-lg p-1.5"
    >
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={onReorder}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left text-[14px] text-heading hover:bg-background transition-colors"
      >
        <Filter size={16} className="text-body" />
        Reorder aisles
      </button>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={onInvite}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left text-[14px] text-heading hover:bg-background transition-colors"
      >
        <User size={16} className="text-body" />
        Invite partner
      </button>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={onFeedback}
        aria-label="Send feedback"
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left text-[14px] text-heading hover:bg-background transition-colors"
      >
        <MessageSquarePlus size={16} className="text-body" />
        Send feedback
      </button>
      {wakeLockActive && (
        <div className="px-3 pt-2 pb-1 text-[11px] text-muted flex items-center gap-1.5">
          <Smartphone size={12} />
          Screen stays awake while shopping
        </div>
      )}
    </motion.div>
  );
};
