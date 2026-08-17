// Ten single-use recovery codes for the operator, bcrypt-hashed at rest.
//
// Handbook ruling R8: break-glass is a documented row deletion, NOT a
// session-minting script. A committed script that mints a session is an
// unaudited authentication bypass living in the repository, which is exactly
// the shape this programme forbids. So the ladder out of a lost authenticator
// is, in order:
//
//   1. one of these ten codes, printed once by scripts/seed-operator.ts and
//      kept offline (not in the repository, not in an inbox, not in a password
//      manager that the lost device unlocks);
//   2. failing that, delete the Operator row from the Railway shell and re-seed.
//
// Both are written up in docs/ops-recovery.md. There is no third route, no
// password reset by email, and nothing in this repository that can issue a
// session without a password and a code.
//
// Storage shape: one JSON string on Operator.recoveryCodesJson holding
// [{ hash, usedAt }] — a table would be a fourth model to classify for the
// blindness gate and buys nothing, because these rows are only ever read and
// written together, ten at a time, by this module.
//
// Free of `import "server-only"`: the seed script runs under tsx and the
// blocking spec proves a code works exactly once.
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { OPS_BCRYPT_COST } from "@/lib/ops/passwords";

export const RECOVERY_CODE_COUNT = 10;

// No 0/O/1/I/L/U: these get read off a printed card, out loud, under stress, by
// somebody who has just lost their phone.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const GROUPS = 3;
const GROUP_LENGTH = 4;

export type RecoveryEntry = { hash: string; usedAt: string | null };

export function newRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const groups: string[] = [];
    for (let g = 0; g < GROUPS; g += 1) {
      let group = "";
      for (let c = 0; c < GROUP_LENGTH; c += 1) group += ALPHABET[randomInt(ALPHABET.length)];
      groups.push(group);
    }
    out.push(groups.join("-"));
  }
  return out;
}

export async function hashRecoveryCodes(codes: string[]): Promise<string> {
  const entries: RecoveryEntry[] = [];
  for (const c of codes) {
    entries.push({ hash: await bcrypt.hash(normalise(c), OPS_BCRYPT_COST), usedAt: null });
  }
  return JSON.stringify(entries);
}

// Case and punctuation are noise on a code read off a card.
export function normalise(candidate: string): string {
  return candidate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function parseRecoveryCodes(json: string): RecoveryEntry[] {
  try {
    const parsed: unknown = JSON.parse(json || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecoveryEntry =>
        typeof e === "object" && e !== null && typeof (e as RecoveryEntry).hash === "string",
    );
  } catch {
    return [];
  }
}

export function unusedRecoveryCodeCount(json: string): number {
  return parseRecoveryCodes(json).filter((e) => e.usedAt === null).length;
}

// Returns the index of the UNUSED entry the candidate matches, or null. Used
// entries are compared too, so a reused code takes the same time as a wrong
// one and cannot be identified by how long the answer took; a match against a
// used entry still returns null, because single-use means single-use.
export async function matchRecoveryCode(json: string, candidate: string): Promise<number | null> {
  const cleaned = normalise(candidate);
  if (cleaned.length !== GROUPS * GROUP_LENGTH) return null;
  const entries = parseRecoveryCodes(json);
  let hit: number | null = null;
  for (let i = 0; i < entries.length; i += 1) {
    const ok = await bcrypt.compare(cleaned, entries[i].hash);
    if (ok && entries[i].usedAt === null) hit = i;
  }
  return hit;
}

export function markRecoveryCodeUsed(json: string, index: number, at: Date = new Date()): string {
  const entries = parseRecoveryCodes(json);
  if (!entries[index]) return json;
  entries[index] = { ...entries[index], usedAt: at.toISOString() };
  return JSON.stringify(entries);
}
