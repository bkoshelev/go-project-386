import { expect, test } from "./fixtures";
import { prepareBooking } from "./booking-fixtures";
import { chooseBookingDate } from "./booking-calendar";

test.use({ timezoneId: "UTC" });

test("гость проверяет 10:07 и подтверждает встречу", async ({ page, request }) => {
  const { start } = await prepareBooking(request);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/book");
  await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await chooseBookingDate(page, start.slice(0, 10));
  await page.getByLabel("Своё время начала").fill("10:07");
  await page.getByRole("button", { name: "Проверить время" }).click();
  await expect(page.getByText(/Доступно:.*10:07.*10:37/)).toBeVisible();
  await page.getByRole("button", { name: "Проверить время" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Продолжить" })).toBeEnabled();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByRole("textbox", { name: "Имя", exact: true }).fill("Анна");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("anna@example.com");
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("heading", { name: "Встреча подтверждена" })).toBeVisible();
  const list = await (await request.get("/api/admin/bookings")).json();
  expect(list.items).toHaveLength(1);
  expect(list.items[0].startsAt).toBe(start.replace("10:00:00", "10:07:00"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("HTTP проверка не резервирует время и возвращает причины и точность", async ({ request }) => {
  const { events, start } = await prepareBooking(request);
  const path = `/api/event-types/${events[0].id}/availability/check`;
  const custom = start.replace("10:00:00", "10:07:00");
  const check = () => request.post(path, { data: { startsAt: custom } });
  const result = await check();
  expect(result.status()).toBe(200);
  expect(await result.json()).toEqual({
    available: true,
    slot: { startsAt: custom, endsAt: custom.replace("10:07:00", "10:37:00") },
  });
  expect(await (await check()).json()).toEqual(await result.json());
  expect((await (await request.get("/api/admin/bookings")).json()).items).toHaveLength(0);
  for (const invalid of [
    "bad",
    custom.replace("10:07:00", "10:07:01"),
    custom.replace("10:07:00", "10:07:00.1"),
  ]) {
    expect((await request.post(path, { data: { startsAt: invalid } })).status()).toBe(422);
  }
  expect(
    (
      await request.post("/api/bookings", {
        data: {
          eventTypeId: events[0].id,
          startsAt: custom,
          guest: { name: "Анна", email: "anna@example.com" },
        },
      })
    ).status(),
  ).toBe(201);
  expect(await (await check()).json()).toEqual({ available: false, reason: "time_occupied" });
  expect(
    (
      await request.post("/api/bookings", {
        data: {
          eventTypeId: events[0].id,
          startsAt: custom,
          guest: { name: "Борис", email: "boris@example.com" },
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    await (await request.post(path, { data: { startsAt: "2000-01-01T10:07:00Z" } })).json(),
  ).toEqual({ available: false, reason: "starts_in_past" });
});

test("отказ и ошибка проверки сохраняют ввод; конфликт сохраняет контакты", async ({
  page,
  request,
}) => {
  const { events, start } = await prepareBooking(request);
  await page.goto("/book");
  await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await chooseBookingDate(page, start.slice(0, 10));
  const time = page.getByLabel("Своё время начала");
  await time.fill("10:07");
  await page.route("**/availability/check", (route) =>
    route.fulfill({ status: 503, json: { code: "service_unavailable", message: "Ошибка" } }),
  );
  await page.getByRole("button", { name: "Проверить время" }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось проверить");
  await expect(time).toHaveValue("10:07");
  await expect(page.getByRole("button", { name: "Продолжить" })).toBeDisabled();
  await page.unroute("**/availability/check");
  await page.getByRole("button", { name: "Проверить время" }).click();
  await expect(page.getByText(/Доступно:.*10:07.*10:37/)).toBeVisible();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByRole("textbox", { name: "Имя", exact: true }).fill("Анна");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("anna@example.com");
  const custom = start.replace("10:00:00", "10:07:00");
  expect(
    (
      await request.post("/api/bookings", {
        data: {
          eventTypeId: events[0].id,
          startsAt: custom,
          guest: { name: "Другой", email: "other@example.com" },
        },
      })
    ).status(),
  ).toBe(201);
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("alert")).toContainText("Время уже занято");
  await chooseBookingDate(page, start.slice(0, 10));
  await page.getByLabel("Своё время начала").fill("10:07");
  await page.getByRole("button", { name: "Проверить время" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Это время занято" })).toBeVisible();
  await page.getByLabel("Своё время начала").fill("11:07");
  await page.getByRole("button", { name: "Проверить время" }).click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("textbox", { name: "Имя", exact: true })).toHaveValue("Анна");
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(
    "anna@example.com",
  );
});

test.describe("местный пояс гостя", () => {
  test.use({ timezoneId: "Europe/Moscow" });
  test("10:07 преобразуется в 07:07 UTC и изменение ввода сбрасывает слот", async ({
    page,
    request,
  }) => {
    const { start } = await prepareBooking(request);
    await page.goto("/book");
    await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
    await page.getByRole("button", { name: "Выбрать время" }).click();
    await chooseBookingDate(page, start.slice(0, 10));
    await page.getByRole("radio").first().check();
    await expect(page.getByRole("button", { name: "Продолжить" })).toBeEnabled();
    await page.getByLabel("Своё время начала").fill("10:07");
    await expect(page.getByRole("button", { name: "Продолжить" })).toBeDisabled();
    const checked = page.waitForRequest(
      (r) => r.url().endsWith("/availability/check") && r.method() === "POST",
    );
    await page.getByRole("button", { name: "Проверить время" }).click();
    expect((await checked).postDataJSON().startsAt).toBe(
      start.replace("10:00:00", "07:07:00").replace("Z", ".000Z"),
    );
    await expect(page.getByText(/Доступно:.*10:07.*10:37/)).toBeVisible();
    await page.getByLabel("Своё время начала").fill("10:08");
    await expect(page.getByRole("button", { name: "Продолжить" })).toBeDisabled();
  });
});

test("проверка использует актуальные окно, часы, исключения и паузу", async ({ request }) => {
  const { events, start, week } = await prepareBooking(request);
  const path = `/api/event-types/${events[0].id}/availability/check`;
  const check = async (startsAt: string) =>
    (await request.post(path, { data: { startsAt } })).json();
  const custom = start.replace("10:00:00", "10:07:00");
  const far = new Date(start);
  far.setUTCDate(far.getUTCDate() + 20);
  expect((await check(far.toISOString())).reason).toBe("outside_booking_window");
  const closedWeek = {
    days: week.days.map((day) => ({ ...day, intervals: [{ start: "11:00", end: "12:00" }] })),
  };
  expect((await request.put("/api/admin/availability/weekly", { data: closedWeek })).status()).toBe(
    200,
  );
  expect((await check(custom)).reason).toBe("outside_working_hours");
  expect((await request.put("/api/admin/availability/weekly", { data: week })).status()).toBe(200);
  const datePath = `/api/admin/availability/dates/${start.slice(0, 10)}`;
  expect((await request.put(datePath, { data: { isBlocked: true } })).status()).toBe(200);
  expect((await check(custom)).reason).toBe("outside_working_hours");
  expect((await request.put(datePath, { data: { isBlocked: false } })).status()).toBe(200);
  expect(
    (
      await request.put("/api/admin/scheduling-settings", { data: { meetingPauseMinutes: 15 } })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/api/bookings", {
        data: {
          eventTypeId: events[0].id,
          startsAt: start,
          guest: { name: "Анна", email: "anna@example.com" },
        },
      })
    ).status(),
  ).toBe(201);
  expect((await check(start.replace("10:00:00", "10:37:00"))).reason).toBe("time_occupied");
  expect((await check(start.replace("10:00:00", "10:45:00"))).available).toBe(true);
});

test("запоздалая проверка не выбирает старое время, возврат и смена типа сохраняют контакты", async ({
  page,
  request,
}) => {
  const { start } = await prepareBooking(request);
  await page.goto("/book");
  await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await chooseBookingDate(page, start.slice(0, 10));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const arrival = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route("**/availability/check", async (route) => {
    const response = await route.fetch();
    received();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByLabel("Своё время начала").fill("10:07");
  await page.getByRole("button", { name: "Проверить время" }).click();
  await arrival;
  await page.getByLabel("Своё время начала").fill("10:08");
  release();
  await page.unrouteAll({ behavior: "wait" });
  await expect(page.getByRole("button", { name: "Продолжить" })).toBeDisabled();
  await page.getByRole("button", { name: "Проверить время" }).click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByRole("textbox", { name: "Имя", exact: true }).fill("Анна");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("anna@example.com");
  await page.getByRole("button", { name: "Назад к времени" }).click();
  await page.getByRole("button", { name: "Изменить тип встречи" }).click();
  await page.getByRole("radio", { name: "Короткая встреча", exact: true }).check();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await expect(page.getByLabel("Своё время начала")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Продолжить" })).toBeDisabled();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("textbox", { name: "Имя", exact: true })).toHaveValue("Анна");
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(
    "anna@example.com",
  );
});
