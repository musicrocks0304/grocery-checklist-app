import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import HebCart from './HebCart';

const expired = { active: false, loginSessionValid: false };
const healthy = { active: false, loginSessionValid: true, idleSeconds: 0 };
// BATCH_SIZE is 10 (HebCart.js ~793) — 11 items forces phase 1 into two
// smart_match_grocery batches.
const weekly = {
  items: Array.from({ length: 11 }, (_, i) => ({ ItemID: i + 1, ItemName: `Item ${i + 1}` })),
};

afterEach(restoreFetch);

test('expired login shows the sign-in panel; Check again re-polls and a healthy answer shows Connect', async () => {
  let status = expired;
  const mock = installMockFetch({ '/api/heb/session/status': () => status, '/api/heb/weekly-items': weekly, '/api/heb/matches/all': { matches: [] } });
  renderWithProviders(<HebCart onNavigate={() => {}} />);
  expect(await screen.findByText('HEB sign-in needed')).toBeInTheDocument();
  status = healthy;
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  expect(await screen.findByRole('button', { name: /Connect to HEB/ })).toBeInTheDocument();
  expect(mock.for('/api/heb/session/status').length).toBeGreaterThanOrEqual(2);
  expect(mock.unmocked()).toEqual([]);
});

test('smart match continues after one failed batch', async () => {
  let smartCalls = 0;
  const mock = installMockFetch({
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
