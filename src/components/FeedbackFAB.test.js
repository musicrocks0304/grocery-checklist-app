import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FeedbackFAB from './FeedbackFAB';
import { ThemeProvider } from '../contexts/ThemeContext';

// Mock html2canvas — returns a fake canvas
jest.mock('html2canvas', () => ({
  __esModule: true,
  default: jest.fn(() =>
    Promise.resolve({
      width: 375,
      height: 812,
      toDataURL: () => 'data:image/jpeg;base64,fake',
      getContext: () => ({ drawImage: jest.fn() }),
    })
  ),
}));

// Mock matchMedia for ThemeContext
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

const renderWithTheme = (ui) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

describe('FeedbackFAB', () => {
  test('renders the FAB button', () => {
    renderWithTheme(<FeedbackFAB currentScreen="home" />);
    expect(screen.getByLabelText('Send feedback')).toBeInTheDocument();
  });

  test('opens feedback panel on click', async () => {
    renderWithTheme(<FeedbackFAB currentScreen="plan" />);
    const fab = screen.getByLabelText('Send feedback');
    fireEvent.click(fab);
    // Panel should appear with header
    expect(await screen.findByText('Send Feedback')).toBeInTheDocument();
  });
});
