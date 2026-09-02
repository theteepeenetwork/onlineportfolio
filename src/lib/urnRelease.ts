import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// GIVING A SQUATTED REGISTER ENTRY BACK
//
// Owner decision, docs/dpo-decisions.md 2 September 2026: when a school that
// has NEVER been verified reaches FROZEN, its `School.urn` is set to null. The
// school row, its staff, its classes and every child's work are untouched.
// Only the claim on the DfE register entry is given up.
//
// THE GAP THIS CLOSES. Raising a purchase order costs the person raising it
// nothing up front, and signup verifies no email address (F67), so anybody
// could claim any school in the register. Until this existed, nothing ever
// released the claim afterwards: an unpaid school lapsed to FROZEN and held
// that register entry for ever, with no operator action to clear one.
// Repeatable across every URN in the country, at no cost, and only the founder
// could clean it up.
//
// ONLY AN UNVERIFIED SCHOOL, AND THE GUARD DENIES BY DEFAULT. A school that
// paid and later lapsed has a real claim and keeps it. `verifiedAt` is exactly
// the line between the two — that is what the column is for — and if this
// module cannot read the row it releases NOTHING. Taking a paying customer's
// identity away on a failed read is the worse error of the two, and it is not
// reversible by anything the customer can do.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS INSTEAD OF LIVING IN src/lib/schoolClaim.ts
//
// `schoolClaim.ts` is where a reader would look first, and it is where the
// WRITE would have gone, but it opens with `import "server-only"` — so it
// throws the moment anything outside the Next server graph imports it, and
// `scripts/freeze-expired.mjs` is exactly that: a standalone daily job wired to
// a scheduler, running on its own Prisma client with no request behind it.
//
// There are two paths to FROZEN and they must not disagree, so the choice was
// one shared implementation or two copies. This module is the shape the repo
// already uses for that problem — `src/lib/mailSuppressionSync.ts`, which the
// in-app scheduler and `scripts/mail-suppression-sync.ts` both import: no
// `server-only`, no `@/lib/db`, and the Prisma client passed IN. That is what
// lets the daily job and the webhook run the same code.
//
// It also means this module is directly testable, which is the point of the
// pattern rather than a side effect.
//
// THE AUDIT IS WRITTEN THROUGH THE INJECTED CLIENT, NOT `recordAudit`, for the
// same reason: `@/lib/audit` is server-only too. The swallow-on-failure
// behaviour is copied here deliberately, because it is right for the same
// reason it is right there — the release must not be undone by a logging
// hiccup, and the caller is a freeze that has already happened.
//
// NOTHING HERE READS A CHILD. It touches School, Subscription and AuditLog.
// ---------------------------------------------------------------------------

/**
 * The audit action written when a claim is given up.
 *
 * A named export rather than a string literal at the call site because two
 * places assert on it — the security spec and anybody reading a school's
 * timeline — and "why can I claim this school now when I could not last week"
 * is a question somebody will ask with the audit log open.
 */
export const SCHOOL_URN_RELEASED = "SCHOOL_URN_RELEASED";

/**
 * The slice of Prisma this module needs. Declared structurally so a caller can
 * hand over `@/lib/db`, a script's own `new PrismaClient()`, or a test double,
 * and so the module cannot quietly grow a reach into a table it has no business
 * in — adding one here is a visible edit.
 */
export type UrnReleaseClient = Pick<PrismaClient, "school" | "auditLog"> & {
  subscription?: PrismaClient["subscription"];
};

/**
 * Release the register claim of ONE school, if and only if it was never
 * verified.
 *
 * Idempotent, and idempotent the same way `freezeSubscription` and
 * `stampVerified` are: the state that must be true is repeated in the WHERE, so
 * a redelivered webhook, a concurrent request and the daily job cannot between
 * them write two audit rows for one release.
 *
 * The URN is read first because `updateMany` cannot return what it overwrote
 * and the audit line has to name it. That read-then-guarded-write is not a race:
 * the URN read is put back into the WHERE, so if anything moved in between,
 * `count` is 0, nothing is audited, and this call did nothing.
 *
 * @returns the URN that was given up, or null if nothing was released — a
 *          verified school, a school with no URN, a school already released, a
 *          school that is not there, or a read that failed.
 */
export async function releaseUrnIfUnverified(
  db: UrnReleaseClient,
  schoolId: string,
  reason: string,
): Promise<string | null> {
  // DENY BY DEFAULT. Everything below this line depends on knowing that
  // `verifiedAt` is null, so a read that throws releases nothing.
  let school: { urn: string | null; verifiedAt: Date | null } | null;
  try {
    school = await db.school.findUnique({
      where: { id: schoolId },
      select: { urn: true, verifiedAt: true },
    });
  } catch {
    return null;
  }

  if (!school) return null; // a school we cannot establish anything about
  if (school.verifiedAt !== null) return null; // paid once: the claim is theirs
  if (school.urn === null) return null; // a free-text school claims no entry

  const urn = school.urn;
  const { count } = await db.school.updateMany({
    // `verifiedAt: null` and `urn` are both repeated here on purpose. The first
    // is the decision; the second makes the whole thing a compare-and-swap.
    where: { id: schoolId, verifiedAt: null, urn },
    data: { urn: null },
  });
  if (count === 0) return null;

  // Swallows, like `recordAudit` does. The release has already committed and a
  // failure to describe it must not turn a freeze into a 500.
  try {
    await db.auditLog.create({
      data: {
        action: SCHOOL_URN_RELEASED,
        actorType: "SYSTEM",
        actorName: "System",
        schoolId,
        subjectType: "SCHOOL",
        subjectId: schoolId,
        // The URN is IN THE DETAIL deliberately: once the column is null this
        // row is the only record of which register entry was given up, and
        // without it nobody can answer why the entry became claimable again.
        // It is not personal data — it identifies an institution and the DfE
        // publishes it under the Open Government Licence.
        detail: `Register claim released: URN ${urn} is available again because this school was never verified (${reason}).`,
      },
    });
  } catch {
    // Nothing. The claim is released either way.
  }

  return urn;
}

/**
 * Every school that is FROZEN, unverified and still holding a URN.
 *
 * THE BACKSTOP, and it exists because "find every path to FROZEN" is a claim
 * about code that is true today and stops being true the moment somebody adds a
 * fourth one. `releaseUrnIfUnverified` fires at the moment of the freeze, which
 * is where an audit line belongs; this sweeps by STATE, so a path nobody wired
 * it into still ends up in the right place within a day.
 *
 * It is the same relationship `scripts/freeze-expired.mjs` already has with the
 * lazy freeze in `settleStatus`: two routes to one state, neither trusted to be
 * the only one.
 *
 * Safe to run repeatedly — every release underneath it is guarded and audits
 * once — and safe to run on a database where nothing is wrong, which is what it
 * will normally find.
 */
export async function sweepFrozenUnverifiedUrns(
  db: UrnReleaseClient & { subscription: PrismaClient["subscription"] },
  reason: string,
): Promise<string[]> {
  const frozen = await db.subscription.findMany({
    where: {
      status: "FROZEN",
      schoolId: { not: null },
      // The claim columns live on School, so the filter that matters is here.
      school: { is: { verifiedAt: null, urn: { not: null } } },
    },
    select: { schoolId: true },
  });

  const released: string[] = [];
  for (const sub of frozen) {
    if (!sub.schoolId) continue;
    const urn = await releaseUrnIfUnverified(db, sub.schoolId, reason);
    if (urn) released.push(urn);
  }
  return released;
}
