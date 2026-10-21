import { expect, test } from "./fixtures";

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const emptyWeek = {
  days: weekdays.map((weekday) => ({ weekday, isBlocked: true, intervals: [] })),
};
const settingsPath = "/api/admin/scheduling-settings";
const zonePath = `${settingsPath}/time-zone`;
const weekPath = "/api/admin/availability/weekly";

test("расписание закрыто до настройки, первый пояс сохраняется после перезапуска", async ({
  request,
  backend,
}) => {
  expect(await (await request.get(settingsPath)).json()).toEqual({ meetingPauseMinutes: 0 });
  expect(await (await request.get(weekPath)).json()).toEqual(emptyWeek);
  const unopened = await request.put(weekPath, { data: emptyWeek });
  expect(unopened.status()).toBe(409);
  expect(await unopened.json()).toMatchObject({ code: "schedule_not_initialized" });
  const first = await request.post(zonePath, { data: { timeZone: "Europe/Moscow" } });
  expect(first.status()).toBe(200);
  expect(await first.json()).toEqual({ timeZone: "Europe/Moscow", meetingPauseMinutes: 0 });
  const repeated = await request.post(zonePath, { data: { timeZone: "Asia/Tokyo" } });
  expect(repeated.status()).toBe(200);
  expect(await repeated.json()).toEqual({ timeZone: "Europe/Moscow", meetingPauseMinutes: 0 });
  await backend.restart();
  expect(await (await request.get(settingsPath)).json()).toEqual({
    timeZone: "Europe/Moscow",
    meetingPauseMinutes: 0,
  });
  expect(await (await request.get(weekPath)).json()).toEqual(emptyWeek);
});

test("неделя заменяется целиком, блокировка сохраняет местные часы после перезапуска", async ({
  request,
  backend,
}) => {
  await request.post(zonePath, { data: { timeZone: "Europe/Moscow" } });
  const week = structuredClone(emptyWeek) as {
    days: { weekday: string; isBlocked: boolean; intervals: { start: string; end: string }[] }[];
  };
  week.days[0] = {
    weekday: "monday",
    isBlocked: false,
    intervals: [
      { start: "00:00", end: "12:00" },
      { start: "12:00", end: "24:00" },
    ],
  };
  week.days[1]!.isBlocked = false;
  week.days[2] = {
    weekday: "wednesday",
    isBlocked: true,
    intervals: [{ start: "09:00", end: "18:00" }],
  };
  let response = await request.put(weekPath, { data: week });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual(week);
  week.days[0]!.isBlocked = true;
  response = await request.put(weekPath, { data: week });
  expect(response.status()).toBe(200);
  await backend.restart();
  expect(await (await request.get(weekPath)).json()).toEqual(week);
  week.days[0]!.isBlocked = false;
  response = await request.put(weekPath, { data: week });
  expect(response.status()).toBe(200);
  expect(await (await request.get(weekPath)).json()).toEqual(week);
  // These are owner-local times, not guest/server hours. In this fixed-offset example
  // Monday 00:00–24:00 in Moscow spans Sunday 21:00–Monday 21:00 UTC.
  expect(await (await request.get(settingsPath)).json()).toEqual({
    timeZone: "Europe/Moscow",
    meetingPauseMinutes: 0,
  });
});

test("два конкурирующих пояса сохраняют одного победителя, неверные значения не инициализируют", async ({
  request,
}) => {
  for (const data of [
    { timeZone: "Local" },
    { timeZone: "Mars/Olympus" },
    { timeZone: "+03:00" },
    { timeZone: "" },
    {},
    { timeZone: null },
    { timeZone: "UTC", extra: true },
  ]) {
    const response = await request.post(zonePath, { data });
    expect(response.status(), JSON.stringify(data)).toBe(422);
    expect(await response.json()).toMatchObject({ code: "validation_error" });
  }
  expect(await (await request.get(settingsPath)).json()).toEqual({ meetingPauseMinutes: 0 });
  const results = await Promise.all(
    ["Europe/Moscow", "Asia/Tokyo"].map(async (timeZone) => {
      const response = await request.post(zonePath, { data: { timeZone } });
      expect(response.status()).toBe(200);
      return response.json();
    }),
  );
  expect(["Europe/Moscow", "Asia/Tokyo"]).toContain(results[0].timeZone);
  expect(results[1]).toEqual(results[0]);
  expect(await (await request.get(settingsPath)).json()).toEqual(results[0]);
});

test("неверная неделя отклоняется целиком с указателями ошибок", async ({ request }) => {
  await request.post(zonePath, { data: { timeZone: "UTC" } });
  const valid = structuredClone(emptyWeek);
  expect((await request.put(weekPath, { data: valid })).status()).toBe(200);
  for (const [data, field, code] of [
    [{ days: valid.days.slice(1) }, "/days", "out_of_range"],
    [{ days: [...valid.days, valid.days[0]] }, "/days", "out_of_range"],
    [
      { days: valid.days.map((day, index) => (index === 6 ? valid.days[0] : day)) },
      "/days/6/weekday",
      "duplicate_weekday",
    ],
    [
      {
        days: valid.days.map((day, index) => (index === 0 ? { ...day, weekday: "holiday" } : day)),
      },
      "/days/0/weekday",
      "out_of_range",
    ],
    ...(
      [
        [{ start: "18:00", end: "09:00" }, "end", "invalid_interval"],
        [{ start: "09:00", end: "09:00" }, "end", "invalid_interval"],
        [{ start: "24:00", end: "24:00" }, "start", "invalid_format"],
        [{ start: "9:00", end: "18:00" }, "start", "invalid_format"],
        [{ start: "09:00", end: "24:01" }, "end", "invalid_format"],
        [{ start: "09:00", end: "18:00", extra: true }, "extra", "unknown_field"],
      ] as const
    ).map(([interval, property, code]) => [
      {
        days: valid.days.map((day, index) =>
          index === 0 ? { ...day, isBlocked: false, intervals: [interval] } : day,
        ),
      },
      `/days/0/intervals/0/${property}`,
      code,
    ]),
    [
      {
        days: valid.days.map((day, index) =>
          index === 0
            ? {
                ...day,
                intervals: [
                  { start: "09:00", end: "18:00" },
                  { start: "12:00", end: "13:00" },
                ],
              }
            : day,
        ),
      },
      "/days/0/intervals/1/start",
      "overlapping_intervals",
    ],
    [
      {
        days: valid.days.map((day, index) =>
          index === 0 ? { weekday: day.weekday, intervals: [] } : day,
        ),
      },
      "/days/0/isBlocked",
      "required",
    ],
    [
      {
        days: valid.days.map((day, index) =>
          index === 0
            ? { ...day, isBlocked: false, intervals: [{ start: "09:00", end: "18:00" }] }
            : index === 6
              ? { ...day, intervals: [{ start: "18:00", end: "18:00" }] }
              : day,
        ),
      },
      "/days/6/intervals/0/end",
      "invalid_interval",
    ],
    [{ ...valid, timeZone: "Asia/Tokyo" }, "/timeZone", "unknown_field"],
  ] as const) {
    const response = await request.put(weekPath, { data });
    expect(response.status(), JSON.stringify(data)).toBe(422);
    expect((await response.json()).fields).toContainEqual(expect.objectContaining({ field, code }));
    expect(await (await request.get(weekPath)).json()).toEqual(valid);
  }
});

test("одновременные замены и чтения никогда не наблюдают смесь двух недель", async ({
  request,
}) => {
  await request.post(zonePath, { data: { timeZone: "UTC" } });
  const first = {
    days: weekdays.map((weekday) => ({
      weekday,
      isBlocked: false,
      intervals: [{ start: "09:00", end: "12:00" }],
    })),
  };
  const second = {
    days: weekdays.map((weekday) => ({
      weekday,
      isBlocked: true,
      intervals: [{ start: "13:00", end: "24:00" }],
    })),
  };
  await request.put(weekPath, { data: first });
  await Promise.all(
    Array.from({ length: 12 }, async (_, index) => {
      const data = index % 2 === 0 ? first : second;
      const response = await request.put(weekPath, { data });
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(data);
      const observed = await (await request.get(weekPath)).json();
      expect([first, second]).toContainEqual(observed);
    }),
  );
});

test("изменение паузы не принимает пояс и не инициализирует календарь", async ({ request }) => {
  let response = await request.put(settingsPath, {
    data: { meetingPauseMinutes: 10, timeZone: "Asia/Tokyo" },
  });
  expect(response.status()).toBe(422);
  expect((await response.json()).fields).toContainEqual(
    expect.objectContaining({ field: "/timeZone", code: "unknown_field" }),
  );
  expect(await (await request.get(settingsPath)).json()).toEqual({ meetingPauseMinutes: 0 });
  response = await request.put(settingsPath, { data: { meetingPauseMinutes: 10 } });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ meetingPauseMinutes: 10 });
  expect((await request.put(weekPath, { data: emptyWeek })).status()).toBe(409);
  expect(
    await (await request.post(zonePath, { data: { timeZone: "Europe/Moscow" } })).json(),
  ).toEqual({ timeZone: "Europe/Moscow", meetingPauseMinutes: 10 });
  for (const meetingPauseMinutes of [0, 60]) {
    response = await request.put(settingsPath, { data: { meetingPauseMinutes } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ timeZone: "Europe/Moscow", meetingPauseMinutes });
  }
  for (const data of [
    { meetingPauseMinutes: 0, timeZone: "Asia/Tokyo" },
    { meetingPauseMinutes: -1 },
    { meetingPauseMinutes: 61 },
    { meetingPauseMinutes: 1.5 },
  ]) {
    expect((await request.put(settingsPath, { data })).status()).toBe(422);
  }
  expect(await (await request.get(settingsPath)).json()).toEqual({
    timeZone: "Europe/Moscow",
    meetingPauseMinutes: 60,
  });
});
