import type { Prisma } from "@prisma/client";

// ===========================================================================
// The permanently free teacher plan, and the one way to give somebody one.
//
// LIFTED OUT OF src/lib/billing.ts ON 2026-09-08, and the reason is a dependency
// direction rather than tidiness. `src/lib/schoolPlanEnd.ts` hands a teacher her
// own account back when a school plan ends, so it needs this; and
// `requireWritableAccount` in billing.ts is where that settling happens, so
// billing needs schoolPlanEnd. Left where it was, those two import each other.
// Everything below is unchanged, comments included, and billing.ts re-exports it
// so no caller had to move.
//
// NO `server-only` AND NO `@/lib/db`, WHICH IS THE SECOND HALF OF THE MOVE.
// scripts/freeze-expired.mjs runs under tsx OUTSIDE Next, where importing
// `server-only` throws outright, and it already has a Prisma client of its own.
// So this module takes one rather than reaching for the app's — the same shape
// and the same reasoning as src/lib/urnRelease.ts, which says it in full.
// `restoreFreePlanFor`, the convenience that DID need `@/lib/db`, stays in
// billing.ts where the app's client already lives.
// ===========================================================================

// --- Giving a teacher their own free plan -----------------------------------
//
// The exact row `createTeacherAccount` writes at signup: FREE, ACTIVE, and a
// NULL `trialEndsAt`, which is what encodes "nothing to lapse" (see the module
// header and `settleStatus`). It is one object rather than three literals
// scattered across the callers, because "what a new free teacher plan is" is a
// definition and definitions drift when they are copied.
export const FREE_TEACHER_PLAN = {
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
