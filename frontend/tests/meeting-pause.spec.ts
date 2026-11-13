import { expect, test } from "./fixtures";
import { prepareBooking, booking } from "./booking-fixtures";
import { chooseBookingDate } from "./booking-calendar";

const settingsPath = "/api/admin/scheduling-settings";
test.use({ timezoneId: "UTC" });

test("владелец сохраняет общую паузу в диалоге, пояс и черновик недели сохраняются", async ({
  page,
  request,
}) => {
  await request.post(`${settingsPath}/time-zone`, { data: { timeZone: "UTC" } });
  await page.goto("/admin/availability");
  const edit = page.getByRole("button", { name: "Изменить паузу" });
  await expect(page.getByText("Промежуток между встречами: 0 мин.", { exact: true })).toBeVisible();
  const monday = page.getByRole("group", { name: "Понедельник", exact: true });
  await monday.getByRole("button", { name: "Добавить интервал" }).click();
  await monday.getByLabel("Начало интервала 1", { exact: true }).fill("09:00");
  const date = page.getByRole("region", { name: "Настройка конкретной даты", exact: true });
  await date.getByLabel("Правило для даты").selectOption("custom");
  const selectedDate = await date.getByLabel("Местная дата", { exact: true }).inputValue();
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Пауза между встречами", exact: true });
  await dialog.getByLabel("Пауза между встречами, мин", { exact: true }).fill("15");
  const write = page.waitForRequest((r) => r.method() === "PUT" && r.url().endsWith(settingsPath));
  await dialog.getByRole("button", { name: "Сохранить паузу" }).click();
  expect((await write).postDataJSON()).toEqual({ meetingPauseMinutes: 15 });
  await expect(page.getByText("Пауза сохранена", { exact: true })).toBeVisible();
  await expect(dialog).not.toBeVisible();
  await expect(edit).toBeFocused();
  await expect(monday.getByLabel("Начало интервала 1", { exact: true })).toHaveValue("09:00");
  await expect(date.getByLabel("Правило для даты")).toHaveValue("custom");
  expect(
    await (await request.get(`/api/admin/availability/dates/${selectedDate}`)).json(),
  ).not.toHaveProperty("intervals");
  expect(await (await request.get(settingsPath)).json()).toEqual({
    timeZone: "UTC",
    meetingPauseMinutes: 15,
  });
  const week = await (await request.get("/api/admin/availability/weekly")).json();
  expect(week.days[0].intervals).toEqual([]);
  await page.reload();
  await expect(
    page.getByText("Промежуток между встречами: 15 мин.", { exact: true }),
  ).toBeVisible();
});

test("ошибки и неизвестный результат сохраняют ввод даже после закрытия диалога", async ({
  page,
  request,
}) => {
  await page.goto("/admin/availability");
  await page.getByRole("button", { name: "Изменить паузу" }).click();
  const dialog = page.getByRole("dialog", { name: "Пауза между встречами", exact: true });
  const input = dialog.getByLabel("Пауза между встречами, мин", { exact: true });
  const save = dialog.getByRole("button", { name: "Сохранить паузу" });
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().endsWith(settingsPath)) writes++;
  });
  for (const invalid of ["", "-1", "61", "1.5", "abc"]) {
    await input.fill(invalid);
    await save.click();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveValue(invalid);
    await expect(dialog.getByText("Введите целое число от 0 до 60", { exact: true })).toBeVisible();
    await save.click();
    await expect(input).toBeFocused();
  }
  expect(writes).toBe(0);
  await input.fill("60");
  await page.route(`**${settingsPath}`, async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 503,
        json: { code: "service_unavailable", message: "Сервис недоступен" },
      });
    else await route.continue();
  });
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText("Не удалось сохранить паузу");
  await expect(dialog.getByRole("alert")).toBeFocused();
  await expect(input).toHaveValue("60");
  await expect(page.getByText("Пауза сохранена", { exact: true })).toHaveCount(0);
  await page.unroute(`**${settingsPath}`);
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  await page.route(`**${settingsPath}`, async (route) => {
    await route.fetch();
    await gate;
    await route.abort("connectionfailed");
  });
  await save.click();
  await expect(input).toBeDisabled();
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole("status")).toHaveText("Сохранение паузы…");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole("alert")).toContainText("Результат неизвестен");
  await expect(input).toHaveValue("60");
  await expect(page.getByText("Пауза сохранена", { exact: true })).toHaveCount(0);
  expect(writes).toBe(2);
  expect((await (await request.get(settingsPath)).json()).meetingPauseMinutes).toBe(60);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Изменить паузу" }).click();
  await expect(input).toHaveValue("60");
  await expect(dialog.getByRole("alert")).toContainText("Результат неизвестен");
  await page.unroute(`**${settingsPath}`);
  await save.click();
  await expect(page.getByText("Пауза сохранена", { exact: true })).toBeVisible();
  expect(writes).toBe(3);
});

test("чтение паузы различает загрузку и ошибку, повтор не изменяет календарь", async ({ page }) => {
  let reads = 0;
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  await page.route(`**${settingsPath}`, async (route) => {
    reads++;
    if (reads !== 2) return route.continue();
    await gate;
    await route.fetch();
    await route.abort("connectionfailed");
  });
  await page.goto("/admin/availability");
  const region = page.getByRole("region", { name: "Пауза между встречами", exact: true });
  await expect(region.getByRole("status")).toHaveText("Загрузка паузы…");
  await expect(region.getByRole("button", { name: "Изменить паузу" })).toHaveCount(0);
  release();
  await expect(region.getByRole("alert")).toHaveText("Не удалось загрузить паузу");
  await region.getByRole("button", { name: "Повторить загрузку паузы" }).click();
  await expect(page.getByText("Промежуток между встречами: 0 мин.", { exact: true })).toBeVisible();
  expect(reads).toBe(3);
});

test("пауза и диалог доступны с клавиатуры и от 320 px", async ({ page }, testInfo) => {
  await page.goto("/admin/availability");
  const edit = page.getByRole("button", { name: "Изменить паузу" });
  await edit.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Пауза между встречами", exact: true });
  const input = dialog.getByLabel("Пауза между встречами, мин", { exact: true });
  await expect(input).toBeFocused();
  await expect(input).toHaveAccessibleDescription(
    "От 0 до 60 целых минут. При 0 встречи могут идти подряд.",
  );
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(dialog).toBeInViewport();
    await expect(input).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Сохранить паузу" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({ path: testInfo.outputPath(`pause-dialog-${width}.png`) });
  }
  await page.keyboard.press("Tab");
  const save = dialog.getByRole("button", { name: "Сохранить паузу" });
  await expect(save).toBeFocused();
  expect(await save.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(edit).toBeFocused();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await edit.scrollIntoViewIfNeeded();
    await expect(edit).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
});

test("гость повторно выбирает время после изменения паузы владельцем и создаёт встречу", async ({
  page,
  request,
  context,
}) => {
  const { events, start } = await prepareBooking(request);
  const owner = await context.newPage();
  const select = (clock: string) =>
    page.getByRole("radio", {
      name: `${clock}–${clock === "10:30" ? "10:45" : "11:00"}`,
      exact: true,
    });
  // Use a predictable browser zone while the actual API and database remain real.
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    (await request.post("/api/bookings", { data: booking(events[0].id, start) })).status(),
  ).toBe(201);
  await page.goto("/book");
  await page.getByRole("radio", { name: "Короткая встреча", exact: true }).check();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await chooseBookingDate(page, start.slice(0, 10));
  const label = (instant: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(instant));
  // Playwright's desktop context uses UTC; both selection and HTTP instants are explicit.
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe("UTC");
  await select("10:30").check();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByRole("textbox", { name: "Имя", exact: true }).fill("Анна");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("anna@example.com");
  await owner.goto("/admin/availability");
  await owner.getByRole("button", { name: "Изменить паузу" }).click();
  const dialog = owner.getByRole("dialog", { name: "Пауза между встречами", exact: true });
  await dialog.getByLabel("Пауза между встречами, мин", { exact: true }).fill("15");
  await dialog.getByRole("button", { name: "Сохранить паузу" }).click();
  await expect(owner.getByText("Пауза сохранена", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("alert")).toHaveText("Время уже занято. Выберите другое время.");
  await expect(page.getByRole("heading", { name: "Шаг 2. Дата и время" })).toBeFocused();
  await chooseBookingDate(page, start.slice(0, 10));
  await expect(select("10:30")).toHaveCount(0);
  await select("10:45").check();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("textbox", { name: "Имя", exact: true })).toHaveValue("Анна");
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(
    "anna@example.com",
  );
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("heading", { name: "Встреча подтверждена" })).toBeFocused();
  const list = await (await request.get("/api/admin/bookings")).json();
  expect(list.items).toHaveLength(2);
  expect(list.items[0].startsAt).toBe(start);
  expect(label(list.items[1].startsAt)).toBe("10:45");
  await owner.close();
});
