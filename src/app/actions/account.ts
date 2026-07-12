"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deriveTeacherName, type DisplayStyle } from "@/lib/teacherName";
import { recordAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Account settings — a teacher editing their OWN profile and sign-in details.
//
// These are "account management", so they stay available even when the account
// is FROZEN (read-only): the billing write-gate deliberately does NOT apply here
// (RETENTION.md: frozen blocks mutations "except account management …"). Each
// action re-checks the session server-side and only ever touches the signed-in
// teacher's own row — never anyone else's (deny by default).
// ---------------------------------------------------------------------------

const TITLES = new Set(["Mr", "Miss", "Mrs", "Ms", "Mx", ""]);
const COUNTRIES = new Set(["England", "Scotland", "Wales", "Northern Ireland", "Elsewhere"]);

// Resolve the signed-in teacher (id + who they are for auditing), or bounce out.
async function requireSelf() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/login/teacher");
  return {
    id: user.teacher.id,
    schoolId: user.teacher.schoolId,
    actorType: user.teacher.staffRole === "ADMIN" ? "ADMIN" : "TEACHER",
    actorName: user.teacher.displayName,
  };
}

// Update name, title, greeting style, school name and country. The greeting name
// (`displayName`) is recomputed here — the one place that ever derives it — so
// the dashboard greeting stays correct after an edit.
export async function updateProfile(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const self = await requireSelf();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const titleRaw = String(formData.get("title") ?? "");
  const title = TITLES.has(titleRaw) ? titleRaw : "";
  const displayStyle: DisplayStyle = String(formData.get("displayStyle") ?? "") === "first" ? "first" : "formal";
  const school = String(formData.get("school") ?? "").trim() || null;
  const countryRaw = String(formData.get("country") ?? "");
  const country = COUNTRIES.has(countryRaw) ? countryRaw : null;

  if (!fullName) return { error: "Please add your full name." };

  const { displayName } = deriveTeacherName({ title, fullName, displayStyle });
  await db.teacher.update({
    where: { id: self.id },
    data: { name: fullName, title, displayStyle, displayName, schoolName: school, country },
  });

  revalidatePath("/teacher/account");
  revalidatePath("/teacher");
  return { ok: true };
}

// Change the sign-in email. Must be a valid, unused address. Audited as an
// account-security event (SAFEGUARDING rule 16). No email-verification round-trip
// in this build (no mail server), consistent with how invites/magic links work.
export async function updateEmail(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const self = await requireSelf();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn’t look quite right." };

  const me = await db.teacher.findUnique({ where: { id: self.id }, select: { email: true } });
  if (!me) redirect("/login/teacher");
  if (email === me.email) return { ok: true }; // no change

  const existing = await db.teacher.findUnique({ where: { email } });
  if (existing) return { error: "That email is already in use on another account." };

  await db.teacher.update({ where: { id: self.id }, data: { email } });
  await recordAudit({
    action: "ACCOUNT_EMAIL_CHANGED", actorType: self.actorType, actorId: self.id, actorName: self.actorName,
    schoolId: self.schoolId, subjectType: "TEACHER", subjectId: self.id,
    detail: `Changed their sign-in email from ${me.email} to ${email}`,
  });

  revalidatePath("/teacher/account");
  return { ok: true };
}

// Change the password. Requires the current password (re-verified with bcrypt),
// a new password of at least 8 characters, and a matching confirmation. Audited
// (no password value is ever logged).
export async function changePassword(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const self = await requireSelf();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: "Your new password needs at least 8 characters." };
  if (next !== confirm) return { error: "The new passwords don’t match." };

  const me = await db.teacher.findUnique({ where: { id: self.id }, select: { passwordHash: true } });
  if (!me) redirect("/login/teacher");
  if (!me.passwordHash || !(await bcrypt.compare(current, me.passwordHash))) {
    return { error: "Your current password isn’t right." };
  }

  await db.teacher.update({ where: { id: self.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  await recordAudit({
    action: "ACCOUNT_PASSWORD_CHANGED", actorType: self.actorType, actorId: self.id, actorName: self.actorName,
    schoolId: self.schoolId, subjectType: "TEACHER", subjectId: self.id, detail: "Changed their password",
  });

  return { ok: true };
}
