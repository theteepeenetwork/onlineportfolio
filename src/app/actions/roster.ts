"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const AVATAR_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
];

// Teacher adds a student to one of their classes.
export async function addStudent(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const name = String(formData.get("name") ?? "").trim();
  const classId = String(formData.get("classId") ?? "");
  if (!name) return { error: "Please enter the student's name." };

  // Make sure the class really belongs to this teacher.
  const klass = await db.class.findFirst({
    where: { id: classId, teacherId: user.teacher.id },
    include: { _count: { select: { students: true } } },
  });
  if (!klass) return { error: "Class not found." };

  const color = AVATAR_COLORS[klass._count.students % AVATAR_COLORS.length];

  await db.student.create({
    data: { name, classId, avatarColor: color },
  });

  revalidatePath("/teacher/class");
  revalidatePath("/teacher");
  return {};
}

// Teacher removes a student (and all their journal items) from a class.
export async function removeStudent(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const studentId = String(formData.get("studentId") ?? "");
  const student = await db.student.findFirst({
    where: { id: studentId, class: { teacherId: user.teacher.id } },
  });
  if (student) {
    await db.student.delete({ where: { id: studentId } });
  }

  revalidatePath("/teacher/class");
  revalidatePath("/teacher");
}
