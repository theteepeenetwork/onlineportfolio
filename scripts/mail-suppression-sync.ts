import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { MAIL_SUPPRESSION_SYNC_JOB, type MailSuppressionState } from "@/lib/mailStatus";
import { mailAddressHmac, MAIL_HMAC_KEY_VAR } from "@/lib/ops/mailHmac";

// ---------------------------------------------------------------------------
// mail-suppression-sync: ask Mailjet which addresses it is refusing, and record
// that fact without recording the addresses (PR5).
// ---------------------------------------------------------------------------
//
// WHY POLLING AND NOT A WEBHOOK
//
// Brief 03 puts the choice as "cron polling (recommended for the pilot) versus
// a signature-verified event webhook" and the pilot answer is the right one
// here, for a reason beyond convenience: a webhook is a new public POST
// endpoint, and brief 05 requires it to "verify the provider's signature
// mechanism and reject unsigned or unverifiable payloads". Whether Mailjet's
// event webhook offers one that can be verified is not established anywhere in
// this repository, and an unauthenticated ingest endpoint that writes rows is
// not a thing to add on an assumption. Polling adds no inbound surface at all:
// it is an outbound read with credentials StoryJar already holds.
//
// WHAT IT READS, and how that was established
//
// `/v3/REST/message`, the same endpoint scripts/mail-events.mjs already uses.
// That script is how the demo parent's hard bounce was identified on 16 August
// 2026, so this is a verified working call against this account rather than an
// endpoint written from memory. `ShowContactAlt=true` is what turns the numeric
// contact id into the address; without it the response carries a ContactID that
// cannot be hashed into anything comparable.
//
// WHAT IT WRITES, and what it deliberately does not
//
// The projection happens at the ingest boundary, in `project()` below: three
// fields are picked out of each message and the rest of the response is
// dropped, unread, before anything else touches it. It is written that way, and
// not as a `delete response.Subject`, because a field picker cannot be defeated
// by the provider adding a field.
//
// The address is turned into an HMAC-SHA256 under MAIL_HMAC_KEY immediately and
// the plaintext is never held beyond that expression, never logged, and never
// written. Neither is the subject line, which this call can return and which
// this script never asks for. Never the body: a sign-in email body carries a
// live token, so any path that could persist one is a token-disclosure bug
// rather than a storage decision.
//
// Every run writes a JobRun row, including a failed one, because Railway's cron
// does not alert on a non-zero exit and a job that stopped running produces no
// error at all. The absence of a recent SUCCESS is the signal, and the operator
// screen renders its age in words for exactly that reason.
//
// Usage:
//   npm run mail:suppression-sync          # the last 30 days
//   npm run mail:suppression-sync -- 7     # a shorter window
//
// Under production credentials, without ever seeing them:
//   railway run npm run mail:suppression-sync
// ---------------------------------------------------------------------------

const DEFAULT_DAYS = 30;
// A ceiling on one run rather than pagination. StoryJar sends one kind of email
// at pilot volume; this exists so a bad argument cannot turn into a long walk
// through somebody else's API.
const MESSAGE_LIMIT = 1000;

// Mailjet's `Status` vocabulary, mapped onto the four states StoryJar records.
// Anything not in this map is not a suppression and is ignored: "sent",
// "queued", "deferred" and the tracking states all mean the address is fine or
// the answer is not known yet. Matched case-insensitively on the exact word,
// never by substring, so a new status containing "bounce" as part of a longer
// word cannot silently become a bounce.
const STATE_BY_STATUS: Record<string, MailSuppressionState> = {
  bounce: "BOUNCE",
  hardbounced: "BOUNCE",
  softbounced: "BOUNCE",
  blocked: "BLOCKED",
  spam: "SPAM",
  unsub: "UNSUBSCRIBED",
  unsubscribed: "UNSUBSCRIBED",
};

type Projected = { addressHmac: string; state: MailSuppressionState; at: Date };

/**
 * The ingest boundary. Three fields in, one small object out, and everything
 * else in the provider's response is discarded here rather than downstream.
 */
function project(raw: unknown): Projected | null {
  if (typeof raw !== "object" || raw === null) return null;
  const message = raw as Record<string, unknown>;

  const status = typeof message.Status === "string" ? message.Status.toLowerCase() : "";
  const state = STATE_BY_STATUS[status];
  if (!state) return null;

  const address = typeof message.ContactAlt === "string" ? message.ContactAlt : "";
  if (!address.includes("@")) return null;

  // One-way, here, before the value can be assigned to anything with a longer
  // life than this expression.
  const addressHmac = mailAddressHmac(address);
  if (!addressHmac) return null;

  const arrived = message.ArrivedAt;
  const at =
    typeof arrived === "number"
      ? new Date(arrived * 1000)
      : typeof arrived === "string"
        ? new Date(arrived)
        : new Date();

  return { addressHmac, state, at: Number.isNaN(at.getTime()) ? new Date() : at };
}

async function main(): Promise<void> {
  const db = new PrismaClient();
  const startedAt = new Date();
  let outcome: "SUCCESS" | "FAILURE" = "FAILURE";
  let itemsAffected = 0;
  // Fixed vocabulary. Never a recipient, never a path, never a provider string.
  let outcomeDetail: string | null = null;

  try {
    const apiKey = process.env.MAILJET_API_KEY;
    const secretKey = process.env.MAILJET_SECRET_KEY;
    if (!apiKey || !secretKey) {
      outcomeDetail = "no Mailjet credentials in this environment";
      return;
    }
    if (!process.env[MAIL_HMAC_KEY_VAR]) {
      // Refused rather than hashed with a default. A default key is a key
      // everybody has, and rows written under one look protected and are not.
      outcomeDetail = `no ${MAIL_HMAC_KEY_VAR} in this environment`;
      return;
    }

    const days = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? DEFAULT_DAYS);
    const nowSec = Math.floor(Date.now() / 1000);
    const fromSec = nowSec - days * 24 * 60 * 60;
    const auth = `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString("base64")}`;

    const res = await fetch(
      `https://api.mailjet.com/v3/REST/message?Limit=${MESSAGE_LIMIT}` +
        `&FromTS=${fromSec}&ToTS=${nowSec}&ShowContactAlt=true`,
      { headers: { authorization: auth, accept: "application/json" } },
    );
    if (!res.ok) {
      // The status class, and nothing of the body. A provider error body is
      // exactly where an address or a subject line turns up.
      outcomeDetail = `Mailjet answered ${Math.floor(res.status / 100)}xx`;
      return;
    }

    const body = (await res.json()) as { Data?: unknown[] };
    const suppressed = (body.Data ?? []).map(project).filter((p): p is Projected => p !== null);

    for (const row of suppressed) {
      await db.mailSuppression.upsert({
        where: { addressHmac: row.addressHmac },
        create: {
          addressHmac: row.addressHmac,
          state: row.state,
          firstSeenAt: row.at,
          lastSeenAt: row.at,
        },
        // firstSeenAt is never moved: it is when StoryJar first knew, and a
        // later message from the same address does not change that.
        update: { state: row.state, lastSeenAt: row.at },
      });
    }

    itemsAffected = suppressed.length;
    outcome = "SUCCESS";
    outcomeDetail = `${days} day window`;
  } finally {
    await db.jobRun.create({
      data: {
        job: MAIL_SUPPRESSION_SYNC_JOB,
        startedAt,
        finishedAt: new Date(),
        outcome,
        itemsAffected,
        outcomeDetail,
      },
    });
    // Deliberately the only thing printed: a count and an outcome. No address,
    // no domain, no subject, and no provider payload (log hygiene, brief 05).
    console.log(
      `[mail-suppression-sync] ${outcome}: ${itemsAffected} suppressed address(es)` +
        `${outcomeDetail ? ` — ${outcomeDetail}` : ""}`,
    );
    await db.$disconnect();
    if (outcome !== "SUCCESS") process.exitCode = 1;
  }
}

main().catch((e) => {
  // The error itself is not printed. A fetch or Prisma error can carry the
  // request it failed on, and that request carries the recipient.
  console.error("[mail-suppression-sync] failed:", e instanceof Error ? e.name : "unknown error");
  process.exit(1);
});
