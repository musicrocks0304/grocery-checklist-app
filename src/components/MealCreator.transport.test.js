import { fireEvent, screen } from '@testing-library/react';
import MealCreator from './MealCreator';
import { installMockFetch } from '../test-utils/mockFetch';
import { chatProps, chatTransportContract, openChat, sendChat, queryTypingIndicator } from '../test-utils/chatTransportContract';

const endpoint = '/meal_creator_propose';
const inputLabel = "Describe what you're craving";
const errorText = 'Something went wrong generating proposals. Please try again!';
chatTransportContract({
  Component: MealCreator, endpoint, inputLabel, context: 'meal_creation', sessionPrefix: 'creator',
  retryName: 'Retry', okReply: { output: { message: 'Creator reply' } }, okText: 'Creator reply',
  errorText, timeoutText: 'That took too long — please try again with a simpler description.', planner: false,
});

test('Creator 500 remains retryable', async () => {
  const { mock, container } = await openChat(MealCreator, endpoint, { status: 500, body: 'workflow failed' });
  sendChat(inputLabel, 'idea');
  await screen.findByText(errorText);
  expect(screen.getByRole('button', { name: 'Retry', exact: true })).toBeInTheDocument();
  expect(queryTypingIndicator(container)).toBeNull();
  expect(mock.for(endpoint)).toHaveLength(1);
});

const proposal = { name: 'Lemon rice', description: 'Bright rice', cuisineStyle: 'Mediterranean', protein: 'Beans', kidVehicle: 'Bowl', adultTwist: 'Chili', estimatedTotalTime: 20 };
const output = { responseType: 'recipe_proposals', message: 'Pick an idea', proposals: [proposal] };
test.each([
  ['direct object', output], ['array', [output]], ['object output', { output }],
  ['JSON string output', { output: JSON.stringify(output) }],
])('Creator retains %s proposal parsing', async (_name, reply) => {
  await openChat(MealCreator, endpoint, reply);
  sendChat(inputLabel, 'invent dinner');
  await screen.findByText('Pick an idea');
  expect(screen.getByRole('heading', { name: 'Lemon rice' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Build This Recipe' })).toBeInTheDocument();
});

test.each([
  ['plain output string', { output: 'plain output' }],
  ['planner body wrapper', { response: { body: [{ output }] } }],
])('Creator keeps %s as its existing JSON fallback', async (_name, reply) => {
  await openChat(MealCreator, endpoint, reply);
  sendChat(inputLabel, 'invent dinner');
  await screen.findByText(JSON.stringify(reply));
  expect(screen.queryByRole('button', { name: 'Build This Recipe' })).not.toBeInTheDocument();
});

test('Creator history keeps message content and ignores planner raw_content', async () => {
  await openChat(MealCreator, endpoint, [], chatProps(), [{
    id: 1, message: { type: 'ai', content: JSON.stringify(output) }, raw_content: 'ignored creator history',
  }]);
  expect(await screen.findByRole('heading', { name: 'Lemon rice' })).toBeInTheDocument();
  expect(screen.queryByText('ignored creator history')).not.toBeInTheDocument();
});

test('proposal cards still feed screen-owned build, preview and save phases', async () => {
  await openChat(MealCreator, endpoint, output);
  const recipe = { recipe_name: 'Lemon rice', recipe_description: 'Built rice', ingredients: [], instructions: [], tags: [] };
  const mock = installMockFetch({
    [endpoint]: output,
    '/meal_creator_build': { output: { responseType: 'full_recipe', recipe } },
    '/meal_creator_save': { success: true, recipeName: 'Lemon rice', recipeId: 23, ingredientsProcessed: 0, instructionsProcessed: 0, tagsProcessed: 0 },
  });
  sendChat(inputLabel, 'invent dinner');
  fireEvent.click(await screen.findByRole('button', { name: 'Build This Recipe' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save to Recipe Book' }));
  expect(await screen.findByRole('heading', { name: 'Recipe Saved!' })).toBeInTheDocument();
  expect(mock.calls().map(call => new URL(call.url).pathname.split('/').pop())).toEqual(['meal_creator_propose', 'meal_creator_build', 'meal_creator_save']);
  expect(mock.for('/meal_creator_build')[0].body).toEqual(expect.objectContaining({ proposalName: proposal.name, proposalDescription: proposal.description }));
  expect(mock.for('/meal_creator_save')[0].body).toEqual({ recipe });
  expect(mock.unmocked()).toEqual([]);
});

test('failed build returns to the existing proposal conversation', async () => {
  await openChat(MealCreator, endpoint, output);
  const mock = installMockFetch({ [endpoint]: output, '/meal_creator_build': { status: 500, body: 'failed' } });
  sendChat(inputLabel, 'invent dinner');
  fireEvent.click(await screen.findByRole('button', { name: 'Build This Recipe' }));
  expect(await screen.findByLabelText(inputLabel)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Build This Recipe' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Save to Recipe Book' })).not.toBeInTheDocument();
  expect(mock.for('/meal_creator_build')).toHaveLength(1);
});
