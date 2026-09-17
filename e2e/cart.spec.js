const { test, expect, open } = require('./support/test.js');

// HebCart.js renders inside AppShell's <main> (unlike Shop/InStoreMode,
// which is fullscreen outside it), so scope queries to main like plan.spec.js.
const main = (page) => page.locator('main');

test.describe('Cart', () => {
  test('expired login shows the sign-in panel and the import re-polls health', async ({ page, backend }) => {
    // mock-backend defaults clipState to 'expired' — no explicit backend.clip() needed.
    await open(page, 'cart');
    await expect(main(page).getByText('HEB sign-in needed')).toBeVisible();
    // Cart's recheck now runs through useHebSession, which polls api/health —
    // the same endpoint Deals uses. That shared path is the point of the
    // change, and it inverts what this test used to assert: it previously
    // pinned down that Cart called only api/heb/session/status and never
    // api/health, because the verdict lived in useClipServerHealth (deleted)
    // and was Deals-only. The "Check again" button that drove it is gone too;
    // the remedy is now the import button.
    const before = backend.calls('api/health').length;
    await main(page).getByRole('button', { name: /I've signed in/i }).click();
    await expect.poll(() => backend.calls('api/health').length).toBeGreaterThan(before);
  });

  test('healthy login shows the Connect step', async ({ page, backend }) => {
    backend.clip('healthy');
    await open(page, 'cart');
    await expect(main(page).getByRole('button', { name: /Connect to HEB/ })).toBeVisible();
    await expect(main(page).getByText('HEB sign-in needed')).toHaveCount(0);
  });
});
