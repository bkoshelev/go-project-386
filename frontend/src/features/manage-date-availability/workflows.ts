import {
  getDateAvailability,
  updateDateAvailability,
  type DateAvailability,
  type UpdateDateAvailabilityRequest,
} from "../../api/generated";

export async function readDate(date: string, signal: AbortSignal) {
  const result = await getDateAvailability({ path: { date }, signal, throwOnError: true });
  if (!confirmedDate(result.data, date)) throw new Error("Unconfirmed date setting");
  return result.data;
}

function confirmedDate(value: unknown, date: string): value is DateAvailability {
  if (
    !value ||
    typeof value !== "object" ||
    !("date" in value) ||
    value.date !== date ||
    !("isBlocked" in value) ||
    typeof value.isBlocked !== "boolean"
  )
    return false;
  if (!("intervals" in value)) return true;
  return (
    !value.isBlocked &&
    Array.isArray(value.intervals) &&
    value.intervals.every(
      (interval: unknown) =>
        interval &&
        typeof interval === "object" &&
        "start" in interval &&
        typeof interval.start === "string" &&
        "end" in interval &&
        typeof interval.end === "string",
    )
  );
}

type SaveResult =
  | { kind: "saved"; value: DateAvailability }
  | { kind: "rejected"; fields: Record<string, string> }
  | { kind: "unknown" };

export async function saveDate(
  date: string,
  body: UpdateDateAvailabilityRequest,
  signal: AbortSignal,
): Promise<SaveResult> {
  try {
    const result = await updateDateAvailability({ path: { date }, body, signal });
    if (!result.response) return { kind: "unknown" };
    if (!result.response.ok)
      return {
        kind: "rejected",
        fields:
          result.error?.code === "validation_error"
            ? Object.fromEntries(result.error.fields.map((issue) => [issue.field, issue.message]))
            : {},
      };
    if (result.response.status === 200 && confirmedDate(result.data, date))
      return { kind: "saved", value: result.data };
  } catch {
    return { kind: "unknown" };
  }
  return { kind: "unknown" };
}
