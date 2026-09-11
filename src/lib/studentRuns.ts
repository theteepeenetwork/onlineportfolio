import type { Prisma } from "@prisma/client";

// Which runs of an activity are on one pupil's list. ONE definition, used by
// every place that asks, because until 10 September 2026 there were five copies
// — the jar, the activities list, the activity page, the draft store and the
// hand-in — and a rule added to four of them is a rule a child can walk round
// through the fifth.
//
// A run is on a pupil's list when all of these hold:
//
//   - It is a run IN THEIR CLASS. For a whole-class run that was always true.
//     For a chosen-pupil run it was not: the old query matched on the
//     AssignmentStudent row alone, so when the September move-up took the
//     children into a new class (src/app/actions/rollover.ts), last year's
//     chosen-pupil runs followed them — on to their new to-do list, and a hand-in
//     against one would have filed this year's work under last year's run.
//     FINDINGS F79.
//   - It is set to the whole class, or they were chosen for it.
//   - Their teacher has not marked it "not needed" for them (AssignmentExcusal).
//
// `includeExcused` is for exactly one caller: the hand-in. A pupil whose page
// was already open when their teacher pressed "Not needed" can still hand in,
// and their work is accepted and the mark cleared in the same transaction — a
// child's finished work is never turned away (owner decision, 10 September
// 2026). Everything that decides what a pupil is SHOWN leaves it off.
//
// Status (LIVE or not) is the caller's to add: the draft store and the hand-in
// have never required it, and changing that is not this file's decision.
//
// One place asks a class-scoped version of this question without it, on
// purpose: the pupil branch of src/app/uploads/[...path]/route.ts, which serves
// only teacher-made pictures out of a run's snapshot, and which a pupil marked
// "not needed" still needs — they may hand in anyway (see `includeExcused`).
export function runsSetForStudent(
  student: { id: string; classId: string },
  opts: { includeExcused?: boolean } = {},
): Prisma.AssignmentWhereInput {
  return {
    classId: student.classId,
    OR: [{ wholeClass: true }, { wholeClass: false, students: { some: { studentId: student.id } } }],
    ...(opts.includeExcused ? {} : { excusals: { none: { studentId: student.id } } }),
  };
}
