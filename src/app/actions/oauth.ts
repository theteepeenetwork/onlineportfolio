"use server";

import { getCurrentUser } from "@/lib/auth";
import { checkAuthorizeRequest, deniedRedirect, grantAuthorization } from "@/lib/api/oauth";
import { recordAudit } from "@/lib/audit";

// The teacher's answer on the consent screen.
//
// Everything is re-checked here. The page validated the request to decide what
// to SHOW; this action validates it again to decide what to DO, because the
// hidden field carrying the query string came back from a browser and a browser
// is not a source of truth (SAFEGUARDING rule 15). In particular the redirect
// URI is re-matched against the client's registered list, so a tampered field
// cannot turn the approve button into an open redirect.
export async function decideConnector(
  _prev: { error?: string; redirectTo?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; redirectTo?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") {
    return { error: "You've been signed out. Sign in again and add the connector from the start." };
  }

  const query = String(formData.get("query") ?? "");
  const check = await checkAuthorizeRequest(new URLSearchParams(query));
  if (!check.ok) return { error: check.message };

  if (String(formData.get("decision")) !== "allow") {
    return { redirectTo: deniedRedirect(check.request) };
  }

  const redirectTo = await grantAuthorization(user.teacher.id, check.request);

  // A teacher granting a third party standing access to their teaching material
  // is exactly the kind of thing rule 16 exists to record: who, what, when. The
  // note names the app and nothing else — no code, no token, no child.
  await recordAudit({
    schoolId: user.teacher.schoolId,
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.name,
    action: "CONNECTOR_AUTHORISED",
    subjectType: "TEACHER",
    subjectId: user.teacher.id,
    detail: `Connected ${check.request.client.name} to their activity library`,
  });

  return { redirectTo };
}
