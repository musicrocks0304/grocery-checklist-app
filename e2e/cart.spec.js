const { test, expect, open } = require('./support/test.js');

// HebCart.js renders inside AppShell's <main> (unlike Shop/InStoreMode,
// which is fullscreen outside it), so scope queries to main like plan.spec.js.
const main = (page) => page.locator('main');

test.describe('Cart', () => {
  test('expired login shows the sign-in panel and Check again re-polls', async ({ page, backend }) => {
    // mock-backend defaults clipState to 'expired' — no explicit backend.clip() needed.
    await open(page, 'cart');
    await expect(main(page).getByText('HEB sign-in needed')).toBeVisible();
    // ConnectionPanel's onRecheck is wired to HebCart's checkSession, which
    // only calls ENDPOINTS.hebSessionStatus (api/heb/session/status) — it
    // does not call api/health (that's useClipServerHealth, used only by
    // Deals.js, not HebCart.js).
    const before = backend.calls('api/heb/session/status').length;
    await main(page).getByRole('button', { name: 'Check again' }).click();
    await expect.poll(() => backend.calls('api/heb/session/status').length).toBeGreaterThan(before);
  });

  test('healthy login shows the Connect step', async ({ page, backend }) => {
    backend.clip('healthy');
    await open(page, 'cart');
    await expect(main(page).getByRole('button', { name: /Connect to HEB/ })).toBeVisible();
    await expect(main(page).getByText('HEB sign-in needed')).toHaveCount(0);
  });
});
