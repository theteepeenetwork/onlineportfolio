import "server-only";
import type { Prisma, Subscription } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { releaseUrnIfUnverified } from "@/lib/urnRelease";
import { restoreFreePlan as restoreFreePlanImpl } from "@/lib/freePlan";
import { settleSchoolPlanEnd } from "@/lib/schoolPlanEnd";

// ---------------------------------------------------------------------------
// Billing state + the single server-side write gate.
//
// This module is safeguarding-critical (SAFEGUARDING.md rules 4, 8). It decides,
// for any mutating action, whether the governing account may still WRITE. It
// fails safe: on any uncertainty about the subscription it DENIES.
//
//   Full access:  TRIAL | ACTIVE | PAST_DUE   (PAST_DUE = Stripe smart-retry grace)
//   Read-only:    FROZEN                       (viewing/downloading/export stay open)
//
// "The account" is either a single teacher (FREE plan) or the whole school
// (SCHOOL plan). A teacher who belongs to a school with a subscription is
// governed by the SCHOOL subscription; otherwise by their own FREE one.
// The school is always the data controller regardless of who pays (RETENTION.md).
//
// StoryJar has two plans (docs/pricing-decisions.md): a permanently free teacher
// plan covering all of that teacher's own classes, and a flat £299/yr school
// plan. A FREE plan is ACTIVE from signup and has NOTHING TO LAPSE — no trial
// clock, no payment, so no route to FROZEN. Only a SCHOOL plan can freeze, which
// is the load-bearing half; being evaluated on trial is no longer how a SCHOOL
// plan starts (docs/pricing-decisions.md, 1 September 2026). That means
// children's work in a free teacher account is never on a billing deletion clock
// (RETENTION.md).
// ---------------------------------------------------------------------------

export type AccountStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "FROZEN";

// The states in which mutations are allowed. FROZEN is deliberately excluded.
export const WRITABLE_STATUSES: readonly AccountStatus[] = ["TRIAL", "ACTIVE", "PAST_DUE"];

// The plan a subscription row represents.
export type PlanKind = "FREE" | "SCHOOL";

export function planKindOf(kind: string): PlanKind {
  return kind === "SCHOOL" ? "SCHOOL" : "FREE";
}

// How long a row that is ALREADY on TRIAL has left to run. It is not how a new
// purchase starts: since 1 September 2026 no purchase produces a TRIAL row and no
// school is evaluated on a countdown (docs/pricing-decisions.md). The purchase
// completes ACTIVE either way — the card route's webhook creates the row ACTIVE
// outright, and the invoice route writes ACTIVE immediately so finance sitting on
// a PO cannot freeze a school.
//
// `ensureSchoolSubscription` DOES still open a TRIAL row, on purpose, and that is
// not a contradiction: it is not the purchase. It is the pre-payment holding row
// for a school that exists with no subscription, and TRIAL is the only status
// that keeps every teacher writable in the gap while still leaving a route to
// FROZEN if the money never arrives — `settleStatus` can only freeze a TRIAL row
// with a null `stripeSubscriptionId`, so opening it ACTIVE would mint a
// free-forever school. That line is load-bearing. Do not tidy it.
//
// What is otherwise left for this constant to govern is the rows that already
// carry the status — `prisma/seed.ts`, `seed-test.ts`, the frozen-school persona
// — and the `scripts/freeze-expired.mjs` backstop that settles one of them once
// it lapses. Tracked locally, never as a Stripe trial (the Stripe subscription is
// created only at first payment). See RETENTION.md.
//
// It was never applied to a teacher's free plan: a teacher account is never on a
// countdown, because a trial expiring mid-October is the single most avoidable
// way to lose a September adopter (docs/pricing-decisions.md).
//
// 42 is ALSO the refund window — a school may ask for a full refund within 42
// days of the start of the paid year. They are two different numbers that happen
// to coincide, not one number used twice. Changing this constant must NOT
// silently move the refund window, and moving the refund window must not be done
// by editing this line: the refund promise lives in customer-facing copy
// (src/app/legal/terms/page.tsx, src/app/page.tsx) and is a pricing decision.
export const TRIAL_DAYS = 42;

export function trialEndFromNow(now: number = Date.now()): Date {
  return new Date(now + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

// Launch day. An account created before this was promised free, unlimited access
// permanently ("Founding teacher"). Evaluated ONCE, at signup, and stored on the
// teacher row — never re-derived from `createdAt` later. See
// docs/pricing-decisions.md for why the mark is stored rather than computed.
export const LAUNCH_DAY = new Date("2026-09-01T00:00:00Z");

export function isFoundingSignup(now: number = Date.now()): boolean {
  return now < LAUNCH_DAY.getTime();
}

// User-facing refusal copy. Plain English (no jargon — error-string audit).
export const FROZEN_TEACHER_MESSAGE =
  "Your StoryJar plan has paused, so the class jar is read-only. You can still view and download everything — renew your plan to add or change work.";
export const FROZEN_STUDENT_MESSAGE =
  "Your class jar is paused just now, so new work can’t be added. Please let your teacher know.";

type TeacherContext = { id: string; schoolId: string | null };

// The subscription that governs writes for a teacher context: the school's if
// the teacher belongs to a subscribed school, otherwise the teacher's own.
export async function governingSubscription(teacher: TeacherContext): Promise<Subscription | null> {
  if (teacher.schoolId) {
    const schoolSub = await db.subscription.findUnique({ where: { schoolId: teacher.schoolId } });
    if (schoolSub) return schoolSub;
  }
  return db.subscription.findUnique({ where: { teacherId: teacher.id } });
}

// --- Giving a teacher their own free plan -----------------------------------
//
// MOVED to src/lib/freePlan.ts on 2026-09-08 and re-exported here, so that every
// existing `import { restoreFreePlan } from "@/lib/billing"` still resolves and
// this stays the one place a caller has to think about. The move is a dependency
// direction and nothing else: `requireWritableAccount` below now settles the end
// of a school plan through src/lib/schoolPlanEnd.ts, and that module needs the
// free plan, so leaving the definition here made the two files import each other.
export { restoreFreePlan } from "@/lib/freePlan";

/**
 * `restoreFreePlan` for a caller that has no transaction of its own.
 *
 * A single `upsert` is already one atomic statement, so this does not open a
 * transaction just to wrap it — `db` satisfies `Prisma.TransactionClient`. Use
 * this only when nothing else has to commit alongside the row; if a `schoolId`
 * is changing in the same breath, that is `restoreFreePlan` inside the caller's
 * own transaction and the distinction is the whole point of having two.
 *
 * IT LIVES HERE RATHER THAN BESIDE `restoreFreePlan`, and the split is not
 * arbitrary: this is the only half that needs `@/lib/db`, and freePlan.ts has to
 * stay free of it so scripts/freeze-expired.mjs — which runs outside Next with a
 * client of its own — can import the other half.
 */
export async function restoreFreePlanFor(teacherId: string): Promise<void> {
  await restoreFreePlanImpl(db, teacherId);
}

// Freeze a subscription (make the account read-only) exactly once, and audit it.
// The guarded updateMany means a redelivered webhook or a second concurrent
// request won't double-stamp frozenAt or double-log. Auditing never throws.
//
// AND IT RELEASES A SQUATTED REGISTER CLAIM. This is the shared freeze — the
// lazy trial lapse in `settleStatus` and both of the Stripe webhook's freezing
// events (`customer.subscription.updated` mapping to FROZEN, and
// `customer.subscription.deleted`) all arrive here — so it is the one place
// that sees every freeze the app itself performs. An unverified school gives up
// its `School.urn` at that moment (docs/dpo-decisions.md, 2 Sep 2026); a school
// that paid and later lapsed keeps it. See src/lib/urnRelease.ts for the guard,
// and `scripts/freeze-expired.mjs` for the by-state sweep that catches any path
// that does not come through this function.
//
// INSIDE THE `count > 0` BRANCH, so the release happens on the freeze rather
// than on every redelivery of one. `releaseUrnIfUnverified` is idempotent
// anyway, but a release that ran on every webhook retry would be one more thing
// asserting itself against a paying school's row for no reason.
export async function freezeSubscription(
  sub: Pick<Subscription, "id" | "schoolId">,
  reason: string,
  actor?: { type?: string; id?: string | null; name?: string | null },
): Promise<void> {
  const { count } = await db.subscription.updateMany({
    where: { id: sub.id, status: { not: "FROZEN" } },
    data: { status: "FROZEN", frozenAt: new Date() },
  });
  if (count > 0) {
    await recordAudit({
      action: "BILLING_FROZEN",
      actorType: actor?.type ?? "SYSTEM",
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? "System",
      schoolId: sub.schoolId,
      subjectType: "SUBSCRIPTION",
      subjectId: sub.id,
      detail: `Account frozen (read-only): ${reason}`,
    });
    // A FREE teacher plan has no `schoolId` and no claim to give up. It also has
    // no route to FROZEN at all (see the module header) — this is belt and
    // braces on a branch that should never be reached with a null.
    if (sub.schoolId) await releaseUrnIfUnverified(db, sub.schoolId, reason);
  }
}

// Resolve the *effective* status of a subscription, applying the lazy
// trial-expiry freeze: a trial that has lapsed with no live Stripe subscription
// becomes FROZEN from now (RETENTION.md day 0). This is the "on-request check"
// that complements the daily freeze job — either path reaches the same state.
export async function settleStatus(sub: Subscription): Promise<AccountStatus> {
  const status = sub.status as AccountStatus;
  // Only a SCHOOL plan on trial can lapse. A FREE teacher plan has no trial end
  // (`trialEndsAt` is NULL) and nothing to pay, so there is no route from here to
  // FROZEN — see the module header. The NULL check is the enforcement, not a
  // convenience: if a free row ever acquired a TRIAL status by mistake it still
  // could not be frozen by a missing payment that was never owed.
  const trialLapsed =
    status === "TRIAL" &&
    !sub.stripeSubscriptionId &&
    sub.trialEndsAt !== null &&
    sub.trialEndsAt.getTime() <= Date.now();
  if (trialLapsed) {
    await freezeSubscription(sub, "Trial ended without a subscription");
    return "FROZEN";
  }
  return status;
}

// ---------------------------------------------------------------------------
// THE SAME QUESTION, ASKED IN SQL: is this school's plan one a teacher can be
// handed to?
//
// `settleStatus` above is the answer at the moment of decision, and it is the
// one `joinSchoolPlan` uses, because that is where a write is both allowed and
// wanted. This is its read-only twin, for the three screens that must stop
// ADVERTISING a school the action would refuse: the teacher-area banner, the
// account page's invitation card, and the acceptance screen itself. All three
// are renders. A render must not lazily freeze another school's row — that
// would make a stranger's page view write a `BILLING_FROZEN` audit line into a
// school she does not belong to — so the lapse is expressed as a filter rather
// than performed.
//
// THE TWO MUST AGREE, AND THAT IS THE WHOLE MAINTENANCE BURDEN OF THIS
// FUNCTION. A school this returns but `settleStatus` refuses is a banner
// naming a school the page below it will not join, which is exactly the defect
// the `verifiedAt` clause was added for. So it is derived from
// `WRITABLE_STATUSES` rather than repeating a list of statuses, and the one
// thing it does spell out — the lapsed trial — is `settleStatus`'s `trialLapsed`
// turned inside out. If that condition changes, change this in the same commit.
//
// WRITTEN AS A POSITIVE `OR` RATHER THAN A `NOT`, deliberately. The negated
// form (`NOT (TRIAL AND no stripe id AND trialEndsAt <= now)`) is correct in
// TypeScript and wrong in SQL: `trialEndsAt <= now` is NULL for a row with no
// trial end, so `NOT (… AND NULL)` is NULL, and a perfectly writable ACTIVE
// school would be filtered out by three-valued logic. Every term below compares
// a value that is either non-null or explicitly matched against null.
//
// `kind: "SCHOOL"` IS PART OF IT, not a separate check, because the failure it
// prevents is the same failure: after `joinSchoolPlan` deletes her own FREE
// row, a school with no SCHOOL plan would leave her governed by nothing at all.
// A school with no subscription row at all is excluded too — a relation filter
// on a to-one relation does not match a missing row.
export function writableSchoolPlanWhere(now: Date = new Date()): Prisma.SubscriptionWhereInput {
  return {
    kind: "SCHOOL",
    status: { in: [...WRITABLE_STATUSES] },
    OR: [
      { status: { not: "TRIAL" } },
      { stripeSubscriptionId: { not: null } },
      { trialEndsAt: null },
      { trialEndsAt: { gt: now } },
    ],
  };
}

export type WriteGate =
  | { ok: true; status: AccountStatus }
  | { ok: false; status: AccountStatus | "UNKNOWN" };

// THE write gate. Deny by default: if the governing subscription can't be found
// or read, refuse and return nothing writable (rule 8). Callers translate a
// denial into a frozen error / redirect — never into a partial mutation.
export async function requireWritableAccountForTeacher(teacher: TeacherContext): Promise<WriteGate> {
  let sub: Subscription | null;
  try {
    sub = await governingSubscription(teacher);
  } catch {
    return { ok: false, status: "UNKNOWN" };
  }
  if (!sub) return { ok: false, status: "UNKNOWN" };
  const status = await settleStatus(sub);
  return WRITABLE_STATUSES.includes(status) ? { ok: true, status } : { ok: false, status };
}

// Write gate for an action initiated in the context of a class (e.g. a pupil
// adding work): the class's teacher's account governs. Denies if the class or
// its teacher can't be resolved.
export async function requireWritableAccountForClass(classId: string): Promise<WriteGate> {
  let klass;
  try {
    klass = await db.class.findUnique({
      where: { id: classId },
      select: { teacher: { select: { id: true, schoolId: true } } },
    });
  } catch {
    return { ok: false, status: "UNKNOWN" };
  }
  if (!klass?.teacher) return { ok: false, status: "UNKNOWN" };
  return requireWritableAccountForTeacher(klass.teacher);
}

// Convenience for teacher-only server actions: reads the session and gates.
// Returns the resolved teacher context alongside the gate so callers needn't
// re-read the session.
//
// AND IT IS THE ONE PLACE IN A REQUEST THAT SETTLES THE END OF A SCHOOL PLAN.
//
// A school whose plan froze more than the retention window ago owes its staff
// their own accounts back, with the classes they arrived with
// (src/lib/schoolPlanEnd.ts; owner decision, 8 September 2026). Like the lapsed
// trial in `settleStatus`, that is resolved from STATE on request rather than by
// a job, because this repository has no cron and a rule that depends on one is a
// rule that silently stops.
//
// HERE AND NOWHERE ELSE IN A REQUEST PATH, for the reason written above
// `writableSchoolPlanWhere`: a render must not lazily write into a school, and a
// detach is a much larger write than a freeze — it is a change of CONTROLLER for
// a class of children's work. This function is session-based and teacher-only,
// so the actor is the teacher herself and the row is her own, which is the one
// shape where the write is both allowed and wanted. `requireWritableAccountForClass`
// deliberately does not call it: that path is reached by a CHILD handing work in,
// and a nine-year-old submitting a drawing must not be what moves a class between
// organisations.
//
// SETTLED BEFORE THE GATE, not after, and the returned school id is used rather
// than the session's: a teacher detached by this call is on her own free plan
// from this moment and her save should go through, not be refused by the frozen
// school she has just stopped belonging to.
export async function requireWritableAccount(): Promise<
  { ok: true; status: AccountStatus; teacher: TeacherContext } | { ok: false; status: AccountStatus | "UNKNOWN" }
> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return { ok: false, status: "UNKNOWN" };
  const { schoolId } = await settleSchoolPlanEnd(db, user.teacher.id, user.teacher.schoolId);
  const teacher = { id: user.teacher.id, schoolId };
  const gate = await requireWritableAccountForTeacher(teacher);
  return gate.ok ? { ok: true, status: gate.status, teacher } : gate;
}

// --- Read-only view helpers (for the banner / billing page) -----------------

export type AccountState = {
  status: AccountStatus | "NONE";
  kind: PlanKind | null;
  trialDaysLeft: number | null; // whole days remaining on a SCHOOL plan still on TRIAL
  frozenAt: Date | null;
  currentPeriodEnd: Date | null;
  writable: boolean;
};

export async function accountStateForTeacher(teacher: TeacherContext): Promise<AccountState> {
  const sub = await governingSubscription(teacher);
  if (!sub) {
    return { status: "NONE", kind: null, trialDaysLeft: null, frozenAt: null, currentPeriodEnd: null, writable: false };
  }
  const status = await settleStatus(sub);
  const trialDaysLeft =
    status === "TRIAL" && sub.trialEndsAt !== null
      ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;
  return {
    status,
    kind: planKindOf(sub.kind),
    trialDaysLeft,
    frozenAt: sub.frozenAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    writable: WRITABLE_STATUSES.includes(status),
  };
}

// Short plan label for the admin console / billing page.
//
// A free teacher plan says "Free plan" with no qualifier — no countdown, no
// "upgrade" nag in the label itself. It is a finished state, not a waiting room.
export function planLabel(state: Pick<AccountState, "status" | "kind" | "trialDaysLeft">): string {
  if (state.status === "NONE") return "No plan yet";
  if (state.kind === "FREE") return "Free plan";
  if (state.status === "TRIAL") {
    const d = state.trialDaysLeft ?? 0;
    return `School plan — ${d} day${d === 1 ? "" : "s"} left to try`;
  }
  if (state.status === "FROZEN") return "Paused (read-only)";
  return state.status === "PAST_DUE" ? "School plan — payment retrying" : "School plan";
}
