"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { createPersonalToken, revokeApiToken } from "@/lib/api/tokens";
import { revokeGrant } from "@/lib/api/oauth";

// The teacher's own controls for the Claude connector: mint a token, revoke a
// token, disconnect an app. Every one of them is scoped to the signed-in
// teacher inside the query, so an id belonging to somebody else matches nothing.

const MAX_TOKENS = 10;

export async function createToken(
  _prev: { error?: string; token?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; token?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return { error: "Please sign in again." };

  const label = String(formData.get("label") ?? "").trim().slice(0, 60) || "Claude";

  const live = await db.apiToken.count({ where: { teacherId: user.teacher.id, kind: "PERSONAL" } });
  if (live >= MAX_TOKENS) {
    return { error: `You already have ${MAX_TOKENS} tokens. Revoke one you're not using before making another.` };
  }

  const token = await createPersonalToken(user.teacher.id, label);

  await recordAudit({
    schoolId: user.teacher.schoolId,
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.name,
    action: "CONNECTOR_TOKEN_CREATED",
    subjectType: "TEACHER",
    subjectId: user.teacher.id,
    detail: `Made a Claude access token ("${label}")`,
  });

  revalidatePath("/teacher/account");
  // The only time this value exists outside the teacher's own hands. Nothing
  // stores it and nothing can show it again.
  return { token };
}

export async function revokeToken(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return;

  const revoked = await revokeApiToken(user.teacher.id, String(formData.get("tokenId") ?? ""));
  if (revoked) {
    await recordAudit({
      schoolId: user.teacher.schoolId,
      actorType: "TEACHER",
      actorId: user.teacher.id,
      actorName: user.teacher.name,
      action: "CONNECTOR_TOKEN_REVOKED",
      subjectType: "TEACHER",
      subjectId: user.teacher.id,
      detail: "Revoked a Claude access token",
    });
  }
  revalidatePath("/teacher/account");
}

export async function disconnectApp(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return;

  // Scoped in the where clause, then deleted by id: a grant id that is not this
  // teacher's resolves to nothing and the delete never happens (rule 4).
  const grant = await db.oAuthGrant.findFirst({
    where: { id: String(formData.get("grantId") ?? ""), teacherId: user.teacher.id },
    select: { id: true, oauthClient: { select: { name: true } } },
  });
  if (!grant) return;

  await revokeGrant(grant.id);
  await recordAudit({
    schoolId: user.teacher.schoolId,
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.name,
    action: "CONNECTOR_DISCONNECTED",
    subjectType: "TEACHER",
    subjectId: user.teacher.id,
    detail: `Disconnected ${grant.oauthClient.name} from their activity library`,
  });
  revalidatePath("/teacher/account");
}
