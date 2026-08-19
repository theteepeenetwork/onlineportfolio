import { stripeConfigured, stripeLiveMode } from "@/lib/stripeMode";
import type { StripeLinkDto, StripeRefDto } from "@/lib/ops/dto";

// ---------------------------------------------------------------------------
// Deep links into the Stripe dashboard (PR3, owner decision D6)
// ---------------------------------------------------------------------------
//
// WHAT THIS FILE IS, AND THE ONE THING IT IS NOT
//
// It turns a Stripe id that StoryJar already stores into a URL. That is all it
// does. It makes no network call, it never reads the secret key, it never
// touches the database, and there is no function here that changes anything in
// Stripe or in StoryJar.
//
// Owner decision D6, 17 August 2026, in docs/ops-architecture.md: "Manual
// payment recording is dropped from v1. A manual override that the next Stripe
// webhook silently reverts is worse than no control, because someone will trust
// it. Billing screens are read-only with a link out to Stripe, which is where
// the truth lives." The Subscription row in StoryJar is a MIRROR written by
// src/app/api/stripe/webhook/route.ts. Anything an operator typed into it would
// be overwritten by the next event, silently, and the operator would have no
// way to know. So the answer to "this school says it has paid" is this link,
// and the work happens in Stripe.
//
// WHY IT DOES NOT CALL STRIPE
//
// A render path that calls a third party is a screen that is slow on a good day
// and blank on a bad one, and the mirror already holds every field the screen
// shows. Reading Stripe live would also mean the secret key in the ops path,
// which is the thing the split in src/lib/stripeMode.ts exists to prevent.
//
// WHY THERE IS NO `import "server-only"` HERE
//
// Same reason as src/lib/ops/dto.ts and src/lib/ops/enabled.ts: the blocking
// spec asserts the URL shape directly, in both modes, and a module carrying
// `server-only` throws the moment a Playwright test imports it. Nothing in this
// file is secret. It is string building plus one boolean read.
//
// THE URL SHAPE, VERIFIED RATHER THAN REMEMBERED
//
// Checked on 17 August 2026 against Stripe's own documentation
// (https://docs.stripe.com/stripe-apps/deep-links, "Deep link format"), because
// brief 03 is explicit that nobody should write this from memory:
//
//     https://dashboard.stripe.com/<ACCOUNT_ID>/<MODE>/<PAGE>
//
// with MODE being the literal segment `test` for a sandbox and OMITTED
// ENTIRELY for live mode, and ACCOUNT_ID optional: the same page names the
// customers list as `https://dashboard.stripe.com/test/customers?` with no
// account segment at all, which resolves against whichever account the reader
// is signed in to. StoryJar has one Stripe account, so the account segment is
// left out and the link follows the operator's own session. The mode segment
// sits BEFORE the page, not after it, which is the detail brief 03 warns about.
// An object's page is that page plus its id.

export type StripeMode = "live" | "test";

/** The only host this file will ever produce a link to. */
export const STRIPE_DASHBOARD_ORIGIN = "https://dashboard.stripe.com";

// The dashboard pages ops links to. A closed set, so a caller cannot pass a
// path fragment and build a URL to somewhere nobody reviewed.
const PAGES = {
  customer: { path: "customers", what: "Customer" },
  subscription: { path: "subscriptions", what: "Subscription" },
} as const;

export type StripeObject = keyof typeof PAGES;

// Stripe object ids are a prefix, an underscore and alphanumerics. This is
// belt and braces rather than a live worry (the values are written by our own
// webhook handler from Stripe's payload, never typed by anybody), and it is
// cheap: without it a stored value containing a slash, a dot-dot or a colon
// would build a link to a different page, a different host or a different
// scheme, and the screen would render it as a normal link. Anything that fails
// this produces no link at all rather than a link somewhere unexpected.
const STRIPE_ID = /^[A-Za-z0-9_]{3,255}$/;

export function isStripeId(id: string): boolean {
  return STRIPE_ID.test(id);
}

/**
 * The dashboard URL for one Stripe object, or null when the id is not one.
 *
 * Deliberately takes the mode as an argument rather than reading it, so the
 * whole of the URL shape is provable in a test without an environment.
 */
export function dashboardLink(mode: StripeMode, object: StripeObject, id: string): string | null {
  if (!isStripeId(id)) return null;
  const modeSegment = mode === "test" ? "/test" : "";
  return `${STRIPE_DASHBOARD_ORIGIN}${modeSegment}/${PAGES[object].path}/${id}`;
}

export function customerLink(mode: StripeMode, id: string): string | null {
  return dashboardLink(mode, "customer", id);
}

export function subscriptionLink(mode: StripeMode, id: string): string | null {
  return dashboardLink(mode, "subscription", id);
}

/**
 * Which Stripe data set this deployment is pointed at, or null when it is
 * pointed at none. The one impure function in the file, and the reason it is
 * one line is that the environment read itself lives outside the ops roots.
 */
export function currentStripeMode(): StripeMode | null {
  if (!stripeConfigured()) return null;
  return stripeLiveMode() ? "live" : "test";
}

const MODE_STATEMENT: Record<StripeMode, string> = {
  live: "The Stripe links on this page open Stripe's live dashboard, where the payments are real.",
  test: "The Stripe links on this page open Stripe's test data. Nothing behind them is a real payment.",
};

const NOT_CONFIGURED =
  "Stripe is not set up in this environment, so there is nothing to open. That is a fact about " +
  "this deployment, not about any school's account.";

const NO_RECORD =
  "Stripe holds nothing for this school yet. That is what a school looks like before anybody has " +
  "arranged to pay: the record appears the first time it goes through checkout.";

/**
 * The page-level sentence saying which Stripe these links open, or that there
 * is none. Stated once, in words, because a link that quietly points at a
 * sandbox is how somebody ends up reconciling test data against a real invoice.
 */
export function stripeModeStatement(mode: StripeMode | null): string {
  return mode === null ? NOT_CONFIGURED : MODE_STATEMENT[mode];
}

/**
 * The way through to Stripe for one school, or the reason there is not one.
 *
 * Three distinguishable states, because "no links" on its own reads as a bug:
 * Stripe is not configured here at all; it is configured and this school has no
 * Stripe record; or it has one and here is the way to it.
 */
export function stripeRef(
  mode: StripeMode | null,
  customerId: string | null,
  subscriptionId: string | null,
): StripeRefDto {
  if (mode === null) return { links: [], absence: NOT_CONFIGURED };

  const links: StripeLinkDto[] = [];
  const add = (object: StripeObject, id: string | null) => {
    if (!id) return;
    const href = dashboardLink(mode, object, id);
    if (!href) return;
    links.push({ what: PAGES[object].what, id, href });
  };
  add("customer", customerId);
  add("subscription", subscriptionId);

  return { links, absence: links.length ? null : NO_RECORD };
}
