import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InputToolbar from './InputToolbar';

describe('InputToolbar', () => {
  test('renders quick-add input and Add button by default', () => {
    render(<InputToolbar onQuickAdd={() => {}} onSearchChange={() => {}} />);
    expect(screen.getByPlaceholderText(/quick add/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument();
  });

  test('Add button is disabled when quick-add input is empty', () => {
    render(<InputToolbar onQuickAdd={() => {}} onSearchChange={() => {}} />);
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
  });

  test('pressing Enter in quick-add fires onQuickAdd with trimmed name', () => {
    const onQuickAdd = jest.fn();
    render(<InputToolbar onQuickAdd={onQuickAdd} onSearchChange={() => {}} />);
    const input = screen.getByPlaceholderText(/quick add/i);
    fireEvent.change(input, { target: { value: '  Cilantro  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onQuickAdd).toHaveBeenCalledWith('Cilantro');
  });

  test('clicking the search toggle switches to search mode', () => {
    render(<InputToolbar onQuickAdd={() => {}} onSearchChange={() => {}} />);
    fireEvent.click(screen.getByLabelText(/search/i));
    expect(screen.getByPlaceholderText(/search your items/i)).toBeInTheDocument();
  });

  test('typing in search mode fires onSearchChange', () => {
    const onSearchChange = jest.fn();
    render(<InputToolbar onQuickAdd={() => {}} onSearchChange={onSearchChange} />);
    fireEvent.click(screen.getByLabelText(/search/i));
    fireEvent.change(screen.getByPlaceholderText(/search your items/i), {
      target: { value: 'milk' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('milk');
  });

  test('clearing search (X) returns to quick-add mode', () => {
    render(<InputToolbar onQuickAdd={() => {}} onSearchChange={() => {}} />);
    fireEvent.click(screen.getByLabelText(/search/i));
    fireEvent.click(screen.getByLabelText(/close search/i));
    expect(screen.getByPlaceholderText(/quick add/i)).toBeInTheDocument();
  });
});
