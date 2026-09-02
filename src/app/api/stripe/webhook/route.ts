import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { freezeSubscription, type AccountStatus } from "@/lib/billing";
import { claimSchool, stampVerified, detachBuyer } from "@/lib/schoolClaim";
import { SCHOOL_BANDS, type PlanKey } from "@/lib/billing-plans";
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
      // NO LOCAL SUBSCRIPTION IS THE SIGNAL, NOT AN ERROR. `startClaimCheckout`
      // omits `client_reference_id` on purpose so that `resolveLocalSub` falls
      // through to null here: a school being BOUGHT has nothing local yet,
      // because an abandoned checkout must leave no trace. This is the card
      // route's other half, and until 2 Sep 2026 it was a silent 200 — money
      // arrived at Stripe and nothing happened.
      if (!sub) {
        await handleSchoolClaim(session);
        return;
      }

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
      //
      // A CARD CLAIM REACHES THIS LINE ON ITS SECOND DELIVERY AND STAMPS
      // TWICE, and that is fine BECAUSE OF THE GUARD, not because of the
      // ordering. `claimSchool` writes `verifiedAt` at creation, so a
      // redelivery carrying a different event id now resolves the subscription
      // the claim made, takes this arm instead of the claim branch, and calls
      // `stampVerified` on an already-stamped school. Its `updateMany where
      // verifiedAt: null` matches nothing, so the date does not move and no
      // second `SCHOOL_VERIFIED` row appears. DO NOT reorder or add a
      // `verifiedAt` check here to avoid the second call: the guard is the
      // thing that makes it safe, and moving the safety out of `stampVerified`
      // and into its callers is how one caller eventually forgets.
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

// --- The school claim -------------------------------------------------------

/**
 * THE CARD ROUTE'S OTHER HALF: a `checkout.session.completed` that resolves no
 * local subscription because the school it paid for does not exist yet.
 *
 * `startClaimCheckout` writes NOTHING locally — no School, no Subscription, no
 * half-made claim squatting on a URN — so an abandoned checkout leaves no
 * trace and the entire purchase intent travels in Stripe metadata. This is
 * where that intent is turned into a school, and it is the only place on the
 * card route where anybody becomes a school ADMIN.
 *
 * IT NEVER THROWS AND IT NEVER RETURNS ANYTHING BUT 200. Every refusal below is
 * unfixable by retrying, and a throw would put Stripe into a redelivery loop
 * against a state no delivery can change. What a person needs instead is the
 * audit row, which is the founder's cue to refund by hand.
 *
 * IDEMPOTENCY RESTS ON THREE LAYERS AND THIS FUNCTION RELIES ON ALL THREE:
 *   1. `claimSchool`'s own step 1 resolves an existing `Subscription` by
 *      `stripeSubscriptionId` and returns `alreadyDone` — the only layer that
 *      works when a redelivery carries a DIFFERENT event id.
 *   2. `Subscription.stripeSubscriptionId` and `School.urn` are both `@unique`,
 *      so two genuinely racing deliveries end with the loser's transaction
 *      aborting whole: no half-made school, no promoted teacher.
 *   3. The `BillingEvent` insert in POST catches ordinary redelivery.
 *
 * NOTHING THAT CAN THROW MAY RUN AFTER `claimSchool` — see the long comment at
 * the removed `subscriptions.retrieve` for why. `recordAudit` swallows, and it
 * is only reached on the refusal path, where nothing has been committed.
 */
async function handleSchoolClaim(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata ?? {};

  // ------------------------------------------------------------------------
  // 1. NOT OURS. The silent 200 becomes a noisy one.
  //
  // A session with no local subscription and no claim metadata is a genuine
  // anomaly — a checkout created outside this application, or one whose
  // metadata contract has drifted — and losing it silently is what hid the
  // missing claim branch in the first place.
  //
  // THE SESSION ID ONLY, NEVER THE METADATA. `storyjar_school_name` is in
  // there, and stdout goes to Railway's log store, which erasure cannot reach
  // (src/lib/safeLog.ts; tests/battery/security/log-hygiene.spec.ts polices
  // this class). A session id is enough to find the whole thing in the Stripe
  // dashboard, which is where the school's name may safely be read.
  // ------------------------------------------------------------------------
  if (meta.storyjar_purchase !== "school_claim") {
    console.error("[stripe] checkout.session.completed matched no subscription and is not a school claim; session", session.id);
    return;
  }

  // ------------------------------------------------------------------------
  // 2. ONLY MONEY CREATES A SCHOOL ON THIS ROUTE.
  //
  // `checkout.session.completed` fires when the CHECKOUT completes, which is
  // not the same as the money arriving. For an asynchronous method (BACS debit,
  // some wallets) the session completes `unpaid` and settles minutes or days
  // later on `checkout.session.async_payment_succeeded`.
  //
  // Unguarded, the card route would create a VERIFIED school on the strength of
  // a payment that has not cleared and may never — acquiring exactly the
  // unverified window the invoice route exists to contain, but with the gates
  // already open. Returning here costs nothing: if the money does arrive,
  // `invoice.paid` carries the same subscription and the school is claimed by
  // the invoice route's own path.
  // ------------------------------------------------------------------------
  if (session.payment_status !== "paid") {
    console.error("[stripe] school claim withheld, session is not paid; session", session.id, session.payment_status);
    return;
  }

  // ------------------------------------------------------------------------
  // 3. THE IDEMPOTENCY KEY MUST EXIST BEFORE ANYTHING IS CREATED.
  //
  // `stripeSubscriptionId` is what `claimSchool` step 1 reads to recognise a
  // redelivery, and it is `@unique` as the backstop under a race. A claim made
  // without one has NEITHER, so a second delivery would create a second school
  // and promote the buyer into it. A `mode: "subscription"` session always
  // carries one; this is the guard for a session that is not the one we sent.
  // ------------------------------------------------------------------------
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  if (!stripeSubscriptionId) {
    console.error("[stripe] school claim withheld, session carries no subscription id; session", session.id);
    return;
  }

  // ------------------------------------------------------------------------
  // 4. THE METADATA CONTRACT, READ DEFENSIVELY.
  //
  // `claimMetadata` in src/app/actions/billing.ts emits six string keys and is
  // the only writer, so these should always be present and well-formed. They
  // are checked anyway because the failure mode of not checking is bad in a
  // specific way: an unrecognised plan key makes `bandFor` THROW inside the
  // claim transaction, which becomes a 500, which becomes a Stripe retry loop
  // against metadata no retry can improve. That is the exact shape step 5
  // exists to avoid, so it is caught here as a refusal instead.
  //
  // An empty school name would create a nameless school, which is worse than
  // creating none: it is a real tenant nobody can identify on a screen.
  // ------------------------------------------------------------------------
  const teacherId = meta.storyjar_teacher_id ?? "";
  const schoolName = (meta.storyjar_school_name ?? "").trim();
  const plan = meta.storyjar_plan ?? "";
  if (!teacherId || !schoolName || !isPlanKey(plan)) {
    // Adult data and ids only, in a row a person will actually find: a Stripe
    // session id and which of the three fields was wrong. Never the name.
    await recordAudit({
      action: "SCHOOL_CLAIM_REFUSED",
      actorType: "SYSTEM",
      actorName: "Stripe webhook",
      subjectType: "SUBSCRIPTION",
      subjectId: stripeSubscriptionId,
      detail:
        `A paid card checkout could not be turned into a school because its purchase details were incomplete ` +
        `(Stripe session ${session.id}${!teacherId ? ", no buyer" : ""}${!schoolName ? ", no school name" : ""}` +
        `${!isPlanKey(plan) ? ", unrecognised plan" : ""}). The money has been taken and must be refunded by hand.`,
    });
    return;
  }

  // ------------------------------------------------------------------------
  // 5. THE CLAIM. `verified: true` because the money is confirmed above, which
  // is why a card school never passes through the unverified state at all.
  // The URN travels as "" for null, because Stripe metadata has no other type.
  // ------------------------------------------------------------------------
  const outcome = await claimSchool({
    teacherId,
    schoolName,
    urn: meta.storyjar_urn ? meta.storyjar_urn : null,
    plan,
    verified: true,
    source: "CARD",
    stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
    stripeSubscriptionId,
  });

  // ------------------------------------------------------------------------
  // 6. A REFUSAL IS AUDITED AND ACKED. IT IS NOT AN ERROR.
  //
  // Every `ClaimRefusal` is unfixable by retrying — a deleted buyer stays
  // deleted, and "this teacher already belongs to a school" cannot be made
  // untrue by a seventh delivery. Throwing here would cost Stripe deliveries
  // and change nothing, so the answer is 200 and a durable record.
  //
  // `schoolId` is deliberately null on this row: no school was created, and
  // attaching it to the school the buyer was invited into would put a stranger's
  // failed purchase in that school's audit log.
  //
  // NOTHING RUNS AFTER `claimSchool` ON THE SUCCESS PATH, and this branch is
  // not an exception to that: it is reached only when the transaction committed
  // nothing at all. `recordAudit` swallows its own failures, so it cannot throw
  // even here.
  // ------------------------------------------------------------------------
  if (!outcome.ok) {
    await recordAudit({
      action: "SCHOOL_CLAIM_REFUSED",
      actorType: "SYSTEM",
      actorName: "Stripe webhook",
      actorId: teacherId,
      subjectType: "TEACHER",
      subjectId: teacherId,
      detail:
        outcome.reason === "teacher-has-school"
          ? `A paid card checkout could not set up a new school because the buyer had joined a school between ` +
            `pressing the button and the payment landing. They were NOT moved. The money has been taken ` +
            `(Stripe session ${session.id}) and must be refunded by hand.`
          : `A paid card checkout could not set up a new school because the buyer's account no longer exists. ` +
            `The money has been taken (Stripe session ${session.id}) and must be refunded by hand.`,
    });
    return;
  }

  // DELIBERATELY NOTHING HERE. Not a log line, not a `stampVerified`, not a
  // Stripe call. `claimSchool` has committed a privilege grant, and the catch
  // in POST deletes the `BillingEvent` row NON-TRANSACTIONALLY when this
  // handler throws — so any statement added below would, on failing, roll back
  // the record of the delivery while leaving somebody an ADMIN. `verifiedAt`
  // is already stamped inside the transaction, and both audit rows were
  // written inside it too.
}

/** The metadata plan key, narrowed against the real catalogue. A string Stripe
 *  handed us is not a `PlanKey` until something has checked it, and `bandFor`
 *  throws on anything else — inside the claim transaction, where a throw is a
 *  retry loop. */
function isPlanKey(value: string): value is PlanKey {
  return SCHOOL_BANDS.some((b) => b.key === value);
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
