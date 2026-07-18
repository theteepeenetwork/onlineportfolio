"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { uniqueClassCode } from "@/lib/classCode";
import { deleteMediaFiles } from "@/lib/media";
import { gatherDraftPaths } from "@/lib/drafts";
import { recordAudit } from "@/lib/audit";
import { requireWritableAccount, FROZEN_TEACHER_MESSAGE } from "@/lib/billing";

// Teacher creates a new class. A teacher can have as many as they like.
export async function createClass(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  // Creating a class is a mutation — blocked while the account is frozen.
  const gate = await requireWritableAccount();
  if (!gate.ok) return { error: FROZEN_TEACHER_MESSAGE };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Please give your class a name." };

  const classCode = await uniqueClassCode();
  await db.class.create({
    data: { name, classCode, teacherId: user.teacher.id },
  });

  revalidatePath("/teacher/class");
  revalidatePath("/teacher");
  return {};
}

// Teacher issues a NEW class code, retiring the current one.
//
// The remedy for a leaked code. Until now a code was set once at class creation
// and nobody could change it — so the day a head learns an excluded parent has
// the code, the only honest answer was "delete the class and re-add every pupil
// by hand". Rotation is the fix, and it is a SAFETY operation, so:
//   - scoped to a class THIS teacher owns (deny by default otherwise);
//   - NOT write-gated — a leaked code must be revocable even in a frozen
//     account, exactly like deletion;
//   - audited (rule 16), but the audit records only THAT it happened, never the
//     new code — an audit log must not carry the live secret.
//
// It does not sign anyone out: a child's session points at their pupil id, not
// the code. It only changes what a NEW sign-in must type — so the printed
// hand-out and its QR need reprinting, which the UI says plainly. A child mid
// sign-in with the old code is denied and re-enters the new one (the safe
// direction).
export async function rotateClassCode(
  _prev: { error?: string; code?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; code?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const classId = String(formData.get("classId") ?? "");

  // Ownership-scoped: only a class this teacher owns is visible here.
  const klass = await db.class.findFirst({
    where: { id: classId, teacherId: user.teacher.id },
    select: { id: true, name: true },
  });
  // Deny by default: not found / not theirs → do nothing, leak nothing.
  if (!klass) return { error: "That class isn't available." };

  const newCode = await uniqueClassCode();
  await db.class.update({ where: { id: klass.id }, data: { classCode: newCode } });

  await recordAudit({
    action: "CLASS_CODE_ROTATED",
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.displayName,
    schoolId: user.teacher.schoolId,
    subjectType: "CLASS",
    subjectId: klass.id,
    detail: `Issued a new class code for "${klass.name}"`, // never the code itself
  });

  revalidatePath("/teacher/class");
  revalidatePath("/teacher");
  return { code: newCode };
}

// Teacher permanently deletes a whole class — its children, all their moments
// (rows AND the underlying media files), and its assignments. This is a Right
// to Erasure operation (SAFEGUARDING.md rules 4, 8, 9, 16), so it:
//   - is scoped to a class THIS teacher owns (deny by default otherwise);
//   - requires the exact, case-sensitive class name to be re-typed, re-checked
//     here on the server (never trust the client-side gate);
//   - erases the media files, not just the database rows;
//   - is recorded in the audit log.
// Deliberately NOT write-gated: deletion stays available in a frozen account
// (RETENTION.md right-to-erasure exception).
export async function deleteClass(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const classId = String(formData.get("classId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "");

  // Ownership-scoped fetch: only a class this teacher owns is ever visible here.
  const klass = await db.class.findFirst({
    where: { id: classId, teacherId: user.teacher.id },
    include: {
      journalItems: { select: { mediaPath: true, mediaPathsJson: true } },
      drafts: { select: { pagesJson: true } }, // in-progress response drafts for this class
      _count: { select: { students: true, journalItems: true } },
    },
  });
  // Deny by default: not found / not theirs → do nothing, leak nothing.
  if (!klass) return;

  // Re-verify the typed confirmation on the server (exact, case-sensitive).
  if (confirmName !== klass.name) return;

  // Gather every media file belonging to this class's moments before we drop
  // the rows, so we can erase the files afterwards.
  const mediaUrls: Array<string | null> = [];
  for (const item of klass.journalItems) {
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
  // Draft pages (cross-device autosave) are media files too — erase them.
  mediaUrls.push(...gatherDraftPaths(klass.drafts));

  // Delete the rows (cascades to students, moments, assignments, responses and
  // their sessions), then erase the files so the right to erasure is real.
  await db.class.delete({ where: { id: klass.id } });
  await deleteMediaFiles(mediaUrls);

  await recordAudit({
    action: "CLASS_DELETED",
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.displayName,
    schoolId: user.teacher.schoolId,
    subjectType: "CLASS",
    subjectId: klass.id,
    detail: `Permanently deleted class "${klass.name}" (${klass._count.students} pupils, ${klass._count.journalItems} moments)`,
  });

  revalidatePath("/teacher/class");
  revalidatePath("/teacher");
}
