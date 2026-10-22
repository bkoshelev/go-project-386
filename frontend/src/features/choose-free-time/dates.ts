import type { EventAvailability } from "../../api/generated";

export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function windowDates(availability: EventAvailability) {
  const date = new Date(availability.windowStartsAt);
  date.setHours(0, 0, 0, 0);
  const end = new Date(Date.parse(availability.windowEndsAt) - 1);
  const dates: string[] = [];
  while (localDate(date) <= localDate(end)) {
    dates.push(localDate(date));
    date.setDate(date.getDate() + 1);
  }
  return dates;
}
