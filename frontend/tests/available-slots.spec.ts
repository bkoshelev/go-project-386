import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

async function prepare(request: APIRequestContext) {
  const events = [];
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
  expect(
    (
      await request.put("/api/admin/availability/weekly", {
        data: {
          days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
            (weekday) => ({
              weekday,
              isBlocked: false,
              intervals: [{ start: "20:00", end: "24:00" }],
            }),
          ),
        },
      })
    ).status(),
  ).toBe(200);
  const availability = await (
    await request.get(`/api/event-types/${events[0].id}/availability`)
  ).json();
  const tomorrow = new Date(availability.windowStartsAt);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(20);
  const start = tomorrow.toISOString().replace(".000Z", "Z");
  expect(availability.slots).toContainEqual({
    startsAt: start,
    endsAt: start.replace("20:00", "20:30"),
  });
  return { events, availability, start };
}

for (const [zone, offset, label] of [
  ["Asia/Tokyo", 9, "05:00–05:30"],
  ["Pacific/Honolulu", -10, "10:00–10:30"],
] as const) {
  test(`гость выбирает слот в ${zone}, возвращается и меняет тип без резерва`, async ({
    browser,
    request,
    backend,
  }, testInfo) => {
    const { start, availability, events } = await prepare(request);
    const context = await browser.newContext({
      timezoneId: zone,
      baseURL: backend.url,
      viewport: { width: 320, height: 900 },
    });
    try {
      const page = await context.newPage();
      let writes = 0;
      page.on("request", (request) => {
        if (request.method() !== "GET") writes++;
      });
      await page.goto("/");
      await page.getByRole("link", { name: "Записаться", exact: true }).click();
      await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
      await page.getByRole("button", { name: "Выбрать время" }).click();
      await expect(page.getByRole("heading", { name: "Шаг 2. Дата и время" })).toBeFocused();
      await expect(page.getByText(`Часовой пояс: ${zone}`, { exact: true })).toBeVisible();
      const date = new Date(Date.parse(start) + offset * 3_600_000).toISOString().slice(0, 10);
      const dates = page.getByLabel("Дата", { exact: true });
      const options = dates.locator("option");
      await expect(options).toHaveCount(15);
      const firstDate = new Date(Date.parse(availability.windowStartsAt) + offset * 3_600_000)
        .toISOString()
        .slice(0, 10);
      const lastDate = new Date(Date.parse(availability.windowEndsAt) - 1 + offset * 3_600_000)
        .toISOString()
        .slice(0, 10);
      await expect(options.first()).toHaveAttribute("value", firstDate);
      await expect(options.last()).toHaveAttribute("value", lastDate);
      await dates.selectOption(date);
      const slot = page.getByRole("radio", { name: label, exact: true });
      await slot.focus();
      await page.keyboard.press("Space");
      await expect(slot).toBeChecked();
      await expect(page.getByRole("status").filter({ hasText: "Время выбрано" })).toBeVisible();
      await expect(page.getByText("Выбор не резервирует время", { exact: true })).toBeVisible();
      expect(await slot.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
        "none",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await page.screenshot({ path: testInfo.outputPath("calendar-320.png"), fullPage: true });
      await page.getByRole("button", { name: "Назад к типам событий" }).click();
      await expect(page.getByRole("heading", { name: "Шаг 1. Тип события" })).toBeFocused();
      await page.getByRole("radio", { name: "Короткая встреча", exact: true }).check();
      await page.getByRole("button", { name: "Выбрать время" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Время выбрано" })).toHaveCount(0);
      await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
      const after = await (
        await request.get(`/api/event-types/${events[0].id}/availability`)
      ).json();
      expect(after.windowStartsAt).toBe(availability.windowStartsAt);
      expect(after.windowEndsAt).toBe(availability.windowEndsAt);
      expect(after.slots).toContainEqual({
        startsAt: start,
        endsAt: start.replace("20:00", "20:30"),
      });
      expect(writes).toBe(0);
      await page.reload();
      await expect(page.getByRole("heading", { name: "Шаг 1. Тип события" })).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test("неизвестный тип объясняет причину и возвращает гостя к выбору", async ({ page, request }) => {
  await prepare(request);
  await page.goto("/book");
  await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
  await page.route("**/api/event-types/*/availability", async (route) => {
    const url = new URL(route.request().url());
    url.pathname = "/api/event-types/00000000-0000-0000-0000-000000000000/availability";
    const response = await route.fetch({ url: url.toString() });
    expect(response.status()).toBe(404);
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await expect(page.getByRole("alert")).toHaveText("Тип события не найден. Выберите другой тип.");
  await expect(page.getByRole("heading", { name: "Шаг 1. Тип события" })).toBeFocused();
  await expect(page.getByRole("radio", { name: "Короткая встреча", exact: true })).toBeVisible();
});

test("загрузка, пустое окно и пустая дата различимы, обновление читает новые часы", async ({
  browser,
  request,
  backend,
}) => {
  const { events, availability } = await prepare(request);
  const week = await (await request.get("/api/admin/availability/weekly")).json();
  for (const day of week.days) day.isBlocked = true;
  expect((await request.put("/api/admin/availability/weekly", { data: week })).status()).toBe(200);
  const context = await browser.newContext({ timezoneId: "UTC", baseURL: backend.url });
  try {
    const page = await context.newPage();
    await page.goto("/book");
    await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    await page.route("**/api/event-types/*/availability", async (route) => {
      await gate;
      await route.continue();
    });
    await page.getByRole("button", { name: "Выбрать время" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Загрузка свободного времени" }),
    ).toBeVisible();
    await expect(page.getByText("В ближайшие 14 дней нет свободного времени")).toHaveCount(0);
    release();
    await expect(
      page.getByText("В ближайшие 14 дней нет свободного времени", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    const emptyDate = new Date(availability.windowStartsAt);
    emptyDate.setUTCDate(emptyDate.getUTCDate() + 1);
    // Open only the following weekday; the chosen date remains closed.
    week.days[(emptyDate.getUTCDay() + 6 + 1) % 7].isBlocked = false;
    expect((await request.put("/api/admin/availability/weekly", { data: week })).status()).toBe(
      200,
    );
    await page.getByRole("button", { name: "Обновить доступность" }).click();
    await page
      .getByLabel("Дата", { exact: true })
      .selectOption(emptyDate.toISOString().slice(0, 10));
    await expect(
      page.getByText("На эту дату нет свободного времени", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("В ближайшие 14 дней нет свободного времени")).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    expect(
      (await request.get(`/api/event-types/${events[0].id}/availability`)).headers()[
        "cache-control"
      ],
    ).toBe("no-store");
  } finally {
    await context.close();
  }
});

test("сбой реальной БД отличается от отсутствия времени, ручной повтор восстанавливает календарь", async ({
  page,
  request,
  backend,
}) => {
  test.setTimeout(60_000);
  const { events } = await prepare(request);
  await page.goto("/book");
  await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await expect(page.getByRole("radiogroup", { name: "Свободное время" })).toBeVisible();
  await backend.database(false);
  await page.getByRole("button", { name: "Обновить доступность" }).click();
  await expect(page.getByRole("alert")).toHaveText("Не удалось загрузить свободное время");
  await expect(page.getByText("В ближайшие 14 дней нет свободного времени")).toHaveCount(0);
  expect((await request.get("/healthz")).status()).toBe(200);
  const failure = await request.get(`/api/event-types/${events[0].id}/availability`);
  expect(failure.status()).toBe(500);
  expect(await failure.json()).toMatchObject({ code: "internal_error" });
  expect(failure.headers()["cache-control"]).toBe("no-store");
  await backend.database(true);
  await page.getByRole("button", { name: "Повторить загрузку времени" }).click();
  await expect(page.getByRole("radiogroup", { name: "Свободное время" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
