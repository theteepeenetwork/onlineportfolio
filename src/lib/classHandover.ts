import "server-only";
import type { Prisma } from "@prisma/client";
import { makeClassCode } from "@/lib/classCode";

// What has to happen when a class changes hands.
//
// ONE MODULE BECAUSE IT IS ONE EVENT. A class moves to another teacher when an
// admin reassigns it in September, and when an admin removes the person who
// held it. Those looked like two features and were written as two, and the
// difference is exactly where FINDINGS F66 lived: reassignment moved
// `Class.teacherId` and nothing else, removal did not move it at all.
//
// WHAT MOVING `teacherId` DOES AND DOES NOT CLOSE, measured rather than assumed
// (F59, F66, and the access map two reviewers built before this was written):
//
//   Closed by the move. The journal, the approval queue, the pupil pages, the
//   roster, class settings, family access, both exports, and every piece of
//   child media — all of them scope `class: { teacherId }` or `{ id, teacherId }`,
//   so the moment the column changes they return nothing. `/uploads` is the one
//   that matters most and it is the same clause (`route.ts:152`).
//
//   NOT closed by the move, which is why this module does more than one update:
//
//     THE CLASS CODE is a bearer credential. `classCodeLookup` finds a class by
//     `classCode` alone — it must, because a child typing a code has no session
//     yet — so the previous teacher signs in AS ANY PUPIL in a class they no
//     longer hold, with no session, no token and no password. Sign-out does not
//     help. Revoking sessions does not help. Changing their password does not
//     help. Only rotating the code helps, and nothing rotated it before this.
//
//     Owner decision, 29 August 2026: rotate on BOTH triggers, removal and
//     ordinary reassignment. The cost is real and was weighed — every child in a
//     moved class needs telling the new code, including in a routine handover
//     where nothing is wrong. It is accepted because the alternative leaves the
//     worse limb open on the trigger that actually happens.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO. It does not touch
// `ActivityTemplate.teacherId`. A template is the author's own work and does not
// belong to the class; F66's other limb is fixed where it is caused, by scoping
// the assignment queries on the class as well as the template, not by moving
// authorship around.

/** One class about to change hands, and what it holds. */
export type HandoverClass = {
  id: string;
  name: string;
  classCode: string;
  _count: { students: number };
};

/**
 * Move every class held by `fromTeacherId` to `toTeacherId`, rotating each
 * class's code on the way.
 *
 * Takes a transaction client and MUST be called inside one. Two reasons, and
 * the second is the one that bit before:
 *
 *   A partial handover reproduces the defect it fixes. If the code rotates and
 *   the owner does not, or the owner moves and the school link does not, the
 *   state left behind is worse than the state before — so all of it commits or
 *   none of it does.
 *
 *   Selecting ids and then updating them leaves a race: a class created between
 *   the read and the write is silently left behind, holding its old code and
 *   its old owner. That is F59 in miniature. The move is one `updateMany` over
 *   a predicate, and the per-class code rotation runs against the rows that
 *   predicate just claimed.
 */
export async function handOverClasses(
  tx: Prisma.TransactionClient,
  fromTeacherId: string,
  toTeacherId: string,
): Promise<HandoverClass[]> {
  // Read inside the transaction so the list and the update see one state.
  const moving = await tx.class.findMany({
    where: { teacherId: fromTeacherId },
    select: { id: true, name: true, classCode: true, _count: { select: { students: true } } },
  });
  if (moving.length === 0) return [];

  await tx.class.updateMany({
    where: { teacherId: fromTeacherId },
    data: { teacherId: toTeacherId },
  });

  // A fresh code each, so the old one stops signing anybody in. Generated
  // without the database round trip `uniqueClassCode()` does, and collisions are
  // handled by the unique constraint rather than by asking first: at six
  // characters from an unambiguous alphabet a clash is vanishingly unlikely, and
  // a clash inside a transaction aborts the whole handover rather than silently
  // issuing a duplicate. Retried once, because "vanishingly unlikely" is not
  // "impossible" and a head teacher suspending somebody should not meet a
  // constraint error.
  for (const klass of moving) {
    try {
      await tx.class.update({ where: { id: klass.id }, data: { classCode: makeClassCode() } });
    } catch {
      await tx.class.update({ where: { id: klass.id }, data: { classCode: makeClassCode() } });
    }
  }

  return moving;
}

/** How many children are affected, for the sentence shown before the click. */
export function handoverSummary(classes: HandoverClass[]): string {
  const pupils = classes.reduce((n, c) => n + c._count.students, 0);
  if (classes.length === 0) return "They hold no classes.";
  const cls = `${classes.length} ${classes.length === 1 ? "class" : "classes"}`;
  const kids = `${pupils} ${pupils === 1 ? "pupil" : "pupils"}`;
  return `${cls} and ${kids}' work will move to you, and each class will get a new class code.`;
}
