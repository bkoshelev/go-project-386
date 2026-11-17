import { expect, test, type Page } from "@playwright/test";

const saved = {
  id: "0218c95a-535f-4cf0-8fe3-7390b05e5730",
  status: "confirmed",
  eventTypeId: "event-1",
  eventTypeName: "Consultation",
  startsAt: "2027-01-01T10:00:00Z",
  endsAt: "2027-01-01T10:30:00Z",
};

async function enterContacts(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Выбрать тип" }).click();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await page.getByLabel("Имя").fill(" Anna ");
  await page.getByLabel("Email").fill(" anna@example.com ");
}

test("React hook keeps one in-flight request and renders the confirmation", async ({ page }) => {
  let count = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/bookings", async (route) => {
    count++;
    expect(route.request().postDataJSON()).toEqual({
      eventTypeId: "event-1",
      startsAt: saved.startsAt,
      guest: { name: "Anna", email: "anna@example.com" },
    });
    await pending;
    await route.fulfill({ status: 201, json: saved });
  });
  await enterContacts(page);
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("button", { name: "Забронировать" })).toBeDisabled();
  await expect(page.getByLabel("Имя")).toBeDisabled();
  expect(count).toBe(1);
  release();
  await expect(page.getByRole("status")).toHaveText("Подтверждено: Consultation");
  expect(count).toBe(1);
});

test("lost HTTP response preserves the draft and needs manual retry", async ({ page }) => {
  let count = 0;
  await page.route("**/api/bookings", async (route) => {
    count++;
    if (count === 1) await route.abort("failed");
    else await route.fulfill({ status: 201, json: saved });
  });
  await enterContacts(page);
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("alert")).toHaveText("Результат неизвестен");
  await expect(page.getByLabel("Имя")).toHaveValue(" Anna ");
  expect(count).toBe(1);
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByRole("status")).toHaveText("Подтверждено: Consultation");
  expect(count).toBe(2);
});
