import { apiFetch, ApiError, apiJson, showApiError, userMessage, ENDPOINTS } from './api';
import { reportError } from '../telemetry/errorReporter';

jest.mock('../telemetry/errorReporter', () => ({ reportError: jest.fn() }));

// Save originals
const originalFetch = global.fetch;
const originalSetTimeout = global.setTimeout;

beforeEach(() => {
  delete process.env.REACT_APP_API_KEY;
});

afterEach(() => {
  global.fetch = originalFetch;
  global.setTimeout = originalSetTimeout;
});

const instant = () => { global.setTimeout = (fn, _delay) => originalSetTimeout(fn, 0); };
const res = (status, text, extra = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: extra.statusText || '',
  text: () => Promise.resolve(text),
  json: () => Promise.resolve(JSON.parse(text)),
});

describe('apiFetch', () => {
  test('adds X-API-Key header when REACT_APP_API_KEY is set', async () => {
    process.env.REACT_APP_API_KEY = 'test-key-123';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await apiFetch('https://example.com/api');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'test-key-123' }),
      })
    );
  });

  test('omits X-API-Key header when no API key is set', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await apiFetch('https://example.com/api');

    const callHeaders = global.fetch.mock.calls[0][1].headers;
    expect(callHeaders['X-API-Key']).toBeUndefined();
  });

  test('retries on 500 errors up to maxRetries times', async () => {
    // Make setTimeout instant so retries don't wait
    global.setTimeout = (fn, _delay) => originalSetTimeout(fn, 0);

    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await apiFetch('https://example.com/api', { retries: 2 });

    expect(result.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('does NOT retry on 400 client errors', async () => {
    global.setTimeout = (fn, _delay) => originalSetTimeout(fn, 0);

    global.fetch = jest.fn()
      .mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' });

    const result = await apiFetch('https://example.com/api', { retries: 2 });

    expect(result.status).toBe(400);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('does NOT retry on 404 client errors', async () => {
    global.setTimeout = (fn, _delay) => originalSetTimeout(fn, 0);

    global.fetch = jest.fn()
      .mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    const result = await apiFetch('https://example.com/api', { retries: 2 });

    expect(result.status).toBe(404);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries on network errors (fetch throws)', async () => {
    global.setTimeout = (fn, _delay) => originalSetTimeout(fn, 0);

    global.fetch = jest.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await apiFetch('https://example.com/api', { retries: 1 });

    expect(result.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('throws after exhausting all retries on network error', async () => {
    global.setTimeout = (fn, _delay) => originalSetTimeout(fn, 0);

    global.fetch = jest.fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      apiFetch('https://example.com/api', { retries: 2 })
    ).rejects.toThrow('Failed to fetch');

    expect(global.fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  test('skips retry when retries option is 0', async () => {
    global.setTimeout = (fn, _delay) => originalSetTimeout(fn, 0);

    global.fetch = jest.fn()
      .mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

    const result = await apiFetch('https://example.com/api', { retries: 0 });

    expect(result.status).toBe(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('times out after configured timeout', async () => {
    // Use a very short timeout to keep the test fast
    // fetch mock never resolves quickly enough
    global.fetch = jest.fn().mockImplementation(
      (_url, opts) =>
        new Promise((resolve, reject) => {
          // Listen for abort signal
          if (opts && opts.signal) {
            opts.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
          // Simulate a hung request — would resolve after 60s but timeout fires first
          originalSetTimeout(() => resolve({ ok: true, status: 200 }), 60000);
        })
    );

    await expect(
      apiFetch('https://example.com/api', { timeout: 50, retries: 0 })
    ).rejects.toThrow();
  });
});

describe('apiJson', () => {
  test('returns the parsed body on 2xx JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(200, '[{"id":1}]'));
    await expect(apiJson('https://example.com/x')).resolves.toEqual([{ id: 1 }]);
  });

  test('POST defaults to retries: 0 — a 500 is thrown after one attempt', async () => {
    instant();
    global.fetch = jest.fn().mockResolvedValue(res(500, '{"message":"Error in workflow"}'));
    const err = await apiJson('https://example.com/x', { method: 'POST', body: '{}' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('http');
    expect(err.status).toBe(500);
    expect(err.message).toBe('Error in workflow');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('GET defaults to retries: 2 — recovers from two 500s', async () => {
    instant();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(res(500, ''))
      .mockResolvedValueOnce(res(500, ''))
      .mockResolvedValueOnce(res(200, '{"ok":true}'));
    await expect(apiJson('https://example.com/x')).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('explicit retries on a POST is honoured', async () => {
    instant();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(res(500, ''))
      .mockResolvedValueOnce(res(200, '{"ok":true}'));
    await expect(apiJson('https://example.com/x', { method: 'POST', retries: 1 })).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('403 with a plain-text body → code forbidden', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(403, 'Authorization data is wrong!'));
    const err = await apiJson('https://example.com/x').catch((e) => e);
    expect(err.code).toBe('forbidden');
    expect(err.status).toBe(403);
    expect(err.message).toBe("This app version can't reach the server. Reload and try again.");
  });

  test('non-2xx with JSON error field uses it as the message', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(400, '{"success":false,"error":"weekDateRange and matches[] required"}'));
    const err = await apiJson('https://example.com/x').catch((e) => e);
    expect(err.code).toBe('http');
    expect(err.message).toBe('weekDateRange and matches[] required');
    expect(err.body).toEqual({ success: false, error: 'weekDateRange and matches[] required' });
  });

  test('non-2xx with an unparsable body falls back to the status', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(502, '<html>bad gateway</html>', { statusText: 'Bad Gateway' }));
    const err = await apiJson('https://example.com/x', { retries: 0 }).catch((e) => e);
    expect(err.code).toBe('http');
    expect(err.message).toBe('HTTP 502 Bad Gateway');
  });

  test('2xx with an empty body → code empty', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(200, ''));
    const err = await apiJson('https://example.com/x').catch((e) => e);
    expect(err.code).toBe('empty');
  });

  test('2xx with an unparsable body → code invalid_json', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(200, 'Workflow was started'));
    const err = await apiJson('https://example.com/x').catch((e) => e);
    expect(err.code).toBe('invalid_json');
    expect(err.body).toBe('Workflow was started');
  });

  test('2xx with success:false is returned, not thrown', async () => {
    global.fetch = jest.fn().mockResolvedValue(res(200, '{"success":false,"error":"no_audio"}'));
    await expect(apiJson('https://example.com/x', { method: 'POST' })).resolves.toEqual({ success: false, error: 'no_audio' });
  });

  test('network failure after retries → code network', async () => {
    instant();
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await apiJson('https://example.com/x', { retries: 1 }).catch((e) => e);
    expect(err.code).toBe('network');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('timeout → code timeout', async () => {
    global.fetch = jest.fn().mockImplementation((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const err = await apiJson('https://example.com/x', { timeout: 20, retries: 0 }).catch((e) => e);
    expect(err.code).toBe('timeout');
  });

  test('caller abort rethrows the AbortError untouched', async () => {
    const controller = new AbortController();
    global.fetch = jest.fn().mockImplementation((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const p = apiJson('https://example.com/x', { signal: controller.signal, retries: 0 });
    controller.abort();
    const err = await p.catch((e) => e);
    expect(err.name).toBe('AbortError');
    expect(err).not.toBeInstanceOf(ApiError);
  });

  test('response.text() rejecting (connection dropped mid-body) → code network', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: '',
      text: () => Promise.reject(new TypeError('network error')),
    });
    const err = await apiJson('https://example.com/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('network');
  });

  test('a non-network throw from fetch propagates unchanged, not wrapped as ApiError', async () => {
    global.fetch = jest.fn().mockRejectedValue(new RangeError('bad'));
    const err = await apiJson('https://example.com/x', { retries: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(RangeError);
    expect(err).not.toBeInstanceOf(ApiError);
    expect(err.message).toBe('bad');
  });
});

describe('userMessage', () => {
  test('returns the ApiError message for a network-coded error', () => {
    const err = new ApiError('network', 'Network error — check your connection');
    expect(userMessage(err, 'fallback')).toBe('Network error — check your connection');
  });

  test('returns the fallback for an http-coded ApiError', () => {
    const err = new ApiError('http', 'Error in workflow');
    expect(userMessage(err, 'fallback')).toBe('fallback');
  });
});

// showApiError renders a toast; keep it untested here (react-hot-toast needs a
// DOM host) — the FeedbackContext test in Task 5 covers the user-facing branch.
// This smoke test just confirms it doesn't throw when called directly.
describe('showApiError', () => {
  test('does not throw for an ApiError or a generic error', () => {
    expect(() => showApiError(new ApiError('http', 'boom'))).not.toThrow();
    expect(() => showApiError(new Error('generic failure'))).not.toThrow();
  });
});

describe('ENDPOINTS — per-tap selection', () => {
  test('selectionCheck endpoint is defined', () => {
    expect(ENDPOINTS.selectionCheck).toMatch(/\/selection_check$/);
  });

  test('selectionUncheck endpoint is defined', () => {
    expect(ENDPOINTS.selectionUncheck).toMatch(/\/selection_uncheck$/);
  });
});

describe('ENDPOINTS — weekly meal ingredients', () => {
  test('fetchWeeklyMealIngredients endpoint is defined', () => {
    expect(ENDPOINTS.fetchWeeklyMealIngredients).toMatch(/\/fetch_weekly_meal_ingredients$/);
  });
});

describe('apiJson → reportError', () => {
  beforeEach(() => { reportError.mockClear(); });
  const url = 'https://n8n.test/webhook/fetch_grocery_items?weekStartDate=2026-09-06';

  test('http 500 after retries reports kind api with endpoint and status', async () => {
    instant();
    global.fetch = jest.fn().mockResolvedValue(res(500, '{"success":false,"error":"Workflow error"}'));
    await expect(apiJson(url)).rejects.toMatchObject({ code: 'http', status: 500 });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toMatchObject({ kind: 'api', endpoint: 'fetch_grocery_items', status: 500 });
    expect(reportError.mock.calls[0][0].error.message).toBe('Workflow error');
  });
  test('503 reports; 403, 404 and a timeout do not', async () => {
    instant();
    global.fetch = jest.fn().mockResolvedValue(res(503, '{"success":false,"error":"Database unavailable"}'));
    await expect(apiJson(url, { method: 'POST' })).rejects.toMatchObject({ code: 'http', status: 503 });
    expect(reportError).toHaveBeenCalledTimes(1);
    reportError.mockClear();
    global.fetch = jest.fn().mockResolvedValue(res(403, 'Forbidden'));
    await expect(apiJson(url)).rejects.toMatchObject({ code: 'forbidden' });
    global.fetch = jest.fn().mockResolvedValue(res(404, '{"error":"nope"}'));
    await expect(apiJson(url)).rejects.toMatchObject({ code: 'http', status: 404 });
    global.fetch = jest.fn().mockImplementation((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    await expect(apiJson(url, { timeout: 20, retries: 0 })).rejects.toMatchObject({ code: 'timeout' });
    expect(reportError).not.toHaveBeenCalled();
  });
  test('empty, invalid_json and network report', async () => {
    instant();
    global.fetch = jest.fn().mockResolvedValue(res(200, '   '));
    await expect(apiJson(url, { retries: 0 })).rejects.toMatchObject({ code: 'empty' });
    global.fetch = jest.fn().mockResolvedValue(res(200, '<html>'));
    await expect(apiJson(url, { retries: 0 })).rejects.toMatchObject({ code: 'invalid_json' });
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiJson(url, { retries: 0 })).rejects.toMatchObject({ code: 'network' });
    expect(reportError.mock.calls.map((c) => c[0].error.code)).toEqual(['empty', 'invalid_json', 'network']);
    expect(reportError.mock.calls.every((c) => c[0].endpoint === 'fetch_grocery_items')).toBe(true);
  });
  test('ENDPOINTS.clientErrors is defined', () => {
    expect(ENDPOINTS.clientErrors).toMatch(/\/client_errors$/);
  });
});
