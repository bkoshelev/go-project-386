import { expect, test } from "./fixtures";
import { prepareBooking } from "./booking-fixtures";
import { chooseBookingDate } from "./booking-calendar";

test.use({ timezoneId: "Asia/Tokyo", viewport: { width: 320, height: 900 } });

test("гость записывается, владелец видит встречу и контакты в своём поясе", async ({
  page,
  request,
}) => {
  const { start } = await prepareBooking(request);
  await page.goto("/");
  await page.getByRole("link", { name: "Записаться", exact: true }).click();
  await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await chooseBookingDate(page, start.slice(0, 10));
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByRole("textbox", { name: "Имя", exact: true }).fill("Анна");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("anna@example.com");
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("heading", { name: "Встреча подтверждена" })).toBeVisible();
  const response = await (await request.get("/api/admin/bookings")).json();
  const item = response.items[0];
  await page.getByRole("link", { name: "Администрирование" }).click();
  await page.getByRole("link", { name: "Предстоящие встречи" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Предстоящие встречи" })).toBeVisible();
  await expect(page.getByText("Обсуждение", { exact: true })).toBeVisible();
  await expect(page.getByText("Анна", { exact: true })).toBeVisible();
  await expect(page.getByText("anna@example.com", { exact: true })).toBeVisible();
  await expect(page.getByText("Asia/Tokyo", { exact: true })).toBeVisible();
  const expected = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tokyo",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(item.startsAt));
  await expect(page.getByText(expected, { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("загрузка, ошибка с ручным повтором и пустой список различимы", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  await page.route("**/api/admin/bookings", async (route) => {
    attempts++;
    if (attempts === 1) {
      await gate;
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto("/admin/meetings");
  await expect(page.getByText("Загружаем встречи…")).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toHaveText("Не удалось загрузить встречи");
  const retry = page.getByRole("button", { name: "Повторить" });
  await retry.focus();
  await expect(retry).toBeFocused();
  expect(await retry.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
    "none",
  );
  await page.keyboard.press("Enter");
  await expect(page.getByText("Предстоящих встреч пока нет")).toBeVisible();
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("длинные название и контакты помещаются в карточку на 320 px", async ({ page, request }) => {
  const { start } = await prepareBooking(request);
  const title = "ДлинноеНазвание".repeat(6);
  const email = `${"a".repeat(64)}@example.com`;
  const event = await request.post("/api/admin/event-types", {
    data: { name: title, durationMinutes: 30 },
  });
  expect(event.status()).toBe(201);
  const { id } = await event.json();
  expect(
    (
      await request.post("/api/bookings", {
        data: { eventTypeId: id, startsAt: start, guest: { name: "Анна", email } },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/admin/meetings");
  const card = page.getByRole("listitem").filter({ hasText: title });
  await expect(card.getByText(email)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const bounds = await card.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return [...element.querySelectorAll("h3, p")].every((child) => {
      const rect = child.getBoundingClientRect();
      return rect.left >= box.left && rect.right <= box.right;
    });
  });
  expect(bounds).toBe(true);
});
