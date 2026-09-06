import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import Deals from './Deals';

// Deal.id is never set by Deals.js (known latent bug — addingToList keys
// off `deal.id`, which is undefined), so tests use exactly one active deal.
const deal = (clipped) => ({ frequentProduct: { id: '1001', name: 'Pillsbury Crescent Rolls', brand: 'Pillsbury', category: 'Bakery & bread', price: 3.12 }, coupon: { hashId: 'h1', productName: 'Pillsbury Original Crescent Dinner Rolls', discount: '$1 off 2', savingsAmount: 1, expirationDate: '2099-01-01', clippedStatus: clipped, imageUrl: null }, confidence: 'high', reason: 'Same product' });
const coupons = [{ hash_id: 'h1', product_name: 'Pillsbury Original Crescent Dinner Rolls', description: 'Save', discount: '$1 off 2', savings_amount: 1, expiration_date: '2099-01-01', clipped_status: 0 }];

const base = () => ({
  '/smart_deals': [{ deals: [deal(0)], totalDeals: 1, totalSavings: 1 }],
  '/fetch_heb_coupons': coupons,
  '/fetch_grocery_items': [],
  '/api/health': { ok: true, sessionValid: false, sessionAuthenticated: false },
});

afterEach(restoreFetch);

test('renders deals and coupons and the expired banner', async () => {
  const mock = installMockFetch(base());
  renderWithProviders(<Deals onNavigate={() => {}} />);
  expect(await screen.findByText('Pillsbury Original Crescent Dinner Rolls')).toBeInTheDocument();
  expect(await screen.findByText('HEB session expired')).toBeInTheDocument();
  expect(mock.unmocked()).toEqual([]);
});

test('healthy session hides the banner', async () => {
  const mock = installMockFetch({ ...base(), '/api/health': { ok: true, sessionValid: true, sessionAuthenticated: true, sessionAgeHours: 1 } });
  renderWithProviders(<Deals onNavigate={() => {}} />);
  await screen.findByText('Pillsbury Original Crescent Dinner Rolls');
  expect(screen.queryByText('HEB session expired')).not.toBeInTheDocument();
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
