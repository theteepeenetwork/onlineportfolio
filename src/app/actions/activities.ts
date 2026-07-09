"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveImagePages } from "@/lib/media";

// Teacher creates an activity: instructions, an optional canvas/PDF template,
// and an assignment to the whole class or to chosen children.
export async function createActivity(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const title = String(formData.get("title") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim() || null;
  const classId = String(formData.get("classId") ?? "");
  const assignMode = String(formData.get("assignMode") ?? "all"); // all | some
  const studentIds = formData.getAll("studentIds").map(String).filter(Boolean);

  if (!title) return { error: "Please give the activity a title." };

  // The class must belong to this teacher.
  const klass = await db.class.findFirst({
    where: { id: classId, teacherId: user.teacher.id },
    include: { students: { select: { id: true } } },
  });
  if (!klass) return { error: "Please choose one of your classes." };

  // Work out who it goes to.
  const classStudentIds = new Set(klass.students.map((s) => s.id));
  let targetIds: string[];
  if (assignMode === "some") {
    targetIds = studentIds.filter((id) => classStudentIds.has(id));
    if (targetIds.length === 0)
      return { error: "Please choose at least one child, or assign to the whole class." };
  } else {
    targetIds = [...classStudentIds];
  }

  // Save the template pages (a JSON array of PNG data URLs), if any.
  let templatePathsJson: string | null = null;
  try {
    const raw = String(formData.get("templatePages") ?? "");
    let pages: string[] = [];
    try {
      pages = raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      pages = [];
    }
    pages = pages.filter((p) => typeof p === "string" && p.startsWith("data:image"));
    if (pages.length) {
      templatePathsJson = JSON.stringify(await saveImagePages(pages));
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the template." };
  }

  await db.activity.create({
    data: {
      title,
      instructions,
      templatePathsJson,
      teacherId: user.teacher.id,
      classId,
      assignments: {
        create: targetIds.map((studentId) => ({ studentId })),
      },
    },
  });

  revalidatePath("/teacher/activities");
  redirect("/teacher/activities");
}

export async function deleteActivity(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  const id = String(formData.get("activityId") ?? "");
  await db.activity.deleteMany({ where: { id, teacherId: user.teacher.id } });
  revalidatePath("/teacher/activities");
  redirect("/teacher/activities");
}
