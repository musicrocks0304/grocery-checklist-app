import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  PartyPopper,
  Smartphone,
  Loader2,
  Tag,
  AlertCircle,
  Clock,
  MoreHorizontal,
  Filter,
  User,
  Undo2,
  X,
  Copy,
  Users,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { modalSpring, staggerContainer, staggerItem, fadeIn } from "../utils/animations";
import { EmptyState } from "./ui";
import confetti from "canvas-confetti";
import { getWeekDates } from "../utils/weekDates";
import { ENDPOINTS, apiFetch } from "../config/api";
import { DEFAULT_CATEGORY } from "../constants/categories";
import { useCategories } from "../hooks/useCategories";

const WALK_ORDER_STORAGE_KEY = "inStoreWalkOrder";
const JOINED_SESSION_STORAGE_KEY = "joinedShoppingSession";
const HOST_SESSION_STORAGE_KEY = "hostShoppingSession";

// The join_session webhook returns MySQL's naive datetime format
// ("YYYY-MM-DD HH:MM:SS"); the create_session webhook returns ISO. Normalize
// both to ms-since-epoch, treating naive strings as UTC (the server stores UTC).
const parseExpiryMs = (value) => {
  if (!value) return 0;
  const str = String(value);
  const iso = /[TZ]/.test(str) ? str : `${str.replace(" ", "T")}Z`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
};

// Reads a partner-join session from sessionStorage, if one is active. Returns
// `{code, week_start_date, expires_at}` or null. App.js writes this entry when
// a `#join/CODE` link resolves successfully.
const readJoinedSession = () => {
  try {
    const raw = sessionStorage.getItem(JOINED_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.week_start_date) return null;
    if (parsed.expires_at && parseExpiryMs(parsed.expires_at) < Date.now()) {
      sessionStorage.removeItem(JOINED_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

// Reads the session the current user created as host (written by InviteModal
// after a successful create_session). Used for the presence indicator on the
// host's own device. Same shape as joined session.
const readHostSession = () => {
  try {
    const raw = sessionStorage.getItem(HOST_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expires_at && parseExpiryMs(parsed.expires_at) < Date.now()) {
      sessionStorage.removeItem(HOST_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

// Orders the incoming sections array by the given walk order, with any
// unknown categories appended in encounter order so nothing is dropped.
const sortByWalkOrder = (sectionNames, walkOrder) => {
  const known = walkOrder.filter((name) => sectionNames.includes(name));
  const extras = sectionNames.filter((name) => !walkOrder.includes(name));
  return [...known, ...extras];
};

// Build { name, items[], checkedCount, totalCount }[] grouped by Category,
// sorted by the user's walk order. Within each section, unchecked items come
// first (in insertion order) and checked items sink to the bottom so the
// shopper can visually track what's left.
const groupByWalkOrder = (items, checked, walkOrder) => {
  const buckets = {};
  items.forEach((item) => {
    const name = item.Category || DEFAULT_CATEGORY;
    if (!buckets[name]) buckets[name] = [];
    buckets[name].push(item);
  });
  const orderedNames = sortByWalkOrder(Object.keys(buckets), walkOrder);
  return orderedNames.map((name) => {
    const bucket = buckets[name];
    const unchecked = bucket.filter((i) => !checked.has(i.ItemID.toString()));
    const checkedItems = bucket.filter((i) => checked.has(i.ItemID.toString()));
    return {
      name,
      items: [...unchecked, ...checkedItems],
      checkedCount: checkedItems.length,
      totalCount: bucket.length,
    };
  });
};


// 38px ring with centered `checked/total` in 11px bold.
const ProgressRing = React.memo(({ checked, total }) => {
  const size = 38;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? (checked / total) * 100 : 0;
  const offset = circumference * (1 - pct / 100);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 400ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold text-heading leading-none">
          {checked}/{total}
        </span>
      </div>
    </div>
  );
});
ProgressRing.displayName = "ProgressRing";

// Custom 30px checkmark circle. Fills with sage (or terracotta when the row
// needs coupon attention) once checked.
const Checkmark = React.memo(({ checked, attention }) => {
  const fillClass = attention ? "bg-accent border-accent" : "bg-primary border-primary";
  return (
    <div
      className={`w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-[180ms] ease-out border-2 ${
        checked ? fillClass : "bg-transparent border-[#D8D3CD]"
      }`}
    >
      {checked && <Check size={16} strokeWidth={3} className="text-white" />}
    </div>
  );
});
Checkmark.displayName = "Checkmark";

// Pill showing the discount text. Prominent (solid terracotta) when the
// coupon is unclipped; small tonal pill when already clipped.
const CouponChip = React.memo(({ coupon, prominent }) => {
  if (prominent) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent text-white px-2.5 py-0.5 text-[13px] font-bold leading-normal">
        <Tag size={12} strokeWidth={2.5} />
        {coupon.couponDiscount}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-light text-accent px-2 py-0.5 text-[11px] font-bold leading-normal">
      <Tag size={10} strokeWidth={2.5} />
      {coupon.couponDiscount}
    </span>
  );
});
CouponChip.displayName = "CouponChip";

const QuantityPill = React.memo(({ quantity, unit, dim }) => {
  const label = unit ? `${quantity || 1} ${unit}` : `×${quantity || 1}`;
  return (
    <span
      className={`flex-shrink-0 text-[14px] font-bold rounded-full px-[11px] py-[5px] transition-colors duration-200 ${
        dim ? "text-muted bg-transparent" : "text-primary bg-primary-light"
      }`}
    >
      {label}
    </span>
  );
});
QuantityPill.displayName = "QuantityPill";

const ItemRow = React.memo(({ item, isChecked, couponMatch, onToggle, isFirst }) => {
  const hasCoupon = !!couponMatch;
  const needsAttention = hasCoupon && !couponMatch.couponClipped && !isChecked;

  let bg = "bg-transparent";
  if (isChecked) bg = "bg-[#FAFAFA]";
  else if (needsAttention) bg = "bg-accent-light";

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isChecked}
      onClick={() => onToggle(item)}
      className={`w-full text-left flex items-center gap-3 px-[14px] py-4 min-h-[68px] transition-colors duration-[180ms] ease-out ${bg} ${
        isFirst ? "" : "border-t border-default"
      }`}
    >
      <Checkmark checked={isChecked} attention={needsAttention} />
      <div className="flex-1 min-w-0">
        <div
          className={`text-[17px] font-semibold leading-[1.25] ${
            isChecked ? "text-muted line-through" : "text-heading"
          }`}
        >
          {item.ItemName}
        </div>
        {hasCoupon && !isChecked && (
          <div className="mt-[5px] flex items-center gap-1.5 flex-wrap">
            <CouponChip coupon={couponMatch} prominent={needsAttention} />
            {couponMatch.couponClipped && (
              <span className="text-[11px] font-bold text-primary">✓ clipped</span>
            )}
            {needsAttention && (
              <span className="text-[11px] font-bold text-accent">clip it</span>
            )}
          </div>
        )}
      </div>
      <QuantityPill quantity={item.quantity} unit={item.Unit} dim={isChecked} />
    </button>
  );
});
ItemRow.displayName = "ItemRow";

// Collapsible section for a single aisle — header toggles body visibility.
// Whole header is clickable; chevron rotates to indicate state. Completed
// sections get a checkmark in the header but remain expandable for uncheck.
const AisleSection = React.memo(
  ({ section, collapsed, onToggle, checkedItems, couponLookup, onItemToggle }) => {
    const done = section.totalCount > 0 && section.checkedCount === section.totalCount;
    const remaining = section.totalCount - section.checkedCount;
    return (
      <div className="mb-3">
        <button
          type="button"
          onClick={() => onToggle(section.name)}
          aria-expanded={!collapsed}
          className="w-full flex items-center gap-2 px-1.5 py-2 text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[20px] font-bold leading-tight text-heading">
              {section.name}
            </div>
            <div className="text-[12px] text-muted mt-0.5">
              {done ? (
                <span className="text-primary font-semibold">All done</span>
              ) : (
                <>
                  {remaining} of {section.totalCount} remaining
                </>
              )}
            </div>
          </div>
          {done && (
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <Check size={12} strokeWidth={3} className="text-white" />
            </div>
          )}
          <ChevronDown
            size={20}
            className={`text-muted transition-transform duration-200 flex-shrink-0 ${
              collapsed ? "-rotate-90" : ""
            }`}
          />
        </button>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              style={{ overflow: "hidden" }}
            >
              <div className="bg-surface rounded-[20px] border border-default overflow-hidden shadow-warm-sm">
                {section.items.map((item, idx) => (
                  <ItemRow
                    key={item.ItemID}
                    item={item}
                    isChecked={checkedItems.has(item.ItemID.toString())}
                    couponMatch={couponLookup[item.ItemName?.toLowerCase()]}
                    onToggle={onItemToggle}
                    isFirst={idx === 0}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);
AisleSection.displayName = "AisleSection";

const ReorderDrawer = ({ sections, onMoveUp, onClose }) => (
  <div className="bg-primary-light border-b border-primary-border px-[14px] py-2.5">
    <div className="flex items-center mb-2">
      <div className="flex-1 text-[12px] font-bold text-primary uppercase tracking-[0.4px]">
        Walk order · tap ↑ to move up
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-primary text-[12px] font-bold px-2 py-1 rounded-md hover:bg-surface/60"
      >
        Done
      </button>
    </div>
    <div className="flex flex-col gap-1">
      {sections.map((section, i) => (
        <div
          key={section.name}
          className="bg-surface rounded-[10px] px-2.5 py-2 flex items-center gap-2 text-[13px]"
        >
          <span className="text-muted font-bold w-4 text-center">{i + 1}</span>
          <span className="flex-1 font-semibold text-heading">{section.name}</span>
          <button
            type="button"
            onClick={() => onMoveUp(i)}
            disabled={i === 0}
            aria-label={`Move ${section.name} up`}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-opacity ${
              i === 0 ? "opacity-30 cursor-not-allowed" : "bg-primary-light"
            }`}
          >
            <ChevronUp size={16} className="text-primary" />
          </button>
        </div>
      ))}
    </div>
  </div>
);

const ModeMenu = ({ onReorder, onInvite, onClose }) => {
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
  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="absolute right-2.5 top-[58px] z-30 w-[200px] bg-surface border border-default rounded-[14px] shadow-warm-lg p-1.5"
    >
      <button
        type="button"
        onClick={onReorder}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left text-[14px] text-heading hover:bg-background transition-colors"
      >
        <Filter size={16} className="text-body" />
        Reorder aisles
      </button>
      <button
        type="button"
        onClick={onInvite}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left text-[14px] text-heading hover:bg-background transition-colors"
      >
        <User size={16} className="text-body" />
        Invite partner
      </button>
    </motion.div>
  );
};

// Invite modal: POSTs to /create_session on mount to reserve a short-lived
// code (4h TTL) server-side, then shows a shareable `#join/CODE` URL. Partner
// who opens the URL is redirected to the same week's list and both devices
// poll shopping_progress for live sync.
const InviteModal = ({ weekStartDate, onClose }) => {
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(ENDPOINTS.createSession, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(weekStartDate ? { week_start_date: weekStartDate } : {}),
          timeout: 10000,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setCode(data.code);
          setLoading(false);
          // Stash for the presence indicator on the host's own device.
          try {
            sessionStorage.setItem(
              HOST_SESSION_STORAGE_KEY,
              JSON.stringify({
                code: data.code,
                week_start_date: data.week_start_date,
                expires_at: data.expires_at,
              })
            );
          } catch {
            /* quota — non-fatal */
          }
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
        {...modalSpring}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-[18px] shadow-warm-xl p-5 w-full max-w-[340px]"
      >
        <div className="flex items-start mb-1">
          <div className="flex-1 text-[18px] font-bold text-heading">
            Invite a partner
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 p-1 text-muted hover:text-heading"
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

// Quiet sage pill announcing a live partner session. Same visual for host or
// partner — v1 doesn't distinguish "someone joined" from "invite pending"
// (would need a server-side join counter; out of scope for this pass).
const PartnerBadge = ({ expiresAt }) => {
  const hoursLeft = expiresAt
    ? Math.max(0, Math.ceil((parseExpiryMs(expiresAt) - Date.now()) / 3_600_000))
    : null;
  return (
    <div className="flex items-center justify-center mb-3">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-light border border-primary-border px-3 py-1 text-[12px] font-semibold text-primary">
        <Users size={12} strokeWidth={2.5} />
        <span>Shopping with partner</span>
        {hoursLeft !== null && hoursLeft > 0 && (
          <span className="text-primary/70 font-normal">· {hoursLeft}h left</span>
        )}
      </div>
    </div>
  );
};

const UndoToast = ({ itemName, onUndo }) => (
  <motion.div
    initial={{ y: 20, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    exit={{ y: 20, opacity: 0 }}
    transition={{ duration: 0.24, ease: "easeOut" }}
    className="fixed left-3.5 right-3.5 bottom-[18px] z-20 bg-heading text-white rounded-[14px] px-3.5 py-3 flex items-center gap-2.5 shadow-warm-xl"
  >
    <Check size={18} strokeWidth={3} className="text-[#A8D5BD] flex-shrink-0" />
    <span className="flex-1 text-[14px]">
      Got <b>{itemName}</b>
    </span>
    <button
      type="button"
      onClick={onUndo}
      className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#A8D5BD] px-2 py-1"
    >
      <Undo2 size={14} />
      UNDO
    </button>
  </motion.div>
);

// Trip summary celebration card (confetti + stats) — preserved from the
// previous implementation; triggers when every item is checked off.
const TripSummaryCard = ({ totalItems, sectionsCleared, totalSections, shoppingMinutes, couponSavings, onExit }) => {
  useEffect(() => {
    const colors = ["#5B8A72", "#7CB896", "#C17849", "#E09565", "#f59e0b"];
    const fire = () => {
      confetti({ particleCount: 80, spread: 70, origin: { x: 0.1, y: 0.6 }, colors });
      confetti({ particleCount: 80, spread: 70, origin: { x: 0.9, y: 0.6 }, colors });
    };
    const t1 = setTimeout(fire, 400);
    const t2 = setTimeout(fire, 700);
    const t3 = setTimeout(() => {
      confetti({ particleCount: 120, spread: 100, origin: { x: 0.5, y: 0.4 }, colors });
    }, 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const stats = [
    { icon: Clock, label: "Shopping Time", value: shoppingMinutes < 1 ? "Under 1 min" : `${shoppingMinutes} min` },
    { icon: Check, label: "Items Checked", value: `${totalItems}` },
    { icon: ShoppingBag, label: "Aisles Cleared", value: `${sectionsCleared}/${totalSections}` },
  ];
  if (couponSavings > 0) {
    stats.push({ icon: Tag, label: "Coupon Savings", value: `$${couponSavings.toFixed(2)}` });
  }

  return (
    <motion.div {...fadeIn} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <motion.div {...modalSpring} className="bg-surface rounded-2xl shadow-warm-xl p-6 max-w-sm w-full">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
          className="flex items-center justify-center gap-2 mb-6"
        >
          <PartyPopper size={28} className="text-primary" />
          <h2 className="text-2xl font-bold font-display text-heading">All Done!</h2>
          <PartyPopper size={28} className="text-primary" />
        </motion.div>
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3 mb-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <motion.div key={stat.label} variants={staggerItem} className="flex items-center gap-3 p-3 rounded-xl bg-background">
                <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted">{stat.label}</p>
                  <p className="text-lg font-bold text-heading">{stat.value}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.3 }}
          onClick={onExit}
          className="w-full py-3.5 bg-primary text-white rounded-xl font-bold text-lg hover:bg-primary-hover transition-colors min-h-[56px]"
        >
          Return to Planner
        </motion.button>
      </motion.div>
    </motion.div>
  );
};

const InStoreMode = ({ inStoreData, onExit }) => {
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [shoppingList, setShoppingList] = useState(null);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [couponLookup, setCouponLookup] = useState({});
  const [couponLoadFailed, setCouponLoadFailed] = useState(false);
  const [showTripSummary, setShowTripSummary] = useState(false);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  // V5 state
  const { categories: dbCategories } = useCategories();
  const defaultWalkOrder = useMemo(
    () => (dbCategories && dbCategories.length > 0
      ? [...dbCategories].sort((a, b) => a.walk_order - b.walk_order).map((c) => c.name)
      : []),
    [dbCategories]
  );
  const [walkOrder, setWalkOrder] = useState([]);
  // Section names the user has manually collapsed. Default-expanded; adding
  // a name here hides that section's body until the user taps the header.
  const [collapsedSections, setCollapsedSections] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editOrder, setEditOrder] = useState(false);
  // Active partner session (either joined via invite or hosted). Refreshed
  // when the invite modal closes so the badge appears after "Copy link".
  const [partnerSession, setPartnerSession] = useState(
    () => readJoinedSession() || readHostSession() || null
  );

  const wakeLockRef = useRef(null);
  const celebratedRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const toastTimerRef = useRef(null);
  // Tracks the timestamp of the last local check/uncheck. The polling sync
  // ignores remote updates that land within ~2s of a local mutation so the
  // in-flight POST has time to land server-side (avoids brief flip-back).
  const lastLocalMutationRef = useRef(0);

  // --- Shopping list resolution: fetch-fresh-first with cache as offline fallback ---
  // Always re-fetch on mount so a mid-week addition/removal on the Plan screen
  // shows up here. The localStorage cache is a fallback for the API-down case
  // (spotty reception in the store), not a source of truth. A stale cache used
  // to cause "42/7" style counters because shopping_progress kept growing
  // while the cached list stayed frozen.
  useEffect(() => {
    const joined = readJoinedSession();
    const isJoined = !!joined;
    const weekData = getWeekDates();
    const targetWeekStart = joined?.week_start_date || weekData.startDate;

    // 1) Seed from prop (explicit pass-through, e.g. "Start Shopping" button)
    //    or from localStorage (if the cache matches this week). This gives an
    //    instant paint so the user isn't staring at a spinner.
    let seeded = false;
    if (inStoreData && inStoreData.items && inStoreData.items.length > 0 && !isJoined) {
      setShoppingList(inStoreData);
      seeded = true;
    } else if (!isJoined) {
      const stored = localStorage.getItem("inStoreShoppingList");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (
            parsed &&
            parsed.items &&
            parsed.items.length > 0 &&
            parsed.weekStartDate === targetWeekStart
          ) {
            setShoppingList(parsed);
            seeded = true;
          } else {
            localStorage.removeItem("inStoreShoppingList");
            localStorage.removeItem("inStoreCheckedItems");
          }
        } catch {
          /* invalid JSON, ignore */
        }
      }
    }

    // 2) Always refresh from backend in the background. Overwrites the seed
    //    with live data — that's the whole point of this refactor.
    let cancelled = false;
    const fetchItemsForWeek = async () => {
      if (!seeded) setIsAutoLoading(true);
      try {
        const url = new URL(ENDPOINTS.fetchGroceryItems);
        url.searchParams.append("weekStartDate", targetWeekStart);
        url.searchParams.append("weekEndDate", joined?.week_start_date ? "" : weekData.endDate);
        url.searchParams.append("weekDateRange", weekData.displayRange);
        url.searchParams.append("timestamp", new Date().toISOString());
        const response = await apiFetch(url.toString(), {
          method: "GET",
          mode: "cors",
          headers: { Accept: "application/json" },
        });
        if (cancelled || !response.ok) return;
        const data = await response.json();
        if (!Array.isArray(data)) return;
        const selectedItems = data
          .filter((item) => item.IsSelected === 1)
          .map((item) => ({ ...item, quantity: item.QuantitySelected || 1 }));
        const listData = {
          items: selectedItems,
          savedAt: new Date().toISOString(),
          weekDateRange: weekData.displayRange,
          weekStartDate: targetWeekStart,
          joined: isJoined ? { code: joined.code, expires_at: joined.expires_at } : undefined,
        };
        if (cancelled) return;
        setShoppingList(listData);
        if (!isJoined) {
          localStorage.setItem("inStoreShoppingList", JSON.stringify(listData));
        }
      } catch (err) {
        console.error("[in-store] Auto-fetch failed:", err.message);
        // Seed (if any) stays on screen. If there was no seed, caller sees the
        // empty-list state and can retry.
      } finally {
        if (!cancelled && !seeded) setIsAutoLoading(false);
      }
    };
    fetchItemsForWeek();
    return () => {
      cancelled = true;
    };
  }, [inStoreData]);

  // --- Load saved walk order (merge localStorage override with DB-sourced defaults) ---
  useEffect(() => {
    if (defaultWalkOrder.length === 0) return;
    try {
      const stored = localStorage.getItem(WALK_ORDER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = [...parsed, ...defaultWalkOrder.filter((n) => !parsed.includes(n))];
          setWalkOrder(merged);
          return;
        }
      }
    } catch {
      /* ignore bad storage */
    }
    setWalkOrder(defaultWalkOrder);
  }, [defaultWalkOrder]);

  const persistWalkOrder = useCallback((order) => {
    try {
      localStorage.setItem(WALK_ORDER_STORAGE_KEY, JSON.stringify(order));
    } catch {
      /* ignore quota */
    }
  }, []);

  // --- Load checked items from DB, fall back to localStorage ---
  useEffect(() => {
    if (!shoppingList) return;
    const loadCheckedItems = async () => {
      try {
        const weekStart = shoppingList.weekStartDate || getWeekDates().startDate;
        const weekRange = shoppingList.weekDateRange || getWeekDates().displayRange;
        const url = new URL(ENDPOINTS.shoppingProgress);
        url.searchParams.append("week_start_date", weekStart);
        // Backend JOINs against WeeklyGroceryList on WeekDateRange so stale
        // rows (items no longer on the list) are filtered out server-side.
        url.searchParams.append("week_date_range", weekRange);
        const response = await apiFetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          const data = await response.json();
          const checkedIds = Array.isArray(data) ? data.map((row) => String(row.item_id)) : [];
          setCheckedItems(new Set(checkedIds));
          return;
        }
      } catch {
        /* fall through to localStorage fallback */
      }
      try {
        const stored = localStorage.getItem("inStoreCheckedItems");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.savedAt === shoppingList.savedAt) {
            setCheckedItems(new Set(parsed.checkedIds));
          } else {
            localStorage.removeItem("inStoreCheckedItems");
          }
        }
      } catch {
        localStorage.removeItem("inStoreCheckedItems");
      }
    };
    loadCheckedItems();
  }, [shoppingList]);

  // --- Coupon lookup ---
  useEffect(() => {
    if (!shoppingList?.weekDateRange) return;
    const fetchCoupons = async () => {
      try {
        const url = `${ENDPOINTS.hebWeeklyItems}?weekDateRange=${encodeURIComponent(
          shoppingList.weekDateRange
        )}`;
        const response = await apiFetch(url, { timeout: 10000 });
        if (response.ok) {
          const data = await response.json();
          const items = data.items || data || [];
          const lookup = {};
          (Array.isArray(items) ? items : []).forEach((item) => {
            if (item.couponDiscount && item.ItemName) {
              lookup[item.ItemName.toLowerCase()] = {
                couponDiscount: item.couponDiscount,
                couponSavings: item.couponSavings,
                couponClipped: item.couponClipped,
                couponProductName: item.couponProductName,
              };
            }
          });
          setCouponLookup(lookup);
        }
      } catch {
        setCouponLoadFailed(true);
      }
    };
    fetchCoupons();
  }, [shoppingList?.weekDateRange]);

  // --- Screen Wake Lock ---
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
          setWakeLockActive(true);
          wakeLockRef.current.addEventListener("release", () => setWakeLockActive(false));
        }
      } catch {
        /* wake lock not supported or denied */
      }
    };
    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

  // --- Shopping timer ---
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMinutes(Math.floor((Date.now() - startTimeRef.current) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // --- Cleanup timers on unmount ---
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // --- Toggle check (+ toast on newly-checked) ---
  // TODO (offline): currently fires the DB POST fire-and-forget. Should queue
  // on failure and drain when back online. Tracked separately.
  const handleToggleItem = useCallback(
    (item) => {
      const itemId = item.ItemID.toString();
      lastLocalMutationRef.current = Date.now();
      setCheckedItems((prev) => {
        const next = new Set(prev);
        const isChecking = !next.has(itemId);
        if (isChecking) next.add(itemId);
        else next.delete(itemId);

        const weekStart = shoppingList?.weekStartDate || getWeekDates().startDate;
        const endpoint = isChecking
          ? ENDPOINTS.shoppingProgressCheck
          : ENDPOINTS.shoppingProgressUncheck;
        apiFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ week_start_date: weekStart, item_id: itemId }),
        }).catch(() => {});

        if (shoppingList) {
          localStorage.setItem(
            "inStoreCheckedItems",
            JSON.stringify({ savedAt: shoppingList.savedAt, checkedIds: Array.from(next) })
          );
        }

        if (isChecking) {
          setToast({ itemId, itemName: item.ItemName });
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => setToast(null), 3000);
        } else {
          // If we're un-checking the item currently shown in the toast, clear it.
          setToast((current) => (current && current.itemId === itemId ? null : current));
          if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
          }
        }

        return next;
      });
    },
    [shoppingList]
  );

  // Grouped items in walk order
  const grouped = useMemo(
    () => (shoppingList ? groupByWalkOrder(shoppingList.items, checkedItems, walkOrder) : []),
    [shoppingList, checkedItems, walkOrder]
  );

  const toggleSection = useCallback((name) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Auto-collapse a section when its last unchecked item gets checked off.
  // Tracks the previous "done" state per section so we only fire on the
  // transition (not-done → done), not on every render — otherwise an expanded
  // completed section would keep snapping shut when the user re-expanded it.
  const prevDoneRef = useRef({});
  useEffect(() => {
    const updates = [];
    grouped.forEach((s) => {
      const isDone = s.totalCount > 0 && s.checkedCount === s.totalCount;
      const wasDone = prevDoneRef.current[s.name];
      if (isDone && !wasDone) updates.push(s.name);
      prevDoneRef.current[s.name] = isDone;
    });
    if (updates.length > 0) {
      setCollapsedSections((prev) => {
        const next = new Set(prev);
        updates.forEach((n) => next.add(n));
        return next;
      });
    }
  }, [grouped]);

  const handleMoveUp = useCallback(
    (idx) => {
      if (idx === 0) return;
      setWalkOrder((prev) => {
        const next = [...prev];
        const name = grouped[idx].name;
        const prevName = grouped[idx - 1].name;
        const a = next.indexOf(name);
        const b = next.indexOf(prevName);
        if (a < 0 || b < 0) return prev;
        [next[a], next[b]] = [next[b], next[a]];
        persistWalkOrder(next);
        return next;
      });
    },
    [grouped, persistWalkOrder]
  );

  const handleUndo = useCallback(() => {
    if (!toast) return;
    const item = shoppingList?.items.find((i) => i.ItemID.toString() === toast.itemId);
    if (item) handleToggleItem(item);
    else setToast(null);
  }, [toast, shoppingList, handleToggleItem]);

  // Totals + trip summary trigger. `totalChecked` intersects the raw checked
  // set against the items actually on the list — this makes the counter
  // resilient to stale shopping_progress rows (items that were once checked
  // but have since been removed from the weekly list).
  const totalItems = shoppingList ? shoppingList.items.length : 0;
  const totalChecked = useMemo(() => {
    if (!shoppingList) return 0;
    return shoppingList.items.reduce(
      (n, i) => (checkedItems.has(i.ItemID.toString()) ? n + 1 : n),
      0
    );
  }, [shoppingList, checkedItems]);
  const allDone = totalItems > 0 && shoppingList.items.every(
    (i) => checkedItems.has(String(i.ItemID))
  );

  useEffect(() => {
    if (allDone && !celebratedRef.current) {
      celebratedRef.current = true;
      setTimeout(() => setShowTripSummary(true), 800);
    }
    if (!allDone) {
      celebratedRef.current = false;
      setShowTripSummary(false);
    }
  }, [allDone]);

  // --- Live sync polling ---
  // Polls shopping_progress every 4s so two devices (host + invited partner)
  // see each other's check-offs within ~5s. Ignores poll results within 2s
  // of a local mutation so in-flight POSTs don't get overwritten by a stale
  // remote snapshot. Stops when tab is hidden to save battery.
  useEffect(() => {
    if (!shoppingList) return undefined;
    const weekStart = shoppingList.weekStartDate;
    if (!weekStart) return undefined;

    let cancelled = false;

    const weekRange = shoppingList.weekDateRange;

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLocalMutationRef.current < 2000) return;
      try {
        const url = new URL(ENDPOINTS.shoppingProgress);
        url.searchParams.append("week_start_date", weekStart);
        if (weekRange) url.searchParams.append("week_date_range", weekRange);
        const res = await apiFetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          timeout: 8000,
          retries: 0,
        });
        if (cancelled || !res.ok) return;
        const data = await res.json();
        const remoteIds = Array.isArray(data) ? data.map((r) => String(r.item_id)) : [];
        if (cancelled) return;
        // Re-check mutation timestamp in case user toggled during the fetch.
        if (Date.now() - lastLocalMutationRef.current < 2000) return;
        setCheckedItems((prev) => {
          const next = new Set(remoteIds);
          if (prev.size === next.size && Array.from(prev).every((id) => next.has(id))) {
            return prev;
          }
          return next;
        });
      } catch {
        /* network hiccup — try again next tick */
      }
    };

    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [shoppingList]);

  const couponSavingsTotal = useMemo(() => {
    if (!shoppingList?.items || !couponLookup) return 0;
    return shoppingList.items.reduce((sum, item) => {
      if (checkedItems.has(item.ItemID.toString())) {
        const match = couponLookup[item.ItemName?.toLowerCase()];
        if (match?.couponSavings) return sum + parseFloat(match.couponSavings);
      }
      return sum;
    }, 0);
  }, [shoppingList, checkedItems, couponLookup]);

  const sectionsCleared = useMemo(
    () => grouped.filter((s) => s.checkedCount === s.totalCount && s.totalCount > 0).length,
    [grouped]
  );

  const handleExit = useCallback(() => {
    if (totalChecked > 0 && totalChecked < totalItems) {
      const confirmed = window.confirm(
        `You still have ${totalItems - totalChecked} item${
          totalItems - totalChecked === 1 ? "" : "s"
        } unchecked. Exit shopping mode?`
      );
      if (!confirmed) return;
    }
    onExit();
  }, [totalChecked, totalItems, onExit]);

  // Loading state
  if (isAutoLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="sticky top-0 z-10 bg-surface shadow-sm">
          <div className="flex items-center gap-3 px-4 h-14">
            <button
              onClick={onExit}
              className="p-2 -ml-2 rounded-xl text-body hover:text-heading hover:bg-background transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-lg font-bold font-display text-heading">Shopping List</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-primary mx-auto mb-3" />
            <p className="text-body">Loading this week's grocery list...</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!shoppingList || !shoppingList.items || shoppingList.items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="sticky top-0 z-10 bg-surface shadow-sm">
          <div className="flex items-center gap-3 px-4 h-14">
            <button
              onClick={onExit}
              className="p-2 -ml-2 rounded-xl text-body hover:text-heading hover:bg-background transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-lg font-bold font-display text-heading">Shopping List</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon={ShoppingBag}
            title="No Shopping List"
            description="No items selected for this week yet. Add items to your grocery list first."
            action={{ label: "Go to Grocery Selection", onClick: onExit }}
          />
        </div>
      </div>
    );
  }

  const itemsLeft = totalItems - totalChecked;

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      {/* Header + (reorder drawer when editing walk order) */}
      <div className="sticky top-0 z-20 bg-surface">
        {/* Top row */}
        <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-default relative">
          <button
            type="button"
            onClick={handleExit}
            aria-label="Go back"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-body hover:text-heading hover:bg-background transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          <ProgressRing checked={totalChecked} total={totalItems} />
          <div className="flex-1 min-w-0 text-[14px] font-semibold text-heading truncate">
            {itemsLeft === 0 ? "All done!" : `${itemsLeft} item${itemsLeft === 1 ? "" : "s"} left`}
            {elapsedMinutes > 0 && (
              <span className="ml-2 text-[11px] font-normal text-muted">
                · {elapsedMinutes}m
              </span>
            )}
          </div>
          {wakeLockActive && (
            <Smartphone
              size={14}
              className="text-primary/60 flex-shrink-0"
              aria-label="Screen stays awake"
            />
          )}
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            aria-label="More"
            aria-expanded={showMenu}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-body hover:text-heading hover:bg-background transition-colors"
          >
            <MoreHorizontal size={20} />
          </button>

          <AnimatePresence>
            {showMenu && (
              <ModeMenu
                onReorder={() => {
                  setEditOrder((v) => !v);
                  setShowMenu(false);
                }}
                onInvite={() => {
                  setShowInvite(true);
                  setShowMenu(false);
                }}
                onClose={() => setShowMenu(false)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Reorder drawer shown when editing walk order */}
        {editOrder && (
          <ReorderDrawer
            sections={grouped}
            onMoveUp={handleMoveUp}
            onClose={() => setEditOrder(false)}
          />
        )}
      </div>

      {/* Scroll content — all aisles as collapsible sections, in walk order */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-24">
        {partnerSession && (
          <PartnerBadge expiresAt={partnerSession.expires_at} />
        )}

        {grouped.map((section) => (
          <AisleSection
            key={section.name}
            section={section}
            collapsed={collapsedSections.has(section.name)}
            onToggle={toggleSection}
            checkedItems={checkedItems}
            couponLookup={couponLookup}
            onItemToggle={handleToggleItem}
          />
        ))}

        {couponLoadFailed && (
          <div className="mt-4 px-2 text-xs text-muted flex items-center gap-1.5">
            <AlertCircle size={12} />
            Coupon reminders unavailable
          </div>
        )}
      </div>

      {/* Undo toast */}
      <AnimatePresence>
        {toast && <UndoToast itemName={toast.itemName} onUndo={handleUndo} />}
      </AnimatePresence>

      {/* Invite partner modal */}
      <AnimatePresence>
        {showInvite && (
          <InviteModal
            weekStartDate={shoppingList?.weekStartDate}
            onClose={() => {
              setShowInvite(false);
              // Surface the presence badge as soon as the host has a code.
              setPartnerSession(readJoinedSession() || readHostSession() || null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Trip summary overlay */}
      <AnimatePresence>
        {showTripSummary && (
          <TripSummaryCard
            totalItems={totalItems}
            sectionsCleared={sectionsCleared}
            totalSections={grouped.length}
            shoppingMinutes={Math.round((Date.now() - startTimeRef.current) / 60000)}
            couponSavings={couponSavingsTotal}
            onExit={onExit}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

export default InStoreMode;
