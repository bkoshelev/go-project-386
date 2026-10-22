import { defineConfig, devices } from "@playwright/test";

if (!process.env.CONTAINER_BASE_URL) {
  throw new Error("CONTAINER_BASE_URL is required");
}

export default defineConfig({
  testDir: "./tests",
  testMatch: "container.spec.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  outputDir: "../artifacts/container-smoke/browser",
  use: {
    ...devices["Desktop Chrome"],
    // The browser runs on the GitHub host, outside the application container.
    channel: process.env.GITHUB_ACTIONS === "true" ? "chrome" : undefined,
    baseURL: process.env.CONTAINER_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
