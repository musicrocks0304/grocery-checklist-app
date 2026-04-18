import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import OneOffCard from './OneOffCard';

describe('OneOffCard', () => {
  const oneOffs = [
    { ItemID: 'oneoff_100', ItemName: 'Birthday candles' },
    { ItemID: 'oneoff_101', ItemName: 'Helium balloons' },
  ];

  test('renders a row per one-off', () => {
    render(
      <OneOffCard
        oneOffs={oneOffs}
        selected={new Set(['oneoff_100', 'oneoff_101'])}
        onToggle={() => {}}
        onRemove={() => {}}
      />
    );
    expect(screen.getByText('Birthday candles')).toBeInTheDocument();
    expect(screen.getByText('Helium balloons')).toBeInTheDocument();
  });

  test('shows N/M count', () => {
    render(
      <OneOffCard
        oneOffs={oneOffs}
        selected={new Set(['oneoff_100'])}
        onToggle={() => {}}
        onRemove={() => {}}
      />
    );
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  test('clicking the trash icon calls onRemove with the itemId', () => {
    const onRemove = jest.fn();
    render(
      <OneOffCard
        oneOffs={oneOffs}
        selected={new Set(['oneoff_100'])}
        onToggle={() => {}}
        onRemove={onRemove}
      />
    );
    const removeBtns = screen.getAllByLabelText(/remove one-off/i);
    fireEvent.click(removeBtns[0]);
    expect(onRemove).toHaveBeenCalledWith('oneoff_100');
  });

  test('clicking a checkbox calls onToggle with the itemId', () => {
    const onToggle = jest.fn();
    render(
      <OneOffCard
        oneOffs={oneOffs}
        selected={new Set()}
        onToggle={onToggle}
        onRemove={() => {}}
      />
    );
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onToggle).toHaveBeenCalledWith('oneoff_100');
  });
});
