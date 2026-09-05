import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AppShell from './AppShell';
import { ThemeProvider } from '../contexts/ThemeContext';
import { HeaderProvider } from '../contexts/HeaderContext';
import { FeedbackProvider, useFeedback } from '../contexts/FeedbackContext';

// Mock the screenshot helpers — jsdom canvases can't rasterize, and the panel
// auto-captures the screen the moment it opens.
jest.mock('../utils/screenshot', () => ({
  captureScreen: jest.fn(() => Promise.resolve('data:image/jpeg;base64,shot')),
  compressImage: jest.fn(() => Promise.resolve('data:image/jpeg;base64,shot')),
}));

const { captureScreen } = require('../utils/screenshot');

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

const Opener = () => {
  const { openFeedback } = useFeedback();
  return (
    <button type="button" onClick={openFeedback}>
      open from context
    </button>
  );
};

const renderWithProviders = (ui, { currentScreen = 'home' } = {}) =>
  render(
    <ThemeProvider>
      <FeedbackProvider currentScreen={currentScreen}>
        <HeaderProvider>{ui}</HeaderProvider>
      </FeedbackProvider>
    </ThemeProvider>
  );

describe('FeedbackPanel + FeedbackProvider', () => {
  beforeEach(() => {
    captureScreen.mockClear();
  });

  test('panel is closed until openFeedback is called', () => {
    renderWithProviders(<Opener />);
    expect(screen.queryByText('Send Feedback')).not.toBeInTheDocument();
  });

  test('openFeedback from the context opens the panel', async () => {
    renderWithProviders(<Opener />, { currentScreen: 'plan' });
    fireEvent.click(screen.getByText('open from context'));
    expect(await screen.findByText('Send Feedback')).toBeInTheDocument();
    // Opening still auto-captures the current screen
    expect(captureScreen).toHaveBeenCalledTimes(1);
  });

  test('the AppShell header button opens the panel', async () => {
    renderWithProviders(
      <AppShell currentScreen="plan" onNavigate={jest.fn()} navigation={[]}>
        <div>content</div>
      </AppShell>
    );
    const trigger = screen.getAllByLabelText('Send feedback')[0];
    fireEvent.click(trigger);
    expect(await screen.findByText('Send Feedback')).toBeInTheDocument();
  });

  test('no feedback trigger is a fixed floating button', () => {
    renderWithProviders(
      <AppShell currentScreen="plan" onNavigate={jest.fn()} navigation={[]}>
        <div>content</div>
      </AppShell>
    );
    screen.getAllByLabelText('Send feedback').forEach((el) => {
      expect(el.className).not.toMatch(/(^|\s)fixed(\s|$)/);
    });
  });
});
