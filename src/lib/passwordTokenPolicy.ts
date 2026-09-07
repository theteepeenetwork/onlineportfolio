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
 * What a token is for. Closed vocabulary, and the differences are real rather
 * than cosmetic: a RESET is asked for by the person who will use it, an INVITE
 * is triggered by somebody else, and a CONFIRM does not set a password at all.
 *
 * THE LINE THAT MATTERS RUNS BETWEEN THE FIRST TWO AND THE THIRD.
 *
 * RESET and INVITE both end in a password write, so they share one pool:
 * `mintPasswordToken` spends every unspent one the teacher holds when it mints
 * another, and only one password-setting link is ever live. That rule is
 * correct and this change does not touch it.
 *
 * CONFIRM proves that a mailbox answered and does nothing else. It is minted by
 * its own function, into its own pool, and neither spends the other — see
 * `PASSWORD_SETTING_PURPOSES` below for why lumping them together is a bug in
 * both directions.
 */
export const PASSWORD_TOKEN_PURPOSES = ["RESET", "INVITE", "CONFIRM"] as const;

export type PasswordTokenPurpose = (typeof PASSWORD_TOKEN_PURPOSES)[number];

export function isPasswordTokenPurpose(value: string): value is PasswordTokenPurpose {
  return (PASSWORD_TOKEN_PURPOSES as readonly string[]).includes(value);
}

/**
 * The purposes that END IN A PASSWORD WRITE, and therefore the ones that may
 * spend each other and the only ones `setPassword` will accept.
 *
 * WHY THIS LIST EXISTS AS A LIST. Two rules hang off it and both are one
 * character away from a hole:
 *
 *   1. `mintPasswordToken` spends the outstanding tokens in this set only. Left
 *      unscoped it would spend a CONFIRM as well, and then a teacher who asked
 *      for a password reset while a confirmation was in flight would find the
 *      confirmation link dead — blocked at checkout, holding an email that no
 *      longer works, with nothing on screen explaining why.
 *   2. `setPassword` refuses anything not in this set. A confirmation link is
 *      sent to an address NOBODY HAS PROVED YET — that is the entire reason it
 *      is being sent — so a token that could also set a password would hand the
 *      account to whoever received a mistyped address. Today that stranger gets
 *      an email they can ignore; without this check they would get a takeover.
 *      Rule 8: the consumer names the purposes it accepts rather than the ones
 *      it rejects, so a fourth purpose is refused until somebody decides.
 */
export const PASSWORD_SETTING_PURPOSES: readonly PasswordTokenPurpose[] = ["RESET", "INVITE"];

export function isPasswordSettingPurpose(value: string): boolean {
  return (PASSWORD_SETTING_PURPOSES as readonly string[]).includes(value);
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

/**
 * An email confirmation lasts 24 hours, which is longer than a reset and
 * shorter than an invitation, and it is neither of those numbers for a reason.
 *
 * NOT 30 MINUTES, like the reset it is otherwise shaped like. The reset's short
 * window is bought with an argument about EXPOSURE — a live reset link sitting
 * in a mailbox is a complete account takeover waiting to be picked up — and
 * that argument does not apply here. A confirmation link sets no password,
 * ends no session and grants no access; all it does is record that this mailbox
 * answered. Anybody who can read the mailbox for those 24 hours can already ask
 * for a password reset at any moment of any day, so the token adds nothing to
 * what they could do. With no exposure to price, the number is decided by the
 * other side of the ledger, and that side is not close: the teacher who has
 * just been asked to prove their address is on the way to spending several
 * hundred pounds, and will often go and find a card, a purchase order number or
 * a business manager before they come back.
 *
 * NOT 72 HOURS, like the invitation. The invitation's long window is bought
 * with "nobody asked for this" — it arrives unbidden and is read whenever
 * school email is read. A confirmation IS asked for, seconds earlier, by
 * somebody standing at a checkout. A day covers a link that arrives at 4pm and
 * is opened the next morning, which is the realistic worst case, and it stops
 * short of leaving one live across a weekend.
 *
 * Resending is free and unlimited-ish (`requestEmailConfirmation` throttles it
 * the same way a reset is throttled), and each new one spends the last, so the
 * cost of getting this number slightly wrong is one more email rather than a
 * teacher who cannot buy.
 */
export const EMAIL_CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;

export function passwordTokenTtlMs(purpose: PasswordTokenPurpose): number {
  if (purpose === "INVITE") return STAFF_INVITE_TTL_MS;
  if (purpose === "CONFIRM") return EMAIL_CONFIRM_TTL_MS;
  return PASSWORD_RESET_TTL_MS;
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
 * What a teacher is told when they press Buy and their address is not proved
 * yet, WITH the confirmation email already on its way.
 *
 * It has to do three things at once, and the third is the one that is usually
 * left out. It has to say what happened, name the address so a typo at signup
 * is visible at the moment it matters, and tell them how to get another link
 * WITHOUT sending them looking for a button that does not exist: pressing Buy
 * again is the resend, so the sentence says so.
 *
 * `%s` is not used; the address is interpolated by the caller, because a
 * template string here would be one more thing to get out of step with the
 * screen. Written as a function so there is exactly one wording.
 */
export function emailConfirmationSentMessage(email: string): string {
  return (
    `Before you can buy, we need to know we can reach you. We've emailed a link to ${email} — ` +
    `open it, then come back and press the button again. ` +
    `If it hasn't arrived in a few minutes, check your junk folder, and press the button again for a fresh link.`
  );
}

/**
 * The same refusal when the email could NOT be sent again — because this
 * address or this school has asked for too many in a short time.
 *
 * A SEPARATE SENTENCE, because the one above would be a lie: it promises an
 * email that is not coming, and a teacher who then waits for it is stuck with
 * no way to tell the difference. Whatever the rate limit is protecting, it is
 * not worth telling somebody trying to pay that a link is on its way when it
 * is not.
 */
export const EMAIL_CONFIRMATION_THROTTLED_MESSAGE =
  "Before you can buy, we need to know we can reach you — and we've already sent you a link in the last few minutes. Please open the most recent one, or wait a moment and try again.";

/**
 * The refusal when StoryJar could not even establish whether the address is
 * proved — the teacher's own record could not be read.
 *
 * A THIRD SENTENCE RATHER THAN REUSING EITHER OF THE TWO ABOVE, because both of
 * those tell the teacher something that may not be true: that an email is on
 * its way, or that one was recently sent. On this path nothing was sent and
 * nothing is coming, and a person who waits for a link that does not exist is
 * worse off than one who is told to try again.
 *
 * It refuses rather than allowing, which is rule 8 and is the only defensible
 * way round: what is being gated creates a school and makes the caller its
 * admin.
 */
export const EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE =
  "We couldn't check your account just now, so we haven't taken any payment or set anything up. Please refresh and try once more.";

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
