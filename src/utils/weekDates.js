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

  // Format dates for SQL (YYYY-MM-DD)
  const formatDateForSQL = (date) => {
    return date.toISOString().split("T")[0];
  };

  return {
    startDate: formatDateForSQL(targetSunday),
    endDate: formatDateForSQL(targetSaturday),
    displayRange: getWeekDateRange(),
  };
};
