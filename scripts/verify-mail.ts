// scripts/verify-mail.ts
//
// Operational check: does THIS environment's Mailjet credential actually work,
// and does the message arrive unaltered?
//
// Run it with the production variables injected, so it tests the real values
// without you or anyone else ever seeing them:
//
//     railway run npx tsx scripts/verify-mail.ts you@example.com
//
// Or against your local .env:
//
//     npx tsx --env-file=.env scripts/verify-mail.ts you@example.com
//
// IT SENDS THE REAL TEMPLATE. This script used to carry its own hand-written
// copy of an email, because `src/lib/emails.ts` imported `server-only` and a
// plain script could not read it. That made the probe answer a much weaker
// question than it appeared to: it proved the transport worked, while saying
// nothing about the message a parent actually receives. Anyone could have
// changed the template and this check would have kept passing on different
// content. The templates now live in `src/lib/emailTemplates.ts`, which has no
// `server-only` guard (its header says why), so this sends `magicLinkEmail`
// exactly as the application sends it, with an obviously fake token.
//
// It contains no child's name and no child's work, exactly like every template
// in `src/lib/emailTemplates.ts`, because this file is operational tooling and
// must never become a way to put child data into an email.
//
// Credentials are never printed, never logged, and never written anywhere. On
// failure it reports Mailjet's status code and body only.
//
// WHY THIS EXISTS. StoryJar sent through Brevo until August 2026. Brevo rewrote
// every link through its own redirect domain and injected an open pixel, and
// ignored the tracking flag the code was sending. That is fatal here: a parent's
// sign-in token works once, so anything that prefetches a rewritten link burns
// the token before the parent taps it. It was invisible until someone read the
// raw source of a delivered message. So this script exists to make that check
// routine rather than heroic, and it must be re-run against any new provider.
//
// What we generate is now gated by a test rather than by this script:
// `tests/battery/security/email-templates.spec.ts` blocks the build if an
// image, an external URL or a stylesheet ever appears in a template. This
// script is the other half of the question, and the half no test can answer:
// what the provider does to the message on its way out.
//
// Everything runs inside `main()` rather than at the top level, because tsx
// compiles a `.ts` file in this package to CommonJS, where a top-level `await`
// is a syntax error. The alternative was a `.mts` extension; a plain async
// function keeps the filename the README and the DPIA refer to.

import { magicLinkEmail } from "@/lib/emailTemplates";

async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    console.error("Usage: npx tsx scripts/verify-mail.ts you@example.com");
    process.exit(1);
  }

  const apiKey = process.env.MAILJET_API_KEY;
  const secretKey = process.env.MAILJET_SECRET_KEY;
  if (!apiKey || !secretKey) {
    console.error("MAILJET_API_KEY / MAILJET_SECRET_KEY are not set in this environment.");
    console.error("Nothing sent. If you expected them, check you ran this under `railway run`.");
    process.exit(1);
  }

  const from = process.env.EMAIL_FROM_ADDRESS ?? "hello@mail.storyjar.co.uk";
  const name = process.env.EMAIL_FROM_NAME ?? "StoryJar";
  const replyTo = process.env.EMAIL_REPLY_TO ?? "hello@storyjar.co.uk";

  // An obviously fake token, on the real sign-in path. It is the shape of the
  // link a parent receives, so the delivered source can be checked for
  // rewriting, and it is unmistakably not a live token to anyone who reads it.
  // Following it lands on the ordinary "that link has already been used"
  // response, which is the correct outcome and harms nothing.
  const base = (process.env.APP_URL ?? "https://storyjar.co.uk").replace(/\/$/, "");
  const probeLink = `${base}/family/enter?token=not-a-real-token-verify-mail-probe`;

  const mail = magicLinkEmail(probeLink);

  console.log(`Sending as ${name} <${from}> to ${to} ...`);
  console.log(`Subject: ${mail.subject}`);
  console.log("Body: the real magicLinkEmail template, carrying a fake token.");

  const res = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString("base64")}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: from, Name: name },
          ReplyTo: { Email: replyTo, Name: name },
          To: [{ Email: to }],
          Subject: mail.subject,
          TextPart: mail.text,
          HTMLPart: mail.html,
          // Same three switches as src/lib/mailer.ts, so this probe tests the
          // configuration the app actually sends under, not a cleaner one.
          TrackOpens: "disabled",
          TrackClicks: "disabled",
          Headers: { "X-MJ-TrackOpen": "0", "X-MJ-TrackClick": "0" },
        },
      ],
    }),
  });

  // Mailjet returns HTTP 200 even when an individual message was rejected, so
  // the per-message status has to be read. Treating 200 as success is how you
  // end up believing mail is going out when it is not.
  const body = (await res.json().catch(() => null)) as
    | { Messages?: Array<{ Status?: string }> }
    | null;
  const status = body?.Messages?.[0]?.Status;

  if (!res.ok || status !== "success") {
    console.error(`FAILED (HTTP ${res.status}, status ${status ?? "unknown"}).`);
    console.error(JSON.stringify(body, null, 2));
    console.error("");
    console.error("401 means the key or secret is wrong.");
    console.error("An 'ErrorMessage' about the sender means mail.storyjar.co.uk is not validated.");
    process.exit(1);
  }

  console.log(`OK (HTTP ${res.status}). Mailjet accepted the message.`);
  console.log(`
Now open the received message and view its SOURCE (not the rendered
message). In Apple Mail: View > Message > Raw Source. In Gmail:
the three-dot menu > Show original.

Three things to look for. All three must hold.

1. LINKS. We sent this href, and only this href:
     ${probeLink}
   The delivered <a href> must still point at ${new URL(base).host}. If it
   points anywhere else, links are being rewritten. Stop and report it:
   a rewritten link burns a parent's single-use sign-in token before
   they can tap it. That is a blocking defect, not a documentation
   problem, and it needs its own entry in FINDINGS.md.

2. OPEN PIXEL. Search the source for "<img". We send none, and the
   battery test proves the template has none, so anything found there
   was injected by the provider.

3. UNSUBSCRIBE. Search the headers for "List-Unsubscribe". A one-click
   unsubscribe on a sign-in email lets a parent, or an automated mail
   scanner, permanently block their own delivery. They would then never
   receive another sign-in link, and nothing in StoryJar would know.
`);
}

main();
