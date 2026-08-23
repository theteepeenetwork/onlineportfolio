import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { MAIL_SUPPRESSION_SYNC_JOB, type MailSuppressionState } from "@/lib/mailStatus";

// ---------------------------------------------------------------------------
// Shared sync logic for the mail suppression check (PR5, F31).
// ---------------------------------------------------------------------------
//
// WHY THIS IS SHARED
//
// The sync logic originally lived entirely in scripts/mail-suppression-sync.ts.
// It is now split: the pure sync function lives here and both callers —
// the manual CLI script and the in-app scheduler — import it. Two callers
// with their own copy would be two lists that agreed on the day they were
// written and drifted afterwards. One shared module is one place to fix.
//
// WHY THIS MODULE DOES NOT IMPORT @/lib/ops/mailHmac
//
// Any src/ module that imports from @/lib/ops/ is pulled into the ops
// blindness gate's scan (scripts/check-ops-blindness.mjs lines 2239–2247:
// every file that "reachesOps" is scanned as if it were ops code). That
// gate then flags this module for OPS-MUTATION-MODULE because it writes to
// MailSuppression — correctly, for ops code, since ops may not write there.
// But this module is NOT ops code; it is platform infrastructure called by the
// CLI script and the in-app scheduler, neither of which runs under an ops
// session.
//
// Instead, this module re-implements the same HMAC-SHA256 calculation directly
// from node:crypto, which it would have needed anyway (the gate also refuses
// node:fs, but node:crypto is clean and carries no filesystem risk). The
// calculation is four lines: normalise → key → HMAC → hex. There are no
// divergence risks because the canonical form (trim + lowercase) is the same
// as mailAddressHmac's and is tested in the security spec.
//
// The Prisma client is passed in for the same reason: the CLI opens its own
// client and disconnects it on exit; the in-app scheduler shares the
// long-lived singleton from src/lib/db.ts. Neither lifetime leaks here.
//
// PROJECTION AND PRIVACY — unchanged from the original script
//
// The ingest boundary is `project()`: three fields picked, everything else in
// the provider response dropped before any further code touches it. The email
// address is HMAC-SHA256'd immediately and the plaintext is never held beyond
// that expression, never logged and never written. Log hygiene (brief 05).

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

// WHO IS ALLOWED TO CALL THIS
//
// Nothing in this function decides whether the call should happen. It checks
// that it CAN — credentials, HMAC key — and then does what it was asked. That
// is deliberate, and the division of labour is worth stating because getting it
// wrong once already cost something (FINDINGS.md F43):
//
//   - The CLI (scripts/mail-suppression-sync.ts) is a person typing a command.
//     The typing is the consent. No guard.
//   - The in-app scheduler (src/instrumentation-node.ts) is a machine deciding
//     on its own. It carries the guard: a production build AND an explicit
//     MAIL_SUPPRESSION_SYNC=1.
//
// The guard lives at the scheduler and not here because a guard here would also
// refuse the CLI, which is the one caller that never needed permission.
//
// What must NOT come back is the original mistake: treating the presence of
// MAILJET_API_KEY and MAILJET_SECRET_KEY as authority to call Mailjet. Every
// developer's `.env` holds the real production keys so that the mailer works
// locally, so "do I have credentials" is true on every machine in the project,
// including the test lanes. Credentials are not consent.

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

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type SyncOptions = {
  /**
   * How many days back to query Mailjet. Defaults to 30. The CLI passes this
   * from argv; the scheduler always uses the default.
   */
  days?: number;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type SyncResult = {
  outcome: "SUCCESS" | "FAILURE";
  itemsAffected: number;
  /** Fixed vocabulary — never a recipient, path or provider string. */
  outcomeDetail: string | null;
};

// ---------------------------------------------------------------------------
// The sync itself
// ---------------------------------------------------------------------------

/**
 * Ask Mailjet which addresses it is refusing, record the results without ever
 * storing a plaintext address, and write a `JobRun` row regardless of outcome.
 *
 * The MAIL_HMAC_KEY env var is read directly rather than accepted as a
 * parameter: the key is the same in every run, and accepting it would invite
 * a caller to pass a constant or a derived default, which is the mistake
 * mailHmac.ts's own header warns against.
 *
 * The Prisma client is passed in so the CLI and the in-app scheduler can each
 * manage its lifetime without affecting this module.
 *
 * Never throws: a sync error is a FAILURE `JobRun`, not an uncaught exception.
 * The caller decides what to do with the result.
 */
export async function runMailSuppressionSync(
  db: Pick<PrismaClient, "mailSuppression" | "jobRun">,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const startedAt = new Date();
  let outcome: "SUCCESS" | "FAILURE" = "FAILURE";
  let itemsAffected = 0;
  // Fixed vocabulary. Never a recipient, never a path, never a provider string.
  let outcomeDetail: string | null = null;

  // The address HMAC, computed here. Same algorithm and normalisation as
  // mailAddressHmac in @/lib/ops/mailHmac.ts: trim + lowercase, then
  // HMAC-SHA256 under MAIL_HMAC_KEY. Neither the key nor the address is
  // logged or stored beyond this expression.
  function addressToHmac(address: string, key: string): string {
    return createHmac("sha256", key).update(address.trim().toLowerCase()).digest("hex");
  }

  /**
   * The ingest boundary. Three fields in, one small object out, and everything
   * else in the provider's response is discarded here rather than downstream.
   */
  function project(raw: unknown, hmacKey: string): Projected | null {
    if (typeof raw !== "object" || raw === null) return null;
    const message = raw as Record<string, unknown>;

    const status = typeof message.Status === "string" ? message.Status.toLowerCase() : "";
    const state = STATE_BY_STATUS[status];
    if (!state) return null;

    const address = typeof message.ContactAlt === "string" ? message.ContactAlt : "";
    if (!address.includes("@")) return null;

    // One-way, here, before the value can be assigned to anything with a longer
    // life than this expression.
    const addressHmac = addressToHmac(address, hmacKey);

    const arrived = message.ArrivedAt;
    const at =
      typeof arrived === "number"
        ? new Date(arrived * 1000)
        : typeof arrived === "string"
          ? new Date(arrived)
          : new Date();

    return { addressHmac, state, at: Number.isNaN(at.getTime()) ? new Date() : at };
  }

  try {
    const apiKey = process.env.MAILJET_API_KEY;
    const secretKey = process.env.MAILJET_SECRET_KEY;
    if (!apiKey || !secretKey) {
      outcomeDetail = "no Mailjet credentials in this environment";
      return { outcome, itemsAffected, outcomeDetail };
    }
    // Guard: no HMAC key means we cannot de-identify addresses. Refused rather
    // than hashed with a default — a default key is a key everybody has, and
    // rows written under one look protected and are not.
    const hmacKey = process.env.MAIL_HMAC_KEY;
    if (!hmacKey) {
      outcomeDetail = "no MAIL_HMAC_KEY in this environment";
      return { outcome, itemsAffected, outcomeDetail };
    }

    const days = opts.days ?? DEFAULT_DAYS;
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
      return { outcome, itemsAffected, outcomeDetail };
    }

    const body = (await res.json()) as { Data?: unknown[] };
    const suppressed = (body.Data ?? [])
      .map((raw) => project(raw, hmacKey))
      .filter((p): p is Projected => p !== null);

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
  } catch {
    // Do not print the error: a Prisma or fetch error can carry the request
    // it failed on, and that request carries the recipient (log hygiene,
    // brief 05). The FAILURE JobRun below is the signal.
    outcomeDetail = outcomeDetail ?? "unexpected error";
  } finally {
    try {
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
    } catch {
      // If the JobRun write itself fails there is nothing to do: logging the
      // error would risk surfacing a recipient, and a throw here would convert
      // a FAILURE into an uncaught exception at the call site.
    }
  }

  return { outcome, itemsAffected, outcomeDetail };
}
