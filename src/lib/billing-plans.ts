// The fixed Storyjar plan catalogue. Prices are created in Stripe (test/live)
// and referenced here only by env var — we never hard-code Stripe price ids or
// amounts that could drift from Stripe. Currency is GBP only.
//
// See the README for the Stripe CLI commands that create these prices.

export type PlanKey = "individual_monthly" | "individual_annual" | "school_seat_annual";

// Which env var holds each plan's Stripe price id.
export const PLAN_PRICE_ENV: Record<PlanKey, string> = {
  individual_monthly: "STRIPE_PRICE_INDIVIDUAL_MONTHLY", // £3.99 / month
  individual_annual: "STRIPE_PRICE_INDIVIDUAL_ANNUAL", // £40 / year
  school_seat_annual: "STRIPE_PRICE_SCHOOL_SEAT_ANNUAL", // £40 / seat / year (quantity = seats)
};

// Human labels for the billing UI (VAT-inclusive, GBP).
export const PLAN_LABELS: Record<PlanKey, string> = {
  individual_monthly: "Individual — £3.99 / month",
  individual_annual: "Individual — £40 / year",
  school_seat_annual: "School — £40 per teacher / year",
};

export const INDIVIDUAL_PLANS: PlanKey[] = ["individual_monthly", "individual_annual"];

export function isPlanKey(v: string): v is PlanKey {
  return v === "individual_monthly" || v === "individual_annual" || v === "school_seat_annual";
}

// Resolve a plan's Stripe price id from env. Throws (deny) if it isn't set, so a
// misconfigured environment can never silently check out on the wrong price.
export function priceIdFor(plan: PlanKey): string {
  const id = process.env[PLAN_PRICE_ENV[plan]];
  if (!id) throw new Error(`Missing Stripe price env var ${PLAN_PRICE_ENV[plan]}`);
  return id;
}
