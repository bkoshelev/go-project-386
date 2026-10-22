import { expect, test } from "./fixtures";
import { prepareBooking, booking } from "./booking-fixtures";
const bookingPath = "/api/bookings";
const ownerPath = "/api/admin/bookings";
const weekPath = "/api/admin/availability/weekly";

test("сохранение подтверждается после записи и доступно владельцу после перезапуска", async ({
  request,
  backend,
}) => {
  const { events, start } = await prepareBooking(request);
  expect(await (await request.get(ownerPath)).json()).toMatchObject({ items: [] });
  const response = await request.post(bookingPath, { data: booking(events[0].id, start) });
  expect(response.status()).toBe(201);
  const saved = await response.json();
  expect(saved).toEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    status: "confirmed",
    eventTypeId: events[0].id,
    eventTypeName: "Обсуждение",
    startsAt: start,
    endsAt: start.replace("10:00", "10:30"),
  });
  await backend.restart();
  const list = await (await request.get(ownerPath)).json();
  expect(Date.parse(list.asOf)).toBeGreaterThan(0);
  expect(list.items).toEqual([{ ...saved, guest: { name: "Анна", email: "anna@example.com" } }]);
});

for (const differentTypes of [false, true]) {
  test(`конкурирующие запросы ${differentTypes ? "разных" : "одного"} типов дают один 201 и один 409`, async ({
    request,
  }) => {
    const { events, start } = await prepareBooking(request);
    const results = await Promise.all(
      events.map((event) =>
        request.post(bookingPath, {
          data: booking(differentTypes ? event.id : events[0].id, start),
        }),
      ),
    );
    expect(results.map((response) => response.status()).sort((a, b) => a - b)).toEqual([201, 409]);
    const conflict = results.find((response) => response.status() === 409)!;
    expect(await conflict.json()).toEqual({ code: "time_occupied", message: "Время уже занято" });
    for (const event of events) {
      const repeat = await request.post(bookingPath, { data: booking(event.id, start) });
      expect(repeat.status()).toBe(409);
      expect(await repeat.json()).toMatchObject({ code: "time_occupied" });
      const available = await (
        await request.get(`/api/event-types/${event.id}/availability`)
      ).json();
      expect(available.slots.some((slot: { startsAt: string }) => slot.startsAt === start)).toBe(
        false,
      );
      expect(JSON.stringify(available)).not.toContain("anna@example.com");
      expect(JSON.stringify(available)).not.toContain("guest");
    }
    expect((await (await request.get(ownerPath)).json()).items).toHaveLength(1);
  });
}

test("валидация полей и формата не сохраняет встреч, повтор несохранённой попытки возможен", async ({
  request,
}) => {
  const { events, start } = await prepareBooking(request);
  for (const [data, field] of [
    [{ ...booking(events[0].id, start), endsAt: start }, "/endsAt"],
    [{ ...booking(events[0].id, start), eventTypeId: "bad-id" }, "/eventTypeId"],
    [{ ...booking(events[0].id, start), startsAt: start.replace(":00Z", ":01Z") }, "/startsAt"],
    [{ ...booking(events[0].id, start), startsAt: "tomorrow" }, "/startsAt"],
    [{ ...booking(events[0].id, start), guest: { name: "Анна", email: "bad" } }, "/guest/email"],
    [
      {
        ...booking(events[0].id, start),
        guest: { name: "Анна", email: "anna@example.com", phone: "123" },
      },
      "/guest/phone",
    ],
  ] as const) {
    const response = await request.post(bookingPath, { data });
    expect(response.status(), JSON.stringify(data)).toBe(422);
    expect((await response.json()).fields).toContainEqual(expect.objectContaining({ field }));
  }
  const malformed = await request.post(bookingPath, {
    data: Buffer.from("{"),
    headers: { "Content-Type": "application/json" },
  });
  expect(malformed.status()).toBe(400);
  expect((await (await request.get(ownerPath)).json()).items).toEqual([]);
  expect((await request.post(bookingPath, { data: booking(events[0].id, start) })).status()).toBe(
    201,
  );
  expect((await (await request.get(ownerPath)).json()).items).toHaveLength(1);
});

test("новые записи используют целостную неделю при конкурентной замене, прежние записи остаются", async ({
  request,
}) => {
  const { events, week, start } = await prepareBooking(request);
  const late = new Date(start);
  late.setUTCHours(23, 45);
  const closed = structuredClone(week);
  for (const day of closed.days) day.isBlocked = true;
  const first = structuredClone(closed);
  const second = structuredClone(closed);
  const nextDay = (late.getUTCDay() + 6) % 7;
  first.days[nextDay].isBlocked = false;
  second.days[(nextDay + 1) % 7].isBlocked = false;
  expect((await request.put(weekPath, { data: first })).status()).toBe(200);
  await Promise.all(
    Array.from({ length: 12 }, async (_, index) => {
      expect((await request.put(weekPath, { data: index % 2 ? first : second })).status()).toBe(
        200,
      );
      const response = await request.post(bookingPath, {
        data: booking(events[0].id, late.toISOString()),
      });
      expect(response.status()).toBe(409);
      expect(await response.json()).toMatchObject({
        code: "time_unavailable",
        reason: "outside_working_hours",
      });
    }),
  );
  expect((await (await request.get(ownerPath)).json()).items).toHaveLength(0);
  expect((await request.put(weekPath, { data: week })).status()).toBe(200);
  expect((await request.post(bookingPath, { data: booking(events[0].id, start) })).status()).toBe(
    201,
  );
  expect((await request.put(weekPath, { data: closed })).status()).toBe(200);
  const stale = await request.post(bookingPath, { data: booking(events[1].id, start) });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({
    code: "time_unavailable",
    reason: "outside_working_hours",
  });
  expect((await (await request.get(ownerPath)).json()).items).toHaveLength(1);
});

test("общая пауза учитывается в обе стороны между типами, касание границ допустимо", async ({
  request,
}) => {
  const { events, start } = await prepareBooking(request);
  expect((await request.post(bookingPath, { data: booking(events[0].id, start) })).status()).toBe(
    201,
  );
  expect(
    (
      await request.put("/api/admin/scheduling-settings", { data: { meetingPauseMinutes: 15 } })
    ).status(),
  ).toBe(200);
  for (const offset of [-15, 30]) {
    const response = await request.post(bookingPath, {
      data: booking(events[1].id, new Date(Date.parse(start) + offset * 60_000).toISOString()),
    });
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ code: "time_occupied" });
  }
  for (const offset of [-30, 45]) {
    const response = await request.post(bookingPath, {
      data: booking(events[1].id, new Date(Date.parse(start) + offset * 60_000).toISOString()),
    });
    expect(response.status()).toBe(201);
  }
  expect((await (await request.get(ownerPath)).json()).items).toHaveLength(3);
});
