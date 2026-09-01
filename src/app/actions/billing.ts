"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Subscription } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { governingSubscription, trialEndFromNow } from "@/lib/billing";
import { priceIdFor, isPlanKey, bandFor, type PlanKey } from "@/lib/billing-plans";
import { recordAudit } from "@/lib/audit";
// A Stripe error echoes back the parameter it objected to, and on customer
// creation that parameter is the school admin's email address.
import { errorLabel } from "@/lib/safeLog";

// ---------------------------------------------------------------------------
// Billing actions: Stripe Checkout (hosted) for purchase and the Stripe Customer
// Portal for plan changes/cancellation. Card data never touches our servers — we
// only ever store Stripe IDs. Apple Pay / Google Pay ride along automatically as
// Checkout payment methods (enabled in the Stripe dashboard); no extra code and
// no Stripe.js on our pages.
//
// HARD RULE: no child data is ever sent to Stripe. A customer carries only a
// teacher's name/email or a school's name. Metadata holds internal ids only.
// ---------------------------------------------------------------------------

// Absolute base URL for Stripe return links, from the current request origin.
async function origin(): Promise<string> {
  const h = await headers();
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

type Actor = { teacherId: string; schoolId: string | null; name: string; email: string; isAdmin: boolean };

// Resolve the signed-in teacher, or bounce out. Billing lives only in the
// teacher/admin area — never on any child-facing page.
async function requireTeacher(): Promise<Actor> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/login/teacher");
  return {
    teacherId: user.teacher.id,
    schoolId: user.teacher.schoolId,
    name: user.teacher.name,
    email: user.teacher.email,
    isAdmin: user.teacher.staffRole === "ADMIN",
  };
}

// Ensure the governing subscription has a Stripe customer, creating one (adult
// billing data only) on first use and persisting its id. Returns [sub, customerId].
async function ensureCustomer(sub: Subscription, actor: Actor): Promise<string> {
  if (sub.stripeCustomerId) return sub.stripeCustomerId;
  const stripe = getStripe();

  // Only a SCHOOL plan is ever bought, so the customer is the school (name only)
  // with the arranging admin as billing contact. Never any child data.
  let name = actor.name;
  let email: string | undefined = actor.email;
  if (sub.kind === "SCHOOL" && sub.schoolId) {
    const school = await db.school.findUnique({ where: { id: sub.schoolId }, select: { name: true } });
    name = school?.name ?? actor.name;
    email = actor.email; // billing contact = the admin arranging payment
  }

  const customer = await stripe.customers.create({
    name,
    email,
    metadata: { storyjar_subscription_id: sub.id, storyjar_kind: sub.kind },
  });
  await db.subscription.update({ where: { id: sub.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}


// Make sure the school this admin runs actually HAS a school subscription to buy
// against, creating one if it doesn't.
//
// Until now a SCHOOL row only ever came from a seed, so an admin whose school
// had none was governed by their own FREE teacher row — and pressing "buy the
// school plan" would have checked out against that personal row, naming the
// teacher rather than the school as the customer and covering nobody else. That
// is the whole-school purchase silently not being a whole-school purchase.
//
// A new row starts on TRIAL with the usual half term rather than on ACTIVE:
// the money hasn't moved yet, and TRIAL is the state that keeps every teacher in
// the school writable in the gap between pressing the button and Stripe
// confirming. The webhook moves it to ACTIVE when payment lands.
async function ensureSchoolSubscription(actor: Actor) {
  if (!actor.schoolId) return null;
  const existing = await db.subscription.findUnique({ where: { schoolId: actor.schoolId } });
  if (existing) return existing;
  const created = await db.subscription.create({
    data: { kind: "SCHOOL", status: "TRIAL", trialEndsAt: trialEndFromNow(), schoolId: actor.schoolId },
  });
  await recordAudit({
    action: "BILLING_SCHOOL_PLAN_STARTED", actorType: "ADMIN", actorId: actor.teacherId, actorName: actor.name,
    schoolId: actor.schoolId, subjectType: "SUBSCRIPTION", subjectId: created.id,
    detail: "School plan opened for the whole school",
  });
  return created;
}

// Start a hosted Checkout session and redirect the admin to Stripe.
//
// The only purchasable plan is School, in one of four bands by pupils on roll
// (docs/pricing-decisions.md). The band is a PRICE choice, not a quantity: every
// band is quantity 1 and carries every feature, so nothing here meters pupils.
// A teacher never checks out at all — their plan is free.
export async function startCheckout(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const actor = await requireTeacher();
  if (!stripeConfigured()) return { error: "Billing isn’t set up in this environment yet." };

  const planRaw = String(formData.get("plan") ?? "");
  if (!isPlanKey(planRaw)) return { error: "Please choose a plan." };
  const plan: PlanKey = planRaw;

  // The school plan is bought by a school admin, and only by one
  // (deny-by-default on mismatch).
  if (!actor.isAdmin || !actor.schoolId) {
    return { error: "Only a school admin can buy the school plan." };
  }

  // Always buy against the SCHOOL's subscription, never the admin's own free
  // teacher row — otherwise the purchase covers one person and names the wrong
  // customer.
  const sub = await ensureSchoolSubscription(actor);
  if (!sub || sub.kind !== "SCHOOL") {
    return { error: "We couldn’t open your school’s plan. Please refresh and try again." };
  }
  // Refuse a SECOND purchase only while one is actually running: buying again
  // would create a second Stripe subscription and bill the school twice. A
  // FROZEN school still carries the id of the subscription that lapsed, and must
  // be able to buy its way back — so the id alone is not the test, the live
  // paying state is.
  if (sub.stripeSubscriptionId && (sub.status === "ACTIVE" || sub.status === "PAST_DUE")) {
    return { error: "Your school already has a plan running. Use “Open the billing portal” to change or cancel it." };
  }

  const stripe = getStripe();
  const customerId = await ensureCustomer(sub, actor);
  const base = await origin();

  let url: string | null;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: sub.id,
      // Quantity is always 1 — the band IS the price. Nothing multiplies by
      // pupils or teachers, which is the whole point (docs/pricing-decisions.md).
      line_items: [{ price: priceIdFor(plan), quantity: 1 }],
      // Payment methods (incl. Apple Pay / Google Pay) are chosen automatically
      // from the Stripe dashboard config — we don't pin payment_method_types.
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${base}/teacher/account?checkout=success`,
      cancel_url: `${base}/teacher/account?checkout=cancelled`,
      subscription_data: {
        metadata: { storyjar_subscription_id: sub.id, storyjar_kind: sub.kind },
      },
      metadata: { storyjar_subscription_id: sub.id, storyjar_plan: plan, storyjar_band: bandFor(plan).label },
    });
    url = session.url;
  } catch (e) {
    console.error("[billing] checkout create failed", errorLabel(e));
    return { error: "We couldn’t start checkout just now. Please try again in a moment." };
  }
  if (!url) return { error: "We couldn’t start checkout just now. Please try again." };
  redirect(url);
}

// School plan paid by invoice / PO (BACS) — most UK primaries can't do recurring
// cards. Creates a subscription billed by emailed invoice with 30-day terms.
//
// Banded (not per-seat) pricing keeps this simple: the PO carries ONE number,
// fixed for the year, that never changes when staff join or leave.
export async function requestSchoolInvoice(
  _prev: { error?: string; sent?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; sent?: boolean }> {
  const actor = await requireTeacher();
  if (!stripeConfigured()) return { error: "Billing isn’t set up in this environment yet." };
  if (!actor.isAdmin || !actor.schoolId) return { error: "Only a school admin can arrange invoice billing." };

  const sub = await ensureSchoolSubscription(actor);
  if (!sub || sub.kind !== "SCHOOL") return { error: "We couldn’t open your school’s plan. Please refresh and try again." };
  // Refuse a SECOND purchase only while one is actually running: buying again
  // would create a second Stripe subscription and bill the school twice. A
  // FROZEN school still carries the id of the subscription that lapsed, and must
  // be able to buy its way back — so the id alone is not the test, the live
  // paying state is.
  if (sub.stripeSubscriptionId && (sub.status === "ACTIVE" || sub.status === "PAST_DUE")) {
    return { error: "Your school already has a plan running. Use “Open the billing portal” to change or cancel it." };
  }

  const planRaw = String(formData.get("plan") ?? "");
  if (!isPlanKey(planRaw)) return { error: "Please choose the size of your school." };
  const band = bandFor(planRaw);

  const stripe = getStripe();
  const customerId = await ensureCustomer(sub, actor);

  try {
    const created = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceIdFor(planRaw), quantity: 1 }],
      collection_method: "send_invoice",
      days_until_due: 30,
      metadata: { storyjar_subscription_id: sub.id, storyjar_kind: "SCHOOL" },
    });
    // Record the Stripe subscription against our row IMMEDIATELY, rather than
    // waiting for a webhook.
    //
    // A lapsed trial freezes on local state alone — TRIAL, past `trialEndsAt`,
    // with no `stripeSubscriptionId` (see settleStatus in src/lib/billing.ts).
    // A school that raises a purchase order in the last fortnight of its trial
    // would otherwise go read-only on day 42 while its invoice sat in finance,
    // which is exactly the school that has done everything right. Storing the id
    // here closes that window without waiting on a delivery we don't control.
    // The webhook still owns every status change from here (paid → ACTIVE,
    // unpaid → PAST_DUE → FROZEN), so a school that never settles is not
    // permanently free.
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: "ACTIVE", stripeSubscriptionId: created.id },
    });
  } catch (e) {
    console.error("[billing] invoice subscription create failed", errorLabel(e));
    return { error: "We couldn’t raise the invoice just now. Please try again." };
  }

  await recordAudit({
    action: "BILLING_INVOICE_REQUESTED", actorType: "ADMIN", actorId: actor.teacherId, actorName: actor.name,
    schoolId: actor.schoolId, subjectType: "SUBSCRIPTION", subjectId: sub.id,
    detail: `Requested invoice for the school plan (${band.label}, £${band.price}/year)`,
  });
  return { sent: true };
}

// Open the Stripe Customer Portal for plan changes, seat changes and cancellation.
export async function openCustomerPortal(
  _prev?: { error?: string },
  _formData?: FormData,
): Promise<{ error?: string }> {
  const actor = await requireTeacher();
  if (!stripeConfigured()) return { error: "Billing isn’t set up in this environment yet." };

  const sub = await governingSubscription({ id: actor.teacherId, schoolId: actor.schoolId });
  if (!sub?.stripeCustomerId) return { error: "There’s no billing account to manage yet." };
  // School billing is managed by admins only.
  if (sub.kind === "SCHOOL" && !actor.isAdmin) return { error: "Only a school admin can manage the school plan." };

  const stripe = getStripe();
  const base = await origin();
  let url: string;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${base}/teacher/account`,
    });
    url = session.url;
  } catch (e) {
    console.error("[billing] portal create failed", errorLabel(e));
    return { error: "We couldn’t open the billing portal just now. Please try again." };
  }
  redirect(url);
}

// DELIBERATELY EMPTY. Not dead code, and not a stub to fill in casually.
//
// What it used to do: take a `schoolId` from the posted form and attach any
// signed-in schoolless teacher to that school — set `Teacher.schoolId`, delete
// their own FREE `Subscription` row, and audit BILLING_JOINED_SCHOOL.
//
// Why that was unsafe: the only thing it checked was that the named school ran
// a school plan. It never asked whether that school had asked for this teacher.
// So any teacher could post any school's id and, from that moment, their
// classes and their pupils' work would be governed by — and appear in the audit
// log of — a school they have no connection to.
//
// How reachable it actually was, measured rather than assumed: it had no caller
// in `src`, `tests` or `docs`, and on Next 16 an exported Server Action that no
// client component imports is given no action id at all, so there was nothing
// for `Next-Action` to name and no way to dispatch it. That is asserted, with a
// positive control, in
// tests/battery/security/join-school-plan-needs-an-invitation.spec.ts. It is
// NOT a permanent property: the day a screen imports this function it becomes a
// live POST endpoint, and phase 2's acceptance screen imports it. So the body
// is emptied now, while there is nothing to get wrong, rather than left to be
// noticed later.
//
// Why it is kept rather than removed: it fills a real gap that is still open —
// `inviteStaff` refuses an email that already belongs to a teacher, so a
// teacher who signed up free in September cannot be brought into their school
// when it buys in January. This is the shell that flow will fill, and
// `docs/dpo-decisions.md` (1 September 2026) says so explicitly.
//
// What it needs before it may do anything, and does not have yet: an
// invitation model. There is none in the schema today. Per
// `docs/dpo-decisions.md` (1 September 2026), when it returns it must succeed
// only against an unspent invitation for THAT teacher and THAT school, which it
// consumes — the school derived from the invitation row, never from a posted
// id. Joining a school also moves a teacher's pupils from their own
// responsibility to the school's (RETENTION.md, "Individual vs school"), so the
// screen that calls it has to say so in plain words before anything is pressed.
//
// Until then it reads nothing, writes nothing and refuses everything. The
// signature is retained so the shape of the action does not change.
export async function joinSchoolPlan(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  void formData; // read deliberately not done — see above. Present only to keep lint quiet.
  return {
    error: "Joining a school needs an invitation from that school. Ask your school’s StoryJar admin to invite you.",
  };
}
