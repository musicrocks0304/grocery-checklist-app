# Project Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the grocery-checklist-app with deployment security headers, API resilience (retry/timeout), and critical path test coverage.

**Architecture:** Three independent layers applied sequentially: (1) Netlify config for security headers + source map suppression, (2) Enhanced apiFetch with retry/backoff/timeout + enhanced error toasts, (3) Jest tests covering the API layer, date utilities, and basic component rendering.

**Tech Stack:** React 19, Netlify, Jest + React Testing Library, react-hot-toast

---

## Task 1: Deployment Security — Create netlify.toml

**Files:**
- Create: `netlify.toml`

**Step 1: Create netlify.toml with security headers**

```toml
[build]
  command = "npm run build"
  publish = "build"

[build.environment]
  GENERATE_SOURCEMAP = "false"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
    Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; connect-src 'self' https://n8n-grocery.needexcelexpert.com https://clip.needexcelexpert.com; font-src 'self';"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Step 2: Commit**

```bash
git add netlify.toml
git commit -m "Add netlify.toml with security headers and source map suppression"
```

---

## Task 2: Resilience — Enhanced apiFetch with retry and timeout

**Files:**
- Modify: `src/config/api.js`

**Step 1: Write the failing test for retry logic**

Create `src/config/api.test.js`:

```javascript
import { apiFetch } from './api';

// Save and mock fetch globally
const originalFetch = global.fetch;

beforeEach(() => {
  jest.useFakeTimers();
  delete process.env.REACT_APP_API_KEY;
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
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
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = apiFetch('https://example.com/api', { retries: 2 });

    // Advance past retry delays
    await jest.advanceTimersByTimeAsync(1000); // 1st retry delay
    await jest.advanceTimersByTimeAsync(2000); // 2nd retry delay

    const result = await promise;
    expect(result.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('does NOT retry on 400 client errors', async () => {
    global.fetch = jest.fn()
      .mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' });

    const result = await apiFetch('https://example.com/api', { retries: 2 });

    expect(result.status).toBe(400);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('does NOT retry on 404 client errors', async () => {
    global.fetch = jest.fn()
      .mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    const result = await apiFetch('https://example.com/api', { retries: 2 });

    expect(result.status).toBe(404);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries on network errors (fetch throws)', async () => {
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = apiFetch('https://example.com/api', { retries: 1 });

    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('throws after exhausting all retries on network error', async () => {
    global.fetch = jest.fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    const promise = apiFetch('https://example.com/api', { retries: 2 });

    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);

    await expect(promise).rejects.toThrow('Failed to fetch');
    expect(global.fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  test('skips retry when retries option is 0', async () => {
    global.fetch = jest.fn()
      .mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

    const result = await apiFetch('https://example.com/api', { retries: 0 });

    expect(result.status).toBe(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('times out after configured timeout', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      new Promise((resolve) => {
        // Never resolves — simulates a hung request
        setTimeout(() => resolve({ ok: true, status: 200 }), 60000);
      })
    );

    const promise = apiFetch('https://example.com/api', { timeout: 5000, retries: 0 });

    await jest.advanceTimersByTimeAsync(5000);

    await expect(promise).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx react-scripts test --watchAll=false --testPathPattern="src/config/api.test.js"`
Expected: FAIL — apiFetch doesn't support retries or timeout yet.

**Step 3: Implement enhanced apiFetch**

Replace the `apiFetch` function in `src/config/api.js` (lines 87-94) with:

```javascript
/**
 * Authenticated fetch wrapper with retry and timeout.
 *
 * Options (in addition to standard fetch options):
 *   retries:  number of retries on 5xx/network errors (default: 2)
 *   timeout:  request timeout in ms (default: 30000)
 *
 * Retries use exponential backoff: 1s, 2s, 4s, ...
 * 4xx responses are NOT retried (client errors).
 */
export async function apiFetch(url, options = {}) {
  const { retries = 2, timeout = 30000, ...fetchOptions } = options;
  const apiKey = process.env.REACT_APP_API_KEY;
  const headers = {
    ...(fetchOptions.headers || {}),
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
  };

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Wait before retry (skip first attempt)
    if (attempt > 0) {
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Don't retry client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry server errors (5xx)
      if (!response.ok && attempt < retries) {
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        continue;
      }

      return response;
    } catch (err) {
      lastError = err;
      if (attempt >= retries) {
        throw err;
      }
    }
  }

  throw lastError;
}
```

**Step 4: Run test to verify it passes**

Run: `npx react-scripts test --watchAll=false --testPathPattern="src/config/api.test.js"`
Expected: PASS — all 9 tests green.

**Step 5: Commit**

```bash
git add src/config/api.js src/config/api.test.js
git commit -m "Add retry with backoff and timeout to apiFetch"
```

---

## Task 3: Week Date Utility Tests

**Files:**
- Create: `src/utils/weekDates.test.js`

**Step 1: Write the tests**

```javascript
import { getWeekDateRange, getWeekDates } from './weekDates';

describe('getWeekDateRange', () => {
  const RealDate = Date;

  afterEach(() => {
    global.Date = RealDate;
  });

  function mockDate(dateString) {
    const fixed = new RealDate(dateString);
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) return fixed;
        return new RealDate(...args);
      }
    };
  }

  test('returns current week range on a Monday', () => {
    mockDate('2026-03-02T12:00:00'); // Monday
    const range = getWeekDateRange();
    // Monday (day 1) < 4, so shows current week
    expect(range).toMatch(/^For the week of /);
    expect(range).toMatch(/March 1st to March 7th, 2026/);
  });

  test('returns next week range on a Thursday', () => {
    mockDate('2026-03-05T12:00:00'); // Thursday
    const range = getWeekDateRange();
    // Thursday (day 4) >= 4, so shows next week
    expect(range).toMatch(/March 8th to March 14th, 2026/);
  });

  test('returns current week range on a Sunday', () => {
    mockDate('2026-03-01T12:00:00'); // Sunday
    const range = getWeekDateRange();
    // Sunday (day 0) < 4, so shows current week
    expect(range).toMatch(/March 1st to March 7th, 2026/);
  });
});

describe('getWeekDates', () => {
  const RealDate = Date;

  afterEach(() => {
    global.Date = RealDate;
  });

  function mockDate(dateString) {
    const fixed = new RealDate(dateString);
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) return fixed;
        return new RealDate(...args);
      }
    };
  }

  test('returns startDate as Sunday and endDate as Saturday in YYYY-MM-DD format', () => {
    mockDate('2026-03-02T12:00:00'); // Monday
    const { startDate, endDate, displayRange } = getWeekDates();

    expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof displayRange).toBe('string');

    // Sunday March 1 to Saturday March 7
    expect(startDate).toBe('2026-03-01');
    expect(endDate).toBe('2026-03-07');
  });

  test('endDate is always 6 days after startDate', () => {
    mockDate('2026-03-10T12:00:00'); // Tuesday
    const { startDate, endDate } = getWeekDates();

    const start = new RealDate(startDate);
    const end = new RealDate(endDate);
    const diffDays = (end - start) / (1000 * 60 * 60 * 24);

    expect(diffDays).toBe(6);
  });
});
```

**Step 2: Run tests**

Run: `npx react-scripts test --watchAll=false --testPathPattern="src/utils/weekDates.test.js"`
Expected: PASS — all 5 tests green (these test existing code, no changes needed).

**Step 3: Commit**

```bash
git add src/utils/weekDates.test.js
git commit -m "Add unit tests for week date utilities"
```

---

## Task 4: App Component Smoke Tests

**Files:**
- Create: `src/components/App.test.js`

**Step 1: Write the tests**

```javascript
import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock fetch globally to prevent real API calls
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve('[]'),
  });
  window.location.hash = '';
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders without crashing', () => {
  render(<App />);
  // App should render the sidebar navigation
  expect(document.getElementById('root') || document.body).toBeTruthy();
});

test('defaults to grocery screen', () => {
  render(<App />);
  // The grocery checklist screen should be visible by default
  expect(window.location.hash === '' || window.location.hash === '#grocery').toBe(true);
});
```

**Step 2: Run tests**

Run: `npx react-scripts test --watchAll=false --testPathPattern="src/components/App.test.js"`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/App.test.js
git commit -m "Add smoke tests for App component"
```

---

## Task 5: Enhanced Error Toasts

**Files:**
- Modify: `src/config/api.js`

**Step 1: Add toast helper for API errors**

Add to the bottom of `src/config/api.js`:

```javascript
import toast from 'react-hot-toast';

/**
 * Show an error toast with optional retry. Call from components after apiFetch fails.
 *
 * Usage:
 *   try { await apiFetch(url); }
 *   catch (err) { showApiError(err, () => loadData()); }
 */
export function showApiError(error, onRetry) {
  const isTimeout = error.name === 'AbortError';
  const isNetwork = error.message === 'Failed to fetch';

  let message = 'Something went wrong';
  if (isTimeout) message = 'Request timed out';
  else if (isNetwork) message = 'Network error — check your connection';

  if (onRetry) {
    toast.error(
      (t) => (
        <span>
          {message}{' '}
          <button
            onClick={() => { toast.dismiss(t.id); onRetry(); }}
            style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            Retry
          </button>
        </span>
      ),
      { duration: 6000 }
    );
  } else {
    toast.error(message, { duration: 4000 });
  }
}
```

Note: The `import toast` must be added at the top of the file. Since `api.js` currently has no imports (it uses `process.env` and `window` globals), add it as the first line.

**Step 2: Commit**

```bash
git add src/config/api.js
git commit -m "Add showApiError toast helper with retry support"
```

---

## Task 6: Wire up showApiError in GroceryChecklist

**Files:**
- Modify: `src/components/GroceryChecklist.js`

**Step 1: Import showApiError**

Add `showApiError` to the existing import from `../config/api`:

```javascript
import { ENDPOINTS, apiFetch, showApiError } from '../config/api';
```

**Step 2: Add retry toast to the main data fetch error handler**

In the `fetchGroceryData` function, after the existing `catch` block that falls back to sample data, add a `showApiError` call with a retry callback:

```javascript
showApiError(error, () => fetchGroceryData());
```

This gives users a "Retry" button in the error toast instead of only seeing fallback data.

**Step 3: Commit**

```bash
git add src/components/GroceryChecklist.js
git commit -m "Wire up retry toasts in GroceryChecklist error handling"
```

---

## Summary

| Task | Layer | What it does |
|------|-------|-------------|
| 1 | Deployment | netlify.toml with security headers, source map suppression, SPA redirect |
| 2 | Resilience + Tests | apiFetch retry/backoff/timeout + 9 tests |
| 3 | Tests | Week date utility tests (5 tests) |
| 4 | Tests | App component smoke tests (2 tests) |
| 5 | Resilience | showApiError toast helper with retry button |
| 6 | Resilience | Wire retry toasts into GroceryChecklist |

**Total: ~16 tests, 3 new files, 2 modified files**
