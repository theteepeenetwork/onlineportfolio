import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { OAUTH_ACCESS_TOKEN_TTL_MS, hashSecret, hintOf, mintSecret } from "./tokens";

// The OAuth 2.1 authorization server that lets a teacher add StoryJar as a
// connector on claude.ai.
//
// WHY THIS EXISTS WHEN A BEARER TOKEN ALREADY WORKS. Claude Code and Claude
// Desktop take a token in a header, and for those this whole file is
// unnecessary. claude.ai does not: a connector there is added by signing in, and
// the only way to offer one is to be an authorization server. That is what this
// is, kept to the smallest shape that is actually correct:
//
//   - public clients only, PKCE S256 required. There is no client secret in the
//     database because there is no client secret: a connector running in
//     somebody else's product cannot keep one, and pretending otherwise is how
//     secrets end up in logs.
//   - authorization codes are single use and short lived, and reusing one
//     revokes the entire grant (RFC 6749 §10.5) rather than merely failing —
//     a replayed code means somebody other than the client has it.
//   - refresh tokens rotate on every use, so a stolen one stops working the
//     moment the real client refreshes.
//   - the redirect URI is matched EXACTLY against the ones registered, and a
//     request whose redirect does not match is refused on our own page rather
//     than redirected. Sending an error to an unvalidated URI is how an open
//     redirect gets built by accident.
//
// The scope is fixed. There is one thing a token can do — read and write the
// teacher's own activity templates — so there is no scope parameter to widen and
// no consent screen where a teacher might click past something that matters.

export const OAUTH_SCOPE = "activities";

const CODE_TTL_MS = 60 * 1000; // one minute; the client redeems immediately
const CODE_PREFIX = "sjc_";
const REFRESH_PREFIX = "sjr_";

// Where a registered connector may be sent back to. https anywhere, plus
// loopback for a locally-running client (RFC 8252 §7.3 — a loopback address is
// not reachable by anyone else, and refusing it would block every desktop
// client). Nothing else: no custom schemes, no plain http on a real host.
export function isAllowedRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false; // a fragment can hide a second destination
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]");
}

export type RegisteredClient = { id: string; name: string; redirectUris: string[] };

export async function registerClient(name: string, redirectUris: string[]): Promise<RegisteredClient> {
  const created = await db.oAuthClient.create({
    data: { name, redirectUrisJson: JSON.stringify(redirectUris) },
    select: { id: true, name: true, redirectUrisJson: true },
  });
  return { id: created.id, name: created.name, redirectUris: JSON.parse(created.redirectUrisJson) };
}

export async function findClient(clientId: string): Promise<RegisteredClient | null> {
  if (!clientId) return null;
  const row = await db.oAuthClient.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, redirectUrisJson: true },
  });
  if (!row) return null;
  let redirectUris: string[] = [];
  try {
    const parsed = JSON.parse(row.redirectUrisJson);
    if (Array.isArray(parsed)) redirectUris = parsed.filter((u) => typeof u === "string");
  } catch {
    redirectUris = [];
  }
  return { id: row.id, name: row.name, redirectUris };
}

// What the consent screen was asked to authorise, once it has been checked. A
// request that fails this check never reaches the teacher and never reaches the
// client's redirect URI.
export type AuthorizeRequest = {
  client: RegisteredClient;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
};

export type AuthorizeCheck = { ok: true; request: AuthorizeRequest } | { ok: false; message: string };

export async function checkAuthorizeRequest(params: URLSearchParams): Promise<AuthorizeCheck> {
  const client = await findClient(params.get("client_id") ?? "");
  if (!client) return { ok: false, message: "That app isn't registered with StoryJar. Try adding the connector again." };

  const redirectUri = params.get("redirect_uri") ?? "";
  // Exact match, against the list registered by the client. Not a prefix, not a
  // host comparison: a prefix match is how "https://good.example/cb" comes to
  // accept "https://good.example/cb.attacker.test".
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { ok: false, message: "That app asked to be sent back to an address StoryJar doesn't recognise. Nothing has been shared." };
  }

  if ((params.get("response_type") ?? "") !== "code") {
    return { ok: false, message: "StoryJar only supports the standard sign-in flow, and that app asked for a different one." };
  }
  if ((params.get("code_challenge_method") ?? "") !== "S256") {
    return { ok: false, message: "That app didn't use the required security check (PKCE S256), so StoryJar has refused the connection." };
  }
  const codeChallenge = params.get("code_challenge") ?? "";
  if (codeChallenge.length < 43 || codeChallenge.length > 128) {
    return { ok: false, message: "That app's security check was malformed, so StoryJar has refused the connection." };
  }

  return { ok: true, request: { client, redirectUri, codeChallenge, state: params.get("state") } };
}

// The teacher said yes. Create the grant, mint a single-use code, and return the
// URL to send them back to.
export async function grantAuthorization(teacherId: string, request: AuthorizeRequest): Promise<string> {
  const code = mintSecret(CODE_PREFIX);
  await db.oAuthGrant.create({
    data: {
      clientId: request.client.id,
      teacherId,
      redirectUri: request.redirectUri,
      codeHash: hashSecret(code),
      codeChallenge: request.codeChallenge,
      codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  const url = new URL(request.redirectUri);
  url.searchParams.set("code", code);
  if (request.state) url.searchParams.set("state", request.state);
  return url.toString();
}

export function deniedRedirect(request: AuthorizeRequest): string {
  const url = new URL(request.redirectUri);
  url.searchParams.set("error", "access_denied");
  if (request.state) url.searchParams.set("state", request.state);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

export type TokenGrant = { accessToken: string; refreshToken: string; expiresIn: number };
export type TokenResult = { ok: true; grant: TokenGrant } | { ok: false; error: string; description: string };

function pkceMatches(verifier: string, challenge: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

export async function redeemAuthorizationCode(
  clientId: string,
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<TokenResult> {
  if (!code || !verifier) return { ok: false, error: "invalid_request", description: "A code and a code_verifier are both required." };

  const grant = await db.oAuthGrant.findUnique({
    where: { codeHash: hashSecret(code) },
    select: {
      id: true,
      clientId: true,
      teacherId: true,
      redirectUri: true,
      codeChallenge: true,
      codeExpiresAt: true,
      codeUsedAt: true,
    },
  });
  if (!grant) return { ok: false, error: "invalid_grant", description: "That code isn't valid." };

  // A code presented twice means somebody other than the client has it. Kill
  // the grant and everything issued from it rather than just refusing the
  // second attempt (RFC 6749 §10.5).
  if (grant.codeUsedAt) {
    await revokeGrant(grant.id);
    return { ok: false, error: "invalid_grant", description: "That code has already been used." };
  }
  if (!grant.codeExpiresAt || grant.codeExpiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "invalid_grant", description: "That code has expired. Please connect again." };
  }
  if (grant.clientId !== clientId || grant.redirectUri !== redirectUri) {
    return { ok: false, error: "invalid_grant", description: "That code was issued for a different app or address." };
  }
  if (!grant.codeChallenge || !pkceMatches(verifier, grant.codeChallenge)) {
    return { ok: false, error: "invalid_grant", description: "The security check didn't match." };
  }

  await db.oAuthGrant.update({ where: { id: grant.id }, data: { codeUsedAt: new Date() } });
  return { ok: true, grant: await issueTokens(grant.id, grant.teacherId, clientId) };
}

export async function redeemRefreshToken(clientId: string, refreshToken: string): Promise<TokenResult> {
  if (!refreshToken) return { ok: false, error: "invalid_request", description: "A refresh_token is required." };

  const grant = await db.oAuthGrant.findUnique({
    where: { refreshHash: hashSecret(refreshToken) },
    select: { id: true, clientId: true, teacherId: true },
  });
  if (!grant || grant.clientId !== clientId) {
    return { ok: false, error: "invalid_grant", description: "That refresh token isn't valid." };
  }
  return { ok: true, grant: await issueTokens(grant.id, grant.teacherId, clientId) };
}

// Mint the pair. The grant's previous access tokens are DELETED as the new one
// is issued — not flagged — so a connector refreshing hourly leaves one row
// behind rather than a year of them, and there is no revoked-but-present hash to
// filter for. The refresh token is replaced in the same write, which is the
// rotation.
async function issueTokens(grantId: string, teacherId: string, clientId: string): Promise<TokenGrant> {
  const accessToken = mintSecret();
  const refreshToken = mintSecret(REFRESH_PREFIX);
  const client = await findClient(clientId);

  await db.$transaction([
    db.apiToken.deleteMany({ where: { grantId } }),
    db.apiToken.create({
      data: {
        teacherId,
        grantId,
        kind: "OAUTH",
        label: client?.name ?? "Connector",
        keyHash: hashSecret(accessToken),
        hint: hintOf(accessToken),
        expiresAt: new Date(Date.now() + OAUTH_ACCESS_TOKEN_TTL_MS),
      },
    }),
    db.oAuthGrant.update({ where: { id: grantId }, data: { refreshHash: hashSecret(refreshToken) } }),
  ]);

  return { accessToken, refreshToken, expiresIn: Math.floor(OAUTH_ACCESS_TOKEN_TTL_MS / 1000) };
}

// Revoking a grant deletes it, and ApiToken.grantId cascades, so the access
// tokens go with it. Deletion rather than a flag because there is nothing here
// worth keeping: the row is a credential, not a record of anything (RETENTION.md).
export async function revokeGrant(grantId: string): Promise<void> {
  await db.oAuthGrant.delete({ where: { id: grantId } }).catch(() => {});
}
