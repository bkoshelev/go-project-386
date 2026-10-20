import { expect, test } from "./fixtures";

test("владелец создаёт тип, гость читает его после перезапуска и нового открытия", async ({
  page,
  backend,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Администрирование" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Типов событий пока нет")).toBeVisible();
  await page.getByRole("textbox", { name: "Название" }).fill("  Обсуждение проекта  ");
  await page.getByLabel("Описание", { exact: true }).fill("План и вопросы");
  await page.getByRole("spinbutton", { name: "Длительность" }).fill("2");
  await page.getByLabel("Единица длительности").selectOption("hours");
  await page.getByRole("button", { name: "Создать тип события" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Тип события создан" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Типы событий" })).toContainText("120 мин");
  await backend.restart();
  const guest = await context.newPage();
  await guest.goto("/");
  await guest.getByRole("link", { name: "Записаться" }).click();
  await expect(
    guest.getByRole("heading", { name: "Создать встречу с Александр Иванов" }),
  ).toBeVisible();
  await expect(guest.getByRole("heading", { name: "Шаг 1. Тип события" })).toBeFocused();
  await expect(guest.getByRole("radio", { name: /Обсуждение проекта/ })).toBeVisible();
  await expect(guest.getByText("План и вопросы")).toBeVisible();
  await expect(guest.getByText("120 мин")).toBeVisible();
  await guest.getByRole("radio", { name: /Обсуждение проекта/ }).check();
  await expect(guest.getByRole("radio", { name: /Обсуждение проекта/ })).toBeChecked();
});

test("пустой гостевой каталог отличается от загрузки", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  await page.route("**/api/event-types", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/book");
  await expect(page.getByRole("status").filter({ hasText: "Загрузка типов" })).toBeVisible();
  await expect(page.getByText("Пока нет доступных типов встреч")).toHaveCount(0);
  release();
  await expect(page.getByText("Пока нет доступных типов встреч")).toBeVisible();
});

test("ошибки формы сохраняют ввод, фокусируют поле и не отправляют запрос", async ({ page }) => {
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") writes++;
  });
  await page.goto("/admin");
  const name = page.getByRole("textbox", { name: "Название" });
  const duration = page.getByRole("spinbutton", { name: "Длительность" });
  const save = page.getByRole("button", { name: "Создать тип события" });
  await name.fill("  ");
  await duration.fill("30");
  await save.click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Введите название", { exact: true })).toBeVisible();
  await name.fill("Тестовая встреча");
  for (const unit of ["minutes", "hours"]) {
    await page.getByLabel("Единица длительности").selectOption(unit);
    for (const value of ["0", "1.5", unit === "hours" ? "24" : "61", "90"]) {
      await duration.fill(value);
      await save.click();
      await expect(duration).toBeFocused();
      await expect(duration).toHaveAttribute("aria-invalid", "true");
      await expect(duration).toHaveValue(value);
      await expect(name).toHaveValue("Тестовая встреча");
    }
  }
  expect(writes).toBe(0);
});

test("границы длительности вводятся в UI в минутах и часах", async ({ page }) => {
  await page.goto("/admin");
  for (const [unit, value, minutes] of [
    ["minutes", "1", "1 мин"],
    ["minutes", "60", "60 мин"],
    ["hours", "1", "60 мин"],
    ["hours", "23", "1380 мин"],
  ]) {
    await page.getByRole("textbox", { name: "Название" }).fill(`${unit} ${value}`);
    await page.getByRole("spinbutton", { name: "Длительность" }).fill(value);
    await page.getByLabel("Единица длительности").selectOption(unit);
    await page.getByRole("button", { name: "Создать тип события" }).click();
    const item = page.getByRole("listitem").filter({ hasText: `${unit} ${value}` });
    await expect(item).toContainText(minutes);
  }
  await expect(page.getByRole("listitem")).toHaveCount(4);
});

test("сбой БД виден при чтении и записи, ручной повтор восстанавливает сценарий", async ({
  page,
  context,
  request,
  backend,
}) => {
  test.setTimeout(60_000);
  await page.goto("/admin");
  await expect(page.getByText("Типов событий пока нет")).toBeVisible();
  await page.getByRole("textbox", { name: "Название" }).fill("После восстановления");
  await page.getByRole("textbox", { name: "Описание" }).fill("Сохранённый ввод");
  await page.getByRole("spinbutton", { name: "Длительность" }).fill("30");
  await backend.database(false);
  await page.getByRole("button", { name: "Создать тип события" }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось сохранить");
  await expect(page.getByRole("textbox", { name: "Название" })).toHaveValue("После восстановления");
  await expect(page.getByRole("textbox", { name: "Описание" })).toHaveValue("Сохранённый ввод");
  await expect(page.getByRole("spinbutton", { name: "Длительность" })).toHaveValue("30");
  await expect(page.getByText("Тип события создан", { exact: true })).toHaveCount(0);
  expect((await request.get("/healthz")).status()).toBe(200);
  for (const path of ["/api/owner", "/api/event-types"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(500);
    expect(await response.json()).toMatchObject({ code: "internal_error" });
  }
  const guest = await context.newPage();
  await guest.goto("/book");
  await expect(guest.getByRole("alert")).toHaveCount(2);
  await expect(guest.getByText("Пока нет доступных типов встреч")).toHaveCount(0);
  const admin = await context.newPage();
  await admin.goto("/admin");
  await expect(admin.getByRole("alert")).toContainText("Не удалось загрузить");
  await backend.database(true);
  expect(await (await request.get("/api/event-types")).json()).toEqual({ items: [] });
  await guest.getByRole("button", { name: "Повторить загрузку профиля" }).click();
  await guest.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(guest.getByRole("heading", { name: /Создать встречу с/ })).toBeVisible();
  await expect(guest.getByText("Пока нет доступных типов встреч")).toBeVisible();
  await admin.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(admin.getByText("Типов событий пока нет")).toBeVisible();
  await page.getByRole("button", { name: "Создать тип события" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Тип события создан" })).toBeVisible();
});

test("сохранение блокирует повтор, потерянный ответ не показывает успех", async ({
  page,
  request,
}) => {
  await page.goto("/admin");
  await page.getByRole("textbox", { name: "Название" }).fill("Без ответа");
  await page.getByRole("spinbutton", { name: "Длительность" }).fill("30");
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  let writes = 0;
  await page.route("**/api/admin/event-types", async (route) => {
    writes++;
    // The real backend commits, then the connection loses its response.
    await route.fetch();
    await gate;
    await route.abort("connectionfailed");
  });
  await page.getByRole("button", { name: "Создать тип события" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Сохранение" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать тип события" })).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("Не удалось получить результат сохранения");
  await expect(page.getByRole("textbox", { name: "Название" })).toHaveValue("Без ответа");
  await expect(page.getByText("Тип события создан", { exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
  const catalog = await (await request.get("/api/event-types")).json();
  expect(catalog.items).toHaveLength(1);
});

for (const width of [320, 375, 768, 1440]) {
  test(`форма и каталог доступны с клавиатуры и помещаются на ${width} px`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await request.post("/api/admin/event-types", {
      data: {
        name: "ДлинноеНазвание".repeat(20),
        description: "Описание".repeat(30),
        durationMinutes: 30,
      },
    });
    for (const path of ["/admin", "/book"]) {
      await page.goto(path);
      await expect(page.getByRole("listitem")).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      if (path === "/admin") {
        const name = page.getByRole("textbox", { name: "Название" });
        await name.focus();
        await page.keyboard.type("Клавиатура");
        await page.keyboard.press("Tab");
        await expect(page.getByRole("textbox", { name: "Описание" })).toBeFocused();
        await page.keyboard.press("Tab");
        await page.keyboard.type("15");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: "Создать тип события" })).toBeFocused();
        expect(
          await page
            .getByRole("button", { name: "Создать тип события" })
            .evaluate((element) => getComputedStyle(element).outlineStyle),
        ).not.toBe("none");
      } else {
        await page.keyboard.press("Tab");
        await expect(page.getByRole("radio")).toBeFocused();
        await page.keyboard.press("Space");
        await expect(page.getByRole("radio")).toBeChecked();
      }
      if (width === 320)
        await page.screenshot({
          path: testInfo.outputPath(`${path.slice(1)}-320.png`),
          fullPage: true,
        });
    }
  });
}
