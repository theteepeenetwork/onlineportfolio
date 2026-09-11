// Where each pupil stands on one run of an activity, and the counts that follow.
//
// ONE PLACE FOR THE ANSWER. Before this file the same question — "how many have
// done it?" — was worked out four times, in the library, on the template page,
// on the calendar and in the assign sheet, and the copies had drifted: the
// calendar counted work that had been SENT BACK as "waiting to approve", the
// library did not; the template grid called sent-back work "● waiting" and
// linked it to the queue, where it is not. A teacher reading two screens got two
// numbers for the same run.
//
// THERE IS NO "NOT STARTED", AND THAT IS DELIBERATE. A child's unsubmitted draft
// is private even from their teacher (SAFEGUARDING rule 4, the `Draft` model's
// own comment), so the only thing a teacher can truthfully know about a pupil
// with no hand-in is that nothing has been handed in yet. "Not started" would be
// a claim about the draft table this screen must never read.
//
// Deliberately free of the server-only guard: the labels are shown by client
// components and the logic is imported by the test battery, outside Next.

export type PupilRunStatus = "IN_JAR" | "WAITING" | "SENT_BACK" | "NOT_HANDED_IN" | "NOT_NEEDED";

/** The words a teacher sees. "Pupils" in teacher copy, never "children". */
export const RUN_STATUS_LABEL: Record<PupilRunStatus, string> = {
  IN_JAR: "In their jar",
  WAITING: "Waiting for you",
  SENT_BACK: "Sent back",
  NOT_HANDED_IN: "Not handed in yet",
  NOT_NEEDED: "Not needed",
};

type Response = { studentId: string; status: string };

/**
 * One pupil's standing on a run, from their own responses to it, and whether
 * their teacher marked it "not needed" for them.
 *
 * Normally a pupil has at most one response per run — a re-do after sending
 * back updates the same row — but nothing in the schema forbids two (a second
 * tab can hand in twice). So the order is fixed rather than "the latest": work
 * waiting for the teacher wins, because hiding it would hide a job; then work in
 * the jar; then work sent back.
 *
 * WORK OUTRANKS THE MARK. A mark is refused for a pupil who has handed in, and
 * cleared when a marked pupil hands in anyway, so the two should never meet —
 * but if they ever do, the pupil's work is what the teacher sees.
 */
export function pupilRunStatus(responses: { status: string }[], notNeeded = false): PupilRunStatus {
  if (responses.some((r) => r.status === "PENDING")) return "WAITING";
  if (responses.some((r) => r.status === "APPROVED")) return "IN_JAR";
  if (responses.some((r) => r.status === "RETURNED")) return "SENT_BACK";
  return notNeeded ? "NOT_NEEDED" : "NOT_HANDED_IN";
}

/**
 * Who a run is set to, as it stands today.
 *
 * A whole-class run is the class's current register. A chosen-pupil run is the
 * chosen pupils WHO ARE STILL IN THE CLASS: a pupil who has moved on (the
 * September move-up takes the children to a new class and leaves the old one
 * archived) is not this class's to count, and naming them here would put a
 * pupil now taught by somebody else on this teacher's screen.
 */
export function runRosterIds(run: {
  wholeClass: boolean;
  classStudentIds: string[];
  chosenStudentIds: string[];
}): string[] {
  if (run.wholeClass) return run.classStudentIds;
  const chosen = new Set(run.chosenStudentIds);
  return run.classStudentIds.filter((id) => chosen.has(id));
}

export type RunCounts = {
  /** Pupils the run is set to, leaving out anybody marked "not needed". */
  assigned: number;
  /** Pupils who have handed something in, whatever became of it. */
  turnedIn: number;
  inJar: number;
  waiting: number;
  sentBack: number;
  notHandedIn: number;
  /** Pupils marked "not needed" with nothing handed in. Not in `assigned`. */
  notNeeded: number;
};

/**
 * The counts for one run, over the pupils it is set to. Responses from anybody
 * not on `rosterIds` are ignored, so a pupil who has moved class cannot push
 * "handed in" past "set to". A pupil marked "not needed" is counted on their
 * own and left out of `assigned`, so "3 of 5 have handed in" means five pupils
 * who are expected to.
 */
export function summariseRun(rosterIds: string[], responses: Response[], notNeededIds: string[] = []): RunCounts {
  const byPupil = new Map<string, Response[]>();
  for (const r of responses) {
    const list = byPupil.get(r.studentId);
    if (list) list.push(r);
    else byPupil.set(r.studentId, [r]);
  }
  const marked = new Set(notNeededIds);
  const counts: RunCounts = { assigned: 0, turnedIn: 0, inJar: 0, waiting: 0, sentBack: 0, notHandedIn: 0, notNeeded: 0 };
  for (const id of new Set(rosterIds)) {
    const status = pupilRunStatus(byPupil.get(id) ?? [], marked.has(id));
    if (status === "NOT_NEEDED") {
      counts.notNeeded += 1;
      continue;
    }
    counts.assigned += 1;
    if (status !== "NOT_HANDED_IN") counts.turnedIn += 1;
    if (status === "IN_JAR") counts.inJar += 1;
    else if (status === "WAITING") counts.waiting += 1;
    else if (status === "SENT_BACK") counts.sentBack += 1;
    else counts.notHandedIn += 1;
  }
  return counts;
}

/**
 * The shape every run query selects so that it can be counted: the class's
 * register, the chosen pupils, the hand-ins and the "not needed" marks.
 * Structural, so a Prisma result that includes those four relations passes
 * straight in. `excusals` is required rather than optional on purpose: a screen
 * that forgot to select it would count a marked pupil as not handed in, and
 * the compiler is the cheapest place to find that out. (An earlier version of
 * this comment named a `RUN_COUNT_INCLUDE` constant; no such thing exists — each
 * page declares its own include.)
 */
export type RunForCounting = {
  wholeClass: boolean;
  class: { students: { id: string }[] };
  students: { studentId: string }[];
  responses: Response[];
  excusals: { studentId: string }[];
};

export function countRun(run: RunForCounting): RunCounts {
  const rosterIds = runRosterIds({
    wholeClass: run.wholeClass,
    classStudentIds: run.class.students.map((s) => s.id),
    chosenStudentIds: run.students.map((s) => s.studentId),
  });
  return summariseRun(
    rosterIds,
    run.responses,
    run.excusals.map((e) => e.studentId),
  );
}

/** The URL of the page that answers "who has and hasn't done it". */
export function runHref(runId: string): string {
  return `/teacher/activities/runs/${encodeURIComponent(runId)}`;
}
