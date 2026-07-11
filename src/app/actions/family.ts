"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";

// Parent asks for a magic link. In a real deployment this emails a one-tap link;
// here (no mail server) we mint the same single-use token and hand back the URL
// so the UI can offer an "Open it now →" affordance — exactly what tapping the
// emailed link would do. We don't reveal whether an email is on file beyond a
// gentle nudge toward the family code.
export async function requestMagicLink(
  _prev: { openUrl?: string; error?: string } | undefined,
  formData: FormData,
): Promise<{ openUrl?: string; error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That email doesn’t look quite right." };
  }

  const parent = await db.parent.findUnique({ where: { email } });
  if (!parent) {
    return { error: "We couldn’t find a family with that email — try the family code from your letter." };
  }

  const token = randomBytes(24).toString("hex");
  await db.magicToken.create({
    data: { token, parentId: parent.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  return { openUrl: `/family/enter?token=${token}` };
}

// Parent signs in with the family code from their school's letter.
export async function signInWithFamilyCode(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "Enter the family code from your letter." };

  const parent = await db.parent.findUnique({ where: { familyCode: code } });
  if (!parent) return { error: "That family code isn’t right — check your letter, or ask the school office." };

  await createSession({ role: "PARENT", parentId: parent.id });
  redirect("/family");
}

export async function parentLogout() {
  await destroySession();
  redirect("/family");
}
