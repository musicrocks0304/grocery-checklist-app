import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import {
  installErrorReporter, uninstallErrorReporter, reportError,
  fnv1a, stripQueries, bundleVersion, stackHash, LIMITS,
} from './errorReporter';

const URL = 'http://n8n.test/webhook/client_errors';
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX8 = /^[0-9a-f]{8}$/;

let fetchMock;
beforeEach(() => {
  window.sessionStorage.clear();
  window.location.hash = '#shop';
  fetchMock = installMockFetch({ client_errors: { success: true, new: true } });
  installErrorReporter({ url: URL, apiKey: 'test-key' });
});
afterEach(() => {
  uninstallErrorReporter();
  restoreFetch();
  jest.useRealTimers();
});

const posts = () => fetchMock.for('client_errors');
const lastBody = () => posts()[posts().length - 1].body;
const lastInit = () => global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1];
const rejection = (reason) => { const ev = new Event('unhandledrejection'); ev.reason = reason; return ev; };

describe('helpers', () => {
  test('fnv1a is stable, 8 hex chars, and differs per input', () => {
    expect(fnv1a('abc')).toMatch(HEX8);
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
    expect(fnv1a('')).toBe('811c9dc5');
  });
  test('stripQueries removes query strings from URL-shaped tokens only', () => {
    expect(stripQueries('GET https://x.test/webhook/a?key=1&b=2 failed at https://y.test/z?t=3 end')).toBe('GET https://x.test/webhook/a failed at https://y.test/z end');
    expect(stripQueries('what? no url')).toBe('what? no url');
    expect(stripQueries(null)).toBe('');
  });
  test('bundleVersion reads the main.<hash>.js script or falls back to dev', () => {
    expect(bundleVersion({ scripts: [{ src: 'http://localhost/static/js/main.d016df08.js' }] })).toBe('d016df08');
    expect(bundleVersion({ scripts: [{ src: 'http://localhost/static/js/453.chunk.js' }] })).toBe('dev');
    expect(bundleVersion()).toBe('dev');
  });
  test('stackHash ignores the bundle hash but keeps line:column, and folds endpoint/status in', () => {
    const a = stackHash('onerror', 'boom', 'Error: boom\n    at f (http://h/static/js/main.aaaaaaaa.js:2:100)');
    const b = stackHash('onerror', 'boom', 'Error: boom\n    at f (http://h/static/js/main.bbbbbbbb.js:2:100)');
    const c = stackHash('onerror', 'boom', 'Error: boom\n    at f (http://h/static/js/main.aaaaaaaa.js:2:101)');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(stackHash('api', 'Workflow error', '', 'a', 500)).not.toBe(stackHash('api', 'Workflow error', '', 'b', 500));
  });
  test('LIMITS are pinned to the documented values', () => {
    expect(LIMITS).toEqual({ message: 500, stack: 2048, perSession: 20, perMinute: 5, frames: 5 });
  });
});

describe('reportError', () => {
  test('posts one keyed keepalive report with the documented fields', () => {
    const err = new Error('boom');
    expect(reportError({ kind: 'onerror', error: err })).toBe(true);
    expect(posts()).toHaveLength(1);
    const init = lastInit();
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.headers['X-API-Key']).toBe('test-key');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = lastBody();
    expect(body).toMatchObject({ kind: 'onerror', screen: 'shop', message: 'boom', app_version: 'dev' });
    expect(body.stack_hash).toMatch(HEX8);
    expect(body.session_id).toMatch(V4);
    expect(body.stack).toContain('boom');
    expect(typeof body.user_agent).toBe('string');
    expect(body.week_date_range).toMatch(/^For the week of /);
    expect(new Date(body.client_time).toString()).not.toBe('Invalid Date');
    expect(body.endpoint).toBeUndefined();
  });
  test('the session id is reused within a tab and stored in sessionStorage', () => {
    reportError({ kind: 'onerror', error: new Error('one') });
    reportError({ kind: 'onerror', error: new Error('two') });
    const [a, b] = posts().map((p) => p.body.session_id);
    expect(a).toBe(b);
    expect(window.sessionStorage.getItem('ce_session')).toBe(a);
  });
  test('the same error twice posts once; a different message posts again', () => {
    const err = new Error('dup');
    expect(reportError({ kind: 'onerror', error: err })).toBe(true);
    expect(reportError({ kind: 'onerror', error: err })).toBe(false);
    expect(posts()).toHaveLength(1);
    expect(reportError({ kind: 'onerror', error: new Error('other') })).toBe(true);
    expect(posts()).toHaveLength(2);
  });
  test('the seen set survives a re-install (sessionStorage)', () => {
    const err = new Error('persist');
    reportError({ kind: 'onerror', error: err });
    uninstallErrorReporter();
    installErrorReporter({ url: URL, apiKey: 'test-key' });
    expect(reportError({ kind: 'onerror', error: err })).toBe(false);
    expect(posts()).toHaveLength(1);
  });
  test('stops after 20 distinct reports in a session (spaced out so the per-minute cap never bites)', () => {
    jest.useFakeTimers('modern');
    let t = Date.parse('2026-09-09T10:00:00');
    for (let i = 0; i < LIMITS.perSession; i++) {
      jest.setSystemTime(t += 15000);
      expect(reportError({ kind: 'onerror', message: `m${i}` })).toBe(true);
    }
    jest.setSystemTime(t += 15000);
    expect(reportError({ kind: 'onerror', message: 'm-overflow' })).toBe(false);
    expect(posts()).toHaveLength(LIMITS.perSession);
    expect(window.sessionStorage.getItem('ce_count')).toBe(String(LIMITS.perSession));
  });
  test('allows 5 per minute, then more after 60 s', () => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-09-09T10:00:00'));
    for (let i = 0; i < LIMITS.perMinute; i++) expect(reportError({ kind: 'onerror', message: `r${i}` })).toBe(true);
    expect(reportError({ kind: 'onerror', message: 'r-burst' })).toBe(false);
    jest.setSystemTime(new Date('2026-09-09T10:01:01'));
    expect(reportError({ kind: 'onerror', message: 'r-later' })).toBe(true);
    expect(posts()).toHaveLength(LIMITS.perMinute + 1);
  });
  test('truncates message and stack and strips query strings from both', () => {
    const err = new Error(`x https://n8n.test/webhook/a?key=secret ${'m'.repeat(600)}`);
    err.stack = `Error: x\n    at f (https://h/static/js/main.abcdef12.js?v=1:2:3)\n${'s'.repeat(3000)}`;
    reportError({ kind: 'onerror', error: err });
    const body = lastBody();
    expect(body.message.length).toBeLessThanOrEqual(LIMITS.message);
    expect(body.message.length).toBeLessThanOrEqual(500);
    expect(body.message).not.toContain('secret');
    expect(body.stack.length).toBeLessThanOrEqual(LIMITS.stack);
    expect(body.stack.length).toBeLessThanOrEqual(2048);
    expect(body.stack).not.toContain('?v=1');
  });
  test('drops ResizeObserver loop noise and empty messages', () => {
    expect(reportError({ kind: 'onerror', message: 'ResizeObserver loop completed with undelivered notifications.' })).toBe(false);
    expect(reportError({ kind: 'onerror', message: '   ' })).toBe(false);
    expect(reportError({ kind: 'onerror' })).toBe(false);
    expect(posts()).toHaveLength(0);
  });
  test('api kind carries endpoint and status, has an empty stack, and is skipped for network errors while offline', () => {
    const apiErr = Object.assign(new Error('Workflow error'), { code: 'http', status: 500 });
    expect(reportError({ kind: 'api', error: apiErr, endpoint: 'fetch_grocery_items', status: 500 })).toBe(true);
    expect(lastBody()).toMatchObject({ kind: 'api', endpoint: 'fetch_grocery_items', status: 500, stack: '' });
    const onLine = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const netErr = Object.assign(new Error('Network error — check your connection'), { code: 'network', status: 0 });
    expect(reportError({ kind: 'api', error: netErr, endpoint: 'categories', status: 0 })).toBe(false);
    onLine.mockReturnValue(true);
    expect(reportError({ kind: 'api', error: netErr, endpoint: 'categories', status: 0 })).toBe(true);
    onLine.mockRestore();
  });
  test('window error and unhandledrejection events are reported with their kinds', () => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('evt'), message: 'evt' }));
    window.dispatchEvent(rejection(new Error('rej')));
    window.dispatchEvent(rejection('plain string reason'));
    window.dispatchEvent(rejection(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    window.dispatchEvent(new ErrorEvent('error', {}));
    const kinds = posts().map((p) => [p.body.kind, p.body.message]);
    expect(kinds).toEqual([['onerror', 'evt'], ['unhandledrejection', 'rej'], ['unhandledrejection', 'plain string reason']]);
  });
  test('is a no-op before install and after uninstall', () => {
    uninstallErrorReporter();
    expect(reportError({ kind: 'onerror', message: 'nobody home' })).toBe(false);
    expect(posts()).toHaveLength(0);
    expect(installErrorReporter({ url: URL, apiKey: 'k' })).toBe(true);
    expect(installErrorReporter({ url: URL, apiKey: 'k' })).toBe(false);
  });
  test('never throws: fetch throwing synchronously, fetch rejecting, sessionStorage throwing', async () => {
    global.fetch = jest.fn(() => { throw new Error('sync'); });
    expect(reportError({ kind: 'onerror', message: 'sync-throw' })).toBe(true);
    global.fetch = jest.fn(() => Promise.reject(new Error('async')));
    expect(reportError({ kind: 'onerror', message: 'async-reject' })).toBe(true);
    await Promise.resolve();
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    uninstallErrorReporter();
    expect(installErrorReporter({ url: URL, apiKey: 'k' })).toBe(true);
    expect(reportError({ kind: 'onerror', message: 'no-storage' })).toBe(true);
    expect(reportError({ kind: 'onerror', message: 'no-storage' })).toBe(false);
    getItem.mockRestore(); setItem.mockRestore();
  });
  test('api network reports are dropped after pagehide and resume after pageshow', () => {
    const netErr = Object.assign(new Error('Network error — check your connection'), { code: 'network', status: 0 });
    window.dispatchEvent(new Event('pagehide'));
    expect(reportError({ kind: 'api', error: netErr, endpoint: 'shopping_progress_check', status: 0 })).toBe(false);
    const httpErr = Object.assign(new Error('Workflow error'), { code: 'http', status: 500 });
    expect(reportError({ kind: 'api', error: httpErr, endpoint: 'shopping_progress_check', status: 500 })).toBe(true);
    window.dispatchEvent(new Event('pageshow'));
    expect(reportError({ kind: 'api', error: netErr, endpoint: 'categories', status: 0 })).toBe(true);
  });
  test('uninstall clears the unloading flag', () => {
    window.dispatchEvent(new Event('pagehide'));
    uninstallErrorReporter();
    installErrorReporter({ url: URL, apiKey: 'test-key' });
    const netErr = Object.assign(new Error('Network error — check your connection'), { code: 'network', status: 0 });
    expect(reportError({ kind: 'api', error: netErr, endpoint: 'shopping_progress_check', status: 0 })).toBe(true);
  });
});
