const { test, expect, open, WEEK } = require('./support/test.js');

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX8 = /^[0-9a-f]{8}$/;

// One thrower function per page, installed once, so repeated throws share the
// same stack frames (the hash covers the top frames' line:column) and the
// second identical throw is deduplicated by the reporter.
//
// Deviation from the brief: the brief's thrower used `setTimeout(() => {
// throw ... }, 0)`. The `backend` fixture installs Playwright's fake clock
// (page.clock.install) so the frozen-clock tests get a stable week; that
// fake clock is sinon-based and runs macrotask (setTimeout/setInterval)
// callbacks inside its own try/catch, routing an uncaught throw to
// console.error instead of letting it reach window as a real 'error' event.
// Under it the setTimeout thrower never fired errorReporter's onerror
// listener at all (0 posts, not a dedupe mismatch). queueMicrotask is not
// part of sinon's faked timer queue, so a throw from it still produces a
// genuine uncaught exception and window 'error' event even with the clock
// frozen.
async function installThrower(page) {
  await page.evaluate(() => {
    window.__e2eThrow = (m) => queueMicrotask(() => { throw new Error(m); });
    window.__e2eReject = (m) => { Promise.reject(new Error(m)); };
  });
}

test.describe('Client error telemetry', () => {
  test('an uncaught error posts one report; the same error again is deduped; a new one posts', async ({ page, backend }) => {
    await open(page, 'plan');
    await installThrower(page);
    await page.evaluate(() => window.__e2eThrow('e2e telemetry probe'));
    await expect.poll(() => backend.calls('client_errors').length).toBe(1);
    const body = backend.calls('client_errors')[0].body;
    expect(body).toMatchObject({ kind: 'onerror', screen: 'plan', week_date_range: WEEK.displayRange });
    expect(body.message).toContain('e2e telemetry probe');
    expect(body.session_id).toMatch(V4);
    expect(body.stack_hash).toMatch(HEX8);
    expect(body.app_version).toMatch(HEX8); // the served production bundle main.<hash>.js
    expect(body.stack).not.toMatch(/\?[a-z]+=/);
    expect(body.endpoint).toBeUndefined();

    await page.evaluate(() => window.__e2eThrow('e2e telemetry probe'));
    await page.waitForTimeout(750);
    expect(backend.calls('client_errors')).toHaveLength(1);

    await page.evaluate(() => window.__e2eThrow('e2e telemetry probe two'));
    await expect.poll(() => backend.calls('client_errors').length).toBe(2);
    expect(backend.calls('client_errors')[1].body.stack_hash).not.toBe(body.stack_hash);
  });

  test('an unhandled rejection posts with kind unhandledrejection', async ({ page, backend }) => {
    await open(page, 'plan');
    await installThrower(page);
    await page.evaluate(() => window.__e2eReject('e2e rejection probe'));
    await expect.poll(() => backend.calls('client_errors').length).toBe(1);
    expect(backend.calls('client_errors')[0].body).toMatchObject({ kind: 'unhandledrejection', screen: 'plan' });
    expect(backend.calls('client_errors')[0].body.message).toContain('e2e rejection probe');
  });

  test('a 5xx from a data endpoint posts one kind=api report', async ({ page, backend }) => {
    // apiJson retries GETs twice (1 s + 2 s backoff) and Plan may request the
    // list from more than one component, so hand out enough 500s that at
    // least one caller exhausts its retries. Dedupe keeps the report count at 1.
    backend.set('fetch_grocery_items', { status: 500, body: { success: false, error: 'Workflow error' }, times: 6 });
    await open(page, 'plan');
    await expect.poll(() => backend.calls('client_errors').length, { timeout: 20000 }).toBe(1);
    expect(backend.calls('client_errors')[0].body).toMatchObject({ kind: 'api', endpoint: 'fetch_grocery_items', status: 500, screen: 'plan', stack: '' });
    expect(backend.calls('client_errors')[0].body.message).toBe('Workflow error');
  });

  test('a healthy load sends no telemetry', async ({ page, backend }) => {
    await open(page, 'plan');
    await page.waitForTimeout(500);
    expect(backend.calls('client_errors')).toHaveLength(0);
  });
});
