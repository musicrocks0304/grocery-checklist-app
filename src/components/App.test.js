import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Stub the heavier screens so the hash-routing tests assert on routing only
jest.mock('./Deals', () => () => <div>Deals screen</div>);
jest.mock('./Plan', () => () => <div>Plan screen</div>);

// Mock matchMedia for ThemeContext (not available in JSDOM)
beforeAll(() => {
  // JSDOM does not implement Element.scrollTo; the route handler calls it
  Object.defineProperty(Element.prototype, 'scrollTo', {
    writable: true,
    value: jest.fn(),
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

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

test('renders without crashing', async () => {
  render(<App />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('fetch_weekly_meals'),
    expect.anything()
  ));
  expect(screen.getByRole('main')).toBeInTheDocument();
});

test('defaults to home screen', async () => {
  render(<App />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('fetch_weekly_meals'),
    expect.anything()
  ));
  expect(window.location.hash === '' || window.location.hash === '#home').toBe(true);
});

// FB#54 — a hash typed/pasted into an already-open tab used to leave the app on
// Home because the popstate handler defaulted to home when history state was absent.
test('renders the screen for a hash changed while the app is open', async () => {
  render(<App />);
  window.location.hash = '#deals';
  expect(await screen.findByText('Deals screen')).toBeInTheDocument();
});

test('normalizes a legacy hash changed while the app is open', async () => {
  render(<App />);
  window.location.hash = '#grocery';
  expect(await screen.findByText('Plan screen')).toBeInTheDocument();
  expect(window.location.hash).toBe('#plan');
  expect(window.history.state).toEqual({ screen: 'plan' });
});

test('back/forward still restore the pushed history state', async () => {
  render(<App />);
  window.location.hash = '#deals';
  expect(await screen.findByText('Deals screen')).toBeInTheDocument();

  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: 'plan' } }));
  });
  expect(await screen.findByText('Plan screen')).toBeInTheDocument();
});
