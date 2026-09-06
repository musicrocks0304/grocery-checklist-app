import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import { InviteModal } from './InStoreMode';

afterEach(restoreFetch);

test('posts create_session once on open and shows the code', async () => {
  const mock = installMockFetch({ '/create_session': { code: 'AB12', week_start_date: '2026-09-06', expires_at: '2026-09-06 14:00:00' } });
  render(<InviteModal weekStartDate="2026-09-06" onClose={() => {}} />);
  expect(await screen.findByText('AB12', { exact: false })).toBeInTheDocument();
  expect(mock.for('/create_session')).toHaveLength(1);
  expect(mock.for('/create_session')[0].body).toEqual({ week_start_date: '2026-09-06' });
  expect(mock.unmocked()).toEqual([]);
});

test("a 500 shows the connection error and no code", async () => {
  const mock = installMockFetch({ '/create_session': { status: 500, body: { success: false, error: 'Workflow error' } } });
  render(<InviteModal weekStartDate="2026-09-06" onClose={() => {}} />);
  await waitFor(() => expect(screen.queryByText(/AB12/)).not.toBeInTheDocument());
  expect(await screen.findByText("Couldn't create invite — check your connection and try again.")).toBeInTheDocument();
  expect(mock.unmocked()).toEqual([]);
});

test('Close calls onClose', async () => {
  const mock = installMockFetch({ '/create_session': { code: 'AB12', week_start_date: '2026-09-06', expires_at: '' } });
  const onClose = jest.fn();
  render(<InviteModal weekStartDate="2026-09-06" onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
  await screen.findByText('AB12', { exact: false });
  expect(mock.unmocked()).toEqual([]);
});
