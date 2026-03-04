import { getWeekDateRange, getWeekDates } from './weekDates';

describe('getWeekDateRange', () => {
  const RealDate = Date;

  afterEach(() => {
    global.Date = RealDate;
  });

  function mockDate(dateString) {
    const fixed = new RealDate(dateString);
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) return fixed;
        return new RealDate(...args);
      }
    };
  }

  test('returns current week range on a Monday', () => {
    mockDate('2026-03-02T12:00:00'); // Monday
    const range = getWeekDateRange();
    expect(range).toMatch(/^For the week of /);
    expect(range).toMatch(/March 1st to March 7th, 2026/);
  });

  test('returns next week range on a Thursday', () => {
    mockDate('2026-03-05T12:00:00'); // Thursday
    const range = getWeekDateRange();
    expect(range).toMatch(/March 8th to March 14th, 2026/);
  });

  test('returns current week range on a Sunday', () => {
    mockDate('2026-03-01T12:00:00'); // Sunday
    const range = getWeekDateRange();
    expect(range).toMatch(/March 1st to March 7th, 2026/);
  });
});

describe('getWeekDates', () => {
  const RealDate = Date;

  afterEach(() => {
    global.Date = RealDate;
  });

  function mockDate(dateString) {
    const fixed = new RealDate(dateString);
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) return fixed;
        return new RealDate(...args);
      }
    };
  }

  test('returns startDate as Sunday and endDate as Saturday in YYYY-MM-DD format', () => {
    mockDate('2026-03-02T12:00:00'); // Monday
    const { startDate, endDate, displayRange } = getWeekDates();
    expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof displayRange).toBe('string');
    expect(startDate).toBe('2026-03-01');
    expect(endDate).toBe('2026-03-07');
  });

  test('endDate is always 6 days after startDate', () => {
    mockDate('2026-03-10T12:00:00'); // Tuesday
    const { startDate, endDate } = getWeekDates();
    const start = new RealDate(startDate);
    const end = new RealDate(endDate);
    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(6);
  });
});
