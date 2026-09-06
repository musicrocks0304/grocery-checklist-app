import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import ChatBot from './ChatBot';

const props = () => ({ onBack: jest.fn(), onNavigate: jest.fn(), selectedMeals: [], setSelectedMeals: jest.fn(), refreshMeals: jest.fn(), groceryListData: null, setGroceryListData: jest.fn() });

// jsdom doesn't implement scrollIntoView; ChatBot.js:209 calls it on every
// messages-list update (a plain useEffect, unguarded by try/catch).
beforeAll(() => { window.HTMLElement.prototype.scrollIntoView = jest.fn(); });

afterEach(() => { restoreFetch(); localStorage.clear(); });

test('mount loads chat_history and treats an empty body as no history', async () => {
  const mock = installMockFetch({ '/chat_history': { status: 200, body: '' } });
  renderWithProviders(<ChatBot {...props()} />);
  await waitFor(() => expect(mock.for('/chat_history')).toHaveLength(1));
  expect(screen.getByLabelText('Type your message')).toBeInTheDocument();
  expect(mock.unmocked()).toEqual([]);
});

test('a previous exchange in history is rendered', async () => {
  const mock = installMockFetch({ '/chat_history': [{ id: 1, session_id: 's', message: { type: 'human', content: 'tacos please' }, raw_content: null }, { id: 2, session_id: 's', message: { type: 'ai', content: 'Here are tacos' }, raw_content: null }] });
  renderWithProviders(<ChatBot {...props()} />);
  expect(await screen.findByText('tacos please')).toBeInTheDocument();
  expect(mock.unmocked()).toEqual([]);
});

test('sending a message posts call_grocery_agent with retries 0 and renders the reply', async () => {
  // ChatBot.js ~520 only reaches the plain-string branch when `output` itself
  // is a string; the structured-object branch (~437) additionally requires
  // `output.responseType`, which this fixture intentionally omits.
  const mock = installMockFetch({ '/chat_history': [], '/call_grocery_agent': [{ output: 'How about tacos?' }] });
  renderWithProviders(<ChatBot {...props()} />);
  fireEvent.change(screen.getByLabelText('Type your message'), { target: { value: 'dinner ideas' } });
  fireEvent.click(screen.getByLabelText('Send message'));
  expect(await screen.findByText(/How about tacos/)).toBeInTheDocument();
  expect(mock.for('/call_grocery_agent')).toHaveLength(1);
  expect(mock.for('/call_grocery_agent')[0].body.message).toBe('dinner ideas');
  expect(mock.unmocked()).toEqual([]);
});

test('a 500 from the agent shows the fallback message, not a crash', async () => {
  const mock = installMockFetch({ '/chat_history': [], '/call_grocery_agent': { status: 500, body: { message: 'Error in workflow' } } });
  renderWithProviders(<ChatBot {...props()} />);
  fireEvent.change(screen.getByLabelText('Type your message'), { target: { value: 'x' } });
  fireEvent.click(screen.getByLabelText('Send message'));
  expect(await screen.findByText(/hit a snag/)).toBeInTheDocument();
  expect(mock.unmocked()).toEqual([]);
});
