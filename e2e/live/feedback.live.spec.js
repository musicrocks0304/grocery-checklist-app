const { test, expect, open } = require('./support.js');

// Never clicks "Submit Feedback" — this suite must not create real feedback rows.
// Opens `#plan`, not `#home` — Home's own mount effect fires a Smart Deals
// POST in the background (LLM run when the cache is stale), independent of
// this suite ever visiting the Deals screen. The "Send feedback" trigger is
// global (AppShell), so Plan works just as well and avoids that call.
test('feedback panel opens and closes; never submits', async ({ page }) => {
  await open(page, 'plan');
  await page.getByRole('button', { name: 'Send feedback' }).filter({ visible: true }).first().click();
  // "Send Feedback" (the panel heading) collides case-insensitively with the
  // "Send feedback" trigger under getByText's default matcher — use the
  // heading role instead (see e2e/feedback.spec.js's `heading` helper).
  const heading = page.getByRole('heading', { name: 'Send Feedback' });
  await expect(heading).toBeVisible();
  await page.getByRole('button', { name: 'Close feedback' }).click();
  await expect(heading).toHaveCount(0);
});
