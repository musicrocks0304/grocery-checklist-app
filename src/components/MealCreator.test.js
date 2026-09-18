import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import MealCreator from './MealCreator';

// TB-1: Create Recipe walks the shopper all the way to "Add to This Week's Meals"
// and then stops. Its Selected Meals panel had no "Generate Grocery List" button —
// that button lives only in ChatBot.js — so the chain could only be finished by
// switching tabs.

const selectedMeals = [
  { id: 71, recipeId: 71, name: 'Test Invented Recipe', description: 'x', servings: 4 },
];

const props = (over = {}) => ({
  onBack: jest.fn(),
  onNavigate: jest.fn(),
  selectedMeals,
  setSelectedMeals: jest.fn(),
  refreshMeals: jest.fn(),
  setGroceryListData: jest.fn(),
  debugMode: false,
  ...over,
});

beforeAll(() => { window.HTMLElement.prototype.scrollIntoView = jest.fn(); });
afterEach(() => { restoreFetch(); localStorage.clear(); });

const openPanel = () =>
  fireEvent.click(screen.getByRole('button', { name: /meals? planned/i }));

test('the selected-meals panel offers Generate Grocery List', () => {
  installMockFetch({});
  renderWithProviders(<MealCreator {...props()} />);

  openPanel();

  // Both panel variants render under jsdom (no CSS applies, so `hidden lg:flex`
  // does not hide the desktop one) — assert on all of them rather than deleting
  // a variant to make the query unique.
  expect(screen.getAllByRole('button', { name: /Generate Grocery List/i }).length).toBeGreaterThan(0);
});

test('Generate Grocery List posts to get_recipe_items and navigates to the review screen', async () => {
  const mock = installMockFetch({ '/get_recipe_items': { status: 200, body: '[{"output":{"ingredients":[]}}]' } });
  const setGroceryListData = jest.fn();
  const onNavigate = jest.fn();
  renderWithProviders(<MealCreator {...props({ setGroceryListData, onNavigate })} />);

  openPanel();
  fireEvent.click(screen.getAllByRole('button', { name: /Generate Grocery List/i })[0]);

  // Both panel variants render under jsdom, so this must be findAll*.
  await screen.findAllByRole('button', { name: /Generate Grocery List/i });
  expect(mock.for('/get_recipe_items')).toHaveLength(1);

  // The recipe id the webhook receives must come from recipeId, not id.
  // installMockFetch already JSON.parses the request body onto `.body`.
  const { body } = mock.for('/get_recipe_items')[0];
  expect(JSON.parse(body.recipe_ids)).toEqual([71]);

  expect(setGroceryListData).toHaveBeenCalled();
  expect(onNavigate).toHaveBeenCalledWith('recipe-ingredients');
});

// F10: the remove-meal button is icon-only with `title="Remove meal"` and no
// aria-label. `title` IS a last-resort accessible-name fallback, so a
// Playwright/testing-library snapshot shows a name and the button looks fine —
// it is not. A title is a hover tooltip that never appears on touch, and it is
// identical on every row, so it cannot say WHICH meal is removed. Assert the
// attribute, not the computed name.
test('each remove-meal button names the meal it removes via aria-label', () => {
  installMockFetch({});
  renderWithProviders(<MealCreator {...props()} />);

  openPanel();

  const buttons = screen.getAllByRole('button', { name: /Remove Test Invented Recipe/i });
  expect(buttons.length).toBeGreaterThan(0);
  buttons.forEach((btn) => {
    expect(btn).toHaveAttribute('aria-label', 'Remove Test Invented Recipe');
  });
});
