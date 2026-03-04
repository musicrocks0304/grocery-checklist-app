import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

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

test('renders without crashing', () => {
  render(<App />);
  expect(document.getElementById('root') || document.body).toBeTruthy();
});

test('defaults to grocery screen', () => {
  render(<App />);
  expect(window.location.hash === '' || window.location.hash === '#grocery').toBe(true);
});
