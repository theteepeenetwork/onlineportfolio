import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

// Minting, hashing and resolving the bearer tokens Claude uses to reach a
// teacher's activity library. SAFEGUARDING rules 8 (deny by default) and 13
// (credentials are hashed, never stored raw).

// Every token starts with this, so a token pasted into the wrong box is
// recognisable, a secret scanner can find one, and this module can reject
// obvious non-tokens before it touches the database.
export const TOKEN_PREFIX = "sj_live_";

// Characters of the random part kept as a display hint. Four, of forty-three,
// after a fixed prefix — enough for a teacher to tell two rows apart and not
// enough to be worth anything to anyone else.
const HINT_LEN = 4;

// An OAuth access token is short-lived; the connector refreshes it. A personal
// token has no expiry — a teacher revokes it when they are done with it, which
// is the model they can actually reason about.
export const OAUTH_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

// lastUsedAt answers one question for a teacher: "is this old token still being
// used, or is it safe to revoke?". Written at most once an hour so it is never
// a record of when a teacher works (rule 11 — nothing here profiles anybody,
// and the coarseness is the reason).
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

// A fresh 256-bit secret, URL-safe so it survives a copy out of a terminal and
// into a JSON config file without escaping.
export function mintSecret(prefix = TOKEN_PREFIX): string {
  return prefix + randomBytes(32).toString("base64url");
}

export function hintOf(token: string): string {
  return token.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + HINT_LEN);
}

// The teacher context an authenticated API request runs as. Deliberately the
// smallest shape that works: an id for scoping every query, and a name for the
// OAuth consent screen and the connector's own "who am I" call. No school, no
// classes, no children.
export type ApiTeacher = {
  id: string;
  name: string;
  displayName: string;
  schoolId: string | null;
};

export type ResolvedToken = { tokenId: string; teacher: ApiTeacher };

// Resolve a raw bearer token to the teacher it belongs to, or null.
//
// Deny by default at every step: wrong shape, unknown hash, expired, or a
// missing teacher row all return null and are indistinguishable to the caller.
// A revoked token is simply not here — revoking deletes the row. The lookup is an exact match on an indexed unique column holding the
// SHA-256 of a 256-bit secret, so there is nothing to guess and nothing to
// compare in variable time.
export async function resolveApiToken(raw: string | null | undefined): Promise<ResolvedToken | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX) || raw.length > 200) return null;

  const row = await db.apiToken.findUnique({
    where: { keyHash: hashSecret(raw) },
    select: {
      id: true,
      expiresAt: true,
      lastUsedAt: true,
      teacher: { select: { id: true, name: true, displayName: true, schoolId: true } },
    },
  });
  if (!row || !row.teacher) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  await touchApiToken(row.id, row.lastUsedAt);

  return {
    tokenId: row.id,
    teacher: {
      id: row.teacher.id,
      name: row.teacher.name,
      displayName: row.teacher.displayName || row.teacher.name.split(" ")[0],
      schoolId: row.teacher.schoolId,
    },
  };
}

// Stamp lastUsedAt, but no more than once an hour, and never let a failed write
// fail the request: a read-only moment in the database must not take the
// connector down when the only thing it costs is a slightly stale timestamp.
async function touchApiToken(id: string, lastUsedAt: Date | null): Promise<void> {
  if (lastUsedAt && Date.now() - lastUsedAt.getTime() < TOUCH_INTERVAL_MS) return;
  try {
    await db.apiToken.update({ where: { id }, data: { lastUsedAt: new Date() } });
  } catch {
    // Deliberately silent. See above.
  }
}

// Mint a personal token for a teacher and return the raw value ONCE. Nothing
// stores it, and nothing can show it again.
export async function createPersonalToken(teacherId: string, label: string): Promise<string> {
  const token = mintSecret();
  await db.apiToken.create({
    data: { teacherId, label, keyHash: hashSecret(token), hint: hintOf(token), kind: "PERSONAL" },
  });
  return token;
}

// Revoke one of this teacher's tokens, by deleting it: the hash stops existing,
// so the token cannot work again by any route, and there is no state to filter
// for. Scoped by teacherId in the query rather than checked afterwards, so a
// token id belonging to another teacher matches nothing and returns false
// (rule 4) rather than deleting somebody else's row.
export async function revokeApiToken(teacherId: string, tokenId: string): Promise<boolean> {
  const result = await db.apiToken.deleteMany({ where: { id: tokenId, teacherId } });
  return result.count > 0;
}
