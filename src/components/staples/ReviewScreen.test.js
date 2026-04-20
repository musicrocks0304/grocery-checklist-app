import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReviewScreen from './ReviewScreen';

const items = [
  { ItemID: 1, ItemName: 'Milk', Category: 'Dairy & eggs', DataSource: 'Staples' },
  { ItemID: 2, ItemName: 'Bread', Category: 'Bakery & bread', DataSource: 'Staples' },
  { ItemID: 9, ItemName: 'Candles', Category: 'Household & other', DataSource: 'OneOff' },
  { ItemID: 100, ItemName: 'Chicken thighs', Category: 'Meat & seafood', DataSource: 'MealIngredients' },
  { ItemID: 3, ItemName: 'Gatorade', Category: 'Beverages', DataSource: 'Staples' }, // unselected
];

const meals = [
  { mealName: 'Chicken tacos', ingredientNames: ['Chicken thighs'] },
];

describe('ReviewScreen', () => {
  test('shows header with selected count and week range', () => {
    render(
      <ReviewScreen
        items={items}
        selected={new Set([1, 2, 9, 100])}
        meals={meals}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText(/review your list/i)).toBeInTheDocument();
    expect(screen.getByText(/4 items/i)).toBeInTheDocument();
  });

  test('renders One-offs / Meals / Staples sections with selected items only', () => {
    render(
      <ReviewScreen
        items={items}
        selected={new Set([1, 2, 9, 100])}
        meals={meals}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText('Candles')).toBeInTheDocument();       // OneOff
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument(); // Meal ingredient
    expect(screen.getByText('Chicken tacos')).toBeInTheDocument();  // Meal name
    expect(screen.getByText('Milk')).toBeInTheDocument();           // Staple
    expect(screen.getByText('Bread')).toBeInTheDocument();          // Staple
    expect(screen.queryByText('Gatorade')).not.toBeInTheDocument(); // Unselected, hidden
  });

  test('Start Shopping calls onStartShopping, Back calls onBack', () => {
    const onBack = jest.fn();
    const onStartShopping = jest.fn();
    render(
      <ReviewScreen
        items={items}
        selected={new Set([1])}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={onBack}
        onStartShopping={onStartShopping}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /start shopping/i }));
    expect(onStartShopping).toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: /back to edit/i })[0]);
    expect(onBack).toHaveBeenCalled();
  });

  test('remove button calls onRemoveOneOff for OneOffs, onToggle for others', () => {
    const onToggle = jest.fn();
    const onRemoveOneOff = jest.fn();
    render(
      <ReviewScreen
        items={items}
        selected={new Set([1, 9])}
        meals={[]}
        onToggle={onToggle}
        onRemoveOneOff={onRemoveOneOff}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /remove candles/i }));
    expect(onRemoveOneOff).toHaveBeenCalledWith(9);
    fireEvent.click(screen.getByRole('button', { name: /remove milk/i }));
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  test('empty state when nothing selected', () => {
    render(
      <ReviewScreen
        items={items}
        selected={new Set()}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText(/nothing selected yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start shopping/i })).toBeDisabled();
  });
});
