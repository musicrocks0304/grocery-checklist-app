/**
 * Shared week date utilities used across all components.
 * Canonical source — do not duplicate in individual components.
 */

const getOrdinalSuffix = (day) => {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

/**
 * Returns a human-readable week date range string.
 * Example: "For the week of June 15th to June 21st, 2025"
 *
 * Logic: If today is Thu/Fri/Sat (dayOfWeek >= 4), returns next week.
 * Otherwise returns current week (Sun-Sat).
 */
export const getWeekDateRange = () => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday

  // If Thursday (4), Friday (5), or Saturday (6), show next week
  const showNextWeek = dayOfWeek >= 4;

  // Find the Sunday of the current week
  const daysToSunday = dayOfWeek;
  const currentWeekSunday = new Date(today);
  currentWeekSunday.setDate(today.getDate() - daysToSunday);

  // Determine which Sunday to use as the start
  const targetSunday = new Date(currentWeekSunday);
  if (showNextWeek) {
    targetSunday.setDate(targetSunday.getDate() + 7);
  }

  // Get the Saturday (6 days after Sunday)
  const targetSaturday = new Date(targetSunday);
  targetSaturday.setDate(targetSunday.getDate() + 6);

  // Format the dates
  const formatDate = (date) => {
    const day = date.getDate();
    const month = date.toLocaleDateString("en-US", { month: "long" });
    return `${month} ${day}${getOrdinalSuffix(day)}`;
  };

  const year = targetSunday.getFullYear();
  return `For the week of ${formatDate(targetSunday)} to ${formatDate(targetSaturday)}, ${year}`;
};

/**
 * Returns structured week date data for API calls and database storage.
 * {
 *   startDate: "2025-06-15"  (YYYY-MM-DD, Sunday)
 *   endDate: "2025-06-21"    (YYYY-MM-DD, Saturday)
 *   displayRange: "For the week of June 15th to June 21st, 2025"
 * }
 */
export const getWeekDates = () => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const showNextWeek = dayOfWeek >= 4;

  const daysToSunday = dayOfWeek;
  const currentWeekSunday = new Date(today);
  currentWeekSunday.setDate(today.getDate() - daysToSunday);

  const targetSunday = new Date(currentWeekSunday);
  if (showNextWeek) {
    targetSunday.setDate(targetSunday.getDate() + 7);
  }

  const targetSaturday = new Date(targetSunday);
  targetSaturday.setDate(targetSunday.getDate() + 6);

  // Format dates for SQL (YYYY-MM-DD) using local time components.
  // toISOString() converts to UTC — in evening hours that shifts the date forward
  // by one day, causing weekStartDate to disagree with WGL.week_start_date and
  // breaking selection_check/uncheck DELETEs (silent no-op).
  const formatDateForSQL = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  return {
    startDate: formatDateForSQL(targetSunday),
    endDate: formatDateForSQL(targetSaturday),
    displayRange: getWeekDateRange(),
  };
};

/**
 * Parse a date-only value (DATE column, "YYYY-MM-DD" or ISO string) as LOCAL
 * midnight. `new Date("2026-07-11")` parses as UTC midnight, which is the
 * previous evening in Texas — coupons showed "Expired" and deals were hidden
 * for the whole of their final valid day.
 */
export const parseLocalDay = (value) => {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return new Date(`${s}T00:00:00`);
};

/**
 * Build the same {startDate, endDate, displayRange} shape as getWeekDates()
 * but for an EXPLICIT week start date (YYYY-MM-DD Sunday). Used by partner
 * shopping sessions: the joiner must adopt the HOST's week wholesale — mixing
 * the host's week_start_date with the joiner's locally-computed display
 * string breaks the list fetch and progress JOIN when the two devices sit on
 * opposite sides of the Thursday week flip.
 */
export const getWeekDatesFor = (weekStartDate) => {
  const targetSunday = parseLocalDay(weekStartDate);
  if (!targetSunday || Number.isNaN(targetSunday.getTime())) return null;
  const targetSaturday = new Date(targetSunday);
  targetSaturday.setDate(targetSunday.getDate() + 6);

  const formatDateForSQL = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const formatDisplay = (date) => {
    const day = date.getDate();
    const month = date.toLocaleDateString("en-US", { month: "long" });
    return `${month} ${day}${getOrdinalSuffix(day)}`;
  };

  return {
    startDate: formatDateForSQL(targetSunday),
    endDate: formatDateForSQL(targetSaturday),
    displayRange: `For the week of ${formatDisplay(targetSunday)} to ${formatDisplay(targetSaturday)}, ${targetSunday.getFullYear()}`,
  };
};
