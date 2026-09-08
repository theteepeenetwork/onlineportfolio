"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { recordAudit } from "@/lib/audit";
import { freezeSubscription } from "@/lib/billing";
import { restoreFreePlan } from "@/lib/freePlan";

// ===========================================================================
// A school closes its own account.
//
// Mrs Hartley, the business-manager persona, on what this replaces — one of
// three findings she recorded as "could not carry on":
//
//   "There is no way for me to close our account and have the children's data
//    deleted. Our retention policy says we can ask for it — and the only route I
//    can see is emailing somebody and hoping."
//
// ---------------------------------------------------------------------------
// THIS CLOSES. IT DOES NOT DELETE, AND THAT IS NOT A SHORTCUT.
// ---------------------------------------------------------------------------
//
// Two things on the record forbid the deletion, and neither is this change's to
// lift:
//
//   • Owner decision **D5** (docs/ops-architecture.md, 17 August 2026): "School
//     deletion does not exist in v1. The handbook default, chosen."
//   • Handbook **R12**: no deletion before a backup restore has been rehearsed
//     end to end with a media checksum sample. It never has been. The drill is
//     written up in docs/restore-rehearsal.md and is the owner's to run;
//     FINDINGS.md calls it an owner action nothing an agent writes can
//     substitute for.
//
// There is also a structural reason, and it is worth knowing before somebody
// "finishes the job" in an afternoon. `db.school.delete()` TODAY would delete a
// school row, a subscription, invitations, a messaging policy and message
// threads, and would leave every class, pupil, journal item, draft and
// photograph intact on a detached teacher — because `Teacher.schoolId` is
// SetNull and `Class` used to hang off `Teacher` alone. `Class.schoolId` (8
// September) fixes the direction, but a real `eraseSchool` still has to walk
// staff → classes through src/lib/erasure.ts, and it inherits **F26** (deleting
// a teacher erases rows but no media files) and **F27** (template media paths
// are shared between copies, so the obvious delete blanks a teacher's whole
// activity library) in full.
//
// SO WHAT THIS IS: the school's instruction, with a date on it and a name
// against it, in the school's own audit log. That is the whole difference
// between "emailing somebody and hoping" and a record. The erasure then follows
// RETENTION.md's schedule, carried out by hand until the frozen → deletion
// pipeline exists — and the screen says exactly that, in words, rather than
// implying a delete button did something it did not.
//
// WHAT IT DOES DO, in one transaction:
//   1. stamps the instruction on the School row;
//   2. detaches every member of staff to their own free plan, taking the classes
//      they brought in with them (the same rule a lapsed plan follows —
//      src/lib/schoolPlanEnd.ts, owner decision 8 September);
//   3. freezes the subscription, so the school is read-only from that moment.
//
// EXPORT FIRST IS A PROMPT, NOT A GATE. The screen tells the admin to have
// teachers export their classes before closing, and cannot do it for them: rule
// 5 says an admin never sees a child's work, and a closure button that produced
// a whole-school bundle would be that rule falling over at the last moment. What
// this action does guarantee is the thing that makes the prompt survivable —
// **nothing is deleted**, so a class exported next week is still there to
// export.
// ===========================================================================

export type ClosureState = { error?: string; done?: string };

const MIN_REASON = 12;

/**
 * Close a school's account: instruction recorded, staff released, plan frozen.
 * Nothing is deleted.
 */
export async function closeSchoolAccount(
  _prev: ClosureState | undefined,
  formData: FormData,
): Promise<ClosureState> {
  const { teacherId, schoolId, actorName } = await requireAdmin();

  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, closedAt: true },
  });
  if (!school) return { error: "That school isn't one of yours." };
  if (school.closedAt) return { error: `${school.name} is already closed.` };

  // TYPE THE NAME, as `deleteClass` requires and for the same reason: this ends
  // a school's account for every child in it. Re-checked HERE and not only in
  // the browser, because a confirmation only enforced in a form is a
  // confirmation somebody can post past.
  const typed = String(formData.get("confirmName") ?? "").trim();
  if (typed !== school.name) {
    return { error: `Type the school's name exactly — ${school.name} — to confirm.` };
  }

  // A REASON OF SUBSTANCE, on the operator area's pattern for an adult lookup: a
  // deletion carried out later has to be traceable to the instruction that asked
  // for it, and "x" is not an instruction. The warning above the box says not to
  // put a child's name in it; nothing can do better than that, and the residual
  // is recorded rather than argued away (the same honest limit `OpsAuditLog`
  // states about its own reason field).
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < MIN_REASON) {
    return { error: "Please say in a sentence why the school is closing its account." };
  }

  const staff = await db.teacher.findMany({ where: { schoolId }, select: { id: true } });
  const plan = await db.subscription.findUnique({ where: { schoolId }, select: { id: true, schoolId: true } });

  let released = 0;
  await db.$transaction(async (tx) => {
    const stamped = await tx.school.updateMany({
      // Guarded on still being open, so two tabs cannot record two instructions.
      where: { id: schoolId, closedAt: null },
      data: { closedAt: new Date(), closedByTeacherId: teacherId, closureReason: reason },
    });
    if (stamped.count === 0) throw new Error("already closed");

    for (const member of staff) {
      await tx.teacher.updateMany({
        where: { id: member.id, schoolId },
        // `role` back to TEACHER with the detach, exactly as `removeStaff`,
        // `detachBuyer` and the lapse detach do. Rank is not something a person
        // carries between schools.
        data: { schoolId: null, role: "TEACHER" },
      });
      await restoreFreePlan(tx, member.id);
      // The classes they ARRIVED with go back to them; the school's own stay
      // with the school, exactly as when a plan lapses. Somebody who brought
      // her own classes into a school that later closed must not lose them
      // because the school did (owner decision, 8 September 2026).
      await tx.class.updateMany({
        where: { teacherId: member.id, schoolId, broughtInByTeacherId: member.id },
        data: { schoolId: null, broughtInByTeacherId: null },
      });
      released += 1;
    }
  });

  // Frozen AFTER the commit, through the shared helper, so the URN release and
  // the BILLING_FROZEN row it writes happen exactly as they do on every other
  // path to FROZEN rather than being reimplemented here.
  if (plan) {
    await freezeSubscription(plan, `the school closed its account: ${reason}`, {
      type: "ADMIN",
      id: teacherId,
      name: actorName,
    });
  }

  // THE INSTRUCTION, in the school's own audit log. This is the row somebody
  // answering "when did they ask, and who asked" is looking for, and it is the
  // whole point of the feature. It names no child.
  await recordAudit({
    action: "SCHOOL_CLOSED",
    actorType: "ADMIN",
    actorId: teacherId,
    actorName,
    schoolId,
    subjectType: "SCHOOL",
    subjectId: schoolId,
    detail:
      `${actorName} closed ${school.name}'s account. Reason given: ${reason}. ` +
      `${released} member${released === 1 ? "" : "s"} of staff returned to their own free plan. ` +
      `Nothing has been deleted: every class, every child's work and every file is still held, and is removed ` +
      `on the retention schedule.`,
  });

  revalidatePath("/admin");
  revalidatePath("/teacher", "layout");

  // AND SEND THEM SOMEWHERE THAT TELLS THEM IT WORKED.
  //
  // The admin who presses this is a member of staff, so step 2 above detaches
  // THEM as well — which is correct, and which means that a moment later
  // `requireAdmin` no longer recognises them and the console bounces them to
  // /teacher. Left alone, the most consequential action in the product would
  // throw the person who took it out of the room with no word about whether it
  // had worked. A test caught that; nobody would have enjoyed finding it the
  // other way.
  //
  // The account page is where they now belong — they are on their own free plan
  // from this moment — and it says what happened when it sees this parameter.
  // The audit row is the durable record; this is the sentence for the person
  // still holding the mouse.
  redirect("/teacher/account?closed=1");
}
