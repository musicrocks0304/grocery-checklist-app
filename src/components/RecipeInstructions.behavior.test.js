import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { renderWithProviders } from '../test-utils/render';
import { installMockFetch, restoreFetch } from '../test-utils/mockFetch';
import RecipeInstructions from './RecipeInstructions';

jest.mock('canvas-confetti', () => jest.fn());
jest.mock('react-hot-toast', () => {
  const mockToast = jest.fn();
  mockToast.success = jest.fn();
  mockToast.error = jest.fn();
  return { __esModule: true, default: mockToast };
});

const meals = [{ id: 3, recipeId: 3, name: 'Timer supper' }];
const instructions = (durations = [1, 2, 0]) => [{
  output: durations.map((minutes, index) => ({
    recipe_id: 3, step_number: index + 1,
    instruction_text: ['First action', 'Second action', 'Third action'][index],
    time_minutes: minutes, ingredients_used: [],
  })),
  all_ingredients: [],
}];
const tick = async ms => {
  await act(async () => { jest.advanceTimersByTime(ms); });
};
const timerControl = icon => {
  const time = screen.getByText(/^\d{2}:\d{2}$/);
  // eslint-disable-next-line testing-library/no-node-access -- Existing timer buttons have no accessible name; characterize unchanged markup.
  return time.parentElement.querySelector(`svg.lucide-${icon}`).closest('button');
};
const readSaved = () => JSON.parse(localStorage.getItem('recipeInstructionState'));
async function mountCook(reply = instructions()) {
  const mock = installMockFetch({ '/grab_instructions_fast': reply });
  const view = renderWithProviders(<RecipeInstructions selectedMeals={meals} onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start Cooking' }));
  await screen.findByText('First action');
  expect(mock.for('/grab_instructions_fast')).toHaveLength(1);
  expect(mock.unmocked()).toEqual([]);
  return { mock, ...view };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-10T15:00:00Z'));
  localStorage.clear();
  localStorage.setItem('recipeSwipeHintShown', 'true');
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  restoreFetch();
  localStorage.clear();
});

test('running replacement keeps the existing tick cadence; decline, pause and cancel retain their contracts', async () => {
  await mountCook();
  fireEvent.click(screen.getByRole('button', { name: 'Start 1 mins Timer' }));
  await tick(500);
  fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole('button', { name: 'Start 2 mins Timer' }));
  expect(screen.getByText('01:00')).toBeInTheDocument();
  expect(window.confirm).toHaveBeenCalledWith('A timer is already running. Replace it?');
  fireEvent.click(screen.getByRole('button', { name: 'Start 2 mins Timer' }));
  expect(screen.getByText('02:00')).toBeInTheDocument();
  await tick(499);
  expect(screen.getByText('02:00')).toBeInTheDocument();
  await tick(1);
  expect(screen.getByText('01:59')).toBeInTheDocument();
  fireEvent.click(timerControl('pause'));
  await tick(3000);
  expect(screen.getByText('01:59')).toBeInTheDocument();
  const confirmations = window.confirm.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Start 2 mins Timer' }));
  expect(window.confirm).toHaveBeenCalledTimes(confirmations);
  fireEvent.click(timerControl('x'));
  expect(screen.queryByText(/^\d{2}:\d{2}$/)).not.toBeInTheDocument();
  expect(readSaved()).toEqual(expect.objectContaining({ timerSeconds: 0, timerStepIndex: null }));
});

test('timer belongs to its starting step; finish shows the existing toast without completing or advancing the step', async () => {
  await mountCook();
  fireEvent.click(screen.getByRole('button', { name: 'Start 1 mins Timer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  expect(screen.getByRole('heading', { name: 'Step 2' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Step 1', exact: true }));
  expect(screen.getByRole('heading', { name: 'Step 1' })).toBeInTheDocument();
  // Separate acts model individual React interval renders at the finish boundary.
  for (let index = 0; index < 60; index += 1) await tick(1000);
  expect(screen.queryByText(/^\d{2}:\d{2}$/)).not.toBeInTheDocument();
  expect(toast.success).toHaveBeenCalledWith('Timer complete! This step is done.', {
    duration: 6000, style: { fontSize: '16px', fontWeight: 'bold' },
  });
  expect(screen.getByRole('heading', { name: 'Step 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Complete', exact: true })).toBeInTheDocument();
  expect(readSaved()).toEqual(expect.objectContaining({ completedSteps: [], timerSeconds: 0, timerStepIndex: 0 }));
});

test('saved time restores paused without elapsed subtraction and survives selection while paused', async () => {
  localStorage.setItem('recipeInstructionState', JSON.stringify({
    selectedRecipeId: 3, currentStep: 1, completedSteps: [], timerSeconds: 47,
    timerStepIndex: 0, savedAt: Date.now() - 3600000, recipeName: 'Timer supper',
  }));
  const mock = installMockFetch({ '/grab_instructions_fast': instructions() });
  renderWithProviders(<RecipeInstructions selectedMeals={meals} onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Resume', exact: true }));
  await screen.findByText('Second action');
  expect(screen.getByText('00:47')).toBeInTheDocument();
  await tick(3000);
  expect(screen.getByText('00:47')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(screen.queryByText('00:47')).not.toBeInTheDocument();
  expect(localStorage.getItem('recipeInstructionState')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Start Cooking' }));
  await screen.findByText('First action');
  expect(screen.getByText('00:47')).toBeInTheDocument();
  expect(mock.for('/grab_instructions_fast')).toHaveLength(2);
  fireEvent.click(timerControl('play'));
  await tick(1000);
  expect(screen.getByText('00:46')).toBeInTheDocument();
});

test('running Back clears timer state and unmount clears its interval', async () => {
  const { unmount } = await mountCook();
  const setIntervalSpy = jest.spyOn(global, 'setInterval');
  const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
  fireEvent.click(screen.getByRole('button', { name: 'Start 1 mins Timer' }));
  const firstInterval = setIntervalSpy.mock.results[0].value;
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(clearIntervalSpy).toHaveBeenCalledWith(firstInterval);
  fireEvent.click(screen.getByRole('button', { name: 'Start Cooking' }));
  await screen.findByText('First action');
  expect(screen.queryByText(/^\d{2}:\d{2}$/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Start 1 mins Timer' }));
  const finalInterval = setIntervalSpy.mock.results[setIntervalSpy.mock.results.length - 1].value;
  unmount();
  expect(clearIntervalSpy).toHaveBeenCalledWith(finalInterval);
  await tick(61000);
  expect(toast.success).not.toHaveBeenCalledWith('Timer complete! This step is done.', expect.anything());
});

test.each([
  [1, '1 mins', '01:00'], [0.5, '0.5 mins', '00:30'],
  ['1-2', '1-2 mins', '01:00'], [-1, '-1 mins', '01:00'],
])('duration %p retains the current numeric-or-first-integer parser', async (value, label, time) => {
  await mountCook(instructions([value, 2, 0]));
  fireEvent.click(screen.getByRole('button', { name: `Start ${label} Timer` }));
  expect(screen.getByText(time)).toBeInTheDocument();
});

test('zero duration has no timer button and instruction fallback differs from request failure/retry', async () => {
  const view = await mountCook(instructions([0, 2, 0]));
  expect(screen.queryByRole('button', { name: /Start .* Timer/ })).not.toBeInTheDocument();
  view.unmount();
  localStorage.clear();
  let attempts = 0;
  const mock = installMockFetch({ '/grab_instructions_fast': () => {
    attempts += 1;
    return attempts === 1 ? { status: 403, body: { message: 'denied' } } : [];
  } });
  renderWithProviders(<RecipeInstructions selectedMeals={meals} onNavigate={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start Cooking' }));
  await screen.findByRole('heading', { name: 'Unable to Load Recipe' });
  expect(screen.queryByText('(Sample)')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry', exact: true }));
  expect(await screen.findByText('(Sample)')).toBeInTheDocument();
  expect(mock.for('/grab_instructions_fast')).toHaveLength(2);
  expect(mock.unmocked()).toEqual([]);
});

test.each(['next', 'previous', 'jump', 'swipe'])('auto-advance retains the %s navigation policy', async navigation => {
  await mountCook();
  if (navigation === 'previous') fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  fireEvent.click(screen.getByRole('button', { name: 'Complete', exact: true }));
  if (navigation === 'next') fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  if (navigation === 'previous') fireEvent.click(screen.getByRole('button', { name: 'Previous Step' }));
  if (navigation === 'jump') {
    fireEvent.click(screen.getByRole('button', { name: 'All steps' }));
    fireEvent.click(screen.getByRole('button', { name: /Second action/ }));
  }
  if (navigation === 'swipe') {
    const paragraph = screen.getByText('First action');
    fireEvent.touchStart(paragraph, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(paragraph, { changedTouches: [{ clientX: 80, clientY: 100 }] });
  }
  await tick(500);
  const expected = navigation === 'next' ? 2 : navigation === 'previous' ? 1 : 3;
  expect(screen.getByRole('heading', { name: `Step ${expected}` })).toBeInTheDocument();
});

test('recipe selection retains the selectedMeals snapshot from mount', async () => {
  const mock = installMockFetch({ '/choose_recipe_instructions': [] });
  const view = render(<RecipeInstructions selectedMeals={[]} onNavigate={jest.fn()} />);
  await screen.findByText('No meals planned yet');
  view.rerender(<RecipeInstructions selectedMeals={meals} onNavigate={jest.fn()} />);
  expect(screen.getByText('No meals planned yet')).toBeInTheDocument();
  await waitFor(() => expect(mock.for('/choose_recipe_instructions')).toHaveLength(1));
});
