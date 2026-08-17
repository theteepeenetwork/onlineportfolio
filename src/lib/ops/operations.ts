import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { allowCodeLookup, recordCodeMiss, RATE_LIMITED_MESSAGE } from "@/lib/rateLimit";
import { makeFamilyCode } from "@/lib/familyCodeMint";
import { recordOpsAudit } from "@/lib/ops/audit";
import { requireOperator } from "@/lib/ops/session";
import { maskEmail, reasonProblem } from "@/lib/ops/dto";
import {
  OPS_OPERATIONS,
  OPS_OPERATION_FAILED_MESSAGE,
  OPS_REPEAT_MESSAGE,
  opsIdempotencyKey,
  type OpsOperationSpec,
} from "@/lib/ops/registry";

// ---------------------------------------------------------------------------
// The only module under the ops roots that changes anything (PR4).
// ---------------------------------------------------------------------------
//
// The list of what may happen here is `src/lib/ops/registry.ts`, and it is
// closed. This file implements that list and nothing else. The blindness gate
// enforces the "and nothing else" half structurally: rule OPS-MUTATION-MODULE
// refuses a Prisma write anywhere else under the ops roots, on any model that
// is not the operator's own, so an operation added as a function in a screen or
// an action is a failing build rather than a code review someone might miss.
//
// It is also the fourth module permitted to import the Prisma client, which is
// a widening of that gate recorded in the same commit as this file, with
// fixtures. reads.ts is the read chokepoint and routing a write through it
// would make its name a lie; audit.ts writes one row and must keep doing only
// that; session.ts is the door. See DECLARED_DB_MODULES in the gate.
//
// WHAT AN OPERATOR MAY NOT DO HERE, WRITTEN DOWN SO AN OMISSION IS NOT MISTAKEN
// FOR AN OVERSIGHT
//
//   - Impersonation, session minting, password or PIN setting. Permanently out
//     of scope. The gate makes several spellings of it a build failure.
//   - Changing an adult's email address, for staff or for parents. Owner
//     decision D9 (docs/ops-architecture.md, 17 August 2026). Change the
//     address, trigger a sign-in email, become that teacher, reach that class's
//     children: every step is legitimate on its own, which is exactly why no
//     gate catches the sequence. The remedy for a mistyped address is that the
//     teacher changes it themselves or a school admin re-invites them. The gate
//     is what keeps this true rather than a comment: `parent.update` is
//     permitted here in ONE shape, `data: { familyCode: makeFamilyCode() }`,
//     and `data: { email: ... }` fails the build.
//   - Rotating a class code. See the note below.
//   - Reading a credential value. Rotation replaces one without returning it.
//   - Deleting anything (ruling R12: no deletion before a rehearsed restore).
//
// WHY THERE IS NO "ROTATE A CLASS CODE" HERE, THOUGH IT WAS ASKED FOR
//
// A leaked class code is a real safeguarding incident, and rotation is the
// remedy. The teacher already has that button on their own class page
// (rotateClassCode in src/app/actions/classes.ts), and the reason the operator
// does not is not squeamishness about the mutation. It is that the operator
// would first have to pick a class.
//
// Nothing in the operator area can see a class, and that is deliberate: `Class`
// is classified AGGREGATE_ONLY, and `classId` is refused as an identifier
// anywhere under the ops roots, because a per-class figure in a class of one
// names that child (ruling R10, amendment C3). To offer this operation the area
// would need a list of classes to choose from, which means class names and
// class ids on an operator screen. That is a widening of what the operator can
// SEE, not of a call shape, and it buys a duplicate of a button the person who
// owns the class already has.
//
// The two shapes that avoid a class list were considered and are worse. Every
// class code at a school, keyed on the school id alone, is blind but takes a
// whole school's children offline until every teacher reprints, from a support
// call, over one leaked code. Every class code belonging to one teacher cannot
// even be written: the column is unique, so one updateMany cannot give each
// class a different code, and doing it per class means reading the classes.
//
// The gap this leaves, honestly: a class code belonging to a teacher who has
// left cannot be rotated by anybody, because rotateClassCode is scoped to the
// acting teacher. That is a missing capability in the SCHOOL console, where an
// admin can be given it against a class in their own school, and it should be
// fixed there. It is not an argument for giving the platform a class list.
//
// EVERY OPERATION RESOLVES THE OPERATOR ITSELF, exactly as reads.ts does: the
// actor written into the audit row comes from the resolved session and never
// from an argument, and a future caller that forgets the guard gets a 404
// rather than a mutation.

/** The handle inside `db.$transaction`. Carries the same delegates, no nesting. */
type Tx = Prisma.TransactionClient;

export type OpsOperationOutcome =
  | {
      ok: true;
      message: string;
      /** Present only for a disclosure. The value the operator asked to see. */
      shown?: string;
    }
  | { ok: false; message: string };

/**
 * The subject was not there, or is not something this operation can act on.
 *
 * Thrown rather than returned so it aborts the transaction on the way out, and
 * caught by perform() below. Deny by default: the operator is told the record
 * is not available and nothing distinguishes "no such row" from "a row this
 * cannot act on", because both mean the same thing to them.
 */
class SubjectNotAvailable extends Error {}

/**
 * The audit row could not be written, so the operation must not stand.
 *
 * Wrapping it is what makes the two cases distinguishable without reading a
 * database error message and hoping it keeps its wording: a P2002 on this write
 * is the idempotency key, because it is the only unique column on OpsAuditLog
 * that anything supplies a value for.
 */
class AuditWriteFailed extends Error {
  // Named `underlying` rather than `cause`: Error already carries an optional
  // `cause`, and shadowing it with a required field of a different shape is a
  // subtlety nobody needs to think about at the point of a rollback.
  constructor(readonly underlying: unknown) {
    super("The operator audit row could not be written.");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

const NOT_AVAILABLE_MESSAGE =
  "That record is not available. Look the adult up again: the row may have gone since you found it.";

/**
 * Run one named operation: the change, its audit row, one transaction.
 *
 * HANDBOOK RULING R5, and the two things it takes to actually mean it
 *
 * "Mutation and recordOpsAudit in one db.$transaction. The audit row carries a
 * unique idempotency key so QA can force a real constraint violation. No
 * production-reachable fault flag, ever."
 *
 * 1. ONE TRANSACTION. recordOpsAudit throws where recordAudit swallows, and
 *    that alone is not enough: an audit written after a mutation throws too
 *    late, when the change has already happened and cannot be taken back. Both
 *    writes go through the same handle, so either both land or neither does.
 *
 * 2. THE WORK RUNS FIRST, THE AUDIT SECOND, inside that transaction. The order
 *    does not matter for atomicity and it matters a great deal for proof: with
 *    the audit last, a forced audit failure has a real mutation to roll back,
 *    and the blocking spec can assert the family code is unchanged afterwards.
 *    With the audit first, a failure would prove only that the first statement
 *    failed.
 *
 * There is no fault flag anywhere in this path and there must never be one. The
 * failure is forced by doing the same operation twice with the same stated
 * reason, which produces the same idempotency key and a genuine unique-index
 * violation from SQLite. See src/lib/ops/registry.ts for why that key is
 * derived rather than random, and why refusing the repeat is the right product
 * behaviour on its own terms.
 */
async function perform(
  op: OpsOperationSpec,
  subjectId: string,
  reason: string,
  work: (tx: Tx) => Promise<{ detail: string; shown?: string }>,
): Promise<OpsOperationOutcome> {
  const who = await requireOperator();

  // The server re-validates and is authoritative (ruling R16). The action layer
  // checks this too, for the person; this check is the one an attacker cannot
  // skip by posting to the endpoint directly.
  const problem = reasonProblem(reason);
  if (problem) return { ok: false, message: problem };

  if (!subjectId.trim()) return { ok: false, message: NOT_AVAILABLE_MESSAGE };

  // Throttled on the operator, not on a network address: there is one account
  // and it is already authenticated, so the risk here is a stolen session
  // working through records rather than a stranger at the door. Every attempt
  // consumes budget, whether or not it succeeded, because unlike a code lookup
  // a successful operation is not evidence of good faith that should refill it.
  // Over budget this trickles rather than blocks (one attempt per five
  // seconds), so an operator dealing with an incident is slowed and never
  // locked out.
  const budgetKey = `ops-operation:${who.id}`;
  if (!allowCodeLookup(budgetKey)) return { ok: false, message: RATE_LIMITED_MESSAGE };
  recordCodeMiss(budgetKey);

  const idempotencyKey = opsIdempotencyKey({
    action: op.id,
    actorId: who.id,
    subjectId,
    reason,
  });

  try {
    const done = await db.$transaction(async (tx) => {
      const result = await work(tx);
      try {
        await recordOpsAudit(
          {
            actorId: who.id,
            actorName: who.email,
            action: op.id,
            subjectType: op.subjectType,
            subjectId,
            // Verbatim, exactly as typed, capped at 1000 characters.
            reason,
            detail: result.detail,
            idempotencyKey,
          },
          tx,
        );
      } catch (error) {
        throw new AuditWriteFailed(error);
      }
      return result;
    });
    return { ok: true, message: op.doneMessage, shown: done.shown };
  } catch (error) {
    if (error instanceof SubjectNotAvailable) return { ok: false, message: NOT_AVAILABLE_MESSAGE };
    if (error instanceof AuditWriteFailed && isUniqueViolation(error.underlying)) {
      return { ok: false, message: OPS_REPEAT_MESSAGE };
    }
    // Everything else, including the vanishingly unlikely case of a newly
    // minted code colliding with one already in use: the transaction rolled
    // back, so the honest thing to say is that nothing changed. Nothing is
    // logged here on purpose. The only values in scope are a family code and an
    // adult's address, and stdout is not a place either belongs (OPS-0d).
    return { ok: false, message: OPS_OPERATION_FAILED_MESSAGE };
  }
}

// ---------------------------------------------------------------------------
// OPS_FAMILY_CODE_ROTATED
// ---------------------------------------------------------------------------

/**
 * Issue a new family code for one family space, without ever seeing either the
 * old one or the new one.
 *
 * OWNER AMENDMENT C1 IS THE WHOLE SHAPE OF THIS FUNCTION. "An operator who can
 * READ a family code can sign in as that family and see that child's jar", so
 * the code must be replaced without being returned, logged, or bound to
 * anything a later line could hand back.
 *
 * That is why the new value is minted INLINE, as the value of the only key the
 * gate permits, and never assigned to a variable. There is no `const newCode`
 * here to return by accident, and there could not be: the gate's rotation
 * permission matches the literal shape `familyCode: makeFamilyCode()` and
 * refuses a bound identifier, which is the near miss it exists to catch. The
 * blocking spec then proves the property from the outside, on the same record,
 * paired on role: the teacher's own page shows the new code, and no operator
 * surface or audit row contains it.
 *
 * WHY THIS OPERATION EXISTS AT ALL, given the teacher has the same button
 *
 * It is a revocation. It takes access away, it hands nothing over, and it is
 * the one shape of platform power that cannot be turned into a way of seeing a
 * child's work. The support case is the one the school cannot answer itself in
 * time: a code has gone astray during a holiday, or the teacher who owns it is
 * away, and the alternative to a named, audited, reason-bearing operation is
 * the operator opening a shell on the production volume, which is unaudited,
 * unreviewed and exactly what this programme exists to replace.
 *
 * WHAT IT CANNOT REACH, which is a containment property rather than a gap
 *
 * A family space is reachable only through the exact-match email lookup, so
 * this can only act on a household that has already given Storyjar an address
 * and whose address the caller has already read out. A family who has never
 * redeemed their code has no address on file and cannot be found here at all;
 * for them the school reprints, which is a letter either way.
 */
export async function rotateFamilyCode(
  parentId: string,
  reason: string,
): Promise<OpsOperationOutcome> {
  return perform(OPS_OPERATIONS.OPS_FAMILY_CODE_ROTATED, parentId, reason, async (tx) => {
    const family = await tx.parent.findUnique({
      where: { id: parentId },
      select: { id: true, email: true },
    });
    if (!family) throw new SubjectNotAvailable();

    await tx.parent.update({
      where: { id: family.id },
      // The one write shape the blindness gate permits under the ops roots on
      // anything that is not the operator's own record. Minted inline: no name
      // holds this value, so no line can return it.
      data: { familyCode: makeFamilyCode() },
      // A projection, so the updated row does not come back carrying the very
      // column this operation exists to avoid handing over.
      select: { id: true },
    });

    return {
      // Masked, and paired with the subject id, which identifies the family
      // space exactly and permanently. The full address is already in this
      // table from the lookup that found the record, and adding a second copy
      // to a row that does not need one is not minimisation. Never the code:
      // RETENTION.md is explicit that the log records that a code was
      // re-issued, never the code itself.
      detail: `Issued a new family code for the family space held under ${
        family.email ? maskEmail(family.email) : "no email address"
      }.`,
    };
  });
}

// ---------------------------------------------------------------------------
// OPS_PARENT_EMAIL_REVEALED
// ---------------------------------------------------------------------------

/**
 * Show one parent's email address in full (owner amendment C4).
 *
 * "Parent email addresses are masked by default, shown as ma***@me.com, with
 * full reveal as a named operation requiring a stated reason and writing an
 * audit record. Note that the system never needs a human to see an address in
 * order to send to it. Reveal exists for the support call where a teacher
 * reports a parent receiving nothing."
 *
 * PR2 shipped the mask and stopped there, and said so on the screen. This is
 * the other half.
 *
 * It changes nothing, and it goes through the same machinery as a mutation on
 * purpose: the same required reason, the same confirm step, the same audit row
 * in the same transaction, so the address cannot reach the operator unless the
 * record of them asking for it has been written first. A disclosure that could
 * happen without the row would let "I only looked" be a defence.
 *
 * WHY THE MASK IS WORTH REVEALING AT ALL, given the domain is already visible.
 * The mask keeps at most two characters of the local part, which is precisely
 * where a mistyped address goes wrong: `ma***@me.com` matches both the address
 * the parent reads out and the one with the typo in the middle of it. The
 * comparison the support call needs cannot be made against the mask.
 *
 * It is reachable only from a record the operator has already found by typing
 * somebody's whole address, never from an address box of its own, so it cannot
 * be used to walk the table (amendment C4, and ruling R11 on exact match).
 */
export async function revealParentEmail(
  parentId: string,
  reason: string,
): Promise<OpsOperationOutcome> {
  return perform(OPS_OPERATIONS.OPS_PARENT_EMAIL_REVEALED, parentId, reason, async (tx) => {
    const parent = await tx.parent.findUnique({
      where: { id: parentId },
      select: { id: true, email: true },
    });
    // A family space with no address on file has nothing to show, and the same
    // refusal covers a row that has gone.
    if (!parent?.email) throw new SubjectNotAvailable();

    return {
      // Here the address IS the point of the row: an audit line saying an
      // address was disclosed, without saying which, would need a second row
      // cross-referenced to be readable at all. It is an adult's own address,
      // the same category the lookup row already holds, and RETENTION.md's
      // operator audit line covers it.
      detail: `Showed the full email address ${parent.email} in the operator area.`,
      shown: parent.email,
    };
  });
}
