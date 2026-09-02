"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Subscription } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { governingSubscription, trialEndFromNow } from "@/lib/billing";
import { priceIdFor, isPlanKey, bandFor, type PlanKey } from "@/lib/billing-plans";
import { claimSchool, type ClaimRefusal } from "@/lib/schoolClaim";
import { requireProvedEmailForPurchase } from "@/lib/emailConfirmation";
import {
  INVITATION_REFUSED_MESSAGE,
  isSchoolInvitationRole,
  schoolInvitationIsOpen,
} from "@/lib/schoolInvitationPolicy";
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

// Create a Stripe customer, and do nothing else.
//
// THE STRIPE CALL, SPLIT OUT FROM THE ROW THAT USUALLY HOLDS IT. `ensureCustomer`
// below takes a `Subscription` and writes the new customer id back onto it, so it
// cannot be used at all on the purchase route that CREATES a school: there is no
// local row to read a customer id from and none to persist one onto until the
// claim commits. This is that call with the local half removed.
//
// The claim path deliberately persists NOTHING here. An abandoned checkout
// therefore leaves an orphan Stripe customer carrying a school name and an
// adult's email address, which docs/paid-tier-plan.md accepts by name: the
// alternative is a local row with no money behind it, and an ACTIVE row with no
// `stripeSubscriptionId` has no route to FROZEN at all.
//
// ADULT BILLING DATA ONLY, on every caller. A school's name, a teacher's name
// and their email. No child's name, work or id ever reaches Stripe.
async function createBillingCustomer(args: {
  name: string;
  email?: string;
  metadata: Record<string, string>;
}): Promise<string> {
  const customer = await getStripe().customers.create({
    name: args.name,
    email: args.email,
    metadata: args.metadata,
  });
  return customer.id;
}

// Ensure the governing subscription has a Stripe customer, creating one (adult
// billing data only) on first use and persisting its id. Returns [sub, customerId].
async function ensureCustomer(sub: Subscription, actor: Actor): Promise<string> {
  if (sub.stripeCustomerId) return sub.stripeCustomerId;

  // Only a SCHOOL plan is ever bought, so the customer is the school (name only)
  // with the arranging admin as billing contact. Never any child data.
  let name = actor.name;
  const email: string | undefined = actor.email; // billing contact = the admin arranging payment
  if (sub.kind === "SCHOOL" && sub.schoolId) {
    const school = await db.school.findUnique({ where: { id: sub.schoolId }, select: { name: true } });
    name = school?.name ?? actor.name;
  }

  const customerId = await createBillingCustomer({
    name,
    email,
    metadata: { storyjar_subscription_id: sub.id, storyjar_kind: sub.kind },
  });
  await db.subscription.update({ where: { id: sub.id }, data: { stripeCustomerId: customerId } });
  return customerId;
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
//
// IT STILL OPENS ON TRIAL AFTER THE NO-TRIAL DECISION, AND THAT IS DELIBERATE.
// The 1 Sep 2026 ruling (docs/pricing-decisions.md) is that a school which BUYS
// is a paying customer from that moment: no new purchase opens on a trial, and
// `claimSchool` creates ACTIVE with `trialEndsAt` explicitly null. That makes
// this function look like a leftover to modernise. It is not.
//
// This row is reachable only for a school that already EXISTS WITHOUT a
// subscription — a seed, or a row that predates the claim path. Handing it
// ACTIVE would be a free-forever school: `settleStatus` reaches FROZEN either by
// a lapsed `trialEndsAt` or by Stripe telling us a subscription stopped paying,
// and an ACTIVE row with NO `stripeSubscriptionId` has neither. TRIAL is the
// only state here that can ever end by itself, which is why it is the safe one.
// Change it and `scripts/freeze-expired.mjs` will never look at these rows again.
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

// ---------------------------------------------------------------------------
// BUYING A SCHOOL THAT DOES NOT EXIST YET (docs/paid-tier-plan.md item 0)
//
// Both purchase actions below fork on one fact: whether the buyer already
// belongs to a school. If they do, everything is as it was — the school's own
// `Subscription` row is bought against, and only its admin may do it. If they do
// not, they are buying a school INTO EXISTENCE, and everything under this
// heading is that path.
// ---------------------------------------------------------------------------

/** What the school will be created as: a name, and the register entry (if any). */
type ClaimTarget = { schoolName: string; urn: string | null };

/**
 * Resolve the school's name and URN SERVER-SIDE, from the buyer's own row.
 *
 * THE URN IS NEVER POSTED, and that is the whole design rather than a
 * precaution. The form carries three fields — `plan`, `schoolName` and `claim`
 * ("register" | "free-text") — and the URN is read here from `Teacher.urn` and
 * re-resolved against `Establishment` in the same request. A tampered client can
 * therefore choose only WHETHER to use its own teacher's URN, never which one.
 *
 * That is also the answer to docs/school-identity.md §2's standing instruction
 * to revisit the unchecked name↔URN agreement when `School.urn` landed. No check
 * is added: the name and the URN come out of the SAME `Establishment` row, in
 * one read, and a posted name is ignored whenever a URN is used — so a mismatch
 * is unreachable rather than detected. `createTeacherAccount`'s deliberate
 * non-check at signup stays as it is and stays correct.
 *
 * A NULL `Establishment` COVERS TWO CASES AND GETS ONE BRANCH: the teacher has
 * no URN, and the teacher has a URN whose row a re-import dropped (the register
 * is replaced wholesale — scripts/gias-import.ts). Both mean "we have no
 * register entry to claim", both fall through to the free-text name, and
 * neither is a special case.
 */
async function resolveClaimTarget(
  actor: Actor,
  formData: FormData,
): Promise<ClaimTarget | { error: string }> {
  const teacher = await db.teacher.findUnique({
    where: { id: actor.teacherId },
    select: { urn: true, schoolName: true },
  });

  if (String(formData.get("claim") ?? "") === "register" && teacher?.urn) {
    const entry = await db.establishment.findUnique({
      where: { urn: teacher.urn },
      select: { name: true },
    });
    // The register's name, not the posted one. The escape hatch on the screen
    // ("That's not my school") is what a teacher who has MOVED schools presses:
    // `updateProfile` lets them change `schoolName` and never touches `urn`, so
    // a stale URN is an ordinary state and not a fault to reconcile.
    if (entry) return { schoolName: entry.name, urn: teacher.urn };
  }

  const typed = String(formData.get("schoolName") ?? "").trim().replace(/\s+/g, " ");
  const name = typed || (teacher?.schoolName ?? "").trim();
  if (!name) {
    return { error: "Please tell us your school’s name — it’s what goes on the invoice." };
  }
  if (name.length > 120) {
    return { error: "That school name is too long. Please use the name your finance office will recognise." };
  }
  return { schoolName: name, urn: null };
}

/**
 * Is this register entry already somebody's school? Then say whose, and stop.
 *
 * RUN BEFORE ANY STRIPE CALL, in both purchase routes, because the alternative
 * is taking several hundred pounds for a school we are then going to refuse to
 * create. (The webhook meets the same collision with the money already moved and
 * nobody to answer; `claimSchool` step 3 degrades to a free-text school there,
 * and audits it.)
 *
 * IT NAMES A DISPLAY NAME AND NEVER AN EMAIL ADDRESS. The sentence has a job —
 * to send this teacher to the colleague who can add them — and "Mrs Lindqvist"
 * does that job. An address would hand anyone who can guess a URN a staff email
 * out of a school they have no connection to, which is a disclosure the sentence
 * does not need. The fallback is the first word of the stored full name, the
 * same one `getCurrentUser` uses for a teacher who has no `displayName` yet.
 *
 * REACHABLE ONLY BY A TEACHER WHOSE OWN STORED URN NAMES THAT SCHOOL, because
 * the URN never comes off the wire — see `resolveClaimTarget`. It is not a
 * lookup anybody can point at an arbitrary school.
 *
 * AND IT READS `verifiedAt`, BECAUSE AN UNPAID SCHOOL MAY BE A SQUATTER'S.
 * Signup verifies no email address (F67) and the PO route costs nothing up
 * front, so anyone can set a school up under a URN that is not theirs and leave
 * it unpaid for the length of the payment terms — the threat set out in
 * `docs/dpo-decisions.md`, 1 September 2026. Without this clause StoryJar told
 * a real teacher at the real school "Ask Mrs Whoever to add you to it", with no
 * caveat: it sent them to a stranger and vouched for them on the way.
 *
 * That entry calls the unpaid staff-invitation email "the only control that
 * reaches somebody who has not signed up yet". THIS IS A SECOND ONE, and it
 * says the same two things in the same order and for the same reason: the plan
 * is not paid for, and here is the name — if it means nothing to you, that is
 * the signal. See `staffInviteEmail` in src/lib/emailTemplates.ts.
 *
 * IT STILL NEVER DISCLOSES AN EMAIL ADDRESS, on either branch.
 */
async function urnAlreadyClaimed(urn: string): Promise<string | null> {
  const school = await db.school.findUnique({
    where: { urn },
    select: { id: true, name: true, verifiedAt: true },
  });
  if (!school) return null;

  const admin = await db.teacher.findFirst({
    where: { schoolId: school.id, role: "ADMIN", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { name: true, displayName: true },
  });
  const who = admin ? admin.displayName || admin.name.split(" ")[0] : null;

  // UNPAID: name the person, and do NOT send this teacher to them. "Ask X to
  // add you to it" is an instruction, and an instruction is the one thing a
  // school that has not been paid for has not earned.
  if (!school.verifiedAt) {
    return who
      ? `${school.name} is already set up on StoryJar by ${who}, but the plan hasn’t been paid for yet. If that name means nothing to you, please don’t assume this is your school. Get in touch and we’ll check who set it up before anybody joins.`
      : `${school.name} is already set up on StoryJar, but the plan hasn’t been paid for yet. If you weren’t expecting that, please get in touch and we’ll check who set it up before anybody joins.`;
  }

  return who
    ? `${school.name} is already set up on StoryJar. Ask ${who} to add you to it.`
    : `${school.name} is already set up on StoryJar. Ask whoever set it up to add you to it.`;
}

/**
 * THE METADATA CONTRACT the Stripe webhook's claim branch reads.
 *
 * Written into BOTH `metadata` and `subscription_data.metadata` on a Checkout
 * session: the first is what `checkout.session.completed` carries, the second is
 * the copy that survives onto the Stripe Subscription and is therefore the one
 * every later event has. The invoice route writes the same keys straight onto
 * the subscription it creates.
 *
 * The keys are a contract with src/app/api/stripe/webhook/route.ts and are not
 * cosmetic — changing one silently turns a paid claim into a session the webhook
 * cannot recognise, which is money taken for nothing. Values are strings only
 * (Stripe metadata has no other type), so a null URN travels as "".
 *
 * ADULT DATA ONLY: a teacher id, a plan key, a band label, a school's name and a
 * DfE URN. Nothing here is a child's anything.
 */
function claimMetadata(actor: Actor, plan: PlanKey, target: ClaimTarget): Record<string, string> {
  return {
    storyjar_purchase: "school_claim",
    storyjar_teacher_id: actor.teacherId,
    storyjar_plan: plan,
    storyjar_band: bandFor(plan).label,
    storyjar_school_name: target.schoolName,
    storyjar_urn: target.urn ?? "",
  };
}

/** A refusal from `claimSchool`, in words the buyer can act on. */
function claimRefusalMessage(reason: ClaimRefusal): string {
  switch (reason) {
    case "teacher-has-school":
      // They accepted an invitation between loading this page and pressing the
      // button. `claimSchool` will not move them, and it is right not to.
      return "You’ve joined a school since this page loaded, so we haven’t set up a second one. Nothing has been charged — please refresh and ask your school’s admin about the plan.";
    case "teacher-missing":
    default:
      return "We couldn’t set your school up just now. Nothing has been charged — please sign in again and try once more.";
  }
}

/**
 * Undo the Stripe side by hand when the local side failed.
 *
 * BEST EFFORT, AND IT SWALLOWS. The buyer has already been told the purchase
 * did not complete; a second failure here must not turn that into a 500. If the
 * cancel itself fails, an unattached subscription is left in Stripe with the
 * claim metadata still on it, which is a readable state for a person.
 */
async function cancelStripeSubscriptionQuietly(id: string): Promise<void> {
  try {
    await getStripe().subscriptions.cancel(id);
  } catch (e) {
    console.error("[billing] could not cancel the Stripe subscription after a failed claim", errorLabel(e));
  }
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

  const planRaw = String(formData.get("plan") ?? "");
  if (!isPlanKey(planRaw)) return { error: "Please choose a plan." };
  const plan: PlanKey = planRaw;

  // THE GUARD INVERTS; IT DOES NOT DISAPPEAR. If you already belong to a school
  // you must be its admin — buying against somebody else's school is exactly
  // what this check exists to stop, and it is the only thing standing between a
  // colleague and a purchase made in their school's name. If you belong to NO
  // school you are buying one into existence, and there is nothing yet to be an
  // admin of (docs/pricing-decisions.md, 30 Aug 2026: buying is self-serve and
  // there is no gatekeeper).
  //
  // Nothing else moves with it. `requireAdmin`, /admin's own guard, every entry
  // condition in src/app/actions/admin.ts, `openCustomerPortal`'s admin refusal
  // and the write gate in src/lib/billing.ts are all untouched.
  if (actor.schoolId && !actor.isAdmin) {
    return { error: "Only a school admin can buy the school plan." };
  }
  if (!actor.schoolId) return startClaimCheckout(actor, plan, formData);

  if (!stripeConfigured()) return { error: "Billing isn’t set up in this environment yet." };

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

/**
 * Checkout for a school that does not exist yet. NOTHING IS CREATED HERE.
 *
 * An abandoned checkout must leave no trace, so this writes not one local row:
 * no `School`, no `Subscription`, no half-made claim squatting on a URN
 * (docs/pricing-decisions.md, 1 Sep 2026). The whole purchase intent travels in
 * Stripe metadata and the school is created by the webhook's claim transaction
 * when — and only when — the payment is confirmed.
 *
 * TWO DIFFERENCES FROM THE ORDINARY CHECKOUT ABOVE, AND BOTH ARE LOAD-BEARING:
 *
 *   1. NO `client_reference_id`. That field carries a local `Subscription` id,
 *      and there is no local subscription. Omitting it is what makes
 *      `resolveLocalSub` fall through cleanly to `null` in the webhook, which
 *      is the signal the claim branch is waiting for. Putting anything else
 *      there — a teacher id, say — would have it looked up as a subscription id
 *      and fail in a way nobody would read.
 *   2. The claim metadata, in both places. See `claimMetadata`.
 */
async function startClaimCheckout(
  actor: Actor,
  plan: PlanKey,
  formData: FormData,
): Promise<{ error?: string }> {
  // FIRST LINE, BEFORE THE TARGET IS EVEN RESOLVED. Buying requires a proved
  // email address (docs/dpo-decisions.md, 2 Sep 2026), and what has to be true
  // when it refuses is that nothing happened: no Stripe customer, no session,
  // no `School`, no `Subscription`, no claim. Putting it after
  // `resolveClaimTarget` would still satisfy that — that function writes
  // nothing — but "first" is a property a reader can check at a glance and
  // "first apart from one thing that happens not to write" is not.
  //
  // Only the CLAIM routes. `startCheckout`'s existing-school branch above is
  // untouched: that school already exists, somebody already paid for it, and
  // its admin is not claiming anything.
  const unproved = await requireProvedEmailForPurchase(actor);
  if (unproved) return { error: unproved };

  const target = await resolveClaimTarget(actor, formData);
  if ("error" in target) return { error: target.error };

  // BEFORE STRIPE, DELIBERATELY. `stripeConfigured()` is checked after this
  // rather than before it: "your school is already on StoryJar, ask Mrs
  // Lindqvist" is a truer and more useful answer to this teacher than "billing
  // isn't set up here", and it costs nothing to give it first. No write of any
  // kind happens on either side of the check.
  if (target.urn) {
    const taken = await urnAlreadyClaimed(target.urn);
    if (taken) return { error: taken };
  }
  if (!stripeConfigured()) return { error: "Billing isn’t set up in this environment yet." };

  const stripe = getStripe();
  const base = await origin();
  const metadata = claimMetadata(actor, plan, target);

  let url: string | null;
  try {
    const customerId = await createBillingCustomer({
      name: target.schoolName,
      email: actor.email,
      metadata: {
        storyjar_purchase: "school_claim",
        storyjar_teacher_id: actor.teacherId,
        storyjar_kind: "SCHOOL",
      },
    });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      // Quantity is always 1 — the band IS the price (docs/pricing-decisions.md).
      line_items: [{ price: priceIdFor(plan), quantity: 1 }],
      // NO `allow_promotion_codes` ON THIS ROUTE, AND ITS ABSENCE IS DELIBERATE.
      // Promotion codes are wanted eventually, and the route that buys a plan
      // for a school which ALREADY EXISTS (`startCheckout` above) keeps them —
      // it predates this and works. What is unanswered is the one case only
      // this route can meet: a FREE purchase.
      //
      // A discount of anything less than 100% still charges, so the session is
      // `payment_status: "paid"` and the claim below works unchanged. Stripe
      // sets `no_payment_required` only when the amount due is zero, and a
      // £0 school raises design questions nobody has answered — whether a
      // comped school is verified, what happens at renewal when the code
      // lapses, how ops tells it apart, and whether it should exist at all.
      // The webhook withholds that status rather than guessing, and switching
      // these back on before the decision is taken would settle all of it
      // silently, as a side effect. The decision goes in
      // docs/pricing-decisions.md; this line comes back with it.
      billing_address_collection: "auto",
      success_url: `${base}/teacher/account?checkout=success`,
      cancel_url: `${base}/teacher/account?checkout=cancelled`,
      subscription_data: { metadata },
      metadata,
    });
    url = session.url;
  } catch (e) {
    console.error("[billing] school-claim checkout create failed", errorLabel(e));
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

  const planRaw = String(formData.get("plan") ?? "");
  if (!isPlanKey(planRaw)) return { error: "Please choose the size of your school." };

  // The same inversion as `startCheckout`, for the same reason, and the two must
  // stay the same shape: a PO route that admitted somebody the card route
  // refuses is a way round the check rather than a second way in.
  if (actor.schoolId && !actor.isAdmin) return { error: "Only a school admin can arrange invoice billing." };
  if (!actor.schoolId) return requestClaimInvoice(actor, planRaw, formData);

  if (!stripeConfigured()) return { error: "Billing isn’t set up in this environment yet." };

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

/**
 * Buy a school that does not exist yet, by invoice / purchase order.
 *
 * STRIPE FIRST, LOCAL SECOND, AND THE ORDER IS THE DESIGN. Everything that can
 * refuse — the guard, the name and URN resolution, the duplicate-URN refusal —
 * happens before a single Stripe call. Then the customer, then the subscription,
 * then the local claim.
 *
 * CREATING LOCALLY FIRST WAS CONSIDERED AND REJECTED. Stripe is the side that
 * cannot be rolled back, so it goes first and is undone by hand if the local
 * side fails. The other way round, a failed Stripe call leaves a `School` with
 * an ACTIVE `Subscription` and no `stripeSubscriptionId` — a row `settleStatus`
 * can never move to FROZEN and `scripts/freeze-expired.mjs` will never look at,
 * because it has neither a trial to lapse nor a Stripe subscription to stop
 * paying. That is a permanently free school, created by an error path.
 *
 * THE SCHOOL IS CREATED UNVERIFIED, ON PURPOSE (docs/pricing-decisions.md,
 * 1 Sep 2026). An invoice with 30-day terms is unpaid by definition and finance
 * sitting on it must not freeze a school, so the subscription is ACTIVE while
 * `School.verifiedAt` stays null until `invoice.paid` stamps it. What holds the
 * line in that window is the gates on an unverified school, not the plan state.
 *
 * There is no webhook in this path and no confirmation to wait for, which is why
 * it ships before the card route: the whole claim transaction can be driven from
 * a browser by a person with an error channel to read.
 */
async function requestClaimInvoice(
  actor: Actor,
  plan: PlanKey,
  formData: FormData,
): Promise<{ error?: string; sent?: boolean }> {
  // The same gate as `startClaimCheckout`, in the same position, and the two
  // must stay the same shape for the reason `requestSchoolInvoice` gives about
  // the admin check: a purchase-order route that admitted somebody the card
  // route refuses is a way round the check rather than a second way in. This
  // is in fact the route the gate exists FOR — a PO costs the person raising it
  // nothing up front, which is what made claiming any school in the register
  // free.
  const unproved = await requireProvedEmailForPurchase(actor);
  if (unproved) return { error: unproved };

  const target = await resolveClaimTarget(actor, formData);
  if ("error" in target) return { error: target.error };

  // Before Stripe, and before the configured check, for the reason given in
  // `startClaimCheckout`.
  if (target.urn) {
    const taken = await urnAlreadyClaimed(target.urn);
    if (taken) return { error: taken };
  }
  if (!stripeConfigured()) return { error: "Billing isn’t set up in this environment yet." };

  const band = bandFor(plan);
  let customerId: string;
  let stripeSubscriptionId: string;
  try {
    customerId = await createBillingCustomer({
      name: target.schoolName,
      email: actor.email,
      metadata: {
        storyjar_purchase: "school_claim",
        storyjar_teacher_id: actor.teacherId,
        storyjar_kind: "SCHOOL",
      },
    });
    const created = await getStripe().subscriptions.create({
      customer: customerId,
      items: [{ price: priceIdFor(plan), quantity: 1 }],
      collection_method: "send_invoice",
      days_until_due: 30,
      // The same keys the card route puts on a Checkout session, so a claimed
      // school looks the same in Stripe whichever way it was bought — and so
      // `invoice.paid` on this subscription carries the claim it belongs to.
      metadata: claimMetadata(actor, plan, target),
    });
    stripeSubscriptionId = created.id;
  } catch (e) {
    console.error("[billing] school-claim invoice subscription create failed", errorLabel(e));
    return { error: "We couldn’t raise the invoice just now. Please try again." };
  }

  // THE CLAIM. One transaction: the school, its subscription, the privilege
  // grant and the audit row that records it, all of it or none of it.
  let outcome;
  try {
    outcome = await claimSchool({
      teacherId: actor.teacherId,
      schoolName: target.schoolName,
      urn: target.urn,
      plan,
      verified: false, // a 30-day invoice is unpaid by definition
      source: "INVOICE",
      stripeCustomerId: customerId,
      stripeSubscriptionId,
    });
  } catch (e) {
    console.error("[billing] school claim failed after Stripe accepted the subscription", errorLabel(e));
    await cancelStripeSubscriptionQuietly(stripeSubscriptionId);
    return { error: "We couldn’t finish setting your school up. Nothing has been charged — please try again." };
  }

  if (!outcome.ok) {
    // A refusal is not an error: the money side is undone and the buyer is told
    // why, which is the whole advantage this route has over the webhook.
    await cancelStripeSubscriptionQuietly(stripeSubscriptionId);
    return { error: claimRefusalMessage(outcome.reason) };
  }

  // The school's own timeline should read the same whichever route bought it,
  // so the invoice line goes in alongside the SCHOOL_CLAIMED and
  // BILLING_ACTIVATED rows the claim wrote inside its transaction. `recordAudit`
  // swallows a failure, which is right here: the school exists and is paid-for
  // either way, and this row is the narrative rather than the grant.
  if (outcome.schoolId) {
    await recordAudit({
      action: "BILLING_INVOICE_REQUESTED",
      actorType: "ADMIN",
      actorId: actor.teacherId,
      actorName: actor.name,
      schoolId: outcome.schoolId,
      subjectType: "SCHOOL",
      subjectId: outcome.schoolId,
      detail: `Requested invoice for the school plan (${band.label}, £${band.price}/year)`,
    });
  }

  // Back to the account page rather than staying put with a message. The buyer
  // is a school admin as of a moment ago, so the page they are looking at is
  // already out of date: the purchase section has to go, the billing section has
  // to appear, and the nav has to gain the admin area. The query parameter is
  // what carries the confirmation across the navigation, exactly as
  // `?checkout=success` does for the card route.
  redirect("/teacher/account?purchase=invoice");
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


// ===========================================================================
// A teacher who already has a StoryJar account joins the school that asked her.
//
// WHAT THIS USED TO BE, AND WHY THE SHAPE CHANGED. It took a `schoolId` from
// the posted form and attached any signed-in schoolless teacher to that school.
// The only thing it checked was that the named school ran a school plan, never
// that the school had asked for this teacher, so any teacher could post any
// school's id and have their classes and their pupils' work pass into a school
// they had no connection to. It was emptied to a flat refusal while phase 2 was
// built, and this is phase 2.
//
// THE INPUT IS AN INVITATION ID, NOT A SCHOOL ID, and that is the fix rather
// than a validation of the old one. The school is DERIVED from the invitation
// row. There is no posted value anywhere in this action that names a school, so
// there is nothing for a tampered client to point somewhere else: the worst a
// forged id can do is name a row that is not this teacher's, which is one
// `findFirst` scoped by `teacherId` away from being nothing at all
// (docs/dpo-decisions.md, 2 September 2026).
//
// NOTHING ACTUALLY "MOVES" IN THE DATABASE, AND SOMEBODY WILL GO LOOKING FOR A
// COLUMN THAT IS NOT THERE. `Class` has no `schoolId`: a class belongs to a
// school only through the teacher who holds it, which is the same fact F59 was
// about on the removal side. So the whole of "her classes and the children in
// them become the school's" is ONE `Teacher.schoolId` write. When
// `Class.schoolId` lands with year-end transfer, this transaction gains a
// `class.updateMany` beside step 2 and the audit loop below is already written
// for it.
//
// SHE STAYS `ACTIVE` THROUGHOUT, AND THIS IS THE LOAD-BEARING SENTENCE IN THE
// FILE. Flipping an established account's `status` to "INVITED" is the obvious
// shortcut — it is what a fresh invitee carries — and it walks into a live
// cascade: `removeStaff`'s INVITED branch DELETES the teacher row outright,
// `Teacher` cascades to `ActivityTemplate` → `Assignment` → `AssignmentStudent`
// and directly to `Draft`, and a `Draft` is a child's private unfinished work by
// the schema's own words. `JournalItem.assignmentId` is SET NULL, so a
// journal-item count would not notice any of it. The separate
// `SchoolInvitation` row exists precisely so this shortcut never has to be
// taken (docs/dpo-decisions.md, 2 September 2026).
//
// THE SIGNATURE AND THE EXPORT NAME ARE UNCHANGED on purpose, so the shape of
// the action does not change even though everything it does has.
// ===========================================================================
export async function joinSchoolPlan(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const actor = await requireTeacher();
  const invitationId = String(formData.get("invitationId") ?? "");

  // ONE SENTENCE FOR EVERY REFUSAL, from the policy module, and the screen
  // never says which one happened. The code always knows; saying would answer
  // "is this invitation id real?" and "does that school have an offer out to
  // that teacher?" for anybody signed in. See INVITATION_REFUSED_MESSAGE.
  const refuse = { error: INVITATION_REFUSED_MESSAGE };

  // --- GUARD 1: the invitation, SCOPED BY `teacherId` ----------------------
  // `findFirst` with both columns, never `findUnique` by the posted id and a
  // check afterwards. Somebody else's invitation is not "found and rejected"
  // here; it is simply not found.
  const invitation = await db.schoolInvitation.findFirst({
    where: { id: invitationId, teacherId: actor.teacherId },
    select: {
      id: true,
      schoolId: true,
      role: true,
      state: true,
      expiresAt: true,
      school: {
        select: {
          name: true,
          verifiedAt: true,
          subscription: { select: { kind: true } },
        },
      },
    },
  });
  if (!invitation) return refuse;

  // --- GUARD 2: is the offer still open? -----------------------------------
  // Both halves together, from the one place that defines "open": PENDING
  // alone would accept a row that lapsed in March, an unexpired clock alone
  // would accept one the school withdrew this morning.
  if (!schoolInvitationIsOpen(invitation)) return refuse;

  // --- GUARD 3: she must have no school of her own -------------------------
  // Checked here as well as in step 2's WHERE, because a refusal a person can
  // read is better than a transaction that throws. Step 2 is what makes it
  // safe; this is what makes it explicable.
  if (actor.schoolId) return refuse;

  // --- GUARD 4: the school is still verified, RE-CHECKED AT ACCEPT ---------
  // `inviteStaff` refuses an existing account while `School.verifiedAt` is
  // null, so this looks redundant and is not. A school can lose verification
  // between the invitation and the answer — a refund detaches the buyer, and
  // fourteen days is long enough for that to happen — and THIS is the moment
  // children's data changes hands, not the moment the offer was made. The 1
  // September ground for letting an unpaid school invite ("an invitation does
  // nothing until the teacher accepts") is exactly the sentence that makes the
  // check belong here (docs/dpo-decisions.md, 2 September 2026).
  if (!invitation.school.verifiedAt) return refuse;

  // --- GUARD 5: the role is in the closed vocabulary -----------------------
  // The value is about to be written onto `Teacher.role`, which is what
  // `requireAdmin` reads. A row carrying a word nobody recognises must not
  // become a role nobody granted, and denying by default (rule 8) means naming
  // the roles that are allowed rather than the ones that are not.
  if (!isSchoolInvitationRole(invitation.role)) return refuse;

  // --- GUARD 6: the school actually runs a school plan ---------------------
  // The one check the old body had. It is last because it is the least of
  // them, and it survives because joining a school whose plan is not a school
  // plan would leave her governed by nothing at all after step 3 deletes her
  // own row.
  if (invitation.school.subscription?.kind !== "SCHOOL") return refuse;

  // --- The whole join, or none of it ---------------------------------------
  // Four writes, EVERY ONE OF THEM GUARDED IN ITS OWN WHERE rather than by
  // what was read a few lines above, because everything read above was read
  // outside this transaction and could have changed since.
  const classes = await db.class.findMany({
    where: { teacherId: actor.teacherId },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  try {
    await db.$transaction(async (tx) => {
      // 1. CONSUME THE INVITATION FIRST. Not third, not last. If two tabs
      //    press the button at the same moment, the loser fails HERE, before
      //    anything else has been written, so there is nothing to roll back
      //    and no window in which a teacher is half-joined.
      const consumed = await tx.schoolInvitation.updateMany({
        where: { id: invitation.id, teacherId: actor.teacherId, state: "PENDING" },
        data: { state: "ACCEPTED", respondedAt: new Date() },
      });
      if (consumed.count === 0) throw new Error("invitation was not open");

      // 2. THE ATTACH, AND `schoolId: null` IN THE WHERE IS THE POINT OF IT.
      //    It is what makes it impossible for this action to move a teacher
      //    OUT of a school, or from one school into another, no matter what is
      //    posted and no matter what raced it. A teacher who gained a school
      //    between guard 3 and here is zero rows, and the throw undoes step 1.
      //
      //    `status` IS DELIBERATELY WRITTEN AS "ACTIVE" rather than left
      //    alone. She is already ACTIVE, so this changes nothing today — it is
      //    here so that the one status this row must never carry is stated in
      //    the write itself. See the header: an established account carrying
      //    "INVITED" is deleted outright by `removeStaff`, taking children's
      //    drafts and the record of which children an activity was set to with
      //    it.
      const attached = await tx.teacher.updateMany({
        where: { id: actor.teacherId, schoolId: null },
        data: { schoolId: invitation.schoolId, role: invitation.role, status: "ACTIVE" },
      });
      if (attached.count === 0) throw new Error("teacher already had a school");

      // 3. HER OWN FREE ROW GOES, so exactly one plan governs her.
      //    `governingSubscription` prefers the school's whenever `schoolId` is
      //    set, so leaving it would not break anything today — it would leave
      //    a second row that says something false about who covers her, and
      //    the day she is removed from the school `restoreFreePlan` writes her
      //    a fresh one anyway. `deleteMany` rather than `delete` because a
      //    teacher may legitimately have no row at all.
      //
      //    THE SCREEN PROMISES NOTHING SHE MADE IS DELETED, and this is the
      //    line that promise is about. It deletes a billing row and nothing
      //    else: no class, no pupil, no journal item, no draft.
      await tx.subscription.deleteMany({ where: { teacherId: actor.teacherId } });

      // 4. EVERY OTHER OPEN OFFER CLOSES AS SUPERSEDED. Nobody did anything to
      //    these and the state says so: it is not DECLINED, because she did
      //    not turn them down, and not REVOKED, because the school did not
      //    take them back. Without this they rot in a stranger's console as a
      //    live claim on pupils that are now another school's.
      //
      //    `respondedAt` IS LEFT NULL for the same reason. The column means
      //    "when the teacher answered", and she never answered these.
      await tx.schoolInvitation.updateMany({
        where: { teacherId: actor.teacherId, state: "PENDING", id: { not: invitation.id } },
        data: { state: "SUPERSEDED" },
      });
    });
  } catch {
    // Nothing committed. The one sentence, again — a teacher who lost a race
    // and a teacher who forged an id are told the same thing, and the state
    // they are in is the state they were in.
    return refuse;
  }

  // --- Audited AFTER the commit --------------------------------------------
  // `removeStaff`'s convention: no audit row may claim something that was
  // rolled back. `recordAudit` swallows its own failures, which is right here
  // and is the opposite of `claimSchool`'s rule — that one grants ADMIN and
  // must not exist without its record; this one is a teacher recording what
  // she did to her own account.
  //
  // ONE ROW PER CLASS, `subjectType: "CLASS"`, because a school asking "who
  // held this class, and when did that change" filters by class id and reads
  // custody in order. A class that arrived by acceptance must appear in that
  // read, and a single summary row naming only the teacher would not.
  //
  // NOT `CLASS_ASSIGNED`, and this is not a matter of taste: src/app/admin/
  // page.tsx reads `CLASS_ASSIGNED` rows to build the "inherited" flag that
  // tells an admin they are temporarily holding a colleague's children's work
  // after a removal. A row written here would make that flag say something
  // untrue about a class that simply arrived with its own teacher.
  for (const klass of classes) {
    await recordAudit({
      action: "CLASS_JOINED_SCHOOL", actorType: "TEACHER",
      actorId: actor.teacherId, actorName: actor.name, schoolId: invitation.schoolId,
      subjectType: "CLASS", subjectId: klass.id,
      detail: `${klass.name} became ${invitation.school.name}'s when ${actor.name} accepted the invitation to join`,
    });
  }

  // THE CONTROLLER-CHANGE RECORD. This is the row a data protection lead is
  // looking for when they ask when a school became responsible for these
  // children's work and on whose say-so, so it says both.
  await recordAudit({
    action: "SCHOOL_INVITATION_ACCEPTED", actorType: "TEACHER",
    actorId: actor.teacherId, actorName: actor.name, schoolId: invitation.schoolId,
    subjectType: "SCHOOL_INVITATION", subjectId: invitation.id,
    detail:
      `${actor.name} accepted the invitation to join as ${invitation.role.toLowerCase()}` +
      (classes.length > 0
        ? `, and ${classes.length} ${classes.length === 1 ? "class" : "classes"} became the school's`
        : ", holding no classes"),
  });

  // KEPT VERBATIM, INCLUDING THE ACTION NAME, for continuity: this is the row
  // the billing timeline has meant since the old body wrote it, and an admin
  // reading a school's history should not find the same event under two names
  // either side of this change.
  await recordAudit({
    action: "BILLING_JOINED_SCHOOL", actorType: "TEACHER",
    actorId: actor.teacherId, actorName: actor.name, schoolId: invitation.schoolId,
    subjectType: "TEACHER", subjectId: actor.teacherId,
    detail: `Joined ${invitation.school.name}'s plan`,
  });

  // The banner, the rail's school name and the account page are all stale, and
  // so is every admin screen that lists staff or classes.
  revalidatePath("/teacher", "layout");
  revalidatePath("/admin");
  redirect("/teacher/account?joined=1");
}
