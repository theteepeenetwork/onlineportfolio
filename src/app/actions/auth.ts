"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";

// Teacher signs in with email + password.
export async function teacherLogin(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const teacher = await db.teacher.findUnique({ where: { email } });
  if (!teacher || !(await bcrypt.compare(password, teacher.passwordHash))) {
    return { error: "That email and password don't match." };
  }

  await createSession({ role: "TEACHER", teacherId: teacher.id });
  redirect("/teacher");
}

// Student picks their name after their class code has been verified.
// Used directly as a form action, so it receives just the FormData.
export async function studentLogin(formData: FormData) {
  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) redirect("/login/student");

  const student = await db.student.findUnique({ where: { id: studentId } });
  if (!student) redirect("/login/student");

  await createSession({ role: "STUDENT", studentId: student.id });
  redirect("/student");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
