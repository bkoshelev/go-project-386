import type { WeeklyAvailability, Weekday } from "../../api/generated";
import { validateWeek } from "./validation";

export const dayNames: Record<Weekday, string> = {
  monday: "Понедельник",
  tuesday: "Вторник",
  wednesday: "Среда",
  thursday: "Четверг",
  friday: "Пятница",
  saturday: "Суббота",
  sunday: "Воскресенье",
};
export const shortDayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function projectWeek(week: WeeklyAvailability) {
  const errors = validateWeek(week);
  let minutes = 0;
  let days = 0;
  const rows = week.days.map((day, index) => {
    const invalid = Object.keys(errors).some((path) => path.startsWith(`/days/${index}/`));
    const blocks =
      invalid || day.isBlocked
        ? []
        : day.intervals.map((interval) => ({
            ...interval,
            left: (clockMinutes(interval.start) / 1440) * 100,
            width: ((clockMinutes(interval.end) - clockMinutes(interval.start)) / 1440) * 100,
          }));
    if (blocks.length) {
      days++;
      for (const interval of day.intervals)
        minutes += clockMinutes(interval.end) - clockMinutes(interval.start);
    }
    return { invalid, blocks };
  });
  return {
    rows,
    summary: Object.keys(errors).length
      ? null
      : {
          minutes,
          days,
          duration: `${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ""}`,
        },
  };
}

function clockMinutes(clock: string) {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}
