import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AisleSection } from './ShoppingItems';

// Purchase-need slice 1 — In-Store Mode is where Corey actually shops (385
// check-offs against 3 cart builds), so this pill IS the purchase
// instruction. It read "×1 · 1 lb package" for 4 oz of peppers.
const renderSection = (items) =>
  render(
    <AisleSection
      section={{ name: 'Produce', items, totalCount: items.length, checkedCount: 0 }}
      collapsed={false}
      onToggle={() => {}}
      checkedItems={new Set()}
      couponLookup={{}}
      onItemToggle={() => {}}
    />
  );
const need = { NeedOz: null, NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: 0 };

describe('In-Store quantity pill', () => {
  test('a meal row shows the recipe need, not the package guess', () => {
    renderSection([{ ...need, ItemID: 1084, ItemName: 'Sweet peppers', quantity: 1, Unit: '1 lb package', store_location: null, NeedOz: '4.0000000' }]);
    const row = screen.getByRole('checkbox', { name: /Sweet peppers/ });
    expect(row).toHaveTextContent('4 oz');
    expect(row).not.toHaveTextContent('lb package');
  });

  test('a count need is the bare number of pieces, not a ×N badge', () => {
    renderSection([{ ...need, ItemID: 1158, ItemName: 'Corn tortillas', quantity: 36, Unit: 'items', store_location: null, NeedCount: '36.000', NeedCountUnit: 'piece' }]);
    const row = screen.getByRole('checkbox', { name: /Corn tortillas/ });
    expect(row).toHaveTextContent('36');
    expect(row).not.toHaveTextContent('×36');
    expect(row).not.toHaveTextContent('36 items');
  });

  test('a staple keeps its badge exactly as before', () => {
    renderSection([{ ItemID: 23, ItemName: 'Bread', quantity: 3, Unit: null, store_location: null }]);
    expect(screen.getByRole('checkbox', { name: /Bread/ })).toHaveTextContent('×3');
  });

  test('a meal row with no need keeps the F6 text', () => {
    renderSection([{ ItemID: 1201, ItemName: 'Ground beef', quantity: 2, Unit: '1 lb package', store_location: null }]);
    expect(screen.getByRole('checkbox', { name: /Ground beef/ })).toHaveTextContent('2 × 1 lb package');
  });
});
