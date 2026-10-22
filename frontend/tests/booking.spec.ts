import { expect, test } from "./fixtures";
import { prepareBooking, booking } from "./booking-fixtures";

test("гость проходит от главной до подтверждения с реальной записью при 320 px", async ({
  page,
  request,
}, testInfo) => {
  const { start } = await prepareBooking(request);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  await page.getByRole("link", { name: "Записаться", exact: true }).click();
  await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await page.getByLabel("Дата", { exact: true }).selectOption(start.slice(0, 10));
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 3. Данные гостя" })).toBeFocused();
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("textbox", { name: "Имя", exact: true })).toBeFocused();
  await expect(page.getByText("Введите имя", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Имя", exact: true }).fill(" Анна ");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(" anna@example.com ");
  await page.getByRole("button", { name: "Назад к времени" }).click();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("textbox", { name: "Имя", exact: true })).toHaveValue(" Анна ");
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(
    "anna@example.com",
  );
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("heading", { name: "Встреча подтверждена" })).toBeFocused();
  await expect(page.getByText("Обсуждение", { exact: true })).toBeVisible();
  await expect(page.getByText(/Часовой пояс:/)).toBeVisible();
  await expect(page.getByText(/Начало:/)).toBeVisible();
  await expect(page.getByText(/Окончание:/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: testInfo.outputPath("booking-confirmation-320.png"),
    fullPage: true,
  });
  const list = await (await request.get("/api/admin/bookings")).json();
  expect(list.items).toHaveLength(1);
  expect(list.items[0].guest).toEqual({ name: "Анна", email: "anna@example.com" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Шаг 1. Тип события" })).toBeVisible();
});

async function contactStep(page: import("@playwright/test").Page, date: string) {
  await page.goto("/book");
  await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await page.getByLabel("Дата", { exact: true }).selectOption(date);
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByRole("textbox", { name: "Имя", exact: true }).fill("Анна");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("anna@example.com");
}

test("конфликт обновляет календарь, смена типа сбрасывает время и сохраняет контакты", async ({
  page,
  request,
}) => {
  const { events, start } = await prepareBooking(request);
  await contactStep(page, start.slice(0, 10));
  const firstSlots = await (
    await request.get(`/api/event-types/${events[0].id}/availability`)
  ).json();
  // The UI chose the earliest slot of the date in the browser's timezone.
  const displayedStart = await page.getByText(/^Начало:/).textContent();
  expect(displayedStart).toBeTruthy();
  // Occupy the entire chosen local morning using the exact start sent by the guest.
  let selectedStart = "";
  await page.route("**/api/bookings", async (route) => {
    const body = route.request().postDataJSON();
    selectedStart = body.startsAt;
    expect(
      firstSlots.slots.some((slot: { startsAt: string }) => slot.startsAt === selectedStart),
    ).toBe(true);
    expect(
      (
        await request.post("/api/bookings", { data: booking(events[1].id, selectedStart) })
      ).status(),
    ).toBe(201);
    await route.continue();
  });
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 2. Дата и время" })).toBeFocused();
  await expect(page.getByRole("alert")).toHaveText("Время уже занято. Выберите другое время.");
  await expect(page.getByRole("button", { name: "Продолжить" })).toBeDisabled();
  const refreshed = await (
    await request.get(`/api/event-types/${events[0].id}/availability`)
  ).json();
  expect(
    refreshed.slots.some((slot: { startsAt: string }) => slot.startsAt === selectedStart),
  ).toBe(false);
  await page.getByRole("button", { name: "Назад к типам событий" }).click();
  await page.getByRole("radio", { name: "Короткая встреча", exact: true }).check();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("textbox", { name: "Имя", exact: true })).toHaveValue("Анна");
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(
    "anna@example.com",
  );
  expect((await (await request.get("/api/admin/bookings")).json()).items).toHaveLength(1);
});

test("отправка блокирует повторы, потерянный ответ сохраняет ввод без неподтверждённого успеха", async ({
  page,
  request,
}) => {
  const { start } = await prepareBooking(request);
  await contactStep(page, start.slice(0, 10));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route("**/api/bookings", async (route) => {
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await gate;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("button", { name: "Забронировать" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Имя", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "Сохранение бронирования" }),
  ).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText("Не удалось получить результат бронирования");
  await expect(page.getByRole("textbox", { name: "Имя", exact: true })).toHaveValue("Анна");
  await expect(page.getByRole("heading", { name: "Встреча подтверждена" })).toHaveCount(0);
  expect(writes).toBe(1);
  expect((await (await request.get("/api/admin/bookings")).json()).items).toHaveLength(1);
  await page.unroute("**/api/bookings");
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("alert")).toHaveText("Время уже занято. Выберите другое время.");
  await expect(page.getByRole("heading", { name: "Шаг 2. Дата и время" })).toBeFocused();
  expect(writes).toBe(1);
  expect((await (await request.get("/api/admin/bookings")).json()).items).toHaveLength(1);
});

test("ошибки email остаются у поля, корректный адрес без точки в домене принимается", async ({
  page,
  request,
}) => {
  const { start } = await prepareBooking(request);
  await contactStep(page, start.slice(0, 10));
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  await email.fill("wrong");
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(email).toBeFocused();
  await expect(page.getByText("Введите корректный email", { exact: true })).toBeVisible();
  await expect(email).toHaveValue("wrong");
  expect((await (await request.get("/api/admin/bookings")).json()).items).toHaveLength(0);
  await email.fill("anna@localhost");
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("heading", { name: "Встреча подтверждена" })).toBeVisible();
  const list = await (await request.get("/api/admin/bookings")).json();
  expect(list.items).toHaveLength(1);
  expect(list.items[0].guest.email).toBe("anna@localhost");
});
