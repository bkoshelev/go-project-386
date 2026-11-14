import { expect, test } from "./fixtures";
import { prepareBooking, booking } from "./booking-fixtures";

const settings = "/api/admin/scheduling-settings";
const bookings = "/api/bookings";
const ownerBookings = "/api/admin/bookings";
const plusMinutes = (start: string, minutes: number) =>
  new Date(Date.parse(start) + minutes * 60_000).toISOString();

test("пауза отклоняет неполный и неверно типизированный запрос без изменения настроек", async ({
  request,
}) => {
  expect((await request.put(settings, { data: { meetingPauseMinutes: 15 } })).status()).toBe(200);
  for (const data of [
    {},
    { meetingPauseMinutes: null },
    { meetingPauseMinutes: "15" },
    { meetingPauseMinutes: true },
  ]) {
    const response = await request.put(settings, { data });
    expect(response.status()).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "validation_error",
      fields: [expect.objectContaining({ field: "/meetingPauseMinutes" })],
    });
  }
  expect(await (await request.get(settings)).json()).toEqual({ meetingPauseMinutes: 15 });
});

test("повышение и снижение паузы меняют новые слоты, существующие встречи неизменны", async ({
  request,
}) => {
  const { events, start } = await prepareBooking(request);
  for (const [event, offset] of [
    [events[0], 0],
    [events[1], 30],
  ] as const) {
    expect(
      (
        await request.post(bookings, { data: booking(event.id, plusMinutes(start, offset)) })
      ).status(),
    ).toBe(201);
  }
  const before = (await (await request.get(ownerBookings)).json()).items;
  expect(before).toHaveLength(2);
  const candidate = plusMinutes(start, 45);
  const availabilityPath = `/api/event-types/${events[1].id}/availability`;
  const readStarts = async () =>
    (await (await request.get(availabilityPath)).json()).slots.map((s: { startsAt: string }) =>
      Date.parse(s.startsAt),
    );
  expect(await readStarts()).toContain(Date.parse(candidate));
  expect((await request.put(settings, { data: { meetingPauseMinutes: 60 } })).status()).toBe(200);
  expect((await (await request.get(ownerBookings)).json()).items).toEqual(before);
  expect(await readStarts()).not.toContain(Date.parse(candidate));
  const rejected = await request.post(bookings, { data: booking(events[1].id, candidate) });
  expect(rejected.status()).toBe(409);
  expect(await rejected.json()).toMatchObject({ code: "time_occupied" });
  expect((await request.put(settings, { data: { meetingPauseMinutes: 0 } })).status()).toBe(200);
  expect(await readStarts()).toContain(Date.parse(candidate));
  expect((await request.post(bookings, { data: booking(events[1].id, candidate) })).status()).toBe(
    201,
  );
});

test("конкурентные непересекающиеся встречи разных типов не могут нарушить паузу", async ({
  request,
}) => {
  const { events, start } = await prepareBooking(request);
  expect((await request.put(settings, { data: { meetingPauseMinutes: 15 } })).status()).toBe(200);
  for (let round = 0; round < 4; round++) {
    const first = plusMinutes(start, round * 180);
    const second = plusMinutes(first, 30);
    const responses = await Promise.all([
      request.post(bookings, { data: booking(events[0].id, first) }),
      request.post(bookings, { data: booking(events[1].id, second) }),
    ]);
    expect(responses.map((r) => r.status()).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await responses.find((r) => r.status() === 409)!.json()).toMatchObject({
      code: "time_occupied",
    });
    expect((await (await request.get(ownerBookings)).json()).items).toHaveLength(round + 1);
  }
});

test("конкурентная смена паузы и запись имеют последовательный результат", async ({ request }) => {
  const { events, start } = await prepareBooking(request);
  for (let round = 0; round < 4; round++) {
    const anchor = plusMinutes(start, round * 240);
    const candidate = plusMinutes(anchor, 60);
    expect((await request.put(settings, { data: { meetingPauseMinutes: 0 } })).status()).toBe(200);
    expect((await request.post(bookings, { data: booking(events[0].id, anchor) })).status()).toBe(
      201,
    );
    const [update, created] = await Promise.all([
      request.put(settings, { data: { meetingPauseMinutes: 60 } }),
      request.post(bookings, { data: booking(events[1].id, candidate) }),
    ]);
    expect(update.status()).toBe(200);
    expect([201, 409]).toContain(created.status());
    if (created.status() === 409)
      expect(await created.json()).toMatchObject({ code: "time_occupied" });
    const list = (await (await request.get(ownerBookings)).json()).items;
    expect(
      list.some(
        (item: { startsAt: string }) => Date.parse(item.startsAt) === Date.parse(candidate),
      ),
    ).toBe(created.status() === 201);
    const after = await request.post(bookings, {
      data: booking(events[1].id, plusMinutes(candidate, 15)),
    });
    expect(after.status()).toBe(409);
    expect(await after.json()).toMatchObject({ code: "time_occupied" });
    expect((await (await request.get(settings)).json()).meetingPauseMinutes).toBe(60);
  }
});
