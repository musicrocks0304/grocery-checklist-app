import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CategorySection from './CategorySection';

describe('CategorySection', () => {
  const group = {
    name: 'Dairy & eggs',
    items: [
      { ItemID: 1, ItemName: 'Whole milk' },
      { ItemID: 2, ItemName: 'Large eggs' },
    ],
  };

  test('renders the category name', () => {
    render(
      <CategorySection group={group} selected={new Set()} onToggle={() => {}} onToggleAll={() => {}} />
    );
    expect(screen.getByText('Dairy & eggs')).toBeInTheDocument();
  });

  test('renders 0/2 when nothing selected', () => {
    render(
      <CategorySection group={group} selected={new Set()} onToggle={() => {}} onToggleAll={() => {}} />
    );
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  test('renders 2/2 when all selected, and button text is "Clear"', () => {
    render(
      <CategorySection
        group={group}
        selected={new Set([1, 2])}
        onToggle={() => {}}
        onToggleAll={() => {}}
      />
    );
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  test('button reads "All" when not fully selected', () => {
    render(
      <CategorySection
        group={group}
        selected={new Set([1])}
        onToggle={() => {}}
        onToggleAll={() => {}}
      />
    );
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  test('clicking bulk button calls onToggleAll', () => {
    const onToggleAll = jest.fn();
    render(
      <CategorySection
        group={group}
        selected={new Set()}
        onToggle={() => {}}
        onToggleAll={onToggleAll}
      />
    );
    fireEvent.click(screen.getByText('All'));
    expect(onToggleAll).toHaveBeenCalled();
  });

  test('renders all items', () => {
    render(
      <CategorySection group={group} selected={new Set()} onToggle={() => {}} onToggleAll={() => {}} />
    );
    expect(screen.getByText('Whole milk')).toBeInTheDocument();
    expect(screen.getByText('Large eggs')).toBeInTheDocument();
  });
});
