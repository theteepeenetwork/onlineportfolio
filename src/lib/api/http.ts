import "server-only";
import { NextResponse } from "next/server";
import { originUrl } from "@/lib/appOrigin";
import { isRateLimited, recordFailure, clearFailures, clientIp } from "@/lib/rateLimit";
import { requireWritableAccountForTeacher, FROZEN_TEACHER_MESSAGE } from "@/lib/billing";
import { resolveApiToken, type ApiTeacher } from "./tokens";

// The shared front door for every connector request — the REST routes under
// /api/v1 and the MCP endpoint alike. One place decides who is calling, one
// place decides whether they may write, and one place decides what an error
// looks like, so a route cannot accidentally be the lenient one.

export type ApiErrorType =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "rate_limited"
  | "server_error";

const STATUS: Record<ApiErrorType, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  rate_limited: 429,
  server_error: 500,
};

// Errors are plain English, because the thing reading them is a model that will
// relay them to a teacher. "Question 3 needs between 2 and 4 answers" is a
// sentence Claude can act on; a stack trace is not.
export function apiError(type: ApiErrorType, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: { type, message } }, { status: STATUS[type], headers });
}

// A 401 that TELLS a connector where to go and sign in. RFC 9728: the
// `resource_metadata` parameter is how claude.ai discovers that this endpoint
// speaks OAuth and where its authorization server lives. Without it, adding
// StoryJar as a connector fails with nothing to act on.
export async function unauthorizedWithDiscovery(message: string) {
  const origin = await originUrl();
  return apiError("unauthorized", message, {
    "WWW-Authenticate": `Bearer realm="StoryJar", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
  });
}

export type Authed = { teacher: ApiTeacher; tokenId: string };

export type AuthResult = { ok: true; auth: Authed } | { ok: false; response: NextResponse };

// Resolve the caller, or produce the response that refuses them.
//
// THE ORDER OF THESE THREE STEPS IS THE WHOLE POINT, and it is the same lesson
// the class-code throttle learned the hard way (see src/lib/rateLimit.ts): **a
// school is one NAT IP.** Written the obvious way — check the throttle, then
// check the token — one teacher pasting a stale token five times would lock the
// connector for every other teacher in the building, because they all arrive
// from the same address. That is a denial of service dressed as a security
// control.
//
// So a valid token is NEVER refused on account of somebody else's failures. The
// token is resolved first, and a success clears the counter outright. Only a
// request that has already failed to authenticate consults the throttle, and it
// is the response to grinding that is throttled rather than a legitimate
// caller's request. The cost is one SHA-256 and one indexed lookup on a unique
// column per attempt, which is what any authenticating endpoint costs and is
// bounded whatever an attacker does.
export async function authenticate(req: Request): Promise<AuthResult> {
  const header = req.headers.get("authorization") ?? "";
  const raw = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1];
  const resolved = await resolveApiToken(raw);

  const key = `api:${await clientIp()}`;
  if (resolved) {
    clearFailures(key);
    return { ok: true, auth: { teacher: resolved.teacher, tokenId: resolved.tokenId } };
  }

  if (isRateLimited(key)) {
    return { ok: false, response: apiError("rate_limited", "Too many attempts just now. Please wait a few minutes and try again.") };
  }
  recordFailure(key);
  return {
    ok: false,
    response: await unauthorizedWithDiscovery(
      raw
        ? "That access token isn't valid any more. Sign in again, or make a new token on your StoryJar account page."
        : "This needs a StoryJar access token. Make one on your account page, under “Connect Claude”.",
    ),
  };
}

// The same billing gate the teacher's own screens use. A frozen account is
// read-only everywhere, and the connector is not the exception (a route that
// forgot this would be a way to keep writing to a lapsed account).
export async function requireWritable(teacher: ApiTeacher): Promise<NextResponse | null> {
  const gate = await requireWritableAccountForTeacher({ id: teacher.id, schoolId: teacher.schoolId });
  return gate.ok ? null : apiError("forbidden", FROZEN_TEACHER_MESSAGE);
}

// Read a JSON body without letting a malformed one become a 500.
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
