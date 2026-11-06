import { expect, test } from "./fixtures";
import { prepareBooking } from "./booking-fixtures";
import { bookingDateLabel, chooseBookingDate } from "./booking-calendar";

test("календарь пересекает год в поясе гостя, сохраняет выбор при навигации и ограничивает UTC-окно", async ({
  browser,
  request,
  backend,
}) => {
  const { events } = await prepareBooking(request);
  const context = await browser.newContext({ timezoneId: "Asia/Tokyo", baseURL: backend.url });
  try {
    const page = await context.newPage();
    const availability = await (
      await request.get(`/api/event-types/${events[0].id}/availability`)
    ).json();
    const year = new Date(availability.generatedAt).getUTCFullYear() + 1;
    // Only the read boundary is controlled to exercise a year boundary regardless of today's date.
    // Successful booking continues to be covered against the real backend in booking.spec.ts.
    const startsAt = `${year}-12-31T14:45:00Z`;
    const endsAt = `${year}-12-31T15:15:00Z`;
    await page.route("**/api/event-types/*/availability", async (route) => {
      await route.fulfill({
        json: {
          ...availability,
          windowStartsAt: `${year}-12-26T00:00:00Z`,
          windowEndsAt: `${year + 1}-01-09T00:00:00Z`,
          slots: [{ startsAt, endsAt }],
        },
      });
    });
    await page.goto("/book");
    await page.getByRole("radio", { name: "Обсуждение", exact: true }).check();
    await page.getByRole("button", { name: "Выбрать время" }).click();
    await expect(
      page.getByRole("button", { name: "Предыдущий месяц", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: bookingDateLabel(`${year}-12-25`), exact: true }),
    ).toBeDisabled();
    const selectedDay = page.getByRole("button", {
      name: bookingDateLabel(`${year}-12-31`),
      exact: true,
    });
    await expect(selectedDay).toHaveAttribute("aria-pressed", "true");
    const slot = page.getByRole("radio", { name: new RegExp(`23:45–1 января ${year + 1}`) });
    await slot.check();
    const selection = page.getByRole("status").filter({ hasText: "Время выбрано" });
    await expect(selection).toContainText(`31 декабря ${year}`);
    await expect(selection).toContainText(`1 января ${year + 1}`);
    await page.getByRole("button", { name: "Следующий месяц", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Следующий месяц", exact: true })).toBeDisabled();
    await expect(page.getByRole("region", { name: "Время встречи", exact: true })).toContainText(
      `31 декабря ${year}`,
    );
    await expect(slot).toBeChecked();
    // The last local date is partial but selectable; the following date is outside the UTC window.
    await expect(
      page.getByRole("button", { name: bookingDateLabel(`${year + 1}-01-10`), exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: bookingDateLabel(`${year + 1}-01-09`), exact: true })
      .focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByText("На эту дату нет свободного времени", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Продолжить" })).toBeDisabled();
    await expect(selection).toHaveCount(0);
    await page.getByRole("button", { name: "Обновить доступность" }).click();
    await expect(
      page.getByRole("button", { name: bookingDateLabel(`${year + 1}-01-09`), exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Продолжить" })).toBeDisabled();
    await expect(page.getByText("Часовой пояс: Asia/Tokyo", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

for (const width of [320, 390, 768, 1440]) {
  test(`все шаги, длинные данные и большой список слотов доступны при ${width} px`, async ({
    page,
    request,
  }, testInfo) => {
    const { start } = await prepareBooking(request);
    const name = "ДлинноеНазвание".repeat(20);
    await request.post("/api/admin/event-types", {
      data: {
        name,
        description: "Описание встречи ".repeat(30),
        durationMinutes: 30,
      },
    });
    await page.setViewportSize({ width, height: 1000 });
    const fits = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    };
    await page.goto("/book/direct-link?variant=E");
    await expect(page.getByRole("heading", { name: "Шаг 1. Тип события" })).toBeFocused();
    await expect(page.getByRole("radio").first()).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("radio").first()).toBeFocused();
    await page.getByRole("radio", { name, exact: true }).check();
    await fits();
    await page.screenshot({
      path: testInfo.outputPath(`booking-types-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Выбрать время" }).click();
    const calendar = page.getByRole("region", { name: "Дата встречи", exact: true });
    await expect(calendar).toBeVisible();
    await chooseBookingDate(page, start.slice(0, 10));
    const slots = page.getByRole("radio");
    await expect.poll(() => slots.count()).toBeGreaterThan(20);
    const lastSlot = slots.last();
    await lastSlot.focus();
    await page.keyboard.press("Space");
    await expect(lastSlot).toBeChecked();
    await expect(lastSlot).toBeInViewport();
    await fits();
    await page.screenshot({
      path: testInfo.outputPath(`booking-calendar-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Продолжить" }).click();
    await expect(page.getByRole("heading", { name: "Шаг 3. Данные гостя" })).toBeFocused();
    await page.getByRole("textbox", { name: "Имя", exact: true }).fill("ДлинноеИмя".repeat(10));
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(`${"a".repeat(64)}@${"b".repeat(60)}.example`);
    await fits();
    await page.screenshot({
      path: testInfo.outputPath(`booking-contacts-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Забронировать" }).click();
    await expect(page.getByRole("heading", { name: "Встреча подтверждена" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Назад к времени" })).toHaveCount(0);
    await fits();
    await page.screenshot({
      path: testInfo.outputPath(`booking-confirmation-${width}.png`),
      fullPage: true,
    });
    expect((await (await request.get("/api/admin/bookings")).json()).items).toHaveLength(1);
  });
}
