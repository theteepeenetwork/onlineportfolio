import "server-only";
import { db } from "@/lib/db";
import { bandForPupils, formatPrice } from "@/lib/billing-plans";
import { allowCodeLookup, recordCodeHit, recordCodeMiss, RATE_LIMITED_MESSAGE } from "@/lib/rateLimit";
import { recordOpsAudit } from "@/lib/ops/audit";
import { requireOperator } from "@/lib/ops/session";
import { currentStripeMode, stripeModeStatement, stripeRef } from "@/lib/ops/stripeLinks";
import {
  formatAgo,
  formatDay,
  formatDayAndTime,
  headcount,
  maskEmail,
  type AdultRecordDto,
  type BandDto,
  type BillingViewDto,
  type JobRunDto,
  type LookupKind,
  type MailStateDto,
  type MailStatusDto,
  type MailSuppressionSummaryDto,
  type MailTemplateTotalsDto,
  type MailWindowDto,
  type SchoolRowDto,
} from "@/lib/ops/dto";
import {
  MAIL_STATUS_CLASS_LABEL,
  MAIL_SUPPRESSION_STATES,
  MAIL_SUPPRESSION_STATE_LABEL,
  MAIL_SUPPRESSION_SYNC_JOB,
  MAIL_TEMPLATE_KEYS,
  MAIL_TEMPLATE_LABEL,
  MAIL_VERDICT_LABEL,
  isMailSuppressionState,
  mailVerdict,
  utcDayBefore,
  type MailStatusClass,
} from "@/lib/mailStatus";
import { mailAddressHmac, mailHmacConfigured } from "@/lib/mailHmac";

// ---------------------------------------------------------------------------
// The operator read chokepoint (PR2).
// ---------------------------------------------------------------------------
//
// One of the three modules permitted to import the Prisma client under the ops
// roots. Every figure and every field an operator can ever see passes through a
// named function in this file, so the answer to "what can StoryJar staff see?"
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
    mailState: await mailStateFor(row.email),
  };
}

/**
 * Is Mailjet refusing this one address (PR5)?
 *
 * This is the support call owner amendment C4 describes: a school reports that
 * a parent is receiving nothing, and until now the honest answer was "StoryJar
 * has no idea". It is asked one address at a time, about an address the
 * operator has already typed in full to find the record, and it is answered
 * from a keyed hash computed HERE on the server. Brief 05 imposes both halves
 * of that and they are worth stating: never a free-text "is this address
 * blocked?" box, which would be an enumeration oracle undoing FINDINGS F6, and
 * never a hash accepted from the client, which would let a caller ask about an
 * address they could not otherwise reach.
 *
 * With no MAIL_HMAC_KEY there is no answer rather than a reassuring one. A
 * screen that says "no problem" because the feature is switched off is worse
 * than one that says it does not know.
 */
async function mailStateFor(address: string): Promise<MailStateDto> {
  const label = mailAddressHmac(address);
  if (!label) return "NOT_MONITORED";
  const suppression = await db.mailSuppression.findUnique({
    where: { addressHmac: label },
    select: { state: true },
  });
  if (!suppression) return "NOT_SUPPRESSED";
  // A state the vocabulary does not know is not rendered as calm. It should be
  // impossible: the sync job maps the provider's words onto the closed list
  // before writing. If it ever happens, the honest answer is that StoryJar
  // cannot say.
  return isMailSuppressionState(suppression.state) ? suppression.state : "NOT_MONITORED";
}

// ---------------------------------------------------------------------------
// Mail delivery status (PR5, handbook ruling R9)
// ---------------------------------------------------------------------------
//
// Counters, a count of refused addresses, and when the provider was last
// checked. No recipient, no domain, no subject, no body, and no per-school
// split, because a per-school split needs the recipient.
//
// R9 fixes this as the default and owner decision D7, which would permit
// per-recipient failure detail, is unanswered. The published default is
// counters only, so this reads counters only. If D7 is ever answered yes, the
// change starts with the DPIA and RETENTION.md, not with a query.

// Today, and the week ending today. Two windows rather than one because they
// answer different questions: "is mail going out this morning" and "has
// anything been quietly failing". Seven days rather than a rolling 24 hours
// because a MailCounter row is a UTC day and pretending otherwise would be
// arithmetic on a bucket that does not exist.
const MAIL_WINDOW_DAYS = [
  { back: 0, label: "Today" },
  { back: 6, label: "The last 7 days" },
] as const;

type CounterRow = {
  day: string;
  templateKey: string;
  outcome: string;
  statusClass: string;
  count: number;
};

function windowFrom(label: string, from: string, to: string, rows: CounterRow[]): MailWindowDto {
  const inWindow = rows.filter((row) => row.day >= from && row.day <= to);

  // Every known template gets a row, including one that sent nothing. A
  // template missing from the screen reads as "we do not send that any more";
  // a template showing zero reads as "nothing went out", which is the signal
  // brief 05 calls the silence alert and the one a counter can actually give.
  const byTemplate: MailTemplateTotalsDto[] = MAIL_TEMPLATE_KEYS.map((key) => {
    const mine = inWindow.filter((row) => row.templateKey === key);
    const total = (outcome: string) =>
      mine.filter((row) => row.outcome === outcome).reduce((sum, row) => sum + row.count, 0);
    const accepted = total("SENT");
    const failed = total("FAILED");
    const unconfigured = total("UNCONFIGURED");

    const byClass = new Map<string, number>();
    for (const row of mine) {
      if (row.outcome === "SENT") continue;
      byClass.set(row.statusClass, (byClass.get(row.statusClass) ?? 0) + row.count);
    }

    return {
      templateKey: key,
      label: MAIL_TEMPLATE_LABEL[key],
      attempted: accepted + failed + unconfigured,
      accepted,
      failed,
      unconfigured,
      failureReasons: [...byClass.entries()]
        .map(([statusClass, count]) => ({
          label:
            MAIL_STATUS_CLASS_LABEL[statusClass as MailStatusClass] ??
            "An outcome this version does not recognise",
          count,
        }))
        // Biggest first, ties broken on the label so two runs cannot disagree.
        .sort((a, b) => (b.count - a.count) || (a.label < b.label ? -1 : 1)),
    };
  });

  const sum = (pick: (t: MailTemplateTotalsDto) => number) =>
    byTemplate.reduce((total, t) => total + pick(t), 0);
  const attempted = sum((t) => t.attempted);
  const failed = sum((t) => t.failed) + sum((t) => t.unconfigured);

  return {
    label,
    rangeLabel: from === to ? `${from} (UTC)` : `${from} to ${to} (UTC)`,
    attempted,
    accepted: sum((t) => t.accepted),
    failed: sum((t) => t.failed),
    unconfigured: sum((t) => t.unconfigured),
    // An unconfigured attempt counts against the verdict: nothing left
    // StoryJar, which is the thing the verdict is about.
    verdictLabel: MAIL_VERDICT_LABEL[mailVerdict(attempted, failed)],
    byTemplate,
  };
}

async function readSuppression(lastCheck: JobRunDto | null): Promise<MailSuppressionSummaryDto> {
  const configured = mailHmacConfigured();

  // Counted one state at a time rather than grouped. A groupBy would be one
  // query instead of four, and the gate refuses it: `state` is not on
  // SAFE_GROUP_KEYS, and widening that list to add it would widen every model,
  // not this one. Four counts over four literal values from a closed vocabulary
  // is the same answer with nothing new permitted.
  const counts = await Promise.all(
    MAIL_SUPPRESSION_STATES.map(async (state) => ({
      state,
      label: MAIL_SUPPRESSION_STATE_LABEL[state],
      count: await db.mailSuppression.count({ where: { state } }),
    })),
  );

  const total = counts.reduce((sum, row) => sum + row.count, 0);
  const monitored = configured && lastCheck !== null;

  let statement: string;
  if (!configured) {
    statement =
      "Not monitored. No MAIL_HMAC_KEY is set in this environment, so StoryJar records nothing about which addresses Mailjet is refusing, and the figures below are not evidence of anything.";
  } else if (lastCheck === null) {
    statement =
      "Not monitored yet. The key is set but the check against Mailjet has never run, so an empty list here means nobody has looked, not that nobody is blocked.";
  } else if (total === 0) {
    statement = "Mailjet is not refusing any address that StoryJar has checked.";
  } else {
    statement =
      "Addresses Mailjet is refusing. These are counts. There is no list, and there cannot be: StoryJar stores a one-way keyed label for each address and never the address, so the only way to ask about a particular parent is from their own record under Find an adult.";
  }

  return { monitored, total, states: counts, statement };
}

/**
 * Everything the mail screen renders. School-blind and person-blind by
 * construction, because there is nothing else in the tables to be otherwise
 * with.
 */
export async function readMailStatus(): Promise<MailStatusDto> {
  await requireOperator();

  const now = new Date();
  const earliest = utcDayBefore(now, Math.max(...MAIL_WINDOW_DAYS.map((w) => w.back)));
  const today = utcDayBefore(now, 0);

  // The four key columns and the tally. Named one at a time like every other
  // read in this file: a Prisma read with no `select:` returns every scalar
  // column, and the next person to add a column to this table should have to
  // come here to surface it.
  const rows = await db.mailCounter.findMany({
    where: { day: { gte: earliest } },
    select: { day: true, templateKey: true, outcome: true, statusClass: true, count: true },
  });

  const run = await db.jobRun.findFirst({
    where: { job: MAIL_SUPPRESSION_SYNC_JOB },
    orderBy: [{ startedAt: "desc" }],
    select: {
      job: true,
      startedAt: true,
      outcome: true,
      itemsAffected: true,
      outcomeDetail: true,
    },
  });

  const lastCheck: JobRunDto | null = run
    ? {
        job: run.job,
        label: "Check against Mailjet's refused addresses",
        startedAt: formatDayAndTime(run.startedAt) ?? "",
        outcomeLabel:
          run.outcome === "SUCCESS" ? "Finished successfully" : "Did not finish successfully",
        itemsAffected: run.itemsAffected,
        note: run.outcomeDetail,
        ageLabel: formatAgo(run.startedAt, now),
      }
    : null;

  return {
    windows: MAIL_WINDOW_DAYS.map((w) =>
      windowFrom(w.label, utcDayBefore(now, w.back), today, rows),
    ),
    suppression: await readSuppression(lastCheck),
    lastCheck,
    acceptedStatement:
      "Accepted means Mailjet took the message. It is not a delivery receipt: open and click tracking are switched off at account level and again on every message, deliberately, because a rewritten link is followed by whatever scans it, and a parent's sign-in link works exactly once. StoryJar therefore cannot tell whether a message arrived or was read, and never will while that stays true.",
    scopeStatement:
      "These figures cover every school together. They cannot be split by school, because splitting them would mean storing who each message went to, and no counter here holds a recipient or even a domain. To ask about one family, look their adult up under Find an adult.",
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
