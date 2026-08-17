// A fictional Stripe key, used by nothing but the battery.
//
// It lives in its own file rather than in tests/battery/helpers.ts because
// playwright.battery.config.ts imports it, and helpers.ts imports Playwright
// and the Prisma client, which a config file should not drag in before the
// runner has started.
//
// WHY THE BATTERY SETS A KEY AT ALL
//
// The operator billing screen (PR3) offers a link into the Stripe dashboard
// only when a key is configured, because a link to nothing is worse than an
// honest sentence saying billing is not set up here. CI sets no Stripe
// variables, so without this the link-out would exist on a developer's machine
// and not on the build that gates the merge, and the one new interactive
// element in PR3 would go untested where it counts.
//
// It is safe because nothing can spend it: it is not a real key, the operator
// area makes no Stripe call of any kind (proved by the blindness gate, which
// bans fetch() under the ops roots and refuses an import of src/lib/stripe.ts),
// and the webhook spec that does talk to the Stripe SDK stays skipped because
// it also needs STRIPE_WEBHOOK_SECRET, which the battery does not set.
//
// IT DELIBERATELY DOES NOT LOOK LIKE A STRIPE KEY.
//
// The first version of this file used a realistic `sk_test_...` literal and
// GitHub's push protection rejected the push, which was the right call: a
// repository should not learn to wave through things shaped like secrets, and
// the next one might not be fictional. Nothing was gained by the shape anyway.
// src/lib/stripeMode.ts treats ONLY sk_live_ and rk_live_ as live, so every
// other string, including this one, is already test mode. The dashboard links
// the battery sees carry the /test/ path segment exactly as before.
export const BATTERY_STRIPE_KEY = "battery-fixture-not-a-real-key";
