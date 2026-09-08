"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

// ===========================================================================
// A school asks one of its teachers for a copy of a class's data.
//
// docs/paid-tier-plan.md item 3, and the gap it names:
//
//   "A subject access request lands on the school office, not the class
//    teacher, and the landing page already promises whole-school export. But
//    rule 5 says an admin never sees a pupil's work… That is a real gap, not an
//    oversight to route around."
//
// THE SHAPE, chosen 8 September 2026 from the two that document leaves open:
// **the admin asks, the teacher who holds the class fulfils.** The admin sees
// that the request was made and whether it has been done. They never see what is
// inside, and there is no route by which they could.
//
// The rejected alternative was a one-time link the admin can forward without
// opening. It needs a token, an expiry and a new way to reach a class's data,
// and it ends with a URL that is a class of children's work to anybody holding
// it. This one needs none of those: the file is produced by the person who could
// already produce it, through the route that already existed
// (`/teacher/export/[classId]`), and the only new thing is that they now know
// they have been asked.
//
// WHY IT IS NOT `docs/exceptional-access.md`. That procedure governs access to a
// child's data that does NOT come through a StoryJar screen — the operator
// opening the database, reading the volume, restoring a backup. Everything here
// happens inside the product, under rules 4 to 7, and the person who reads the
// data is the one who could always read it. What this borrows from that document
// is its shape: a stated reason, recorded, before anything is looked at.
// ===========================================================================

export type ExportRequestState = { error?: string; done?: string };

const MIN_REASON = 12;

/** The school asks its teacher for a copy of a class's records. */
export async function requestClassExport(
  _prev: ExportRequestState | undefined,
  formData: FormData,
): Promise<ExportRequestState> {
  const { teacherId, schoolId, actorName } = await requireAdmin();

  const classId = String(formData.get("classId") ?? "");
  const reason = String(formData.get("requestReason") ?? "").trim();

  // Scoped to this school, by id and school together and never by id alone.
  const klass = await db.class.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, name: true, teacher: { select: { name: true, displayName: true } } },
  });
  if (!klass) return { error: "That class isn't one of yours." };

  if (reason.length < MIN_REASON) {
    return { error: "Please say in a sentence what the copy is for — it is kept as the record of the request." };
  }

  // ONE OUTSTANDING REQUEST PER CLASS. Asking twice is not twice as urgent, and
  // a teacher opening a list of five identical asks learns nothing from the
  // fifth. A second ask while one is outstanding is refused with the date of the
  // first, which is the information the admin actually wanted.
  const open = await db.exportRequest.findFirst({
    where: { classId: klass.id, fulfilledAt: null },
    select: { createdAt: true },
  });
  if (open) {
    const when = open.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    return { error: `${klass.name} was already asked on ${when} and has not been done yet.` };
  }

  await db.exportRequest.create({
    data: {
      schoolId,
      classId: klass.id,
      requestedByTeacherId: teacherId,
      // The name is SNAPSHOTTED, so the record still reads correctly after the
      // admin has left the school — the same reasoning as
      // `SchoolInvitation.invitedByName`.
      requestedByName: actorName,
      requestReason: reason,
    },
  });

  await recordAudit({
    action: "CLASS_EXPORT_REQUESTED",
    actorType: "ADMIN",
    actorId: teacherId,
    actorName,
    schoolId,
    subjectType: "CLASS",
    subjectId: klass.id,
    // The reason is NOT copied here. It lives on the request row, which the
    // teacher and the admin can both read and the operator cannot; putting it in
    // an audit detail as well would be a second copy on a different retention
    // clock, which is the argument that keeps message bodies out of this log too.
    detail: `${actorName} asked ${klass.teacher.displayName ?? klass.teacher.name} for a copy of ${klass.name}'s data.`,
  });

  revalidatePath("/admin");
  revalidatePath("/teacher/class");
  return { done: `Asked for a copy of ${klass.name}. It is now on that class teacher's screen.` };
}

/**
 * The teacher marks a request done, having produced the file.
 *
 * SEPARATE FROM THE EXPORT ITSELF, deliberately. The export is a GET that
 * streams a file, and a route that also wrote would be a route a preview fetch
 * or a double-click could mark done without anybody having the file. So the
 * teacher downloads, then says they have — and if they never say so, the request
 * stays outstanding on the admin's screen, which is the honest state.
 */
export async function markExportDone(
  _prev: ExportRequestState | undefined,
  formData: FormData,
): Promise<ExportRequestState> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return { error: "Not found." };

  const requestId = String(formData.get("requestId") ?? "");
  // Resolved through the CLASS THIS TEACHER HOLDS, never by request id alone: a
  // colleague cannot clear somebody else's ask, and an id off a form names
  // nothing on its own (rule 8).
  const request = await db.exportRequest.findFirst({
    where: { id: requestId, fulfilledAt: null, class: { teacherId: user.teacher.id } },
    select: { id: true, schoolId: true, class: { select: { id: true, name: true } } },
  });
  if (!request) return { error: "That request isn't one of yours." };

  await db.exportRequest.update({ where: { id: request.id }, data: { fulfilledAt: new Date() } });

  await recordAudit({
    action: "CLASS_EXPORT_FULFILLED",
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.displayName,
    schoolId: request.schoolId,
    subjectType: "CLASS",
    subjectId: request.class.id,
    detail: `${user.teacher.displayName} produced the copy of ${request.class.name} the school asked for.`,
  });

  revalidatePath("/admin");
  revalidatePath("/teacher/class");
  return { done: `Marked done. The school can see it has been sorted; they cannot see what is in it.` };
}
