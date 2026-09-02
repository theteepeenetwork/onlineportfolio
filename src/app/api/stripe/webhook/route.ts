import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { freezeSubscription, type AccountStatus } from "@/lib/billing";
import { stampVerified, detachBuyer } from "@/lib/schoolClaim";
import { recordAudit } from "@/lib/audit";
import { errorLabel } from "@/lib/safeLog";

// Stripe webhooks. The Stripe SDK needs Node APIs (crypto) for signature
// verification, and this must run per-request (never cached/prerendered).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verify the Stripe signature, then handle events idempotently. Stripe delivers
// at-least-once, so we record each processed event id and no-op on redelivery.
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Webhook not configured", { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  // Raw body is required for signature verification — never JSON.parse first.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    console.error("[stripe] signature verification failed", errorLabel(e));
    return new Response("Invalid signature", { status: 400 });
  }

  // Idempotency gate: record the event id first. A duplicate delivery hits the
  // unique-id constraint and we ack without re-processing.
  try {
    await db.billingEvent.create({ data: { id: event.id, type: event.type } });
  } catch {
    return new Response("Already processed", { status: 200 });
  }

  try {
    await handleEvent(event);
  } catch (e) {
    // Roll back the idempotency record so Stripe's retry can reprocess.
    // The event type and a label only: a Stripe error object carries the
    // customer payload, and a Prisma one carries the row we tried to write.
    console.error("[stripe] handler error for", event.type, errorLabel(e));
    await db.billingEvent.delete({ where: { id: event.id } }).catch(() => {});
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

// --- Event handling ---------------------------------------------------------

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const localId = session.client_reference_id ?? session.metadata?.storyjar_subscription_id ?? null;
      const sub = await resolveLocalSub({
        localId,
        stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null,
      });
      if (!sub) return;

      // THERE IS DELIBERATELY NO `stripe.subscriptions.retrieve` HERE. It was
      // removed on 2 Sep 2026 and must not come back as a tidy-up. Three
      // reasons, and the third is the one that matters:
      //
      // 1. What it fetched was cosmetic. It read `currentPeriodEnd` only; the
      //    billing panes already fall back to "Your school plan is active."
      //    when it is null, and `invoice.paid` and `customer.subscription.
      //    updated` both carry the same figure seconds later and both already
      //    write it. There is no seat count to read either: the school plan is
      //    a flat price with quantity 1 (docs/pricing-decisions.md).
      // 2. It was the only non-hermetic line in this handler, and therefore the
      //    reason tests/battery/security/stripe-webhook.spec.ts avoided this
      //    very event. Removing it is what lets the spec cover the branch.
      // 3. A NETWORK CALL BETWEEN THE `BillingEvent` INSERT AND A TRANSACTION
      //    THAT WILL SHORTLY GRANT ADMIN IS A PRIVILEGE-ESCALATION MECHANISM,
      //    not a latency cost. The insert above is the idempotency record; the
      //    catch in POST deletes it non-transactionally when the handler
      //    throws. So anything that throws after a grant has committed rolls
      //    back the record of the delivery while leaving the privilege in
      //    place, and Stripe's retry then runs the branch again against a
      //    school that already exists. Stripe timing out is exactly that throw.
      //
      // For whoever adds the school-claim branch above (`if (!sub)`):
      // NOTHING THAT CAN THROW MAY RUN AFTER `claimSchool` IN THAT BRANCH.
      const stripeSubId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
      await transition(sub.id, "ACTIVE", {
        stripeSubscriptionId: stripeSubId ?? undefined,
        stripeCustomerId: (typeof session.customer === "string" ? session.customer : session.customer?.id) ?? undefined,
      });
      // Money is confirmed, so the school's identity is confirmed. Guarded and
      // idempotent; the argument for why this is one of exactly two call sites
      // is in `stampVerified`'s docstring and stays there.
      if (sub.schoolId) await stampVerified(sub.schoolId, "Stripe checkout completed");
      return;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const sub = await resolveLocalSub({
        stripeSubscriptionId: invoiceSubscriptionId(invoice),
        stripeCustomerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null,
      });
      if (!sub) return;
      const end = invoicePeriodEnd(invoice);
      await transition(sub.id, "ACTIVE", { currentPeriodEnd: end });
      // The money for an invoiced (PO) school has arrived, which is what closes
      // its unverified window. Guarded and idempotent; why resolving purely by
      // Stripe ids is sufficient here, and why there is no third call site, is
      // in `stampVerified`'s docstring and stays there.
      if (sub.schoolId) await stampVerified(sub.schoolId, "Stripe invoice paid");
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const sub = await resolveLocalSub({
        stripeSubscriptionId: invoiceSubscriptionId(invoice),
        stripeCustomerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null,
      });
      if (!sub) return;
      // PAST_DUE keeps full access during Stripe's smart-retry grace window.
      await transition(sub.id, "PAST_DUE", {});
      return;
    }

    case "customer.subscription.updated": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const sub = await resolveLocalSub({
        stripeSubscriptionId: stripeSub.id,
        stripeCustomerId: typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id ?? null,
      });
      if (!sub) return;
      const mapped = mapStripeStatus(stripeSub.status);
      if (mapped === "FROZEN") {
        await freezeSubscription(sub, `Stripe subscription ${stripeSub.status}`);
        return;
      }
      await transition(sub.id, mapped, {
        stripeSubscriptionId: stripeSub.id,
        currentPeriodEnd: periodEndOf(stripeSub),
      });
      return;
    }

    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const sub = await resolveLocalSub({
        stripeSubscriptionId: stripeSub.id,
        stripeCustomerId: typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id ?? null,
      });
      if (!sub) return;
      await freezeSubscription(sub, "Stripe subscription cancelled");
      // A refund on a school plan detaches the person who PAID and leaves
      // everyone else frozen (owner decision, 1 Sep 2026,
      // docs/pricing-decisions.md). The buyer usually had a free teacher
      // account and their own classes before they bought, so freezing those
      // would leave them worse off than never having bought — which is not a
      // refund. THE SCHOOL AND EVERY REMAINING MEMBER OF STAFF STAY FROZEN:
      // they did not pay, and `detachBuyer` unfreezes nothing.
      if (sub.kind === "SCHOOL" && sub.schoolId) await detachBuyer(sub.schoolId);
      return;
    }

    default:
      // Unhandled event types are acked (recorded) and ignored.
      return;
  }
}

// --- Helpers ----------------------------------------------------------------

type Resolver = { localId?: string | null; stripeSubscriptionId?: string | null; stripeCustomerId?: string | null };

// Find the local subscription an event belongs to, most specific id first.
async function resolveLocalSub(r: Resolver) {
  if (r.localId) {
    const byId = await db.subscription.findUnique({ where: { id: r.localId } });
    if (byId) return byId;
  }
  if (r.stripeSubscriptionId) {
    const bySub = await db.subscription.findUnique({ where: { stripeSubscriptionId: r.stripeSubscriptionId } });
    if (bySub) return bySub;
  }
  if (r.stripeCustomerId) {
    const byCust = await db.subscription.findUnique({ where: { stripeCustomerId: r.stripeCustomerId } });
    if (byCust) return byCust;
  }
  return null;
}

// Apply a status + field update and audit the transition (only when it changes).
async function transition(
  localSubId: string,
  status: AccountStatus,
  fields: { stripeSubscriptionId?: string; stripeCustomerId?: string; currentPeriodEnd?: Date | null },
): Promise<void> {
  const before = await db.subscription.findUnique({ where: { id: localSubId } });
  if (!before) return;
  await db.subscription.update({
    where: { id: localSubId },
    data: {
      status,
      stripeSubscriptionId: fields.stripeSubscriptionId ?? before.stripeSubscriptionId,
      stripeCustomerId: fields.stripeCustomerId ?? before.stripeCustomerId,
      currentPeriodEnd: fields.currentPeriodEnd ?? before.currentPeriodEnd,
      // Clearing frozenAt on re-activation stops the deletion clock.
      frozenAt: status === "FROZEN" ? before.frozenAt : null,
    },
  });
  if (before.status !== status) {
    const action =
      status === "ACTIVE" ? "BILLING_ACTIVATED" : status === "PAST_DUE" ? "BILLING_PAST_DUE" : "BILLING_UPDATED";
    await recordAudit({
      action, actorType: "SYSTEM", actorName: "Stripe webhook", schoolId: before.schoolId,
      subjectType: "SUBSCRIPTION", subjectId: localSubId, detail: `Status ${before.status} → ${status}`,
    });
  }
}

// Map a Stripe subscription status to our account state.
function mapStripeStatus(s: Stripe.Subscription.Status): AccountStatus {
  switch (s) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "incomplete":
      return "PAST_DUE";
    default: // canceled, unpaid, incomplete_expired, paused
      return "FROZEN";
  }
}

// current_period_end lives on the subscription item in recent API versions;
// fall back to the (older) top-level field. Returns null if neither is present.
function periodEndOf(sub: Stripe.Subscription): Date | null {
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  const topEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
  const secs = itemEnd ?? topEnd;
  return typeof secs === "number" ? new Date(secs * 1000) : null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const raw = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (!raw) return null;
  return typeof raw === "string" ? raw : raw.id;
}

function invoicePeriodEnd(invoice: Stripe.Invoice): Date | null {
  const secs = invoice.lines?.data?.[0]?.period?.end;
  return typeof secs === "number" ? new Date(secs * 1000) : null;
}
