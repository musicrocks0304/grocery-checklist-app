import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealPillBar from './MealPillBar';

describe('MealPillBar', () => {
  const meals = [
    { name: 'Chicken tacos', itemIds: [1, 2, 3, 4] },
    { name: 'Pasta alfredo', itemIds: [5, 6] },
  ];

  test('renders nothing when meals array is empty', () => {
    const { container } = render(
      <MealPillBar meals={[]} selected={new Set()} mealFocus={null} onFocusChange={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders "All items" pill + one pill per meal', () => {
    render(
      <MealPillBar meals={meals} selected={new Set()} mealFocus={null} onFocusChange={() => {}} />
    );
    expect(screen.getByText('All items')).toBeInTheDocument();
    expect(screen.getByText('Chicken tacos')).toBeInTheDocument();
    expect(screen.getByText('Pasta alfredo')).toBeInTheDocument();
  });

  test('shows N/M counter on meal pills', () => {
    render(
      <MealPillBar meals={meals} selected={new Set([1, 2])} mealFocus={null} onFocusChange={() => {}} />
    );
    expect(screen.getByText('2/4')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  test('clicking a meal pill calls onFocusChange with the meal name', () => {
    const onFocusChange = jest.fn();
    render(
      <MealPillBar meals={meals} selected={new Set()} mealFocus={null} onFocusChange={onFocusChange} />
    );
    fireEvent.click(screen.getByText('Chicken tacos'));
    expect(onFocusChange).toHaveBeenCalledWith('Chicken tacos');
  });

  test('clicking "All items" calls onFocusChange with null', () => {
    const onFocusChange = jest.fn();
    render(
      <MealPillBar meals={meals} selected={new Set()} mealFocus={'Chicken tacos'} onFocusChange={onFocusChange} />
    );
    fireEvent.click(screen.getByText('All items'));
    expect(onFocusChange).toHaveBeenCalledWith(null);
  });
});
