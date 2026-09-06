// Every hermetic test runs with the browser clock frozen inside this week, and
// every fixture is rewritten to it by the recorder, so the app's week logic
// (Thursday+ rolls forward) always resolves to these values.
export const WEEK = {
  startDate: '2026-09-06',
  endDate: '2026-09-12',
  displayRange: 'For the week of September 6th to September 12th, 2026',
  frozenClock: '2026-09-09T10:00:00',
};
