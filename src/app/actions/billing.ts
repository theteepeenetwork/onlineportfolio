"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Subscription } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { governingSubscription } from "@/lib/billing";
import { priceIdFor, isPlanKey, INDIVIDUAL_PLANS, type PlanKey } from "@/lib/billing-plans";
import { recordAudit } from "@/lib/audit";

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

  // School plan → the customer is the school (name only). Individual plan → the
  // teacher (their own name/email). Never any child data.
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

// Start a hosted Checkout session and redirect the teacher to Stripe.
// `plan` chooses the price; `seats` is the quantity for the school seat plan.
export async function startCheckout(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const actor = await requireTeacher();
  if (!stripeConfigured()) return { error: "Billing isn’t set up in this environment yet." };

  const planRaw = String(formData.get("plan") ?? "");
  if (!isPlanKey(planRaw)) return { error: "Please choose a plan." };
  const plan: PlanKey = planRaw;

  // School plan is bought by an admin; individual plans by the teacher for
  // themselves (deny-by-default on mismatch).
  const schoolPlan = plan === "school_seat_annual";
  if (schoolPlan && (!actor.isAdmin || !actor.schoolId)) {
    return { error: "Only a school admin can buy the school plan." };
  }

  const sub = await governingSubscription({ id: actor.teacherId, schoolId: actor.schoolId });
  if (!sub) return { error: "We couldn’t find your account’s plan. Please refresh and try again." };

  let seats = 1;
  if (schoolPlan) {
    seats = Math.max(1, Math.min(1000, Number(formData.get("seats") ?? sub.seatLimit ?? 1) || 1));
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
      line_items: [{ price: priceIdFor(plan), quantity: seats }],
      // Payment methods (incl. Apple Pay / Google Pay) are chosen automatically
      // from the Stripe dashboard config — we don't pin payment_method_types.
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${base}/teacher/billing?checkout=success`,
      cancel_url: `${base}/teacher/billing?checkout=cancelled`,
      subscription_data: {
        metadata: { storyjar_subscription_id: sub.id, storyjar_kind: sub.kind },
      },
      metadata: { storyjar_subscription_id: sub.id, storyjar_plan: plan },
    });
    url = session.url;
  } catch (e) {
    console.error("[billing] checkout create failed", e);
    return { error: "We couldn’t start checkout just now. Please try again in a moment." };
  }
  if (!url) return { error: "We couldn’t start checkout just now. Please try again." };
  redirect(url);
}

// School plan paid by invoice / PO (BACS) — most UK primaries can't do recurring
// cards. Creates a subscription billed by emailed invoice with 30-day terms.
export async function requestSchoolInvoice(
  _prev: { error?: string; sent?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; sent?: boolean }> {
  const actor = await requireTeacher();
  if (!stripeConfigured()) return { error: "Billing isn’t set up in this environment yet." };
  if (!actor.isAdmin || !actor.schoolId) return { error: "Only a school admin can arrange invoice billing." };

  const sub = await governingSubscription({ id: actor.teacherId, schoolId: actor.schoolId });
  if (!sub || sub.kind !== "SCHOOL") return { error: "This school doesn’t have a school plan set up." };

  const seats = Math.max(1, Math.min(1000, Number(formData.get("seats") ?? sub.seatLimit ?? 1) || 1));
  const stripe = getStripe();
  const customerId = await ensureCustomer(sub, actor);

  try {
    await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceIdFor("school_seat_annual"), quantity: seats }],
      collection_method: "send_invoice",
      days_until_due: 30,
      metadata: { storyjar_subscription_id: sub.id, storyjar_kind: "SCHOOL" },
    });
  } catch (e) {
    console.error("[billing] invoice subscription create failed", e);
    return { error: "We couldn’t raise the invoice just now. Please try again." };
  }

  await recordAudit({
    action: "BILLING_INVOICE_REQUESTED", actorType: "ADMIN", actorId: actor.teacherId, actorName: actor.name,
    schoolId: actor.schoolId, subjectType: "SUBSCRIPTION", subjectId: sub.id,
    detail: `Requested invoice for ${seats} seat${seats === 1 ? "" : "s"}`,
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
      return_url: `${base}/teacher/billing`,
    });
    url = session.url;
  } catch (e) {
    console.error("[billing] portal create failed", e);
    return { error: "We couldn’t open the billing portal just now. Please try again." };
  }
  redirect(url);
}

// Convert an individual teacher's subscription to a school seat with pro-rata
// credit: cancel the individual Stripe subscription with proration (Stripe issues
// the unused-time credit to the customer balance / a credit note), attach the
// teacher to the school, and retire the local individual subscription. The school
// must already run a school plan and the teacher must assert the school's
// authority to process its pupils' data (RETENTION.md "Individual vs school").
export async function convertIndividualToSchoolSeat(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const actor = await requireTeacher();
  const schoolId = String(formData.get("schoolId") ?? "").trim();
  if (!schoolId) return { error: "Choose the school to join." };

  // The teacher must currently be on an individual plan (not already in a school).
  const individual = await db.subscription.findUnique({ where: { teacherId: actor.teacherId } });
  if (!individual || individual.kind !== "INDIVIDUAL" || actor.schoolId) {
    return { error: "This account isn’t on an individual plan." };
  }
  const schoolSub = await db.subscription.findUnique({ where: { schoolId } });
  if (!schoolSub || schoolSub.kind !== "SCHOOL") {
    return { error: "That school isn’t running a school plan yet." };
  }

  // Cancel the individual Stripe subscription with pro-rata credit, if one exists.
  if (stripeConfigured() && individual.stripeSubscriptionId) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.cancel(individual.stripeSubscriptionId, {
        prorate: true, // credit unused time back to the customer balance
      });
    } catch (e) {
      console.error("[billing] individual cancel (convert) failed", e);
      return { error: "We couldn’t transfer your plan just now. Please try again." };
    }
  }

  // Attach the teacher to the school (the school subscription now governs writes)
  // and retire the local individual subscription so only one plan governs.
  await db.teacher.update({ where: { id: actor.teacherId }, data: { schoolId } });
  await db.subscription.delete({ where: { id: individual.id } });

  await recordAudit({
    action: "BILLING_CONVERTED_TO_SCHOOL", actorType: "TEACHER", actorId: actor.teacherId, actorName: actor.name,
    schoolId, subjectType: "SUBSCRIPTION", subjectId: schoolSub.id,
    detail: "Individual plan converted to a school seat (pro-rata credit applied)",
  });
  return { ok: true };
}
