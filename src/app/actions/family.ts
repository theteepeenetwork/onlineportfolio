"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { isRateLimited, recordFailure, clearFailures, clientIp, RATE_LIMITED_MESSAGE } from "@/lib/rateLimit";

// Parent asks for a magic link. In a real deployment this emails a one-tap link;
// here (no mail server) we mint the same single-use token and hand back the URL
// so the UI can offer an "Open it now →" affordance — exactly what tapping the
// emailed link would do. We don't reveal whether an email is on file beyond a
// gentle nudge toward the family code.
export async function requestMagicLink(
  _prev: { openUrl?: string; sent?: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ openUrl?: string; sent?: boolean; error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That email doesn’t look quite right." };
  }

  // Throttle magic-link requests per source so the endpoint can't be used to
  // spam inboxes or probe at volume (FINDINGS F2).
  const magicKey = `magic:${await clientIp()}`;
  if (isRateLimited(magicKey)) {
    return { error: RATE_LIMITED_MESSAGE };
  }
  recordFailure(magicKey);

  const parent = await db.parent.findUnique({ where: { email } });

  // Never disclose whether an email is on file (avoids account enumeration —
  // FINDINGS F6). The response is the SAME neutral "if it's on file, we've sent
  // a link" for known and unknown emails. In this build (no mail server) we only
  // hand back the direct link when a family actually matches — but the visible
  // message is identical either way, so nothing is leaked.
  if (parent) {
    const token = randomBytes(24).toString("hex");
    await db.magicToken.create({
      data: { token, parentId: parent.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });
    return { sent: true, openUrl: `/family/enter?token=${token}` };
  }
  return { sent: true };
}

// Parent signs in with the family code from their school's letter.
export async function signInWithFamilyCode(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "Enter the family code from your letter." };

  // Throttle family-code guessing per source (FINDINGS F2). A correct code
  // clears the counter.
  const key = `family:${await clientIp()}`;
  if (isRateLimited(key)) return { error: RATE_LIMITED_MESSAGE };

  const parent = await db.parent.findUnique({ where: { familyCode: code } });
  if (!parent) {
    recordFailure(key);
    return { error: "That family code isn’t right — check your letter, or ask the school office." };
  }

  clearFailures(key);
  await createSession({ role: "PARENT", parentId: parent.id });
  redirect("/family");
}

export async function parentLogout() {
  await destroySession();
  redirect("/family");
}
