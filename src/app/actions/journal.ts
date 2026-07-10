"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { savePhoto, saveImageDataUrl, saveImagePages } from "@/lib/media";

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

  const isTeacher = authorRole === "TEACHER";
  await db.journalItem.create({
    data: {
      type,
      caption,
      textContent,
      mediaPath,
      mediaPathsJson,
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

  if (user.role === "STUDENT") {
    revalidatePath("/student");
    redirect("/student");
  } else {
    revalidatePath("/teacher/queue");
    revalidatePath(`/teacher/students/${studentId}`);
    redirect(`/teacher/students/${studentId}`);
  }
}

// Teacher approves a pending item, optionally tagging skills as they go.
export async function approveItem(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const id = String(formData.get("itemId") ?? "");
  const skillIds = formData.getAll("skillIds").map(String).filter(Boolean);

  await db.journalItem.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      skills: skillIds.length ? { set: skillIds.map((sid) => ({ id: sid })) } : undefined,
    },
  });

  revalidatePath("/teacher/queue");
  revalidatePath("/teacher");
}

// Teacher returns a pending item with a note asking for another go.
export async function returnItem(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const id = String(formData.get("itemId") ?? "");
  const note = String(formData.get("teacherNote") ?? "").trim() || null;

  await db.journalItem.update({
    where: { id },
    data: { status: "RETURNED", teacherNote: note },
  });

  revalidatePath("/teacher/queue");
}

// Delete an item (teacher only).
export async function deleteItem(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const id = String(formData.get("itemId") ?? "");
  await db.journalItem.delete({ where: { id } });

  revalidatePath("/teacher/queue");
  revalidatePath("/teacher");
}
