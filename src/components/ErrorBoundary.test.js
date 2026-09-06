import React from 'react';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';
import { reportError } from '../telemetry/errorReporter';

jest.mock('../telemetry/errorReporter', () => ({ reportError: jest.fn() }));

function Bomb() { throw new Error('boom'); }

test('a throwing child renders the fallback and reports once with kind boundary', () => {
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<ErrorBoundary><Bomb /></ErrorBoundary>);
  expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  expect(reportError).toHaveBeenCalledTimes(1);
  expect(reportError.mock.calls[0][0]).toMatchObject({ kind: 'boundary' });
  expect(reportError.mock.calls[0][0].error.message).toBe('boom');
  quiet.mockRestore();
});

test('renders children when nothing throws and reports nothing', () => {
  // react-scripts sets resetMocks: true, so the mock's call count starts at 0 here.
  render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
  expect(screen.getByText('fine')).toBeInTheDocument();
  expect(reportError).not.toHaveBeenCalled();
});
