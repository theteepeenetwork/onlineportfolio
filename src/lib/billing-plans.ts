// The fixed Storyjar plan catalogue. Prices are created in Stripe (test/live)
// and referenced here only by env var — we never hard-code Stripe price ids, so
// nothing here can drift from what Stripe actually charges. Currency is GBP only.
//
// Storyjar has TWO plans (docs/pricing-decisions.md):
//
//   • Teacher — FREE, permanently. One teacher, ALL of their own classes. No
//     card, no trial clock, nothing to buy. It has no entry here precisely
//     because there is no price: a free plan never reaches Stripe at all.
//   • School — banded by pupils on roll, £199 → £649 a year.
//
// The retired Individual plan (£3.99/mo, £40/yr) is deliberately absent. If an
// old price id is still set in the environment it is simply never read.
//
// See the README for the Stripe CLI commands that create these prices.

export type PlanKey = "school_small" | "school_1fe" | "school_2fe" | "school_large";

// --- The school bands -------------------------------------------------------
//
// Banded by PUPILS ON ROLL, not by teachers, not by classes, and never by
// per-pupil metering. The band boundaries are the shapes UK primaries actually
// describe themselves as (form entry: 1FE ≈ 210 pupils, 2FE ≈ 420), so a business
// manager can place their school in one glance.
//
// Three rules make banding compatible with "no price creep" — change any of them
// and the promise breaks:
//   1. The band is chosen ONCE, at purchase, from the school's published roll.
//   2. It is FIXED for the paid year. A school that grows mid-year pays nothing
//      more until renewal.
//   3. EVERY feature is in EVERY band. The band buys capacity, never
//      functionality — that is the line competitors cross and we don't.
export type SchoolBand = {
  key: PlanKey;
  /** Upper bound of pupils on roll; null = no upper bound (the top band). */
  maxPupils: number | null;
  /** Price in whole pounds per year. */
  price: number;
  /** Short label for the pricing page. */
  label: string;
  /** The kind of school this band is shaped for, in a business manager's words. */
  hint: string;
};

export const SCHOOL_BANDS: readonly SchoolBand[] = [
  { key: "school_small", maxPupils: 105, price: 199, label: "Up to 105 pupils", hint: "A village, infant or small rural primary" },
  { key: "school_1fe", maxPupils: 210, price: 299, label: "Up to 210 pupils", hint: "A one-form-entry primary" },
  { key: "school_2fe", maxPupils: 420, price: 449, label: "Up to 420 pupils", hint: "A two-form-entry primary" },
  { key: "school_large", maxPupils: null, price: 649, label: "Over 420 pupils", hint: "A large primary or all-through setting" },
] as const;

export function bandFor(plan: PlanKey): SchoolBand {
  const band = SCHOOL_BANDS.find((b) => b.key === plan);
  if (!band) throw new Error(`Unknown plan ${plan}`);
  return band;
}

// The band a given roll falls into — used to pre-select the right option, never
// to charge automatically. The school confirms its own band at purchase.
export function bandForPupils(pupils: number): SchoolBand {
  return SCHOOL_BANDS.find((b) => b.maxPupils !== null && pupils <= b.maxPupils) ?? SCHOOL_BANDS[SCHOOL_BANDS.length - 1];
}

export const CHEAPEST_SCHOOL_PRICE = SCHOOL_BANDS[0].price;

// --- VAT --------------------------------------------------------------------
//
// Storyjar is NOT VAT registered (turnover is well under the £90,000 threshold),
// so prices are simply the price. This flag is the ONE place that changes:
// it is illegal to show "+ VAT" or "ex VAT" when you are not registered, so no
// price copy anywhere may hard-code a VAT stance — read `priceNote()` instead.
//
// Flip to true on the day registration completes and every surface follows.
export const VAT_REGISTERED = false;

/** The qualifier that must sit next to every published price. */
export function priceNote(): string {
  return VAT_REGISTERED ? "+ VAT" : "No VAT to add";
}

/** "£299" or "£299 + VAT", for inline use. */
export function formatPrice(price: number): string {
  return VAT_REGISTERED ? `£${price} + VAT` : `£${price}`;
}

// Which env var holds each plan's Stripe price id.
export const PLAN_PRICE_ENV: Record<PlanKey, string> = {
  school_small: "STRIPE_PRICE_SCHOOL_SMALL", // £199 / year
  school_1fe: "STRIPE_PRICE_SCHOOL_1FE", // £299 / year
  school_2fe: "STRIPE_PRICE_SCHOOL_2FE", // £449 / year
  school_large: "STRIPE_PRICE_SCHOOL_LARGE", // £649 / year
};

// Human labels for the billing UI.
export const PLAN_LABELS: Record<PlanKey, string> = {
  school_small: "School — up to 105 pupils",
  school_1fe: "School — up to 210 pupils",
  school_2fe: "School — up to 420 pupils",
  school_large: "School — over 420 pupils",
};

export function isPlanKey(v: string): v is PlanKey {
  return SCHOOL_BANDS.some((b) => b.key === v);
}

// Resolve a plan's Stripe price id from env. Throws (deny) if it isn't set, so a
// misconfigured environment can never silently check out on the wrong price.
export function priceIdFor(plan: PlanKey): string {
  const id = process.env[PLAN_PRICE_ENV[plan]];
  if (!id) throw new Error(`Missing Stripe price env var ${PLAN_PRICE_ENV[plan]}`);
  return id;
}
