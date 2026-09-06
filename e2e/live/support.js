// Support for the `live` project: real backend, real API key, no mocking.
// Never log `env.REACT_APP_API_KEY` — these specs touch production data.
const { test: base, expect } = require('@playwright/test');
const { readLiveEnv } = require('../support/live-env.js');

const env = readLiveEnv();

const test = base.extend({
  api: async ({ request }, use) => {
    await use({
      post: (p, body) =>
        request.post(`${env.REACT_APP_API_BASE_URL}/${p}`, {
          headers: { 'X-API-Key': env.REACT_APP_API_KEY, Origin: 'https://grocery-checklist-app.netlify.app' },
          data: body,
        }),
    });
  },
});

// Navigate through about:blank so every visit is a real load (hash-only
// changes do not re-run the app's mount effects) — same pattern as the
// hermetic suite's support/test.js.
async function open(page, route) {
  await page.goto('about:blank');
  await page.goto(`/#${route}`);
  await page.waitForLoadState('networkidle');
}

module.exports = { test, expect, open, env };
