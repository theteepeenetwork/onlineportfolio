import { createHmac, timingSafeEqual } from "node:crypto";

// The one-way label an email address is stored under in MailSuppression (PR5).
//
// Handbook ruling R9: suppression is "HMAC-keyed" and there is "explicitly NO
// recipient address or domain stored". This module is the whole of that
// promise, so it is short on purpose and it does exactly one thing.
//
// WHY A KEYED HMAC AND NOT A HASH
//
// Brief 05 puts it plainly and it is worth repeating where the code is: "A
// plain hash of an email address is trivially reversible by dictionary attack
// and is not a de-identification measure." There are perhaps a few thousand
// plausible addresses for any given family and a laptop tries all of them in
// under a second, so an unkeyed digest is the address written down with extra
// steps. The key is what makes a copy of the database file useless on its own.
//
// WHERE THE KEY LIVES, and what happens when it does not
//
// MAIL_HMAC_KEY, in the environment, never in this repository and never in the
// database beside the rows it protects. There is deliberately no fallback and
// no derived default: a default key is a key everybody has, and code that
// quietly hashes with one produces rows that look protected and are not. With
// no key configured this returns null, every caller treats that as "not
// monitored", and the operator screen says so in words.
//
// Deliberately free of `import "server-only"`, for the same reason as
// src/lib/ops/dto.ts and src/lib/ops/enabled.ts: a blocking spec has to be able
// to import it and assert its behaviour directly, and a module carrying
// `server-only` throws the moment a Playwright test imports it. Nothing secret
// is in the file. The secret is in the environment, and this reads it.

export const MAIL_HMAC_KEY_VAR = "MAIL_HMAC_KEY";

/** Is address suppression being recorded at all in this environment? */
export function mailHmacConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[MAIL_HMAC_KEY_VAR]);
}

/**
 * The stored label for one email address, or null when no key is configured.
 *
 * Normalised the same way every address in this codebase is on the way in
 * (trimmed and lower-cased: see src/app/actions/auth.ts and
 * src/app/actions/family.ts), because "Ada@Example.com" and "ada@example.com"
 * are one mailbox and two hashes would be two rows.
 */
export function mailAddressHmac(
  address: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env[MAIL_HMAC_KEY_VAR];
  if (!key) return null;
  const normalised = address.trim().toLowerCase();
  if (!normalised) return null;
  return createHmac("sha256", key).update(normalised).digest("hex");
}

/**
 * Compare two labels without leaking, through the time it takes, how much of
 * the first one matched.
 *
 * Nothing in PR5 compares labels in a request path, so this is not load
 * bearing today: the lookup is an indexed equality in SQLite. It is here
 * because the alternative, when something does compare them, is somebody
 * reaching for `===` on a value derived from a secret.
 */
export function sameMailHmac(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
