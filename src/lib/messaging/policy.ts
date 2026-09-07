import "server-only";
import { db } from "@/lib/db";
import {
  DEFAULT_TIMEZONE,
  hasAnyOpening,
  isClosureDate,
  validateWindow,
  windowErrorMessage,
  WEEKDAY_NAMES,
  type DayWindow,
  type Policy,
} from "./officeHours";
import { recomputeHeldDeliveries } from "./threads";

// ===========================================================================
// A school's parent-messaging settings (SAFEGUARDING.md rule 21).
//
// Three questions, each answered in exactly one place so they cannot drift:
//
//   • Is messaging available to this school at all?  → onSchoolPlan
//     Only a SCHOOL subscription. A free teacher account has no school, so
//     there is nobody to set the hours and no oversight to be had; the feature
//     is absent for them (docs/pricing-decisions.md, the 2026-09-07 decision).
//   • Has the school switched it on, and when is it open?  → enabled, policy
//   • May THIS member of staff read and reply to parents?  → resolveMayMessageParents
//
// Writes go through the functions at the foot of the file, every one of which
// re-runs StoryJar's caps server-side and recomputes every held message in the
// school in the same transaction (threads.ts). The admin form is a convenience;
// this file is the rule.
// ===========================================================================

export type StaffMessaging = { role: string; mayMessageParents: boolean | null };

/**
 * NULL means the default for the role: a TEACHER or ADMIN may, a TA may not.
 * True or false is an admin's override from the Staff tab. Never read the
 * column raw — this is the only place the rule lives (cf. resolveAgeMode).
 */
export function resolveMayMessageParents(staff: StaffMessaging): boolean {
  if (staff.mayMessageParents === true) return true;
  if (staff.mayMessageParents === false) return false;
  return staff.role === "TEACHER" || staff.role === "ADMIN";
}

export type SchoolMessaging = {
  /** The school has a SCHOOL subscription, whatever its status. */
  onSchoolPlan: boolean;
  enabled: boolean;
  policyId: string | null;
  policy: Policy;
  closures: Array<{ id: string; date: string; label: string }>;
  updatedAt: Date | null;
};

const EMPTY_POLICY: Policy = { windows: [], closures: [], timezone: DEFAULT_TIMEZONE };

/** Everything the admin screen and the send gate need to know about a school. */
export async function schoolMessaging(schoolId: string): Promise<SchoolMessaging> {
  const [sub, row] = await Promise.all([
    db.subscription.findUnique({ where: { schoolId }, select: { kind: true } }),
    db.messagingPolicy.findUnique({
      where: { schoolId },
      include: { windows: { orderBy: { weekday: "asc" } }, closures: { orderBy: { date: "asc" } } },
    }),
  ]);
  const onSchoolPlan = sub?.kind === "SCHOOL";
  if (!row) {
    return { onSchoolPlan, enabled: false, policyId: null, policy: EMPTY_POLICY, closures: [], updatedAt: null };
  }
  return {
    onSchoolPlan,
    enabled: row.enabled,
    policyId: row.id,
    policy: {
      timezone: row.timezone,
      windows: row.windows.map((w) => ({ weekday: w.weekday, openMinute: w.openMinute, closeMinute: w.closeMinute })),
      closures: row.closures.map((c) => c.date),
    },
    closures: row.closures.map((c) => ({ id: c.id, date: c.date, label: c.label })),
    updatedAt: row.updatedAt,
  };
}

/**
 * Can a message be SENT in this school right now (before the office-hours
 * question)? True only on a school plan with messaging switched on and at
 * least one usable window. The account's writable state is the caller's to
 * check, because it needs a teacher or class context this function has not got.
 */
export function messagingOpenForSending(s: SchoolMessaging): boolean {
  return s.onSchoolPlan && s.enabled && hasAnyOpening(s.policy);
}

// ---------------------------------------------------------------------------
// Writes. Admin-only; the caller has already been through requireAdmin().
// ---------------------------------------------------------------------------

export type WindowsInput = { enabled: boolean; windows: DayWindow[] };

/** Plain-English refusal, or null when every window is inside the caps. */
export function validateWindows(windows: DayWindow[]): string | null {
  const seen = new Set<number>();
  for (const w of windows) {
    const err = validateWindow(w);
    if (err) {
      const day = Number.isInteger(w.weekday) && w.weekday >= 0 && w.weekday <= 6 ? ` (${WEEKDAY_NAMES[w.weekday]})` : "";
      return `${windowErrorMessage(err)}${day}`;
    }
    if (seen.has(w.weekday)) return `${WEEKDAY_NAMES[w.weekday]} is listed twice.`;
    seen.add(w.weekday);
  }
  return null;
}

/**
 * Replace the school's windows and switch, then recompute every held message
 * under the new policy, all in one transaction. Returns the number of held
 * messages whose delivery time moved, for the audit row.
 */
export async function saveWindows(schoolId: string, input: WindowsInput, byTeacherId: string): Promise<{ error?: string; moved?: number }> {
  const error = validateWindows(input.windows);
  if (error) return { error };

  const moved = await db.$transaction(async (tx) => {
    const policy = await tx.messagingPolicy.upsert({
      where: { schoolId },
      create: { schoolId, enabled: input.enabled, updatedByTeacherId: byTeacherId },
      update: { enabled: input.enabled, updatedByTeacherId: byTeacherId },
      include: { closures: { select: { date: true } } },
    });
    await tx.officeHourWindow.deleteMany({ where: { policyId: policy.id } });
    if (input.windows.length > 0) {
      await tx.officeHourWindow.createMany({
        data: input.windows.map((w) => ({ policyId: policy.id, weekday: w.weekday, openMinute: w.openMinute, closeMinute: w.closeMinute })),
      });
    }
    const effective: Policy | null = input.enabled
      ? { timezone: policy.timezone, windows: input.windows, closures: policy.closures.map((c) => c.date) }
      : null;
    return recomputeHeldDeliveries(tx, schoolId, effective);
  });
  return { moved };
}

export async function addClosure(schoolId: string, date: string, label: string, byTeacherId: string): Promise<{ error?: string }> {
  if (!isClosureDate(date)) return { error: "Pick a date for the closure." };
  const cleanLabel = label.trim().slice(0, 40);
  await db.$transaction(async (tx) => {
    const policy = await tx.messagingPolicy.upsert({
      where: { schoolId },
      create: { schoolId, updatedByTeacherId: byTeacherId },
      update: { updatedByTeacherId: byTeacherId },
      include: { windows: true, closures: { select: { date: true } } },
    });
    await tx.officeHoursClosure.upsert({
      where: { policyId_date: { policyId: policy.id, date } },
      create: { policyId: policy.id, date, label: cleanLabel },
      update: { label: cleanLabel },
    });
    const closures = Array.from(new Set([...policy.closures.map((c) => c.date), date]));
    const effective: Policy | null = policy.enabled
      ? { timezone: policy.timezone, windows: policy.windows, closures }
      : null;
    await recomputeHeldDeliveries(tx, schoolId, effective);
  });
  return {};
}

export async function removeClosure(schoolId: string, closureId: string, byTeacherId: string): Promise<{ removed: boolean }> {
  return db.$transaction(async (tx) => {
    // Scoped by school through the policy: a closure id from another school
    // matches nothing and nothing is deleted (rule 8).
    const closure = await tx.officeHoursClosure.findFirst({
      where: { id: closureId, policy: { schoolId } },
      include: { policy: { include: { windows: true, closures: { select: { date: true } } } } },
    });
    if (!closure) return { removed: false };
    await tx.officeHoursClosure.delete({ where: { id: closure.id } });
    await tx.messagingPolicy.update({ where: { id: closure.policyId }, data: { updatedByTeacherId: byTeacherId } });
    const closures = closure.policy.closures.map((c) => c.date).filter((d) => d !== closure.date);
    const effective: Policy | null = closure.policy.enabled
      ? { timezone: closure.policy.timezone, windows: closure.policy.windows, closures }
      : null;
    await recomputeHeldDeliveries(tx, schoolId, effective);
    return { removed: true };
  });
}

/** Staff of a school who may message families: the admin's pickers. */
export async function messagingStaffForSchool(schoolId: string): Promise<Array<{ id: string; name: string }>> {
  const staff = await db.teacher.findMany({
    where: { schoolId, status: "ACTIVE" },
    select: { id: true, name: true, displayName: true, role: true, mayMessageParents: true },
    orderBy: { name: "asc" },
  });
  return staff.filter(resolveMayMessageParents).map((t) => ({ id: t.id, name: t.displayName ?? t.name }));
}

/** An admin's per-staff override; null puts the role default back. */
export async function setStaffMayMessage(schoolId: string, staffId: string, value: boolean | null): Promise<{ ok: boolean; name?: string }> {
  const staff = await db.teacher.findFirst({ where: { id: staffId, schoolId }, select: { id: true, name: true } });
  if (!staff) return { ok: false };
  await db.teacher.update({ where: { id: staff.id }, data: { mayMessageParents: value } });
  return { ok: true, name: staff.name };
}
