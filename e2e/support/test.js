const base = require('@playwright/test');
const { MockBackend } = require('./mock-backend.js');
const { WEEK } = require('./week.js');

const test = base.test.extend({
  backend: async ({ page }, use) => {
    await page.clock.install({ time: new Date(WEEK.frozenClock) });
    const backend = new MockBackend(page);
    await backend.install();
    await use(backend);
    base.expect(backend.keyErrors, 'n8n requests without X-API-Key').toEqual([]);
    base.expect(backend.unmocked, 'unmocked backend requests').toEqual([]);
  },
});

// Navigate through about:blank so every visit is a real load (hash-only
// changes do not re-run the app's mount effects).
async function open(page, route) {
  await page.goto('about:blank');
  await page.goto(`/#${route}`);
  await page.waitForLoadState('networkidle');
}

module.exports = { test, expect: base.expect, open, WEEK };
