"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getCurrentParent } from "@/lib/parentAuth";
import { recordAudit } from "@/lib/audit";
import { normaliseAnswer } from "@/lib/consent";

// ===========================================================================
// Permission slips — sending one, and answering one.
//
// THE SCHOOL WRITES THE QUESTION AND NEVER AN ANSWER. `src/lib/consent.ts` owns
// the answers and says why at length; the short version is SAFEGUARDING rule 19,
// and that a school free to type its own answer labels puts "nut allergy?
// yes/no" on a form within a term. There is no free-text field on a response in
// this file or anywhere else, and `normaliseAnswer` refuses anything that is not
// one of the two values rather than storing what it was given.
//
// WHO MAY DO WHAT:
//   • A school ADMIN sends a form to classes of their own school.
//   • A linked PARENT answers, for a child linked to them, once per form.
//   • A class TEACHER reads their own class's register (a page, not an action).
//   • The admin who sent it reads the register for the classes it went to.
//
// THAT LAST ONE NEEDS SAYING OUT LOUD, because rule 5 says an admin never sees a
// child's work. A permission slip is not a child's work: it is an administrative
// record of a DECISION AN ADULT MADE, of exactly the same kind as the register
// of who is going on the trip — which the office has always held on paper. The
// rule 21 amendment states that as an "administrative records" clause rather
// than leaving it to be inferred, because the next person to read rule 5 should
// find the answer rather than have to reason it out.
//
// NO OFFICE-HOURS HOLD. Forms are school-initiated and one-way; the hold in rule
// 21 exists so a teacher's evening is not a workplace, and a slip that appears
// in a family space costs a teacher nothing.
// ===========================================================================

export type ConsentState = { error?: string; done?: string };

const MAX_TITLE = 120;
const MAX_BODY = 2000;

/** A school sends a permission slip to one or more of its classes. */
export async function sendConsentForm(_prev: ConsentState | undefined, formData: FormData): Promise<ConsentState> {
  const { teacherId, schoolId, actorName } = await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const formBody = String(formData.get("formBody") ?? "").trim();
  const asksPackedLunch = formData.get("asksPackedLunch") === "on";
  const closesRaw = String(formData.get("closesAt") ?? "").trim();
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);

  if (!title) return { error: "Give the form a name — something a parent will recognise in a list." };
  if (title.length > MAX_TITLE) return { error: "That name is a little long — 120 characters or fewer, please." };
  if (!formBody) return { error: "Say what you are asking permission for." };
  if (formBody.length > MAX_BODY) return { error: "That is longer than a permission slip needs to be — 2,000 characters or fewer." };
  if (classIds.length === 0) return { error: "Choose at least one class to send it to." };

  // Every class resolved with the school, never by id alone (rule 8). A posted
  // id that is not this school's simply does not come back, and the count check
  // below is what turns that into a refusal rather than a partial send.
  const classes = await db.class.findMany({
    where: { id: { in: classIds }, schoolId, archivedAt: null },
    select: { id: true, name: true },
  });
  if (classes.length !== classIds.length) return { error: "One of those classes isn't one of yours." };

  // A closing date is optional and advisory: a late answer is still an answer,
  // and the register shows who has not replied rather than shutting them out.
  const closesAt = closesRaw ? new Date(`${closesRaw}T23:59:59`) : null;
  if (closesAt && Number.isNaN(closesAt.getTime())) return { error: "That closing date doesn't look like a date." };

  const form = await db.consentForm.create({
    data: {
      schoolId,
      title,
      formBody,
      asksPackedLunch,
      closesAt,
      createdByTeacherId: teacherId,
      // Snapshotted, so the record still reads correctly after the admin leaves
      // — the `SchoolInvitation.invitedByName` precedent.
      createdByName: actorName,
      classes: { create: classes.map((c) => ({ classId: c.id })) },
    },
    select: { id: true },
  });

  await recordAudit({
    action: "CONSENT_FORM_SENT",
    actorType: "ADMIN",
    actorId: teacherId,
    actorName,
    schoolId,
    subjectType: "SCHOOL",
    subjectId: schoolId,
    // The form's own text is NOT copied here: it lives on the row, and a second
    // copy on a different retention clock is what keeps message bodies out of
    // this log too. The title is the school's name for its own trip.
    detail: `${actorName} sent the permission slip "${title}" to ${classes.map((c) => c.name).join(", ")}.`,
  });

  revalidatePath("/admin");
  revalidatePath("/family");
  return { done: `Sent to ${classes.length} ${classes.length === 1 ? "class" : "classes"}. Families will see it next time they open the jar.` };
}

/** A parent answers, for one of their own children. */
export async function answerConsentForm(_prev: ConsentState | undefined, formData: FormData): Promise<ConsentState> {
  const parent = await getCurrentParent();
  if (!parent) redirect("/family");

  const formId = String(formData.get("formId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const answer = normaliseAnswer(formData.get("answer"));
  const packedLunch = formData.get("packedLunch") === "on";

  if (!answer) return { error: "Please choose one of the two answers." };

  // BOTH ENDS RESOLVED FROM THE SESSION AND THE LINK, never from the form
  // alone: the child must be linked to THIS parent, and the form must have gone
  // to that child's class. Either failing is the same generic refusal and no
  // row (rule 8).
  const child = parent.children.find((c) => c.id === studentId);
  if (!child) return { error: "That isn't one of your children." };

  const form = await db.consentForm.findFirst({
    where: { id: formId, classes: { some: { class: { students: { some: { id: studentId } } } } } },
    select: { id: true, title: true, schoolId: true, asksPackedLunch: true },
  });
  if (!form) return { error: "That form isn't one of yours." };

  // ONE ANSWER PER CHILD PER FORM, and the later one stands. Two guardians do
  // not get a vote each: a school chasing a slip needs one row per child, not an
  // argument between two households. The unique index is the guarantee; the
  // upsert is how it is used.
  await db.consentResponse.upsert({
    where: { formId_studentId: { formId: form.id, studentId } },
    create: {
      formId: form.id,
      studentId,
      parentId: parent.id,
      answer,
      // Only ever true when the school asked. A posted value on a form that does
      // not ask is dropped rather than stored.
      packedLunch: form.asksPackedLunch && packedLunch,
    },
    update: {
      parentId: parent.id,
      answer,
      packedLunch: form.asksPackedLunch && packedLunch,
      respondedAt: new Date(),
    },
  });

  await recordAudit({
    action: "CONSENT_ANSWERED",
    actorType: "PARENT",
    actorId: parent.id,
    schoolId: form.schoolId,
    subjectType: "STUDENT",
    subjectId: studentId,
    // `subjectType: "STUDENT"` puts this in the admin console's redaction set,
    // so an admin who does not teach this class sees the who, the what and the
    // when without the child (rule 5). The ANSWER is not in the detail either:
    // the register is where a school reads answers, and an audit line that
    // carried one would be a second copy on a different clock.
    detail: `A family answered the permission slip "${form.title}".`,
  });

  revalidatePath("/family");
  revalidatePath("/admin");
  revalidatePath("/teacher/class");
  return { done: "Thank you — that is recorded. You can change it any time before the school closes the form." };
}
