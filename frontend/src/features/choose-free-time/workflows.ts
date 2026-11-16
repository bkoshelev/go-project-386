import {
  checkEventAvailability,
  getEventAvailability,
  getEventType,
  type EventAvailability,
  type EventType,
} from "../../api/generated";

export type FreeTime = { event: EventType; availability: EventAvailability };

export async function readFreeTime(
  eventTypeId: string,
  signal: AbortSignal,
): Promise<FreeTime | null> {
  const path = { eventTypeId };
  try {
    const [event, availability] = await Promise.all([
      getEventType({ path, signal, throwOnError: true }),
      getEventAvailability({ path, signal, cache: "no-store", throwOnError: true }),
    ]);
    return { event: event.data, availability: availability.data };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "event_type_not_found"
    )
      return null;
    throw error;
  }
}

/** Проверяет введённый гостем абсолютный момент, не резервируя интервал. */
export async function checkFreeTime(
  eventTypeId: string,
  startsAt: string,
  durationMinutes: number,
  signal: AbortSignal,
) {
  const result = (
    await checkEventAvailability({
      path: { eventTypeId },
      body: { startsAt },
      signal,
      cache: "no-store",
      throwOnError: true,
    })
  ).data;
  if (result.available === true) {
    if (
      Date.parse(result.slot?.startsAt) !== Date.parse(startsAt) ||
      Date.parse(result.slot?.endsAt) !== Date.parse(startsAt) + durationMinutes * 60_000
    )
      throw new Error("Некорректный интервал проверки");
  } else if (
    result.available !== false ||
    ![
      "time_occupied",
      "starts_in_past",
      "outside_booking_window",
      "outside_working_hours",
      "schedule_not_initialized",
    ].includes(result.reason)
  ) {
    throw new Error("Некорректный результат проверки");
  }
  return result;
}
