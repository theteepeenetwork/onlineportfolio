"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deriveChildNames } from "@/lib/childNames";

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
