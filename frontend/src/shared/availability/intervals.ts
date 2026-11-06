import type { AvailabilityTimeRange } from "../../api/generated";

const clockTime = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

export function validateIntervals(
  intervals: AvailabilityTimeRange[],
  prefix: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const valid: { start: string; end: string; index: number }[] = [];
  intervals.forEach((interval, index) => {
    const path = `${prefix}/${index}`;
    if (!clockTime.test(interval.start)) {
      errors[`${path}/start`] = "Укажите начало в формате ЧЧ:ММ, от 00:00 до 23:59";
    }
    if (!clockTime.test(interval.end) && interval.end !== "24:00") {
      errors[`${path}/end`] = "Укажите окончание в формате ЧЧ:ММ, от 00:00 до 24:00";
    }
    if (errors[`${path}/start`] || errors[`${path}/end`]) return;
    if (interval.start >= interval.end) {
      errors[`${path}/end`] = "Окончание должно быть позже начала";
    } else {
      valid.push({ ...interval, index });
    }
  });
  let latestEnd = "";
  for (const interval of valid.sort((a, b) => a.start.localeCompare(b.start))) {
    if (interval.start < latestEnd) {
      errors[`${prefix}/${interval.index}/start`] = "Интервалы пересекаются";
    }
    if (interval.end > latestEnd) latestEnd = interval.end;
  }
  return errors;
}
