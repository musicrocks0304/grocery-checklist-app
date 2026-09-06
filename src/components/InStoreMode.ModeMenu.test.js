import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeMenu } from './InStoreMode';

test('renders the three actions and calls their handlers', () => {
  const onReorder = jest.fn(), onInvite = jest.fn(), onFeedback = jest.fn(), onClose = jest.fn();
  render(<ModeMenu onReorder={onReorder} onInvite={onInvite} onFeedback={onFeedback} onClose={onClose} wakeLockActive={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reorder aisles' }));
  fireEvent.click(screen.getByRole('button', { name: 'Invite partner' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
  expect(onReorder).toHaveBeenCalledTimes(1);
  expect(onInvite).toHaveBeenCalledTimes(1);
  expect(onFeedback).toHaveBeenCalledTimes(1);
});

test('shows the wake-lock hint only when wakeLockActive is true', () => {
  const noop = () => {};
  const { rerender } = render(<ModeMenu onReorder={noop} onInvite={noop} onFeedback={noop} onClose={noop} wakeLockActive={false} />);
  expect(screen.queryByText('Screen stays awake while shopping')).not.toBeInTheDocument();
  rerender(<ModeMenu onReorder={noop} onInvite={noop} onFeedback={noop} onClose={noop} wakeLockActive />);
  expect(screen.getByText('Screen stays awake while shopping')).toBeInTheDocument();
});
