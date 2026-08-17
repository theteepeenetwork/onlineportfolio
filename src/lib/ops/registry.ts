import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// The operation registry (PR4). The closed list of things an operator can do.
// ---------------------------------------------------------------------------
//
// WHAT THIS FILE IS FOR
//
// PR1 to PR3 built an operator area that could only look. This is the file
// where that stops being true, and it is deliberately the smallest and most
// boring file in the programme: a list. Everything the operator can do to the
// world is one row below. Nothing else in `src/lib/ops/` mutates anything, and
// nothing else discloses a value the read chokepoint decided to withhold.
//
// The handbook's shared definition of done, item 5: "Every mutating action:
// named, in the frozen registry, required reason of 12 characters or more,
// mutation and audit row in one transaction, audit failure fails the
// operation." Section 8 names the failure this is aimed at: "Plausible-sounding
// capability creep. 'Everything except viewing children's work' invites a
// helpful thumbnail, a CSV, a search box, a 'view as teacher'. Each arrives with
// a good reason." A list in one file, changed in a diff a person reads, is the
// answer to that. A function somebody adds is not.
//
// HOW A ROW GETS ADDED, AND WHY IT IS THIS AWKWARD ON PURPOSE
//
// Adding an operation is four edits, in four files, none of which can be done
// by accident:
//
//   1. this file, the row itself;
//   2. `src/lib/ops/operations.ts`, the implementation, which is the ONLY
//      module under the ops roots permitted to mutate anything that is not the
//      operator's own record (rule OPS-MUTATION-MODULE in the blindness gate);
//   3. `tests/battery/security/ops-operations.spec.ts`, whose EXPECTED_IDS is a
//      literal list. The battery goes red the moment this file and that list
//      disagree, in either direction, so a new operation cannot ship until
//      somebody has written its name into a blocking test;
//   4. `docs/ops-architecture.md`, the dated decision log a school's data
//      protection lead can be shown. The same spec asserts every id appears
//      there, so an operation that exists in code and nowhere a human reads is
//      a failing build.
//
// New rows need the owner (handbook section 8: "the operation registry is
// closed and frozen; new rows need the owner"). The four edits do not make that
// true on their own; they make it visible, which is all a repository can do.
//
// WHAT IS NOT HERE, AND WILL NOT BE
//
//   - Impersonation, in any spelling. Permanently out of scope, and a build
//     failure rather than a promise (see the gate's IMPERSONATION_PATTERNS).
//   - `correctAdultEmail`, in any form, for staff or for parents. Owner
//     decision D9, `docs/ops-architecture.md`, 17 August 2026: changing an
//     adult's address is a route into their account. Change it, trigger a
//     reset, become that teacher, reach that class's children. Every step is
//     legitimate on its own, which is exactly why no gate catches the sequence.
//     The support answer is that the teacher changes it themselves, or a school
//     admin re-invites them.
//   - Rotating a class code. Considered for this PR and refused: see the note
//     in `src/lib/ops/operations.ts` for the reasoning, which is about what an
//     operator would have to be able to SEE in order to pick a class.
//   - Anything that reads a credential value. Rotation replaces one without
//     ever returning it (owner amendment C1).

/** The audit `action` string, and the identity of the operation. One and the same. */
export type OpsOperationId = "OPS_FAMILY_CODE_ROTATED" | "OPS_PARENT_EMAIL_REVEALED";

/**
 * What an operation does to the world.
 *
 * MUTATION changes something. DISCLOSURE changes nothing but hands the operator
 * a value that is withheld by default, which needs the same reason, the same
 * audit row and the same confirm step, because "I only looked" is exactly the
 * defence a screen like this must not be able to offer.
 */
export type OpsOperationKind = "MUTATION" | "DISCLOSURE";

export type OpsOperationSpec = {
  id: OpsOperationId;
  kind: OpsOperationKind;
  /** What the operator presses. A verb, not a noun. */
  title: string;
  /** The kind of record this acts on. Written into the audit row. */
  subjectType: "PARENT";
  /** Shown before the confirm, in words, one consequence per line. */
  consequences: readonly string[];
  /** The button on the confirm step. */
  confirmLabel: string;
  /** What the operator is told afterwards. */
  doneMessage: string;
};

function spec(s: OpsOperationSpec): OpsOperationSpec {
  return Object.freeze({ ...s, consequences: Object.freeze([...s.consequences]) });
}

export const OPS_OPERATIONS: Readonly<Record<OpsOperationId, OpsOperationSpec>> = Object.freeze({
  OPS_FAMILY_CODE_ROTATED: spec({
    id: "OPS_FAMILY_CODE_ROTATED",
    kind: "MUTATION",
    title: "Issue a new family code",
    subjectType: "PARENT",
    consequences: [
      "The code on this family's letter stops working straight away. Anybody holding a copy of that letter loses their way in, which is the point of doing this.",
      "You will not see the new code. The school sees it on that child's page in their own screens, and they are the ones who have to print the new letter.",
      "Nobody is signed out. A grown-up who has already used the old code keeps the access they have; this changes what a NEW sign-in has to type.",
      "The school is not told automatically. Tell them, or the next letter they print will carry a code that no longer works.",
    ],
    confirmLabel: "Yes, issue a new code",
    doneMessage:
      "Done. A new family code has been issued. It is not shown here and it is not in the record of this action: the school sees it on that child's page. Tell them it has changed.",
  }),
  OPS_PARENT_EMAIL_REVEALED: spec({
    id: "OPS_PARENT_EMAIL_REVEALED",
    kind: "DISCLOSURE",
    title: "Show this address in full",
    subjectType: "PARENT",
    consequences: [
      "The whole address is shown on this screen, once, until you leave the page.",
      "Storyjar never needs a person to read an address in order to send to it. This exists for the call where a school says a parent is receiving nothing and you have to compare what is stored against what they read out.",
      "The address and your reason are written to the operator record, word for word, and can be read back later.",
    ],
    confirmLabel: "Yes, show the address",
    doneMessage: "The address is shown below, and the reason has been recorded.",
  }),
});

/** Sorted, so the list reads the same in a test, a document and a failure message. */
export const OPS_OPERATION_IDS: readonly OpsOperationId[] = Object.freeze(
  (Object.keys(OPS_OPERATIONS) as OpsOperationId[]).sort(),
);

export function isOpsOperationId(value: string): value is OpsOperationId {
  return Object.prototype.hasOwnProperty.call(OPS_OPERATIONS, value);
}

/**
 * The row for an id, or a throw.
 *
 * Deliberately not "or null". An operation that is not in the registry is not
 * an operation, and a caller that got here with an unknown id is a caller that
 * has gone around the list. That is a crash, not a fallback.
 */
export function opsOperation(id: string): OpsOperationSpec {
  if (!isOpsOperationId(id)) {
    throw new Error(`Unknown operator operation "${id}". The registry is closed.`);
  }
  return OPS_OPERATIONS[id];
}

// ---------------------------------------------------------------------------
// The idempotency key (handbook ruling R5)
// ---------------------------------------------------------------------------
//
// R5: "Mutation and recordOpsAudit in one db.$transaction. The audit row
// carries a unique idempotency key so QA can force a real constraint violation.
// No production-reachable fault flag, ever."
//
// The key is derived, not random, and that is the whole design. A random value
// could never collide, so nothing could ever prove that a failed audit write
// fails the operation without a switch in the product to break it with, and a
// switch that can break auditing in production is worse than the property it
// would prove.
//
// Derived from the action, the operator, the subject and the reason, so the
// key says: this operator, doing this thing, to this record, for this stated
// reason. `OpsAuditLog.idempotencyKey` is unique, so a second identical attempt
// hits a real database constraint, the transaction rolls back, and the mutation
// does not happen.
//
// THIS IS A PRODUCT BEHAVIOUR FIRST AND A TEST HOOK SECOND, which matters,
// because a test hook in a mutation path is a liability. A double-submitted
// form, a retried request and an impatient second click are all the same
// operation twice, and refusing the second is right. A genuinely separate
// second rotation for the same family needs a reason that says what is
// different about it, which is also right: "leaked again on 14 September" is a
// better record than the same sentence twice.
//
// The reason is trimmed before hashing and stored untrimmed, so trailing
// whitespace cannot manufacture a fresh key for the same words.

// A separator that cannot appear in any of the four parts, written as an
// escape rather than as a raw byte: a literal control character in a source
// file is invisible to grep and to the person reviewing the diff, and
// scripts/audit-static.mjs refuses one for exactly that reason. Without a
// separator, two different reasons could be concatenated into the same string
// and collide, which would refuse an operation that had never been done.
const SEPARATOR = "\u0000";

export function opsIdempotencyKey(input: {
  action: string;
  actorId: string;
  subjectId: string;
  reason: string;
}): string {
  return createHash("sha256")
    .update([input.action, input.actorId, input.subjectId, input.reason.trim()].join(SEPARATOR))
    .digest("hex");
}

/**
 * What the operator is told when that constraint fires. Plain English, no
 * database vocabulary: the person reading it needs to know that nothing
 * happened and what to do next, not what a unique index is.
 */
export const OPS_REPEAT_MESSAGE =
  "Nothing was changed. That exact reason has already been recorded for this record, so this looks like the same action twice. If it is a new one, say what is different about it and try again.";

/** Everything else that can go wrong at the database. Also says nothing happened. */
export const OPS_OPERATION_FAILED_MESSAGE =
  "Nothing was changed. The action could not be recorded, so it was not carried out. Try again.";
