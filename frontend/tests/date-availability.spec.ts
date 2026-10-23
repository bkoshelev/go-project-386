import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

async function prepare(request: APIRequestContext) {
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
              intervals: [{ start: "09:00", end: "18:00" }],
            }),
          ),
        },
      })
    ).status(),
  ).toBe(200);
  const created = await request.post("/api/admin/event-types", {
    data: { name: "Обсуждение", durationMinutes: 60 },
  });
  expect(created.status()).toBe(201);
  const event = await created.json();
  const availability = await (
    await request.get(`/api/event-types/${event.id}/availability`)
  ).json();
  const tomorrow = new Date(availability.windowStartsAt);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

test("владелец заменяет часы даты, гость видит новые часы, блокировку и наследование", async ({
  browser,
  request,
  backend,
}, testInfo) => {
  const date = await prepare(request);
  const context = await browser.newContext({
    timezoneId: "UTC",
    baseURL: backend.url,
    viewport: { width: 320, height: 900 },
  });
  try {
    const owner = await context.newPage();
    const guest = await context.newPage();
    await owner.goto("/admin/availability");
    const editor = owner.getByRole("region", { name: "Настройка конкретной даты" });
    await editor.getByLabel("Местная дата").fill(date);
    await expect(
      editor.getByText("Используются недельные интервалы", { exact: true }),
    ).toBeVisible();
    await guest.goto("/book");
    await guest.getByRole("radio", { name: "Обсуждение", exact: true }).check();
    await guest.getByRole("button", { name: "Выбрать время" }).click();
    await guest.getByLabel("Дата", { exact: true }).selectOption(date);
    await expect(guest.getByRole("radio", { name: "09:00–10:00", exact: true })).toBeVisible();
    await editor.getByLabel("Собственные интервалы").check();
    await expect(
      editor.getByText("Собственные рабочие интервалы не заданы", { exact: true }),
    ).toBeVisible();
    await editor.getByRole("button", { name: "Добавить интервал даты" }).click();
    await editor.getByLabel("Начало интервала 1", { exact: true }).fill("12:00");
    await editor.getByLabel("Окончание интервала 1", { exact: true }).fill("14:00");
    await editor.getByRole("button", { name: "Сохранить настройку даты" }).click();
    await expect(editor.getByText("Настройка даты сохранена", { exact: true })).toBeVisible();
    await owner.reload();
    await owner
      .getByRole("region", { name: "Настройка конкретной даты" })
      .getByLabel("Местная дата")
      .fill(date);
    await expect(editor.getByLabel("Начало интервала 1", { exact: true })).toHaveValue("12:00");
    await guest.getByRole("button", { name: "Обновить доступность" }).click();
    await expect(guest.getByRole("radio", { name: "09:00–10:00", exact: true })).toHaveCount(0);
    await expect(guest.getByRole("radio", { name: "12:00–13:00", exact: true })).toBeVisible();
    await editor.getByLabel("Дата заблокирована").check();
    await editor.getByRole("button", { name: "Сохранить настройку даты" }).click();
    await expect(editor.getByText("Настройка даты сохранена", { exact: true })).toBeVisible();
    await guest.getByRole("button", { name: "Обновить доступность" }).click();
    await expect(
      guest.getByText("На эту дату нет свободного времени", { exact: true }),
    ).toBeVisible();
    await editor.getByLabel("Дата заблокирована").uncheck();
    await expect(editor.getByLabel("Собственные интервалы")).not.toBeChecked();
    await editor.getByRole("button", { name: "Сохранить настройку даты" }).click();
    await expect(editor.getByText("Настройка даты сохранена", { exact: true })).toBeVisible();
    await guest.getByRole("button", { name: "Обновить доступность" }).click();
    await expect(guest.getByRole("radio", { name: "09:00–10:00", exact: true })).toBeVisible();
    await editor.getByLabel("Дата заблокирована").focus();
    await owner.keyboard.press("Tab");
    await expect(editor.getByLabel("Собственные интервалы")).toBeFocused();
    expect(
      await editor
        .getByLabel("Собственные интервалы")
        .evaluate((el) => getComputedStyle(el).outlineStyle),
    ).not.toBe("none");
    await owner.keyboard.press("Space");
    await expect(editor.getByLabel("Собственные интервалы")).toBeChecked();
    await editor.getByRole("button", { name: "Сохранить настройку даты" }).click();
    await expect(editor.getByText("Настройка даты сохранена", { exact: true })).toBeVisible();
    await guest.getByRole("button", { name: "Обновить доступность" }).click();
    await expect(
      guest.getByText("На эту дату нет свободного времени", { exact: true }),
    ).toBeVisible();
    expect(await owner.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await owner.screenshot({ path: testInfo.outputPath("date-editor-320.png"), fullPage: true });
  } finally {
    await context.close();
  }
});

test("редактор различает загрузку и сбой чтения, повтор читает явную настройку", async ({
  page,
  request,
}) => {
  const date = await prepare(request);
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  await page.route("**/api/admin/availability/dates/*", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/admin/availability");
  const editor = page.getByRole("region", { name: "Настройка конкретной даты" });
  await expect(editor.getByText("Загрузка настройки даты…", { exact: true })).toBeVisible();
  await expect(editor.getByText("Используются недельные интервалы", { exact: true })).toHaveCount(
    0,
  );
  release();
  await expect(editor.getByText("Используются недельные интервалы", { exact: true })).toBeVisible();
  await page.unroute("**/api/admin/availability/dates/*");
  await page.route("**/api/admin/availability/dates/*", (route) => route.abort(), { times: 1 });
  await editor.getByLabel("Местная дата").fill(date);
  await expect(editor.getByRole("alert")).toHaveText("Не удалось загрузить настройку даты");
  await expect(editor.getByText("Используются недельные интервалы", { exact: true })).toHaveCount(
    0,
  );
  await editor.getByRole("button", { name: "Повторить чтение даты" }).click();
  await expect(editor.getByText("Используются недельные интервалы", { exact: true })).toBeVisible();
  await expect(editor.getByRole("alert")).toHaveCount(0);
});

test("ошибка часов сохраняет ввод, потеря ответа не подтверждает сохранение и не повторяет запись", async ({
  page,
  request,
}) => {
  const date = await prepare(request);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/admin/availability");
  const editor = page.getByRole("region", { name: "Настройка конкретной даты" });
  await editor.getByLabel("Местная дата").fill(date);
  await expect(editor.getByText("Используются недельные интервалы", { exact: true })).toBeVisible();
  await editor.getByLabel("Собственные интервалы").check();
  await editor.getByRole("button", { name: "Добавить интервал даты" }).click();
  const start = editor.getByLabel("Начало интервала 1", { exact: true });
  const end = editor.getByLabel("Окончание интервала 1", { exact: true });
  await start.fill("12:00");
  await end.fill("11:00");
  await editor.getByRole("button", { name: "Сохранить настройку даты" }).click();
  await expect(editor.getByRole("alert")).toHaveText("Проверьте интервалы даты");
  await expect(end).toHaveAttribute("aria-invalid", "true");
  await expect(end).toBeFocused();
  await expect(start).toHaveValue("12:00");
  await expect(end).toHaveValue("11:00");
  await end.fill("14:00");
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  let writes = 0;
  await page.route("**/api/admin/availability/dates/*", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await gate;
    await route.abort();
  });
  await editor.getByRole("button", { name: "Сохранить настройку даты" }).click();
  await expect(editor.getByText("Сохранение настройки даты…", { exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Сохранить настройку даты" })).toBeDisabled();
  await expect(start).toBeDisabled();
  await expect(editor.getByLabel("Местная дата")).toBeDisabled();
  await expect(editor.getByText("Настройка даты сохранена", { exact: true })).toHaveCount(0);
  release();
  await expect(editor.getByRole("alert")).toContainText("Результат сохранения неизвестен");
  await expect(start).toHaveValue("12:00");
  await expect(end).toHaveValue("14:00");
  await expect(editor.getByText("Настройка даты сохранена", { exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
  expect(await (await request.get(`/api/admin/availability/dates/${date}`)).json()).toEqual({
    date,
    isBlocked: false,
    intervals: [{ start: "12:00", end: "14:00" }],
  });
  await editor.getByRole("button", { name: "Прочитать настройку даты" }).click();
  await expect(start).toHaveValue("12:00");
  await expect(editor.getByRole("alert")).toHaveCount(0);
  expect(writes).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
