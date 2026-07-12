import "server-only";
import Stripe from "stripe";

// A single lazily-created Stripe client. The secret key comes from the
// environment only — never the repo (SAFEGUARDING.md rule 12). We deliberately
// let the SDK use its own pinned API version rather than hard-coding one here.
//
// Storyjar sends Stripe only ADULT billing data: a teacher's name/email or a
// school name. No child's name or work ever reaches Stripe (hard constraint).
let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    // Deny by default: without a key we cannot talk to Stripe, so callers must
    // treat billing as unavailable rather than proceeding blind (rule 8).
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!client) client = new Stripe(key);
  return client;
}

// True when billing is wired up in this environment. Lets the UI show a "billing
// not configured yet" state locally instead of throwing.
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
