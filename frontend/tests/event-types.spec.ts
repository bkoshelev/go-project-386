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
  await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
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

test("серверная нормализация Unicode-пробелов не отменяет подтверждение создания", async ({
  page,
  request,
}) => {
  await page.goto("/admin");
  for (const [input, expected, count] of [
    ["\u0085Встреча\u0085", "Встреча", 1],
    // Go retains U+FEFF, whereas String.trim() removes it from the server's response.
    ["\u0085\uFEFF\u0085", "\uFEFF", 2],
  ] as const) {
    await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
    await page.getByRole("textbox", { name: "Название" }).fill(input);
    await page.getByRole("spinbutton", { name: "Длительность" }).fill("30");
    await page.getByRole("button", { name: "Создать тип события" }).click();
    await expect(page.getByText("Тип события создан", { exact: true })).toBeVisible();
    const catalog = await (await request.get("/api/event-types")).json();
    expect(catalog.items).toHaveLength(count);
    expect(catalog.items[count - 1].name).toBe(expected);
    await expect(page.getByRole("listitem")).toHaveCount(count);
    await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Название" })).toBeEmpty();
    await page.getByRole("button", { name: "Закрыть форму", exact: true }).click();
  }
});

test("ошибки формы сохраняют ввод, фокусируют поле и не отправляют запрос", async ({ page }) => {
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") writes++;
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
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
    await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
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
  await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
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
  await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
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
  // Two synchronous user submissions arrive before React can disable the button.
  await page.locator("form").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.getByRole("status").filter({ hasText: "Сохранение" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать тип события" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Название" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Описание" })).toBeDisabled();
  await expect(page.getByRole("spinbutton", { name: "Длительность" })).toBeDisabled();
  await expect(page.getByLabel("Единица длительности")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Создать тип события" })).toBeVisible();
  await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  release();
  await expect(page.getByRole("alert")).toContainText("Не удалось получить результат сохранения");
  await expect(page.getByRole("textbox", { name: "Название" })).toHaveValue("Без ответа");
  await expect(page.getByText("Тип события создан", { exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
  const catalog = await (await request.get("/api/event-types")).json();
  expect(catalog.items).toHaveLength(1);
});

test("серверные ошибки связаны с полями, сохраняют ввод и возвращают фокус", async ({
  page,
  request,
}) => {
  await page.route("**/api/admin/event-types", async (route) => {
    // Exercise the real server's authoritative validation at the HTTP boundary.
    const response = await route.fetch({
      postData: { name: "", description: "Сохранить описание", durationMinutes: 0 },
    });
    expect(response.status()).toBe(422);
    await route.fulfill({ response });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Название" });
  const duration = page.getByRole("spinbutton", { name: "Длительность" });
  await name.fill("Исходное название");
  await page.getByRole("textbox", { name: "Описание" }).fill("Сохранить описание");
  await duration.fill("30");
  await page.getByRole("button", { name: "Создать тип события" }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось сохранить");
  await expect(name).toBeEnabled();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(/.+/);
  await expect(duration).toHaveAttribute("aria-invalid", "true");
  await expect(duration).toHaveAccessibleDescription(/.+/);
  await expect(name).toHaveValue("Исходное название");
  await expect(duration).toHaveValue("30");
  await expect(page.getByRole("textbox", { name: "Описание" })).toHaveValue("Сохранить описание");
  expect((await (await request.get("/api/event-types")).json()).items).toHaveLength(0);
  await page.unroute("**/api/admin/event-types");
  await page.getByRole("button", { name: "Создать тип события" }).click();
  await expect(page.getByText("Тип события создан", { exact: true })).toBeVisible();
});

test("ошибка обновления каталога не отменяет создание, повтор читает без новой записи", async ({
  page,
  request,
}) => {
  await page.goto("/admin");
  await expect(page.getByText("Типов событий пока нет")).toBeVisible();
  await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
  let reads = 0;
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") writes++;
  });
  await page.route("**/api/event-types", async (route) => {
    reads++;
    if (reads === 1) await route.abort("connectionfailed");
    else await route.continue();
  });
  await page.getByRole("textbox", { name: "Название" }).fill("Создан до сбоя чтения");
  await page.getByRole("textbox", { name: "Описание" }).fill("Описание");
  await page.getByRole("spinbutton", { name: "Длительность" }).fill("2");
  await page.getByLabel("Единица длительности").selectOption("hours");
  await page.getByRole("button", { name: "Создать тип события" }).click();
  await expect(page.getByText("Тип события создан", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Не удалось загрузить типы событий");
  expect(reads).toBe(1);
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("listitem")).toContainText("Создан до сбоя чтения");
  await expect(page.getByText("Тип события создан", { exact: true })).toBeVisible();
  expect(reads).toBe(2);
  expect(writes).toBe(1);
  expect((await (await request.get("/api/event-types")).json()).items).toHaveLength(1);
  await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Название" })).toBeEmpty();
  await expect(page.getByRole("textbox", { name: "Описание" })).toBeEmpty();
  await expect(page.getByRole("spinbutton", { name: "Длительность" })).toBeEmpty();
  await expect(page.getByLabel("Единица длительности")).toHaveValue("hours");
  await page.getByRole("textbox", { name: "Название" }).fill("Следующий тип события");
  await page.getByRole("spinbutton", { name: "Длительность" }).fill("1");
  await page.getByRole("button", { name: "Создать тип события" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  expect(reads).toBe(3);
  expect(writes).toBe(2);
});

test("запоздалое чтение не подменяет каталог после подтверждённого создания", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  let firstRead!: () => void;
  const started = new Promise<void>((done) => {
    firstRead = done;
  });
  let finish!: () => void;
  const finished = new Promise<void>((done) => {
    finish = done;
  });
  let reads = 0;
  await page.route("**/api/event-types", async (route) => {
    reads++;
    if (reads > 1) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    firstRead();
    await gate;
    await route.fulfill({ response });
    finish();
  });
  await page.goto("/admin");
  await started;
  await expect(page.getByText("Загрузка типов событий…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
  await page.getByRole("textbox", { name: "Название" }).fill("Новый каталог");
  await page.getByRole("spinbutton", { name: "Длительность" }).fill("30");
  await page.getByRole("button", { name: "Создать тип события" }).click();
  await expect(page.getByRole("listitem")).toHaveText(/Новый каталог/);
  release();
  await finished;
  await expect(page.getByRole("listitem")).toHaveText(/Новый каталог/);
  await expect(page.getByText("Типов событий пока нет")).toHaveCount(0);
});

test("гость повторяет чтение каталога и профиля независимо и сохраняет выбор", async ({
  page,
  request,
}) => {
  await request.post("/api/admin/event-types", {
    data: { name: "Выбор гостя", durationMinutes: 30 },
  });
  let catalogReads = 0;
  let ownerReads = 0;
  await page.route("**/api/event-types", async (route) => {
    catalogReads++;
    if (catalogReads === 1) await route.abort("connectionfailed");
    else await route.continue();
  });
  await page.route("**/api/owner", async (route) => {
    ownerReads++;
    if (ownerReads === 1) await route.abort("connectionfailed");
    else await route.continue();
  });
  await page.goto("/book");
  await expect(page.getByRole("alert")).toHaveCount(2);
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await page.getByRole("radio", { name: "Выбор гостя" }).check();
  await expect(page.getByRole("alert")).toHaveText("Не удалось загрузить профиль владельца");
  expect(ownerReads).toBe(1);
  await page.getByRole("button", { name: "Повторить загрузку профиля" }).click();
  await expect(
    page.getByRole("heading", { name: "Создать встречу с Александр Иванов" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Выбор гостя" })).toBeChecked();
  expect(catalogReads).toBe(2);
  expect(ownerReads).toBe(2);
});

test("непригодный успешный ответ после записи оставляет результат неизвестным", async ({
  page,
  request,
}) => {
  let writes = 0;
  await page.route("**/api/admin/event-types", async (route) => {
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.fulfill({ response, json: {} });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
  await page.getByRole("textbox", { name: "Название" }).fill("Ответ без подтверждения");
  await page.getByRole("textbox", { name: "Описание" }).fill("Сохранить ввод");
  await page.getByRole("spinbutton", { name: "Длительность" }).fill("2");
  await page.getByLabel("Единица длительности").selectOption("hours");
  await page.getByRole("button", { name: "Создать тип события" }).click();
  await expect(page.getByRole("alert")).toContainText("Проверьте каталог перед повтором");
  await expect(page.getByText("Тип события создан", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Название" })).toHaveValue(
    "Ответ без подтверждения",
  );
  await expect(page.getByRole("textbox", { name: "Описание" })).toHaveValue("Сохранить ввод");
  await expect(page.getByRole("spinbutton", { name: "Длительность" })).toHaveValue("2");
  await expect(page.getByRole("button", { name: "Создать тип события" })).toBeEnabled();
  expect((await (await request.get("/api/event-types")).json()).items).toHaveLength(1);
  expect(writes).toBe(1);
  await page.unroute("**/api/admin/event-types");
  await page.getByRole("button", { name: "Создать тип события" }).click();
  await expect(page.getByText("Тип события создан", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
  await expect(page.getByLabel("Единица длительности")).toHaveValue("hours");
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
        await page.getByRole("button", { name: "+ Новый тип", exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
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

test("модальное создание сохраняет черновик при закрытии и возвращает фокус", async ({ page }) => {
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") writes++;
  });
  await page.goto("/admin");
  const trigger = page.getByRole("button", { name: "+ Новый тип", exact: true });
  await trigger.click();
  const name = page.getByRole("textbox", { name: "Название" });
  await expect(name).toBeFocused();
  await name.fill("Черновик встречи");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Добавить тип события", exact: true }).click();
  await expect(name).toHaveValue("Черновик встречи");
  await page.getByRole("button", { name: "Закрыть форму", exact: true }).click();
  expect(writes).toBe(0);
});

test("предпросмотр карточки показывает реальные поля без записи", async ({ page, request }) => {
  await request.post("/api/admin/event-types", {
    data: { name: "Знакомство", description: "Обсудим задачу", durationMinutes: 15 },
  });
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") writes++;
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Как увидит гость: Знакомство", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Предпросмотр для гостя" });
  await expect(preview.getByRole("heading", { name: "Знакомство", exact: true })).toBeVisible();
  await expect(preview.getByText("Обсудим задачу", { exact: true })).toBeVisible();
  await expect(preview.getByText("15 мин", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toBe(0);
});
