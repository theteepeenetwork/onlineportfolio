// The rules a school invitation obeys: what states it can be in, what roles it
// can offer, how long it stays answerable, and what a teacher is told when it
// is refused.
//
// NO `server-only` GUARD, for the reason src/lib/passwordTokenPolicy.ts and
// src/lib/signInLinkPolicy.ts give: a blocking test imports these rules
// directly and asserts them, rather than inferring them from an action's
// behaviour. The whole point of a policy module is that the rule can be read
// and checked in one place; a guard that stopped the test importing it would
// leave the rule provable only through the screens that consume it.
//
// It imports NOTHING — not the Prisma client, not `next/*`, not `node:*` — so
// it is safe in a server action, a route handler, a test and a client
// component alike. Keep it that way: the moment this file needs the database
// it stops being the rules and starts being the implementation, and the
// implementation belongs in the action.
//
// WHAT THIS MODULE IS NOT. It does not decide WHO may invite (that is
// `requireAdmin` plus the verified-school gates in src/app/actions/admin.ts),
// and it does not decide what accepting DOES (that is one `Teacher.schoolId`
// write, in a transaction that consumes the row). It decides only what is true
// about an invitation.

/**
 * The states an invitation can be in. Closed vocabulary, checked before a row
 * is written; SQLite has no enum, which is why `Teacher.role`,
 * `Teacher.status` and `Session.role` are strings too.
 *
 * PENDING     the offer is live and the teacher can answer it
 * ACCEPTED    the teacher joined; `Teacher.schoolId` was written in the same
 *             transaction that wrote this
 * DECLINED    the teacher said no
 * REVOKED     the school took it back
 * SUPERSEDED  the teacher accepted a DIFFERENT school's offer, so this one
 *             closed without anybody acting on it
 *
 * THE LAST THREE ARE THREE VALUES AND NOT ONE "CLOSED", because they answer
 * different questions and a support call asks which one happened. Collapsing
 * them would make "did she turn us down or did we withdraw it?" unanswerable
 * from the row, and the audit log is not always at hand when somebody rings.
 *
 * THERE IS DELIBERATELY NO `EXPIRED`. Expiry is a past `expiresAt` read at the
 * moment of asking — see SCHOOL_INVITATION_TTL_MS and
 * `schoolInvitationIsOpen` below. A state would have to be written by a sweep,
 * a sweep that stops running is a silent widening, and its absence looks
 * exactly like an offer that is still open.
 */
export const SCHOOL_INVITATION_STATES = [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "REVOKED",
  "SUPERSEDED",
] as const;

export type SchoolInvitationState = (typeof SCHOOL_INVITATION_STATES)[number];

export function isSchoolInvitationState(value: string): value is SchoolInvitationState {
  return (SCHOOL_INVITATION_STATES as readonly string[]).includes(value);
}

/**
 * The roles an invitation can offer: the SAME closed vocabulary as
 * `Teacher.role`, in the same words, because this value is copied onto the
 * teacher when they accept. A parallel set would be two vocabularies that
 * agree until the day somebody adds to one of them.
 *
 * A THIRD COPY OF THESE WORDS EXISTS at `ROLES` in src/app/actions/admin.ts,
 * which is module-private. Whoever wires the invitation actions should import
 * this list there rather than leave two arrays to drift; it was left alone in
 * this commit only because that file is not in this change.
 *
 * WHETHER ADMIN MAY BE OFFERED IS NOT DECIDED HERE. An unverified school may
 * not offer it at all (docs/dpo-decisions.md, 2 Sep 2026), and that is a rule
 * about the school rather than about the vocabulary.
 */
export const SCHOOL_INVITATION_ROLES = ["ADMIN", "TEACHER", "TA"] as const;

export type SchoolInvitationRole = (typeof SCHOOL_INVITATION_ROLES)[number];

export function isSchoolInvitationRole(value: string): value is SchoolInvitationRole {
  return (SCHOOL_INVITATION_ROLES as readonly string[]).includes(value);
}

/**
 * An invitation lasts 14 DAYS.
 *
 * THIS NUMBER IS NOT `STAFF_INVITE_TTL_MS`, AND THE DIFFERENCE IS THE WHOLE
 * ARGUMENT. That one is 72 hours (src/lib/passwordTokenPolicy.ts) because the
 * thing it governs is a bearer token sitting in a mailbox: an address an admin
 * mistyped puts a WORKING KEY to a class of children's names, photographs and
 * voice notes into a stranger's inbox, and every extra hour is another hour of
 * that. The number was moved DOWN to 72 hours for exactly that reason, and it
 * is right.
 *
 * NONE OF THAT APPLIES HERE. This record is not mailed and cannot be
 * forwarded. It is actionable only by the authenticated holder of the account
 * it names, in the app, after signing in — the owner decision of 1 September
 * 2026, and the reason there is no secret column on the model. A mistyped
 * address reaches somebody who cannot act on it at all, because the offer is
 * bound to a teacher id and not to whoever opened an email. The mailbox
 * exposure that buys the 72 hours is nil, so a short clock here buys nothing
 * except a second email and a teacher who has to ask twice.
 *
 * IT STILL EXPIRES, AND THAT IS NOT SYMMETRY FOR ITS OWN SAKE. An offer that
 * never lapsed would be a school's standing claim on somebody else's pupils,
 * open for ever, answerable on a day nobody remembers making it — including
 * after the school stopped paying, after the admin who sent it left, and after
 * the teacher moved to a different school. A pending invitation is a live
 * route by which children's data changes hands, so it gets a clock.
 *
 * 14 DAYS, BETWEEN THE TWO THINGS THAT DECIDE IT. Long enough to survive a
 * week's leave plus the weekend either side, which is the realistic worst case
 * for a teacher who is asked on the Friday before half term. Short enough that
 * a school which changed its mind — or never followed up — is not leaving a
 * live offer standing for a term.
 *
 * IT IS THE PLATFORM LEAD'S NUMBER, NOT THE FOUNDER'S, and it is stated here
 * in one place precisely so it can be overruled in one place: change this
 * constant and every screen, action and test follows. If it moves, the
 * paragraph above is the one to disagree with, not the digits.
 */
export const SCHOOL_INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** When an invitation created at `now` stops being answerable. */
export function schoolInvitationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + SCHOOL_INVITATION_TTL_MS);
}

/**
 * Whether an invitation may still be answered.
 *
 * BOTH HALVES, READ TOGETHER, EVERY TIME. `state === "PENDING"` alone is the
 * bug this function exists to prevent: without the clock, a row written in
 * September is still answerable in June. `expiresAt` alone is the other half
 * of the same bug: an offer the school revoked this morning has a date months
 * away.
 *
 * DENY BY DEFAULT (SAFEGUARDING rule 8): it names the one state that is open
 * rather than the ones that are closed, so a sixth state added later is
 * refused until somebody decides what it means.
 *
 * The caller passes only the two columns it needs, so a test can call this
 * with a plain object and no database at all.
 */
export function schoolInvitationIsOpen(
  invitation: { state: string; expiresAt: Date },
  now: Date = new Date(),
): boolean {
  return invitation.state === "PENDING" && invitation.expiresAt.getTime() > now.getTime();
}

// ---------------------------------------------------------------------------
// What the teacher reading the screen is told
// ---------------------------------------------------------------------------

/**
 * ONE sentence for every way an invitation can be refused: never sent,
 * expired, declined already, revoked by the school, an id that names no row,
 * and an id that names somebody else's row.
 *
 * The code always knows which of those is true and the screen deliberately
 * does not say, for the reason `TOKEN_REFUSED_MESSAGE` gives one level down.
 * Distinguishing them would answer questions nobody signed in should be able
 * to ask: "is this invitation id real?", and — worse, because it names a
 * person and a school together — "does St Bede's have an open offer out to
 * this teacher?". A teacher who pastes a colleague's link must learn nothing
 * from the difference between a wrong id and somebody else's id. That is
 * FINDINGS F6's account-existence problem in a second place, and the same
 * answer works: refuse identically and say so once.
 *
 * IT ALSO HAS TO LEAVE SOMEBODY SOMEWHERE TO GO, and the commonest reader is
 * not an attacker. It is a teacher on a Monday morning opening a link from a
 * fortnight ago, or one who declined by accident. So it names the person who
 * can fix it — their school's admin, who can send another — rather than
 * ending at "no".
 *
 * It does NOT name the school. The refused reader may be somebody who was
 * never invited by anyone.
 */
export const INVITATION_REFUSED_MESSAGE =
  "That invitation isn't open any more — it may have been answered already, withdrawn, or run out of time. " +
  "Ask the school's StoryJar admin to send you a new one.";

// ---------------------------------------------------------------------------
// The seventh refusal, and the one that does NOT share the sentence above
// ---------------------------------------------------------------------------
//
// WHY THIS ONE IS DIFFERENT IN KIND. The six modes above are all facts about
// the INVITATION — never sent, expired, declined, revoked, not yours, not real
// — and they share one sentence precisely because the differences between them
// are things a signed-in teacher must not be able to ask about somebody else's
// account ("is this id real?", "does St Bede's have an offer out to her?").
//
// This one is a fact about the READER'S OWN ACCOUNT: she has never proved she
// holds the address she signed up with. It gives away nothing about any
// invitation, any school or any colleague, because she is the only person it
// is about — and, unlike all six, IT IS SOMETHING SHE CAN FIX IN THE NEXT
// MINUTE. Telling her "that invitation isn't open any more" would be both
// false and useless: the offer is open, and the sentence would send her to ask
// her school's admin for a replacement that would be refused in exactly the
// same way.
//
// WHAT IT IS FOR. Signup proves no address at all (FINDINGS F67), so an
// account registered against head@realschool.sch.uk by somebody who does not
// hold that mailbox can answer an offer the school aimed at that mailbox — and
// an invitation carrying ADMIN is one `assignClassToStaff` press from reading
// every child's work in the school. Requiring the mailbox at ACCEPT is what
// every other route into a school already has by construction: `inviteStaff`
// mails a bearer token, `claimSchool` requires `emailConfirmedAt`, and
// `setStaffRole` can only promote somebody who arrived through one of those.
//
// THREE SENTENCES, NOT ONE, for the reason the purchase gate gives one file
// over (src/lib/passwordTokenPolicy.ts): a teacher who is told a link is on
// its way when it is not, or that nothing was sent when something was, waits
// for the wrong thing. They are worded for THIS door rather than shared with
// the purchase door, whose wording opens "Before you can buy" and would be
// nonsense to a teacher who is not buying anything.

/**
 * The refusal when her address is not proved, WITH the confirmation link
 * already on its way.
 *
 * It names the address, because a typo made at signup is invisible until the
 * moment it costs something, and this is that moment. It says which button to
 * press again rather than sending her looking for a resend that does not
 * exist: pressing Join IS the resend.
 */
export function invitationNeedsConfirmedEmailMessage(email: string): string {
  return (
    `Before you can join a school, we need to know we can reach you. We've emailed a link to ${email} — ` +
    `open it, then come back and press Join again. ` +
    `If it hasn't arrived in a few minutes, check your junk folder, and press Join again for a fresh link.`
  );
}

/**
 * The same refusal when no link could be sent, because this account has asked
 * for several in the last few minutes.
 *
 * A SEPARATE SENTENCE because the one above would be a promise of an email
 * that is not coming, and a teacher who then waits for it has no way to tell
 * the difference.
 */
export const INVITATION_EMAIL_CONFIRMATION_THROTTLED_MESSAGE =
  "Before you can join a school, we need to know we can reach you — and we've already sent you a link in the last few " +
  "minutes. Please open the most recent one, or wait a moment and press Join again.";

/**
 * The refusal when StoryJar could not establish whether the address is proved
 * at all — her own record could not be read.
 *
 * REFUSES RATHER THAN ALLOWS (SAFEGUARDING rule 8). What is being gated hands
 * a class of children's work to a school, so an unreadable row is not a case
 * to be generous about. It says plainly that nothing happened, because the
 * thing she is afraid of on this screen is having half-joined.
 */
export const INVITATION_EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE =
  "We couldn't check your account just now, so nothing has changed and you have not joined anything. " +
  "Please refresh the page and try once more.";
