import { db } from "@/lib/db";
import {
  classifyMailResult,
  utcDay,
  type MailAttemptResult,
  type MailTemplateKey,
} from "@/lib/mailStatus";

// ---------------------------------------------------------------------------
// Recording that a send was attempted (PR5).
// ---------------------------------------------------------------------------
//
// One function, called from inside src/lib/mailer.ts, which increments a
// per-day, per-template, per-outcome tally. That is the whole of Storyjar's
// mail observability, and the shape is handbook ruling R9's: "counters and
// HMAC-keyed suppression, and explicitly NO recipient address or domain
// stored".
//
// WHY IT CANNOT BE A ROW PER SEND
//
// FINDINGS F6: requestMagicLink answers identically for an address on file and
// an address that is not, on purpose, so the public sign-in form cannot be used
// to find out who has an account. A per-send failure list inside the operator
// area answers that question with a timestamp attached. The enumeration signal
// would be rebuilt internally, which is the trap brief 04 flagged and the
// reason the default storage model is a tally.
//
// WHY THE CALLER CANNOT TELL THIS RAN
//
// This is called from sendMail, and sendMail is called from requestMagicLink,
// which discards its result. Three properties keep that discard honest:
//
//   - it never throws. Every failure, including the database being unavailable,
//     is swallowed here, because a counter that cannot be written must never
//     turn into a parent who cannot sign in.
//   - it returns nothing, and sendMail's return value does not depend on it.
//   - it adds no branch a caller can observe.
//
// THE RESIDUAL RISK, stated rather than quietly accepted
//
// A database write inside sendMail widens the timing difference between a known
// address (a provider call plus this write) and an unknown one (no call at
// all). That side channel already exists today and is dominated by the provider
// call, which is orders of magnitude slower than one indexed upsert against a
// local SQLite file, so this does not make it materially worse. It does not
// make it better either. The honest description is in
// src/app/actions/family.ts beside the F6 note, and this is the same risk in a
// second place rather than a new one.
//
// WHY THERE IS NO `server-only` HERE
//
// The same reason as src/lib/ops/dto.ts, src/lib/ops/enabled.ts and
// src/lib/emailTemplates.ts: a blocking spec has to be able to call this and
// assert what lands in the row, and a module carrying `server-only` throws the
// moment a Playwright test imports it. It imports the Prisma client, which is
// server-side by nature and would fail loudly in a browser bundle, so the
// directive buys a clearer error rather than a real boundary.

/**
 * Note one send attempt. Never throws, returns nothing, and stores no address,
 * no domain, no subject and no body.
 */
export async function recordMailAttempt(
  templateKey: MailTemplateKey,
  result: MailAttemptResult,
  at: Date = new Date(),
): Promise<void> {
  try {
    const { outcome, statusClass } = classifyMailResult(result);
    const day = utcDay(at);
    // Upsert on the composite primary key. The four key columns are all closed
    // vocabularies from src/lib/mailStatus.ts, and statusClass is an empty string
    // rather than NULL because SQLite treats NULLs as distinct in a unique
    // constraint, so a nullable key column would insert a second row every time
    // instead of incrementing the first.
    await db.mailCounter.upsert({
      where: {
        day_templateKey_outcome_statusClass: { day, templateKey, outcome, statusClass },
      },
      create: { day, templateKey, outcome, statusClass, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch {
    // Deliberately silent, and deliberately not even a log line. A failure here
    // says nothing about the message and nothing a log reader could act on, and
    // the one thing a log line could carry that matters is exactly the thing
    // this module exists not to hold.
  }
}
