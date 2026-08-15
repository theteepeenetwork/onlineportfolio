// The fixed Storyjar plan catalogue. Prices are created in Stripe (test/live)
// and referenced here only by env var — we never hard-code Stripe price ids, so
// nothing here can drift from what Stripe actually charges. Currency is GBP only.
//
// Storyjar has TWO plans (docs/pricing-decisions.md):
//
//   • Teacher — FREE, permanently. One teacher, ALL of their own classes. No
//     card, no trial clock, nothing to buy. It has no entry here precisely
//     because there is no price: a free plan never reaches Stripe at all.
//   • School — £299 / year, FLAT. No seats, no quantity, no per-pupil creep.
//
// The retired Individual plan (£3.99/mo, £40/yr) is deliberately absent. If an
// old price id is still set in the environment it is simply never read.
//
// See the README for the Stripe CLI commands that create these prices.

export type PlanKey = "school_annual";

// Which env var holds each plan's Stripe price id.
export const PLAN_PRICE_ENV: Record<PlanKey, string> = {
  school_annual: "STRIPE_PRICE_SCHOOL_ANNUAL", // £299 / year, flat (quantity is always 1)
};

// Human labels for the billing UI (VAT-inclusive, GBP).
export const PLAN_LABELS: Record<PlanKey, string> = {
  school_annual: "School — £299 / year",
};

export function isPlanKey(v: string): v is PlanKey {
  return v === "school_annual";
}

// Resolve a plan's Stripe price id from env. Throws (deny) if it isn't set, so a
// misconfigured environment can never silently check out on the wrong price.
export function priceIdFor(plan: PlanKey): string {
  const id = process.env[PLAN_PRICE_ENV[plan]];
  if (!id) throw new Error(`Missing Stripe price env var ${PLAN_PRICE_ENV[plan]}`);
  return id;
}
