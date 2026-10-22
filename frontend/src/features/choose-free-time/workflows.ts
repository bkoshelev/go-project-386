import {
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
