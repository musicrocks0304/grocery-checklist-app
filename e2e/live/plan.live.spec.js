const { test, expect, open } = require('./support.js');

const NAME = '__e2e_live__';

test.describe.configure({ mode: 'serial' });

// Residue: the `oneoff_items` catalog row for NAME survives UI removal
// (only SQL removes the catalog row — the UI only removes it from this
// week's list). Cleanup is printed below and documented in e2e/README.md.
test('add a one-off, see it, remove it, gone after reload', async ({ page, api }) => {
  // Two full page reloads plus the finally-block's remove_weekly_item POST
  // push this past Playwright's default 30s test timeout on a live (real
  // network latency) run — give it more room.
  test.setTimeout(60000);
  page.on('dialog', (d) => d.accept());

  // Capture the real current week from the app's own fetch_grocery_items GET
  // (never compute it locally) so the restore step below posts the same
  // weekDateRange/weekStartDate the UI itself used.
  const itemsReqPromise = page.waitForRequest((r) => r.url().includes('/fetch_grocery_items'));
  await open(page, 'plan');
  const itemsReqUrl = new URL((await itemsReqPromise).url());
  const weekDateRange = itemsReqUrl.searchParams.get('weekDateRange');
  const weekStartDate = itemsReqUrl.searchParams.get('weekStartDate');

  const main = page.locator('main');

  // Primary assertions and the restore live in their own try/catch blocks —
  // a failed restore must never replace (mask) the original test failure,
  // so the primary error (if any) is what the test ultimately throws (same
  // pattern as shop.live.spec.js).
  let testError;
  try {
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
  } catch (err) {
    testError = err;
  }

  // Idempotent restore: if the UI removal above already ran, this simply
  // no-ops server-side (nothing left to remove for this week). If an
  // earlier assertion failed before the UI removal completed, this still
  // gets NAME off the real week's list — never leave a failed run with a
  // real WeeklyGroceryList row.
  if (!weekDateRange || !weekStartDate) {
    // eslint-disable-next-line no-console
    console.warn('plan.live: weekDateRange/weekStartDate missing from the captured request — skipping the remove_weekly_item restore POST');
  } else {
    try {
      const res = await api.post('remove_weekly_item', { itemName: NAME, weekDateRange, weekStartDate });
      expect(res.ok()).toBeTruthy();
      const resBody = await res.json();
      expect(resBody.success).toBe(true);
    } catch (restoreErr) {
      if (testError) {
        // The primary assertion already failed — surface the restore
        // problem without letting it replace (mask) the original failure.
        // eslint-disable-next-line no-console
        console.warn('plan.live: restore (remove_weekly_item) also failed after the primary assertion failed:', restoreErr);
      } else {
        throw restoreErr;
      }
    }
  }

  if (testError) throw testError;
});

test.afterAll(() => {
  // eslint-disable-next-line no-console
  console.log(`\nCLEANUP (docker exec): DELETE FROM oneoff_items WHERE name='${NAME}';`);
});
