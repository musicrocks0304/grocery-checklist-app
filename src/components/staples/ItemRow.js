import React from 'react';

const ItemRow = React.memo(({ item, checked, onToggle, divider = false }) => {
  const inputId = `staple-item-${item.ItemID}`;
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
        className="w-5 h-5 text-primary rounded focus:ring-focus flex-shrink-0"
      />
      <label
        htmlFor={inputId}
        className={`flex-1 text-sm cursor-pointer ${
          checked ? 'text-heading font-medium' : 'text-body'
        }`}
      >
        {item.ItemName}
      </label>
    </div>
  );
});

export default ItemRow;
