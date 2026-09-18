const { test, expect, open, WEEK } = require('./support/test.js');

// The Create Recipe tab had no e2e coverage at all, which is how this shipped:
// its selected-meals panel had exactly ONE opener, the `hidden lg:flex` desktop
// strip, while the sheet that renders below 1024px is `lg:hidden`. So at phone
// width the sheet — and the Generate Grocery List button inside it — could not
// be opened.
//
// The 530 jsdom tests could not catch it: no CSS applies there, so `hidden
// lg:flex` does not actually hide the desktop strip and every unit test opened
// the panel through it happily. Only a real browser at a real viewport proves
// the control is reachable, which is what this test is for.

const meal = {
  selection_id: 1,
  WeekDateRange: WEEK.displayRange,
  recipe_id: 3,
  notes: '',
  created_at: '2026-09-06 12:00:00',
  recipe_name: 'Chicken tacos',
  recipe_description: 'Weeknight tacos',
};

test.describe('Meals — Create Recipe', () => {
  test('the selected-meals panel is reachable at phone width', async ({ page, backend }) => {
    test.skip(
      test.info().project.name !== 'mobile',
      'the mobile opener is lg:hidden; desktop reaches the panel through the strip instead'
    );
    backend.set('fetch_weekly_meals', { body: [meal], times: 3 });

    await open(page, 'meal-creator');

    const opener = page.getByRole('button', { name: /show selected meals/i });
    await expect(opener).toBeVisible();

    await opener.click();

    // The panel is what carries the rest of the flow; if only the strip existed
    // this button would be unreachable on a phone.
    await expect(page.getByRole('button', { name: /Generate Grocery List/i }).first()).toBeVisible();
    await expect(page.getByText('Chicken tacos').first()).toBeVisible();
  });

  test('the desktop strip opens the panel at desktop width', async ({ page, backend }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'the strip is hidden below lg; mobile uses the floating opener instead'
    );
    backend.set('fetch_weekly_meals', { body: [meal], times: 3 });

    await open(page, 'meal-creator');

    // Named by its meal count ("1 meal planned"), and it must be the strip, not
    // the mobile badge — the badge is display:none here.
    const strip = page.getByRole('button', { name: /meals? planned/i });
    await expect(strip).toBeVisible();
    await expect(page.getByRole('button', { name: /show selected meals/i })).toBeHidden();

    await strip.click();

    await expect(page.getByRole('button', { name: /Generate Grocery List/i }).first()).toBeVisible();
  });
});
