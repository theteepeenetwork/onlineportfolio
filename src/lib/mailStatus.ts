// The vocabulary of mail delivery status (PR5). Pure: no database, no request,
// no environment, no secret. Every value here is a string, a number or a
// function over them.
//
// WHY IT IS HERE AND NOT UNDER src/lib/ops/
//
// It was written at src/lib/ops/mail.ts first, which is the name handbook
// ruling R1 gives it, and the blindness gate said no. Not because of anything
// in this file: because any file under src/ that imports an ops module is
// treated as ops code and scanned as if it were (see the "reachesOps" pass in
// scripts/check-ops-blindness.mjs, which exists so nobody can escape the gate
// by putting an operator action in src/app/actions/billing.ts). So the mailer
// importing an ops module dragged src/lib/mailer.ts and src/lib/mailCounters.ts
// into the operator scan, where they immediately failed for being what they
// are: mailCounters.ts imports the Prisma client, which only four named ops
// modules may do.
//
// That is the gate working rather than the gate being awkward, and the shape it
// pushed towards is the more honest one. This vocabulary belongs to mail. The
// operator area READS it. So it lives with the mailer, and the ops side reaches
// it through one reviewed entry on the gate's import allowlist, exactly as
// @/lib/stripeMode and @/lib/familyCodeMint do.
//
// The alternative was two copies, one in the mailer and one in the operator
// area. Two lists that agreed on the day they were written and drifted
// afterwards is how a screen ends up reporting on an outcome nothing produces
// any more.
//
// WHY EVERY VOCABULARY HERE IS CLOSED
//
// The provider's own words never reach the database. `sendMail` builds reasons
// like `http-429` and `rejected-error-related-to-recipient` out of whatever
// Mailjet returned, and a provider that one day starts putting the recipient's
// address in a rejection message would put it straight into a stored row. So
// the mapping below is total and one-way: an unrecognised reason becomes
// "other", and nothing that arrived from outside is ever written down.
//
// SAFEGUARDING note, quoted rather than cited by number because the numbering
// has drifted (owner amendment E2): rule 5, "admins are not all-seeing", and
// the owner's instruction that an operator sees registered schools, teachers
// and parents, and not children's data. Nothing here is about a child; nothing
// here is about a named adult either.

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
// Five entries, because five templates are sent. The rule this list is kept
// by: a key is added in the SAME COMMIT as the code that sends that mail, never
// before. An entry with no send path behind it puts a permanently empty row on
// the operator screen, and an empty row reads as "no mail of this kind has gone
// out" — an operator chasing a teacher who never got their invitation would be
// looking at a screen telling them the send is broken, when in fact the feature
// did not exist. "staff-invite" waited here for exactly that reason:
// staffInviteEmail() was written months before anything called it.
//
// The labels name the RECIPIENT as well as the mail, because the operator
// screen lists them together and "Password reset" alone would leave an operator
// wondering whether it covers their own door. It does not: an operator's
// recovery is docs/ops-recovery.md and sends no mail.
//
// "email-confirm" arrives with `emailConfirmationEmail()` and the two purchase
// routes that send it, in one commit, by the rule above. It is the one row on
// this screen an operator should expect to be SMALL and to matter a lot: it is
// sent only when somebody presses Buy without a proved address, so a run of
// failures on it is a run of schools that could not pay
// (docs/dpo-decisions.md, 2 Sep 2026).
//
// "school-invitation" arrives with `src/lib/schoolInvite.ts` and the
// schoolless-account branch of `inviteStaff`, in one commit, by the rule above.
// It is a SEPARATE key from "staff-invite" rather than a second use of it,
// which is worth stating because the two are deliberately indistinguishable on
// the admin's own screen: an operator asking "did that teacher get told?" is
// asking about a different message with a different failure mode (this one
// mints nothing and cannot expire in a mailbox), and collapsing them would make
// a run of failures on one look like ordinary noise in the other.
export const MAIL_TEMPLATE_KEYS = [
  "magic-link",
  "password-reset",
  "staff-invite",
  "email-confirm",
  "school-invitation",
] as const;

export type MailTemplateKey = (typeof MAIL_TEMPLATE_KEYS)[number];

export const MAIL_TEMPLATE_LABEL: Record<MailTemplateKey, string> = {
  "magic-link": "Parent sign-in link",
  "password-reset": "Teacher password reset",
  "staff-invite": "Staff invitation",
  "email-confirm": "Email confirmation before buying",
  "school-invitation": "Invitation for a teacher who already has an account",
};

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------
// SENT means Mailjet accepted the message for delivery. It does NOT mean it
// arrived: StoryJar has no delivery receipt, because open and click tracking
// are switched off at account level and on every message, and no event webhook
// is wired. The screen says so in those words rather than printing "delivered".
//
// UNCONFIGURED is its own outcome rather than a kind of failure, because it is
// a different problem with a different fix. A revoked or missing API key
// produces no attempt at the provider at all, so it generates no failure there
// and no bounce; the only place it is visible is here.
export const MAIL_OUTCOMES = ["SENT", "FAILED", "UNCONFIGURED"] as const;

export type MailOutcome = (typeof MAIL_OUTCOMES)[number];

// The shape src/lib/mailer.ts returns. Declared structurally rather than
// imported so that the mailer depends on this module and not the other way
// round, which would be a cycle.
export type MailAttemptResult = { ok: true } | { ok: false; reason: string };

// A coarse class for why an attempt failed, with an empty string for "nothing
// to say". Empty rather than null on purpose: it is part of the primary key of
// MailCounter, and SQLite treats NULLs as distinct in a unique constraint, so a
// nullable key column silently inserts a second row instead of incrementing the
// first.
export const MAIL_STATUS_CLASSES = [
  "",
  "4xx",
  "5xx",
  "other",
  "rejected",
  "timeout",
  "network",
] as const;

export type MailStatusClass = (typeof MAIL_STATUS_CLASSES)[number];

export const MAIL_STATUS_CLASS_LABEL: Record<MailStatusClass, string> = {
  "": "No further detail",
  "4xx": "Mailjet refused the request (4xx)",
  "5xx": "Mailjet had a problem at its end (5xx)",
  other: "An HTTP status outside the usual classes",
  rejected: "Mailjet accepted the request and rejected the message",
  timeout: "Mailjet did not answer within the timeout",
  network: "StoryJar could not reach Mailjet",
};

/**
 * Turn one send result into the two closed-vocabulary values a counter row is
 * keyed on. Total by construction: every input maps, and nothing from the
 * provider survives into the output.
 */
export function classifyMailResult(result: MailAttemptResult): {
  outcome: MailOutcome;
  statusClass: MailStatusClass;
} {
  if (result.ok) return { outcome: "SENT", statusClass: "" };

  const reason = result.reason;
  if (reason === "not-configured") return { outcome: "UNCONFIGURED", statusClass: "" };
  if (reason === "timeout") return { outcome: "FAILED", statusClass: "timeout" };
  if (reason === "network") return { outcome: "FAILED", statusClass: "network" };
  if (reason.startsWith("rejected-")) return { outcome: "FAILED", statusClass: "rejected" };

  const http = /^http-(\d{3})$/.exec(reason);
  if (http) {
    const first = http[1].charAt(0);
    if (first === "4") return { outcome: "FAILED", statusClass: "4xx" };
    if (first === "5") return { outcome: "FAILED", statusClass: "5xx" };
    return { outcome: "FAILED", statusClass: "other" };
  }

  // An unrecognised reason is still a failure, and it is recorded as one. What
  // it is NOT is written down: a reason this function has never seen is exactly
  // the case where the provider might have put something about the recipient
  // in it.
  return { outcome: "FAILED", statusClass: "other" };
}

export function isMailTemplateKey(value: string): value is MailTemplateKey {
  return (MAIL_TEMPLATE_KEYS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------
// The four states Mailjet's message list can leave an address in that mean
// StoryJar's mail is no longer arriving. UNSUBSCRIBED is here because of the
// failure mode owner amendment D2 describes: Mailjet attaches a one-click
// List-Unsubscribe header and its blocked-contacts list is account-wide, so a
// parent who unsubscribes from anything is unsubscribed from their own sign-in
// link, permanently, and requestMagicLink discards the send result to preserve
// F6 so nothing surfaces it. An operator who can ask "is this address being
// refused" can at least answer the call.
export const MAIL_SUPPRESSION_STATES = ["BOUNCE", "BLOCKED", "SPAM", "UNSUBSCRIBED"] as const;

export type MailSuppressionState = (typeof MAIL_SUPPRESSION_STATES)[number];

export const MAIL_SUPPRESSION_STATE_LABEL: Record<MailSuppressionState, string> = {
  BOUNCE: "Bounced: the address rejected the message",
  BLOCKED: "Blocked: Mailjet is refusing to send to this address",
  SPAM: "Marked as spam by the recipient",
  UNSUBSCRIBED: "Unsubscribed, which on this account also stops sign-in links",
};

export function isMailSuppressionState(value: string): value is MailSuppressionState {
  return (MAIL_SUPPRESSION_STATES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
// The fixed job vocabulary for JobRun.job. One entry today.
export const MAIL_SUPPRESSION_SYNC_JOB = "mail:suppression-sync";

// A JobRun is a SUCCESS or a FAILURE and nothing else. A third value would be
// a state somebody has to interpret.
export const JOB_OUTCOMES = ["SUCCESS", "FAILURE"] as const;
export type JobOutcome = (typeof JOB_OUTCOMES)[number];

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------
// Counter rows are bucketed by UTC day, and every window in the operator area
// is expressed in the same UTC days, so the screen and the recorder cannot
// disagree about which bucket "today" is. UK local time is deliberately not
// used: it would put the boundary an hour out for half the year and make two
// runs of the same test in the same second disagree in late March.

/** "YYYY-MM-DD", UTC, hand-built so no locale or runtime can vary it. */
export function utcDay(at: Date): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  const day = String(at.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The UTC day `back` days before `at`. `back` of 0 is `at`'s own day. */
export function utcDayBefore(at: Date, back: number): string {
  return utcDay(new Date(at.getTime() - back * 24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// What counts as needing attention
// ---------------------------------------------------------------------------
// Brief 05 asks for "5 or more failures for one template within 60 minutes, or
// a failure ratio above 20 percent across at least 10 attempts in 60 minutes".
// The first half of each of those is not expressible against these counters and
// saying so is more useful than approximating it: a MailCounter row is a UTC
// DAY, so the finest window this data supports is a day. A 60-minute rule needs
// an hourly bucket, which is a fourfold increase in row count for a signal
// nobody is currently watching, since there is no alert channel to watch it
// with (decision D13 is open, and an alert about mail delivered by the failing
// mail provider is not an alert).
//
// So the rule below is the ratio half, applied per day, and the screen says in
// words that it is a daily figure. Not overridable by an environment variable:
// brief 05 asks for that too, and a threshold nobody has ever wanted to change,
// with no alerting attached to it, would be a variable that exists so a
// document can be satisfied.
export const MAIL_FAILURE_RATIO = 0.2;
export const MAIL_RATIO_MIN_ATTEMPTS = 10;

export type MailVerdict = "NONE_ATTEMPTED" | "ALL_ACCEPTED" | "SOME_FAILED" | "NEEDS_ATTENTION";

/**
 * The verdict for one window, in a closed vocabulary the screen turns into a
 * sentence. Never a colour: handbook section 6 item 8, "convey no status by
 * colour alone", and brief 05's "Backup: 31 hours old (amber)" not a dot.
 */
export function mailVerdict(attempted: number, failed: number): MailVerdict {
  if (attempted === 0) return "NONE_ATTEMPTED";
  if (failed === 0) return "ALL_ACCEPTED";
  if (attempted >= MAIL_RATIO_MIN_ATTEMPTS && failed / attempted > MAIL_FAILURE_RATIO) {
    return "NEEDS_ATTENTION";
  }
  return "SOME_FAILED";
}

export const MAIL_VERDICT_LABEL: Record<MailVerdict, string> = {
  NONE_ATTEMPTED:
    "Nothing was attempted. That is normal out of term, and worth a look on a school morning.",
  ALL_ACCEPTED: "Every attempt was accepted by Mailjet.",
  SOME_FAILED: "Some attempts did not leave StoryJar.",
  NEEDS_ATTENTION: `Needs attention: more than ${Math.round(
    MAIL_FAILURE_RATIO * 100,
  )} per cent of attempts failed.`,
};
