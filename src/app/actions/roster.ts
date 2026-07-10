"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const AVATAR_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
];

// Teacher adds one or several students at once by pasting a list (one name per line,
// or separated by commas). Blank lines and duplicates within the paste are
// ignored, so a copy-pasted register just works.
export async function addStudents(
  _prev: { error?: string; added?: number } | undefined,
  formData: FormData,
): Promise<{ error?: string; added?: number }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const raw = String(formData.get("names") ?? "");
  const classId = String(formData.get("classId") ?? "");

  // Split on new lines and commas, tidy up, and drop blanks + repeats.
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  if (names.length === 0) return { error: "Please enter at least one name." };
  if (names.length > 100) return { error: "That's a lot of names — please add 100 or fewer at a time." };

  // Make sure the class really belongs to this teacher.
  const klass = await db.class.findFirst({
    where: { id: classId, teacherId: user.teacher.id },
    include: { _count: { select: { students: true } } },
  });
  if (!klass) return { error: "Class not found." };

  const start = klass._count.students;
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
