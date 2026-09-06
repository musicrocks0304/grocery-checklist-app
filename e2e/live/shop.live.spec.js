const { test, expect, open } = require('./support.js');

test.describe.configure({ mode: 'serial' });

const itemsLeftRe = /(\d+) items? left|All done!/;
const left = async (page) => {
  const text = await page.getByText(itemsLeftRe).textContent();
  return Number(text.match(/\d+/)?.[0] ?? 0);
};
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('check an item, it persists, uncheck via the endpoint, it clears', async ({ page, api }) => {
  await open(page, 'shop');
  const before = await left(page);
  test.skip(before === 0, 'nothing left to check this week');

  // Reload and capture the requests the app makes on mount: the grocery
  // item list, and the shopping_progress GET — its query string carries the
  // real current week_start_date (never compute it locally, see brief).
  const weekReqPromise = page.waitForRequest((r) => r.url().includes('/shopping_progress?'));
  const itemsResPromise = page.waitForResponse((r) => r.url().includes('/fetch_grocery_items'));
  const progressResPromise = page.waitForResponse((r) => r.url().includes('/shopping_progress?'));
  await open(page, 'shop');

  const weekStart = new URL((await weekReqPromise).url()).searchParams.get('week_start_date');
  const items = await (await itemsResPromise).json();
  const progress = await (await progressResPromise).json();
  const checked = new Set(progress.map((r) => String(r.item_id)));
  const target = items.find((i) => i.IsSelected === 1 && !checked.has(String(i.ItemID)));
  test.skip(!target, 'no unchecked item');

  // Restore state (uncheck via the endpoint) even if a mid-test assertion
  // fails, so a broken run never leaves real shopping_progress mutated.
  try {
    // Wait for the actual persistence POST to resolve before reloading —
    // the UI flips instantly on an optimistic local update, but a reload
    // discards that local state and refetches server truth, so reloading
    // before shopping_progress_check has landed reads back the old count.
    const checkResPromise = page.waitForResponse(
      (r) => r.url().includes('/shopping_progress_check') && r.request().method() === 'POST'
    );
    await page
      .getByRole('checkbox', { name: new RegExp('^' + escapeRegExp(target.ItemName)) })
      .click();
    await checkResPromise;
    await expect.poll(() => left(page)).toBe(before - 1);
    await open(page, 'shop');
    await expect.poll(() => left(page), { timeout: 10000 }).toBe(before - 1);
  } finally {
    const res = await api.post('shopping_progress_uncheck', {
      week_start_date: weekStart,
      item_id: String(target.ItemID),
    });
    expect(res.ok()).toBeTruthy();
    const resBody = await res.json();
    expect(resBody.success).toBe(true);
    await open(page, 'shop');
    await expect.poll(() => left(page)).toBe(before);
  }
});
