import { defineConfig, devices } from "@playwright/test";
import { BATTERY_STRIPE_KEY } from "./tests/battery/stripeFixtureKey";
import { BATTERY_MAIL_HMAC_KEY } from "./tests/battery/mailHmacFixtureKey";

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
  // Two minutes per test, raised from one on 17 August 2026. Nothing was
  // weakened to get there: no assertion changed, and `expect` still gives up
  // after ten seconds, so a broken page still fails fast. What needed the room
  // is the operator door, which is deliberately slow by design. A TOTP code
  // lasts thirty seconds and replay protection refuses a step at or below the
  // last accepted one, so two sign-ins inside one window are impossible and a
  // suite that signs in more than twenty times has to wait for the clock. Ops
  // tests routinely spent 30 of the 60 seconds signing in before they had done
  // anything, and a dev server compiling a route for the first time on top of
  // that left no margin at all.
  timeout: 120_000,
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
    {
      // The user-tester team: personas who use the product for real and write
      // down what confused, stalled or broke (tests/battery/personas/team.ts).
      // Report-only in CI, like `ux` — a persona's opinion is evidence for a
      // person to weigh, not a merge gate. The one thing that fails a persona
      // test is a blocker (an unhandled error, a 5xx, or a job they could not
      // finish), which is not a matter of taste.
      //
      // LAST in the list on purpose: personas write to the fixtures (they hand
      // work in, invite staff, create classes), so anything that reads the seed
      // in a known state runs before they touch it. Each viewport comes from the
      // persona rather than from `devices`, because whose hands are on the
      // device is the whole point.
      name: "personas",
      testDir: "./tests/battery/personas",
      // Deliberately NO `devices[...]` preset: the persona fixture supplies the
      // viewport, touch and mobile emulation, and a preset here would fight it.
      //
      // The timeouts are the point of this block. Playwright's default action
      // timeout is 0 — wait forever — which is the opposite of a user test: a
      // person who cannot find a control gives up and says so. With no timeout
      // the first persona run hung for the full two minutes on a `fill` against
      // a form that had already been replaced, and reported nothing.
      use: { actionTimeout: 15_000, navigationTimeout: 30_000 },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    // The operator area is 404 everywhere unless OPS_ENABLED is exactly "1"
    // (handbook ruling R17), and it is unset by default, including here. The
    // battery has to switch it on to test it at all, which also means a WARM
    // dev server started without it makes ops-auth.spec.ts fail on its first
    // test with a message saying exactly that. See TESTING.md on warm versus
    // cold servers.
    //
    // BATTERY_STRIPE_KEY is a fictional test-mode key, and it is here for one
    // reason: whether the operator billing screen offers a link into the Stripe
    // dashboard depends on whether a key is present at all, and CI sets none.
    // Without this, the link-out would render on a developer's machine and not
    // in CI, so the one new interactive element in PR3 would be untested on the
    // build that gates the merge. It is never sent anywhere: no code path in
    // the operator area calls Stripe, and the webhook spec stays skipped
    // because it also needs STRIPE_WEBHOOK_SECRET, which is still unset.
    //
    // MAIL_HMAC_KEY is here for the same reason as the Stripe key. With it
    // unset, the operator area records no address suppression at all and every
    // surface honestly says "not monitored" — a real state, and the one in
    // which none of PR5's suppression behaviour exists to be tested. The seed
    // hashes its fixture addresses under the SAME constant
    // (tests/battery/global-setup.ts), because two different keys would hash
    // one address to two labels and the seeded rows would match nothing.
    //
    // PW_HIDE_DEV_INDICATOR turns off Next's dev-tools badge for this server
    // only. The lanes run `next dev` on purpose (a production build withholds
    // the parent magic link, so family.spec.ts would fail because the gate is
    // working), and the badge is rendered in a portal at bottom-left whose
    // subtree intercepts pointer events — on 2026-08-23 it sat on top of the
    // teacher rail's expand button and ate 227 click retries. `npm run dev`
    // still has the badge; only these lanes lose it. See next.config.ts.
    env: {
      OPS_ENABLED: "1",
      STRIPE_SECRET_KEY: BATTERY_STRIPE_KEY,
      MAIL_HMAC_KEY: BATTERY_MAIL_HMAC_KEY,
      PW_HIDE_DEV_INDICATOR: "1",
    },
  },
});
