const fs = require('fs');
const path = require('path');
const { test, expect, open } = require('./support/test.js');
const AxeBuilder = require('@axe-core/playwright').default;

// Keyboard-only coverage for the surfaces changed by the accessibility pass.
// axe is injected from node_modules by the library, so the hermetic request
// guard never sees a network request.
const feedbackTrigger = (page) => page.getByRole('button', { name: 'Send feedback' }).filter({ visible: true }).first();
const activeInside = (page, selector) => page.evaluate((s) => !!document.activeElement?.closest(s), selector);
const activeIsUsefulOutside = (page, selector) => page.evaluate((s) => {
  const el = document.activeElement;
  return !!el && el !== document.body && el.isConnected && !el.closest(s)
    && el.matches('a[href], button, input, textarea, select, [tabindex]');
}, selector);

async function expectNoSeriousViolations(page, include, label) {
  const results = await new AxeBuilder({ page }).include(include).analyze();
  const blocking = results.violations.filter((v) =>
    v.id !== 'color-contrast' && (v.impact === 'serious' || v.impact === 'critical'));
  const deferredContrast = results.violations.filter((v) => v.id === 'color-contrast');
  const rest = results.violations.filter((v) => !blocking.includes(v) && v.id !== 'color-contrast');
  const format = (v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`;
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      const selector = node.target.join(' ');
      const computed = await page.locator(selector).first().evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          opacity: style.opacity,
          disabled: el.disabled,
          ariaDisabled: el.getAttribute('aria-disabled'),
        };
      });
      console.log(`[axe detail ${label}] ${JSON.stringify({
        rule: violation.id,
        impact: violation.impact,
        target: node.target,
        html: node.html,
        failureSummary: node.failureSummary,
        any: node.any.map(({ id, data, message }) => ({ id, data, message })),
        computed,
      })}`);
    }
  }
  console.log(`[axe ${label}] blocking: ${blocking.length ? blocking.map(format).join(', ') : 'none'}`);
  console.log(`[axe ${label}] deferred color contrast: ${deferredContrast.length ? deferredContrast.map(format).join(', ') : 'none'}`);
  console.log(`[axe ${label}] non-blocking: ${rest.length ? rest.map(format).join(', ') : 'none'}`);
  expect.soft(blocking.map(format), `axe ${label}`).toEqual([]);
}

async function settleMotion(page) {
  await page.clock.fastForward(500);
}

async function expectTarget(locator, label) {
  await expect(locator, `${label} is visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} has a box`).not.toBeNull();
  expect(box.width, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44);
  return box;
}

async function expectHitTarget(locator, label) {
  const hits = await locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return [box.top + 1, box.bottom - 1].map((y) => {
      const hit = document.elementFromPoint(box.left + box.width / 2, y);
      return hit === el || el.contains(hit);
    });
  });
  expect(hits, `${label} top and bottom remain hit-testable`).toEqual([true, true]);
}

async function screenshot(page, name) {
  const filename = `${name}-${test.info().project.name}.png`;
  const target = process.env.A11Y_VISUAL_DIR
    ? path.resolve(process.env.A11Y_VISUAL_DIR, filename)
    : test.info().outputPath(filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await page.screenshot({ path: target, fullPage: true });
}

async function seedCookStep(page, backend) {
  const meal = { selection_id: 1, WeekDateRange: 'For the week of September 6th to September 12th, 2026', recipe_id: 3, notes: '', created_at: '2026-09-06 12:00:00', recipe_name: 'Chicken tacos', recipe_description: 'Weeknight tacos' };
  backend.set('fetch_weekly_meals', { body: [meal], times: 3 });
  backend.set('choose_recipe_instructions', { body: [meal], times: 3 });
  backend.set('grab_instructions_fast', { body: [{ output: [{ recipe_id: 3, step_number: 1, instruction_text: 'Cook the chicken', time_minutes: 10 }], all_ingredients: [{ recipe_id: 3, ingredient_name: 'Chicken thighs', quantity: 1, unit_name: 'lb' }] }], times: 1 });
  await page.goto('about:blank');
  await page.goto('/?debug=true#cook');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Chicken tacos' })).toBeVisible();
}

test.describe('Accessibility', () => {
  test('feedback keyboard flow traps focus, audits the dialog, and restores focus', async ({ page, backend }) => {
    await open(page, 'plan');
    const trigger = feedbackTrigger(page);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Send Feedback' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByPlaceholder('What happened? What would make it better?')).toBeFocused();
    await settleMotion(page);
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      expect(await activeInside(page, '[role="dialog"]'), `Tab #${i + 1} stayed inside`).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await activeInside(page, '[role="dialog"]')).toBe(true);
    await expectNoSeriousViolations(page, '[role="dialog"]', 'feedback panel');
    const dialogBox = await dialog.boundingBox();
    const headerBox = await dialog.locator('> div').first().boundingBox();
    console.log(`[measure feedback] dialog=${JSON.stringify(dialogBox)} header=${JSON.stringify(headerBox)}`);
    expect(headerBox.height).toBe(73);
    await screenshot(page, 'feedback');
    await page.keyboard.press('Escape');
    await settleMotion(page);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(backend.calls('submit_feedback')).toHaveLength(0);
  });

  test('feedback re-entry preserves client identity, screenshot, and form state', async ({ page, backend }) => {
    backend.set('submit_feedback', { status: 500, body: { success: false }, times: 2 });
    await open(page, 'plan');
    const trigger = feedbackTrigger(page);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Send Feedback' });
    await expect(dialog.locator('img')).toHaveCount(1);
    await page.getByRole('button', { name: /bug/i }).click();
    const textarea = page.getByPlaceholder('What happened? What would make it better?');
    await textarea.fill('preserve this report');
    await page.getByRole('button', { name: 'Submit Feedback' }).click();
    await expect.poll(() => backend.calls('submit_feedback').length).toBe(1);
    await trigger.dispatchEvent('click');
    await expect(textarea).toBeFocused();
    await expect(textarea).toHaveValue('preserve this report');
    await expect(dialog.locator('img')).toHaveCount(1);
    await page.getByRole('button', { name: 'Submit Feedback' }).click();
    await expect.poll(() => backend.calls('submit_feedback').length).toBe(2);
    const [before, after] = backend.calls('submit_feedback').map((call) => call.body);
    expect(after.client_id).toBe(before.client_id);
    expect(after.screenshots).toBe(before.screenshots);
    expect(after.description).toBe(before.description);
  });

  test('Shop menu keyboard navigation wraps and Home/End work', async ({ page, backend }) => {
    await open(page, 'shop');
    const more = page.getByRole('button', { name: 'More' });
    await expect(more).toHaveAttribute('aria-haspopup', 'menu');
    await expect(more).toHaveAttribute('aria-controls', 'shop-mode-menu');
    await more.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Shopping options' });
    await expect(menu).toBeVisible();
    await settleMotion(page);
    const reorder = page.getByRole('menuitem', { name: 'Reorder aisles' });
    const invite = page.getByRole('menuitem', { name: 'Invite partner' });
    const feedback = page.getByRole('menuitem', { name: 'Send feedback' });
    await expect(reorder).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(feedback).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(reorder).toBeFocused();
    await page.keyboard.press('End');
    await expect(feedback).toBeFocused();
    await page.keyboard.press('Home');
    await expect(reorder).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(invite).toBeFocused();
    await expectNoSeriousViolations(page, '[data-testid="shop-screen"]', 'shop screen with menu');
    await screenshot(page, 'shop-menu');
    await page.keyboard.press('Escape');
    await settleMotion(page);
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
  });

  for (const key of ['Tab', 'Shift+Tab']) {
    test(`Shop menu ${key} closes and lands on a useful connected control`, async ({ page, backend }) => {
      await open(page, 'shop');
      const more = page.getByRole('button', { name: 'More' });
      await more.focus();
      await page.keyboard.press('Enter');
      const menu = page.getByRole('menu', { name: 'Shopping options' });
      await expect(menu).toBeVisible();
      await page.keyboard.press(key);
      await settleMotion(page);
      await expect(menu).toHaveCount(0);
      expect(await activeIsUsefulOutside(page, '#shop-mode-menu')).toBe(true);
    });
  }

  test('Invite opens by keyboard, traps focus, and returns to More on prompt Escape', async ({ page, backend }) => {
    await open(page, 'shop');
    const more = page.getByRole('button', { name: 'More' });
    await more.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Invite a partner' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByText('E2E1')).toBeVisible();
    await settleMotion(page);
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
      expect(await activeInside(page, '[role="dialog"]'), `Tab #${i + 1} stayed inside`).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await activeInside(page, '[role="dialog"]')).toBe(true);
    await expectNoSeriousViolations(page, '[role="dialog"]', 'invite modal');
    const titleBox = await dialog.locator('#invite-title').boundingBox();
    const rowBox = await dialog.locator('#invite-title').locator('..').boundingBox();
    console.log(`[measure invite] title=${JSON.stringify(titleBox)} row=${JSON.stringify(rowBox)}`);
    expect(rowBox.height).toBe(27);
    await screenshot(page, 'invite');
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await settleMotion(page);
    await expect(dialog).toHaveCount(0);
    expect(backend.calls('create_session')).toHaveLength(1);
  });

  test('prompt Invite Escape returns focus while the menu is still exiting', async ({ page, backend }) => {
    await open(page, 'shop');
    const more = page.getByRole('button', { name: 'More' });
    await more.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Invite a partner' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await settleMotion(page);
    await expect(dialog).toHaveCount(0);
    expect(backend.calls('create_session')).toHaveLength(1);
  });

  test('Shop feedback opened by keyboard returns focus to More', async ({ page, backend }) => {
    await open(page, 'shop');
    const more = page.getByRole('button', { name: 'More' });
    await more.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Send Feedback' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await settleMotion(page);
    await expect(dialog).toHaveCount(0);
    expect(backend.calls('submit_feedback')).toHaveLength(0);
  });

  test('Cart disclosure is named, keyboard operated, 44px, and scoped-audited', async ({ page, backend }) => {
    await open(page, 'cart');
    const panel = page.getByTestId('heb-signin-panel');
    await expect(panel.getByText('HEB sign-in needed')).toBeVisible();
    const disclosure = panel.getByRole('button', { name: 'Show technical details' });
    await expect(disclosure).toHaveAttribute('aria-controls', 'heb-login-details');
    await expect(page.locator('#heb-login-details')).toHaveCount(0);
    const disclosureRow = disclosure.locator('..');
    const currentRowBox = await disclosureRow.boundingBox();
    const currentClass = await disclosure.getAttribute('class');
    await disclosure.evaluate((el) => {
      el.className = 'inline-flex items-center gap-1 text-xs text-muted hover:text-body transition-colors';
    });
    const baselineRowBox = await disclosureRow.boundingBox();
    await disclosure.evaluate((el, className) => { el.className = className; }, currentClass);
    console.log(`[measure cart row] baseline=${JSON.stringify(baselineRowBox)} current=${JSON.stringify(currentRowBox)}`);
    expect(currentRowBox.height).toBe(baselineRowBox.height);
    await disclosure.focus();
    await page.keyboard.press('Enter');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#heb-login-details')).toContainText('npm run scrape:login');
    const box = await expectTarget(disclosure, 'Cart disclosure');
    await expectHitTarget(disclosure, 'Cart disclosure');
    const panelBox = await panel.boundingBox();
    console.log(`[measure cart] disclosure=${JSON.stringify(box)} panel=${JSON.stringify(panelBox)}`);
    await expectNoSeriousViolations(page, '[data-testid="heb-signin-panel"]', 'cart sign-in panel');
    await screenshot(page, 'cart');
  });

  test('Plan All and Clear remain 44px without overlap', async ({ page, backend }) => {
    await open(page, 'plan');
    const main = page.locator('main');
    const all = main.getByRole('button', { name: 'All', exact: true }).filter({ visible: true }).first();
    const row = all.locator('..');
    const currentRowBox = await row.boundingBox();
    const currentClass = await all.getAttribute('class');
    await all.evaluate((el) => {
      el.className = 'text-xs font-medium text-muted hover:text-body px-2 py-1 ml-1 rounded';
    });
    const baselineRowBox = await row.boundingBox();
    await all.evaluate((el, className) => { el.className = className; }, currentClass);
    const allBox = await expectTarget(all, 'Plan All');
    await expectHitTarget(all, 'Plan All');
    const rowBox = await row.boundingBox();
    console.log(`[measure plan all] baselineRow=${JSON.stringify(baselineRowBox)} currentRow=${JSON.stringify(currentRowBox)} target=${JSON.stringify(allBox)} row=${JSON.stringify(rowBox)}`);
    expect(currentRowBox.height).toBe(baselineRowBox.height);
    await all.click();
    const clear = main.getByRole('button', { name: 'Clear', exact: true }).filter({ visible: true }).first();
    const clearBox = await expectTarget(clear, 'Plan Clear');
    await expectHitTarget(clear, 'Plan Clear');
    const adjacent = clear.locator('xpath=preceding-sibling::*[1]');
    if (await adjacent.count()) {
      const adjacentBox = await adjacent.boundingBox();
      expect(clearBox.x).toBeGreaterThanOrEqual(adjacentBox.x + adjacentBox.width);
    }
    console.log(`[measure plan clear] target=${JSON.stringify(clearBox)}`);
    await screenshot(page, 'plan');
  });

  test('feedback and invite close controls are 44px', async ({ page, backend }) => {
    await open(page, 'plan');
    await feedbackTrigger(page).click();
    await settleMotion(page);
    await expectTarget(page.getByRole('button', { name: 'Close feedback' }), 'Feedback close');
    await page.keyboard.press('Escape');
    await settleMotion(page);
    await open(page, 'shop');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Invite partner' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await settleMotion(page);
    await expectTarget(page.getByRole('dialog').getByRole('button', { name: 'Close' }), 'Invite close');
  });

  test('both Cook debug variants are 44px and keyboard operable', async ({ page, backend }) => {
    await seedCookStep(page, backend);
    const selectionToggle = page.getByRole('button', { name: 'Toggle debug log' });
    await expectTarget(selectionToggle, 'Cook selection debug toggle');
    await selectionToggle.focus();
    await page.keyboard.press('Enter');
    await expect(selectionToggle).toHaveAttribute('aria-expanded', 'true');
    await screenshot(page, 'cook-selection');
    await page.keyboard.press('Enter');
    await expect(selectionToggle).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Start Cooking' }).click();
    await expect(page.getByText('Cook the chicken', { exact: true })).toBeVisible();
    const stepToggle = page.getByRole('button', { name: 'Toggle debug log' });
    await expectTarget(stepToggle, 'Cook step debug toggle');
    await stepToggle.focus();
    await page.keyboard.press('Enter');
    await expect(stepToggle).toHaveAttribute('aria-expanded', 'true');
    await screenshot(page, 'cook-step');
  });
});
