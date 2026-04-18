import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StaplesScreen from './StaplesScreen';

jest.mock('../hooks/useWeekStaples');
const useWeekStaples = require('../hooks/useWeekStaples').default;

const baseHook = {
  items: [
    { ItemID: 1, ItemName: 'Milk',    Category: 'Dairy & eggs',     DataSource: 'Staples' },
    { ItemID: 2, ItemName: 'Bread',   Category: 'Bakery & bread',   DataSource: 'Staples' },
    { ItemID: 9, ItemName: 'Candles', Category: 'Household & other',DataSource: 'OneOff' },
  ],
  selected: new Set([1, 9]),
  loading: false,
  error: null,
  toggle: jest.fn(),
  quickAdd: jest.fn(),
  removeOneOff: jest.fn(),
};

beforeEach(() => {
  useWeekStaples.mockReturnValue(baseHook);
});

describe('StaplesScreen', () => {
  test('renders the title', () => {
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByText(/grocery staples/i)).toBeInTheDocument();
  });

  test('renders category sections for non-one-off items', () => {
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByText('Dairy & eggs')).toBeInTheDocument();
    expect(screen.getByText('Bakery & bread')).toBeInTheDocument();
  });

  test('renders one-offs in the OneOffCard, not in a category', () => {
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByText('One-offs this week')).toBeInTheDocument();
    expect(screen.getByText('Candles')).toBeInTheDocument();
  });

  test('running count shows selected count', () => {
    render(<StaplesScreen onReview={() => {}} />);
    // 2 items selected (ItemID 1, ItemID 9)
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('ReviewBar shows correct total', () => {
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByText(/2 items in your list/i)).toBeInTheDocument();
  });

  test('loading state renders a spinner', () => {
    useWeekStaples.mockReturnValue({ ...baseHook, loading: true, items: [], selected: new Set() });
    render(<StaplesScreen onReview={() => {}} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
