// scripts/verify-mail.mjs
//
// Operational check: does THIS environment's Mailjet credential actually work,
// and does the message arrive unaltered?
//
// Run it with the production variables injected, so it tests the real values
// without you or anyone else ever seeing them:
//
//     railway run node scripts/verify-mail.mjs you@example.com
//
// Or against your local .env:
//
//     node --env-file=.env scripts/verify-mail.mjs you@example.com
//
// It sends ONE fixed message to the address you pass on the command line. It
// contains no child's name and no child's work, exactly like every template in
// src/lib/emails.ts, because this file is operational tooling and must never
// become a way to put child data into an email.
//
// Credentials are never printed, never logged, and never written anywhere. On
// failure it reports Mailjet's status code and body only.
//
// WHY THIS EXISTS. Storyjar sent through Brevo until August 2026. Brevo rewrote
// every link through its own redirect domain and injected an open pixel, and
// ignored the tracking flag the code was sending. That is fatal here: a parent's
// sign-in token works once, so anything that prefetches a rewritten link burns
// the token before the parent taps it. It was invisible until someone read the
// raw source of a delivered message. So this script exists to make that check
// routine rather than heroic, and it must be re-run against any new provider.

const to = process.argv[2];
if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.error("Usage: node scripts/verify-mail.mjs you@example.com");
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
const name = process.env.EMAIL_FROM_NAME ?? "Storyjar";
const replyTo = process.env.EMAIL_REPLY_TO ?? "hello@storyjar.co.uk";

// A fixed, public page. No token, no personal data. It is here purely so the
// delivered source can be inspected for link rewriting.
const PROBE_LINK = "https://storyjar.co.uk/legal/sub-processors?probe=verify-mail";

const text = [
  "This is an automated check of Storyjar's transactional email path.",
  "",
  "The link below is a fixed, public page on storyjar.co.uk. It carries no",
  "sign-in token and no personal data.",
  "",
  PROBE_LINK,
  "",
  "Nothing is expected of you. You can delete this message.",
].join("\n");

const html = `<!DOCTYPE html><html lang="en"><head></head><body style="font-family:sans-serif;">
<p>Automated check of Storyjar's transactional email path.</p>
<p><a href="${PROBE_LINK}">Sign in to Storyjar</a></p>
<p>Plain-text copy of the same link:<br/>${PROBE_LINK}</p>
</body></html>`;

console.log(`Sending as ${name} <${from}> to ${to} ...`);

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
        Subject: "Storyjar mail check",
        TextPart: text,
        HTMLPart: html,
        // Same three switches as src/lib/mailer.ts, so this probe tests the
        // configuration the app actually sends under, not a cleaner one.
        TrackOpens: "disabled",
        TrackClicks: "disabled",
        Headers: { "X-MJ-TrackOpen": "0", "X-MJ-TrackClick": "0" },
      },
    ],
  }),
});

const body = await res.json().catch(() => null);
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
     ${PROBE_LINK}
   The delivered <a href> must still point at storyjar.co.uk. If it
   points anywhere else, links are being rewritten. Stop and report it:
   a rewritten link burns a parent's single-use sign-in token before
   they can tap it. That is a blocking defect, not a documentation
   problem, and it needs its own entry in FINDINGS.md.

2. OPEN PIXEL. Search the source for "<img". We send none. Anything
   there was injected by the provider.

3. UNSUBSCRIBE. Search the headers for "List-Unsubscribe". A one-click
   unsubscribe on a sign-in email lets a parent, or an automated mail
   scanner, permanently block their own delivery. They would then never
   receive another sign-in link, and nothing in Storyjar would know.
`);