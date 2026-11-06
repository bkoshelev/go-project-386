import { expect, type Page } from "@playwright/test";

export function bookingDateLabel(date: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "full" }).format(
    new Date(`${date}T12:00:00`),
  );
}

export async function chooseBookingDate(page: Page, date: string) {
  await expect(page.getByRole("region", { name: "Дата встречи", exact: true })).toBeVisible();
  const day = page.getByRole("button", { name: bookingDateLabel(date), exact: true });
  if (!(await day.isVisible())) {
    const next = page.getByRole("button", { name: "Следующий месяц", exact: true });
    if (await next.isEnabled()) await next.click();
    else await page.getByRole("button", { name: "Предыдущий месяц", exact: true }).click();
  }
  await day.click();
}
