const { test, expect } = require('./support.js');

// A PERMANENT sentinel row: fixed session_id + stack_hash, so every run after
// the first is an INSERT IGNORE no-op ({success:true,new:false}) and Slack sees
// exactly one "[TEST] live smoke sentinel" line ever. Do not delete the row —
// deleting it would re-notify Slack on the next run.
const SENTINEL = {
  session_id: '00000000-0000-4000-8000-0000000e2e01',
  stack_hash: 'e2e00001',
  kind: 'onerror',
  screen: 'plan',
  message: '[TEST] live smoke sentinel',
  stack: '',
  user_agent: 'playwright-live',
  app_version: 'live-spec',
  week_date_range: 'live',
  client_time: new Date().toISOString(),
};

test('client_errors stores the sentinel idempotently and rejects an empty report', async ({ api }) => {
  const ok = await api.post('client_errors', SENTINEL);
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ success: true });
  const again = await api.post('client_errors', SENTINEL);
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual({ success: true, new: false });
  const bad = await api.post('client_errors', {});
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toEqual({ success: false, error: 'invalid report' });
});
