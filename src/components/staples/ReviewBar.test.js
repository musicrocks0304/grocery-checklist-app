import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReviewBar from './ReviewBar';

describe('ReviewBar', () => {
  test('shows "Nothing selected yet" when count is 0', () => {
    render(<ReviewBar count={0} onReview={() => {}} />);
    expect(screen.getByText(/nothing selected yet/i)).toBeInTheDocument();
  });

  test('pluralizes correctly at 1 and 2', () => {
    const { rerender } = render(<ReviewBar count={1} onReview={() => {}} />);
    expect(screen.getByText(/1 item in your list/i)).toBeInTheDocument();
    rerender(<ReviewBar count={2} onReview={() => {}} />);
    expect(screen.getByText(/2 items in your list/i)).toBeInTheDocument();
  });

  test('Review button disabled when count is 0', () => {
    render(<ReviewBar count={0} onReview={() => {}} />);
    expect(screen.getByRole('button', { name: /review/i })).toBeDisabled();
  });

  test('clicking Review calls onReview when enabled', () => {
    const onReview = jest.fn();
    render(<ReviewBar count={3} onReview={onReview} />);
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(onReview).toHaveBeenCalled();
  });
});
