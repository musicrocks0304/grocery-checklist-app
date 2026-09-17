const { test, expect, open } = require('./support/test.js');

// Both Cart and Deals render inside AppShell's <main>, so every query is
// scoped there — the same convention plan.spec.js and cart.spec.js use.
const main = (page) => page.locator('main');

// The shared remedy panel. Note this is NOT `heb-signin-panel`: that id belongs
// to Cart's ConnectionPanel, which this panel renders *inside*. They are two
// deliberately different ids — sharing one would make getByTestId throw on
// Cart, and sub-project G's scoped axe run targets the ConnectionPanel root.
const panel = (page) => main(page).getByTestId('heb-session-panel');

// useHebSession derives exactly six states:
//   'checking' | 'unreachable' | 'signedOut' | 'wrongStore' | 'expiring' | 'ready'
// 'checking' is the pre-answer state and renders nothing by design (see the
// 2026-09-05 UI review), so it is covered by the Jest suite rather than here.
// The clip fixture names are a separate vocabulary: 'expired' -> signedOut,
// 'nostore' -> ready, 'healthy' -> ready.
test.describe('HEB session state', () => {
  test('signed out offers the phone sign-in and blocks Connect on Cart', async ({ page, backend }) => {
    backend.clip('expired');
    await open(page, 'cart');
    const p = panel(page);
    await expect(p).toBeVisible();
    await expect(p.getByText('HEB sign-in needed')).toBeVisible();
    // The whole point of the remedy: a URL a phone can open, not a shell
    // command on the machine the container happens to run on.
    await expect(p.getByRole('link', { name: /Sign in to HEB/i }))
      .toHaveAttribute('href', 'https://heb-login.needexcelexpert.com');
    await expect(p.getByRole('button', { name: /I've signed in/i })).toBeEnabled();
    // signedOut is the one login state that genuinely blocks: a browser
    // session cannot be driven against cookies HEB has already rejected.
    await expect(main(page).getByRole('button', { name: /Connect to HEB/ })).toHaveCount(0);
  });

  test('signed out disables clipping on Deals', async ({ page, backend }) => {
    backend.clip('expired');
    await open(page, 'deals');
    await expect(panel(page).getByText('HEB sign-in needed')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Select All Unclipped' })).toHaveCount(0);
    await expect(main(page).locator('input[type="checkbox"]').first()).toBeDisabled();
  });

  test('an unreachable clip server says so and disables clipping', async ({ page, backend }) => {
    // Overriding is the only way to produce this state: it is the absence of a
    // usable answer, not a payload. `times` is generous because <React.StrictMode>
    // mounts effects twice in the dev build the hermetic server runs.
    backend.set('api/health', { status: 503, body: { error: 'clip server down' }, times: 6 });
    await open(page, 'deals');
    await expect(panel(page).getByText('Clip server offline')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Select All Unclipped' })).toHaveCount(0);
  });

  test('wrong store is advisory on both screens: it names the store, blocks nothing', async ({ page, backend }) => {
    // Ruling R14. The only signal behind 'wrongStore' is a transient,
    // non-authoritative store cookie that has already produced one false
    // positive in the field. It reports what it saw and offers the remedy in
    // case it is real; it must never take clipping or Connect away, because a
    // correctly configured user would have no action available to clear it.
    backend.clip('wrongstore');
    await open(page, 'deals');
    const p = panel(page);
    await expect(p).toBeVisible();
    await expect(p).toContainText('809');   // what the cookie said
    await expect(p).toContainText('794');   // what the app is set up for
    await expect(main(page).getByRole('button', { name: 'Select All Unclipped' })).toBeEnabled();
    await expect(main(page).locator('input[type="checkbox"]').first()).toBeEnabled();

    await open(page, 'cart');
    await expect(panel(page)).toBeVisible();
    await expect(main(page).getByRole('button', { name: /Connect to HEB/ })).toBeEnabled();
  });

  test('an expiring login warns without blocking', async ({ page, backend }) => {
    backend.clip('expiring');
    await open(page, 'cart');
    const p = panel(page);
    // Scope the text to the panel. A bare /expiring soon/i also matches the
    // Deals sort dropdown's "Expiring Soonest" option, which is how this
    // sub-project collided a text selector three times.
    await expect(p.getByText('HEB sign-in expiring soon')).toBeVisible();
    // Advisory only: nothing to sign in to yet, and Connect stays available.
    await expect(p.getByRole('link', { name: /Sign in to HEB/i })).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: /Connect to HEB/ })).toBeEnabled();
  });

  test('healthy session shows no panel on either screen', async ({ page, backend }) => {
    backend.clip('healthy');
    await open(page, 'deals');
    await expect(panel(page)).toHaveCount(0);
    await open(page, 'cart');
    await expect(panel(page)).toHaveCount(0);
  });

  test('REGRESSION: an authenticated session with no store cookie shows NO panel and blocks nothing', async ({ page, backend }) => {
    // Ruling R13, and the single highest-value assertion in this file.
    //
    // The spec this suite was written from created health.nostore.json
    // expecting it to render a "Choose your HEB store" remedy. That state has
    // been deleted, and this test asserts the OPPOSITE of what was originally
    // specified, because the original was a permanent false alarm:
    //
    //   HEB resolves the curbside store SERVER-SIDE from the account. A
    //   healthy live session therefore carries no store cookie at all, and
    //   /api/health reports storeId: null for a correctly configured user
    //   (measured on the live session — see health.nostore.json). Under the
    //   original rule every such user, i.e. everyone, would have been told to
    //   choose a store forever, with no action available that could clear it.
    //
    // health.nostore.json is deliberately near-identical to
    // health.healthy.json. That identity is the finding: "no store" and
    // "healthy" are the same state, and the fixture that would have shipped
    // the false alarm is the one that now proves it cannot.
    backend.clip('nostore');
    await open(page, 'deals');
    await expect(panel(page)).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: 'Select All Unclipped' })).toBeEnabled();
    await expect(main(page).locator('input[type="checkbox"]').first()).toBeEnabled();

    await open(page, 'cart');
    await expect(panel(page)).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: /Connect to HEB/ })).toBeEnabled();
  });

  test('import posts the webhook, re-polls health, and clears the panel', async ({ page, backend }) => {
    backend.clip('expired');
    await open(page, 'cart');
    await expect(panel(page)).toBeVisible();

    // The webhook answers as soon as the import STARTS, so "did it work?" is
    // only knowable by re-polling health. Flip the backend before the click so
    // the first poll after the POST sees the session come back — exactly the
    // sequence a user lives through after signing in on their phone.
    const before = backend.calls('api/health').length;
    backend.clip('healthy');
    await panel(page).getByRole('button', { name: /I've signed in/i }).click();

    await expect.poll(() => backend.calls('heb_session_import').length).toBeGreaterThan(0);
    expect(backend.calls('heb_session_import')[0].method).toBe('POST');
    await expect.poll(() => backend.calls('api/health').length).toBeGreaterThan(before);
    await expect(panel(page)).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: /Connect to HEB/ })).toBeVisible();
  });
});
