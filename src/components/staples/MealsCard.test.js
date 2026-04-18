import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealsCard from './MealsCard';

describe('MealsCard', () => {
  const items = [
    { ItemID: 1, ItemName: 'Chicken thighs', MealName: 'Chicken tacos' },
    { ItemID: 2, ItemName: 'Cilantro',       MealName: 'Chicken tacos' },
    { ItemID: 3, ItemName: 'Pasta',          MealName: 'Pasta alfredo' },
    { ItemID: 4, ItemName: 'Heavy cream',    MealName: 'Pasta alfredo' },
  ];

  test('renders header "From your meals" when activeMeal is null', () => {
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set()} onToggle={() => {}} />
    );
    expect(screen.getByText(/from your meals/i)).toBeInTheDocument();
  });

  test('renders meal subheaders when activeMeal is null', () => {
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set()} onToggle={() => {}} />
    );
    expect(screen.getByText('CHICKEN TACOS')).toBeInTheDocument();
    expect(screen.getByText('PASTA ALFREDO')).toBeInTheDocument();
  });

  test('hides header when activeMeal is set', () => {
    render(
      <MealsCard activeMeal="Chicken tacos" items={items.filter(i => i.MealName === 'Chicken tacos')} selected={new Set()} onToggle={() => {}} />
    );
    expect(screen.queryByText(/from your meals/i)).not.toBeInTheDocument();
  });

  test('renders an item row for each item', () => {
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set([1])} onToggle={() => {}} />
    );
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument();
    expect(screen.getByText('Cilantro')).toBeInTheDocument();
    expect(screen.getByText('Pasta')).toBeInTheDocument();
    expect(screen.getByText('Heavy cream')).toBeInTheDocument();
  });

  test('shows overall N/M counter in header', () => {
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set([1, 2])} onToggle={() => {}} />
    );
    expect(screen.getByText('2/4')).toBeInTheDocument();
  });

  test('chevron click collapses and expands (smoke — header still visible)', () => {
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set()} onToggle={() => {}} />
    );
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/from your meals/i));
    expect(screen.queryByText('Chicken thighs')).not.toBeInTheDocument();
    expect(screen.getByText(/from your meals/i)).toBeInTheDocument();
  });

  test('clicking an item checkbox calls onToggle with ItemID', () => {
    const onToggle = jest.fn();
    render(
      <MealsCard activeMeal={null} items={items} selected={new Set()} onToggle={onToggle} />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /chicken thighs/i }));
    expect(onToggle).toHaveBeenCalledWith(1);
  });
});
