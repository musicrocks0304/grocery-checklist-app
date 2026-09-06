const { test, expect, open } = require('./support/test.js');

// Labels come from the `navigation` array in src/components/App.js (read it once).
const SCREENS = [
  ['home', 'Grocery Planner'],
  ['plan', 'Grocery Staples'],
  ['deals', 'Deals & Coupons'],
  ['cart', 'HEB Cart Builder'],
  ['cook', 'Cook'],
];

test.describe('routing', () => {
  for (const [route, heading] of SCREENS) {
    test(`#${route} renders "${heading}"`, async ({ page, backend }) => {
      await open(page, route);
      // Every screen in this loop renders inside AppShell's <main> — scope
      // there so a same-text nav-sidebar label hidden on mobile (position:
      // matches but display:none) can't satisfy the assertion.
      await expect(page.locator('main').getByText(heading, { exact: false }).first()).toBeVisible();
    });
  }

  test('#shop renders the in-store checklist', async ({ page, backend }) => {
    await open(page, 'shop');
    await expect(page.getByText(/items? left|All done!/)).toBeVisible();
    expect(backend.calls('fetch_grocery_items').length).toBeGreaterThan(0);
  });

  test('legacy #grocery redirects to #plan', async ({ page, backend }) => {
    await open(page, 'grocery');
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#plan');
  });

  test('unknown hash goes home', async ({ page, backend }) => {
    await open(page, 'nonsense');
    // Scoped to <main> — the same text also appears in the mobile
    // nav (present in the DOM but hidden by CSS) ahead of <main>.
    await expect(page.locator('main').getByText('Grocery Planner').first()).toBeVisible();
  });

  test('changing the hash in an open tab switches screens and back returns', async ({ page, backend }) => {
    await open(page, 'home');
    await page.evaluate(() => { window.location.hash = '#deals'; });
    await expect(page.locator('main').getByText('Deals & Coupons').first()).toBeVisible();
    await page.goBack();
    await expect(page.locator('main').getByText('Grocery Planner').first()).toBeVisible();
  });
});
