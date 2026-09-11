import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { deferNextFetch } from '../test-utils/deferredFetch';
import { activeSession, cartFetchMap } from '../test-utils/cartFixtures';
import { ConnectionPanel } from '../components/HebCart';
import useClipSession from './useClipSession';

function Harness({ onStepChange }) {
  const session = useClipSession({ onStepChange });
  return <ConnectionPanel sessionStatus={session.sessionStatus} connecting={session.connecting}
    onConnect={session.handleConnect} onDisconnect={session.handleDisconnect} onRecheck={session.checkSession} />;
}
afterEach(() => { cleanup(); restoreFetch(); });
test.each(['http', 'network'])('disconnect retains its HTTP/network distinction: %s', async (failure) => {
  const onStepChange = jest.fn();
  const mock = installMockFetch(cartFetchMap({
    '/api/heb/session/status': activeSession,
    '/api/heb/session/end': { status: 503, body: { message: 'server failed' } },
  }));
  render(<Harness onStepChange={onStepChange} />);
  await act(async () => { await Promise.resolve(); });
  const request = failure === 'network' ? deferNextFetch('/api/heb/session/end') : null;
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  if (request) request.reject(new TypeError('offline'));
  await act(async () => { await Promise.resolve(); });
  expect(mock.for('/api/heb/session/end')[0].method).toBe('POST');
  const disconnects = failure === 'http';
  expect(onStepChange.mock.calls).toEqual(disconnects ? [['connect']] : []);
  expect(screen.getByRole('button', { name: disconnects ? 'Connect to HEB' : 'Disconnect' })).toBeInTheDocument();
});
