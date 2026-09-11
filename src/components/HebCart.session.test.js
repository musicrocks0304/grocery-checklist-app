import React from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import toast from 'react-hot-toast';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { deferNextFetch } from '../test-utils/deferredFetch';
import { activeSession, idleSession, expiredSession, cartFetchMap } from '../test-utils/cartFixtures';
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
const renderCart = () => renderWithProviders(<HebCart onNavigate={() => {}} />);
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
  localStorage.clear();
  sessionStorage.clear();
});

test('unknown status stays neutral; HTTP and thrown checks resolve offline; recheck returns status', async () => {
  let statusReply = { status: 503, body: {} };
  const mock = installMockFetch(cartFetchMap({ '/api/heb/session/status': () => statusReply }));
  const first = deferNextFetch('/api/heb/session/status');
  renderCart();
  expect(screen.getByText('Checking connection…')).toBeInTheDocument();
  expect(screen.queryByText('HEB sign-in needed')).not.toBeInTheDocument();
  first.release();
  await flush();
  expect(screen.getByText('HEB sign-in needed')).toBeInTheDocument();
  const failedRecheck = deferNextFetch('/api/heb/session/status');
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled();
  failedRecheck.reject(new TypeError('offline'));
  await flush();
  expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  expect(toast).toHaveBeenCalledWith(expect.stringContaining('Still signed out'));
  statusReply = idleSession;
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  await flush();
  expect(screen.getByRole('button', { name: 'Connect to HEB' })).toBeInTheDocument();
  expect(toast.success).toHaveBeenCalledWith('Connected!');
  expect(mock.for('/api/heb/session/status')).toHaveLength(3);
});

test('connect sends headless true, preserves busy state and installs the synthetic active status', async () => {
  const mock = installMockFetch(cartFetchMap({ '/api/heb/session/status': idleSession }));
  renderCart();
  await flush();
  const start = deferNextFetch('/api/heb/session/start');
  fireEvent.click(screen.getByRole('button', { name: 'Connect to HEB' }));
  expect(screen.getByRole('button', { name: 'Launching browser...' })).toBeDisabled();
  expect(mock.for('/api/heb/session/start')[0].body).toEqual({ headless: true });
  start.release();
  await flush();
  expect(screen.getByText('Connected', { exact: true })).toBeInTheDocument();
  expect(screen.getByText('Bread', { exact: true })).toBeInTheDocument();
  // No extra status check was inserted after start; the result is synthetic.
  expect(mock.for('/api/heb/session/status')).toHaveLength(1);
});

test.each(['http', 'network'])('connect failure preserves connect controls: %s', async (failure) => {
  installMockFetch(cartFetchMap({
    '/api/heb/session/status': idleSession,
    '/api/heb/session/start': { status: 503, body: { message: 'start unavailable' } },
  }));
  renderCart();
  await flush();
  const start = failure === 'network' ? deferNextFetch('/api/heb/session/start') : null;
  fireEvent.click(screen.getByRole('button', { name: 'Connect to HEB' }));
  if (start) start.reject(new TypeError('offline'));
  await flush();
  expect(screen.getByRole('button', { name: 'Connect to HEB' })).toBeEnabled();
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Connection failed:'));
});

test('status polling continues in review at 30s and stops on screen unmount', async () => {
  let statusReply = activeSession;
  const mock = installMockFetch(cartFetchMap({ '/api/heb/session/status': () => statusReply }));
  const view = renderCart();
  await flush();
  expect(screen.getByText('Bread', { exact: true })).toBeInTheDocument();
  await advance(29999);
  expect(mock.for('/api/heb/session/status')).toHaveLength(1);
  statusReply = expiredSession;
  await advance(1);
  expect(mock.for('/api/heb/session/status')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  // Losing the session does not itself navigate away from review.
  expect(screen.getByText('Bread', { exact: true })).toBeInTheDocument();
  view.unmount();
  await advance(60000);
  expect(mock.for('/api/heb/session/status')).toHaveLength(2);
});

test.each(['active', 'inactive', 'http', 'network', 'start-http', 'start-network'])(
  'build consumes the existing ensure-session result: %s', async (outcome) => {
    let statusReply = activeSession;
    const mock = installMockFetch(cartFetchMap({
      '/api/heb/session/status': () => statusReply,
      '/api/heb/session/start': outcome === 'start-http'
        ? { status: 503, body: { message: 'cannot start' } } : { sessionId: 'new-session' },
    }));
    renderCart();
    await flush();
    // Give the parent an inactive status first so its existing active-session
    // auto-advance cannot immediately undo an ensure-failure connect transition.
    statusReply = expiredSession;
    await advance(30000);
    statusReply = outcome === 'active' ? activeSession
      : outcome === 'http' ? { status: 503, body: {} } : expiredSession;
    const failedStatus = outcome === 'network' ? deferNextFetch('/api/heb/session/status') : null;
    const failedStart = outcome === 'start-network' ? deferNextFetch('/api/heb/session/start') : null;
    fireEvent.click(screen.getByRole('button', { name: 'Build HEB Cart (3)' }));
    if (failedStatus) failedStatus.reject(new TypeError('offline'));
    await flush();
    if (failedStart) {
      failedStart.reject(new TypeError('offline'));
      await flush();
    }
    const failed = ['network', 'start-http', 'start-network'].includes(outcome);
    expect(mock.for('/api/heb/session/start')).toHaveLength(['active', 'network'].includes(outcome) ? 0 : 1);
    expect(mock.for('/api/heb/build-cart')).toHaveLength(failed ? 0 : 1);
    expect(screen.queryByText('HEB sign-in needed') !== null).toBe(failed);
    expect(screen.queryByRole('heading', { name: 'Building Your HEB Cart...' }) !== null).toBe(!failed);
    expect(FakeEventSource.instances).toHaveLength(failed ? 0 : 1);
    // An already-active verification does not publish its response in state;
    // a reconnect publishes the existing synthetic active status.
    expect(screen.queryByText('Connected', { exact: true }) !== null).toBe(!failed && outcome !== 'active');
  }
);
