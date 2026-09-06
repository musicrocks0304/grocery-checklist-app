import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AppShell from './AppShell';
import Sidebar from './Sidebar';
import { ModeMenu } from './InStoreMode';
import { ThemeProvider } from '../contexts/ThemeContext';
import { HeaderProvider } from '../contexts/HeaderContext';
import { FeedbackProvider, useFeedback } from '../contexts/FeedbackContext';

// Mock the screenshot helpers — jsdom canvases can't rasterize, and the panel
// auto-captures the screen the moment it opens.
jest.mock('../utils/screenshot', () => ({
  captureScreen: jest.fn(() => Promise.resolve('data:image/jpeg;base64,shot')),
  compressImage: jest.fn(() => Promise.resolve('data:image/jpeg;base64,shot')),
}));

jest.mock('../config/api', () => ({
  ...jest.requireActual('../config/api'),
  apiJson: jest.fn(),
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

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function openAndFill() {
  fireEvent.click(screen.getByText('open from context'));
  await screen.findByText('Send Feedback');
  fireEvent.click(screen.getByRole('button', { name: /bug/i }));
  fireEvent.change(screen.getByPlaceholderText('What happened? What would make it better?'), { target: { value: 'it broke' } });
}

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

  test('submit sends a client_id and reuses it on retry; a new report gets a new id', async () => {
    const { apiJson } = require('../config/api');
    apiJson.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ success: true });
    renderWithProviders(<Opener />);
    await openAndFill();
    const submit = () => fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));
    submit();
    await waitFor(() => expect(apiJson).toHaveBeenCalledTimes(1));
    const first = JSON.parse(apiJson.mock.calls[0][1].body);
    expect(first.client_id).toMatch(V4);
    expect(apiJson.mock.calls[0][1].retries).toBe(0);
    submit();
    await waitFor(() => expect(apiJson).toHaveBeenCalledTimes(2));
    expect(JSON.parse(apiJson.mock.calls[1][1].body).client_id).toBe(first.client_id);
    await waitFor(() => expect(screen.queryByText('Send Feedback')).not.toBeInTheDocument());
    await openAndFill();
    submit();
    await waitFor(() => expect(apiJson).toHaveBeenCalledTimes(3));
    expect(JSON.parse(apiJson.mock.calls[2][1].body).client_id).not.toBe(first.client_id);
  });

  test('Sidebar "Send feedback" link opens the panel', async () => {
    render(
      <ThemeProvider>
        <FeedbackProvider currentScreen="home">
          <Sidebar currentScreen="home" setCurrentScreen={() => {}} navigation={[]} />
        </FeedbackProvider>
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByText('Send Feedback')).toBeInTheDocument();
  });

  test('Shop menu "Send feedback" calls the handler', () => {
    const onFeedback = jest.fn();
    render(<ModeMenu onReorder={() => {}} onInvite={() => {}} onFeedback={onFeedback} onClose={() => {}} wakeLockActive={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(onFeedback).toHaveBeenCalled();
  });
});
