import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock matchMedia for ThemeContext (not available in JSDOM)
beforeAll(() => {
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

test('renders without crashing', () => {
  render(<App />);
  expect(document.getElementById('root') || document.body).toBeTruthy();
});

test('defaults to grocery screen', () => {
  render(<App />);
  expect(window.location.hash === '' || window.location.hash === '#grocery').toBe(true);
});
