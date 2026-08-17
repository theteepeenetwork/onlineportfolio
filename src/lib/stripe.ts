import "server-only";
import Stripe from "stripe";
import { STRIPE_KEY_VAR, stripeConfigured, stripeLiveMode } from "@/lib/stripeMode";

// A single lazily-created Stripe client. The secret key comes from the
// environment only — never the repo (SAFEGUARDING.md rule 12). We deliberately
// let the SDK use its own pinned API version rather than hard-coding one here.
//
// Storyjar sends Stripe only ADULT billing data: a teacher's name/email or a
// school name. No child's name or work ever reaches Stripe (hard constraint).
let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env[STRIPE_KEY_VAR];
  if (!key) {
    // Deny by default: without a key we cannot talk to Stripe, so callers must
    // treat billing as unavailable rather than proceeding blind (rule 8).
    throw new Error(`${STRIPE_KEY_VAR} is not configured`);
  }
  if (!client) client = new Stripe(key);
  return client;
}

// "Is billing wired up here", and "is it wired up to real money". Both live in
// src/lib/stripeMode.ts and are re-exported here so that every existing caller
// keeps importing them from the same place, and so that there is exactly ONE
// implementation of each.
//
// They are a separate module because the operator area needs both answers and
// must never import this file: this one builds a client from the secret key and
// carries `server-only`, and neither belongs anywhere near the ops roots. See
// the header of src/lib/stripeMode.ts.
export { stripeConfigured, stripeLiveMode };
