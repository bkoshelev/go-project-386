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
    await expect(
      ownerPage.getByRole("button", {
        name: /^(Понедельник|Вторник|Среда|Четверг|Пятница|Суббота|Воскресенье)\. День заблокирован/,
      }),
    ).toHaveCount(7);
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

for (const width of [320, 390, 768, 820, 1024, 1440]) {
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

test("сетка сохраняет черновики семи дней, показывает края суток и направляет к ошибке другого дня", async ({
  page,
  request,
}) => {
  await page.goto("/admin/availability");
  const save = page.getByRole("button", { name: "Сохранить расписание" });
  await expect(save).toBeEnabled();
  const mondayRow = page.getByRole("button", { name: /^Понедельник\./ });
  const wednesdayRow = page.getByRole("button", { name: /^Среда\./ });
  const editor = page.getByRole("group", { name: "Понедельник", exact: true });
  await expect(mondayRow).toHaveAttribute("aria-pressed", "true");
  let writes = 0;
  page.on("request", (req) => {
    if (req.method() === "PUT") writes++;
  });
  await editor.getByRole("checkbox").uncheck();
  for (const [index, start, end] of [
    [1, "23:30", "24:00"],
    [2, "00:00", "01:00"],
    [3, "01:00", "01:01"],
  ] as const) {
    await editor.getByRole("button", { name: "Добавить интервал" }).click();
    await expect(editor.getByLabel(`Начало интервала ${index}`, { exact: true })).toBeFocused();
    await editor.getByLabel(`Начало интервала ${index}`, { exact: true }).fill(start);
    await editor.getByLabel(`Окончание интервала ${index}`, { exact: true }).fill(end);
  }
  await expect(mondayRow).toHaveAccessibleName(
    "Понедельник. Рабочие часы. 23:30–24:00, 00:00–01:00, 01:00–01:01",
  );
  await wednesdayRow.focus();
  await page.keyboard.press("Enter");
  await expect(wednesdayRow).toBeFocused();
  const wednesday = page.getByRole("group", { name: "Среда", exact: true });
  await wednesday.getByRole("button", { name: "Добавить интервал" }).click();
  await mondayRow.click();
  await expect(editor.getByLabel("Начало интервала 1", { exact: true })).toHaveValue("23:30");
  expect(writes).toBe(0);
  await expect(page.getByText("Изменения не сохранены", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Рабочие часы обычной недели")).toContainText("—");
  await save.click();
  await expect(wednesdayRow).toHaveAttribute("aria-pressed", "true");
  await expect(wednesday.getByLabel("Начало интервала 1", { exact: true })).toBeFocused();
  expect(writes).toBe(0);
  await wednesday.getByLabel("Начало интервала 1", { exact: true }).fill("12:00");
  await wednesday.getByLabel("Окончание интервала 1", { exact: true }).fill("13:00");
  await save.click();
  await expect(page.getByText("Расписание сохранено", { exact: true })).toBeVisible();
  await expect(wednesdayRow).toHaveAttribute("aria-pressed", "true");
  expect(writes).toBe(1);
  const week = await (await request.get("/api/admin/availability/weekly")).json();
  expect(week.days).toHaveLength(7);
  expect(week.days[0].intervals).toEqual([
    { start: "23:30", end: "24:00" },
    { start: "00:00", end: "01:00" },
    { start: "01:00", end: "01:01" },
  ]);
  expect(week.days[2].intervals).toEqual([{ start: "12:00", end: "13:00" }]);
  await mondayRow.click();
  await expect(editor.getByLabel("Начало интервала 1", { exact: true })).toHaveValue("23:30");
});

test("сводка контрольной недели и адаптивная композиция соответствуют макету", async ({
  page,
  request,
}, testInfo) => {
  await request.post("/api/admin/scheduling-settings/time-zone", {
    data: { timeZone: "Europe/Moscow" },
  });
  await request.put("/api/admin/availability/weekly", {
    data: {
      days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
        (weekday, index) => ({
          weekday,
          isBlocked: index > 4,
          intervals:
            index > 4
              ? []
              : [
                  { start: "09:00", end: "13:00" },
                  { start: "14:00", end: index === 4 ? "17:00" : "18:00" },
                ],
        }),
      ),
    },
  });
  await page.goto("/admin/availability");
  await expect(page.getByRole("button", { name: "Сохранить расписание" })).toHaveCSS(
    "background-color",
    "rgb(40, 99, 68)",
  );
  const summary = page.getByLabel("Рабочие часы обычной недели");
  await expect(summary).toContainText("39 ч");
  await expect(summary).toContainText("5 дн.");
  await expect(
    page.getByRole("region", { name: "Настройка конкретной даты" }).getByLabel("Правило для даты"),
  ).toBeVisible();
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 900],
    [768, 1024],
    [820, 1180],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({
      path: testInfo.outputPath(`availability-${width}.png`),
      fullPage: true,
    });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .getByRole("button", { name: /^Понедельник\./ })
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});

test("серверная ошибка другого дня открывает поле и длинный текст помещается на телефоне", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await request.post("/api/admin/scheduling-settings/time-zone", { data: { timeZone: "UTC" } });
  await request.put("/api/admin/availability/weekly", {
    data: {
      days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
        (weekday) => ({ weekday, isBlocked: false, intervals: [{ start: "09:00", end: "18:00" }] }),
      ),
    },
  });
  await page.goto("/admin/availability");
  await page.getByRole("button", { name: /^Среда\./ }).click();
  const message = "Проверьте окончание интервала: " + "оченьдлинноепояснение".repeat(8);
  await page.route("**/api/admin/availability/weekly", async (route) => {
    await route.fulfill({
      status: 422,
      json: { code: "validation_error", fields: [{ field: "/days/0/intervals/0/end", message }] },
    });
  });
  await page.getByRole("button", { name: "Сохранить расписание" }).click();
  const monday = page.getByRole("group", { name: "Понедельник", exact: true });
  const end = monday.getByLabel("Окончание интервала 1", { exact: true });
  await expect(end).toBeFocused();
  await expect(end).toHaveAttribute("aria-invalid", "true");
  await expect(monday.getByText(message, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: testInfo.outputPath("availability-long-error-320.png"),
    fullPage: true,
  });
});
