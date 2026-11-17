import { defineConfig } from "@playwright/test";

export default defineConfig({
  testMatch: "browser.spec.ts",
  use: { baseURL: "http://127.0.0.1:4317", browserName: "chromium" },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 4317 --strictPort",
    url: "http://127.0.0.1:4317",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
