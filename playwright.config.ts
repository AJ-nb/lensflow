import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./output/playwright/test-results",
  reporter: process.env.CI ? [["github"], ["html", { outputFolder: "output/playwright/report", open: "never" }]] : "list",
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: "http://127.0.0.1:4321/lensflow/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/start-site-dev.mjs",
    url: "http://127.0.0.1:4321/lensflow/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
