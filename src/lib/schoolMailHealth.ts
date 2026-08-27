import { db } from "@/lib/db";
import {
  mailVerdict,
  utcDayBefore,
  type MailVerdict,
} from "@/lib/mailStatus";

// ---------------------------------------------------------------------------
// "Is email working?" — the school-admin answer (Batch B, item 2).
// ---------------------------------------------------------------------------
//
// The person this is for is a school business manager. She is the one parents
// ring when a sign-in link does not arrive, and until now she had nowhere to
// look: the only mail screen in the product is /ops/mail, which is the
// operator's and which she cannot reach.
//
// WHY THIS IS NOT readMailStatus, AND WHY IT IS NOT UNDER src/lib/ops/
//
// Two reasons, and the second one is structural.
//
// 1. They are different questions. An operator asks "is mail broken across the
//    platform, and which failure class is it" and gets windows, per-template
//    breakdowns, failure-reason tallies and the suppression list. A business
//    manager asks "is it working, and do I need to do anything", and every
//    extra number she has to interpret makes that answer worse. So this is a
//    deliberately smaller DTO with the words already chosen, not a filtered
//    view of the operator's one.
//
// 2. readMailStatus lives under @/lib/ops/ and calls requireOperator(). Any
//    file under src/ that imports an ops module is scanned as ops code by
//    scripts/check-ops-blindness.mjs — that is the "reachesOps" pass, and it
//    exists so nobody escapes the gate by putting an operator action somewhere
//    else. Importing it into the admin page would drag the whole school-admin
//    tree into the operator scan, where it would immediately and correctly
//    fail for reading schools, staff and classes. The right answer is not to
//    widen the allowlist. It is that these are two consumers of the same rows.
//
// So this module imports @/lib/db and @/lib/mailStatus only. mailStatus.ts is
// deliberately NOT an ops module (its own header says why), so the verdict rule
// is shared rather than copied, and nothing here enters the ops scan.
//
// WHY IT IS PLATFORM-WIDE AND CANNOT BE PER-SCHOOL
//
// MailCounter is keyed [day, templateKey, outcome, statusClass] and holds a
// count. There is no school column, no recipient and no domain, and that is a
// safeguarding decision rather than an omission: FINDINGS F6 requires
// requestMagicLink to answer identically for an address on file and one that is
// not, so a per-send record inside the product would rebuild the enumeration
// signal the public form is careful not to give.
//
// The consequence has to be said out loud on the screen, so `scopeNote` below
// is a field rather than a comment: this tells a business manager whether
// StoryJar's email is working, NOT whether it is working for her school. A
// badge that let her infer the second would be lying, and the lie would surface
// at the worst moment — a parent on the phone saying nothing arrived.
//
// WHAT IT DOES NOT NEED
//
// No Railway variables. MAIL_HMAC_KEY and MAIL_SUPPRESSION_SYNC gate the
// suppression half of mail health (which addresses Mailjet is refusing), and
// neither is set yet. MailCounter is written by recordMailAttempt inside the
// mailer on every attempt regardless, so this badge works the day it ships.
// Suppression is deliberately left out for exactly that reason: a badge that
// stays dark until three environment variables land is a badge nobody trusts.
//
// WHY IT DOES NOT CATCH ITS OWN ERRORS
//
// If the counter read fails, this throws and the page owner decides. The
// tempting alternative — catch, and return the empty state — would render a
// broken read as "no emails were sent", which is the exact shape of F30: a
// problem that looks like everything being fine. Silence and health must never
// share a rendering.
//
// No `server-only` here, for the same reason src/lib/mailCounters.ts has none:
// a blocking spec has to be able to import it and assert on what it returns,
// and `server-only` throws the moment Playwright does. It imports the Prisma
// client, which would fail loudly in a browser bundle anyway.

/** How far back the badge looks. UTC days, matching /ops/mail's second window
 *  so that the two screens cannot disagree about the same rows. */
/** The one template this badge is about: a parent's own sign-in link. Named
 *  rather than inlined, so the filter and the copy point at the same thing. */
const PARENT_SIGN_IN_TEMPLATE = "magic-link";

const WINDOW_DAYS_BACK = 6;
const WINDOW_LABEL = "the last 7 days";

export type SchoolMailHealthState =
  | "NO_DATA"
  | "ALL_ACCEPTED"
  | "SOME_FAILED"
  | "NEEDS_ATTENTION";

export type SchoolMailHealth = {
  /** For choosing an icon or a weight. Never for choosing a colour alone —
   *  handbook section 6 item 8, status is not conveyed by colour by itself. */
  state: SchoolMailHealthState;
  /** The badge itself. Short enough to read at a glance. */
  headline: string;
  /** One or two sentences under it, including what to do about it. */
  detail: string;
  /** Small print, present only when the badge is claiming success. "Accepted"
   *  is not "delivered", and a manager acting on this may have a parent on the
   *  phone saying the opposite. */
  acceptedNote: string | null;
  /** Render this. It is the sentence that stops the badge overclaiming. */
  scopeNote: string;
  windowLabel: string;
  attempted: number;
  failed: number;
};

const SCOPE_NOTE =
  "These figures cover StoryJar's email for every school together. They cannot be " +
  "split by school, because splitting them would mean recording who each message " +
  "went to, and StoryJar deliberately does not. So this tells you whether email is " +
  "working, not whether it is working for your school in particular.";

const ACCEPTED_NOTE =
  "Accepted means the email provider took the message. It is not a delivery " +
  "receipt: StoryJar switches off open and click tracking on purpose, because " +
  "anything that follows a sign-in link uses it up before the parent can, so it " +
  "cannot tell you whether a message arrived or was read.";

/**
 * The state of StoryJar's outgoing email over the last seven UTC days.
 *
 * Callers: read it in a server component and pass the object down as a prop.
 * It holds no identifier of any kind — no address, no domain, no school, no
 * child — so it is safe to send to a browser, which is not an accident but the
 * shape of the table underneath it.
 */
export async function readSchoolMailHealth(now: Date = new Date()): Promise<SchoolMailHealth> {
  const earliest = utcDayBefore(now, WINDOW_DAYS_BACK);

  // Columns named one at a time. A Prisma read with no `select:` returns every
  // scalar column, so the next person to add one to this table should have to
  // come here to decide whether a school admin may see it.
  const rows = await db.mailCounter.findMany({
    where: { day: { gte: earliest } },
    select: { templateKey: true, outcome: true, count: true },
  });

  // ONE TEMPLATE, and not MAIL_TEMPLATE_KEYS, which is what this used to be.
  //
  // This badge answers one question for one person: the business manager whom
  // parents ring when a PARENT'S sign-in link does not arrive. Its copy says so
  // in those words — "No sign-in emails have been sent", "N sign-in emails did
  // not leave StoryJar", "no parent has asked for a sign-in link".
  //
  // While "magic-link" was the only key, filtering by the whole list and
  // filtering by that one key were the same filter. F61 added "password-reset"
  // and "staff-invite", and they stop being the same: a school with no parent
  // requests and three staff invitations would have read "All 3 sign-in emails
  // StoryJar tried to send were accepted", which is a false sentence on a
  // school-facing screen.
  //
  // Widening the copy to "emails" would have kept it true and made it useless —
  // a failure count she reads as "parents are not getting their links" could be
  // entirely staff invites, or the reverse, and the figure would stop answering
  // the question she opened it to answer. So the words stay and the filter
  // narrows to the template they name. A staff invitation that does not arrive
  // is a different question with a different answer (a colleague resends it),
  // and the operator's own mail screen counts every template.
  const mine = rows.filter((row) => row.templateKey === PARENT_SIGN_IN_TEMPLATE);

  const total = (outcome: string) =>
    mine.filter((row) => row.outcome === outcome).reduce((sum, row) => sum + row.count, 0);

  return summariseMailHealth({
    accepted: total("SENT"),
    failedOutright: total("FAILED"),
    unconfigured: total("UNCONFIGURED"),
  });
}

/**
 * The tallies turned into the badge, with no database and no clock.
 *
 * Split out from the read so that the part carrying the judgement — which
 * state, and which words — is testable without a server, a session or a seeded
 * row. The database half is a windowed count and fails visibly; this half is
 * where a wrong answer would be quiet, so this is the half worth pinning.
 */
export function summariseMailHealth(totals: {
  accepted: number;
  /** Attempts the provider rejected. NOT the same as the `failed` this returns,
   *  which also counts the unconfigured ones — hence the longer name here. */
  failedOutright: number;
  unconfigured: number;
}): SchoolMailHealth {
  const { accepted, failedOutright, unconfigured } = totals;

  const attempted = accepted + failedOutright + unconfigured;
  // An unconfigured attempt counts against the verdict, exactly as it does on
  // the operator screen: nothing left StoryJar, which is what the verdict is
  // about. It is a worse problem than a bounce, not a lesser one — a missing
  // API key produces no attempt at the provider, so it generates no failure
  // there and no bounce, and this counter is the only place it is visible.
  const failed = failedOutright + unconfigured;

  const verdict = mailVerdict(attempted, failed);

  return {
    state: STATE_BY_VERDICT[verdict],
    headline: headlineFor(verdict),
    detail: detailFor(verdict, attempted, failed, unconfigured),
    acceptedNote: verdict === "ALL_ACCEPTED" ? ACCEPTED_NOTE : null,
    scopeNote: SCOPE_NOTE,
    windowLabel: WINDOW_LABEL,
    attempted,
    failed,
  };
}

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------
// Written for a school business manager and not for an engineer: no status
// codes, no "SMTP", no provider name in the headline. Every unhappy state ends
// with the thing she can actually do, because a status she cannot act on is a
// status that gets ignored the second time she sees it.

const STATE_BY_VERDICT: Record<MailVerdict, SchoolMailHealthState> = {
  NONE_ATTEMPTED: "NO_DATA",
  ALL_ACCEPTED: "ALL_ACCEPTED",
  SOME_FAILED: "SOME_FAILED",
  NEEDS_ATTENTION: "NEEDS_ATTENTION",
};

function headlineFor(verdict: MailVerdict): string {
  switch (verdict) {
    // NOT "everything is fine". Nothing has been tried, so nothing is known,
    // and the two must not look the same (FINDINGS F30).
    case "NONE_ATTEMPTED":
      return `No sign-in emails have been sent in ${WINDOW_LABEL}`;
    case "ALL_ACCEPTED":
      return "Email is working";
    case "SOME_FAILED":
      return "Email is working, with some failures";
    case "NEEDS_ATTENTION":
      return "Email needs attention";
  }
}

function detailFor(
  verdict: MailVerdict,
  attempted: number,
  failed: number,
  unconfigured: number,
): string {
  const emails = (n: number) => `${n} sign-in ${n === 1 ? "email" : "emails"}`;

  if (verdict === "NONE_ATTEMPTED") {
    return (
      "Nothing has gone wrong that StoryJar can see: no parent has asked for a sign-in" +
      " link in this period. That is normal in a holiday. If parents have been asking for" +
      " links this week and this still says none, tell StoryJar, because that is a" +
      " problem this page cannot see."
    );
  }

  if (verdict === "ALL_ACCEPTED") {
    return `All ${emails(attempted)} StoryJar tried to send were accepted by the email provider.`;
  }

  // The two failing states share a first sentence and differ in what to do
  // about it. The ratio is named in words rather than as a percentage: "more
  // than one in five" is a thing a person can picture.
  const count =
    `${failed} of ${emails(attempted)} did not leave StoryJar in ${WINDOW_LABEL}` +
    (verdict === "NEEDS_ATTENTION" ? ", which is more than one in five." : ".");

  // Every failure was StoryJar failing to reach its own provider. Telling a
  // business manager to chase parents' addresses here would waste her morning
  // on a fault that is entirely ours.
  if (unconfigured === failed) {
    return (
      `${count} Every one of them was StoryJar failing to reach its email provider at` +
      " all, so there is nothing a parent can check at their end and nothing you can fix" +
      " from here. Please tell StoryJar."
    );
  }

  const mixedNote =
    unconfigured > 0
      ? ` ${unconfigured} of them never reached the email provider at all, which is ours to` +
        " fix rather than the parent's."
      : "";

  if (verdict === "NEEDS_ATTENTION") {
    return (
      `${count} If parents are telling you their sign-in link never arrived, this is why.` +
      ` Please tell StoryJar.${mixedNote}`
    );
  }

  return (
    `${count} A parent whose link never arrived should ask their teacher to send it` +
    ` again.${mixedNote}`
  );
}
