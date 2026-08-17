// Which Stripe data set this deployment is pointed at, and whether it is
// pointed at one at all. Two booleans over one environment variable, and
// nothing else.
//
// WHY THIS IS ITS OWN FILE, RATHER THAN TWO MORE EXPORTS IN src/lib/stripe.ts
//
// The operator area needs both answers. It needs `stripeConfigured()` so a
// screen can say "billing is not set up in this environment" instead of
// offering a link to nothing, and it needs the mode so a deep link into the
// Stripe dashboard lands on the data set the ids actually belong to. It must
// get them WITHOUT importing src/lib/stripe.ts, for two reasons that both
// matter:
//
//   1. src/lib/stripe.ts constructs the Stripe SDK client from the secret key.
//      Letting an ops file import it would put `getStripe()` one keystroke away
//      from every operator screen, and the whole point of PR3 is that ops links
//      out to Stripe and never calls it. The secret key stays out of the ops
//      path entirely.
//   2. src/lib/stripe.ts carries `import "server-only"`, which throws the
//      moment a Playwright test imports it. The blocking spec for the deep
//      links has to be able to import the link builder and assert both modes
//      directly, the same reason src/lib/ops/dto.ts and src/lib/ops/enabled.ts
//      are deliberately free of it.
//
// So the SDK lives in src/lib/stripe.ts and re-exports these two, meaning there
// is exactly one implementation of "is Stripe configured" in the codebase and
// the teacher-facing billing screens and the operator screen cannot disagree.
//
// Nothing here returns, logs or formats the key. The only thing that leaves
// this file is a boolean.

export const STRIPE_KEY_VAR = "STRIPE_SECRET_KEY";

/**
 * True when billing is wired up in this environment. Callers must treat a false
 * as "billing is unavailable" and say so, rather than proceeding blind
 * (SAFEGUARDING rule 8, deny by default).
 */
export function stripeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[STRIPE_KEY_VAR]);
}

/**
 * True only for a key that is unambiguously a live-mode one.
 *
 * Stripe issues `sk_live_…` and `rk_live_…` against real money and
 * `sk_test_…` / `rk_test_…` against a sandbox. Anything this cannot recognise
 * is treated as test, which is the safe direction for the one thing this
 * decides: a link built for the wrong mode opens a Stripe page that says the
 * object does not exist, and a test-shaped link is the version of that mistake
 * that cannot possibly show somebody real payment data.
 */
export function stripeLiveMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(?:sk|rk)_live_/.test(env[STRIPE_KEY_VAR] ?? "");
}
