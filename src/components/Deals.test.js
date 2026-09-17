import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import Deals from './Deals';

// Deal.id is never set by Deals.js (known latent bug — addingToList keys
// off `deal.id`, which is undefined), so tests use exactly one active deal.
const deal = (clipped) => ({ frequentProduct: { id: '1001', name: 'Pillsbury Crescent Rolls', brand: 'Pillsbury', category: 'Bakery & bread', price: 3.12 }, coupon: { hashId: 'h1', productName: 'Pillsbury Original Crescent Dinner Rolls', discount: '$1 off 2', savingsAmount: 1, expirationDate: '2099-01-01', clippedStatus: clipped, imageUrl: null }, confidence: 'high', reason: 'Same product' });
const coupons = [{ hash_id: 'h1', product_name: 'Pillsbury Original Crescent Dinner Rolls', description: 'Save', discount: '$1 off 2', savings_amount: 1, expiration_date: '2099-01-01', clipped_status: 0 }];

// NOTE: these two `/api/health` fixtures deliberately carry NO store fields.
// An older clip server omits them, and the live one reports `storeId: null`
// because HEB resolves the curbside store server-side. Both must still reach a
// healthy verdict, so do not "complete" these payloads.
const base = () => ({
  '/smart_deals': [{ deals: [deal(0)], totalDeals: 1, totalSavings: 1 }],
  '/fetch_heb_coupons': coupons,
  '/fetch_grocery_items': [],
  '/api/health': { ok: true, sessionValid: false, sessionAuthenticated: false },
});

afterEach(restoreFetch);

test('renders deals and coupons and the shared sign-in panel', async () => {
  const mock = installMockFetch(base());
  renderWithProviders(<Deals onNavigate={() => {}} />);
  expect(await screen.findByText('Pillsbury Original Crescent Dinner Rolls')).toBeInTheDocument();
  expect(await screen.findByTestId('heb-session-panel')).toBeInTheDocument();
  expect(mock.unmocked()).toEqual([]);
});

test('healthy session hides the panel', async () => {
  const mock = installMockFetch({ ...base(), '/api/health': { ok: true, sessionValid: true, sessionAuthenticated: true, sessionAgeHours: 1 } });
  renderWithProviders(<Deals onNavigate={() => {}} />);
  await screen.findByText('Pillsbury Original Crescent Dinner Rolls');
  // The panel is silent for both 'checking' and 'ready', so assert health was
  // actually consulted — the signed-out test above proves the same await point
  // is late enough for a verdict to have rendered.
  expect(mock.for('/api/health').length).toBeGreaterThanOrEqual(1);
  expect(screen.queryByTestId('heb-session-panel')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Select All Unclipped/i })).toBeEnabled();
  expect(mock.unmocked()).toEqual([]);
});

test('Add to list posts add_oneoff_item once and shows Added', async () => {
  const mock = installMockFetch({ ...base(), '/add_oneoff_item': { success: true, itemId: 5, message: 'ok' } });
  renderWithProviders(<Deals onNavigate={() => {}} />);
  await screen.findByText('Pillsbury Original Crescent Dinner Rolls');
  fireEvent.click(screen.getAllByRole('button', { name: /Add to list/ })[0]);
  expect(await screen.findByText('Added')).toBeInTheDocument();
  expect(mock.for('/add_oneoff_item')).toHaveLength(1);
  expect(mock.for('/add_oneoff_item')[0].body.itemName).toContain('Pillsbury');
  expect(mock.unmocked()).toEqual([]);
});

test('a 500 on add shows the error state', async () => {
  const mock = installMockFetch({ ...base(), '/add_oneoff_item': { status: 500, body: { success: false, error: 'Workflow error' } } });
  renderWithProviders(<Deals onNavigate={() => {}} />);
  await screen.findByText('Pillsbury Original Crescent Dinner Rolls');
  fireEvent.click(screen.getAllByRole('button', { name: /Add to list/ })[0]);
  expect(await screen.findByRole('button', { name: /Retry|Try again/ })).toBeInTheDocument();
  expect(mock.unmocked()).toEqual([]);
});

describe('Deals HEB session state', () => {
  test('a signed-out session shows the shared panel and blocks clipping', async () => {
    const mock = installMockFetch({ ...base(), '/api/health': { sessionAuthenticated: false, sessionReason: 'no_auth_cookies', storeId: null, storeSource: null, storeExpected: '794', authExpiresAt: null } });
    renderWithProviders(<Deals onNavigate={() => {}} />);
    await screen.findByText('Pillsbury Original Crescent Dinner Rolls');
    expect(await screen.findByTestId('heb-session-panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Select All Unclipped/i })).toBeNull();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(mock.unmocked()).toEqual([]);
  });

  test('never mentions Session Manager -- sub-project A deleted that component', async () => {
    installMockFetch({ ...base(), '/api/health': { sessionAuthenticated: false, storeId: null, storeExpected: '794', authExpiresAt: null } });
    renderWithProviders(<Deals onNavigate={() => {}} />);
    await screen.findByTestId('heb-session-panel');
    expect(screen.queryByText(/Session Manager/i)).not.toBeInTheDocument();
  });

  test('R14: a wrong store is reported but never blocks clipping', async () => {
    // The store signal is a transient, non-authoritative cookie that has
    // already produced one false positive. Disabling clipping on it would
    // strand a correctly configured user with no way to comply, so the panel
    // reports the observation and every clip control stays live.
    installMockFetch({ ...base(), '/api/health': { sessionAuthenticated: true, storeId: '809', storeSource: 'shopping', storeExpected: '794', authExpiresAt: null } });
    renderWithProviders(<Deals onNavigate={() => {}} />);
    await screen.findByText('Pillsbury Original Crescent Dinner Rolls');
    expect(await screen.findByTestId('heb-session-panel')).toHaveTextContent('809');

    expect(screen.getByRole('button', { name: /Select All Unclipped/i })).toBeEnabled();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(await screen.findByRole('button', { name: /Clip 1/ })).toBeEnabled();
  });

  test('an expiring session warns without blocking clipping', async () => {
    const soon = new Date(Date.now() + 3600 * 1000).toISOString();
    installMockFetch({ ...base(), '/api/health': { sessionAuthenticated: true, storeId: null, storeExpected: '794', authExpiresAt: soon } });
    renderWithProviders(<Deals onNavigate={() => {}} />);
    await screen.findByText('Pillsbury Original Crescent Dinner Rolls');
    // Scoped to the panel: the sort dropdown also offers "Expiring Soonest".
    expect(await screen.findByTestId('heb-session-panel')).toHaveTextContent(/expiring soon/i);
    expect(screen.getByRole('button', { name: /Select All Unclipped/i })).toBeEnabled();
    expect(screen.getByRole('checkbox')).toBeEnabled();
  });

  test('an unreachable clip server shows the panel and blocks clipping', async () => {
    installMockFetch({ ...base(), '/api/health': { status: 502, body: { error: 'down' } } });
    renderWithProviders(<Deals onNavigate={() => {}} />);
    await screen.findByText('Pillsbury Original Crescent Dinner Rolls');
    expect(await screen.findByTestId('heb-session-panel')).toHaveTextContent(/offline/i);
    expect(screen.queryByRole('button', { name: /Select All Unclipped/i })).toBeNull();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});
