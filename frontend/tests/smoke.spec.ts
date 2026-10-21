import { expect, test } from "./fixtures";

const description =
  "Сервис для бронирования встреч. Выберите удобное время для очной встречи или звонка";

test("главная страница представляет сервис и открывает запись", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Календарь встреч");
  await expect(
    page.getByRole("banner").getByRole("heading", { level: 1, name: "Календарь встреч" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByText(description, { exact: true })).toBeVisible();

  const bookingButton = page.getByRole("banner").getByRole("link", { name: "Записаться" });
  await expect(bookingButton).toBeVisible();
  await expect(bookingButton).toHaveAttribute("href", "/book");
  await expect(page.getByRole("link", { name: "Администрирование" })).toHaveAttribute(
    "href",
    "/admin",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const width of [320, 375, 768, 1440]) {
  test(`содержимое помещается и сохраняет композицию при ширине ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    const title = page.getByRole("heading", { level: 1, name: "Календарь встреч" });
    const button = page.getByRole("link", { name: "Записаться" });
    const text = page.getByRole("main").getByText(description, { exact: true });
    await expect(title).toBeVisible();
    await expect(button).toBeVisible();
    await expect(text).toBeVisible();

    const titleBox = (await title.boundingBox())!;
    const buttonBox = (await button.boundingBox())!;
    const textBox = (await text.boundingBox())!;
    const mainBox = (await page.getByRole("main").boundingBox())!;
    const headerBox = (await page.getByRole("banner").boundingBox())!;

    expect(titleBox.x).toBeGreaterThan(0);
    expect(buttonBox.x + buttonBox.width).toBeLessThan(width);
    expect(textBox.y).toBeGreaterThan(headerBox.y + headerBox.height);
    expect(textBox.x).toBeCloseTo(titleBox.x, 0);
    expect(textBox.x + textBox.width).toBeLessThan(width);
    expect(mainBox.x).toBeCloseTo(width - mainBox.x - mainBox.width, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width === 1440) {
      expect(mainBox.width).toBeLessThan(width);
    }
  });
}
