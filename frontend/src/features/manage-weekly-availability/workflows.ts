import {
  getSchedulingSettings,
  getWeeklyAvailability,
  initializeScheduleTimeZone,
  updateWeeklyAvailability,
  type WeeklyAvailability,
} from "../../api/generated";
import { validateWeek } from "./validation";

export type FieldErrors = Record<string, string>;
export type SaveResult =
  | { kind: "saved"; week: WeeklyAvailability }
  | { kind: "rejected"; fields: FieldErrors }
  | { kind: "unknown" };

export async function readSchedule(signal: AbortSignal) {
  const [settings, week] = await Promise.all([
    getSchedulingSettings({ signal, throwOnError: true }),
    getWeeklyAvailability({ signal, throwOnError: true }),
  ]);
  return { timeZone: settings.data.timeZone, week: week.data };
}

type InitializationResult =
  | { kind: "initialized"; timeZone: string }
  | { kind: "detectionFailed" | "rejected" | "unknown" };

export async function initializeTimeZone(signal: AbortSignal): Promise<InitializationResult> {
  let detected: string;
  try {
    detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected) return { kind: "detectionFailed" };
  } catch {
    return { kind: "detectionFailed" };
  }
  try {
    const result = await initializeScheduleTimeZone({ body: { timeZone: detected }, signal });
    if (!result.response) return { kind: "unknown" };
    if (!result.response.ok) return { kind: "rejected" };
    if (
      result.response.status === 200 &&
      typeof result.data?.timeZone === "string" &&
      result.data.timeZone
    ) {
      return { kind: "initialized", timeZone: result.data.timeZone };
    }
  } catch {
    return { kind: "unknown" };
  }
  return { kind: "unknown" };
}

function confirmedWeek(value: unknown): value is WeeklyAvailability {
  if (
    !value ||
    typeof value !== "object" ||
    !("days" in value) ||
    !Array.isArray(value.days) ||
    value.days.length !== 7
  )
    return false;
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  return (
    value.days.every((day: unknown, index: number) => {
      if (
        !day ||
        typeof day !== "object" ||
        !("weekday" in day) ||
        day.weekday !== weekdays[index] ||
        !("isBlocked" in day) ||
        typeof day.isBlocked !== "boolean" ||
        !("intervals" in day) ||
        !Array.isArray(day.intervals)
      )
        return false;
      return day.intervals.every(
        (interval: unknown) =>
          interval &&
          typeof interval === "object" &&
          "start" in interval &&
          typeof interval.start === "string" &&
          "end" in interval &&
          typeof interval.end === "string",
      );
    }) && Object.keys(validateWeek(value as WeeklyAvailability)).length === 0
  );
}

export async function saveWeek(body: WeeklyAvailability, signal: AbortSignal): Promise<SaveResult> {
  try {
    const result = await updateWeeklyAvailability({ body, signal });
    if (!result.response) return { kind: "unknown" };
    if (!result.response.ok) {
      const fields =
        result.error?.code === "validation_error"
          ? Object.fromEntries(result.error.fields.map((issue) => [issue.field, issue.message]))
          : {};
      return { kind: "rejected", fields };
    }
    if (result.response.status === 200 && confirmedWeek(result.data))
      return { kind: "saved", week: result.data };
  } catch {
    return { kind: "unknown" };
  }
  return { kind: "unknown" };
}
