"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requireWritableAccount, FROZEN_TEACHER_MESSAGE } from "@/lib/billing";
import { runHref } from "@/lib/runStatus";

// "Not needed": a teacher takes one activity off one pupil's to-do list — the
// pupil who was away for the lesson, or who did it on paper — and can put it
// back. Teacher feedback, item 5.
//
// WHAT IS STORED IS THE FACT AND NOTHING ELSE. One AssignmentExcusal row: which
// run, which pupil, when. There is no reason field and there must never be one:
// the reason a child missed an activity is very often that they were ill, and a
// free-text box beside a child's name is where health data gets written by
// accident (SAFEGUARDING rules 2 and 19; the same argument as the permission
// slip's fixed answers in rule 22). No audit row either (owner decision,
// 10 September 2026): a to-do list is not a safeguarding-relevant action, and
// an audit row would be one more place the fact is copied to.
//
// THE CHECKS, IN ORDER, each denying without saying which one failed:
//   1. the caller is a teacher;
//   2. their account may write (a frozen school reads, it does not change);
//   3. the run is live and in a class they hold TODAY — the run page's own
//      scope (F66), so another school, a colleague, and a template's author
//      after a handover all find nothing;
//   4. the pupil is in that class and on that run.
// Then, in ONE transaction with the write: the pupil has handed nothing in.
// "Not needed" is for somebody who has nothing to show; work that exists is
// the teacher's to look at, not to wave away, and the run page offers the
// button only to pupils with nothing handed in. The transaction is what makes
// that true for a stale tab as well as for the screen.
//
// If a pupil whose page was already open hands in AFTER being marked, the work
// is accepted and the mark cleared by createJournalItem — see
// src/lib/studentRuns.ts.

export type RunPupilState = { error?: string; ok?: boolean };

const NOT_YOURS = "That pupil isn't on this activity in one of your classes.";

async function resolve(formData: FormData): Promise<
  | { ok: true; runId: string; studentId: string; name: string }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const gate = await requireWritableAccount();
  if (!gate.ok) return { ok: false, error: FROZEN_TEACHER_MESSAGE };

  const runId = String(formData.get("runId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");

  const run = await db.assignment.findFirst({
    where: { id: runId, status: "LIVE", class: { teacherId: user.teacher.id } },
    select: { id: true, classId: true, wholeClass: true },
  });
  if (!run) return { ok: false, error: NOT_YOURS };

  const pupil = await db.student.findFirst({
    where: {
      id: studentId,
      classId: run.classId,
      ...(run.wholeClass ? {} : { assignments: { some: { assignmentId: run.id } } }),
    },
    select: { id: true, name: true },
  });
  if (!pupil) return { ok: false, error: NOT_YOURS };

  return { ok: true, runId: run.id, studentId: pupil.id, name: pupil.name };
}

/** Take this run off one pupil's to-do list. */
export async function excuseFromRun(_prev: RunPupilState | undefined, formData: FormData): Promise<RunPupilState> {
  const r = await resolve(formData);
  if (!r.ok) return { error: r.error };

  const outcome = await db.$transaction(async (tx) => {
    const handedIn = await tx.journalItem.count({ where: { assignmentId: r.runId, studentId: r.studentId } });
    if (handedIn > 0) return "HANDED_IN" as const;
    await tx.assignmentExcusal.upsert({
      where: { assignmentId_studentId: { assignmentId: r.runId, studentId: r.studentId } },
      create: { assignmentId: r.runId, studentId: r.studentId },
      update: {},
    });
    return "DONE" as const;
  });
  if (outcome === "HANDED_IN") {
    return { error: `${r.name} has already handed something in for this, so it can't be marked as not needed.` };
  }

  revalidatePath(runHref(r.runId));
  revalidatePath("/teacher/activities");
  return { ok: true };
}

/** Put this run back on one pupil's to-do list. */
export async function putBackOnRun(_prev: RunPupilState | undefined, formData: FormData): Promise<RunPupilState> {
  const r = await resolve(formData);
  if (!r.ok) return { error: r.error };

  await db.assignmentExcusal.deleteMany({ where: { assignmentId: r.runId, studentId: r.studentId } });

  revalidatePath(runHref(r.runId));
  revalidatePath("/teacher/activities");
  return { ok: true };
}
