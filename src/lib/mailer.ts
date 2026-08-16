import "server-only";

// ---------------------------------------------------------------------------
// Transactional email — Mailjet (Sinch), EU storage, via its Send API v3.1.
//
// Deliberately dependency-free: a single `fetch` to Mailjet's HTTPS endpoint,
// no SDK, no SMTP library. Fewer moving parts in the one path a parent depends
// on to reach their child's work.
//
// WHY NOT BREVO. Storyjar sent transactional mail through Brevo until August
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
//   **A sign-in link must arrive exactly as Storyjar wrote it.**
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
//  • **Nothing about the recipient is logged.** A failure writes the provider's
//    status class and nothing else: not the address, not its domain, not the
//    subject, not the body, and never the link, which carries a live sign-in
//    token. The domain used to be logged and no longer is. On its own a domain
//    is weak, but stdout goes to Railway's log store with a timestamp beside
//    it, and across a ten-school pilot "a send to this domain failed at 08:41"
//    is close enough to naming the family. Diagnosis belongs in per-day, per
//    template counters, which say the same operational thing without holding a
//    row about a person.
//  • Mailjet is a sub-processor holding adult email addresses only. It is
//    listed on /legal/sub-processors, in the DPA, and in docs/DPIA.md.
// ---------------------------------------------------------------------------

const MAILJET_ENDPOINT = "https://api.mailjet.com/v3.1/send";
const SEND_TIMEOUT_MS = 8000;

/** Is transactional email configured in this environment? */
export function mailerConfigured(): boolean {
  return Boolean(process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY && senderEmail());
}

function senderEmail(): string {
  return process.env.EMAIL_FROM_ADDRESS ?? "hello@mail.storyjar.co.uk";
}
function senderName(): string {
  return process.env.EMAIL_FROM_NAME ?? "Storyjar";
}
/** Where a human reply actually lands — a real, monitored mailbox. */
function replyTo(): string {
  return process.env.EMAIL_REPLY_TO ?? "hello@storyjar.co.uk";
}

function authHeader(): string {
  const pair = `${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`;
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
};

/**
 * Send one transactional email. Never throws: a mail failure must not take down
 * the action that triggered it, and must never change what the user is told
 * (see the enumeration note in actions/family.ts).
 */
export async function sendMail({ to, subject, text, html }: SendArgs): Promise<MailResult> {
  if (!mailerConfigured()) {
    // Loud in development, silent-but-reported in production. Deliberately not
    // an exception: an unconfigured environment should degrade, not crash.
    console.warn("[mailer] not configured — no Mailjet credentials; email not sent");
    return { ok: false, reason: "not-configured" };
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

    if (!res.ok) {
      // A status class, and nothing about who the message was for. See the
      // logging note in this file's header.
      console.error(`[mailer] send failed (${statusClass(res.status)})`);
      return { ok: false, reason: `http-${res.status}` };
    }

    // Mailjet returns HTTP 200 even when an individual message was rejected, so
    // the per-message status has to be read. Treating 200 as success is how you
    // end up believing mail is going out when it is not.
    const body = (await res.json().catch(() => null)) as
      | { Messages?: Array<{ Status?: string }> }
      | null;
    const status = body?.Messages?.[0]?.Status;
    if (status !== "success") {
      console.error("[mailer] provider rejected the message");
      return { ok: false, reason: `rejected-${status ?? "unknown"}` };
    }

    return { ok: true };
  } catch (e) {
    const reason = e instanceof Error && e.name === "AbortError" ? "timeout" : "network";
    console.error(`[mailer] send ${reason}`);
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * "2xx" / "4xx" / "5xx". The shape the eventual per-day counters want, and the
 * most that may be said about one send in a log line.
 */
function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}