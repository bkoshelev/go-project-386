import type { APIRequestContext } from "@playwright/test";
import { expect } from "./fixtures";

const weekPath = "/api/admin/availability/weekly";
const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export async function prepareBooking(request: APIRequestContext) {
  const events: { id: string; name: string }[] = [];
  for (const [name, durationMinutes] of [
    ["Обсуждение", 30],
    ["Короткая встреча", 15],
  ] as const) {
    const response = await request.post("/api/admin/event-types", {
      data: { name, durationMinutes },
    });
    expect(response.status()).toBe(201);
    events.push(await response.json());
  }
  expect(
    (
      await request.post("/api/admin/scheduling-settings/time-zone", { data: { timeZone: "UTC" } })
    ).status(),
  ).toBe(200);
  const week = {
    days: weekdays.map((weekday) => ({
      weekday,
      isBlocked: false,
      intervals: [{ start: "00:00", end: "24:00" }],
    })),
  };
  expect((await request.put(weekPath, { data: week })).status()).toBe(200);
  const availability = await (
    await request.get(`/api/event-types/${events[0].id}/availability`)
  ).json();
  const tomorrow = new Date(availability.windowStartsAt);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(10);
  return { events, week, start: tomorrow.toISOString().replace(".000Z", "Z") };
}

export function booking(eventTypeId: string, startsAt: string) {
  return { eventTypeId, startsAt, guest: { name: " Анна ", email: " anna@example.com " } };
}
