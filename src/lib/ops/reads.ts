import "server-only";
import { db } from "@/lib/db";
import { bandForPupils, formatPrice } from "@/lib/billing-plans";
import { allowCodeLookup, recordCodeHit, recordCodeMiss, RATE_LIMITED_MESSAGE } from "@/lib/rateLimit";
import { recordOpsAudit } from "@/lib/ops/audit";
import { requireOperator } from "@/lib/ops/session";
import { currentStripeMode, stripeModeStatement, stripeRef } from "@/lib/ops/stripeLinks";
import {
  formatDay,
  headcount,
  maskEmail,
  type AdultRecordDto,
  type BandDto,
  type BillingViewDto,
  type LookupKind,
  type SchoolRowDto,
} from "@/lib/ops/dto";

// ---------------------------------------------------------------------------
// The operator read chokepoint (PR2).
// ---------------------------------------------------------------------------
//
// One of the three modules permitted to import the Prisma client under the ops
// roots. Every figure and every field an operator can ever see passes through a
// named function in this file, so the answer to "what can Storyjar staff see?"
// is the export list below rather than a promise.
//
// THE RULES THIS FILE IS SHAPED BY, quoted rather than cited by number, because
// the numbering has drifted at least once (owner amendment E2):
//
//   SAFEGUARDING rule 4: every query returning child data is scoped by teacher,
//   class or the parent-to-child link. There is no such query here at all.
//   Rule 5: "admins are not all-seeing". Rule 8: deny by default. Rule 11 ends
//   "children must never be profiled", and an activity metric is a profile.
//
//   Owner instruction, verbatim in effect: registered schools, teachers and
//   which school they work at, and parents. Not children's data.
//
// WHAT IS DELIBERATELY NOT HERE, so the next person does not go looking:
//
//   - No child row, no child name, no per-child figure of any kind. The only
//     child-derived number in this file is a whole-school headcount, and it is
//     suppressed below MIN_CELL before it is returned.
//   - No per-class figure. A class of one names that child.
//   - No parent-to-child linkage in either direction, including a count. The
//     owner was asked directly and chose to keep the count refused (handbook
//     ruling R11). The blindness gate enforces it structurally.
//   - No free-text search. The two lookups are exact-match on a unique column,
//     so an address the operator did not already hold finds nothing.
//   - No credential value. familyCode, classCode and session values sign a
//     person in, so reading one is an all-seeing path in disguise (owner
//     amendment C1). Every read below names its columns, because a Prisma read
//     with no `select:` returns every scalar column including those.
//
// EVERY EXPORT RESOLVES THE OPERATOR ITSELF
//
// The page or action that calls one of these has already run requireOperator().
// These functions run it again rather than accepting an actor as a parameter.
// Two reasons, and neither is belt-and-braces for its own sake: the read
// chokepoint refuses to read for anybody it cannot identify on its own, so a
// future caller that forgets the guard gets a 404 rather than data; and the
// audit actor comes from the resolved session instead of an argument, which is
// the same rule src/lib/ops/audit.ts already states for its own callers. The
// cost is one indexed lookup per request.

// A hard ceiling rather than pagination. There are three schools today and a
// pilot's worth in prospect, so a page control would be scaffolding for a
// problem nobody has. When it is needed it is a deterministic cursor on
// (createdAt, id), which is why the sort is already written that way.
const SCHOOLS_PAGE_MAX = 100;

// ---------------------------------------------------------------------------
// Schools
// ---------------------------------------------------------------------------

/**
 * The whole-school child headcount that decides the price band.
 *
 * This is the one place in the programme that counts children, and the filter
 * is the reason it is safe: it selects nothing, it names no class and no child,
 * and its only argument is a school id. `Class` carries no schoolId column, so
 * the route from a child to a school runs through the class's teacher, which is
 * an adult record the operator may already read.
 *
 * The blindness gate refused this shape until a narrowly written permission was
 * added for exactly it (OPS-CHILD-RELATION, see the comment on
 * SCHOOL_SCOPE_INNER in scripts/check-ops-blindness.mjs). Anything else through
 * this relation, including a per-class figure, still fails.
 */
async function pupilsOnRoll(schoolId: string): Promise<number> {
  return db.student.count({ where: { class: { teacher: { schoolId } } } });
}

function bandFrom(pupils: number): BandDto {
  const band = bandForPupils(pupils);
  return { label: band.label, priceLabel: `${formatPrice(band.price)} a year` };
}

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "On trial",
  ACTIVE: "Paid up",
  PAST_DUE: "Payment overdue",
  FROZEN: "Read-only, payment lapsed",
};

// A position within a school, in words. The column holds ADMIN | TEACHER | TA
// and an operator screen that prints a shouted enum is a screen that teaches
// its reader the database's vocabulary instead of the school's.
const POSITION_LABEL: Record<string, string> = {
  ADMIN: "Admin at this school",
  TEACHER: "Teacher",
  TA: "Teaching assistant",
};

const KIND_LABEL: Record<string, string> = {
  FREE: "Teacher plan, free",
  SCHOOL: "School plan",
};

/**
 * Every registered school, newest first, with its billing state, its price band
 * and its suppressed headcount. Adult and billing facts throughout, plus the
 * one child-derived number the band needs.
 */
export async function listSchools(): Promise<SchoolRowDto[]> {
  await requireOperator();

  const rows = await db.school.findMany({
    take: SCHOOLS_PAGE_MAX,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { staff: true } },
      subscription: {
        select: {
          kind: true,
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          frozenAt: true,
        },
      },
    },
  });

  const rolls = await Promise.all(rows.map((row) => pupilsOnRoll(row.id)));

  return rows.map((row, i) => {
    const pupils = rolls[i];
    const sub = row.subscription;
    return {
      id: row.id,
      schoolName: row.name,
      createdAt: formatDay(row.createdAt) ?? "",
      staffCount: row._count.staff,
      pupils: headcount(pupils),
      band: bandFrom(pupils),
      billing: sub
        ? {
            kind: sub.kind,
            status: sub.status,
            registrationLabel: KIND_LABEL[sub.kind] ?? sub.kind,
            statusLabel: STATUS_LABEL[sub.status] ?? sub.status,
            trialEndsAt: formatDay(sub.trialEndsAt),
            currentPeriodEnd: formatDay(sub.currentPeriodEnd),
            frozenAt: formatDay(sub.frozenAt),
          }
        : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Billing (PR3, owner decision D6)
// ---------------------------------------------------------------------------
//
// Read-only, and structurally so. There is no write here, no override field and
// no precedence rule, because owner decision D6 (docs/ops-architecture.md,
// 2026-08-17) dropped manual payment recording from v1: the Subscription row is
// a MIRROR written by the Stripe webhook, so anything an operator typed into it
// would be reverted by the next event without telling them. The screen shows
// the mirror and links out to Stripe, which is where the truth lives.
//
// The columns are named one at a time, as everywhere else in this file. That is
// not ceremony: a Prisma read with no `select:` returns every scalar column,
// and the gate refuses one for exactly that reason.

// What needs attention, then what does not. A school whose payment has failed
// or whose account has already gone read-only is the reason an operator opens
// this screen at all, and a list sorted by anything else buries it. Sorted in
// this process rather than in SQL because the order is a judgement about what
// matters, not a column, and the list is capped at SCHOOLS_PAGE_MAX rows.
const BILLING_ATTENTION_ORDER = ["PAST_DUE", "FROZEN", "TRIAL", "ACTIVE"];

// A school with no Subscription row at all sorts last, after every known
// status. It is not an alarm: it is what a school looks like before anybody has
// arranged to pay.
function attentionRank(status: string | null): number {
  if (status === null) return BILLING_ATTENTION_ORDER.length + 1;
  const at = BILLING_ATTENTION_ORDER.indexOf(status);
  return at === -1 ? BILLING_ATTENTION_ORDER.length : at;
}

/**
 * Every registered school's billing state, the price band, the headcount that
 * justifies the band, and the way through to Stripe.
 *
 * The headcount comes from headcount() in src/lib/ops/dto.ts, the same
 * suppression the schools list uses, so the exact number never leaves the
 * server below the threshold. There is deliberately no second threshold and no
 * band worked out anywhere but here (handbook ruling R10: "One suppression
 * constant, MIN_CELL = 10, in one place").
 *
 * FREE teacher plans are not here. A free plan has no price, no band and no
 * Stripe customer, so a row for one would be five empty fields next to a
 * person's name; the schools register is where an account is looked up.
 */
export async function listBilling(): Promise<BillingViewDto> {
  await requireOperator();

  const rows = await db.school.findMany({
    take: SCHOOLS_PAGE_MAX,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      subscription: {
        select: {
          kind: true,
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          frozenAt: true,
          // Two opaque billing identifiers, and the only reason they are read:
          // they are what a dashboard link is built from. They authenticate
          // nobody (reaching the object behind one needs Stripe's own login),
          // they are already covered by RETENTION.md's six-year billing line,
          // and no Stripe call is made with either of them from anywhere in
          // this area.
          stripeCustomerId: true,
          stripeSubscriptionId: true,
        },
      },
    },
  });

  // Resolved once for the whole page rather than per row: it is the same answer
  // every time, and it is the only impure thing in the link path.
  const mode = currentStripeMode();
  const rolls = await Promise.all(rows.map((row) => pupilsOnRoll(row.id)));

  const billing = rows.map((row, i) => {
    const pupils = rolls[i];
    const sub = row.subscription;
    return {
      id: row.id,
      schoolName: row.name,
      pupils: headcount(pupils),
      band: bandFrom(pupils),
      billing: sub
        ? {
            kind: sub.kind,
            status: sub.status,
            registrationLabel: KIND_LABEL[sub.kind] ?? sub.kind,
            statusLabel: STATUS_LABEL[sub.status] ?? sub.status,
            trialEndsAt: formatDay(sub.trialEndsAt),
            currentPeriodEnd: formatDay(sub.currentPeriodEnd),
            frozenAt: formatDay(sub.frozenAt),
          }
        : null,
      stripe: stripeRef(mode, sub?.stripeCustomerId ?? null, sub?.stripeSubscriptionId ?? null),
    };
  });

  // Ties broken on the school name with a plain comparison rather than
  // localeCompare, so two runs on two machines cannot disagree about the order
  // for the same reason dates are formatted by hand in src/lib/ops/dto.ts.
  billing.sort((a, b) => {
    const rank = attentionRank(a.billing?.status ?? null) - attentionRank(b.billing?.status ?? null);
    if (rank !== 0) return rank;
    if (a.schoolName === b.schoolName) return a.id < b.id ? -1 : 1;
    return a.schoolName < b.schoolName ? -1 : 1;
  });

  return { stripeStatement: stripeModeStatement(mode), rows: billing };
}

// ---------------------------------------------------------------------------
// Exact-match adult lookup
// ---------------------------------------------------------------------------

export type LookupOutcome =
  | { ok: true; record: AdultRecordDto | null }
  | { ok: false; message: string };

/**
 * Look one adult up by their exact email address, and audit the fact that it
 * happened with the search term and the operator's stated reason.
 *
 * Exact match on a unique column is the whole control (handbook ruling R11): an
 * address the operator did not already hold finds nothing, so there is no way
 * to walk the table and no way to confirm a guess cheaply. There is deliberately
 * no substring match, no browse and no list.
 *
 * The audit row is written before the result is returned and
 * recordOpsAudit() throws on failure, so a lookup that could not be recorded is
 * a lookup whose answer nobody sees.
 */
export async function lookupAdultByEmail(
  kind: LookupKind,
  emailRaw: string,
  reason: string,
): Promise<LookupOutcome> {
  const who = await requireOperator();

  // Addresses are stored lower-cased everywhere they are written
  // (src/app/actions/auth.ts and src/app/actions/family.ts both normalise on
  // the way in), so this normalises the same way rather than inventing a
  // case-insensitive match that SQLite would not use the unique index for.
  const email = emailRaw.trim().toLowerCase();
  // Nothing was searched, so there is nothing to record. The caller refuses an
  // empty box before it gets here; this is the chokepoint refusing it again
  // rather than asking the database for a row with no key.
  if (!email) return { ok: true, record: null };

  // Keyed on the operator rather than on a network address. There is one
  // operator account and it is already authenticated, so the risk this answers
  // is not a stranger at the door: it is a stolen session grinding through
  // addresses to learn which ones exist. The budget is generous and it trickles
  // rather than hard-blocking, matching the pattern already used for class-code
  // lookups, because an operator locked out mid-incident is its own harm.
  const budgetKey = `ops-lookup:${who.id}`;
  if (!allowCodeLookup(budgetKey)) return { ok: false, message: RATE_LIMITED_MESSAGE };

  const record = kind === "TEACHER" ? await readTeacher(email) : await readParent(email);

  await recordOpsAudit({
    actorId: who.id,
    actorName: who.email,
    action: "OPS_ADULT_LOOKUP",
    subjectType: kind,
    subjectId: record?.id ?? null,
    // Verbatim, exactly as typed, capped at 1000 characters by the caller.
    reason,
    // The search term, which ruling R11 requires the audit to carry. An adult's
    // own address, never a child's name and never a credential value.
    detail: `Exact-match email lookup for ${email}: ${record ? "one record" : "no record"}.`,
  });

  if (record) recordCodeHit(budgetKey);
  else recordCodeMiss(budgetKey);

  return { ok: true, record };
}

async function readTeacher(email: string): Promise<AdultRecordDto | null> {
  const row = await db.teacher.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      school: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    kind: "TEACHER",
    id: row.id,
    name: row.name,
    email: row.email,
    positionLabel: POSITION_LABEL[row.role] ?? row.role,
    status: row.status,
    createdAt: formatDay(row.createdAt) ?? "",
    schoolName: row.school?.name ?? null,
  };
}

// Three columns, and the two that are missing are the point. `familyCode` signs
// the operator in as that family, and the link to a child is refused in either
// direction including as a count, so neither can be selected here. A support
// question this cannot answer is a support question that gets answered by the
// teacher, who is the person who knows the family anyway.
async function readParent(email: string): Promise<AdultRecordDto | null> {
  const row = await db.parent.findUnique({
    where: { email },
    select: { id: true, email: true, createdAt: true },
  });
  if (!row || !row.email) return null;
  return {
    kind: "PARENT",
    id: row.id,
    maskedEmail: maskEmail(row.email),
    createdAt: formatDay(row.createdAt) ?? "",
    mailState: "NOT_MONITORED",
  };
}

// ---------------------------------------------------------------------------
// Service health (PR6)
// ---------------------------------------------------------------------------

/**
 * How long the database takes to answer, in milliseconds, measured from inside
 * the app.
 *
 * WHY IT COUNTS THE OPERATOR TABLE AND NOTHING ELSE
 *
 * It needs a read that touches the database file and reveals nothing. The
 * public healthcheck asks `SELECT 1`, which this file may not: raw SQL defeats
 * model-name scanning, so the blindness gate bans it outright under the ops
 * roots and is right to. A count of the operator's own rows is the closest
 * honest equivalent that is expressible here. It reads no school, no adult and
 * no child, and the number it returns is thrown away; only the elapsed time is
 * kept.
 *
 * WHAT IT CANNOT TELL YOU, said plainly because the pane says it too
 *
 * It can only ever succeed. requireOperator() above has already read the
 * session row, so a database that was not answering would have produced a 404
 * rather than a page with a tile on it. The signal is the DURATION, not the
 * success: this database is a file on the same volume as the children's media,
 * and a volume in trouble goes slow some time before it goes wrong.
 */
export async function databaseAnswerTime(): Promise<number> {
  await requireOperator();
  const started = performance.now();
  await db.operator.count();
  return performance.now() - started;
}
