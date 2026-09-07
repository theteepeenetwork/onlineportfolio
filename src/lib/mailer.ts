import "server-only";

// ---------------------------------------------------------------------------
// Transactional email — Mailjet (Sinch), EU storage, via its Send API v3.1.
//
// Deliberately dependency-free: a single `fetch` to Mailjet's HTTPS endpoint,
// no SDK, no SMTP library. Fewer moving parts in the one path a parent depends
// on to reach their child's work.
//
// WHY NOT BREVO. StoryJar sent transactional mail through Brevo until August
// 2026. Brevo rewrites every link in every message through its own redirect
// domain and injects an open-tracking pixel, and it does not let non-Enterprise
// accounts turn either off. Their API has no tracking parameter at all: the
// `disableTracking: true` this file used to send was silently discarded.
//
// That is disqualifying here, and not mainly for privacy reasons. A parent's
// sign-in token works ONCE. Routed through a third-party redirect, anything
// that prefetches the link consumes the token before the parent taps it, and
// the parent is told their link has expired. School mail gateways prefetch
// links as a matter of course. See FINDINGS (link-rewriting) for the evidence,
// including the delivered raw source that proved it.
//
// So the rule this module exists to enforce:
//
//   **A sign-in link must arrive exactly as StoryJar wrote it.**
//
// Tracking is switched off three ways below (per-message properties, per-message
// headers, and the account setting) because one silent failure already cost us
// a live authentication defect. None of them is trusted: the acceptance test is
// `scripts/verify-mail.ts` plus reading the delivered raw source. If an <a
// href> ever points anywhere other than storyjar.co.uk, this module is broken
// no matter what the provider's documentation claims.
//
// SAFEGUARDING notes — this module sends mail ABOUT children to adults, so:
//
//  • **No child's name, and no child content, ever leaves in an email.** The
//    school holds the parent's address, not us, and a school can mistype it. If
//    a message lands with a stranger it must reveal nothing about a child —
//    not a name, not a class, not a photo. Every template in emailTemplates.ts
//    is deliberately written so it would be meaningless to the wrong recipient
//    (rule 2, rule 4).
//  • **No tracking.** See above. Opens and clicks are switched off explicitly,
//    and the link a parent receives is never rewritten. The templates carry no
//    image, no external URL and no stylesheet, which is asserted by
//    tests/battery/security/email-templates.spec.ts. That module drops
//    `server-only` so the test can read it; its header says why, and what
//    would put the guard back.
//  • **Every attempt is counted, and nothing about it is stored.** PR5 added a
//    per-day, per-template, per-outcome tally through recordMailAttempt below.
//    It holds no address, no domain, no subject, no body and no provider
//    string, it never throws, and it cannot change what a caller observes,
//    because requestMagicLink discards this function's result on purpose to
//    keep finding F6 true. See src/lib/mailCounters.ts for the whole argument,
//    including the timing side channel it does not make worse.
//  • **Nothing about the recipient is logged.** A failure writes the provider's
//    HTTP status and its own error code and nothing else: not the address, not
//    its domain, not the subject, not the body, and never the link, which
//    carries a live sign-in token. The domain used to be logged and no longer
//    is. On its own a domain is weak, but stdout goes to Railway's log store
//    with a timestamp beside it, and across a ten-school pilot "a send to this
//    domain failed at 08:41" is close enough to naming the family.
//
//    THE STATUS USED TO BE ROUNDED TO ITS CLASS — "4xx" — and that was one
//    rounding too far. On 7 September 2026 an admin's staff invitations stopped
//    arriving, and the only evidence anywhere was two lines reading
//    `send failed (4xx)`. A revoked key (401), an unauthorised sender (403) and
//    a malformed request (400) are three different faults with three different
//    fixes, and the log could not tell them apart; neither could the counters,
//    because MailCounter.statusClass is deliberately coarse. Rounding a status
//    code protects nobody: 401 is not a fact about a family. So the exact
//    status is printed, with Mailjet's own error code where the body carries
//    one — see `mailjetErrorCode` below for why the code is safe and
//    `ErrorMessage` is not. The counters are unchanged: a per-day tally still
//    says "4xx", because that is the right grain for a screen an operator reads
//    and the wrong grain for an incident an engineer is in the middle of.
//  • Mailjet is a sub-processor holding adult email addresses only. It is
//    listed on /legal/sub-processors, in the DPA, and in docs/DPIA.md.
// ---------------------------------------------------------------------------

import { recordMailAttempt } from "@/lib/mailCounters";
import type { MailTemplateKey } from "@/lib/mailStatus";

const MAILJET_ENDPOINT = "https://api.mailjet.com/v3.1/send";
const SEND_TIMEOUT_MS = 8000;

/**
 * One environment variable, trimmed, or `fallback` when it is not set at all.
 *
 * THE TRIM IS NOT COSMETIC, and it is here because of a real morning. A
 * credential pasted into Railway's variable editor with a trailing newline
 * looks identical to a correct one in the dashboard, in `list-variables` and in
 * every log line StoryJar writes. Mailjet answers the Authorization header it
 * produces with a flat 401 — indistinguishable, from outside, from a key that
 * has been revoked. A sender address with a stray space is worse: Mailjet
 * rejects the whole REQUEST rather than the one message, so nothing leaves at
 * all and every template fails at once.
 *
 * An explicitly EMPTY value is still empty, deliberately. `mailerConfigured()`
 * reads these, and blanking a credential to stop mail in an environment should
 * report UNCONFIGURED rather than quietly fall back to a default sender.
 */
function envOr(name: string, fallback: string): string {
  const set = process.env[name];
  return set === undefined ? fallback : set.trim();
}

/** Is transactional email configured in this environment? */
export function mailerConfigured(): boolean {
  return Boolean(envOr("MAILJET_API_KEY", "") && envOr("MAILJET_SECRET_KEY", "") && senderEmail());
}

function senderEmail(): string {
  return envOr("EMAIL_FROM_ADDRESS", "hello@mail.storyjar.co.uk");
}
function senderName(): string {
  return envOr("EMAIL_FROM_NAME", "StoryJar");
}
/** Where a human reply actually lands — a real, monitored mailbox. */
function replyTo(): string {
  return envOr("EMAIL_REPLY_TO", "hello@storyjar.co.uk");
}

function authHeader(): string {
  const pair = `${envOr("MAILJET_API_KEY", "")}:${envOr("MAILJET_SECRET_KEY", "")}`;
  return `Basic ${Buffer.from(pair).toString("base64")}`;
}

// The on-screen sign-in link rule lives in `src/lib/signInLinkPolicy.ts` —
// separate so a test can import it without pulling in `server-only`.

export type MailResult = { ok: true } | { ok: false; reason: string };

type SendArgs = {
  to: string;
  subject: string;
  /** Plain text is the source of truth; HTML is a light wrapper around it. */
  text: string;
  html: string;
  /**
   * Which template this is, from the closed list in src/lib/mailStatus.ts. It
   * is the only thing about a message that is written down, and it is a
   * constant chosen at the call site rather than anything derived from the
   * recipient or the content.
   */
  templateKey: MailTemplateKey;
};

/**
 * The single exit from sendMail. Every return below goes through here, so
 * "was this attempt counted?" has one answer instead of one per branch, and a
 * new failure path cannot be added without counting it.
 *
 * A blocking spec asserts that sendMail contains no other return of a result
 * object, which is what keeps that true after the next edit.
 */
async function finish(templateKey: MailTemplateKey, result: MailResult): Promise<MailResult> {
  await recordMailAttempt(templateKey, result);
  return result;
}

/**
 * Send one transactional email. Never throws: a mail failure must not take down
 * the action that triggered it, and must never change what the user is told
 * (see the enumeration note in actions/family.ts).
 */
export async function sendMail({
  to,
  subject,
  text,
  html,
  templateKey,
}: SendArgs): Promise<MailResult> {
  if (!mailerConfigured()) {
    // Loud in development, silent-but-reported in production. Deliberately not
    // an exception: an unconfigured environment should degrade, not crash.
    //
    // Counted as UNCONFIGURED rather than as a failure, because it is a
    // different problem with a different fix, and it is the one that produces
    // no signal anywhere else: a revoked API key makes no attempt at the
    // provider, so there is no bounce and no provider-side error to notice.
    console.warn("[mailer] not configured — no Mailjet credentials; email not sent");
    return finish(templateKey, { ok: false, reason: "not-configured" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(MAILJET_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: authHeader(),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: senderEmail(), Name: senderName() },
            ReplyTo: { Email: replyTo(), Name: senderName() },
            To: [{ Email: to }],
            Subject: subject,
            TextPart: text,
            HTMLPart: html,
            // No open pixel, no link rewriting. Set as message properties AND
            // as the SMTP-style headers, because a provider silently ignoring
            // one of these is exactly how the Brevo defect went unnoticed.
            TrackOpens: "disabled",
            TrackClicks: "disabled",
            Headers: {
              "X-MJ-TrackOpen": "0",
              "X-MJ-TrackClick": "0",
            },
          },
        ],
      }),
      signal: controller.signal,
    });

    // Read the body whichever way this went: on a 4xx it carries the one thing
    // that says WHICH 4xx this is, and on a 200 it carries the per-message
    // status. Never throws — an error page is not JSON.
    const body = (await res.json().catch(() => null)) as MailjetBody | null;

    if (!res.ok) {
      console.error(`[mailer] send failed (${res.status}${codeSuffix(mailjetErrorCode(body))})`);
      return finish(templateKey, { ok: false, reason: `http-${res.status}` });
    }

    // Mailjet returns HTTP 200 even when an individual message was rejected, so
    // the per-message status has to be read. Treating 200 as success is how you
    // end up believing mail is going out when it is not.
    const status = body?.Messages?.[0]?.Status;
    if (status !== "success") {
      console.error(`[mailer] provider rejected the message${codeSuffix(mailjetErrorCode(body))}`);
      return finish(templateKey, { ok: false, reason: `rejected-${status ?? "unknown"}` });
    }

    return finish(templateKey, { ok: true });
  } catch (e) {
    const reason = e instanceof Error && e.name === "AbortError" ? "timeout" : "network";
    console.error(`[mailer] send ${reason}`);
    return finish(templateKey, { ok: false, reason });
  } finally {
    clearTimeout(timer);
  }
}

/** The shape of the two Mailjet error bodies this module reads. */
type MailjetBody = {
  /** Set when Mailjet refused the whole request: a bad key, an unauthorised sender. */
  ErrorCode?: string;
  Messages?: Array<{ Status?: string; Errors?: Array<{ ErrorCode?: string }> }>;
};

// A Mailjet error code and nothing that could be anything else: two to eight
// lowercase letters, a hyphen, three to five digits. "mj-0013" passes; an
// address, a path, a sentence or a quoted payload cannot. This is the same
// move `errorLabel` in src/lib/safeLog.ts makes on a library's `code`, and for
// the same reason — a provider is free to put whatever it likes in a field,
// so the shape is checked rather than the field trusted.
const MAILJET_ERROR_CODE = /^[a-z]{2,8}-\d{3,5}$/;

/**
 * Mailjet's own error code, or "" when the body carries nothing shaped like one.
 *
 * WHY THIS IS SAFE TO PRINT, given this file's rule that nothing about the
 * recipient reaches stdout. `ErrorMessage` is NOT read and must not be: Mailjet
 * quotes the offending value back, so an unauthorised-sender or invalid-address
 * error contains an address. `ErrorCode` is a closed provider vocabulary that
 * names the KIND of refusal, and the regex above means an unrecognised shape is
 * dropped rather than logged.
 */
function mailjetErrorCode(body: MailjetBody | null): string {
  const raw = body?.ErrorCode ?? body?.Messages?.[0]?.Errors?.[0]?.ErrorCode;
  return typeof raw === "string" && MAILJET_ERROR_CODE.test(raw) ? raw : "";
}

/** " mj-0013", or "" — so the log line reads properly with or without a code. */
function codeSuffix(code: string): string {
  return code ? ` ${code}` : "";
}
