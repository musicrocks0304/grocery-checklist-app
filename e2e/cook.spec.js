const { test, expect, open } = require('./support/test.js');

const main = (page) => page.locator('main');

test.describe('Cook', () => {
  test('zero meals shows the empty state', async ({ page, backend }) => {
    backend.set('fetch_weekly_meals', { body: [], times: 3 });
    backend.set('choose_recipe_instructions', { body: [], times: 3 });
    await open(page, 'cook');
    await expect(main(page).getByText('No meals planned yet')).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0, { timeout: 2000 });
  });

  test('with a planned meal the recipe list renders and selecting it requests instructions', async ({ page, backend }) => {
    // RecipeInstructions.js fetches `choose_recipe_instructions` on mount
    // whenever the `selectedMeals` prop is empty at that instant (its
    // fetch effect has a `[]` dep list — it only ever reads the value from
    // the very first render). App.js's own selectedMeals state always
    // starts as `[]` on a fresh page load and is only populated
    // asynchronously from `fetch_weekly_meals`, so this webhook (not the
    // prop) is what actually seeds the recipe list here — hence mocking
    // both. Its raw-row shape maps straight through RecipeInstructions'
    // own transform (recipe_id -> recipeId, recipe_name -> name, notes ->
    // description fallback; recipe_description is not read there).
    const meal = { selection_id: 1, WeekDateRange: 'For the week of September 6th to September 12th, 2026', recipe_id: 3, notes: '', created_at: '2026-09-06 12:00:00', recipe_name: 'Chicken tacos', recipe_description: 'Weeknight tacos' };
    backend.set('fetch_weekly_meals', { body: [meal], times: 3 });
    backend.set('choose_recipe_instructions', { body: [meal], times: 3 });
    backend.set('grab_instructions_fast', { body: [{ output: [{ recipe_id: 3, step_number: 1, instruction_text: 'Cook the chicken', time_minutes: 10 }], all_ingredients: [{ recipe_id: 3, ingredient_name: 'Chicken thighs', quantity: 1, unit_name: 'lb' }] }], times: 1 });
    await open(page, 'cook');
    await expect(main(page).getByRole('heading', { name: 'Chicken tacos' })).toBeVisible();
    // The recipe card's title/description are plain text with no click
    // handler (RecipeInstructions.js ~line 884) — only its "Start Cooking"
    // button calls handleRecipeSelect, which is what actually fires the
    // grab_instructions_fast request.
    await main(page).getByRole('button', { name: 'Start Cooking' }).click();
    await expect.poll(() => backend.calls('grab_instructions_fast').length).toBeGreaterThan(0);
    await expect(main(page).getByText('Cook the chicken')).toBeVisible();
  });
});
