import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { installMockFetch, restoreFetch } from '../../test-utils/mockFetch';
import { HebSignInPanel } from './HebSignInPanel';

const LOGIN_URL = 'https://heb-login.needexcelexpert.com';
afterEach(() => restoreFetch());

const renderPanel = (props) => render(
  <HebSignInPanel state="signedOut" health={null} onRecheck={jest.fn()} {...props} />
);

describe('HebSignInPanel visibility', () => {
  test('renders nothing while checking', () => {
    const { container } = renderPanel({ state: 'checking' });
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when ready', () => {
    const { container } = renderPanel({ state: 'ready' });
    expect(container).toBeEmptyDOMElement();
  });

  test('signedOut shows the sign-in heading', () => {
    renderPanel({ state: 'signedOut' });
    expect(screen.getByText('HEB sign-in needed')).toBeInTheDocument();
  });

  test('unreachable talks about the server, not about signing in', () => {
    renderPanel({ state: 'unreachable' });
    expect(screen.queryByText('HEB sign-in needed')).not.toBeInTheDocument();
    expect(screen.getByText(/clip server/i)).toBeInTheDocument();
  });
});

describe('HebSignInPanel remedies', () => {
  test('signedOut links to the phone login tunnel', () => {
    renderPanel({ state: 'signedOut' });
    expect(screen.getByRole('link', { name: /sign in to h-?e-?b/i })).toHaveAttribute('href', LOGIN_URL);
  });

  test('no longer tells the user to run a desktop command', () => {
    renderPanel({ state: 'signedOut' });
    expect(screen.queryByText(/scrape:login/)).not.toBeInTheDocument();
  });

  test('wrongStore names both the bound store and the expected one', () => {
    renderPanel({ state: 'wrongStore', health: { storeId: '809', storeExpected: '794' } });
    expect(screen.getByText(/809/)).toBeInTheDocument();
    expect(screen.getByText(/794/)).toBeInTheDocument();
  });

  test('wrongStore reports an observation rather than ordering a switch', () => {
    // The only signal is a transient, non-authoritative cookie, and it has
    // already produced one false positive. It must not read as a verdict, and
    // it must not claim clipping is blocked (it is not — see Tasks 9/10).
    renderPanel({ state: 'wrongStore', health: { storeId: '809', storeExpected: '794' } });
    expect(screen.queryByText(/blocked|unavailable|can.t clip/i)).not.toBeInTheDocument();
    expect(screen.getByText(/last store selection/i)).toBeInTheDocument();
  });

  test('expiring is advisory and offers no import button', () => {
    renderPanel({ state: 'expiring', health: { authExpiresAt: new Date(Date.now() + 3600000).toISOString() } });
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument();
  });
});

describe('HebSignInPanel import flow', () => {
  // The poll runs through the injected `onRecheck`, so no health route is
  // mocked here: the only HTTP call the panel makes itself is the webhook.
  test('tapping import posts to the webhook then rechecks', async () => {
    const mock = installMockFetch({
      'heb_session_import': { started: true, alreadyRunning: false },
    });
    const onRecheck = jest.fn().mockResolvedValue('ready');

    renderPanel({ state: 'signedOut', onRecheck });
    fireEvent.click(screen.getByRole('button', { name: /I've signed in/i }));

    await waitFor(() => expect(mock.for('heb_session_import')).toHaveLength(1));
    await waitFor(() => expect(onRecheck).toHaveBeenCalled());
  });

  test('the import button is disabled while an import is in flight', async () => {
    installMockFetch({
      'heb_session_import': { started: true, alreadyRunning: false },
    });
    // Still signed out: the webhook answered, the import has not landed yet,
    // so the hook is mid-poll and must keep the button unavailable.
    const onRecheck = jest.fn().mockResolvedValue('signedOut');

    renderPanel({ state: 'signedOut', onRecheck });
    const button = screen.getByRole('button', { name: /I've signed in/i });
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
  });

  test('publishes its result under StrictMode, where effects mount twice', async () => {
    // src/index.js wraps the app in <React.StrictMode>, so React runs the
    // hook's effect, tears it down, and runs it again. A `mounted` ref that is
    // only ever set false on cleanup is already false when the import
    // resolves, and the hook silently finishes without publishing anything:
    // recheck is never called and the button never re-enables.
    installMockFetch({
      'heb_session_import': { started: true, alreadyRunning: false },
    });
    const onRecheck = jest.fn().mockResolvedValue('ready');

    render(
      <React.StrictMode>
        <HebSignInPanel state="signedOut" health={null} onRecheck={onRecheck} />
      </React.StrictMode>
    );
    const button = screen.getByRole('button', { name: /I've signed in/i });
    fireEvent.click(button);

    await waitFor(() => expect(onRecheck).toHaveBeenCalled());
    await waitFor(() => expect(button).toBeEnabled());
  });

  test('a 4xx shows the wait-and-retry message, not a raw error code', async () => {
    installMockFetch({
      'heb_session_import': { status: 400, body: { success: false, error: 'Chrome profile has HEB cookies but does NOT look logged in' } },
    });

    renderPanel({ state: 'signedOut', onRecheck: jest.fn().mockResolvedValue('signedOut') });
    fireEvent.click(screen.getByRole('button', { name: /I've signed in/i }));

    expect(await screen.findByText(/few seconds/i)).toBeInTheDocument();
    expect(screen.queryByText(/HTTP 400/)).not.toBeInTheDocument();
  });
});
