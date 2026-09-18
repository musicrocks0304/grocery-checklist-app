import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ItemRow from './ItemRow';

describe('ItemRow', () => {
  const item = { ItemID: 42, ItemName: 'Oatmeal', Category: 'Cereal & breakfast' };

  test('renders the item name', () => {
    render(<ItemRow item={item} checked={false} onToggle={() => {}} />);
    expect(screen.getByText('Oatmeal')).toBeInTheDocument();
  });

  test('native checkbox reflects the checked prop', () => {
    render(<ItemRow item={item} checked={true} onToggle={() => {}} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('calls onToggle with the ItemID when clicked', () => {
    const onToggle = jest.fn();
    render(<ItemRow item={item} checked={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith(42);
  });

  // divider only toggles a border class; not asserted in unit tests

  test('IsOptional as the wire-shape number 0 does not leak into the accessible name', () => {
    const staple = { ItemID: 2, ItemName: 'Bread', IsOptional: 0 };
    render(<ItemRow item={staple} checked={false} onToggle={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Bread' })).toBeInTheDocument();
  });

  test('IsOptional as the wire-shape number 1 renders the optional marker', () => {
    const optional = { ItemID: 3, ItemName: 'Sriracha', IsOptional: 1 };
    render(<ItemRow item={optional} checked={false} onToggle={() => {}} />);
    expect(screen.getByRole('checkbox', { name: /sriracha.*optional/i })).toBeInTheDocument();
  });

  test('IsOptional as boolean true still renders the optional marker', () => {
    const optional = { ItemID: 4, ItemName: 'Cilantro', IsOptional: true };
    render(<ItemRow item={optional} checked={false} onToggle={() => {}} />);
    expect(screen.getByRole('checkbox', { name: /cilantro.*optional/i })).toBeInTheDocument();
  });
});

// F8: the Grocery List screen showed ingredient NAMES only, so an inflated
// quantity stayed invisible until the H-E-B Cart Builder spent it — which is
// exactly how F2's ratchet went unnoticed. QuantitySelected and Unit have always
// been on the client; they were simply never rendered.
describe('F8 — the purchase quantity is shown on the row', () => {
  test('a meal row shows its quantity and unit', () => {
    render(
      <ItemRow
        item={{ ItemID: 10, ItemName: 'Flour tortillas', QuantitySelected: 4, Unit: 'items' }}
        checked={false}
        onToggle={() => {}}
      />
    );
    expect(screen.getByRole('checkbox', { name: /Flour tortillas.*4 items/ })).toBeInTheDocument();
  });

  test('a count and a unit that starts with a digit are never jammed together', () => {
    render(
      <ItemRow
        item={{ ItemID: 11, ItemName: 'Ground beef', QuantitySelected: 2, Unit: '1 lb package' }}
        checked={false}
        onToggle={() => {}}
      />
    );
    const box = screen.getByRole('checkbox', { name: /Ground beef/ });
    expect(box).toHaveAccessibleName(expect.stringContaining('2 \u00d7 1 lb package'));
    expect(box).not.toHaveAccessibleName(expect.stringMatching(/beef\s*2 1 lb/));
  });

  test('a plain staple at quantity 1 gains no noise', () => {
    render(
      <ItemRow
        item={{ ItemID: 12, ItemName: 'Bread', QuantitySelected: 1, Unit: null }}
        checked={false}
        onToggle={() => {}}
      />
    );
    expect(screen.getByRole('checkbox', { name: 'Bread' })).toBeInTheDocument();
  });

  test('a staple the shopper set above 1 shows the count', () => {
    render(
      <ItemRow
        item={{ ItemID: 13, ItemName: 'Bananas', QuantitySelected: 3, Unit: null }}
        checked={false}
        onToggle={() => {}}
      />
    );
    expect(screen.getByRole('checkbox', { name: /Bananas.*3/ })).toBeInTheDocument();
  });

  test('the empty-week branch sends Quantity rather than QuantitySelected and still renders', () => {
    render(
      <ItemRow
        item={{ ItemID: 14, ItemName: 'Carrots', Quantity: 2, Unit: 'items' }}
        checked={false}
        onToggle={() => {}}
      />
    );
    expect(screen.getByRole('checkbox', { name: /Carrots.*2 items/ })).toBeInTheDocument();
  });
});
