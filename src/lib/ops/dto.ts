// The operator read contract (PR2). Types, the suppression constant, and the
// three pure functions that decide how a figure or an address is allowed to
// appear on screen.
//
// WHY THIS FILE HAS NO DATABASE IMPORT AND NO `server-only`
//
// It is the seam between src/lib/ops/reads.ts (which holds the only queries)
// and the screens under src/app/ops/. Backend publishes these types before the
// queries exist so the screens can be written against them, which is handbook
// section 4 item 5. Keeping it free of `server-only` is deliberate for the same
// reason src/lib/ops/enabled.ts and src/lib/ops/messages.ts are: a blocking
// spec has to be able to import the suppression threshold and the masking
// function and assert their behaviour directly, and a module carrying
// `server-only` throws the moment a Playwright test imports it. There is
// nothing secret here. Every value in this file is a type, a number, or a pure
// function over a string.
//
// WHAT THE SHAPES ARE FOR
//
// The rule that shapes all of them is the owner's, verbatim in effect:
// registered schools, teachers and which school they work at, and parents. Not
// children's data. So a school row carries adult and billing facts plus exactly
// one child-derived figure, the whole-school headcount that decides the price
// band, and that figure is suppressed below a threshold before it ever leaves
// the server. A DTO that carried the exact number and left the screen to hide
// it would be a screen away from a leak, and the next person to write a screen
// would not know.

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------
// Handbook ruling R10: "One suppression constant, MIN_CELL = 10, in one place."
// This is that place. Nothing else in the programme may define a second
// threshold, and nothing may compare against a literal 10.
//
// Why a threshold at all, when the figure is a whole-school total: a school
// with three children on roll, next to its name and its created date, is close
// to identifying those three children. The band is what billing actually needs,
// and the band never needs the exact number.
export const MIN_CELL = 10;

// ---------------------------------------------------------------------------
// The reason field (handbook ruling R16)
// ---------------------------------------------------------------------------
// Minimum 12 characters after trim, maximum 1000, stored verbatim. The server
// re-validates and is authoritative; the field is length-capped in the markup
// as a convenience and rendered inert when it is shown back.
//
// Be honest about what 12 characters buys: it stops an empty box. It does not
// stop "asdfasdfasdf". The real control is that the reason is attributed,
// permanent and readable by somebody other than the person who typed it.
export const REASON_MIN = 12;
export const REASON_MAX = 1000;

/** A plain-English problem with a reason, or null when it is acceptable. */
export function reasonProblem(raw: string): string | null {
  const reason = raw.trim();
  if (reason.length === 0) return "Say why you are looking this up before you search.";
  if (reason.length < REASON_MIN) {
    return `Say a little more about why you are looking this up. At least ${REASON_MIN} characters.`;
  }
  if (reason.length > REASON_MAX) {
    return `That is too long to save. Keep it under ${REASON_MAX} characters.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Masking (owner amendment C4)
// ---------------------------------------------------------------------------
// "Parent email addresses are masked by default, shown as ma***@me.com, with
// full reveal as a named operation requiring a stated reason and writing an
// audit record."
//
// Reveal is a named operation, and named operations arrive with the frozen
// registry in a later PR. This read-only PR builds the masking and stops there,
// which is stated on the screen so nobody assumes the address is simply
// missing. The system never needs a human to see an address in order to send to
// it; reveal exists for the support call where a teacher reports a parent
// receiving nothing.
//
// At most the first two characters of the local part survive, and never more
// than half of a short one, so a two-letter local part does not arrive intact.
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = address.slice(0, at);
  const domain = address.slice(at);
  const keep = Math.min(2, Math.max(1, local.length - 1));
  return `${local.slice(0, keep)}***${domain}`;
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

/**
 * A whole-school child headcount, already suppressed. `exact` is null below the
 * threshold and the screen renders `label` either way, so no screen can
 * accidentally print a number the server decided to withhold.
 */
export type HeadcountDto = {
  exact: number | null;
  label: string;
};

export function headcount(pupils: number): HeadcountDto {
  if (pupils >= MIN_CELL) {
    return { exact: pupils, label: `${pupils} pupils on roll (count only, no names)` };
  }
  return { exact: null, label: `Fewer than ${MIN_CELL} pupils on roll (count only, no names)` };
}

/**
 * The price band, computed on the server from bandForPupils. The screen renders
 * what it is given and never derives a band of its own.
 */
export type BandDto = {
  label: string;
  priceLabel: string;
};

// ---------------------------------------------------------------------------
// Billing state
// ---------------------------------------------------------------------------

export type SubscriptionDto = {
  /** FREE | SCHOOL, as written by the Stripe webhook mirror. */
  kind: string;
  /** TRIAL | ACTIVE | PAST_DUE | FROZEN. */
  status: string;
  /** Both together, so "registration type" is described in exactly one place. */
  registrationLabel: string;
  statusLabel: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  frozenAt: string | null;
};

// ---------------------------------------------------------------------------
// The link out to Stripe (PR3, owner decision D6)
// ---------------------------------------------------------------------------
// D6, recorded in docs/ops-architecture.md on 17 August 2026: "Manual payment
// recording is dropped from v1. A manual override that the next Stripe webhook
// silently reverts is worse than no control, because someone will trust it.
// Billing screens are read-only with a link out to Stripe, which is where the
// truth lives."
//
// So these shapes describe a LINK and nothing else. There is deliberately no
// field here for an override, a manual paid-until date, a note, or a
// precedence, because there is no operation that could write one. If a future
// PR adds one, it starts with the owner reopening D6, not with a field.
//
// The stored id is part of the DTO because the screen shows it: a link whose
// destination is hidden is a link the operator has to take on trust, and the
// id is the thing they would read out on a call to reconcile against Stripe.
// It is an adult billing identifier, already covered by RETENTION.md's
// "Billing records - subscription state, Stripe customer/subscription IDs" line
// at 6 years, and it authenticates nobody: reaching the object behind it needs
// Stripe's own login.

export type StripeLinkDto = {
  /** "Customer" or "Subscription", in words rather than as an id prefix. */
  what: string;
  /** The stored Stripe id, shown so the operator can see where the link goes. */
  id: string;
  /** An absolute https://dashboard.stripe.com/... URL. Never a relative path. */
  href: string;
};

export type StripeRefDto = {
  links: StripeLinkDto[];
  /**
   * Plain English for why there is nothing to link to, or null when there is.
   * An empty list with no explanation reads as a bug; this says which of the
   * two reasons it is.
   */
  absence: string | null;
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type SchoolRowDto = {
  id: string;
  schoolName: string;
  createdAt: string;
  staffCount: number;
  pupils: HeadcountDto;
  band: BandDto;
  /** Null when no subscription row has been created for this school yet. */
  billing: SubscriptionDto | null;
};

/**
 * One school's billing state (PR3). The same suppressed headcount and the same
 * server-computed band as SchoolRowDto, because the headcount is what justifies
 * the band and the band is the only reason ops counts children at all, plus the
 * link out to Stripe.
 *
 * There is no `staffCount` and no `createdAt` here: they belong to the register
 * of schools, not to the money, and a DTO carries only what its screen renders.
 */
export type BillingRowDto = {
  id: string;
  schoolName: string;
  pupils: HeadcountDto;
  band: BandDto;
  billing: SubscriptionDto | null;
  stripe: StripeRefDto;
};

/**
 * The whole billing screen. The statement about which Stripe data set the links
 * open is page-level rather than per row, because it is the same answer for
 * every row and repeating it beside each school would train the reader to skip
 * it.
 */
export type BillingViewDto = {
  /**
   * Which Stripe these links open, in words, so nobody reconciles a sandbox
   * against a real invoice, or why there are none.
   */
  stripeStatement: string;
  rows: BillingRowDto[];
};

// ---------------------------------------------------------------------------
// Adult lookup (handbook ruling R11)
// ---------------------------------------------------------------------------
// Exact-match email lookup only. No browse, no substring, no list, and no
// linkage from a parent to a child in either direction, including counts. The
// gate refuses the linkage structurally; these shapes are the same refusal
// written where a person will read it.

/**
 * Whether StoryJar knows that mail to this address is being refused by the
 * provider.
 *
 * PR2 shipped one value, NOT_MONITORED, because nothing recorded suppression.
 * PR5 added the feed, so there are now three honest answers and the first is
 * still one of them: with no MAIL_HMAC_KEY configured, or before the sync job
 * has ever run, StoryJar genuinely does not know, and saying "no problem" would
 * be inventing a green light.
 *
 * The suppressed states are the provider's, from src/lib/ops/mail.ts. They are
 * carried through as their own values rather than flattened to "suppressed",
 * because what an operator does next differs: a bounce means the address is
 * wrong and the school has to correct it, an unsubscribe means the parent
 * turned StoryJar off and only they can turn it back on.
 */
export type MailStateDto =
  | "NOT_MONITORED"
  | "NOT_SUPPRESSED"
  | "BOUNCE"
  | "BLOCKED"
  | "SPAM"
  | "UNSUBSCRIBED";

export const MAIL_STATE_LABEL: Record<MailStateDto, string> = {
  NOT_MONITORED:
    "Not monitored. StoryJar does not record yet whether mail to an address is being refused.",
  NOT_SUPPRESSED:
    "Mailjet is not refusing this address. That is not a delivery receipt: StoryJar cannot tell whether a message arrived or was read.",
  BOUNCE: "Bounced. This address rejected StoryJar's mail, so sign-in links are not arriving.",
  BLOCKED:
    "Blocked. Mailjet is refusing to send to this address, so sign-in links are not arriving.",
  SPAM: "Marked as spam by the recipient, so sign-in links are unlikely to arrive.",
  UNSUBSCRIBED:
    "Unsubscribed. On this account that is a block on everything, including their sign-in link, and only the parent can undo it.",
};

// ---------------------------------------------------------------------------
// Mail delivery status (PR5, handbook ruling R9)
// ---------------------------------------------------------------------------
// Counters, and a count of the addresses the provider is refusing. No recipient
// and no domain reaches these shapes, because none is stored: owner decision D7
// is unanswered and its published default is counters only.
//
// THERE IS NO SCHOOL DIMENSION HERE, and that is a consequence rather than an
// omission. Splitting mail figures by school means knowing which school each
// recipient belongs to, which means holding the recipient. The counters
// deliberately do not, so the figures are global and the screen says so. The
// per-school question an operator actually asks ("is this family getting their
// link?") is answered the other way round, from the adult record, by
// MailStateDto above.

/**
 * One row of the by-template breakdown inside a window.
 *
 * `templateKey`, not `template`: `template` is a relation to ActivityTemplate
 * elsewhere in the schema, and the blindness gate refuses the bare word
 * anywhere under the ops roots because it cannot tell a mail template from a
 * child's activity template. The column is named the same way for the same
 * reason (prisma/schema.prisma, MailCounter).
 */
export type MailTemplateTotalsDto = {
  /** The stored key, e.g. "magic-link". */
  templateKey: string;
  /** Plain English for the same thing. */
  label: string;
  attempted: number;
  accepted: number;
  failed: number;
  unconfigured: number;
  /** Why the failures failed, in words, coarsest first. Empty when none did. */
  failureReasons: { label: string; count: number }[];
};

/**
 * One window of counters. `verdictLabel` is a sentence, never a colour: a
 * delivery state shown as a coloured dot fails handbook section 6 item 8.
 */
export type MailWindowDto = {
  label: string;
  /** The UTC days this covers, inclusive, so the reader can check the arithmetic. */
  rangeLabel: string;
  attempted: number;
  accepted: number;
  failed: number;
  unconfigured: number;
  verdictLabel: string;
  byTemplate: MailTemplateTotalsDto[];
};

/**
 * How many addresses the provider is currently refusing, by state. A COUNT, and
 * never a list: a list of suppressed addresses is a list of adults locked out
 * of their children's work, and nothing operational needs to read it. The
 * individual question is asked from an adult record, one address at a time.
 */
export type MailSuppressionSummaryDto = {
  /** False when there is no key, or the sync has never run. Then counts are meaningless. */
  monitored: boolean;
  total: number;
  states: { state: string; label: string; count: number }[];
  /** Why the figures are what they are, or why there are none. */
  statement: string;
};

/** The last run of a scheduled job, as the operator screen shows it. */
export type JobRunDto = {
  job: string;
  label: string;
  startedAt: string;
  outcomeLabel: string;
  itemsAffected: number;
  note: string | null;
  /** "3 hours ago", in words, so a stale feed is legible without arithmetic. */
  ageLabel: string;
};

/**
 * The establishment register, as the health screen shows it.
 *
 * Counts and dates. There is no row here and there is no way to ask for one:
 * the register is public reference data about institutions and an operator has
 * no reason to browse it, so the tile answers "is it there and how old is it"
 * and stops.
 */
export type RegisterStatusDto = {
  /** True once the register has ever been refreshed. */
  imported: boolean;
  /** How many establishments are in it right now. */
  total: number;
  /** When the last refresh ran, or null if it never has. */
  lastRefresh: JobRunDto | null;
  /**
   * The day the DfE generated the file that was read, or null when the run did
   * not record one. Never inferred from the run's own date.
   */
  sourceFileDate: string | null;
  /** What the two figures above do and do not mean, in words, on the screen. */
  statement: string;
};

export type MailStatusDto = {
  windows: MailWindowDto[];
  suppression: MailSuppressionSummaryDto;
  /** Null when the sync job has never run at all. */
  lastCheck: JobRunDto | null;
  /** What "accepted" does and does not mean, in words, on the screen. */
  acceptedStatement: string;
  /** Why there is no per-school split. */
  scopeStatement: string;
};

export type TeacherRecordDto = {
  kind: "TEACHER";
  id: string;
  name: string;
  email: string;
  /** ADMIN | TEACHER | TA, in words rather than as a shouted code. */
  positionLabel: string;
  /** ACTIVE | INVITED. */
  status: string;
  createdAt: string;
  schoolName: string | null;
};

export type ParentRecordDto = {
  kind: "PARENT";
  id: string;
  /** Masked, always. The full address is never in this object. */
  maskedEmail: string;
  createdAt: string;
  mailState: MailStateDto;
};

export type AdultRecordDto = TeacherRecordDto | ParentRecordDto;

/** Which table an exact-match lookup should search. */
export type LookupKind = "TEACHER" | "PARENT";

export const LOOKUP_KIND_LABEL: Record<LookupKind, string> = {
  TEACHER: "A member of school staff",
  PARENT: "A parent or carer",
};

export function isLookupKind(value: string): value is LookupKind {
  return value === "TEACHER" || value === "PARENT";
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
// Formatted on the server so every screen shows the same thing and no client
// re-renders a date in the visitor's locale, which would make two operators
// reading the same row over a call disagree about what it says. Written out
// rather than taken from Intl so the output cannot vary with the runtime's
// locale data.
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatDay(value: Date | null | undefined): string | null {
  if (!value) return null;
  return `${value.getDate()} ${MONTHS[value.getMonth()]} ${value.getFullYear()}`;
}

/**
 * "2026-08-24" as "24 August 2026", **without ever constructing a Date**.
 *
 * For a CALENDAR DAY rather than a moment — the day the DfE published an
 * extract, say. `new Date("2026-08-24")` is UTC midnight, so anywhere west of
 * Greenwich `getDate()` returns the 23rd; this instance runs in Amsterdam where
 * it happens to return the 24th, and a fact that is right because of where the
 * server is, is a fact that is wrong the day the server moves. Sibling of
 * formatDay, which takes a moment and is right to.
 *
 * Returns null on anything that is not exactly YYYY-MM-DD, so a caller cannot
 * render a half-parsed date as though it knew one.
 */
export function formatIsoDay(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/**
 * A day and a time, in UTC and labelled as such (PR5).
 *
 * UTC rather than UK local time, and said out loud, because everything on the
 * mail screen is bucketed by UTC day. A timestamp rendered in one zone beside
 * totals bucketed in another is how somebody concludes at 00:30 in July that
 * the job has not run today when it ran twenty minutes ago.
 */
export function formatDayAndTime(value: Date | null | undefined): string | null {
  if (!value) return null;
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}, ${hours}:${minutes} UTC`;
}

/**
 * How long ago, in words and rounded down (PR5).
 *
 * The point of it is a stale feed. "Last checked 2 days ago" is read correctly
 * at a glance; a bare timestamp needs the reader to do subtraction, and the
 * whole reason this line exists is that a job which silently stopped running
 * produces no error at all, so its age IS the signal.
 */
export function formatAgo(value: Date, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - value.getTime()) / 1000);
  if (seconds < 0) return "in the future, which means a clock is wrong";
  if (seconds < 90) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}
