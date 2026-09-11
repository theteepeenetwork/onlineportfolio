import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { jsonAttachment, momentRecord, slugify } from "@/lib/exportBundle";
import { threadForExport } from "@/lib/messaging/threads";

// Per-pupil export — the answer to "what do you hold about my child".
//
// Same shape and the same mapper as the whole-class export next door, scoped to
// one child, so the two can never disagree about what a moment contains. Read
// the rules at the top of `@/lib/exportBundle` before adding a field.
//
// WHO MAY DO THIS. Exactly the precedent the class export sets, and the pupil's
// own journal page sets with it (`src/app/teacher/students/[studentId]/page.tsx`):
// the teacher whose class the child is in, and nobody else. Not every teacher in
// the school, and not a school ADMIN by virtue of being an admin — an admin
// manages staff, classes and billing and "never sees children's work unless they
// teach the class" (the School model's own words). A subject access request is a
// reason to *read out* what is held, not a reason to widen who may read it. Deny
// by default → 404, which leaks nothing about whether the id exists at all
// (SAFEGUARDING.md rules 4 & 8).
//
// WHAT IS DELIBERATELY NOT HERE, because this file is meant to be handed to a
// parent and each of these would be a disclosure rather than an answer:
//
//  - **The class code and the family code.** Both are live credentials: the
//    class code signs somebody in as any pupil in the class, the family code
//    signs somebody in as a household. A parent asking what is held about their
//    child must not be handed the keys to other children.
//  - **The other parent's name and email.** Where two households are linked to
//    one child, each household's contact details are that household's own data.
//    The teacher's own screen already draws this line and says why.
//  - **`jarSeenAt`.** When a child last opened their jar is wayfinding, and the
//    schema forbids exporting or reporting it. It is not withheld to be
//    difficult; showing a parent when their child looked at their jar is
//    profiling, which SAFEGUARDING rule 11 forbids.
//  - **Unsubmitted drafts.** A child's in-progress work is private to them and
//    is not visible to their teacher either; it is deleted on submit and on
//    30-day expiry. Exporting it through a teacher would break that boundary in
//    the act of honouring a request.
//  - **Media bytes.** Paths are named so nothing is hidden; the files themselves
//    come by a separate identity-checked route.
//
// WHAT WAS ADDED ON 8 SEPTEMBER 2026: the child's message thread with their
// family (SAFEGUARDING rule 21). It is held about this child, so a request that
// asks what the school holds must have it — the same reasoning rule 3's scope
// note already applied to work still in the approval queue. It is resolved
// through `threadForExport`, which is in src/lib/messaging/threads.ts because
// that is the only module allowed to touch those tables, and which withholds
// the conversation from a member of staff who may not read it in the product
// rather than widening rule 21 for the sake of a file. When it is withheld, the
// file SAYS SO in `notIncluded` — the school can then supply it, which is a
// better answer to a subject access request than a silent omission.
//
// WHAT WAS ADDED ON 10 SEPTEMBER 2026: the child's "not needed" marks
// (`AssignmentExcusal`) — each activity a teacher took off this child's to-do
// list, and the date. The data protection lead decided it that day: it is data
// about the child, and Article 15 asks what is held (`docs/dpo-decisions.md`,
// 2026-09-10). Exactly two things per mark, because the row holds exactly
// three and the third is the child: the run's own title, as the child was
// shown it, and when the mark was made. There is no reason to export — the
// table has no column for one, by design — and none is to be invented here.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return new NextResponse("Not found", { status: 404 });

  const student = await db.student.findFirst({
    // The scope is the whole access check: the child must be in a class this
    // teacher owns. Never look a child up by id alone.
    where: { id: studentId, class: { teacherId: user.teacher.id } },
    include: {
      class: { select: { name: true, yearGroup: true } },
      journalItems: {
        orderBy: { createdAt: "asc" },
        include: {
          skills: { select: { name: true } },
          assignment: { select: { title: true, quizSnapshotJson: true } },
        },
      },
      // Permission slips this child's household has answered (rule 22). Held
      // about the child, so disclosed — and read here rather than through
      // `consentForms.ts` because the scope is already established above: the
      // child is in a class this teacher owns, which is the same check
      // `registersForTeacher` makes.
      // Parents'-evening appointments this household has booked (rule 23), by
      // the same reasoning and the same already-established scope.
      meetingSlots: {
        orderBy: { startsAt: "asc" },
        select: {
          startsAt: true,
          bookedAt: true,
          event: { select: { title: true, eventDate: true } },
          teacher: { select: { displayName: true, name: true } },
        },
      },
      consentAnswers: {
        orderBy: { respondedAt: "asc" },
        select: {
          answer: true,
          packedLunch: true,
          respondedAt: true,
          form: { select: { title: true, formBody: true, closesAt: true, asksPackedLunch: true, createdByName: true } },
        },
      },
      // "Not needed" marks, read off THIS child's row and nowhere else, so a
      // classmate's mark on the same activity cannot be in this file by
      // construction rather than by a filter somebody could loosen. Every mark
      // the child has, whichever class the run was in: a mark from last year's
      // class that is still held is still about them. `title` is the run's
      // snapshot, frozen at assign time, not the template's current name.
      excusals: {
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, assignment: { select: { title: true } } },
      },
    },
  });
  if (!student) return new NextResponse("Not found", { status: 404 });

  // How many households can see this child's jar. A COUNT and nothing else.
  //
  // The first draft of this carried one object per household — a createdAt, an
  // emailOnFile flag, and a takenUp flag derived from the session count. The
  // safeguarding review took both apart and it was right on both:
  //
  //  - `takenUp` was simply wrong. Parent sessions are per-signed-in-browser and
  //    are purged within 7 days of expiry (RETENTION.md), so a session count
  //    means "signed in at this moment", not "has ever used it". A household
  //    that only had an address recorded read as taken up; one that used it in
  //    the spring and signed out read as not. A real answer needs a
  //    lastSignInAt column, which is a schema change and is not this week's.
  //  - Omitting the name and the address is not de-identification when there
  //    are exactly two households and the person reading the file is one of
  //    them. A date plus a flag tells parent A when parent B was given access
  //    and whether B registered an address. Separated households are the
  //    ordinary case that hurts, not an edge case.
  //
  // So: the number, which is genuinely about the child, and nothing that is
  // about the other adults in their life.
  const familyPlaces = await db.parent.count({
    where: { children: { some: { id: student.id } } },
  });

  // The conversation between this child's family and the school. Null when
  // there has never been one; `withheldBecause` when there is one this member
  // of staff may not read.
  const thread = await threadForExport(user.teacher.id, student.id);

  // Work in this file that no adult has yet decided is suitable to share.
  //
  // SAFEGUARDING rule 3 is that no child content reaches anyone before a
  // teacher has approved it, and it names an export and a parent in terms. The
  // completeness argument for including PENDING and RETURNED work is sound —
  // it is held, so it is disclosed — but completeness on its own removes the
  // human gate the queue exists to be. The unlucky case is concrete: a child
  // writes something about home, it is still in the queue, and a teacher hands
  // over four hundred lines of JSON without reading it.
  //
  // So the count is at the TOP of the payload, before the moments themselves,
  // and it is repeated in plain words beside the button that produces the file.
  // The gate is a person reading it; this is what makes them look.
  const notApproved = student.journalItems.filter((j) => j.status !== "APPROVED").length;

  const data = {
    schema: "storyjar-pupil-export-v1",
    exportedAt: new Date().toISOString(),
    exportedBy: user.teacher.displayName,
    pupil: {
      // An internal reference, so the school can match a later request for the
      // media files to the right child without going by first name alone.
      id: student.id,
      firstName: student.name, // first names only — no surnames are ever stored
      createdAt: student.createdAt,
      class: {
        name: student.class.name,
        yearGroup: student.class.yearGroup,
      },
    },
    reviewBeforeSharing: {
      momentsNotApproved: notApproved,
      note:
        notApproved === 0
          ? "Every piece of work in this file has been through the approval queue."
          : `${notApproved} of the pieces of work in this file ${notApproved === 1 ? "has" : "have"} not been ` +
            "through the approval queue — work still waiting to be approved, and work a teacher sent " +
            "back. No adult has yet decided that it is suitable to share. Read it before you give this " +
            "file to anyone.",
    },
    // Every piece of work held for this child, in the order it arrived, whatever
    // its status. Work waiting for approval and work sent back with a note are
    // both held by the school, so both are here.
    moments: student.journalItems.map(momentRecord),
    familyAccess: {
      places: familyPlaces,
    },
    // Every message either side has written, in order, INCLUDING any still
    // waiting for the school's office hours to open — the hold governs when a
    // message is delivered, not whether it is held, so one written at nine at
    // night is on the school's disk and is disclosed with the time it will
    // arrive (SAFEGUARDING rule 21).
    messages: thread && !thread.withheldBecause ? thread.messages : [],
    messageThreadReaders: thread && !thread.withheldBecause ? thread.readers : [],
    // What the school asked permission for, and what the family answered. The
    // form's own text is included because a bare "GIVEN" answers nothing: what
    // was consented to is the point of the record.
    permissionSlips: student.consentAnswers.map((r) => ({
      title: r.form.title,
      askedFor: r.form.formBody,
      answersAskedForBy: r.form.closesAt ? r.form.closesAt.toISOString() : null,
      sentBy: r.form.createdByName,
      answer: r.answer,
      packedLunchRequested: r.form.asksPackedLunch ? r.packedLunch : null,
      answeredAt: r.respondedAt.toISOString(),
    })),
    // Appointments booked for this child. The TIME is here because it is what
    // is held; it is not in the audit log, for the reason RETENTION.md gives.
    parentsEveningAppointments: student.meetingSlots.map((m) => ({
      evening: m.event.title,
      on: m.event.eventDate,
      startsAt: m.startsAt.toISOString(),
      with: m.teacher.displayName ?? m.teacher.name,
      bookedAt: m.bookedAt ? m.bookedAt.toISOString() : null,
    })),
    // Activities a teacher took off this child's to-do list, and when. Only the
    // marks that stand today: Put back, or the child handing in anyway, deletes
    // the row (RETENTION.md), so a mark that was undone is not held and is not
    // here.
    notNeeded: student.excusals.map((x) => ({
      activity: x.assignment.title,
      markedAt: x.createdAt.toISOString(),
    })),
    // Named rather than silently missing, so the reader knows what exists and
    // can ask the school for it. The school states how it handles those
    // requests; this file does not.
    notIncluded: [
      ...(thread?.withheldBecause ? [thread.withheldBecause] : []),
      ...(thread === null
        ? ["No messages: this child's family and the school have never used StoryJar's messages, or the school does not have them switched on."]
        : []),
      "The media files themselves (photos, drawings, voice notes). Their paths are listed above; the files are supplied separately by the school.",
      "Unsubmitted drafts, which are private to the child and are deleted when the work is handed in, or 30 days after it was last touched.",
      ...(student.consentAnswers.length === 0
        ? ["No permission slips: the school has not sent one to this class, or this household has not answered one."]
        : []),
      ...(student.meetingSlots.length === 0
        ? ["No parents'-evening appointments: the school has not held one for this class, or this household has not booked."]
        : []),
      // The staff line used to say staff names were not included, three lines
      // below the name of the member of staff who produced the file. The
      // accountability is worth more than the omission, so `exportedBy` stays
      // and this says what is actually true.
      "Names, email addresses and sign-in codes belonging to the child's household. The only member of staff named is the one who produced this file, above.",
    ],
  };

  // Rule 16 names data exports among the actions that must be accountable, and
  // this one puts a child's whole record into a file that leaves the building.
  // The child is NOT named in `detail`: subjectType STUDENT is already in the
  // admin console's redaction set, so an admin who does not teach this class
  // sees the who, the what and the when and not the child (rule 5).
  await recordAudit({
    action: "PUPIL_DATA_EXPORTED",
    actorType: user.teacher.staffRole === "ADMIN" ? "ADMIN" : "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.displayName,
    schoolId: user.teacher.schoolId,
    subjectType: "STUDENT",
    subjectId: student.id,
    detail:
      `Exported one pupil's data (${data.moments.length} moment${data.moments.length === 1 ? "" : "s"}, ` +
      `${notApproved} not approved; file paths only, no media files; ` +
      `${data.messages.length} message${data.messages.length === 1 ? "" : "s"} with their family)`,
  });

  const filename = `storyjar-${slugify(student.name, "pupil")}-${data.exportedAt.slice(0, 10)}.json`;
  return jsonAttachment(data, filename);
}
