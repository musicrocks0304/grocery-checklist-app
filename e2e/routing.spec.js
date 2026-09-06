const { test, expect, open } = require('./support/test.js');

// Labels come from the `navigation` array in src/components/App.js (read it once).
const SCREENS = [
  ['home', 'Grocery Planner'],
  ['plan', 'Grocery Staples'],
  // Meals (ChatBot's default "planner" mode) has no page <h1> — the closest
  // rendered text is its initial bot greeting ("...meal planning
  // assistant..."), which getByText matches case-insensitively against the
  // same "Meal Planning" label App.js:39 uses for the nav item.
  ['meals', 'Meal Planning'],
  ['deals', 'Deals & Coupons'],
  ['cart', 'HEB Cart Builder'],
  ['cook', 'Cook'],
];

// (route, heading) plus each nav surface's label for that route: the desktop
// sidebar's `navigation` array (App.js:37, rendered by Sidebar.js) and the
// mobile bottom tab bar's own shorter labels (BottomTabBar.js's TABS). Home
// is reached via the header logo on both surfaces, not a nav item, so it's
// excluded here.
const NAV_TARGETS = [
  { desktopLabel: 'Grocery List', mobileLabel: 'Plan', heading: 'Grocery Staples' },
  { desktopLabel: 'Meal Planning', mobileLabel: 'Meals', heading: 'Meal Planning' },
  { desktopLabel: 'Deals & Coupons', mobileLabel: 'Deals', heading: 'Deals & Coupons' },
  { desktopLabel: 'HEB Cart Builder', mobileLabel: 'Cart', heading: 'HEB Cart Builder' },
  { desktopLabel: 'Cook Recipes', mobileLabel: 'Cook', heading: 'Cook' },
  // Shop (InStoreMode) renders fullscreen with no nav chrome at all
  // (App.js:423-424) — no <main> to scope into, and no sidebar/tab bar
  // left on screen to click a further target from, so this must stay last.
  { desktopLabel: 'Shop In-Store', mobileLabel: 'Shop', heading: /items? left|All done!/, noMain: true },
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

  test('navigation chrome reaches every screen', async ({ page, backend }) => {
    // Desktop: click the sidebar's nav buttons. Mobile: tap the bottom tab
    // bar's buttons. Only one surface is in the accessibility tree at a
    // time (the other is `display:none` via a Tailwind `hidden`/`lg:hidden`
    // pair), so role/name lookups can't cross-match the other surface.
    const isMobile = test.info().project.name === 'mobile';
    await open(page, 'home');
    for (const { desktopLabel, mobileLabel, heading, noMain } of NAV_TARGETS) {
      const name = isMobile ? mobileLabel : desktopLabel;
      await page.getByRole('button', { name, exact: true }).click();
      const scope = noMain ? page : page.locator('main');
      await expect(scope.getByText(heading, { exact: false }).first()).toBeVisible();
    }
  });
});
