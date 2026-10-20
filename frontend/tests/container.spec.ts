import { expect, test } from "@playwright/test";

test("образ обслуживает frontend и backend на одном origin", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("requestfailed", (request) => failures.push(request.url()));
  await page.goto("/");
  await expect(page).toHaveTitle("Календарь встреч");
  await expect(page.getByRole("heading", { name: "Календарь встреч" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Записаться" })).toBeDisabled();
  const health = await page.evaluate(async () => {
    const response = await fetch("/healthz");
    return { status: response.status, body: await response.json() };
  });
  expect(health).toEqual({ status: 200, body: { status: "ok" } });
  const readiness = await page.evaluate(async () => {
    const response = await fetch("/readyz");
    return { status: response.status, body: await response.json() };
  });
  expect(readiness).toEqual({ status: 200, body: { status: "ok" } });
  await page.goto("/book/direct-link");
  await expect(page.getByRole("heading", { name: "Календарь встреч" })).toBeVisible();
  for (const path of ["/api", "/api/unknown", "/assets/missing.js"]) {
    const result = await page.evaluate(async (path) => {
      const response = await fetch(path);
      return { status: response.status, type: response.headers.get("content-type") };
    }, path);
    expect(result.status).toBe(404);
    expect(result.type).not.toContain("text/html");
  }
  expect(failures).toEqual([]);
});
