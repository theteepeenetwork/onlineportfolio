import { defineConfig, devices } from "@playwright/test";

// ---------------------------------------------------------------------------
// The QA battery config (security + accessibility + UX), separate from the
// functional e2e config in playwright.config.ts.
//
// Why separate:
//  - it seeds TWO schools (prisma/seed-test.ts) so tenant-isolation is testable;
//  - it groups tests into named projects so CI can gate on `security` and
//    `a11y` while running `ux` report-only.
//
// Run everything:            npm run test:battery
// Run one gate:              npx playwright test -c playwright.battery.config.ts --project=security
// See TEST_PLAN.md / FINDINGS.md for what each project proves.
// ---------------------------------------------------------------------------

const PORT = process.env.PORT ?? "3000";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  // Reseed to the two-tenant fixtures before the battery runs.
  globalSetup: "./tests/battery/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Tests share one SQLite database and mutate sessions/rows — run serially.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/battery", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "security",
      testDir: "./tests/battery/security",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Repro tests for known, logged findings (see FINDINGS.md). Each asserts
      // the INTENDED secure behaviour, so it FAILS while the gap is open and
      // passes once fixed. CI runs this project REPORT-ONLY (non-blocking) so it
      // documents the gaps without falsely blocking merges.
      name: "security-findings",
      testDir: "./tests/battery/findings",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "a11y",
      testDir: "./tests/battery/a11y",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "ux",
      testDir: "./tests/battery/ux",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
