// A fictional Stripe *webhook signing* secret, used by nothing but the battery.
//
// It lives in its own file for the same reason as stripeFixtureKey.ts:
// playwright.battery.config.ts imports it, and helpers.ts imports Playwright and
// the Prisma client, which a config file should not drag in before the runner
// has started.
//
// WHY THE BATTERY SETS ONE AT ALL
//
// tests/battery/security/stripe-webhook.spec.ts has never run in CI. Its
// describe-level `test.skip(!configured)` needs STRIPE_WEBHOOK_SECRET as well as
// STRIPE_SECRET_KEY, and only the second was set, so all of its tests were
// skipped on every PR and every push to main. No webhook behaviour was gated on
// anything — signature rejection, idempotent redelivery, the freeze on
// cancellation, and now the verification stamp and the refund detach.
//
// Turning it on costs nothing and stays hermetic. Webhook signature
// verification is pure local crypto: the Stripe SDK HMACs the raw body with
// this string on both sides (`generateTestHeaderString` in the spec,
// `constructEvent` in the route) and never opens a socket. Any string is a
// valid signing secret, because the secret is only ever an HMAC key.
//
// IT DELIBERATELY DOES NOT LOOK LIKE A STRIPE WEBHOOK SECRET.
//
// The same lesson stripeFixtureKey.ts records: an earlier fixture there used a
// realistic `sk_test_...` literal and GitHub's push protection rejected the
// push, which was the right call. A repository should not learn to wave through
// things shaped like secrets, because the next one might not be fictional. A
// string shaped like a real `whsec_...` would be rejected the same way, and the
// shape buys nothing — no code anywhere parses a webhook secret's prefix.
export const BATTERY_STRIPE_WEBHOOK_SECRET = "battery-fixture-not-a-real-webhook-secret";
