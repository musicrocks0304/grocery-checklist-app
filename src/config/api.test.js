import { apiFetch } from './api';

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

describe('ENDPOINTS — per-tap selection', () => {
  const { ENDPOINTS } = require('./api');

  test('selectionCheck endpoint is defined', () => {
    expect(ENDPOINTS.selectionCheck).toMatch(/\/selection_check$/);
  });

  test('selectionUncheck endpoint is defined', () => {
    expect(ENDPOINTS.selectionUncheck).toMatch(/\/selection_uncheck$/);
  });
});
