const { test, expect, open } = require('./support.js');

const NAME = '__e2e_live__';

test.describe.configure({ mode: 'serial' });

// Residue: the `oneoff_items` catalog row for NAME survives UI removal
// (only SQL removes the catalog row — the UI only removes it from this
// week's list). Cleanup is printed below and documented in e2e/README.md.
test('add a one-off, see it, remove it, gone after reload', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await open(page, 'plan');
  const main = page.locator('main');

  const added = page.waitForResponse((r) => r.url().includes('/add_oneoff_item'));
  await main.getByPlaceholder('Quick add one-off item…').fill(NAME);
  await main.getByRole('button', { name: 'Add', exact: true }).click();
  const body = await (await added).json();
  expect(body.success).toBe(true);
  expect(typeof body.itemId).toBe('number');

  await expect(main.getByRole('button', { name: `Remove one-off ${NAME}` })).toBeVisible();
  await main.getByRole('button', { name: `Remove one-off ${NAME}` }).click();
  await expect(main.getByRole('button', { name: `Remove one-off ${NAME}` })).toHaveCount(0, { timeout: 15000 });

  await open(page, 'plan');
  await expect(main.getByRole('button', { name: `Remove one-off ${NAME}` })).toHaveCount(0);

  test.info().annotations.push({ type: 'cleanup', description: `DELETE FROM oneoff_items WHERE name='${NAME}';` });
});

test.afterAll(() => {
  // eslint-disable-next-line no-console
  console.log(`\nCLEANUP (docker exec): DELETE FROM oneoff_items WHERE name='${NAME}';`);
});
