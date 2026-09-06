const { test, expect, open } = require('./support.js');

// Never clicks "Submit Feedback" — this suite must not create real feedback rows.
test('feedback panel opens and closes; never submits', async ({ page }) => {
  // Home's own mount effect fires a Smart Deals fetch in the background
  // (independent of this suite ever visiting the Deals screen); apiFetch's
  // hidden ~30s timeout means that request is often still in flight well
  // past Playwright's default 30s test timeout, holding `networkidle` off.
  // Give this one spec more room rather than touching the shared `open()`
  // helper other live specs rely on.
  test.setTimeout(90000);
  await open(page, 'home');
  await page.getByRole('button', { name: 'Send feedback' }).filter({ visible: true }).first().click();
  // "Send Feedback" (the panel heading) collides case-insensitively with the
  // "Send feedback" trigger under getByText's default matcher — use the
  // heading role instead (see e2e/feedback.spec.js's `heading` helper).
  const heading = page.getByRole('heading', { name: 'Send Feedback' });
  await expect(heading).toBeVisible();
  await page.getByRole('button', { name: 'Close feedback' }).click();
  await expect(heading).toHaveCount(0);
});
