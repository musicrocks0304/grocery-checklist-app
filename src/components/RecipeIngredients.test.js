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

  // This assertion used to read `getByText('2 lbs 1 lb package')`. It was written
  // for F3 (a unit-bearing quantity must not be multiplied by itself) and froze
  // the F6 duplication in place as a side effect: purchaseQuantity already says
  // "2 lbs", so appending purchaseUnit "1 lb package" printed both. F6 now routes
  // every render site through formatPurchase, which keeps the quantity and drops
  // the redundant unit. The F3 guarantee this test exists for is unchanged.
  test('a unit-bearing purchase quantity is shown once, not doubled up', async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /Review List/i }));

    expect(await screen.findByText(/Recipe Grocery List/i)).toBeInTheDocument();

    expect(screen.getByText('2 lbs')).toBeInTheDocument();
    expect(screen.queryByText('2 lbs 1 lb package')).not.toBeInTheDocument();
    expect(screen.queryByText(/lbs.*lb package/)).not.toBeInTheDocument();
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

// Purchase-need slice 1: the pre-submit screen shows the recipe NEED, from the
// structured fields `Convert to Shopping List` emits (JS numbers here). Both
// items sit in one category so they render in one tab.
const needListData = [
  {
    output: {
      ingredients: [
        {
          name: 'sweet peppers',
          category: 'grains',
          purchaseQuantity: '1 lb',
          purchaseUnit: '1 lb package',
          recipeNeeds: '4 oz',
          usedInRecipes: ['Test Recipe'],
          NeedOz: 4, NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: 0,
        },
        {
          name: 'corn tortillas',
          category: 'grains',
          purchaseQuantity: '12',
          purchaseUnit: 'items',
          recipeNeeds: '12 pieces',
          usedInRecipes: ['Test Recipe'],
          NeedOz: null, NeedTsp: null, NeedCount: 12, NeedCountUnit: 'piece', NeedUnspecified: 0,
        },
      ],
    },
  },
];

const renderNeedScreen = () =>
  render(
    <RecipeIngredients
      selectedMeals={selectedMeals}
      groceryListData={needListData}
      onNavigate={() => {}}
      debugMode={false}
    />,
  );

describe('RecipeIngredients — slice 1 shows the recipe need', () => {
  test('the selection list reads "Need: 4 oz", not the package guess', async () => {
    renderNeedScreen();
    expect(await screen.findByText('sweet peppers')).toBeInTheDocument();
    expect(screen.getByText('4 oz')).toBeInTheDocument();
    expect(screen.getAllByText(/^Need:/)).toHaveLength(2);
    expect(screen.queryByText(/Buy:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/lb package/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recipe needs:/)).not.toBeInTheDocument();
  });

  test('x3 reads as three times the need', async () => {
    renderNeedScreen();
    expect(await screen.findByText('sweet peppers')).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '3' } });
    expect(screen.getByText('= 12 oz')).toBeInTheDocument();
    expect(screen.queryByText(/lb package/)).not.toBeInTheDocument();
  });

  test('the confirmation list shows the need times the multiplier', async () => {
    renderNeedScreen();
    expect(await screen.findByText('sweet peppers')).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Review List/i }));
    expect(await screen.findByText(/Recipe Grocery List/i)).toBeInTheDocument();
    expect(screen.getByText('12 oz')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recipe needs:/)).not.toBeInTheDocument();
  });
});
