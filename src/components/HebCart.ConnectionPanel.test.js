import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConnectionPanel } from './HebCart';

describe('ConnectionPanel — expired login state', () => {
  const expiredStatus = { active: false, loginSessionValid: false };

  test('shows plain-English copy and hides the npm command by default', () => {
    render(<ConnectionPanel sessionStatus={expiredStatus} onConnect={() => {}} onDisconnect={() => {}} onRecheck={() => {}} connecting={false} />);

    expect(screen.getByText('HEB sign-in needed')).toBeInTheDocument();
    expect(screen.getByText(/saved HEB login has expired/)).toBeInTheDocument();
    expect(screen.queryByText('npm run scrape:login')).not.toBeInTheDocument();
  });

  test('does not render the Connect to HEB button in the expired state', () => {
    render(<ConnectionPanel sessionStatus={expiredStatus} onConnect={() => {}} onDisconnect={() => {}} onRecheck={() => {}} connecting={false} />);
    expect(screen.queryByText('Connect to HEB')).not.toBeInTheDocument();
  });

  test('reveals technical details when "Show technical details" is toggled, with aria-expanded reflecting state', () => {
    render(<ConnectionPanel sessionStatus={expiredStatus} onConnect={() => {}} onDisconnect={() => {}} onRecheck={() => {}} connecting={false} />);

    const toggle = screen.getByText('Show technical details');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('npm run scrape:login')).toBeInTheDocument();
    expect(screen.getByText('Run this on the server, then re-check.')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('npm run scrape:login')).not.toBeInTheDocument();
  });

  test('calls onRecheck, shows a spinner while in flight, and clears it in finally on resolve', async () => {
    let resolvePromise;
    const onRecheck = jest.fn(() => new Promise((resolve) => { resolvePromise = resolve; }));

    render(<ConnectionPanel sessionStatus={expiredStatus} onConnect={() => {}} onDisconnect={() => {}} onRecheck={onRecheck} connecting={false} />);

    const button = screen.getByRole('button', { name: /check again/i });
    expect(button).toHaveClass('min-h-[44px]');

    fireEvent.click(button);
    expect(onRecheck).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Checking...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled();

    resolvePromise();
    expect(await screen.findByText('Check again')).toBeInTheDocument();
  });
});

describe('ConnectionPanel — other states unchanged', () => {
  test('shows Connect to HEB when login is valid but not active', () => {
    render(<ConnectionPanel sessionStatus={{ active: false, loginSessionValid: true }} onConnect={() => {}} onDisconnect={() => {}} onRecheck={() => {}} connecting={false} />);

    expect(screen.getByText('Connect to HEB')).toBeInTheDocument();
    expect(screen.getByText('HEB Connection')).toBeInTheDocument();
    expect(screen.getByText('Ready to connect')).toBeInTheDocument();
  });

  test('shows Disconnect and idle time when a session is active', () => {
    render(<ConnectionPanel sessionStatus={{ active: true, loginSessionValid: true, idleSeconds: 12 }} onConnect={() => {}} onDisconnect={() => {}} onRecheck={() => {}} connecting={false} />);

    expect(screen.getByText('Disconnect')).toBeInTheDocument();
    expect(screen.getByText(/idle 12s/)).toBeInTheDocument();
  });
});
