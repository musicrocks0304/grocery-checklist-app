import React from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import toast from 'react-hot-toast';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { deferNextFetch } from '../test-utils/deferredFetch';
import { cartFetchMap } from '../test-utils/cartFixtures';
import FakeEventSource from '../test-utils/FakeEventSource';
import HebCart from './HebCart';

jest.mock('react-hot-toast', () => {
  const fn = jest.fn();
  fn.success = jest.fn();
  fn.error = jest.fn();
  fn.loading = jest.fn();
  return { __esModule: true, default: fn, toast: fn };
});
const originalEventSource = global.EventSource;
const flush = () => act(async () => { await Promise.resolve(); });
const advance = (ms) => act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); });
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  FakeEventSource.instances = [];
  global.EventSource = FakeEventSource;
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  restoreFetch();
  global.EventSource = originalEventSource;
  jest.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});
async function mountCart(overrides = {}) {
  const mock = installMockFetch(cartFetchMap(overrides));
  const view = renderWithProviders(<HebCart onNavigate={() => {}} />);
  await flush();
  expect(screen.getByRole('button', { name: 'Build HEB Cart (3)' })).toBeInTheDocument();
  return { mock, view };
}
async function startBuild() {
  fireEvent.click(screen.getByRole('button', { name: /Build HEB Cart/ }));
  await flush();
  expect(FakeEventSource.instances).toHaveLength(1);
  return FakeEventSource.instances[0];
}
const expectedItems = [
  { groceryItemId: 23, groceryItemName: 'Bread', productUrl: 'https://www.heb.com/product-23',
    hebProductId: 'product-23', hebSkuId: 'sku-bread', quantity: 2 },
  { groceryItemId: 31, groceryItemName: 'Milk', productUrl: 'https://www.heb.com/product-31',
    hebProductId: 'product-31', hebSkuId: null, quantity: 1 },
];

test('build snapshots eligible groceries before awaiting verification and retains payload defaults', async () => {
  const { mock } = await mountCart();
  const verification = deferNextFetch('/api/heb/session/status');
  fireEvent.click(screen.getByRole('button', { name: 'Build HEB Cart (3)' }));
  // Rice becomes confirmed while verification is outstanding. Salt is already
  // confirmed but lacks a URL; neither belonged to the captured eligible list.
  fireEvent.click(screen.getByTitle('Accept match'));
  await flush();
  expect(screen.getByRole('button', { name: 'Build HEB Cart (4)' })).toBeInTheDocument();
  expect(mock.for('/api/heb/build-cart')).toHaveLength(0);
  verification.release();
  await flush();
  expect(mock.for('/api/heb/build-cart')[0].body).toEqual({ items: expectedItems });
  expect(mock.for('/api/heb/build-cart')[0].method).toBe('POST');
  const calls = mock.calls();
  const buildIndex = calls.findIndex((call) => call.url.includes('/api/heb/build-cart'));
  const verificationIndex = calls.map((call) => call.url.includes('/api/heb/session/status')).lastIndexOf(true);
  expect(verificationIndex).toBeLessThan(buildIndex);
  expect(FakeEventSource.instances[0].url).toMatch(/\/api\/heb\/build-progress\/job-1$/);
  expect(mock.unmocked()).toEqual([]);
});

test('progress replaces strict indexes in arrival order; complete closes and shows the summary', async () => {
  const { view } = await mountCart();
  const source = await startBuild();
  act(() => {
    source.message({ type: 'progress', index: 2, status: 'adding', groceryItemName: 'row: first' });
    source.message({ type: 'progress', index: 0, status: 'added', groceryItemName: 'row: second' });
    source.message({ type: 'progress', index: 2, status: 'failed', groceryItemName: 'row: replaced', message: 'unavailable' });
    source.message({ type: 'progress', index: '2', status: 'skipped', groceryItemName: 'row: string index' });
  });
  expect(screen.getAllByText(/^row:/).map((element) => element.textContent)).toEqual([
    'row: replaced', 'row: second', 'row: string index',
  ]);
  expect(screen.queryByText('row: first')).not.toBeInTheDocument();
  expect(source.close).not.toHaveBeenCalled();
  act(() => source.message({ type: 'complete', summary: {
    added: 1, failed: 1, skipped: 0, cart: { total: 4.5 },
  } }));
  expect(screen.getByRole('heading', { name: 'Cart Built!' })).toBeInTheDocument();
  expect(screen.getByText('1 items added, $4.50 estimated total')).toBeInTheDocument();
  expect(source.close).toHaveBeenCalledTimes(1);
  expect(toast.success).toHaveBeenCalledWith('Cart built! 1 items added.');
  view.unmount();
  expect(source.close).toHaveBeenCalledTimes(2); // stored ref is not cleared on complete
});

test('a server error closes its stream while the screen remains in build', async () => {
  await mountCart();
  const source = await startBuild();
  act(() => source.message({ type: 'error', message: 'worker stopped' }));
  expect(source.close).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'Building Your HEB Cart...' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Match & Review' })).not.toBeInTheDocument();
  expect(toast.error).toHaveBeenCalledWith('Build error: worker stopped');
});

test('five consecutive transport errors return to review and open resets the counter', async () => {
  await mountCart();
  const source = await startBuild();
  act(() => { for (let index = 0; index < 4; index += 1) source.error(); });
  expect(source.close).not.toHaveBeenCalled();
  act(() => source.open());
  act(() => { for (let index = 0; index < 4; index += 1) source.error(); });
  expect(source.close).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Building Your HEB Cart...' })).toBeInTheDocument();
  act(() => source.error());
  expect(source.close).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'Match & Review' })).toBeInTheDocument();
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Lost connection to the build stream'));
});

test('malformed event JSON logs without closing or changing the build step', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  await mountCart();
  const source = await startBuild();
  act(() => source.raw('{broken'));
  expect(log).toHaveBeenCalledWith('[heb-cart] SSE parse error:', expect.any(Error));
  expect(source.close).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Building Your HEB Cart...' })).toBeInTheDocument();
  act(() => source.message({ type: 'progress', index: 0, status: 'adding', groceryItemName: 'still processing' }));
  expect(screen.getByText('still processing')).toBeInTheDocument();
});

test.each(['http', 'network'])('build-start failure returns to review: %s', async (failure) => {
  await mountCart({ '/api/heb/build-cart': { status: 503, body: { message: 'build unavailable' } } });
  const build = failure === 'network' ? deferNextFetch('/api/heb/build-cart') : null;
  fireEvent.click(screen.getByRole('button', { name: 'Build HEB Cart (3)' }));
  await flush();
  if (build) { build.reject(new TypeError('offline')); await flush(); }
  expect(screen.getByRole('heading', { name: 'Match & Review' })).toBeInTheDocument();
  expect(FakeEventSource.instances).toHaveLength(0);
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to start build:'));
});

test('session polling spans build and screen unmount closes the current stream', async () => {
  const { mock, view } = await mountCart();
  const source = await startBuild();
  expect(mock.for('/api/heb/session/status')).toHaveLength(2); // mount + build verification
  await advance(30000);
  expect(mock.for('/api/heb/session/status')).toHaveLength(3);
  expect(FakeEventSource.instances).toHaveLength(1);
  expect(source.close).not.toHaveBeenCalled();
  view.unmount();
  expect(source.close).toHaveBeenCalledTimes(1);
  await advance(30000);
  expect(mock.for('/api/heb/session/status')).toHaveLength(3);
});

test('late build-start resolution retains the existing lack of request cancellation', async () => {
  const { view } = await mountCart();
  const build = deferNextFetch('/api/heb/build-cart');
  fireEvent.click(screen.getByRole('button', { name: 'Build HEB Cart (3)' }));
  await flush();
  expect(FakeEventSource.instances).toHaveLength(0);
  view.unmount();
  build.release();
  await flush();
  expect(FakeEventSource.instances).toHaveLength(1);
  expect(FakeEventSource.instances[0].close).not.toHaveBeenCalled();
  // A fake has no socket. Dispose it explicitly after observing the baseline.
  FakeEventSource.instances[0].close();
});
