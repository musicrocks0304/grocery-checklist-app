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
