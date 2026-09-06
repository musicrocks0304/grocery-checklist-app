import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '../contexts/ThemeContext';
import { FeedbackProvider } from '../contexts/FeedbackContext';

export function renderWithProviders(ui, { currentScreen = 'test' } = {}) {
  return render(<ThemeProvider><FeedbackProvider currentScreen={currentScreen}>{ui}</FeedbackProvider></ThemeProvider>);
}
