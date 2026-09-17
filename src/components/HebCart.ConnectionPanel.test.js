import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConnectionPanel } from './HebCart';

describe('ConnectionPanel — browser-session controls', () => {
  test('shows Connect to HEB when the shared state is ready and no session is running', () => {
    render(<ConnectionPanel sessionStatus={{ active: false, loginSessionValid: true }} hebState="ready" hebHealth={null} onConnect={() => {}} onDisconnect={() => {}} onRecheck={() => {}} connecting={false} />);

    expect(screen.getByText('Connect to HEB')).toBeInTheDocument();
    expect(screen.getByText('HEB Connection')).toBeInTheDocument();
    expect(screen.getByText('Ready to connect')).toBeInTheDocument();
  });

  test('shows Disconnect and idle time when a session is active', () => {
    render(<ConnectionPanel sessionStatus={{ active: true, loginSessionValid: true, idleSeconds: 12 }} hebState="ready" hebHealth={null} onConnect={() => {}} onDisconnect={() => {}} onRecheck={() => {}} connecting={false} />);

    expect(screen.getByText('Disconnect')).toBeInTheDocument();
    expect(screen.getByText(/idle 12s/)).toBeInTheDocument();
  });
});

describe('ConnectionPanel — initial (unknown) state', () => {
  test('shows a neutral "checking" subtitle and no buttons before the first answers land', () => {
    render(<ConnectionPanel sessionStatus={null} hebState="checking" hebHealth={null} onConnect={() => {}} onDisconnect={() => {}} onRecheck={() => {}} connecting={false} />);

    expect(screen.getByText('Checking connection…')).toBeInTheDocument();
    expect(screen.getByText('HEB Connection')).toBeInTheDocument();
    expect(screen.queryByText('HEB sign-in needed')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('a browser status that lands before the shared state still shows nothing premature', () => {
    render(<ConnectionPanel sessionStatus={{ active: false, loginSessionValid: true }} hebState="checking" hebHealth={null} onConnect={() => {}} onDisconnect={() => {}} onRecheck={() => {}} connecting={false} />);

    expect(screen.getByText('Checking connection…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ConnectionPanel under the shared session state', () => {
  const noop = () => {};

  test('signedOut renders the shared panel, not the old inline copy', () => {
    render(
      <ConnectionPanel
        sessionStatus={{ active: false, loginSessionValid: false }}
        hebState="signedOut"
        hebHealth={null}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    expect(screen.getByTestId('heb-session-panel')).toBeInTheDocument();
    expect(screen.queryByText(/scrape:login/)).not.toBeInTheDocument();
    expect(screen.queryByText('Show technical details')).not.toBeInTheDocument();
  });

  test('CRITICAL: signedOut wins even when a stale browser session is active', () => {
    // Without this, HebCart's auto-advance hides the remedy behind a browser
    // session whose cookies HEB has already rejected.
    render(
      <ConnectionPanel
        sessionStatus={{ active: true, loginSessionValid: true, idleSeconds: 5 }}
        hebState="signedOut"
        hebHealth={null}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    expect(screen.getByTestId('heb-session-panel')).toBeInTheDocument();
  });

  test('Connect is disabled while signedOut', () => {
    render(
      <ConnectionPanel
        sessionStatus={{ active: false, loginSessionValid: true }}
        hebState="signedOut"
        hebHealth={null}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    const connect = screen.queryByRole('button', { name: /Connect to HEB/ });
    expect(connect === null || connect.disabled).toBe(true);
  });

  test('unreachable blocks Connect too', () => {
    render(
      <ConnectionPanel
        sessionStatus={{ active: false, loginSessionValid: true }}
        hebState="unreachable"
        hebHealth={null}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    expect(screen.getByTestId('heb-session-panel')).toBeInTheDocument();
    const connect = screen.queryByRole('button', { name: /Connect to HEB/ });
    expect(connect === null || connect.disabled).toBe(true);
  });

  test('checking renders neither the panel nor a premature Connect', () => {
    const { container } = render(
      <ConnectionPanel
        sessionStatus={null}
        hebState="checking"
        hebHealth={null}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector('[data-testid="heb-session-panel"]')).toBeNull();
    expect(screen.getByText('Checking connection…')).toBeInTheDocument();
  });

  test('ready shows the Connect button', () => {
    render(
      <ConnectionPanel
        sessionStatus={{ active: false, loginSessionValid: true }}
        hebState="ready"
        hebHealth={null}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    expect(screen.getByRole('button', { name: /Connect to HEB/ })).toBeEnabled();
  });

  test('NEW BEHAVIOR: Cart warns when the session is expiring, but stays usable', () => {
    // Cart has never had this warning — Deals had it and Cart did not.
    render(
      <ConnectionPanel
        sessionStatus={{ active: false, loginSessionValid: true }}
        hebState="expiring"
        hebHealth={{ authExpiresAt: new Date(Date.now() + 3600000).toISOString() }}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    expect(screen.getByTestId('heb-session-panel')).toBeInTheDocument();
    expect(screen.getByText(/expiring soon/i)).toBeInTheDocument();
    // Advisory, not blocking.
    expect(screen.getByRole('button', { name: /Connect to HEB/ })).toBeEnabled();
  });

  test('RULING R14: wrongStore advises but never blocks Connect', () => {
    // wrongStore's only signal is a transient, non-authoritative store cookie
    // that has already produced one false positive in the field. Blocking the
    // Connect button on it would stop a user who is in fact correctly
    // configured, with no action available that could clear the block.
    render(
      <ConnectionPanel
        sessionStatus={{ active: false, loginSessionValid: true }}
        hebState="wrongStore"
        hebHealth={{ storeId: '809', storeExpected: '794' }}
        onConnect={noop} onDisconnect={noop} onRecheck={noop} connecting={false}
      />
    );
    expect(screen.getByTestId('heb-session-panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connect to HEB/ })).toBeEnabled();
  });
});
