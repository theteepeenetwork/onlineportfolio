import "server-only";
import type { Prisma, Subscription } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

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
// The exact row `createTeacherAccount` writes at signup: FREE, ACTIVE, and a
// NULL `trialEndsAt`, which is what encodes "nothing to lapse" (see the module
// header and `settleStatus`). It is one object rather than three literals
// scattered across the callers, because "what a new free teacher plan is" is a
// definition and definitions drift when they are copied.
const FREE_TEACHER_PLAN = {
  kind: "FREE",
  status: "ACTIVE",
  trialEndsAt: null,
  // Cleared as well as the status: `frozenAt` is what starts RETENTION.md's
  // 12-month deletion clock, so an account that is writable again must not
  // still be counting down towards erasure.
  frozenAt: null,
} as const;

/**
 * Give a teacher the permanently free plan that governs their own classes.
 *
 * WHY THIS EXISTS. `Subscription` is the only thing that answers "may this
 * account write". A teacher whose `schoolId` is set to NULL without one has no
 * governing subscription at all, and the consequences compound in the wrong
 * direction: `requireWritableAccountForTeacher` denies by default (rule 8,
 * correctly), but `accountStateForTeacher` reports status "NONE", so the frozen
 * banner — which tests for "FROZEN" — never renders, and `planLabel` says "No
 * plan yet". The teacher sees a working app in which every save fails and
 * nothing on screen explains why. That is worse than being frozen, and it is
 * the bug this closes.
 *
 * TAKES A TRANSACTION CLIENT AND MUST BE CALLED INSIDE ONE, for the same reason
 * `handOverClasses` (src/lib/classHandover.ts) does: it has to commit with the
 * detach that made it necessary. If the `schoolId` update commits and this does
 * not, the state left behind is worse than the state before. Use
 * `restoreFreePlanFor` when there is no surrounding transaction to join.
 *
 * IDEMPOTENT BY `upsert` ON `Subscription.teacherId`'s UNIQUE INDEX, not by
 * reading first and then writing. A read-then-write is a race: two callers can
 * both see no row and both create one, and the loser fails on the constraint
 * mid-transaction. The unique index is the whole guarantee and it holds against
 * any caller, present or future. The shape was chosen with one PLANNED caller in
 * mind — the refund detach in `docs/paid-tier-plan.md`'s runway, which is
 * webhook-driven and therefore redelivered — but that path is NOT BUILT in this
 * tree today, and the idempotence does not depend on it existing.
 *
 * The update branch writes the free-plan values rather than doing nothing,
 * because a row in any other state is not yet a working free plan. It leaves
 * `stripeCustomerId` / `stripeSubscriptionId` alone: those name something that
 * exists on Stripe's side, and this function has no standing to orphan it.
 *
 * IT DOES NOT AUDIT, deliberately. The caller does, because the reason differs:
 * signing up and being removed from a school are two different sentences in a
 * school's audit log — a refunded purchase would be a third — and only the
 * caller knows which.
 */
export async function restoreFreePlan(
  tx: Prisma.TransactionClient,
  teacherId: string,
): Promise<void> {
  await tx.subscription.upsert({
    where: { teacherId },
    create: { ...FREE_TEACHER_PLAN, teacherId },
    update: { ...FREE_TEACHER_PLAN },
  });
}

/**
 * `restoreFreePlan` for a caller that has no transaction of its own.
 *
 * A single `upsert` is already one atomic statement, so this does not open a
 * transaction just to wrap it — `db` satisfies `Prisma.TransactionClient`. Use
 * this only when nothing else has to commit alongside the row; if a `schoolId`
 * is changing in the same breath, that is `restoreFreePlan` inside the caller's
 * own transaction and the distinction is the whole point of having two.
 */
export async function restoreFreePlanFor(teacherId: string): Promise<void> {
  await restoreFreePlan(db, teacherId);
}

// Freeze a subscription (make the account read-only) exactly once, and audit it.
// The guarded updateMany means a redelivered webhook or a second concurrent
// request won't double-stamp frozenAt or double-log. Auditing never throws.
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
export async function requireWritableAccount(): Promise<
  { ok: true; status: AccountStatus; teacher: TeacherContext } | { ok: false; status: AccountStatus | "UNKNOWN" }
> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return { ok: false, status: "UNKNOWN" };
  const teacher = { id: user.teacher.id, schoolId: user.teacher.schoolId };
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
