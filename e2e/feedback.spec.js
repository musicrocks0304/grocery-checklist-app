const { test, expect, open } = require('./support/test.js');

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// The mobile header icon (AppShell.js ~line 51) and the desktop sidebar link
// (Sidebar.js ~line 85) both carry aria-label="Send feedback"; whichever one
// the current viewport hides is still in the DOM (Tailwind `lg:hidden` /
// `hidden lg:flex`), and the sidebar's button renders first in DOM order —
// so `.first()` alone would pick a hidden element on mobile. Filter to the
// one actually visible in this project's viewport instead.
function feedbackTrigger(page) {
  return page.getByRole('button', { name: 'Send feedback' }).filter({ visible: true }).first();
}

// Category buttons' accessible name is the emoji span's aria-label (e.g.
// "Bug") plus the adjacent label text (FeedbackPanel.js ~line 89) — match by
// substring rather than the exact concatenated string.
async function fillAndSubmit(page, text) {
  await page.getByRole('button', { name: /bug/i }).click();
  await page.getByPlaceholder('What happened? What would make it better?').fill(text);
  await page.getByRole('button', { name: 'Submit Feedback' }).click();
}

// The panel heading text "Send Feedback" collides case-insensitively with
// the sidebar/menu trigger's "Send feedback" under getByText — use the
// heading role instead (see shop.spec.js's "⋯ menu opens Feedback" test).
const heading = (page) => page.getByRole('heading', { name: 'Send Feedback' });

test.describe('Feedback', () => {
  test('opens from the header icon (mobile) or the sidebar link (desktop)', async ({ page, backend }) => {
    await open(page, 'home');
    await feedbackTrigger(page).click();
    await expect(heading(page)).toBeVisible();
    await page.getByRole('button', { name: 'Close feedback' }).click();
    await expect(heading(page)).toHaveCount(0);
    expect(backend.calls('submit_feedback')).toHaveLength(0);
  });

  test('submit posts one submit_feedback with a v4 client_id', async ({ page, backend }) => {
    await open(page, 'home');
    await feedbackTrigger(page).click();
    await fillAndSubmit(page, 'e2e report');
    await expect(page.getByRole('status').filter({ hasText: 'Feedback sent' })).toBeVisible();
    const calls = backend.calls('submit_feedback');
    expect(calls).toHaveLength(1);
    expect(calls[0].body.client_id).toMatch(V4);
    expect(calls[0].body).toMatchObject({ category: 'bug', description: 'e2e report', screen: 'home' });
  });

  test('a failed submit keeps the panel open and the retry reuses the client_id', async ({ page, backend }) => {
    await open(page, 'home');
    backend.set('submit_feedback', { status: 500, body: { success: false, error: 'Workflow error' } });
    await feedbackTrigger(page).click();
    await fillAndSubmit(page, 'e2e retry');
    await expect(page.getByRole('status').filter({ hasText: 'Failed to send feedback' })).toBeVisible();
    await expect(heading(page)).toBeVisible();
    await page.getByRole('button', { name: 'Submit Feedback' }).click();
    await expect.poll(() => backend.calls('submit_feedback').length).toBe(2);
    const [a, b] = backend.calls('submit_feedback');
    expect(b.body.client_id).toBe(a.body.client_id);
  });

  test('a new report after success gets a new client_id', async ({ page, backend }) => {
    await open(page, 'home');
    await feedbackTrigger(page).click();
    await fillAndSubmit(page, 'first');
    await expect(heading(page)).toHaveCount(0);
    await feedbackTrigger(page).click();
    await fillAndSubmit(page, 'second');
    await expect.poll(() => backend.calls('submit_feedback').length).toBe(2);
    const [a, b] = backend.calls('submit_feedback');
    expect(b.body.client_id).not.toBe(a.body.client_id);
  });
});
