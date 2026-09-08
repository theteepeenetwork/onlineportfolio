"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { schoolIsVerified } from "@/lib/schoolClaim";
import { uniqueClassCode } from "@/lib/classCode";
import { recordAudit } from "@/lib/audit";
import { normaliseAgeModeInput } from "@/lib/ageMode";
import { redirect } from "next/navigation";

// ===========================================================================
// The September job: moving each class up a year and handing it to its new
// teacher (docs/paid-tier-plan.md item 1 — "the flagship").
//
// Mrs Hartley, the business manager, on what this replaces:
//
//   "There is nothing anywhere for the September job: moving each class up a
//    year and handing it to its new teacher. Doing it by hand means recreating
//    every class, re-typing every child's name, and re-issuing every code and
//    letter — and last year's work does not follow the child."
//
// ---------------------------------------------------------------------------
// THE SHAPE, AND WHY IT IS A NEW CLASS RATHER THAN A RENAMED ONE.
// ---------------------------------------------------------------------------
//
// There are two honest models of what a class is, and src/app/admin/Guide.tsx
// has been telling schools about both: "the class is the children" (rename it
// and move on) and "the class is the room" (Year 2 stays, the children leave).
// This takes the second, because it is the only one that keeps the promise the
// persona actually asked for.
//
// `JournalItem` carries its OWN `classId` beside `studentId`. So moving a child
// with `Student.classId` leaves last year's work pointing at last year's class,
// and it stays labelled with the class it was made in. Renaming the class
// instead would retitle a whole year of work overnight: a Year 2 painting would
// suddenly have been made in Year 3, and no record of the change would exist.
//
// WHAT MOVES: the children. WHAT DOES NOT: their work, their families, their
// family codes (a code belongs to the household, not the class), and their
// message threads (participants are derived from the child's CURRENT class, so
// a thread follows the child with nothing extra to build — SAFEGUARDING rule 21).
//
// THE CLASS CODE IS NEW BY CONSTRUCTION, because the class is new. That is F66's
// requirement met without a special case: the old code stops signing anybody in
// the moment its class has no children left. A school still has to tell 30
// children a new code, and the screen says so BEFORE the press rather than
// after, the way `handoverSummary` does for a handover.
//
// ---------------------------------------------------------------------------
// WHAT THIS REFUSES TO DO, AND WHY EACH REFUSAL IS THE FEATURE.
// ---------------------------------------------------------------------------
//
// 1. IT WILL NOT MOVE A CLASS WITH WORK STILL IN THE QUEUE. The approval queue
//    is scoped by the MOMENT's class (`queue/page.tsx`), not the child's, so a
//    PENDING moment made in July would sit in the OUTGOING teacher's queue after
//    the child had moved — and if that teacher has left the school it is
//    unreachable by anyone. The audit in docs/paid-tier-plan.md found this and
//    chose the precondition over the silent orphan. A school's July queue should
//    be empty anyway; this makes that a requirement rather than a hope.
//
// 2. IT NEVER GUESSES THE REGISTER. `Class.ageMode` is shown with a choice and
//    carried across unchanged unless a person changes it. A class moving from
//    Year 2 to Year 3 does NOT become KS2 by arithmetic: the schema comment on
//    that column forbids inferring it from a year group, it is the youngest and
//    most protective default when unset (SAFEGUARDING rule 8), and a machine
//    deciding a seven-year-old is now old enough for the older shell is exactly
//    the nudge the Children's Code is about.
//
// 3. IT NEVER DELETES. A leavers' class is ARCHIVED. Every child, every moment
//    and every file stays exactly where it is, and goes only when RETENTION.md's
//    schedule takes it through src/lib/erasure.ts. `eraseClass` is not called
//    from this file and must not be added to it.
//
// 4. IT NEVER SHOWS THE ADMIN A CHILD'S WORK. Rule 5 holds throughout: this
//    screen deals in class names, counts and staff names. The leaver export is
//    the class teacher's, as it already is.
// ===========================================================================

export type RolloverState = { error?: string; done?: string };

/** The word for each register, for the audit line only. Never shown to a child. */
const AGE_MODE_WORD: Record<string, string> = { EYFS: "early years", KS1: "younger", KS2: "older" };

/**
 * Move one class up a year: next year's class, next year's teacher, this year's
 * children.
 */
export async function moveClassUp(_prev: RolloverState | undefined, formData: FormData): Promise<RolloverState> {
  const { teacherId, schoolId, actorName } = await requireAdmin();

  // THE VERIFICATION GATE. This is `assignClassToStaff` at scale — it is how an
  // adult comes to see a class of children's work — so it asks the same question
  // that action asks, in the same words, and refuses the same way
  // (docs/dpo-decisions.md, 30 August and 1 September 2026). The console
  // withholds the control long before this line; what arrives here is a tampered
  // form or a stale tab, and both deserve the sentence rather than a shrug.
  if (!(await schoolIsVerified(schoolId))) redirect("/admin?blocked=verify");

  const classId = String(formData.get("classId") ?? "");
  const newTeacherId = String(formData.get("teacherId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const yearGroupRaw = String(formData.get("yearGroup") ?? "").trim();
  const academicYearRaw = String(formData.get("academicYear") ?? "").trim();

  if (!name) return { error: "Give next year's class a name." };
  if (name.length > 60) return { error: "That class name is a little long — 60 characters or fewer, please." };

  // BOTH ENDS SCOPED TO THIS SCHOOL, resolved by id and school together and
  // never by id alone. `Class.schoolId` is what makes the first of these a
  // single condition rather than a join through whoever happens to hold it.
  const [klass, incoming] = await Promise.all([
    db.class.findFirst({
      where: { id: classId, schoolId, archivedAt: null },
      select: { id: true, name: true, ageMode: true, teacherId: true, _count: { select: { students: true } } },
    }),
    db.teacher.findFirst({ where: { id: newTeacherId, schoolId }, select: { id: true, name: true } }),
  ]);
  // Deny by default, and say nothing about which of the two was wrong: an admin
  // using the screen never arrives here (rule 8).
  if (!klass || !incoming) return { error: "That class or member of staff isn't one of yours." };

  // THE QUEUE PRECONDITION. See the header: a PENDING moment is scoped to the
  // class it was made in, so moving the children out of a class that still has
  // one strands it in the outgoing teacher's queue.
  const pending = await db.journalItem.count({ where: { classId: klass.id, status: "PENDING" } });
  if (pending > 0) {
    return {
      error:
        `${klass.name} still has ${pending} ${pending === 1 ? "piece" : "pieces"} of work waiting to be approved. ` +
        `Ask ${klass.name}'s teacher to clear the queue first — work left waiting here would stay with them ` +
        `after the children have moved on.`,
    };
  }

  // The register is CARRIED ACROSS unless a person changed it on the form. The
  // form always posts a value, so this is a choice made by somebody either way;
  // what it is never allowed to be is a sum over the year group.
  const ageMode = normaliseAgeModeInput(formData.get("ageMode")) ?? klass.ageMode;
  const yearGroup = yearGroupRaw ? yearGroupRaw.slice(0, 30) : null;
  const academicYear = academicYearRaw ? academicYearRaw.slice(0, 20) : null;

  const classCode = await uniqueClassCode();
  const moved = await db.$transaction(async (tx) => {
    const next = await tx.class.create({
      data: {
        name,
        yearGroup,
        academicYear,
        ageMode,
        classCode,
        teacherId: incoming.id,
        schoolId,
        // NOT `broughtInByTeacherId`. Next year's class is the school's from the
        // moment it exists; only a class a teacher ARRIVED with is hers to take
        // away again when a plan ends (src/lib/schoolPlanEnd.ts).
      },
      select: { id: true },
    });
    // THE CHILDREN MOVE. Their work does not: `JournalItem.classId` is left
    // alone on purpose, so last year's work stays labelled with last year's
    // class. See the header, and the access-path audit in
    // docs/paid-tier-plan.md that made this safe.
    const { count } = await tx.student.updateMany({ where: { classId: klass.id }, data: { classId: next.id } });
    // And last year's class stops being one. ARCHIVED, NEVER DELETED.
    await tx.class.update({ where: { id: klass.id }, data: { archivedAt: new Date() } });
    return { nextId: next.id, count };
  });

  // A DISTINCT ACTION, not `CLASS_ASSIGNED`. src/app/admin/page.tsx builds its
  // "you are temporarily holding a colleague's class" warning by substring-
  // matching the detail of `CLASS_ASSIGNED` rows, newest-wins per class, and a
  // row written here would make that flag say something untrue. Same reasoning
  // as `CLASS_JOINED_SCHOOL` and `CLASS_LEFT_SCHOOL`.
  await recordAudit({
    action: "CLASS_MOVED_UP",
    actorType: "ADMIN",
    actorId: teacherId,
    actorName,
    schoolId,
    subjectType: "CLASS",
    subjectId: moved.nextId,
    detail:
      `${klass.name} moved up to ${name}${yearGroup ? ` (${yearGroup})` : ""} with ${incoming.name}: ` +
      `${moved.count} ${moved.count === 1 ? "child" : "children"} moved, a new class code was issued, ` +
      `and ${klass.name} was archived with last year's work still in it. ` +
      `The register stayed ${AGE_MODE_WORD[ageMode ?? "EYFS"]}.`,
  });

  revalidatePath("/admin");
  revalidatePath("/teacher", "layout");
  return {
    done:
      `${klass.name} is now ${name}, with ${incoming.name}. ` +
      `${moved.count} ${moved.count === 1 ? "child needs" : "children need"} the new class code.`,
  };
}

/**
 * A class with no next year: Year 6, or a class the school is closing behind it.
 *
 * The children stay exactly where they are and so does their work — the class
 * simply stops teaching. Nothing here deletes anything, and the screen tells the
 * admin to have the teacher export first, because that is the teacher's to do
 * (rule 5) and this action cannot do it for them.
 */
export async function archiveLeavers(_prev: RolloverState | undefined, formData: FormData): Promise<RolloverState> {
  const { teacherId, schoolId, actorName } = await requireAdmin();
  if (!(await schoolIsVerified(schoolId))) redirect("/admin?blocked=verify");

  const classId = String(formData.get("classId") ?? "");
  const klass = await db.class.findFirst({
    where: { id: classId, schoolId, archivedAt: null },
    select: { id: true, name: true, _count: { select: { students: true } } },
  });
  if (!klass) return { error: "That class isn't one of yours." };

  // TYPE THE NAME, as `deleteClass` requires for a deletion. This deletes
  // nothing, but it ends a class for a roomful of children and the school should
  // mean it; the confirmation is re-checked HERE and not only in the browser.
  const typed = String(formData.get("confirmName") ?? "").trim();
  if (typed !== klass.name) {
    return { error: `Type the class name exactly — ${klass.name} — to confirm.` };
  }

  await db.class.update({ where: { id: klass.id }, data: { archivedAt: new Date() } });

  await recordAudit({
    action: "CLASS_ARCHIVED",
    actorType: "ADMIN",
    actorId: teacherId,
    actorName,
    schoolId,
    subjectType: "CLASS",
    subjectId: klass.id,
    detail:
      `${klass.name} was archived as leavers with ${klass._count.students} ` +
      `${klass._count.students === 1 ? "child" : "children"} in it. Nothing was deleted: every piece of work is ` +
      `still held, and the retention schedule decides when it goes.`,
  });

  revalidatePath("/admin");
  revalidatePath("/teacher", "layout");
  return { done: `${klass.name} is archived. Nothing was deleted.` };
}
