import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { freezeSubscription, type AccountStatus } from "@/lib/billing";
import { recordAudit } from "@/lib/audit";

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
    console.error("[stripe] signature verification failed", e);
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
    console.error("[stripe] handler error for", event.type, e);
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
      // Pull the created subscription for period end + seat count.
      let currentPeriodEnd: Date | null = null;
      let seatLimit: number | null = sub.seatLimit;
      const stripeSubId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
      if (stripeSubId) {
        const stripeSub = await getStripe().subscriptions.retrieve(stripeSubId);
        currentPeriodEnd = periodEndOf(stripeSub);
        seatLimit = seatCountOf(stripeSub) ?? seatLimit;
      }
      await transition(sub.id, "ACTIVE", {
        stripeSubscriptionId: stripeSubId ?? undefined,
        stripeCustomerId: (typeof session.customer === "string" ? session.customer : session.customer?.id) ?? undefined,
        currentPeriodEnd,
        seatLimit,
      });
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
        seatLimit: seatCountOf(stripeSub) ?? sub.seatLimit,
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
  fields: { stripeSubscriptionId?: string; stripeCustomerId?: string; currentPeriodEnd?: Date | null; seatLimit?: number | null },
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
      seatLimit: fields.seatLimit ?? before.seatLimit,
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

function seatCountOf(sub: Stripe.Subscription): number | null {
  const q = sub.items?.data?.[0]?.quantity;
  return typeof q === "number" ? q : null;
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
