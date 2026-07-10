"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { uniqueClassCode } from "@/lib/classCode";

// Teacher creates a new class. A teacher can have as many as they like.
export async function createClass(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

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

// Teacher deletes a class (and its students, journal and activities).
export async function deleteClass(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const classId = String(formData.get("classId") ?? "");
  await db.class.deleteMany({ where: { id: classId, teacherId: user.teacher.id } });

  revalidatePath("/teacher/class");
  revalidatePath("/teacher");
}
