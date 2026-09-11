"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
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
//   4. the pupil is in that class and on that run;
//   5. for "Not needed" only, the pupil has handed nothing in.
// 3 to 5 run in ONE transaction with the write, so the answer the write acts
// on is the answer at the moment of writing. Checked first and written after,
// a class handed to a colleague, a pupil moved to another class or a run
// closed in between would leave a mark written on the strength of a check that
// was no longer true (safeguarding review, 10 September 2026).
//
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

/** Checks 1 and 2, and the two ids off the form. */
async function caller(formData: FormData): Promise<
  { ok: true; teacherId: string; runId: string; studentId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const gate = await requireWritableAccount();
  if (!gate.ok) return { ok: false, error: FROZEN_TEACHER_MESSAGE };

  return {
    ok: true,
    teacherId: user.teacher.id,
    runId: String(formData.get("runId") ?? ""),
    studentId: String(formData.get("studentId") ?? ""),
  };
}

/** Checks 3 and 4, on the transaction the write will use. */
async function pupilOnRun(
  tx: Prisma.TransactionClient,
  c: { teacherId: string; runId: string; studentId: string },
): Promise<{ runId: string; studentId: string; name: string } | null> {
  const run = await tx.assignment.findFirst({
    where: { id: c.runId, status: "LIVE", class: { teacherId: c.teacherId } },
    select: { id: true, classId: true, wholeClass: true },
  });
  if (!run) return null;

  const pupil = await tx.student.findFirst({
    where: {
      id: c.studentId,
      classId: run.classId,
      ...(run.wholeClass ? {} : { assignments: { some: { assignmentId: run.id } } }),
    },
    select: { id: true, name: true },
  });
  if (!pupil) return null;

  return { runId: run.id, studentId: pupil.id, name: pupil.name };
}

/** Take this run off one pupil's to-do list. */
export async function excuseFromRun(_prev: RunPupilState | undefined, formData: FormData): Promise<RunPupilState> {
  const c = await caller(formData);
  if (!c.ok) return { error: c.error };

  const outcome = await db.$transaction(async (tx) => {
    const r = await pupilOnRun(tx, c);
    if (!r) return { kind: "NOT_YOURS" as const };
    const handedIn = await tx.journalItem.count({ where: { assignmentId: r.runId, studentId: r.studentId } });
    if (handedIn > 0) return { kind: "HANDED_IN" as const, name: r.name };
    await tx.assignmentExcusal.upsert({
      where: { assignmentId_studentId: { assignmentId: r.runId, studentId: r.studentId } },
      create: { assignmentId: r.runId, studentId: r.studentId },
      update: {},
    });
    return { kind: "DONE" as const, runId: r.runId };
  });
  if (outcome.kind === "NOT_YOURS") return { error: NOT_YOURS };
  if (outcome.kind === "HANDED_IN") {
    return { error: `${outcome.name} has already handed something in for this, so it can't be marked as not needed.` };
  }

  revalidatePath(runHref(outcome.runId));
  revalidatePath("/teacher/activities");
  return { ok: true };
}

/** Put this run back on one pupil's to-do list. */
export async function putBackOnRun(_prev: RunPupilState | undefined, formData: FormData): Promise<RunPupilState> {
  const c = await caller(formData);
  if (!c.ok) return { error: c.error };

  const runId = await db.$transaction(async (tx) => {
    const r = await pupilOnRun(tx, c);
    if (!r) return null;
    await tx.assignmentExcusal.deleteMany({ where: { assignmentId: r.runId, studentId: r.studentId } });
    return r.runId;
  });
  if (!runId) return { error: NOT_YOURS };

  revalidatePath(runHref(runId));
  revalidatePath("/teacher/activities");
  return { ok: true };
}
