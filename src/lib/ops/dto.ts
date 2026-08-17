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
 * Whether Storyjar knows that mail to this address is being refused by the
 * provider. There is no delivery-status feed yet, so the only honest value is
 * "not monitored". A tile or a row with no feed says so rather than rendering
 * calm, which is the convention the whole operator area uses.
 */
export type MailStateDto = "NOT_MONITORED";

export const MAIL_STATE_LABEL: Record<MailStateDto, string> = {
  NOT_MONITORED:
    "Not monitored. Storyjar does not record yet whether mail to an address is being refused.",
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
