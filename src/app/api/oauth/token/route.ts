import { NextResponse } from "next/server";
import { OAUTH_SCOPE, redeemAuthorizationCode, redeemRefreshToken, type TokenResult } from "@/lib/api/oauth";
import { isRateLimited, recordFailure, clearFailures, clientIp } from "@/lib/rateLimit";

// The OAuth token endpoint. Form-encoded, as the spec requires; JSON is accepted
// too because some clients send it and refusing would be pedantry that reads as
// a broken connector.
//
// Never cached, by anything, ever — the response body is a live credential.
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;

export async function POST(req: Request) {
  // Redeeming is the one place a wrong guess is worth making repeatedly: a
  // code or a refresh token is the thing an attacker would grind. Failures are
  // counted per source and a successful redemption clears the count, so the
  // real client is never throttled by somebody else's noise on a shared IP.
  const key = `oauth-token:${await clientIp()}`;
  if (isRateLimited(key)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Too many attempts just now. Please wait a few minutes and try again." },
      { status: 429, headers: NO_STORE },
    );
  }

  const form = await readForm(req);
  const clientId = String(form.get("client_id") ?? "");
  const grantType = String(form.get("grant_type") ?? "");

  let result: TokenResult;
  if (grantType === "authorization_code") {
    result = await redeemAuthorizationCode(
      clientId,
      String(form.get("code") ?? ""),
      String(form.get("redirect_uri") ?? ""),
      String(form.get("code_verifier") ?? ""),
    );
  } else if (grantType === "refresh_token") {
    result = await redeemRefreshToken(clientId, String(form.get("refresh_token") ?? ""));
  } else {
    result = { ok: false, error: "unsupported_grant_type", description: "StoryJar supports authorization_code and refresh_token." };
  }

  if (!result.ok) {
    recordFailure(key);
    return NextResponse.json(
      { error: result.error, error_description: result.description },
      { status: result.error === "invalid_client" ? 401 : 400, headers: NO_STORE },
    );
  }

  clearFailures(key);
  return NextResponse.json(
    {
      access_token: result.grant.accessToken,
      token_type: "Bearer",
      expires_in: result.grant.expiresIn,
      refresh_token: result.grant.refreshToken,
      scope: OAUTH_SCOPE,
    },
    { headers: NO_STORE },
  );
}

async function readForm(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      const body = await req.json();
      const params = new URLSearchParams();
      if (body && typeof body === "object") {
        for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
          if (typeof v === "string") params.set(k, v);
        }
      }
      return params;
    } catch {
      return new URLSearchParams();
    }
  }
  try {
    return new URLSearchParams(await req.text());
  } catch {
    return new URLSearchParams();
  }
}
