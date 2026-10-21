import { expect, test } from "./fixtures";

test("владелец настраивает неделю и восстанавливает часы после блокировки в другом браузерном поясе", async ({
  browser,
  backend,
  request,
}) => {
  const owner = await browser.newContext({ timezoneId: "Europe/Moscow", baseURL: backend.url });
  const ownerPage = await owner.newPage();
  try {
    await ownerPage.goto("/admin");
    await ownerPage.getByRole("link", { name: "Доступность", exact: true }).click();
    await expect(
      ownerPage.getByText("Часовой пояс расписания: Europe/Moscow", { exact: true }),
    ).toBeVisible();
    await expect(ownerPage.getByText("Рабочие интервалы пока не заданы")).toBeVisible();
    await expect(ownerPage.getByRole("checkbox", { checked: true })).toHaveCount(7);
    const monday = ownerPage.getByRole("group", { name: "Понедельник", exact: true });
    await monday.getByRole("checkbox", { name: "День заблокирован" }).uncheck();
    await monday.getByRole("button", { name: "Добавить интервал" }).click();
    await monday.getByRole("textbox", { name: "Начало интервала 1" }).fill("09:00");
    await monday.getByRole("textbox", { name: "Окончание интервала 1" }).fill("12:00");
    await monday.getByRole("button", { name: "Добавить интервал" }).click();
    await monday.getByRole("textbox", { name: "Начало интервала 2" }).fill("12:00");
    await monday.getByRole("textbox", { name: "Окончание интервала 2" }).fill("24:00");
    await ownerPage.getByRole("button", { name: "Сохранить расписание" }).click();
    await expect(
      ownerPage.getByRole("status").filter({ hasText: "Расписание сохранено" }),
    ).toBeVisible();
    await monday.getByRole("checkbox").check();
    await ownerPage.getByRole("button", { name: "Сохранить расписание" }).click();
    await expect(
      ownerPage.getByRole("status").filter({ hasText: "Расписание сохранено" }),
    ).toBeVisible();
    await backend.restart();
    const traveler = await browser.newContext({ timezoneId: "Asia/Tokyo", baseURL: backend.url });
    try {
      const page = await traveler.newPage();
      await page.goto("/admin/availability");
      await expect(
        page.getByText("Часовой пояс расписания: Europe/Moscow", { exact: true }),
      ).toBeVisible();
      const savedMonday = page.getByRole("group", { name: "Понедельник", exact: true });
      await expect(savedMonday.getByRole("checkbox")).toBeChecked();
      await savedMonday.getByRole("checkbox").uncheck();
      await expect(savedMonday.getByRole("textbox", { name: "Начало интервала 1" })).toHaveValue(
        "09:00",
      );
      await expect(savedMonday.getByRole("textbox", { name: "Окончание интервала 2" })).toHaveValue(
        "24:00",
      );
      await page.getByRole("button", { name: "Сохранить расписание" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "Расписание сохранено" }),
      ).toBeVisible();
      const week = await (await request.get("/api/admin/availability/weekly")).json();
      expect(week.days[0]).toEqual({
        weekday: "monday",
        isBlocked: false,
        intervals: [
          { start: "09:00", end: "12:00" },
          { start: "12:00", end: "24:00" },
        ],
      });
      expect(week.days.slice(1).every((day: { isBlocked: boolean }) => day.isBlocked)).toBe(true);
    } finally {
      await traveler.close();
    }
  } finally {
    await owner.close();
  }
});

test("ошибки интервалов видны у полей, фокусируют ввод и не отправляют неделю", async ({
  page,
}) => {
  await page.goto("/admin/availability");
  const monday = page.getByRole("group", { name: "Понедельник", exact: true });
  await expect(page.getByRole("button", { name: "Сохранить расписание" })).toBeEnabled();
  await monday.getByRole("checkbox").uncheck();
  await monday.getByRole("button", { name: "Добавить интервал" }).click();
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT") writes++;
  });
  const start = monday.getByRole("textbox", { name: "Начало интервала 1" });
  const end = monday.getByRole("textbox", { name: "Окончание интервала 1" });
  for (const [first, last, invalid] of [
    ["24:00", "24:00", start],
    ["09:00", "09:00", end],
    ["18:00", "09:00", end],
    ["09:00", "24:01", end],
  ] as const) {
    await start.fill(first);
    await end.fill(last);
    await page.getByRole("button", { name: "Сохранить расписание" }).click();
    await expect(invalid).toHaveAttribute("aria-invalid", "true");
    await expect(invalid).toBeFocused();
    await expect(start).toHaveValue(first);
    await expect(end).toHaveValue(last);
  }
  await start.fill("09:00");
  await end.fill("18:00");
  await monday.getByRole("button", { name: "Добавить интервал" }).click();
  await monday.getByRole("textbox", { name: "Начало интервала 2" }).fill("12:00");
  await monday.getByRole("textbox", { name: "Окончание интервала 2" }).fill("13:00");
  await page.getByRole("button", { name: "Сохранить расписание" }).click();
  await expect(monday.getByText("Интервалы пересекаются", { exact: true })).toBeVisible();
  await expect(monday.getByRole("textbox", { name: "Начало интервала 2" })).toBeFocused();
  expect(writes).toBe(0);
});

test("гость и серверный пояс не инициализируют календарь", async ({
  browser,
  backend,
  request,
}) => {
  const guest = await browser.newContext({ timezoneId: "Pacific/Honolulu", baseURL: backend.url });
  try {
    const page = await guest.newPage();
    for (const path of ["/", "/book", "/admin"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Записаться", exact: true })).toBeVisible();
    }
    const settings = await request.get("/api/admin/scheduling-settings");
    expect(settings.status()).toBe(200);
    expect(await settings.json()).toEqual({ meetingPauseMinutes: 0 });
    await page.goto("/admin/availability");
    await expect(
      page.getByText("Часовой пояс расписания: Pacific/Honolulu", { exact: true }),
    ).toBeVisible();
  } finally {
    await guest.close();
  }
});

test("ошибка определения пояса видна, недельная запись недоступна", async ({ page, request }) => {
  await page.addInitScript(() => {
    // The test replaces the browser timezone boundary while preserving the native receiver.
    // oxlint-disable-next-line typescript/unbound-method
    const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function () {
      return { ...resolvedOptions.call(this), timeZone: "" };
    };
  });
  await page.goto("/admin/availability");
  await expect(page.getByRole("alert")).toHaveText("Не удалось определить часовой пояс браузера");
  await expect(page.getByRole("button", { name: "Сохранить расписание" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Повторить сохранение пояса" })).toBeEnabled();
  expect(await (await request.get("/api/admin/scheduling-settings")).json()).toEqual({
    meetingPauseMinutes: 0,
  });
});

test("потерянный ответ инициализации явно виден и повторяется только вручную", async ({
  page,
  request,
}) => {
  let writes = 0;
  await page.route("**/api/admin/scheduling-settings/time-zone", async (route) => {
    writes++;
    await route.fetch();
    await route.abort("connectionfailed");
  });
  await page.goto("/admin/availability");
  await expect(page.getByRole("alert")).toHaveText("Не удалось сохранить часовой пояс расписания");
  await expect(page.getByRole("button", { name: "Сохранить расписание" })).toBeDisabled();
  expect(writes).toBe(1);
  const persisted = await (await request.get("/api/admin/scheduling-settings")).json();
  expect(persisted.timeZone).toBeTruthy();
  await page.unroute("**/api/admin/scheduling-settings/time-zone");
  await page.getByRole("button", { name: "Повторить сохранение пояса" }).click();
  await expect(
    page.getByText(`Часовой пояс расписания: ${persisted.timeZone}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить расписание" })).toBeEnabled();
});

test("загрузка отличается от пустого результата, сбой БД можно прочитать повторно", async ({
  page,
  backend,
  request,
}) => {
  test.setTimeout(60_000);
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  await page.route("**/api/admin/availability/weekly", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/admin/availability");
  await expect(page.getByRole("status")).toHaveText("Загрузка доступности…");
  await expect(page.getByText("Рабочие интервалы пока не заданы")).toHaveCount(0);
  release();
  await expect(page.getByText("Рабочие интервалы пока не заданы")).toBeVisible();
  await page.unroute("**/api/admin/availability/weekly");
  await backend.database(false);
  await page.reload();
  await expect(page.getByRole("alert")).toHaveText("Не удалось загрузить доступность");
  await expect(page.getByText("Рабочие интервалы пока не заданы")).toHaveCount(0);
  expect((await request.get("/healthz")).status()).toBe(200);
  expect((await request.get("/readyz")).status()).toBe(503);
  for (const path of ["/api/admin/scheduling-settings", "/api/admin/availability/weekly"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(500);
    expect(await response.json()).toMatchObject({ code: "internal_error" });
  }
  await backend.database(true);
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Сохранить расписание" })).toBeEnabled();
  await expect(page.getByText("Рабочие интервалы пока не заданы")).toBeVisible();
});

test("ошибка записи и потерянный ответ сохраняют часы и не показывают успех", async ({
  page,
  request,
  backend,
}) => {
  test.setTimeout(60_000);
  await page.goto("/admin/availability");
  await expect(page.getByRole("button", { name: "Сохранить расписание" })).toBeEnabled();
  const monday = page.getByRole("group", { name: "Понедельник", exact: true });
  await monday.getByRole("checkbox").uncheck();
  await monday.getByRole("button", { name: "Добавить интервал" }).click();
  await monday.getByRole("textbox", { name: "Начало интервала 1" }).fill("09:00");
  await monday.getByRole("textbox", { name: "Окончание интервала 1" }).fill("18:00");
  await backend.database(false);
  await page.getByRole("button", { name: "Сохранить расписание" }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось сохранить расписание");
  await expect(monday.getByRole("textbox", { name: "Начало интервала 1" })).toHaveValue("09:00");
  await expect(monday.getByRole("checkbox")).not.toBeChecked();
  await backend.database(true);
  let release!: () => void;
  let writes = 0;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  await page.route("**/api/admin/availability/weekly", async (route) => {
    writes++;
    await route.fetch();
    await gate;
    await route.abort("connectionfailed");
  });
  await page.getByRole("button", { name: "Сохранить расписание" }).click();
  await expect(page.getByRole("status")).toHaveText("Сохранение расписания…");
  await expect(page.getByRole("button", { name: "Сохранить расписание" })).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("Не удалось получить результат сохранения");
  await expect(monday.getByRole("textbox", { name: "Начало интервала 1" })).toHaveValue("09:00");
  await expect(page.getByText("Расписание сохранено", { exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
  expect((await (await request.get("/api/admin/availability/weekly")).json()).days[0]).toEqual({
    weekday: "monday",
    isBlocked: false,
    intervals: [{ start: "09:00", end: "18:00" }],
  });
  await page.unroute("**/api/admin/availability/weekly");
  await page.getByRole("button", { name: "Сохранить расписание" }).click();
  await expect(page.getByRole("status")).toHaveText("Расписание сохранено");
});

for (const width of [320, 375, 768, 1440]) {
  test(`недельный редактор доступен с клавиатуры и помещается на ${width} px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/availability");
    await expect(page.getByRole("button", { name: "Сохранить расписание" })).toBeEnabled();
    const monday = page.getByRole("group", { name: "Понедельник", exact: true });
    const blocked = monday.getByRole("checkbox");
    await blocked.focus();
    await page.keyboard.press("Space");
    await expect(blocked).not.toBeChecked();
    await page.keyboard.press("Tab");
    await expect(monday.getByRole("button", { name: "Добавить интервал" })).toBeFocused();
    await page.keyboard.press("Enter");
    const start = monday.getByRole("textbox", { name: "Начало интервала 1" });
    await start.focus();
    await page.keyboard.type("09:00");
    await page.keyboard.press("Tab");
    const end = monday.getByRole("textbox", { name: "Окончание интервала 1" });
    await expect(end).toBeFocused();
    await page.keyboard.type("24:00");
    expect(await end.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      "none",
    );
    const boxes = await Promise.all([start, end].map((field) => field.boundingBox()));
    expect(boxes[0]).not.toBeNull();
    expect(boxes[1]).not.toBeNull();
    expect(
      boxes[0]!.y + boxes[0]!.height <= boxes[1]!.y || boxes[0]!.x + boxes[0]!.width <= boxes[1]!.x,
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.getByRole("button", { name: "Сохранить расписание" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Расписание сохранено");
    if (width === 320)
      await page.screenshot({ path: testInfo.outputPath("availability-320.png"), fullPage: true });
  });
}
