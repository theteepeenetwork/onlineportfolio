"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { trialEndFromNow } from "@/lib/billing";
import { uniqueClassCode } from "@/lib/classCode";
import { AVATAR_PALETTE } from "@/lib/avatar";
import { deriveTeacherName, type DisplayStyle } from "@/lib/teacherName";
import { isRateLimited, recordFailure, clearFailures, clientIp, RATE_LIMITED_MESSAGE } from "@/lib/rateLimit";

// Storyjar avatar palette — children get a colour bubble in rotation.

export type SignupResult = { error?: string; step?: number };

// The Storyjar 5-step signup wizard submits everything at once: it creates the
// teacher, their first class jar (with a generated class code), and the class
// list, signs them in, and returns the class code to show on the success step.
export async function createTeacherAccount(input: {
  title: string;
  fullName: string;
  displayStyle: DisplayStyle;
  email: string;
  password: string;
  school: string;
  country: string;
  yearGroup: string;
  className: string;
  children: string[];
}): Promise<SignupResult> {
  const fullName = input.fullName.trim();
  const title = input.title.trim();
  const displayStyle: DisplayStyle = input.displayStyle === "first" ? "first" : "formal";
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const school = input.school.trim();
  const className = input.className.trim();

  // Server-side validation, returning the step to send the user back to.
  if (!fullName) return { error: "Pop your full name in first.", step: 1 };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { error: "That email doesn’t look quite right — check for typos.", step: 1 };
  if (password.length < 8)
    return { error: "Your password needs at least 8 characters.", step: 1 };
  if (!school) return { error: "What’s your school called?", step: 2 };
  if (!className) return { error: "Give your class a name — anything you like.", step: 3 };

  // Tidy the class list: trim, drop blanks and case-insensitive duplicates.
  const seen = new Set<string>();
  const children: string[] = [];
  for (const raw of input.children) {
    const child = raw.trim();
    if (!child) continue;
    const key = child.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    children.push(child);
  }
  if (children.length === 0)
    return { error: "Add at least one first name to get started.", step: 4 };

  const existing = await db.teacher.findUnique({ where: { email } });
  if (existing)
    return { error: "An account with that email already exists. Try signing in.", step: 1 };

  const { displayName } = deriveTeacherName({ title, fullName, displayStyle });
  const teacher = await db.teacher.create({
    data: {
      name: fullName,
      title,
      displayStyle,
      displayName,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      schoolName: school,
      country: input.country,
    },
  });

  // Every new account starts on the 42-day free trial with full access. This is
  // an INDIVIDUAL subscription tracked locally (no card, no Stripe trial); the
  // Stripe subscription is created only at first payment. Without this row the
  // write gate would (correctly) deny by default, so it must exist from signup.
  await db.subscription.create({
    data: { kind: "INDIVIDUAL", status: "TRIAL", trialEndsAt: trialEndFromNow(), teacherId: teacher.id },
  });

  const code = await uniqueClassCode();
  const klass = await db.class.create({
    data: { name: className, yearGroup: input.yearGroup, classCode: code, teacherId: teacher.id },
  });

  await db.student.createMany({
    data: children.map((childName, i) => ({
      name: childName,
      classId: klass.id,
      avatarColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length],
    })),
  });

  await createSession({ role: "TEACHER", teacherId: teacher.id });
  // The success screen (class code + sign-in guide) lives at its own route so
  // it survives the post-action refresh and can be returned to.
  redirect("/signup/teacher/welcome");
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

  // Throttle brute force per account+source (FINDINGS F2). A correct sign-in
  // below clears the counter, so honest repeated logins are never blocked.
  const key = `login:${email}:${await clientIp()}`;
  if (isRateLimited(key)) {
    return { error: RATE_LIMITED_MESSAGE };
  }

  const teacher = await db.teacher.findUnique({ where: { email } });
  if (!teacher || !(await bcrypt.compare(password, teacher.passwordHash))) {
    recordFailure(key);
    return { error: "That email and password don't match." };
  }

  clearFailures(key);
  await createSession({ role: "TEACHER", teacherId: teacher.id });
  redirect("/teacher");
}

// Student picks their name after their class code has been verified.
// Used directly as a form action, so it receives just the FormData.
//
// The class code IS the access control: a pupil may be signed in only by someone
// who entered *that pupil's* class code. We therefore re-check on the server that
// the chosen studentId belongs to the class whose code was submitted — never
// trust the studentId alone (SAFEGUARDING.md rules 4 & 8). Without this, a
// crafted post could impersonate any pupil (even one in another school) by id.
export async function studentLogin(formData: FormData) {
  const studentId = String(formData.get("studentId") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!studentId || !code) redirect("/login/student");

  const student = await db.student.findFirst({
    where: { id: studentId, class: { classCode: code } },
  });
  // Deny by default: the id must belong to the class whose code was entered.
  if (!student) redirect(`/login/student?code=${encodeURIComponent(code)}`);

  await createSession({ role: "STUDENT", studentId: student.id });
  redirect("/student");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
