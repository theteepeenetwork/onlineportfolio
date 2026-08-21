import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowedRedirectUri, registerClient } from "@/lib/api/oauth";

// RFC 7591 dynamic client registration. claude.ai registers itself here before
// sending the teacher to the consent screen.
//
// Registration is open, because it has to be: the client is somebody else's
// product and there is nobody to hand a client id to in advance. What keeps it
// safe is that a registration grants NOTHING. It creates a name and a list of
// redirect URIs, and the only thing that can come of it is a consent screen a
// teacher has to read and approve. Three bounds on the flood it invites:
//
//   1. redirect URIs must be https (or loopback) — isAllowedRedirectUri.
//   2. a global ceiling per hour, below.
//   3. clients that nobody ever authorised are swept after thirty days
//      (RETENTION.md), so an abandoned registration is not kept for ever.

const MAX_PER_HOUR = 50;
const SWEEP_AFTER_DAYS = 30;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return oauthError("invalid_client_metadata", "The registration body wasn't JSON.");
  }

  const recent = await db.oAuthClient.count({ where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recent >= MAX_PER_HOUR) {
    return NextResponse.json(
      { error: "temporarily_unavailable", error_description: "Too many apps have registered recently. Please try again shortly." },
      { status: 429 },
    );
  }

  const redirectUris = (Array.isArray(body.redirect_uris) ? body.redirect_uris : [])
    .map((u) => String(u ?? ""))
    .filter(Boolean);
  if (redirectUris.length === 0 || redirectUris.length > 5) {
    return oauthError("invalid_redirect_uri", "Between one and five redirect_uris are required.");
  }
  if (!redirectUris.every(isAllowedRedirectUri)) {
    return oauthError("invalid_redirect_uri", "Redirect URIs must use https, or http on the loopback address.");
  }

  const method = String(body.token_endpoint_auth_method ?? "none");
  if (method !== "none") {
    return oauthError("invalid_client_metadata", "StoryJar issues public clients only; use token_endpoint_auth_method \"none\" with PKCE.");
  }

  // The name is shown to a teacher on the consent screen, so it is trimmed,
  // bounded, and rendered as a React text node (never as markup).
  const name = String(body.client_name ?? "").trim().slice(0, 80) || "An app";

  await sweepAbandonedClients();
  const client = await registerClient(name, redirectUris);

  return NextResponse.json(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

function oauthError(error: string, description: string) {
  return NextResponse.json({ error, error_description: description }, { status: 400 });
}

// A registration nobody ever authorised is a name and a URL with no teacher
// attached. Swept lazily rather than by a cron: the table only grows when
// somebody registers, so the moment somebody registers is the moment to tidy.
async function sweepAbandonedClients(): Promise<void> {
  try {
    await db.oAuthClient.deleteMany({
      where: {
        createdAt: { lt: new Date(Date.now() - SWEEP_AFTER_DAYS * 24 * 60 * 60 * 1000) },
        grants: { none: {} },
      },
    });
  } catch {
    // Housekeeping. Never the reason a registration fails.
  }
}
