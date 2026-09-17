import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { healthySessionHealth, expiredSessionHealth } from '../test-utils/cartFixtures';
import HebCart from './HebCart';

const healthy = { active: false, loginSessionValid: true, idleSeconds: 0 };
// BATCH_SIZE is 10 (HebCart.js ~793) — 11 items forces phase 1 into two
// smart_match_grocery batches.
const weekly = {
  items: Array.from({ length: 11 }, (_, i) => ({ ItemID: i + 1, ItemName: `Item ${i + 1}` })),
};

afterEach(restoreFetch);

test('a signed-out shared state shows the panel; a successful import re-checks health and reveals Connect', async () => {
  // The sign-in verdict now comes from /api/health, not from the clip
  // server's own loginSessionValid opinion — which stays true throughout.
  let health = expiredSessionHealth;
  const mock = installMockFetch({
    '/api/health': () => health,
    '/heb_session_import': { started: true },
    '/api/heb/session/status': healthy,
    '/api/heb/weekly-items': weekly,
    '/api/heb/matches/all': { matches: [] },
  });
  renderWithProviders(<HebCart onNavigate={() => {}} />);
  expect(await screen.findByText('HEB sign-in needed')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Connect to HEB/ })).toBeNull();

  health = healthySessionHealth;
  fireEvent.click(screen.getByRole('button', { name: /I've signed in/i }));
  expect(await screen.findByRole('button', { name: /Connect to HEB/ })).toBeInTheDocument();
  expect(mock.for('/heb_session_import')).toHaveLength(1);
  expect(mock.for('/api/health').length).toBeGreaterThanOrEqual(2);
  expect(mock.unmocked()).toEqual([]);
});

test('smart match continues after one failed batch', async () => {
  let smartCalls = 0;
  const mock = installMockFetch({
    '/api/health': healthySessionHealth,
    '/api/heb/session/status': { active: true, loginSessionValid: true, idleSeconds: 0, sessionId: 's' },
    '/api/heb/weekly-items': weekly,
    '/api/heb/matches/all': { matches: [] },
    '/api/heb/frequent-cached': { products: [{ id: '9', name: 'Bread loaf', skuId: 'sku', price: 2 }] },
    '/smart_match_grocery': () => { smartCalls += 1; return smartCalls === 1 ? { status: 500, body: { success: false, error: 'Workflow error' } } : [{ matches: [] }]; },
    '/api/heb/search-batch': { results: {} },
    '/api/heb/matches': { success: true },
  });
  renderWithProviders(<HebCart onNavigate={() => {}} />);
  // sessionStatus.active === true auto-advances to the "Match & Review" step
  // and pre-loads weekly items (HebCart.js ~1200-1210); the smart-match
  // button only renders once groceryItems.length > 0 (~1302), labeled
  // "Run Smart Match" while matchStats.matched === 0 (~1338).
  await screen.findByText('Item 1');
  fireEvent.click(screen.getByRole('button', { name: 'Run Smart Match' }));
  await waitFor(() => expect(mock.for('/smart_match_grocery').length).toBeGreaterThanOrEqual(2), { timeout: 10000 });
  expect(mock.unmocked()).toEqual([]);
});

test('Cart shows the shared sign-in panel and no longer names a desktop command', async () => {
  installMockFetch({
    '/api/health': expiredSessionHealth,
    '/api/heb/session/status': healthy,
    '/api/heb/weekly-items': weekly,
    '/api/heb/matches/all': { matches: [] },
  });
  renderWithProviders(<HebCart onNavigate={() => {}} />);
  expect(await screen.findByTestId('heb-session-panel')).toBeInTheDocument();
  // The remedy is now a link a phone can follow, not a command line.
  expect(screen.getByRole('link', { name: /sign in to h-?e-?b/i })).toBeInTheDocument();
  expect(screen.queryByText(/scrape:login/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show technical details' })).toBeNull();
});

test('CRITICAL: a stale browser session cannot auto-advance past the sign-in remedy', async () => {
  // The clip server reports a live browser session, but HEB has already
  // rejected its cookies. Auto-advancing to review would hide the only thing
  // that can fix it.
  installMockFetch({
    '/api/health': expiredSessionHealth,
    '/api/heb/session/status': { active: true, loginSessionValid: true, idleSeconds: 3, sessionId: 's' },
    '/api/heb/weekly-items': weekly,
    '/api/heb/matches/all': { matches: [] },
  });
  renderWithProviders(<HebCart onNavigate={() => {}} />);
  expect(await screen.findByTestId('heb-session-panel')).toBeInTheDocument();
  expect(screen.queryByText('Item 1')).toBeNull();
});
