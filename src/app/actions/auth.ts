"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { uniqueClassCode } from "@/lib/classCode";

// Teacher creates a new account (and optionally their first class).
export async function teacherSignup(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const className = String(formData.get("className") ?? "").trim();

  if (!name) return { error: "Please enter your name." };
  if (!email.includes("@") || email.length < 3) {
    return { error: "Please enter a valid email address." };
  }
  if (password.length < 6) {
    return { error: "Please choose a password of at least 6 characters." };
  }

  const existing = await db.teacher.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists. Try signing in." };
  }

  const teacher = await db.teacher.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
  });

  // Create their first class straight away if they named one.
  if (className) {
    await db.class.create({
      data: { name: className, classCode: await uniqueClassCode(), teacherId: teacher.id },
    });
  }

  await createSession({ role: "TEACHER", teacherId: teacher.id });
  redirect("/teacher/class");
}

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
