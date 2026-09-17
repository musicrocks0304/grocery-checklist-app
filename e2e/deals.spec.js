const { test, expect, open } = require('./support/test.js');

const main = (page) => page.locator('main');

test.describe('Deals', () => {
  test('renders smart deals and coupons from fixtures, sign-in banner by default', async ({ page, backend }) => {
    await open(page, 'deals');
    await expect(main(page).getByText('Deals & Coupons')).toBeVisible();
    // Deals' three hand-rolled banners ("HEB session expired" among them)
    // collapsed into the one shared HebSignInPanel; the expired-login copy is
    // now "HEB sign-in needed", offering a remedy instead of pointing at the
    // deleted Session Manager. Every state of it is covered in heb-session.spec.js.
    await expect(main(page).getByTestId('heb-session-panel')).toContainText('HEB sign-in needed');
    await expect(main(page).getByText('Pillsbury Original Crescent Dinner Rolls').first()).toBeVisible();
    expect(backend.calls('smart_deals')[0].method).toBe('POST');
    expect(backend.calls('fetch_heb_coupons').length).toBeGreaterThan(0);
  });

  test('no session banner at all when the clip session is healthy', async ({ page, backend }) => {
    backend.clip('healthy');
    await open(page, 'deals');
    await expect(main(page).getByText('Deals & Coupons')).toBeVisible();
    await expect(main(page).getByTestId('heb-session-panel')).toHaveCount(0);
  });

  test('Add to list posts add_oneoff_item once and settles on Added', async ({ page, backend }) => {
    await open(page, 'deals');
    await main(page).getByRole('button', { name: 'Add to list' }).first().click();
    await expect(main(page).getByText('Added').first()).toBeVisible();
    expect(backend.calls('add_oneoff_item').length).toBe(1);
    expect(backend.calls('add_oneoff_item')[0].body.itemName).toContain('Pillsbury');
  });

  test('a 500 on add shows the error state and a retry re-posts', async ({ page, backend }) => {
    await open(page, 'deals');
    backend.set('add_oneoff_item', { status: 500, body: { success: false, error: 'Workflow error' } });
    await main(page).getByRole('button', { name: 'Add to list' }).first().click();
    await expect(main(page).getByRole('button', { name: /Retry|Try again/ }).first()).toBeVisible();
    await main(page).getByRole('button', { name: /Retry|Try again/ }).first().click();
    await expect.poll(() => backend.calls('add_oneoff_item').length).toBe(2);
    await expect(main(page).getByText('Added').first()).toBeVisible();
  });
});
