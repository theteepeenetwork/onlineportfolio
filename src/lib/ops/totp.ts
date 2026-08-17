// TOTP for the operator door (RFC 6238, 30-second steps, six digits, SHA-1,
// which is what every authenticator app implements).
//
// Owner decision D4: use `otplib` rather than hand-rolling RFC 6238 over
// node:crypto. Version 13.4.1, MIT, maintained, and its crypto plugins are
// @noble / @scure. It is a production dependency, so `npm run audit:prod`
// (`npm audit --omit=dev --audit-level=high`, a blocking step of test:security)
// covers it from here on.
//
// TOTP is MANDATORY and there is no way past it. No SMS, no email fallback, no
// "trust this device", and no environment variable, test fixture or build flag
// that skips it (handbook ruling R6). The blocking spec computes a real code
// from the seeded secret, exactly as an authenticator app would, because the
// alternative is a bypass that ships to production one tired evening.
//
// TWO DELIBERATE CHOICES ABOUT THE LIBRARY CALL
//
// 1. This module calls otplib's `generateSync` per step and compares, rather
//    than its `verify`. `verify` takes its candidate under the property name
//    `token`, and `token` is a banned identifier under the ops roots
//    (scripts/check-ops-blindness.mjs, owner amendment C1: a session or magic
//    link value is a credential an operator must never read). Writing
//    `{ token: candidate }` here would fail the build, and assembling the key
//    to dodge the scanner is the evasion the gate exists to catch. Generating
//    the expected codes and comparing them is the same computation with no
//    banned name in it, and it hands back the ABSOLUTE step that matched, which
//    is what the monotonic replay check below needs anyway.
//
// 2. Replay protection is monotonic, not equality-based. Rejecting only the
//    exact step that was just used still lets an attacker replay the OLDER code
//    that is still inside the plus-or-minus-one window. `matchTotpStep` returns
//    the step it matched and the caller refuses anything <= the last accepted
//    step.
//
// Free of `import "server-only"` on purpose: the blocking spec imports it to
// compute a genuine code, which is how a test authenticates without a bypass.
import { timingSafeEqual } from "node:crypto";
import { generateSecret, generateSync, generateURI } from "otplib";

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
// Plus or minus one step, so a clock a few seconds out still works.
export const TOTP_WINDOW_STEPS = 1;
export const TOTP_ISSUER = "Storyjar";

// 20 random bytes, Base32, which is what authenticator apps expect.
export function newTotpSecret(): string {
  return generateSecret({ length: 20 });
}

// The otpauth:// string an authenticator app consumes. Shown as TEXT on the
// enrolment screen, never as a QR image: the shared definition of done bans
// every img, next/image, svg-in-html, iframe and `data:` media under ops,
// because one <img> is all it takes to render a child's photograph, and a gate
// that makes an exception for "but this one is a QR code" is a gate with an
// exception in it.
export function totpEnrolmentUri(email: string, secret: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label: email, secret });
}

// Human-readable grouping for a secret typed in by hand.
export function formatSecretForTyping(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(" ");
}

export function totpStepAt(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function codeForStep(secret: string, step: number): string {
  return generateSync({ secret, epoch: step * TOTP_PERIOD_SECONDS });
}

// Constant-time compare of two same-length ASCII strings. Different lengths are
// a mismatch and are reported without comparing, which leaks only the length of
// the submitted value, and the submitted value is the attacker's own.
function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// Returns the ABSOLUTE step the submitted code matched, or null. Every step in
// the window is checked even after a match, so the work does not vary with
// which one hit.
export function matchTotpStep(secret: string, submitted: string, atMs: number = Date.now()): number | null {
  const trimmed = submitted.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) return null;
  const now = totpStepAt(atMs);
  let matched: number | null = null;
  for (let offset = -TOTP_WINDOW_STEPS; offset <= TOTP_WINDOW_STEPS; offset += 1) {
    const step = now + offset;
    if (sameCode(codeForStep(secret, step), trimmed)) matched = step;
  }
  return matched;
}
