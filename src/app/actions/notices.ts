"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { resolveMayMessageParents, schoolMessaging } from "@/lib/messaging/policy";
import { NOTICE_MAX_BODY, NOTICE_MAX_TITLE, normaliseAudience } from "@/lib/notices";

// ===========================================================================
// Notices — sending one, and taking one down (SAFEGUARDING rule 24).
//
// WHO MAY SEND:
//   • A school ADMIN, to the whole school or to chosen classes of their school.
//   • A TEACHER, to classes they HOLD — and only if the school's per-staff
//     switch says they may write to families (`resolveMayMessageParents`). The
//     switch is the school's decision about who may write to families, and a
//     notice is writing to families. It does NOT require the school to have
//     switched conversations on: a school that wants notices without a two-way
//     channel is a real case, and the two are separate decisions.
//   • Both need a school plan, like a permission slip or a parents' evening.
//
// THERE IS NO ACTION A PARENT CAN CALL. That is not an omission in this file;
// it is the feature. A notice has no reply table, so there is nothing an action
// could write, and the family space renders no form (rule 24).
//
// NO OFFICE-HOURS HOLD. Rule 21's hold exists so a teacher's evening is not a
// workplace; nothing here is delivered TO a teacher. NO EMAIL either — rule 6b
// says its email is about a conversation, and a school posting at nine at night
// must not email every family at nine at night.
// ===========================================================================

export type NoticeState = { error?: string; done?: string };

type Sender = {
  teacherId: string;
  schoolId: string;
  name: string;
  role: "ADMIN" | "TEACHER";
};

/** Who is sending, resolved from the session and the school — never from the form. */
async function resolveSender(): Promise<Sender | { error: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/login/teacher");
  const me = await db.teacher.findUnique({
    where: { id: user.teacher.id },
    select: { id: true, name: true, displayName: true, role: true, schoolId: true, status: true, mayMessageParents: true },
  });
  if (!me?.schoolId || me.status !== "ACTIVE") return { error: "Notices come with a school plan." };
  const messaging = await schoolMessaging(me.schoolId);
  if (!messaging.onSchoolPlan) return { error: "Notices come with a school plan." };
  const isAdmin = me.role === "ADMIN";
  if (!isAdmin && !resolveMayMessageParents(me)) {
    return { error: "You aren’t set up to write to families. Ask your school admin if you think you should be." };
  }
  return { teacherId: me.id, schoolId: me.schoolId, name: me.displayName ?? me.name, role: isAdmin ? "ADMIN" : "TEACHER" };
}

/** A member of staff sends a notice to families. */
export async function sendNotice(_prev: NoticeState | undefined, formData: FormData): Promise<NoticeState> {
  const sender = await resolveSender();
  if ("error" in sender) return { error: sender.error };

  const title = String(formData.get("title") ?? "").trim();
  const noticeBody = String(formData.get("noticeBody") ?? "").trim();
  const audience = normaliseAudience(formData.get("audience"));
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);

  if (!title) return { error: "Give the notice a title — a few words a parent will recognise in a list." };
  if (title.length > NOTICE_MAX_TITLE) return { error: `That title is a little long — ${NOTICE_MAX_TITLE} characters or fewer, please.` };
  if (!noticeBody) return { error: "Write the notice first." };
  if (noticeBody.length > NOTICE_MAX_BODY) return { error: `That is longer than a notice needs to be — ${NOTICE_MAX_BODY} characters or fewer.` };
  if (!audience) return { error: "Choose who it goes to." };

  // WHOLE SCHOOL IS THE OFFICE'S TO SEND. A teacher may address the classes
  // they hold and nobody else; a posted "SCHOOL" from a teacher's session is
  // refused rather than narrowed, so a stale tab cannot widen a send.
  if (audience === "SCHOOL" && sender.role !== "ADMIN") return { error: "Only the school office can send a notice to the whole school." };

  let classes: Array<{ id: string; name: string }> = [];
  if (audience === "CLASSES") {
    if (classIds.length === 0) return { error: "Choose at least one class." };
    // Every class resolved WITH the school, and for a teacher WITH the holder,
    // never by id alone (rule 8). A posted id that is not theirs does not come
    // back, and the count check turns that into a refusal, not a partial send.
    classes = await db.class.findMany({
      where: {
        id: { in: classIds },
        schoolId: sender.schoolId,
        archivedAt: null,
        ...(sender.role === "ADMIN" ? {} : { teacherId: sender.teacherId }),
      },
      select: { id: true, name: true },
    });
    if (classes.length !== classIds.length) return { error: "One of those classes isn’t one of yours." };
  }

  const notice = await db.notice.create({
    data: {
      schoolId: sender.schoolId,
      title,
      noticeBody,
      audience,
      sentByTeacherId: sender.teacherId,
      sentByName: sender.name,
      sentByRole: sender.role,
      classes: { create: classes.map((c) => ({ classId: c.id })) },
    },
    select: { id: true },
  });

  await recordAudit({
    action: "NOTICE_SENT",
    actorType: sender.role,
    actorId: sender.teacherId,
    actorName: sender.name,
    schoolId: sender.schoolId,
    subjectType: "SCHOOL",
    subjectId: sender.schoolId,
    // The title is the school's own name for its notice. The BODY is not copied
    // here: it lives on the row, and a second copy on a different retention
    // clock is what keeps message bodies and form text out of this log too.
    detail:
      audience === "SCHOOL"
        ? `${sender.name} sent the notice "${title}" to the whole school.`
        : `${sender.name} sent the notice "${title}" to ${classes.map((c) => c.name).join(", ")}.`,
  });

  revalidatePath("/admin");
  revalidatePath("/family");
  revalidatePath("/teacher/messages");
  void notice;
  return {
    done:
      audience === "SCHOOL"
        ? "Sent to every family in the school. They will see it next time they open the jar."
        : `Sent to ${classes.length === 1 ? classes[0].name : `${classes.length} classes`}. Families will see it next time they open the jar.`,
  };
}

/** The sender, or any admin of the school, takes a notice down. Never deletes. */
export async function retractNotice(formData: FormData): Promise<void> {
  const sender = await resolveSender();
  if ("error" in sender) return;
  const noticeId = String(formData.get("noticeId") ?? "");

  // Resolved with the school and, for a teacher, with the sender: an id from
  // another school, or a colleague's notice, finds nothing and does nothing.
  const notice = await db.notice.findFirst({
    where: {
      id: noticeId,
      schoolId: sender.schoolId,
      retractedAt: null,
      ...(sender.role === "ADMIN" ? {} : { sentByTeacherId: sender.teacherId }),
    },
    select: { id: true, title: true },
  });
  if (!notice) return;

  await db.notice.update({
    where: { id: notice.id },
    data: { retractedAt: new Date(), retractedByName: sender.name },
  });

  await recordAudit({
    action: "NOTICE_RETRACTED",
    actorType: sender.role,
    actorId: sender.teacherId,
    actorName: sender.name,
    schoolId: sender.schoolId,
    subjectType: "SCHOOL",
    subjectId: sender.schoolId,
    detail: `${sender.name} took down the notice "${notice.title}".`,
  });

  revalidatePath("/admin");
  revalidatePath("/family");
  revalidatePath("/teacher/messages");
}
