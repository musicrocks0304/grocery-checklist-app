import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeIngredients from './RecipeIngredients';

// The per-item control is a MULTIPLIER ("how many of the suggested purchase amount
// to buy"). It must start at 1. Seeding it with QuantitySelected made every
// ingredient whose purchase quantity was a bare number render as N x N — an 8-pack
// of tortillas displayed as "8 x 8 items" on the confirmation screen (F3).
const groceryListData = [
  {
    output: {
      ingredients: [
        {
          name: 'flour tortillas',
          category: 'grains',
          purchaseQuantity: '8',
          purchaseUnit: 'items',
          recipeNeeds: '8 pieces',
          usedInRecipes: ['Test Recipe'],
        },
        {
          // Control: a purchase quantity carrying a unit word parses to 1, so this
          // one never showed the bug. It must keep rendering exactly as before.
          // Same category as the item above so both land in one rendered group.
          name: 'long grain white rice',
          category: 'grains',
          purchaseQuantity: '2 lbs',
          purchaseUnit: '1 lb package',
          recipeNeeds: '1 lb 4 oz',
          usedInRecipes: ['Test Recipe'],
        },
      ],
    },
  },
];

const selectedMeals = [{ id: 1, name: 'Test Recipe', description: 'A recipe' }];

const renderScreen = () =>
  render(
    <RecipeIngredients
      selectedMeals={selectedMeals}
      groceryListData={groceryListData}
      onNavigate={() => {}}
      debugMode={false}
    />,
  );

describe('RecipeIngredients quantity display', () => {
  test('selection screen does not multiply a bare-number purchase quantity by itself', async () => {
    renderScreen();

    expect(await screen.findByText('flour tortillas')).toBeInTheDocument();

    // The "= N x M" hint only renders when the multiplier is > 1. At rest the
    // multiplier is 1, so no such hint should exist for any item.
    expect(screen.queryByText(/=\s*8\s*×\s*8/)).not.toBeInTheDocument();
  });

  test('review screen shows "8 items", not "8 x 8 items"', async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /Review List/i }));

    expect(await screen.findByText(/Recipe Grocery List/i)).toBeInTheDocument();

    expect(screen.getByText('8 items')).toBeInTheDocument();
    expect(screen.queryByText(/8\s*×\s*8/)).not.toBeInTheDocument();
  });

  test('a unit-bearing purchase quantity is unchanged', async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /Review List/i }));

    expect(await screen.findByText(/Recipe Grocery List/i)).toBeInTheDocument();

    expect(screen.getByText('2 lbs 1 lb package')).toBeInTheDocument();
  });

  // F3b: the initial seed was fixed, but the two *toggle* paths still seeded the
  // multiplier from QuantitySelected, so one ordinary interaction brought the
  // squared display straight back. Reproduced on production 2026-09-17:
  // deselecting and re-selecting flour tortillas re-rendered "= 4 x 4 items".
  test('re-selecting an item leaves its multiplier at 1', async () => {
    renderScreen();

    expect(await screen.findByText('flour tortillas')).toBeInTheDocument();

    // The row checkboxes carry no accessible name, so drive them all: every item
    // goes through the same toggleItemSelection path that reseeded the multiplier.
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => fireEvent.click(cb)); // deselect
    checkboxes.forEach((cb) => fireEvent.click(cb)); // re-select

    expect(screen.queryByText(/=\s*8\s*×\s*8/)).not.toBeInTheDocument();
  });

  test('Select All leaves multipliers at 1', async () => {
    renderScreen();

    expect(await screen.findByText('flour tortillas')).toBeInTheDocument();

    // Everything starts selected, so the group button reads "Deselect All".
    fireEvent.click(screen.getByRole('button', { name: /Deselect All/i }));
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));

    expect(screen.queryByText(/=\s*8\s*×\s*8/)).not.toBeInTheDocument();
  });

  test('raising the multiplier still multiplies the purchase amount', async () => {
    renderScreen();

    expect(await screen.findByText('flour tortillas')).toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: '3' } });

    expect(screen.getByText(/=\s*3\s*×\s*8 items/)).toBeInTheDocument();
  });
});
