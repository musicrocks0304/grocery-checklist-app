# Project Hardening Design

**Date:** 2026-03-03
**Approach:** Layer-by-Layer (Deployment Security -> Resilience -> Tests)

## Context

The grocery-checklist-app has solid fundamentals (proper input encoding, no XSS vectors, no hardcoded secrets in git) but lacks deployment-level security headers, API resilience, and test coverage.

## Layer 1: Deployment Security

### netlify.toml

Create `netlify.toml` with:

- **Security headers** on all routes (`[[headers]]` block for `/*`):
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; connect-src 'self' https://n8n-grocery.needexcelexpert.com https://clip.needexcelexpert.com; font-src 'self';`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **SPA redirect**: `/* /index.html 200`

### Source Maps

- Set `GENERATE_SOURCEMAP=false` in `[build.environment]` section of netlify.toml
- No impact on local development

## Layer 2: Resilience & Error Recovery

### Enhanced apiFetch (src/config/api.js)

- **Retry with exponential backoff**: 3 retries, 1s/2s/4s delays for 5xx and network errors
- **Configurable timeout**: AbortController with 30s default
- **Non-retryable**: 4xx errors fail immediately
- **Structured error objects**: callers can show specific messages

### Enhanced Toast Notifications

- **Transient failures** (network/timeout): auto-retry with "Retrying..." toast, escalate to error toast with "Tap to retry" on final failure
- **Server errors** (500): "Server error - tap to retry" toast
- **Auth errors** (401/403): "Session expired" toast (no retry)

### Graceful Degradation

- Grocery list and meal data: fall back to localStorage cache when API unreachable
- Subtle "offline" banner when consecutive API calls fail

## Layer 3: Critical Path Tests

### Test Files (~10-15 tests)

1. **`src/config/api.test.js`** - apiFetch wrapper:
   - Adds API key header when present
   - Retries on 500 errors with backoff
   - Does not retry on 400 errors
   - Times out after configured duration
   - Falls back on network failure

2. **`src/utils/weekDates.test.js`** - Week date calculations:
   - Correct week range for current date
   - Week boundaries (Sunday/Saturday)
   - Format consistency

3. **`src/components/App.test.js`** - Basic rendering/routing:
   - Renders without crashing
   - Hash navigation switches screens
   - Default screen loads

4. **`src/components/GroceryChecklist.test.js`** - Core data flow:
   - Renders grocery items from mock API response
   - Handles empty grocery list
   - Error state displays correctly

### Tooling

- Jest + React Testing Library (already in dependencies)
- Mock `fetch` globally for API tests
