import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Plan from './Plan';

jest.mock('../hooks/useWeekStaples');
const useWeekStaples = require('../hooks/useWeekStaples').default;
jest.mock('../hooks/useWeekMeals');
const useWeekMeals = require('../hooks/useWeekMeals').default;

const staplesHookBase = {
  items: [
    { ItemID: 1, ItemName: 'Milk', Category: 'Dairy & eggs', DataSource: 'Staples' },
    { ItemID: 9, ItemName: 'Candles', Category: 'Household & other', DataSource: 'OneOff' },
  ],
  selected: new Set([1, 9]),
  loading: false,
  error: null,
  toggle: jest.fn(),
  quickAdd: jest.fn(),
  removeOneOff: jest.fn(),
};

const mealsHookBase = { meals: [], loading: false, error: null };

beforeEach(() => {
  useWeekStaples.mockReturnValue(staplesHookBase);
  useWeekMeals.mockReturnValue(mealsHookBase);
});

describe('Plan', () => {
  test('renders StaplesScreen by default, no Review overlay', () => {
    render(<Plan onNavigate={() => {}} />);
    expect(screen.getByText(/grocery staples/i)).toBeInTheDocument();
    expect(screen.queryByText(/review your list/i)).not.toBeInTheDocument();
  });

  test('clicking Review button opens ReviewScreen overlay', () => {
    render(<Plan onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(screen.getByText(/review your list/i)).toBeInTheDocument();
  });

  test('Back to edit closes the Review overlay', () => {
    render(<Plan onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /back to edit/i })[0]);
    expect(screen.queryByText(/review your list/i)).not.toBeInTheDocument();
  });

  test('Start Shopping navigates to shop', () => {
    const onNavigate = jest.fn();
    render(<Plan onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    fireEvent.click(screen.getByRole('button', { name: /start shopping/i }));
    expect(onNavigate).toHaveBeenCalledWith('shop');
  });
});
