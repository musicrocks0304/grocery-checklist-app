import React from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './render';
import { installMockFetch, restoreFetch } from './mockFetch';
import { getWeekDates } from '../utils/weekDates';

export const chatProps = () => ({
  onBack: jest.fn(), onNavigate: jest.fn(), selectedMeals: [],
  setSelectedMeals: jest.fn(), refreshMeals: jest.fn(),
  groceryListData: null, setGroceryListData: jest.fn(),
});

export function queryTypingIndicator(container) {
  // eslint-disable-next-line testing-library/no-node-access -- Existing typing dots have no semantic role; characterize unchanged markup.
  return container.querySelector('.animate-bounce');
}

export async function openChat(Component, endpoint, reply, props = chatProps(), history = []) {
  const mock = installMockFetch({ '/chat_history': history, [endpoint]: reply });
  const view = renderWithProviders(<Component {...props} />);
  await waitFor(() => expect(mock.for('/chat_history')).toHaveLength(1));
  // Flush fetch/text/history restoration before sending; a late history result
  // is allowed to replace messages by the production screen's current policy.
  await act(async () => { await Promise.resolve(); });
  return { mock, ...view };
}

export function sendChat(inputLabel, value) {
  fireEvent.change(screen.getByLabelText(inputLabel), { target: { value } });
  fireEvent.click(screen.getByLabelText('Send message'));
}

export function chatTransportContract({ Component, endpoint, inputLabel, context, sessionPrefix, retryName, okReply, okText, errorText, timeoutText, planner }) {
  beforeAll(() => { window.HTMLElement.prototype.scrollIntoView = jest.fn(); });
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    jest.restoreAllMocks();
    restoreFetch();
    localStorage.clear();
  });

  test('click events use trimmed input, Enter sends, Shift+Enter does not, and the legacy weekly session wins', async () => {
    const week = getWeekDates();
    localStorage.setItem(`${sessionPrefix}SessionId_${week.startDate}`, 'legacy-session');
    const { mock } = await openChat(Component, endpoint, okReply);
    sendChat(inputLabel, '  dinner idea  ');
    await screen.findByText(okText);
    const first = mock.for(endpoint)[0];
    expect(first.method).toBe('POST');
    expect(first.body).toEqual({
      message: 'dinner idea', sessionId: 'legacy-session', context,
      weekDateRange: week.displayRange, timestamp: expect.any(String),
      ...(planner ? { weekStartDate: week.startDate, weekEndDate: week.endDate } : {}),
    });
    expect(Number.isNaN(Date.parse(first.body.timestamp))).toBe(false);
    expect(screen.getByLabelText(inputLabel)).toHaveValue('');
    expect(screen.getByText('dinner idea')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(inputLabel), { target: { value: 'Enter idea' } });
    fireEvent.keyDown(screen.getByLabelText(inputLabel), { key: 'Enter', charCode: 13, shiftKey: true });
    expect(mock.for(endpoint)).toHaveLength(1);
    fireEvent.keyDown(screen.getByLabelText(inputLabel), { key: 'Enter', charCode: 13, shiftKey: false });
    await waitFor(() => expect(mock.for(endpoint)).toHaveLength(2));
    await act(async () => { await Promise.resolve(); });
    expect(mock.for(endpoint)[1].body.message).toBe('Enter idea');
    expect(mock.unmocked()).toEqual([]);
  });

  test('retry uses remembered text after clear, makes another bubble/new timestamp, and never automatically retries', async () => {
    let count = 0;
    const weekAtMount = getWeekDates();
    const { mock, container } = await openChat(Component, endpoint, () => {
      count += 1;
      return count === 1 ? { status: 503, body: 'unavailable' } : okReply;
    });
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-10T15:00:00Z'));
    sendChat(inputLabel, 'repeat this');
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(errorText)).toBeInTheDocument();
    expect(queryTypingIndicator(container)).toBeNull();
    expect(mock.for(endpoint)).toHaveLength(1);
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(mock.for(endpoint)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: retryName, exact: true }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(okText)).toBeInTheDocument();
    expect(screen.getAllByText('repeat this')).toHaveLength(2);
    expect(mock.for(endpoint)).toHaveLength(2);
    expect(mock.for(endpoint)[1].body.message).toBe('repeat this');
    expect(mock.for(endpoint)[1].body.timestamp).not.toBe(mock.for(endpoint)[0].body.timestamp);
    expect(mock.for(endpoint)[1].body.sessionId).toBe(`${sessionPrefix}_${weekAtMount.startDate}`);
    expect(queryTypingIndicator(container)).toBeNull();
    expect(mock.unmocked()).toEqual([]);
  });

  test('typing survives a pending response and timeout is exactly 120 seconds with no automatic retry', async () => {
    const { mock, container } = await openChat(Component, endpoint, okReply);
    const delegate = global.fetch;
    const observedSignals = [];
    global.fetch = jest.fn((url, init) => {
      const result = delegate(url, init); // records the endpoint call synchronously
      if (!String(url).includes(endpoint)) return result;
      observedSignals.push(init.signal);
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
      });
    });
    jest.useFakeTimers();
    sendChat(inputLabel, 'slow idea');
    expect(queryTypingIndicator(container)).not.toBeNull();
    expect(screen.getByLabelText('Send message')).toBeDisabled();
    await act(async () => { jest.advanceTimersByTime(119999); });
    expect(observedSignals[0].aborted).toBe(false);
    expect(queryTypingIndicator(container)).not.toBeNull();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(observedSignals[0].aborted).toBe(true);
    expect(screen.getByText(timeoutText)).toBeInTheDocument();
    expect(queryTypingIndicator(container)).toBeNull();
    expect(screen.getByRole('button', { name: retryName, exact: true })).toBeInTheDocument();
    expect(mock.for(endpoint)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(inputLabel), { target: { value: 'another idea' } });
    expect(screen.getByLabelText('Send message')).toBeEnabled();
  });

  test.each(['', 'not json'])('invalid response %p clears typing and offers manual retry', async body => {
    const { mock, container } = await openChat(Component, endpoint, { status: 200, body });
    sendChat(inputLabel, 'bad response');
    await screen.findByText(errorText);
    expect(screen.getByRole('button', { name: retryName, exact: true })).toBeInTheDocument();
    expect(queryTypingIndicator(container)).toBeNull();
    expect(mock.for(endpoint)).toHaveLength(1);
  });
}
