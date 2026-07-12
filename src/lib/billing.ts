import "server-only";
import type { Subscription } from "@prisma/client";
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
// "The account" is either a single teacher (INDIVIDUAL plan) or the whole school
// (SCHOOL plan). A teacher who belongs to a school with a subscription is
// governed by the SCHOOL subscription; otherwise by their own INDIVIDUAL one.
// The school is always the data controller regardless of who pays (RETENTION.md).
// ---------------------------------------------------------------------------

export type AccountStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "FROZEN";

// The states in which mutations are allowed. FROZEN is deliberately excluded.
export const WRITABLE_STATUSES: readonly AccountStatus[] = ["TRIAL", "ACTIVE", "PAST_DUE"];

// The free "half term" every new account gets from signup. Tracked locally — we
// do NOT use Stripe trials (the Stripe subscription is created only at first
// payment). See RETENTION.md.
export const TRIAL_DAYS = 42;

export function trialEndFromNow(now: number = Date.now()): Date {
  return new Date(now + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

// User-facing refusal copy. Plain English (no jargon — error-string audit).
export const FROZEN_TEACHER_MESSAGE =
  "Your Storyjar plan has paused, so the class jar is read-only. You can still view and download everything — renew your plan to add or change work.";
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
  const trialLapsed =
    status === "TRIAL" && !sub.stripeSubscriptionId && sub.trialEndsAt.getTime() <= Date.now();
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
  kind: "INDIVIDUAL" | "SCHOOL" | null;
  trialDaysLeft: number | null; // whole days remaining while on trial
  frozenAt: Date | null;
  currentPeriodEnd: Date | null;
  seatLimit: number | null;
  writable: boolean;
};

export async function accountStateForTeacher(teacher: TeacherContext): Promise<AccountState> {
  const sub = await governingSubscription(teacher);
  if (!sub) {
    return { status: "NONE", kind: null, trialDaysLeft: null, frozenAt: null, currentPeriodEnd: null, seatLimit: null, writable: false };
  }
  const status = await settleStatus(sub);
  const trialDaysLeft =
    status === "TRIAL"
      ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;
  return {
    status,
    kind: sub.kind === "SCHOOL" ? "SCHOOL" : "INDIVIDUAL",
    trialDaysLeft,
    frozenAt: sub.frozenAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    seatLimit: sub.seatLimit,
    writable: WRITABLE_STATUSES.includes(status),
  };
}

// Short plan label for the admin console / billing page.
export function planLabel(state: Pick<AccountState, "status" | "kind" | "trialDaysLeft">): string {
  if (state.status === "NONE") return "No plan yet";
  if (state.status === "TRIAL") {
    const d = state.trialDaysLeft ?? 0;
    return `Free trial — ${d} day${d === 1 ? "" : "s"} left`;
  }
  if (state.status === "FROZEN") return "Paused (read-only)";
  const base = state.kind === "SCHOOL" ? "School plan" : "Individual plan";
  return state.status === "PAST_DUE" ? `${base} — payment retrying` : base;
}
