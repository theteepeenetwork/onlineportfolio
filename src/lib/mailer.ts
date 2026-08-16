import "server-only";

// ---------------------------------------------------------------------------
// Transactional email — Brevo (EU: France/Germany), via its REST API.
//
// Deliberately dependency-free: a single `fetch` to Brevo's HTTPS endpoint, no
// SDK, no SMTP library. Fewer moving parts in the one path a parent depends on
// to reach their child's work.
//
// SAFEGUARDING notes — this module sends mail ABOUT children to adults, so:
//
//  • **No child's name, and no child content, ever leaves in an email.** The
//    school holds the parent's address, not us, and a school can mistype it. If
//    a message lands with a stranger it must reveal nothing about a child —
//    not a name, not a class, not a photo. Every template below is deliberately
//    written so it would be meaningless to the wrong recipient (rule 2, rule 4).
//  • **We cannot tell whether a particular parent opened an email.** That is
//    the claim, and it is narrower than the one this comment used to make.
//    Every send below asks Brevo to disable tracking, and Brevo's account-level
//    "anonymous email tracking" is switched on, so any open or click event it
//    does record is not associated with an individual.
//
//    Be precise here, because the obvious stronger claim is false. On
//    16 August 2026 Brevo's transactional log recorded a "First opening"
//    against a magic-link email that this module sent with
//    `disableTracking: true`. Whatever that flag governs, it did not stop an
//    open being recorded and attributed to the recipient. The account-level
//    anonymity setting, not the flag, is what carries the promise now. Do not
//    let anyone restore a blanket "no tracking" to this file.
//  • **A sign-in link must never be rewritten through a click-tracker.** That
//    would both break the token and hand a third party the means to use it. It
//    is a functional requirement of the parent sign-in path, not a preference.
//    `scripts/verify-mail.mjs` exists to check it against a real delivered
//    message rather than trusting the flag, which we now know can be ignored.
//  • **Brevo's own log is short-lived and holds no message bodies.** Delivery
//    logs are deleted after 1 month (Brevo's floor) and message previews are
//    switched off, so a live, working sign-in link never sits in a third
//    party's web interface. Both are recorded in RETENTION.md.
//  • **Tokens are never logged.** Failures log the recipient's domain and the
//    provider's status, never the address in full and never the link.
//  • Brevo is a sub-processor holding adult email addresses only. It is listed
//    on /legal/sub-processors, in the DPA, and in docs/DPIA.md.
// ---------------------------------------------------------------------------

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 8000;

/** Is transactional email configured in this environment? */
export function mailerConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && senderEmail());
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
    console.warn("[mailer] not configured — no BREVO_API_KEY; email not sent");
    return { ok: false, reason: "not-configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY as string,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName(), email: senderEmail() },
        replyTo: { email: replyTo(), name: senderName() },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
        // We ask for no open pixel and no link rewriting. Brevo has been
        // observed to record an open anyway, so this flag is necessary but not
        // sufficient: the account-level anonymous-tracking setting is what
        // keeps an open from being tied to a person. See the note above.
        disableTracking: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Log the domain only — never the full address, never the body.
      console.error(`[mailer] send failed (${res.status}) to domain ${domainOf(to)}`);
      return { ok: false, reason: `http-${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    const reason = e instanceof Error && e.name === "AbortError" ? "timeout" : "network";
    console.error(`[mailer] send ${reason} to domain ${domainOf(to)}`);
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "(malformed)" : address.slice(at + 1);
}
