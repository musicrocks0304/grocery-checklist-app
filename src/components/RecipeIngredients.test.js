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

  test('raising the multiplier still multiplies the purchase amount', async () => {
    renderScreen();

    expect(await screen.findByText('flour tortillas')).toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: '3' } });

    expect(screen.getByText(/=\s*3\s*×\s*8 items/)).toBeInTheDocument();
  });
});
