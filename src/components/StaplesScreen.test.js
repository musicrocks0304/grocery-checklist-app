import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StaplesScreen from './StaplesScreen';

const baseHook = {
  items: [
    { ItemID: 1, ItemName: 'Milk',            Category: 'Dairy & eggs',       DataSource: 'Staples' },
    { ItemID: 2, ItemName: 'Bread',           Category: 'Bakery & bread',     DataSource: 'Staples' },
    { ItemID: 9, ItemName: 'Candles',         Category: 'Household & other',  DataSource: 'OneOff' },
    { ItemID: 100, ItemName: 'Chicken thighs',Category: 'Meat & seafood',     DataSource: 'MealIngredients' },
    { ItemID: 101, ItemName: 'Cilantro',      Category: 'Fruit & vegetables', DataSource: 'MealIngredients' },
  ],
  selected: new Set([1, 9, 100]),
  loading: false,
  error: null,
  toggle: jest.fn(),
  quickAdd: jest.fn(),
  removeOneOff: jest.fn(),
};

const mealsHookBase = {
  meals: [
    { mealName: 'Chicken tacos', ingredientNames: ['Chicken thighs', 'Cilantro'] },
  ],
  loading: false,
  error: null,
};

const renderWith = (overrides = {}) =>
  render(
    <StaplesScreen
      onReview={() => {}}
      staplesHook={{ ...baseHook, ...(overrides.staplesHook || {}) }}
      mealsHook={{ ...mealsHookBase, ...(overrides.mealsHook || {}) }}
    />
  );

describe('StaplesScreen', () => {
  test('renders the title', () => {
    renderWith();
    expect(screen.getByText(/grocery staples/i)).toBeInTheDocument();
  });

  test('renders category sections for non-one-off items', () => {
    renderWith();
    expect(screen.getByText('Dairy & eggs')).toBeInTheDocument();
    expect(screen.getByText('Bakery & bread')).toBeInTheDocument();
  });

  test('renders one-offs in the OneOffCard, not in a category', () => {
    renderWith();
    expect(screen.getByText('One-offs this week')).toBeInTheDocument();
    expect(screen.getByText('Candles')).toBeInTheDocument();
  });

  test('running count shows selected count', () => {
    renderWith();
    // 3 items selected (ItemID 1, ItemID 9, ItemID 100)
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('ReviewBar shows correct total', () => {
    renderWith();
    expect(screen.getByText(/3 items in your list/i)).toBeInTheDocument();
  });

  test('loading state renders a spinner', () => {
    renderWith({ staplesHook: { loading: true, items: [], selected: new Set() } });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('renders MealPillBar when meals are present', () => {
    renderWith();
    expect(screen.getByText('All items')).toBeInTheDocument();
    expect(screen.getByText('Chicken tacos')).toBeInTheDocument();
  });

  test('does not render MealPillBar when meals array is empty', () => {
    renderWith({ mealsHook: { meals: [] } });
    expect(screen.queryByText('All items')).not.toBeInTheDocument();
  });

  test('renders MealsCard with meal-ingredient items in "all items" view', () => {
    renderWith();
    expect(screen.getByText(/from your meals/i)).toBeInTheDocument();
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument();
    expect(screen.getByText('Cilantro')).toBeInTheDocument();
  });

  test('clicking a meal pill hides category sections and shows only meal items', () => {
    renderWith();
    fireEvent.click(screen.getByText('Chicken tacos'));
    expect(screen.queryByText('Dairy & eggs')).not.toBeInTheDocument();
    expect(screen.queryByText('Bakery & bread')).not.toBeInTheDocument();
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument();
    expect(screen.getByText('Cilantro')).toBeInTheDocument();
  });
});
