const { test, expect, open, WEEK } = require('./support/test.js');

// Fixtures are recorded from live data — pick unchecked rows programmatically
// instead of hard-coding item names (Ruling 4). `fetch_grocery_items.json`
// has 10 selected rows; `shopping_progress.json` marks some of them checked.
// Item buttons in AisleSection/ItemRow render as `role="checkbox"` (not
// `role="button"` — InStoreMode.js ~line 636 sets `role="checkbox"` on the
// `<button>` explicitly), and their accessible name starts with the item
// name (ItemName text node comes first, followed by the aisle badge and
// quantity pill, which are also inside the button).
const items = require('./fixtures/n8n/fetch_grocery_items.json');
const progress = require('./fixtures/n8n/shopping_progress.json');

const selected = items.filter((i) => i.IsSelected === 1);
const checkedIds = new Set(progress.map((p) => p.item_id));
let uncheckedSelected = selected.filter((i) => !checkedIds.has(i.ItemID));

// If a re-record leaves fewer than 2 unchecked selected items, force every
// selected item unchecked for this spec by overriding the shopping_progress
// response (3x covers the initial load plus any incidental re-fetch).
const NEEDS_OVERRIDE = uncheckedSelected.length < 2;
if (NEEDS_OVERRIDE) uncheckedSelected = selected;

if (selected.length < 2 || uncheckedSelected.length < 2) {
  throw new Error(
    'shop.spec fixture assumption broken after re-record: need at least 2 selected rows in e2e/fixtures/n8n/fetch_grocery_items.json'
  );
}

const [firstItem, secondItem] = uncheckedSelected;
const initialItemsLeft = uncheckedSelected.length;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameRe = (name) => new RegExp(`^${escapeRegExp(name)}`);
const itemsLeftRe = (n) => new RegExp(`${n} items? left|All done!`);

async function seedIfNeeded(backend) {
  if (NEEDS_OVERRIDE) backend.set('shopping_progress', { body: [], times: 3 });
}

// src/index.js:9 wraps the app in <React.StrictMode>, which react-scripts
// keeps active in the dev server this harness runs against (playwright.config.js
// webServer command). StrictMode double-invokes both effects and setState
// updater functions in development. InStoreMode.js's handleToggleItem
// (~line 1436) puts the mutating POST (sendProgressOp) inside the
// setCheckedItems updater callback, and InviteModal's create_session POST
// runs in a useEffect on mount — both get fired twice per real tap/mount
// under StrictMode (verified empirically: a single click produced 2 recorded
// POSTs). This never happens in a production build, but it is genuinely what
// this dev-server-backed harness observes, so assertions below tolerate >=1
// occurrence and verify every recorded call's body, rather than asserting
// an exact call count.

test.describe('Shop (In-Store Mode)', () => {
  test('renders items grouped by aisle with the remaining count', async ({ page, backend }) => {
    await seedIfNeeded(backend);
    await open(page, 'shop');
    await expect(page.getByText(itemsLeftRe(initialItemsLeft))).toBeVisible();
    await expect(page.getByRole('checkbox', { name: nameRe(firstItem.ItemName) })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: nameRe(secondItem.ItemName) })).toBeVisible();
    expect(backend.calls('shopping_progress')[0].query.week_start_date).toBe(WEEK.startDate);
  });

  test('tapping an item posts shopping_progress_check and the count drops', async ({ page, backend }) => {
    await seedIfNeeded(backend);
    await open(page, 'shop');
    await page.getByRole('checkbox', { name: nameRe(firstItem.ItemName) }).click();
    await expect.poll(() => backend.calls('shopping_progress_check').length).toBeGreaterThanOrEqual(1);
    // handleToggleItem (InStoreMode.js ~line 1436) posts item_id as the
    // string form of ItemID (`item.ItemID.toString()`), not a number.
    for (const call of backend.calls('shopping_progress_check')) {
      expect(call.body).toEqual({ week_start_date: WEEK.startDate, item_id: String(firstItem.ItemID) });
    }
    await expect(page.getByRole('checkbox', { name: nameRe(firstItem.ItemName) })).toBeChecked();
    await expect(page.getByText(itemsLeftRe(initialItemsLeft - 1))).toBeVisible();
  });

  test('a failed check-off is retried once connectivity returns', async ({ page, backend }) => {
    await seedIfNeeded(backend);
    await open(page, 'shop');
    // times: 2 covers both StrictMode-doubled POSTs from the single tap below
    // (see the block comment above) so the pending-op entry Shop tracks for
    // this item is reliably left in the "failed" state either way.
    backend.set('shopping_progress_check', { status: 500, body: { success: false, error: 'Workflow error' }, times: 2 });
    await page.getByRole('checkbox', { name: nameRe(firstItem.ItemName) }).click();
    const firstItemCalls = () =>
      backend.calls('shopping_progress_check').filter((c) => c.body.item_id === String(firstItem.ItemID)).length;
    await expect.poll(firstItemCalls).toBeGreaterThanOrEqual(1);

    await page.getByRole('checkbox', { name: nameRe(secondItem.ItemName) }).click();
    const secondItemCalls = () =>
      backend.calls('shopping_progress_check').filter((c) => c.body.item_id === String(secondItem.ItemID)).length;
    await expect.poll(secondItemCalls).toBeGreaterThanOrEqual(1);

    // Failed ops are NOT re-sent on the next tap (InStoreMode.js
    // drainPendingOps, ~line 1183-1204) — only on the `online` window event
    // or a visible-tab poll tick. Trigger the drain explicitly and confirm
    // the first item's failed op gets re-sent (more calls for it than before).
    const beforeOnline = firstItemCalls();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(firstItemCalls, { timeout: 15000 }).toBeGreaterThan(beforeOnline);
  });

  test('the ⋯ menu opens Feedback', async ({ page, backend }) => {
    await open(page, 'shop');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Send feedback' }).click();
    // The menu's own trigger button is also named "Send feedback"
    // (case-insensitively identical to the panel's "Send Feedback" heading
    // to getByText's default matcher), so target the heading role instead of
    // getByText to avoid a strict-mode ambiguity between the two.
    await expect(page.getByRole('heading', { name: 'Send Feedback' })).toBeVisible();
  });

  test('Invite posts create_session and shows the code', async ({ page, backend }) => {
    await open(page, 'shop');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Invite partner' }).click();
    await expect(page.getByText('E2E1')).toBeVisible();
    // See the StrictMode block comment above — InviteModal's mount effect
    // can fire create_session twice in this dev-server harness; assert every
    // recorded call carries the right body rather than an exact count of 1.
    expect(backend.calls('create_session').length).toBeGreaterThanOrEqual(1);
    for (const call of backend.calls('create_session')) {
      expect(call.body).toEqual({ week_start_date: WEEK.startDate });
    }
    await page.getByRole('button', { name: 'Close' }).click();
  });

  test('the voice button is present', async ({ page, backend }) => {
    await open(page, 'shop');
    await expect(page.getByRole('button', { name: 'Hold to voice-check item' })).toBeVisible();
  });
});
