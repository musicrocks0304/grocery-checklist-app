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
});
