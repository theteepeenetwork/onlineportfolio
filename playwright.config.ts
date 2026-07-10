import { defineConfig } from "@playwright/test";

// End-to-end tests for the Class Journal app. They drive a real browser
// against the running app and exercise the full teacher + student flows.
// See TESTING.md for how to run them.
export default defineConfig({
  testDir: "./tests/e2e",
  // Reseed the database to a known demo state before the suite runs.
  globalSetup: "./tests/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // The tests share one class/teacher and the SQLite database, so run them
  // one at a time in order rather than in parallel.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // Start the app if it isn't already running.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
