import type { PrismaClient } from "@prisma/client";
import { messageWaitingEmail } from "@/lib/emailTemplates";
import { mailAddressHmac } from "@/lib/mailHmac";

// ===========================================================================
// "There is a message waiting for you." The only unasked-for email StoryJar
// sends, and it is not unasked-for: SAFEGUARDING rule 6a permits exactly one
// kind — a notification the recipient switched on themselves — and this is the
// first thing in the product to use it.
//
// ---------------------------------------------------------------------------
// IT IS SENT AT DELIVERY, NOT AT SEND, AND THAT IS THE WHOLE DESIGN.
// ---------------------------------------------------------------------------
//
// Rule 21's hold means a message written at 21:40 reaches the family when the
// school next opens. An email raised when the teacher pressed send would arrive
// at 21:40 — the hold would leak through the mail, and a parent would be sitting
// at a phone at ten at night knowing something was waiting. So the trigger is
// `deliverAt` passing, not the message being written, and the spec for this
// asserts exactly that: a held message produces nothing until it is delivered.
//
// WITH NO CRON, THAT MEANS TWO PATHS, which is the same answer Part A gave the
// hold itself and the same answer `settleStatus` gives trial expiry:
//
//   • LAZILY, when a member of staff opens their messages. Cheap, bounded, and
//     it is the ordinary case — somebody at the school looks at StoryJar during
//     the morning the message lands.
//   • BY A STATE SWEEP, in `scripts/freeze-expired.mjs`, working from the data
//     rather than from an event — WHICH IS NOT BUILT, and is FINDINGS F73.
//
// THE SECOND PATH IS MISSING AND IT IS NAMED RATHER THAN ABSENT. That job runs
// under `tsx` outside Next, where importing `@/lib/mailer` throws on its own
// `server-only` line — and closing that would mean either moving the transport
// (and the Mailjet credentials) out from behind that guard, or duplicating the
// sender in a script. Neither is a decision to take at the end of an evening's
// work, so the sweep is left unbuilt and written down.
//
// WHAT THAT COSTS, exactly: a school where no member of staff opens StoryJar on
// the morning a held message lands notifies nobody until somebody does. It is a
// LATE notification and never a wrong one — the hold is enforced by
// `deliverAt`, not by who happens to look — and the badge in the family space,
// which is the whole model for every household without an address, is unaffected.
//
// The design below already assumes both paths and expects them to race:
// `Message.notifiedAt` makes that safe, and it is stamped even when nothing is
// sent. Adding the job is wiring one call, not reworking this file.
//
// ---------------------------------------------------------------------------
// THE EMAIL CARRIES NOTHING.
// ---------------------------------------------------------------------------
//
// Not the message, not the teacher, not the child, not the school, not even how
// many are waiting. An email is a copy on a different retention clock travelling
// a path StoryJar does not control — the same argument that keeps message text
// out of `AuditLog.detail`, applied to a channel with weaker properties than the
// log. `messageWaitingEmail` holds the words and the reasoning.
//
// ---------------------------------------------------------------------------
// WHAT THIS DOES NOT FIX, said plainly because it costs more now than it did.
// ---------------------------------------------------------------------------
//
// FINDINGS F30: mail failures are visible at /ops/mail and nothing announces
// them. F31: the suppression sync has no schedule, so `MailSuppression` is a
// snapshot of whenever somebody last ran it. Neither is fixed here, and this
// feature makes both cost more, because until now every email StoryJar sent was
// one a person had just asked for and was waiting for — a failure was noticed by
// the person who did not get their link. Nobody is waiting for this one. A bounce
// on it is noticed by a person reading a screen, not by a system.
// ===========================================================================

// NO `server-only`, AND THE CLIENT IS PASSED IN, for the reason `schoolPlanEnd.ts`
// gives: the nightly sweep runs under `tsx` outside Next, where importing
// `server-only` throws and `@/lib/db` drags a request-scoped singleton in with
// it. The same function then serves the lazy path and the job, which is what
// stops the two drifting into two different answers.
export type NotifyClient = Pick<PrismaClient, "message" | "mailSuppression">;

/**
 * How this module sends. Injected rather than imported, for the same reason the
 * client is: `@/lib/mailer` is `server-only`, and a module that reaches for it
 * at import time cannot be loaded by a job or read by a test outside Next.
 *
 * It also makes the thing worth asserting assertable. What matters here is WHICH
 * ADDRESSES ARE WRITTEN TO, and with a real mailer that is invisible — the test
 * environment has no credentials, so every send returns "not configured" and a
 * spec could only prove that nothing happened. With the sender passed in, a
 * spec can name exactly who was picked and who was skipped.
 */
export type NotifySender = (args: {
  to: string;
  subject: string;
  text: string;
  html: string;
  templateKey: "message-waiting";
}) => Promise<{ ok: boolean }>;

/** How many delivered-but-unconsidered messages one pass will look at. */
export const NOTIFY_BATCH = 100;

export type NotifyOutcome = {
  /** Messages whose notification question was settled by this pass. */
  considered: number;
  /** Emails actually handed to the mailer. */
  sent: number;
};

/**
 * Raise notifications for every message that has become deliverable and has not
 * been considered yet.
 *
 * Never throws: a mail problem must not take down the page or the job that
 * happened to trigger it, which is `sendMail`'s own contract extended one level
 * out.
 */
export async function notifyDeliveredMessages(
  db: NotifyClient,
  send: NotifySender,
  now: Date = new Date(),
): Promise<NotifyOutcome> {
  const due = await db.message.findMany({
    where: {
      // ONLY MESSAGES FROM THE SCHOOL. A parent does not need an email about
      // the message they themselves just wrote, and this is scoped in the query
      // rather than filtered afterwards so it cannot be lost in a later edit.
      senderType: "TEACHER",
      // DELIVERED, not merely written. This clause is the hold, and it is the
      // one line in this file most worth not changing.
      deliverAt: { lte: now },
      notifiedAt: null,
    },
    orderBy: { deliverAt: "asc" },
    take: NOTIFY_BATCH,
    select: {
      id: true,
      thread: {
        select: {
          student: {
            select: {
              // The households linked to this child, and their switch. Reached
              // through the parent↔child link and nothing else (rule 4).
              parents: { select: { id: true, email: true, notifyByEmail: true } },
            },
          },
        },
      },
    },
  });
  if (due.length === 0) return { considered: 0, sent: 0 };

  // ONE EMAIL PER HOUSEHOLD PER PASS, not one per message. A teacher who writes
  // to a family three times before the school opens has written three messages
  // and given a family one thing to come and read.
  const wanted = new Map<string, string>(); // parentId -> address
  for (const m of due) {
    for (const p of m.thread.student.parents) {
      if (!p.notifyByEmail) continue; // rule 6a: only what they switched on
      if (!p.email) continue; // many households never give one
      wanted.set(p.id, p.email);
    }
  }

  let sent = 0;
  const familyUrl = `${siteOrigin()}/family`;
  for (const address of new Set(wanted.values())) {
    // SUPPRESSION IS CHECKED BEFORE THE SEND, not after a bounce. An address
    // that has bounced, been blocked, marked StoryJar as spam or unsubscribed
    // is not written to — and this notification is the one message where that
    // is unambiguous, because nobody is waiting for it. (The four transactional
    // templates do NOT consult this table today; that is pre-existing and out
    // of this change's scope, and F31 already records that the table itself is
    // only as fresh as the last time somebody ran the sync.)
    if (await addressIsSuppressed(db, address)) continue;
    const { subject, text, html } = messageWaitingEmail(familyUrl);
    const result = await send({ to: address, subject, text, html, templateKey: "message-waiting" });
    if (result.ok) sent += 1;
  }

  // STAMPED WHATEVER HAPPENED, including for a parent with the switch off, no
  // address, or a suppressed one. The question this column answers is "has this
  // message been considered?" — re-considering it every night forever is how a
  // switch turned on in March produces a flood of email about February. A send
  // that failed is not retried either: a retry loop on a channel nothing is
  // waiting for is a way to keep a broken address busy, and F30 means nobody
  // would see it happening.
  await db.message.updateMany({ where: { id: { in: due.map((m) => m.id) } }, data: { notifiedAt: now } });

  return { considered: due.length, sent };
}

async function addressIsSuppressed(db: NotifyClient, address: string): Promise<boolean> {
  const hash = mailAddressHmac(address);
  // NO KEY, NO CHECK — and that is a real gap rather than a safe default, so it
  // is written here rather than hidden behind a boolean. Without MAIL_HMAC_KEY
  // nothing can be looked up, because the table stores labels and not addresses.
  // The environment that has no key also has no suppression rows to consult.
  if (!hash) return false;
  const row = await db.mailSuppression.findUnique({ where: { addressHmac: hash }, select: { id: true } });
  return row !== null;
}

/**
 * Where the family space lives, for the one link in the email.
 *
 * `APP_URL` and not `originUrl()`, which every other email link uses. That
 * helper reads `headers()` and so exists only inside a request — and half the
 * notifications here are raised by a nightly job with no request at all. Rather
 * than have the sweep's links differ from the lazy path's, both take the
 * configured origin, which is what production sets and what the other helper
 * would have returned anyway. In an environment with no `APP_URL` the link is
 * the public site, which is where a parent should end up regardless.
 */
function siteOrigin(): string {
  const raw = process.env.APP_URL ?? "";
  return raw.trim().replace(/\/+$/, "") || "https://storyjar.co.uk";
}
