import type { Prisma, PrismaClient } from "@prisma/client";
import { restoreFreePlan } from "@/lib/freePlan";

// ===========================================================================
// When a school plan ends, a teacher gets her own account back.
//
// THE RULE, decided by the owner on 8 September 2026 and written up in
// docs/dpo-decisions.md:
//
//   A teacher who had her own StoryJar account before she joined a school gets
//   that account back when the school's plan ends, AND SHE TAKES THE CLASSES SHE
//   ARRIVED WITH. Classes the school gave her, and classes she created as school
//   staff, stay with the school and follow its retention.
//
// WHAT HAPPENED BEFORE THIS FILE, which is the reason it exists. `joinSchoolPlan`
// deletes a teacher's own FREE Subscription row, because exactly one plan should
// govern her. `governingSubscription` then prefers the school's whenever
// `schoolId` is set. So when the school lapsed she went read-only and STAYED
// THAT WAY INDEFINITELY: nothing detached her, nothing restored a plan, and the
// only exit was an admin removing her — which hands her classes to that admin
// first (`removeStaff` → `handOverClasses`). That was not a considered position.
// It was the absence of one.
//
// ---------------------------------------------------------------------------
// THREE THINGS THAT LOOK LIKE DETAILS AND ARE NOT.
// ---------------------------------------------------------------------------
//
// 1. IT FIRES AT THE END OF THE FROZEN WINDOW, NOT ON THE FREEZE.
//
//    RETENTION.md gives a lapsed account twelve read-only months and promises
//    that "reactivation at any point before deletion restores the account
//    intact". Detaching on day 0 would mean a failed card or a late invoice
//    scattered a school's classes across several personal accounts before
//    anybody had phoned the bank — and NOTHING IN THE PRODUCT COULD PUT THEM
//    BACK, because re-paying a subscription does not un-detach a teacher. The
//    twelve months stay reversible; this happens at the end of them, at the
//    moment the school's own data becomes due for deletion rather than before.
//
//    IT MUST THEREFORE RUN BEFORE ANY FUTURE DELETION JOB, not after. The
//    frozen → deletion pipeline is a tracked open item in RETENTION.md and does
//    not exist yet; whoever builds it must call this first, or a teacher's own
//    classes are deleted with the school she happened to be working at.
//
// 2. SHE TAKES ONLY WHAT SHE BROUGHT, AND ONLY IF SHE STILL HOLDS IT.
//
//    `Class.broughtInByTeacherId` is written by `joinSchoolPlan` and by nothing
//    else. The query below reads it TOGETHER WITH `teacherId`: if the school
//    reassigned the class to a colleague, the school exercised control over it
//    and it is the school's. A class with no marking at all — one the school
//    created, or one from before the column existed with no `CLASS_JOINED_SCHOOL`
//    record — stays the school's, which is the more protective of the two
//    failures (SAFEGUARDING rule 8): a teacher may have to ask for classes she
//    can still read, rather than a school's children being handed to one adult
//    by mistake.
//
//    A TEACHER THE SCHOOL ITSELF CREATED therefore keeps her account and her
//    activity library — her own authored work — and no classes. They were never
//    hers. She is told so in words on her account page rather than finding an
//    empty dashboard.
//
// 3. IT IS STATE-BASED AND LAZY, BECAUSE THERE IS NO CRON.
//
//    The same answer parent messaging gave the office-hours hold and the same
//    one `settleStatus` already gives a lapsed trial: nothing depends on a job
//    running. Two paths reach the identical state — this function, called from
//    `requireWritableAccount` when the teacher herself next tries to do
//    something, and the by-state sweep in scripts/freeze-expired.mjs.
//
//    NOT FROM A RENDER, AND NOT FROM `requireWritableAccountForClass`. The
//    doctrine is src/lib/billing.ts's own, written above `writableSchoolPlanWhere`:
//    "a render must not lazily freeze another school's row — that would make a
//    stranger's page view write an audit line into a school she does not belong
//    to". A detach is a far larger write than a freeze — it is a change of
//    CONTROLLER for a class of children's work — so it happens only on the
//    teacher's own authenticated action about her own row. A child adding work
//    reaches `requireWritableAccountForClass`, and that path deliberately does
//    not call this: a nine-year-old handing in a drawing must not be what moves
//    a class between organisations.
//
//    NO `server-only`, NO `@/lib/db`, AND THE PRISMA CLIENT PASSED IN — the same
//    shape as src/lib/urnRelease.ts, which explains it in full. Both request
//    paths and scripts/freeze-expired.mjs have to reach this rule, and the
//    script runs under tsx OUTSIDE Next, where importing `server-only` throws
//    outright. One implementation shared by both is the whole point: a copy in
//    the job would agree on the day it was written and drift afterwards. It is
//    also why the audit rows below are written with `db.auditLog.create` rather
//    than `recordAudit` — that helper is `server-only` too, and reaching for it
//    here would put the rule back out of the job's reach.
// ===========================================================================

/**
 * What this rule needs of a Prisma client, and no more.
 *
 * Structural rather than nominal, so a caller may hand over `@/lib/db`, a
 * script's own `new PrismaClient()`, or a test double — `urnRelease.ts`'s
 * `UrnReleaseClient` for the same reasons.
 */
export type PlanEndClient = Pick<
  PrismaClient,
  "subscription" | "school" | "teacher" | "class" | "auditLog" | "$transaction"
>;

/**
 * How long after a school plan freezes its staff get their own accounts back.
 *
 * RETENTION.md's frozen-account lifecycle: twelve read-only months from lapse,
 * then the school's data is due for deletion. This is the same twelve months,
 * expressed once, because a second copy of a retention period is a second thing
 * to forget when the schedule changes.
 */
export const FROZEN_WINDOW_DAYS = 365;
const FROZEN_WINDOW_MS = FROZEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Has this school's plan been frozen long enough that its staff are owed their own accounts? */
export function windowHasClosed(frozenAt: Date | null | undefined, now: Date = new Date()): boolean {
  // NULL `frozenAt` is not "long ago" — it is "not frozen", or frozen by a path
  // that failed to stamp the column. Deny by default (rule 8): a missing date
  // never starts a clock.
  if (!frozenAt) return false;
  return now.getTime() - frozenAt.getTime() >= FROZEN_WINDOW_MS;
}

export type PlanEndOutcome = {
  /** The teacher's school AFTER this ran: null when they have just been detached. */
  schoolId: string | null;
  /** True only when this call performed the detach. */
  detached: boolean;
  /** How many classes went back with them. */
  classesReturned: number;
};

/**
 * Detach one teacher from a school whose plan ended long enough ago, if it did.
 *
 * Returns the school id to carry on with, so a caller that had one in hand does
 * not act on a value this call has just made false. A no-op for a teacher with
 * no school, a school still inside its frozen window, and a school that is not
 * frozen at all — the overwhelmingly common case, and it costs one indexed read.
 */
export async function settleSchoolPlanEnd(
  db: PlanEndClient,
  teacherId: string,
  schoolId: string | null,
  now: Date = new Date(),
): Promise<PlanEndOutcome> {
  const unchanged = { schoolId, detached: false, classesReturned: 0 };
  if (!schoolId) return unchanged;

  const plan = await db.subscription.findUnique({
    where: { schoolId },
    select: { status: true, frozenAt: true },
  });
  if (plan?.status !== "FROZEN" || !windowHasClosed(plan.frozenAt, now)) return unchanged;

  const school = await db.school.findUnique({ where: { id: schoolId }, select: { name: true } });

  // EVERY WRITE GUARDED ON `schoolId` IN ITS OWN WHERE, not on what was read a
  // few statements ago. The reads above happened outside this transaction and
  // could have changed since — she may have been removed from the school, or the
  // school may have paid. A guarded write matches zero rows in that case and
  // nothing at all happens, which is the right answer.
  let detached = false;
  let returned: { id: string; name: string }[] = [];
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const moved = await tx.teacher.updateMany({
      where: { id: teacherId, schoolId },
      // `role` GOES BACK TO TEACHER WITH THE DETACH, exactly as `removeStaff`
      // and `detachBuyer` do. Rank is not something a person carries between
      // schools, and a schoolless account still carrying ADMIN is inert only for
      // as long as every future route into a school sets `role` explicitly.
      data: { schoolId: null, role: "TEACHER" },
    });
    if (moved.count === 0) return; // Somebody else got there first. Nothing to undo.
    detached = true;

    // Without this she has NO governing subscription at all, which reads as "no
    // plan yet" on screen while every save fails — worse than being frozen, and
    // the reason `restoreFreePlan` exists and takes a transaction client.
    await restoreFreePlan(tx, teacherId);

    // READ THE IDS INSIDE THE TRANSACTION, BEFORE THE UPDATE, and not by asking
    // afterwards which of her classes have no school. The two are the same set
    // today and would stop being so the moment a detached teacher can hold a
    // school-less class for any other reason — at which point the audit rows
    // below would name classes this detach never touched. Read the set you are
    // about to change; do not reconstruct it.
    returned = await tx.class.findMany({
      where: { teacherId, schoolId, broughtInByTeacherId: teacherId },
      select: { id: true, name: true },
    });
    if (returned.length > 0) {
      await tx.class.updateMany({
        where: { id: { in: returned.map((c) => c.id) } },
        data: { schoolId: null, broughtInByTeacherId: null },
      });
    }
  });

  // Nothing committed, so nothing is claimed: the caller's world is left exactly
  // as it was rather than being told about a detach that did not happen.
  if (!detached) return unchanged;
  const classesReturned = returned.length;

  // AUDITED AFTER THE COMMIT, on `removeStaff`'s convention: no audit row may
  // claim something that was rolled back.
  //
  // THE CONTROLLER-CHANGE RECORD. This is the row a data protection lead is
  // looking for when they ask when a class of children's work stopped being the
  // school's, and why. It names no child.
  await db.auditLog.create({
    data: {
      action: "SCHOOL_PLAN_ENDED_TEACHER_DETACHED",
      actorType: "SYSTEM",
      actorName: "System",
      schoolId,
      subjectType: "TEACHER",
      subjectId: teacherId,
      detail:
        `${school?.name ?? "The school"}'s plan ended, so this account is back on the free teacher plan ` +
        `with ${classesReturned === 0 ? "no classes" : `${classesReturned} class${classesReturned === 1 ? "" : "es"}`} ` +
        `they brought with them. Nothing was deleted.`,
    },
  });

  // ONE ROW PER CLASS, and a DISTINCT ACTION rather than `CLASS_ASSIGNED`.
  //
  // src/app/admin/page.tsx builds the "you are temporarily holding a colleague's
  // class" warning by substring-matching the DETAIL of `CLASS_ASSIGNED` rows,
  // newest-wins per class. A row written here under that action would make the
  // flag say something untrue about a class that has left the school entirely.
  // This is the `CLASS_JOINED_SCHOOL` precedent (src/app/actions/billing.ts),
  // which exists for exactly this reason — and this is its mirror image.
  if (classesReturned > 0) {
    for (const klass of returned) {
      await db.auditLog.create({
        data: {
          action: "CLASS_LEFT_SCHOOL",
          actorType: "SYSTEM",
          actorName: "System",
          schoolId,
          subjectType: "CLASS",
          subjectId: klass.id,
          detail: `${klass.name} went back to the teacher who brought it in when ${school?.name ?? "the school"}'s plan ended`,
        },
      });
    }
  }

  return { schoolId: null, detached: true, classesReturned };
}
