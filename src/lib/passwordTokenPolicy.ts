import { createHash } from "node:crypto";

// The rules a teacher password token obeys: what it may be for, how it is
// stored, and how long it lasts.
//
// This module is deliberately tiny and, like src/lib/signInLinkPolicy.ts, holds
// no `server-only` guard — so a blocking test can import it and assert the rules
// directly rather than inferring them from an action's behaviour. In particular
// a test can check the one thing that matters most here: that what reaches the
// database is the digest of the token and never the token.
//
// It imports `node:crypto` and nothing else, which means it is safe in a server
// action, a route handler and a test, and must NOT be imported by a client
// component. Nothing here is a secret: SHA-256 is unkeyed, and it is the right
// primitive precisely because the input is 192 bits of randomness rather than
// something a person chose. (Contrast src/lib/mailHmac.ts, where the input is an
// email address — a small guessable space — and a plain digest would be the
// address written down with extra steps.)

/**
 * What a token is for. Closed vocabulary, and the difference between the two is
 * real rather than cosmetic: a RESET is asked for by the person who will use it,
 * an INVITE is triggered by somebody else.
 */
export const PASSWORD_TOKEN_PURPOSES = ["RESET", "INVITE"] as const;

export type PasswordTokenPurpose = (typeof PASSWORD_TOKEN_PURPOSES)[number];

export function isPasswordTokenPurpose(value: string): value is PasswordTokenPurpose {
  return (PASSWORD_TOKEN_PURPOSES as readonly string[]).includes(value);
}

/**
 * A reset lasts 30 minutes. The teacher asked for it seconds ago and is sitting
 * in front of their inbox waiting; the same 30 minutes a parent's magic link
 * gets, for the same reason. Anything longer is a live account takeover sitting
 * in a mailbox for no benefit to the person who asked.
 */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/**
 * An invitation lasts 72 hours, and the number moved DOWN from 7 days because
 * the argument for 7 was false.
 *
 * Nobody asked for an invitation: a colleague sent it, and the recipient reads
 * school email when they next read school email. So it cannot have the reset's
 * 30 minutes — a window that expires before the recipient has plausibly looked
 * at their inbox does not add security, it adds a second email, and a flow that
 * reliably fails the first time is a flow people work around.
 *
 * WHAT WAS WRONG WITH 7 DAYS. This comment used to justify the longer window by
 * saying the exposure was bounded to "an account that has no data in it yet".
 * It is not. `assignClassToStaff` (src/app/actions/admin.ts) scopes by
 * `{ id, schoolId }` with **no status filter**, so an admin can give a class to
 * somebody who has not accepted yet — which is the ordinary onboarding order,
 * invite then assign. A live invitation token can therefore be a key to a class
 * of children's names, photographs, drawings, voice notes and its approval
 * queue. With the invitation email naming the school, an address an admin
 * mistyped would put that in a stranger's inbox for a week.
 *
 * 72 hours keeps the strongest of the real needs — an invitation sent on a
 * Friday afternoon still works on Monday morning — and drops the weakest. The
 * INSET-week argument was the weakest even when it was written, and it is
 * weaker now: `resendInvite` genuinely resends as of this change, where it was
 * a no-op that refreshed the page.
 *
 * Rule 1 says take the more protective option when a choice is unclear. This one
 * stopped being unclear the moment the bound turned out not to hold.
 */
export const STAFF_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export function passwordTokenTtlMs(purpose: PasswordTokenPurpose): number {
  return purpose === "INVITE" ? STAFF_INVITE_TTL_MS : PASSWORD_RESET_TTL_MS;
}

/** When a token minted at `now` for `purpose` stops working. */
export function passwordTokenExpiry(purpose: PasswordTokenPurpose, now: Date = new Date()): Date {
  return new Date(now.getTime() + passwordTokenTtlMs(purpose));
}

/**
 * The value that goes in `TeacherPasswordToken.resetHash`, for both writing a
 * new row and looking one up. One function for both directions on purpose: a
 * mint and a lookup that disagreed about the digest would fail every link, and a
 * second implementation is how that happens.
 *
 * Hex in, hex out. The raw token is never stored, logged or returned.
 */
export function hashPasswordToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Whether a stored row may still be spent. Both halves matter and they are
 * separate failures for a reason: an expired token is worth telling somebody
 * about ("ask for another"), a spent one is the ordinary case of a link opened
 * twice. The caller decides what to say; this decides what is true.
 */
export function passwordTokenIsUsable(
  token: { expiresAt: Date; usedAt: Date | null },
  now: Date = new Date(),
): boolean {
  return token.usedAt === null && token.expiresAt.getTime() > now.getTime();
}

// ---------------------------------------------------------------------------
// What the person reading the screen is told
// ---------------------------------------------------------------------------

/**
 * ONE sentence for every way a token can be refused — never minted, expired, or
 * already spent.
 *
 * `passwordTokenIsUsable` above knows which of those is true, and the screen
 * deliberately does not say. A page that distinguished "expired" from "already
 * used" from "no such token" would tell somebody holding a link they found
 * whether it was ever real, which is FINDINGS F6's account-enumeration problem
 * one level down: not "does this address have an account" but "is this token a
 * token".
 *
 * It also has to leave a teacher somewhere to go. The commonest reader of this
 * sentence is not an attacker; it is somebody on a Monday morning who clicked
 * the link in yesterday's email.
 */
export const TOKEN_REFUSED_MESSAGE =
  "That link has expired or has already been used. Ask for a new one below and we'll send a fresh link.";

/**
 * The password rule, which is the SAME rule as signup (`createTeacherAccount`).
 *
 * Stated once and shared rather than repeated: a reset that demanded more than
 * signup would refuse the password a teacher already uses, on the very screen
 * they reached because they could not remember it.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** The problem with a proposed password, or null if there isn't one. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) return "Those two passwords don’t match.";
  return null;
}
