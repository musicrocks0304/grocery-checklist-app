import React from 'react';
import { summarizePurchase } from '../../utils/formatPurchase';

const ItemRow = React.memo(({ item, checked, onToggle, divider = false }) => {
  const inputId = `staple-item-${item.ItemID}`;
  // IsOptional arrives over the wire as the JSON number 0/1 (COALESCE(..., 0)
  // AS IsOptional), not a boolean. `{0 && <span/>}` renders the digit "0" in
  // JSX, so every consumer must coerce here rather than trust the raw value.
  const isOptional =
    item.IsOptional === 1 || item.IsOptional === '1' || item.IsOptional === true;
  // F8: the list the shopper actually shops from showed names only, so an
  // inflated quantity was invisible until the H-E-B Cart Builder spent it.
  // summarizePurchase returns '' for a bare 1, so plain staples stay clean.
  const purchase = summarizePurchase(item);
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] ${
        divider ? 'border-b border-default' : ''
      }`}
    >
      <input
        type="checkbox"
        id={inputId}
        checked={checked}
        onChange={() => onToggle(item.ItemID)}
        className="w-5 h-5 accent-primary rounded focus:ring-focus flex-shrink-0"
      />
      <label
        htmlFor={inputId}
        className={`flex-1 text-sm cursor-pointer ${
          checked ? 'text-heading font-medium' : 'text-body'
        }`}
      >
        {item.ItemName}
        {purchase && (
          <span className="ml-2 text-xs font-medium text-muted">{purchase}</span>
        )}
        {isOptional && (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">
            optional
          </span>
        )}
      </label>
    </div>
  );
});

export default ItemRow;
