import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import RecipeInstructions from './RecipeInstructions';

afterEach(restoreFetch);

test('the Cook debug toggle is labelled and at least 44px', async () => {
  installMockFetch({ choose_recipe_instructions: [], grab_instructions_fast: {} });
  renderWithProviders(<RecipeInstructions onNavigate={() => {}} recipeId={null} selectedMeals={[]} debugMode />);
  const toggles = await screen.findAllByRole('button', { name: 'Toggle debug log' });
  expect(toggles.length).toBeGreaterThanOrEqual(1);
  for (const t of toggles) {
    expect(t.className).toMatch(/min-h-\[44px\]/);
    expect(t.className).toMatch(/min-w-\[44px\]/);
  }
});
