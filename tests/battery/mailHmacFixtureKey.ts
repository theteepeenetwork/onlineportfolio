// The MAIL_HMAC_KEY the battery runs under, used by nothing else.
//
// It lives in its own file, like tests/battery/stripeFixtureKey.ts and for the
// same reason: both playwright.battery.config.ts and
// tests/battery/global-setup.ts import it, and neither should drag in
// tests/battery/helpers.ts, which pulls in Playwright and the Prisma client
// before the runner has started.
//
// WHY THE BATTERY SETS ONE AT ALL
//
// With no MAIL_HMAC_KEY, StoryJar records no suppression and every screen and
// record honestly answers "not monitored" (src/lib/ops/mailHmac.ts). That is a
// real state and it is worth testing, but it is the state in which none of the
// interesting behaviour exists: the suppression counts, the parent record's
// delivery line and the whole reason the operator screen was built would all be
// untested on the build that gates the merge, exactly the trap the Stripe
// fixture key was added to close.
//
// It must be the SAME value in two places, or the fixtures and the application
// hash the same address to two different labels and the seeded suppression
// matches nothing: the dev server's environment (the `webServer.env` block in
// playwright.battery.config.ts) and the seed's (global-setup.ts). Both import
// this constant rather than repeating a literal, so they cannot drift.
//
// It is safe because it protects nothing real. The only addresses hashed under
// it belong to the fictional fixture families in prisma/seed-test.ts.
export const BATTERY_MAIL_HMAC_KEY = "battery-fixture-mail-hmac-key";
