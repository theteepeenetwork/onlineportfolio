"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deriveChildNames } from "@/lib/childNames";
import { deleteMediaFiles } from "@/lib/media";
import { gatherDraftPaths } from "@/lib/drafts";
import { requireWritableAccount, FROZEN_TEACHER_MESSAGE } from "@/lib/billing";

const AVATAR_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
];

// Teacher adds one or several students at once by pasting a list (one name per
// line, or separated by commas). Teachers can paste a register that includes
// surnames — we keep only the first name (SAFEGUARDING.md rule 2), and where a
// first name repeats we add the shortest surname prefix that tells them apart
// (see deriveChildNames). Blank lines and exact duplicates are ignored.
export async function addStudents(
  _prev: { error?: string; added?: number } | undefined,
  formData: FormData,
): Promise<{ error?: string; added?: number }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  // Adding children is a mutation — blocked while the account is frozen.
  const gate = await requireWritableAccount();
  if (!gate.ok) return { error: FROZEN_TEACHER_MESSAGE };

  const raw = String(formData.get("names") ?? "");
  const classId = String(formData.get("classId") ?? "");

  const rawEntries = raw.split(/[\n,]+/).map((p) => p.trim()).filter(Boolean);
  if (rawEntries.length > 200) {
    return { error: "That's a lot of names — please add 100 or fewer at a time." };
  }

  // Make sure the class really belongs to this teacher, and read its current
  // roster so we can disambiguate any first-name clashes against it too.
  const klass = await db.class.findFirst({
    where: { id: classId, teacherId: user.teacher.id },
    include: { students: { select: { name: true } } },
  });
  if (!klass) return { error: "Class not found." };

  // First names only, with minimal surname prefixes where names collide.
  const names = deriveChildNames(rawEntries, klass.students.map((s) => s.name));

  if (names.length === 0) return { error: "Please enter at least one name." };
  if (names.length > 100) return { error: "That's a lot of names — please add 100 or fewer at a time." };

  const start = klass.students.length;
  await db.student.createMany({
    data: names.map((name, i) => ({
      name,
      classId,
      avatarColor: AVATAR_COLORS[(start + i) % AVATAR_COLORS.length],
    })),
  });

  revalidatePath("/teacher/class");
  revalidatePath("/teacher");
  return { added: names.length };
}

// Teacher removes a student (and all their journal items) from a class.
// Deliberately NOT write-gated: deletion stays available in a frozen account
// (RETENTION.md right-to-erasure exception).
export async function removeStudent(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const studentId = String(formData.get("studentId") ?? "");
  // Fetch the pupil (ownership-scoped) with their media so we can erase the
  // files too — removing a child must be real erasure, not just row removal
  // (SAFEGUARDING.md rule 9, UK GDPR Art.17). Mirrors deleteClass/deleteItem.
  const student = await db.student.findFirst({
    where: { id: studentId, class: { teacherId: user.teacher.id } },
    include: {
      journalItems: { select: { mediaPath: true, mediaPathsJson: true } },
      drafts: { select: { pagesJson: true } }, // in-progress response drafts
    },
  });
  if (student) {
    const mediaUrls: Array<string | null> = [];
    for (const item of student.journalItems) {
      mediaUrls.push(item.mediaPath);
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
    }
    mediaUrls.push(...gatherDraftPaths(student.drafts));
    // Delete the row (cascades the pupil's journal items + drafts), then erase files.
    await db.student.delete({ where: { id: studentId } });
    await deleteMediaFiles(mediaUrls);
  }

  revalidatePath("/teacher/class");
  revalidatePath("/teacher");
}
