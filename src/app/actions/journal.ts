"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { savePhoto, saveImageDataUrl, saveImagePages, deleteMediaFiles } from "@/lib/media";
import { recordAudit } from "@/lib/audit";
import { readQuiz, readAnswers, sanitizeAnswers, scoreQuiz } from "@/lib/quiz";
import {
  requireWritableAccount,
  requireWritableAccountForClass,
  FROZEN_TEACHER_MESSAGE,
  FROZEN_STUDENT_MESSAGE,
} from "@/lib/billing";

// A student (or teacher) adds a new piece of work to a journal.
// Student-created items always start life in the approval queue (PENDING);
// teacher-created items are published straight away.
export async function createJournalItem(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const type = String(formData.get("type") ?? "");
  const caption = String(formData.get("caption") ?? "").trim() || null;

  // Work out which student this item belongs to and who is creating it.
  let studentId: string;
  let classId: string;
  let authorRole: "STUDENT" | "TEACHER";

  if (user.role === "STUDENT") {
    studentId = user.student.id;
    classId = user.student.classId;
    authorRole = "STUDENT";
  } else {
    // Teacher is posting on behalf of a student.
    studentId = String(formData.get("studentId") ?? "");
    authorRole = "TEACHER";
    const student = await db.student.findUnique({ where: { id: studentId } });
    if (!student) return { error: "Please choose a student." };
    classId = student.classId;
  }

  // Write gate: adding work is blocked while the governing account is frozen
  // (read-only). Enforced on the server for both pupils and teachers — the
  // class's teacher's subscription governs (SAFEGUARDING rules 4, 8).
  const gate = await requireWritableAccountForClass(classId);
  if (!gate.ok) {
    return { error: user.role === "STUDENT" ? FROZEN_STUDENT_MESSAGE : FROZEN_TEACHER_MESSAGE };
  }

  // Build the type-specific content.
  let textContent: string | null = null;
  let mediaPath: string | null = null;
  let mediaPathsJson: string | null = null;

  try {
    if (type === "TEXT") {
      textContent = String(formData.get("textContent") ?? "").trim();
      if (!textContent) return { error: "Please write something first." };
    } else if (type === "PHOTO") {
      // A photo can arrive as an uploaded file or as a live camera capture
      // (a data URL in the `photoData` field).
      const file = formData.get("photo");
      const photoData = String(formData.get("photoData") ?? "");
      if (file instanceof File && file.size > 0) {
        mediaPath = await savePhoto(file);
      } else if (photoData) {
        mediaPath = await saveImageDataUrl(photoData);
      } else {
        return { error: "Please take or choose a photo to add." };
      }
    } else if (type === "DRAWING") {
      // Drawings arrive as a JSON array of PNG data URLs, one per page.
      const raw = String(formData.get("drawingPages") ?? "");
      let pages: string[] = [];
      try {
        pages = raw ? (JSON.parse(raw) as string[]) : [];
      } catch {
        pages = [];
      }
      pages = pages.filter((p) => typeof p === "string" && p.startsWith("data:image"));
      if (pages.length === 0) return { error: "Please draw something first." };
      const paths = await saveImagePages(pages);
      mediaPath = paths[0];
      mediaPathsJson = paths.length > 1 ? JSON.stringify(paths) : null;
    } else {
      return { error: "Please choose how you'd like to add your work." };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong saving your work." };
  }

  // Skills tagged against the item (teacher-side only, sent as repeated fields).
  const skillIds = formData.getAll("skillIds").map(String).filter(Boolean);

  // When responding to an assigned activity, link the item back to the run.
  const assignmentId = String(formData.get("assignmentId") ?? "") || null;

  // Quiz answers (if this run carries a quiz) are captured on this same item and
  // scored server-side. Never trust the assignmentId from the form: re-resolve
  // the run scoped to THIS child, so a crafted id from another school can't
  // attach a response or pull another class's quiz (SAFEGUARDING rules 4 & 8).
  let quizAnswersJson: string | null = null;
  let quizScore: number | null = null;
  let quizTotal: number | null = null;
  if (assignmentId) {
    const assignment = await db.assignment.findFirst({
      where: {
        id: assignmentId,
        OR: [
          { wholeClass: true, classId },
          { wholeClass: false, students: { some: { studentId } } },
        ],
      },
      select: { id: true, quizSnapshotJson: true },
    });
    if (!assignment) return { error: "That activity isn't available." };

    const quiz = readQuiz(assignment.quizSnapshotJson);
    if (quiz.questions.length) {
      const answers = sanitizeAnswers(quiz, readAnswers(String(formData.get("quizAnswers") ?? "")));
      const { score, total } = scoreQuiz(quiz, answers);
      quizAnswersJson = JSON.stringify(answers);
      quizScore = score;
      quizTotal = total;
    }
  }

  const isTeacher = authorRole === "TEACHER";

  // If this is a re-do of a handed-back activity, update the existing RETURNED
  // item in place rather than creating a second one — one item per pupil+run,
  // so the run doesn't show as both "sent back" and "waiting". Scoped to THIS
  // pupil, so a crafted id can't touch another child's work (SAFEGUARDING 4, 8).
  const returned = assignmentId
    ? await db.journalItem.findFirst({
        where: { assignmentId, studentId, status: "RETURNED" },
        select: { id: true, mediaPath: true, mediaPathsJson: true },
      })
    : null;

  if (returned) {
    await db.journalItem.update({
      where: { id: returned.id },
      data: {
        type,
        caption,
        textContent,
        mediaPath,
        mediaPathsJson,
        quizAnswersJson,
        quizScore,
        quizTotal,
        status: isTeacher ? "APPROVED" : "PENDING",
        approvedAt: isTeacher ? new Date() : null,
        teacherNote: null, // the previous feedback has been acted on
        authorRole,
        skills: { set: skillIds.map((id) => ({ id })) },
      },
    });

    // Erase the previous attempt's media (right to erasure, SAFEGUARDING rule 9).
    // The new attempt saved to fresh paths above, so these are safe to remove.
    const oldMedia: Array<string | null> = [returned.mediaPath];
    if (returned.mediaPathsJson) {
      try {
        const paths = JSON.parse(returned.mediaPathsJson);
        if (Array.isArray(paths)) for (const p of paths) if (typeof p === "string") oldMedia.push(p);
      } catch {
        // Malformed JSON — nothing to erase from it.
      }
    }
    await deleteMediaFiles(oldMedia);
  } else {
    await db.journalItem.create({
      data: {
        type,
        caption,
        textContent,
        mediaPath,
        mediaPathsJson,
        quizAnswersJson,
        quizScore,
        quizTotal,
        status: isTeacher ? "APPROVED" : "PENDING",
        approvedAt: isTeacher ? new Date() : null,
        authorRole,
        studentId,
        classId,
        assignmentId,
        skills: skillIds.length
          ? { connect: skillIds.map((id) => ({ id })) }
          : undefined,
      },
    });
  }

  if (user.role === "STUDENT") {
    revalidatePath("/student");
    redirect("/student/popped");
  } else {
    revalidatePath("/teacher/queue");
    revalidatePath(`/teacher/students/${studentId}`);
    redirect(`/teacher/students/${studentId}`);
  }
}

// Find a journal item the current teacher is allowed to moderate — i.e. one in
// a class they teach. Returns null (deny) otherwise, so a teacher can never act
// on another class's item by guessing its id (SAFEGUARDING.md rules 4 & 8).
async function ownedItem(teacherId: string, id: string) {
  return db.journalItem.findFirst({
    where: { id, class: { teacherId } },
    select: {
      id: true,
      studentId: true,
      mediaPath: true,
      mediaPathsJson: true,
      student: { select: { name: true } },
    },
  });
}

// Teacher approves a pending item, optionally tagging skills as they go.
export async function approveItem(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  // Approval is a mutation — blocked while the account is frozen (read-only).
  const gate = await requireWritableAccount();
  if (!gate.ok) redirect("/teacher/account?frozen=1");

  const id = String(formData.get("itemId") ?? "");
  const skillIds = formData.getAll("skillIds").map(String).filter(Boolean);

  const item = await ownedItem(user.teacher.id, id);
  if (!item) return; // not this teacher's class — do nothing

  await db.journalItem.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      skills: skillIds.length ? { set: skillIds.map((sid) => ({ id: sid })) } : undefined,
    },
  });
  await recordAudit({
    action: "MOMENT_APPROVED", actorType: "TEACHER", actorId: user.teacher.id, actorName: user.teacher.displayName,
    schoolId: user.teacher.schoolId, subjectType: "JOURNAL_ITEM", subjectId: id, detail: `Approved ${item.student.name}'s moment`,
  });

  revalidatePath("/teacher/queue");
  revalidatePath("/teacher");
}

// Teacher returns a pending item with a note asking for another go.
export async function returnItem(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  // Returning work is a mutation — blocked while the account is frozen.
  const gate = await requireWritableAccount();
  if (!gate.ok) redirect("/teacher/account?frozen=1");

  const id = String(formData.get("itemId") ?? "");
  const note = String(formData.get("teacherNote") ?? "").trim() || null;

  const item = await ownedItem(user.teacher.id, id);
  if (!item) return;

  await db.journalItem.update({
    where: { id },
    data: { status: "RETURNED", teacherNote: note },
  });
  await recordAudit({
    action: "MOMENT_RETURNED", actorType: "TEACHER", actorId: user.teacher.id, actorName: user.teacher.displayName,
    schoolId: user.teacher.schoolId, subjectType: "JOURNAL_ITEM", subjectId: id, detail: `Sent ${item.student.name}'s moment back`,
  });

  revalidatePath("/teacher/queue");
}

// Delete an item (teacher only). Deliberately NOT write-gated: deletion (right
// to erasure) stays available even in a frozen account (RETENTION.md: FROZEN
// blocks mutations "except account management, data export, and deletion").
export async function deleteItem(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const id = String(formData.get("itemId") ?? "");
  const item = await ownedItem(user.teacher.id, id);
  if (!item) return;

  // Gather every media file this moment owns before we drop the row, so we can
  // erase the files too — deletion of a child's work must be real, not just a
  // row removal (SAFEGUARDING.md rule 9). Mirrors deleteClass in classes.ts.
  const mediaUrls: Array<string | null> = [item.mediaPath];
  if (item.mediaPathsJson) {
    try {
      const paths = JSON.parse(item.mediaPathsJson);
      if (Array.isArray(paths)) {
        for (const p of paths) if (typeof p === "string") mediaUrls.push(p);
      }
    } catch {
      // Malformed JSON — nothing to erase from it.
    }
  }

  await db.journalItem.delete({ where: { id } });
  await deleteMediaFiles(mediaUrls);
  await recordAudit({
    action: "MOMENT_DELETED", actorType: "TEACHER", actorId: user.teacher.id, actorName: user.teacher.displayName,
    schoolId: user.teacher.schoolId, subjectType: "JOURNAL_ITEM", subjectId: id, detail: `Deleted ${item.student.name}'s moment`,
  });

  revalidatePath("/teacher/queue");
  revalidatePath("/teacher");
}
