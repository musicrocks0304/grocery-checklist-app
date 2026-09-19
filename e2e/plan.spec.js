const { test, expect, open, WEEK } = require('./support/test.js');

const main = (page) => page.locator('main');

// Fixtures are recorded from live data — pick rows programmatically instead
// of hard-coding item names (Ruling 4). `selected`/`unselected` are pulled
// from the same category so the category section is already expanded on
// mount: CategorySection.js seeds its `expanded` state from
// `selectedCount > 0`, so a category with zero selected items renders
// collapsed (no checkboxes in the DOM) until its header is clicked.
const items = require('./fixtures/n8n/fetch_grocery_items.json');
const selected = items.find((i) => i.DataSource !== 'OneOff' && i.IsSelected === 1);
const unselected = items.find(
  (i) => i.DataSource !== 'OneOff' && i.IsSelected === 0 && i.Category === selected.Category
);
const oneoff = items.find((i) => i.DataSource === 'OneOff');
// Purchase-need slice 1: a meal row with a derived need shows THE NEED; one
// without (a week before 2026-04-26, F7's 900000 band) keeps its purchase text.
const hasNeed = (i) =>
  ['NeedOz', 'NeedTsp', 'NeedCount'].some((k) => i[k] !== null && i[k] !== undefined) ||
  Number(i.NeedUnspecified) === 1;
const needRow = items.find(
  (i) => i.DataSource === 'MealIngredients' && i.NeedOz !== null && i.NeedOz !== undefined
);
// F6/F8: a need-less meal row whose Unit starts with a digit, to prove the
// shared formatter puts a '×' between the count and the unit instead of
// printing "2 1 lb package", and that the quantity reaches the list at all.
const digitUnit = items.find(
  (i) => i.DataSource === 'MealIngredients' && !hasNeed(i) && /^\d/.test(String(i.Unit || ''))
);
const wordUnit = items.find(
  (i) => i.DataSource === 'MealIngredients' && !hasNeed(i) && /^[a-z]/i.test(String(i.Unit || ''))
);

if (!selected || !unselected || !oneoff || !digitUnit || !wordUnit || !needRow) {
  throw new Error(
    'plan.spec fixture assumption broken after re-record: need a selected staple, an unselected staple in the same category, a one-off row, need-less MealIngredients rows whose Unit starts with a digit and with a letter, and a MealIngredients row carrying NeedOz, in e2e/fixtures/n8n/fetch_grocery_items.json'
  );
}

test.describe('Plan', () => {
  test('renders staples from the fixture grouped by category', async ({ page, backend }) => {
    await open(page, 'plan');
    await expect(main(page).getByText('Grocery Staples')).toBeVisible();
    await expect(main(page).getByText(selected.Category)).toBeVisible();
    await expect(main(page).getByRole('checkbox', { name: selected.ItemName })).toBeChecked();
    await expect(main(page).getByRole('checkbox', { name: unselected.ItemName })).not.toBeChecked();
    const q = backend.calls('fetch_grocery_items')[0].query;
    expect(q.weekDateRange).toBe(WEEK.displayRange);
    expect(q.weekStartDate).toBe(WEEK.startDate);
  });


  // F8 — the list the shopper shops from used to show names only, so an
  // inflated quantity was invisible until the H-E-B Cart Builder spent it.
  // F6 — a count and a unit that itself starts with a number must not be jammed
  // together. Both go through src/utils/formatPurchase.js. Asserting on the
  // rendered strings rather than a regex keeps the escaping out of it.
  // `backend` MUST be destructured even though it is not referenced: Playwright
  // instantiates fixtures lazily, so leaving it out means no route mocks are
  // installed and every n8n call fails, leaving the screen empty.
  test('meal rows show their purchase quantity, never two numbers side by side', async ({ page, backend }) => {
    await open(page, 'plan');
    await expect(main(page).getByText('Grocery Staples')).toBeVisible();

    // e.g. "2 × 1 lb package" — the × is what stops it reading "2 1 lb package".
    const spaced = `${digitUnit.QuantitySelected} × ${digitUnit.Unit}`;
    const jammed = `${digitUnit.QuantitySelected} ${digitUnit.Unit}`;
    await expect(main(page).getByText(spaced)).toBeVisible();
    expect(await main(page).getByText(jammed, { exact: true }).count()).toBe(0);

    // e.g. "4 items" — a word unit needs no separator.
    await expect(
      main(page).getByText(`${wordUnit.QuantitySelected} ${wordUnit.Unit}`)
    ).toBeVisible();
  });

  // Purchase-need slice 1: the list shows what the recipe NEEDS. The fixture
  // carries NeedOz as the DECIMAL STRING the n8n MySQL node really returns
  // ("4.0000000") — a number here would hide the "4.0000000 oz" trap.
  test('a meal row shows its recipe need, not the package guess', async ({ page, backend }) => {
    await open(page, 'plan');
    await expect(main(page).getByText('Grocery Staples')).toBeVisible();
    const box = main(page).getByRole('checkbox', { name: new RegExp(`^${needRow.ItemName}`) });
    await expect(box).toBeVisible();
    await expect(box).toHaveAccessibleName(/4 oz/);
    await expect(box).not.toHaveAccessibleName(/lb package|4\.0000000/);
  });

  test('toggling a staple posts selection_check with the full row', async ({ page, backend }) => {
    await open(page, 'plan');
    await main(page).getByRole('checkbox', { name: unselected.ItemName }).click();
    await expect.poll(() => backend.calls('selection_check').length).toBe(1);
    const body = backend.calls('selection_check')[0].body;
    expect(body).toMatchObject({
      itemName: unselected.ItemName,
      category: unselected.Category,
      weekDateRange: WEEK.displayRange,
      weekStartDate: WEEK.startDate,
      quantity: 1,
    });
    expect(typeof body.itemId).toBe('number');
    await expect(main(page).getByRole('checkbox', { name: unselected.ItemName })).toBeChecked();
  });

  test('a 500 on selection_check rolls the checkbox back and shows the server message', async ({ page, backend }) => {
    await open(page, 'plan');
    backend.set('selection_check', { status: 500, body: { success: false, error: 'Workflow error' } });
    await main(page).getByRole('checkbox', { name: unselected.ItemName }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Workflow error' })).toBeVisible();
    await expect(main(page).getByRole('checkbox', { name: unselected.ItemName })).not.toBeChecked();
  });

  test('quick-add posts add_oneoff_item and the item appears under One-offs', async ({ page, backend }) => {
    await open(page, 'plan');
    await main(page).getByPlaceholder('Quick add one-off item…').fill('__e2e__');
    await main(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(main(page).getByRole('button', { name: 'Remove one-off __e2e__' })).toBeVisible();
    expect(backend.calls('add_oneoff_item')[0].body).toEqual({ itemName: '__e2e__', weekDateRange: WEEK.displayRange });
  });

  test('an empty 200 on add shows the empty-response toast and adds nothing', async ({ page, backend }) => {
    await open(page, 'plan');
    backend.set('add_oneoff_item', { status: 200, body: '' });
    await main(page).getByPlaceholder('Quick add one-off item…').fill('__ghost__');
    await main(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'The server sent an empty response' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Remove one-off __ghost__' })).toHaveCount(0);
  });

  test('remove posts remove_weekly_item and the item disappears', async ({ page, backend }) => {
    page.on('dialog', (d) => d.accept());
    await open(page, 'plan');
    // `oneoff` (from the fixture) is guaranteed to render a "Remove one-off"
    // button; grab it by its known name rather than name-sniffing the DOM.
    const oneoffButton = main(page).getByRole('button', { name: `Remove one-off ${oneoff.ItemName}` });
    await oneoffButton.click();
    await expect.poll(() => backend.calls('remove_weekly_item').length).toBe(1);
    expect(backend.calls('remove_weekly_item')[0].body).toMatchObject({
      itemName: oneoff.ItemName,
      weekDateRange: WEEK.displayRange,
      weekStartDate: WEEK.startDate,
    });
    await expect(main(page).getByRole('button', { name: `Remove one-off ${oneoff.ItemName}` })).toHaveCount(0);
  });
});
