import type { WeeklyAvailability } from "../../api/generated";
import { validateIntervals } from "../../shared/availability/intervals";

export function validateWeek(week: WeeklyAvailability): Record<string, string> {
  return Object.assign(
    {},
    ...week.days.map((day, index) => validateIntervals(day.intervals, `/days/${index}/intervals`)),
  );
}
