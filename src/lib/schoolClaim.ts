import "server-only";
import { db } from "@/lib/db";
import { bandFor, type PlanKey } from "@/lib/billing-plans";
import { restoreFreePlan } from "@/lib/billing";
import { recordAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// THE CLAIM: how a School comes into existence, and who becomes its admin.
//
// This module is safeguarding-critical (SAFEGUARDING.md rules 1, 5, 8, 16) and
// it exists as one file for one reason: the rule that decides who becomes a
// school admin has to be readable in a single sitting. `assignClassToStaff` IS
// the access control at this product's edge — an admin can move any class in
// their school to anybody, including themselves — so "who becomes an admin" is a
// privilege-escalation question rather than a filing convenience
// (docs/school-identity.md §5).
//
// THE ANSWER, AS A RULE, AND THERE ARE ONLY TWO CLAUSES:
//
//   1. By PAYING for a school that does not yet exist. That is `claimSchool`.
//   2. By being promoted by an existing admin of a VERIFIED school. That is
//      `setStaffRole`, gated on `schoolIsVerified`.
//
// Not by picking a name. Not by matching a URN. Not by `joinSchoolPlan`, which
// docs/paid-tier-plan.md item 0.6 shuts. If a third clause ever appears, it
// belongs in this comment before it belongs in the code.
//
// NOTHING IN THIS MODULE READS A CHILD. It touches School, Subscription, Teacher
// and AuditLog, and no other table.
//
// docs/paid-tier-plan.md item 0 · docs/school-identity.md §3–§5 ·
// docs/pricing-decisions.md (1 Sep 2026) · docs/dpo-decisions.md (30 Aug, 1 Sep)
// ---------------------------------------------------------------------------

/** Which of the two purchase routes produced this claim. */
export type ClaimSource = "CARD" | "INVOICE";

/**
 * Everything the claim needs, resolved BEFORE the transaction opens.
 *
 * `schoolName` and `urn` are resolved server-side from the buyer's own
 * `Teacher.urn` and the `Establishment` row it names — never from a posted
 * field. A tampered client can choose only WHETHER to use its own teacher's URN,
 * never which one (docs/school-identity.md §2, answered in the plan's 1.3).
 */
export type ClaimIntent = {
  /** The teacher who paid. Becomes this school's first and only ADMIN. */
  teacherId: string;
  /** The name the school is created under. The GIAS register name when a URN is
   *  used, the teacher's own free text otherwise. SNAPSHOTTED: it never follows
   *  a later GIAS rename, which is the whole point of not joining. */
  schoolName: string;
  /** The register entry claimed, or null for a free-text school. */
  urn: string | null;
  /** The price band bought, for the audit detail. Not stored on School — that
   *  is item 4 of docs/paid-tier-plan.md, and it is not this change. */
  plan: PlanKey;
  /** True when money has already been confirmed. CARD is always true; INVOICE
   *  is always false, because a 30-day invoice is unpaid by definition. */
  verified: boolean;
  source: ClaimSource;
  stripeCustomerId?: string | null;
  /** The Stripe subscription this claim is for. THE IDEMPOTENCY KEY: it is
   *  `@unique` on Subscription, which is the backstop if two deliveries race. */
  stripeSubscriptionId: string;
};

/**
 * Why a claim was refused. Every one of these is UNFIXABLE BY RETRYING, which is
 * what the webhook branch needs to know: it audits `SCHOOL_CLAIM_REFUSED` and
 * returns 200 rather than throwing, because a retry loop against an unfixable
 * state costs Stripe deliveries and delivers nothing.
 *
 * A refusal is NOT the same as a thrown error. See `claimSchool`'s step 6.
 */
export type ClaimRefusal =
  /** The buyer's account no longer exists — deleted between checkout and the
   *  webhook, or an id that never named one. */
  | "teacher-missing"
  /** The buyer already belongs to a school. They were invited into one between
   *  pressing the button and the webhook landing. They are NOT moved. */
  | "teacher-has-school";

export type ClaimOutcome =
  | {
      ok: true;
      /** True when step 1 found this Stripe subscription already claimed and
       *  wrote nothing. A redelivery, not a second school. */
      alreadyDone: boolean;
      schoolId: string | null;
      /** True when the URN was taken at webhook time and the school was created
       *  from its name alone. Audited, and it is the operator's cue. */
      urnDropped: boolean;
    }
  | { ok: false; reason: ClaimRefusal };

/**
 * Create a school, attach its subscription, and make the buyer its admin — all
 * of it, or none of it.
 *
 * ONE `db.$transaction`, AND THE ORDER OF THE STEPS IS THE DESIGN. Read the
 * numbered comments in the body before moving anything: each step exists
 * because the state it would leave behind if it ran later is worse than the one
 * it leaves now.
 *
 * THROWS rather than returning `{ ok: false }` in exactly two situations, and
 * both of them are ones a Stripe redelivery can genuinely fix: the guarded
 * privilege grant losing a race, and the audit write failing. Everything a retry
 * cannot fix comes back as a refusal.
 */
export async function claimSchool(intent: ClaimIntent): Promise<ClaimOutcome> {
  return db.$transaction(async (tx) => {
    // -----------------------------------------------------------------------
    // 1. IDEMPOTENCY, FIRST, BEFORE ANYTHING IS READ ABOUT A PERSON.
    //
    // Stripe delivers at least once, and the insert-first `BillingEvent`
    // pattern in the webhook handler has a hole: the event row inserts,
    // `claimSchool` commits, something after it throws, the catch deletes the
    // `BillingEvent` NON-transactionally, Stripe redelivers, and the handler
    // runs again against a school that already exists. This check is the
    // primary close on that hole, and unlike the event-id check it works on
    // ANY redelivery, including one carrying a different event id for the same
    // subscription.
    //
    // `stripeSubscriptionId` is `@unique`, so it is also the backstop if two
    // deliveries genuinely race past this read: the loser aborts whole, and
    // there is no half-made school and no promoted teacher.
    // -----------------------------------------------------------------------
    const existing = await tx.subscription.findUnique({
      where: { stripeSubscriptionId: intent.stripeSubscriptionId },
      select: { schoolId: true },
    });
    if (existing) {
      return { ok: true as const, alreadyDone: true, schoolId: existing.schoolId, urnDropped: false };
    }

    // -----------------------------------------------------------------------
    // 2. THE BUYER, before anything is created. Two refusals, and the second is
    // the one that is easy to get wrong.
    //
    // A teacher who has acquired a `schoolId` since pressing the button was
    // invited into a school in the gap. DO NOT MOVE THEM. Moving them would
    // take their classes — and the children's work in them — out from under one
    // school's admins and put them under another's, on the strength of a
    // payment neither school made. docs/school-identity.md §5 is explicit that
    // joining a school is a thing the teacher does, never a thing done to them.
    //
    // Money has already moved by the time we get here, so a refusal is a
    // conversation and a manual refund, not a silent failure. The audit row the
    // caller writes is what makes that conversation possible.
    // -----------------------------------------------------------------------
    const buyer = await tx.teacher.findUnique({
      where: { id: intent.teacherId },
      select: { id: true, schoolId: true, displayName: true, name: true },
    });
    if (!buyer) return { ok: false as const, reason: "teacher-missing" as const };
    if (buyer.schoolId) return { ok: false as const, reason: "teacher-has-school" as const };

    // -----------------------------------------------------------------------
    // 3. THE URN COLLISION. A TOCTOU race with nobody to return an error to.
    //
    // The duplicate-URN refusal that a human sees lives at checkout time, in
    // the purchase screen, where there is somebody to read a sentence. By the
    // time the webhook lands the money has moved, so this is the same check
    // with no error channel — and it degrades rather than refusing.
    //
    // WE SET `urn = null` AND CREATE THE SCHOOL FROM ITS NAME ALONE. The two
    // alternatives are worse in both directions:
    //
    //   Attaching the buyer to the school that holds the URN is AUTO-JOIN,
    //   which docs/school-identity.md §4 forbids by name. Matching a URN is not
    //   evidence of employment, and it would drop a stranger into a real
    //   school's console with a real school's children behind it.
    //
    //   Refusing outright takes several hundred pounds and delivers nothing.
    //
    // A free-text school is a first-class thing in this product, so the
    // degraded outcome is an ordinary school that simply has no register key.
    // The audit row says exactly what happened, and it is the operator's cue.
    // -----------------------------------------------------------------------
    let urn = intent.urn;
    let urnDropped = false;
    if (urn) {
      const taken = await tx.school.findUnique({ where: { urn }, select: { id: true } });
      if (taken) {
        urn = null;
        urnDropped = true;
      }
    }

    // -----------------------------------------------------------------------
    // 4. THE SCHOOL. `verifiedAt` is stamped here only for a CARD purchase,
    // where the money is already confirmed, so that route never passes through
    // the unverified state at all and an abandoned checkout cannot squat on a
    // URN. The invoice route creates unverified on purpose and is stamped later
    // by `stampVerified` on `invoice.paid`.
    // -----------------------------------------------------------------------
    const school = await tx.school.create({
      data: {
        name: intent.schoolName,
        urn,
        verifiedAt: intent.verified ? new Date() : null,
        claimedByTeacherId: buyer.id,
      },
      select: { id: true, name: true },
    });

    // -----------------------------------------------------------------------
    // 5. THE SUBSCRIPTION. ACTIVE, NEVER TRIAL, and `trialEndsAt` EXPLICITLY
    // NULL rather than merely omitted.
    //
    // Owner decision, 1 Sep 2026 (docs/pricing-decisions.md): new purchases do
    // not open on a trial; a 42-day full refund replaces it. The explicit null
    // is not decoration — `settleStatus`'s lapse branch requires a non-null
    // `trialEndsAt`, so writing it null makes that branch unreachable for every
    // school created here, and says so to the next reader.
    //
    // Note `ensureSchoolSubscription` in src/app/actions/billing.ts still opens
    // on TRIAL and is correct to: it is reachable only for a school that exists
    // WITHOUT a subscription (a seed, or a pre-migration row), and an ACTIVE row
    // with no `stripeSubscriptionId` has no route to FROZEN at all. The two are
    // not the same call and modernising one into the other would mint a
    // free-forever school.
    // -----------------------------------------------------------------------
    const sub = await tx.subscription.create({
      data: {
        kind: "SCHOOL",
        status: "ACTIVE",
        trialEndsAt: null,
        schoolId: school.id,
        stripeCustomerId: intent.stripeCustomerId ?? null,
        stripeSubscriptionId: intent.stripeSubscriptionId,
      },
      select: { id: true },
    });

    // -----------------------------------------------------------------------
    // 6. THE PRIVILEGE GRANT, GUARDED. This is the line that makes somebody a
    // school admin, and it is written as an `updateMany` with `schoolId: null`
    // in the WHERE clause rather than an `update` by id, deliberately.
    //
    // Step 2 read the buyer's `schoolId` a few statements ago. A concurrent
    // invitation acceptance could have set it since. `update` would overwrite
    // that silently; `updateMany` on the predicate matches zero rows instead,
    // and the throw rolls the whole claim back — the school, the subscription,
    // everything. THE CONCURRENT INVITATION WINS AND THE PURCHASE LOSES, which
    // is the right way round: the invitation is a thing the teacher agreed to.
    //
    // Stripe then retries, step 1 finds nothing (the rollback took the
    // subscription with it), step 2 now sees the `schoolId` and returns
    // `teacher-has-school`, and the webhook audits a refusal and stops. The
    // loop terminates.
    //
    // The message carries an id and no name: it may reach a log store.
    // -----------------------------------------------------------------------
    const { count } = await tx.teacher.updateMany({
      where: { id: buyer.id, schoolId: null },
      data: { schoolId: school.id, role: "ADMIN" },
    });
    if (count !== 1) {
      throw new Error(
        `[schoolClaim] privilege grant matched ${count} rows for teacher ${buyer.id}; rolling the claim back`,
      );
    }

    // -----------------------------------------------------------------------
    // 7. THE AUDIT ROW, INSIDE THE TRANSACTION, via `tx.auditLog.create` and
    // NOT via `recordAudit`.
    //
    // THIS IS A DELIBERATE EXCEPTION TO `recordAudit`'S CONTRACT, and it needs
    // to be read as one rather than tidied into consistency. That contract —
    // "auditing must never break the user's action", so failures are logged and
    // swallowed — protects A USER'S ACTION. It is right nearly everywhere: a
    // teacher approving a photograph should not be stopped by a full disk.
    //
    // THIS IS NOT A USER'S ACTION. IT IS A PRIVILEGE GRANT. The grant must not
    // exist without its record, so the write is transactional and a failure
    // rolls the claim back and lets Stripe retry. A school admin whose
    // appointment has no audit row is exactly the state SAFEGUARDING.md rule 16
    // exists to make impossible.
    //
    // Detail names the school, the band and the route — and the URN-dropped
    // clause when it applies, because that is the sentence somebody will need
    // when a second school asks why it could not claim its own URN.
    // -----------------------------------------------------------------------
    const band = bandFor(intent.plan);
    const route = intent.source === "CARD" ? "card payment" : "invoice (PO)";
    const dropped = urnDropped
      ? ` The DfE URN ${intent.urn} was already claimed by another school, so this school was created without one.`
      : "";
    await tx.auditLog.create({
      data: {
        action: "SCHOOL_CLAIMED",
        actorType: "SYSTEM",
        actorId: buyer.id,
        actorName: buyer.displayName ?? buyer.name,
        schoolId: school.id,
        subjectType: "SCHOOL",
        subjectId: school.id,
        detail:
          `${school.name} set up on the school plan (${band.label}, £${band.price}/year) by ${route}. ` +
          `${buyer.displayName ?? buyer.name} became its first admin.${dropped}`,
      },
    });

    // The billing timeline reads the same as every `transition()`-produced row,
    // so a school's history does not start with a gap where its purchase was.
    await tx.auditLog.create({
      data: {
        action: "BILLING_ACTIVATED",
        actorType: "SYSTEM",
        actorName: "System",
        schoolId: school.id,
        subjectType: "SUBSCRIPTION",
        subjectId: sub.id,
        detail: intent.verified
          ? `School plan active (${band.label}, £${band.price}/year), paid.`
          : `School plan active (${band.label}, £${band.price}/year), invoice issued with 30 days to pay.`,
      },
    });

    // -----------------------------------------------------------------------
    // THE BUYER'S OWN FREE `Subscription` ROW IS LEFT ALONE, AND ITS ABSENCE
    // FROM THIS TRANSACTION IS THE DECISION. It looks like an omission; it is
    // not, and `joinSchoolPlan` a few files away does the opposite, which is
    // what makes the omission look like a bug.
    //
    // `Subscription.teacherId` and `Subscription.schoolId` are separate unique
    // columns, so both rows coexist happily, and `governingSubscription`
    // already prefers the school's whenever `schoolId` is set — so the free row
    // is inert while the school plan runs. This is docs/school-identity.md §5's
    // "their own subscription stays", and it is what makes the refund detach
    // two lines instead of a resurrection: `detachBuyer` nulls a `schoolId` and
    // the teacher is immediately back on the plan they already had.
    //
    // `joinSchoolPlan` DELETES it. The claim must not copy that.
    // -----------------------------------------------------------------------

    return { ok: true as const, alreadyDone: false, schoolId: school.id, urnDropped };
  });
}

/**
 * Record that the money for a school has arrived.
 *
 * Called wherever payment is CONFIRMED — after `transition()` in `invoice.paid`,
 * and in the existing-subscription arm of `checkout.session.completed`. One
 * sentence, two call sites, and no third: `invoice.paid` resolving purely by
 * Stripe ids is sufficient, because both purchase routes persist
 * `stripeSubscriptionId` synchronously before an invoice is ever sent, so there
 * is never a paid invoice whose subscription id we do not already hold.
 *
 * A GUARDED `updateMany where verifiedAt: null` — the same idempotency shape as
 * `freezeSubscription`, so a redelivery cannot double-stamp a date or write a
 * second audit row.
 *
 * IT USES `recordAudit`, WHICH SWALLOWS, AND THAT IS THE REVERSE OF THE CLAIM,
 * ON PURPOSE. In `claimSchool` the grant must not outlive its record, so the
 * audit is transactional. Here the fact being recorded is that a school PAID:
 * the payment must be recognised even if the audit write hiccups, because the
 * failure mode of not recognising it is a paying school locked out of three
 * admin powers it has bought. Fail-open on the record, never on the grant.
 *
 * @returns true if this call is the one that stamped it.
 */
export async function stampVerified(schoolId: string, reason: string): Promise<boolean> {
  const { count } = await db.school.updateMany({
    where: { id: schoolId, verifiedAt: null },
    data: { verifiedAt: new Date() },
  });
  if (count === 0) return false;

  await recordAudit({
    action: "SCHOOL_VERIFIED",
    actorType: "SYSTEM",
    actorName: "System",
    schoolId,
    subjectType: "SCHOOL",
    subjectId: schoolId,
    detail: `Payment confirmed: ${reason}. Class reassignment, staff removal and admin promotion are now open.`,
  });
  return true;
}

/**
 * Has this school's payment been confirmed?
 *
 * A MISSING ROW IS UNVERIFIED. That is rule 8 — deny by default — and it is the
 * whole reason this returns a boolean rather than a School: there is no third
 * answer, and a caller that had to handle "school not found" separately would
 * eventually handle it as "probably fine".
 *
 * Consumers are the three gates in `src/app/actions/admin.ts`:
 * `assignClassToStaff`, `setStaffRole` when the new role is ADMIN, and
 * `removeStaff` when the staff member is ACTIVE. `removeStaff` on an INVITED row
 * stays allowed — that row is a pending invitation and nobody's access.
 */
export async function schoolIsVerified(schoolId: string): Promise<boolean> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { verifiedAt: true },
  });
  return Boolean(school?.verifiedAt);
}

/**
 * On a refund, put the BUYER back where they were and leave the school frozen.
 *
 * Owner decision, 1 Sep 2026 (docs/pricing-decisions.md): a refund detaches the
 * person who paid rather than freezing them alongside the school. They usually
 * had a free account and their own classes before they bought anything, and
 * freezing those leaves them worse off than never having bought — which is not a
 * refund. THE SCHOOL AND EVERY REMAINING MEMBER OF STAFF STAY FROZEN. They did
 * not pay, and nothing here unfreezes them.
 *
 * `School.claimedByTeacherId` is the only thing in the schema that can name the
 * buyer: `customer.subscription.deleted` resolves a Subscription and gets a
 * `schoolId`, and a school has many staff. This function is what that column is
 * for.
 *
 * IT HAS NO FOREIGN KEY, so the id may dangle — the buyer may have deleted their
 * account, or been removed, or moved on to another school. Every branch below
 * treats "not our buyer any more" as a no-op rather than as an error.
 */
export async function detachBuyer(schoolId: string): Promise<boolean> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, claimedByTeacherId: true },
  });
  if (!school?.claimedByTeacherId) return false;

  const buyerId = school.claimedByTeacherId;
  const buyer = await db.teacher.findUnique({
    where: { id: buyerId },
    select: { id: true, name: true, displayName: true, schoolId: true },
  });
  // Deleted, or already somewhere else. Nothing to detach, and moving anybody
  // on the strength of a dangling id is exactly what the missing FK warns about.
  if (!buyer || buyer.schoolId !== schoolId) return false;

  await db.$transaction(async (tx) => {
    // Guarded on the school they are being detached FROM, for the same reason
    // the grant in `claimSchool` is guarded: a webhook redelivery, or a removal
    // that landed between the read above and this write, must lose rather than
    // silently undo itself.
    //
    // `role` IS RESET, WHICH `removeStaff` DOES NOT DO, and the divergence is
    // deliberate. `claimSchool` is what made this person an ADMIN, so undoing
    // the claim undoes the promotion; leaving it set would park a schoolless
    // account carrying ADMIN, which is inert only for as long as every future
    // route into a school sets `role` explicitly. (`removeStaff` leaves a
    // removed admin's `role` in place today. That is a separate question about
    // a different action and is not this change's to answer, but it is the same
    // latent shape and worth someone's attention.)
    await tx.teacher.updateMany({
      where: { id: buyerId, schoolId },
      data: { schoolId: null, role: "TEACHER" },
    });

    // Phase 0's `restoreFreePlan`, which has now landed. It takes the
    // transaction client and MUST commit with the `schoolId` write above: a
    // teacher detached without a free plan has no governing subscription at
    // all, which reads as "no plan yet" on screen while every save fails — a
    // worse state than being frozen. It is idempotent via the unique index on
    // `Subscription.teacherId` rather than a read-then-write, which is what
    // this path needs, being webhook-driven and redelivered.
    //
    // For a school claimed through `claimSchool` this is normally a NO-OP,
    // because the claim deliberately left the buyer's own FREE row in place (see
    // the long comment at the end of `claimSchool`). It exists for a buyer who
    // arrived by some other route and has no row to come back to — and for the
    // day somebody "tidies" the claim into deleting one.
    await restoreFreePlan(tx, buyerId);
  });

  await recordAudit({
    action: "BILLING_DETACHED_ON_REFUND",
    actorType: "SYSTEM",
    actorName: "System",
    schoolId,
    subjectType: "TEACHER",
    subjectId: buyerId,
    detail:
      `${buyer.displayName ?? buyer.name} bought ${school.name} and has been refunded, so their account has ` +
      `left the school and is back on the free teacher plan. The school and its remaining staff stay read-only.`,
  });
  return true;
}
