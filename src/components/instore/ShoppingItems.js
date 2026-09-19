import React from "react";
import { Check, Tag, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatAisleBadge } from "../../utils/shoppingList";
import { formatNeed, formatPurchaseBadge } from "../../utils/formatPurchase";

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

const QuantityPill = React.memo(({ quantity, unit, need, dim }) => {
  // Shared formatter: this pill used to glue a bare count to a unit that can
  // itself start with a number, printing "2 1 lb package" in the aisle (F6).
  // Slice 1: a meal row shows the recipe NEED — in the aisle the pill IS the
  // purchase instruction. Staples and one-offs keep their badge.
  const label = need || formatPurchaseBadge(quantity || 1, unit);
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
  const aisleBadge = formatAisleBadge(item.store_location);

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
          {aisleBadge ? (
            <span
              className={`ml-2 text-[11px] align-middle ${
                isChecked ? "text-muted" : "text-muted/80"
              }`}
              aria-label={`Location: ${item.store_location}`}
            >
              {aisleBadge}
            </span>
          ) : (
            <span className="sr-only">Location unknown</span>
          )}
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
      <QuantityPill quantity={item.quantity} unit={item.Unit} need={formatNeed(item)} dim={isChecked} />
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

export { ProgressRing, AisleSection };
