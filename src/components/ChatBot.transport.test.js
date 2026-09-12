import { fireEvent, screen, waitFor } from '@testing-library/react';
import ChatBot from './ChatBot';
import { chatProps, chatTransportContract, openChat, sendChat, queryTypingIndicator } from '../test-utils/chatTransportContract';

const endpoint = '/call_grocery_agent';
const inputLabel = 'Type your message';
const errorText = "I'm having trouble connecting right now. Please try again in a moment.";
chatTransportContract({
  Component: ChatBot, endpoint, inputLabel, context: 'meal_planning', sessionPrefix: 'chat',
  retryName: 'Retry last message', okReply: [{ output: 'Planner reply' }], okText: 'Planner reply',
  errorText, timeoutText: errorText, planner: true,
});

test('Planner 500 remains non-retryable', async () => {
  const { mock, container } = await openChat(ChatBot, endpoint, { status: 500, body: 'workflow failed' });
  sendChat(inputLabel, 'idea');
  expect(await screen.findByText(/Sorry — I hit a snag answering that/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry last message' })).not.toBeInTheDocument();
  expect(queryTypingIndicator(container)).toBeNull();
  expect(mock.for(endpoint)).toHaveLength(1);
});

const recipes = { responseType: 'recipe_list', message: 'Pick a meal', recipes: [{ id: 23, name: 'Lemon rice', description: 'Bright rice' }] };
test.each([
  ['structured', [{ output: recipes }], 'Pick a meal', 'Lemon rice'],
  ['body wrapper', [{ response: { body: [{ output: recipes }] } }], 'Pick a meal', 'Lemon rice'],
  ['numbered legacy', [{ output: '1. **Lemon rice** (ID: 23) - Bright rice' }], '1. **Lemon rice** (ID: 23) - Bright rice', 'Lemon rice'],
  ['bullet legacy', [{ output: '- **Lemon rice** (ID: 23)' }], '- **Lemon rice** (ID: 23)', 'Lemon rice'],
  ['text fallback', [{ text: 'Text-only reply' }], 'Text-only reply', null],
  ['string entry', ['String-entry reply'], 'String-entry reply', null],
  ['literal JSON output', [{ output: JSON.stringify(recipes) }], JSON.stringify(recipes), null],
  ['direct object', { output: recipes }, "I received your message but couldn't process it properly. Please try again!", null],
])('Planner retains %s live parsing', async (_name, reply, text, card) => {
  await openChat(ChatBot, endpoint, reply);
  sendChat(inputLabel, 'suggest dinner');
  await screen.findByText(text);
  const recipeCard = screen.queryByRole('heading', { name: card || 'Lemon rice' });
  expect(Boolean(recipeCard)).toBe(Boolean(card));
});

test('structured ingredient parsing retains the current parent-state update and recipe-ID mutation', async () => {
  const meal = { id: 'selected-1', name: 'Lemon rice' };
  const props = { ...chatProps(), selectedMeals: [meal] };
  await openChat(ChatBot, endpoint, [{ output: {
    responseType: 'ingredients_detail', recipeName: 'Lemon rice', recipeId: 23,
    ingredients: [{ category: 'Produce', items: [{ name: 'Lemon', quantity: 2, unit: 'each', amount: { metric: { value: 100, unit: 'g' } } }] }],
  } }], props);
  sendChat(inputLabel, 'ingredients');
  await screen.findByText('Ingredients for Lemon rice have been added to your meal plan.');
  expect(meal.recipeId).toBe(23);
  const update = props.setSelectedMeals.mock.calls[0][0];
  expect(update([meal])).toEqual([{ ...meal, ingredients: [{
    id: 1, name: 'Lemon', quantity: '2 each', metricValue: 100, metricUnit: 'g',
    category: 'Produce', needed: true, recipeId: 23,
  }] }]);
});

test('legacy ingredient response still updates the matching selected meal', async () => {
  const meal = { id: 'selected-1', name: 'Lemon rice', recipeId: 23 };
  const props = { ...chatProps(), selectedMeals: [meal] };
  await openChat(ChatBot, endpoint, [{ output: 'ingredients needed for Lemon rice\nProduce:\n- 2 cups rice' }], props);
  sendChat(inputLabel, 'ingredients');
  await waitFor(() => expect(props.setSelectedMeals).toHaveBeenCalled());
  const update = props.setSelectedMeals.mock.calls[0][0];
  expect(update([meal])[0].ingredients).toEqual([{ id: 1, name: 'rice', quantity: '2 cups', metricValue: null, metricUnit: null, category: 'Produce', needed: true }]);
});

test('old Retry controls use the latest remembered payload and can overlap', async () => {
  const { mock } = await openChat(ChatBot, endpoint, { status: 503, body: 'failed' });
  sendChat(inputLabel, 'first');
  await screen.findByText(errorText);
  sendChat(inputLabel, 'second');
  await waitFor(() => expect(screen.getAllByText(errorText)).toHaveLength(2));
  const retry = screen.getAllByRole('button', { name: 'Retry last message' })[0];
  fireEvent.click(retry);
  fireEvent.click(retry);
  await waitFor(() => expect(mock.for(endpoint)).toHaveLength(4));
  expect(mock.for(endpoint).map(call => call.body.message)).toEqual(['first', 'second', 'second', 'second']);
  await waitFor(() => expect(screen.getAllByText(errorText)).toHaveLength(4));
});

test('screen-owned history still prefers raw_content and restores cards', async () => {
  await openChat(ChatBot, endpoint, [], chatProps(), [{
    id: 9, message: { type: 'ai', content: 'ignored history text' },
    raw_content: JSON.stringify({ output: recipes }),
  }]);
  expect(await screen.findByRole('heading', { name: 'Lemon rice' })).toBeInTheDocument();
  expect(screen.queryByText('ignored history text')).not.toBeInTheDocument();
});
