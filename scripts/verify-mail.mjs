#!/usr/bin/env node
// ---------------------------------------------------------------------------
// verify-mail — send one real test message through Brevo and prove what the
// provider does to it on the way out.
//
// Why this exists as a committed script rather than a one-off paste:
//
// On 16 August 2026 Brevo's transactional log recorded a "First opening" event
// against a magic-link email that this application sent with
// `disableTracking: true`. Whatever that API flag governs, it did not stop an
// open being recorded against the recipient. That leaves an open question we
// must not answer by assumption: if Brevo ignores the flag for the open pixel,
// does it also ignore it for LINKS?
//
// It matters more than the pixel does. A parent's sign-in link is the single
// most important path in the product. If Brevo rewrites the href through its
// own redirect domain, the token is handed to a third party and may not survive
// the round trip at all. That would be a functional defect, not a wording one.
//
// The only honest way to answer it is to send a message with a known link in it
// and read the source of what actually arrives.
//
// Usage:
//   node scripts/verify-mail.mjs someone@example.com
//   MAIL_CHECK_TO=someone@example.com node scripts/verify-mail.mjs
//
// Send it ONLY to a mailbox you control and can read the raw source of.
// Do not send it to a domain you do not own: a rejected recipient is a hard
// bounce, and hard bounces are what mailbox providers weigh most heavily
// against a young sending domain (see prisma/seed.ts).
//
// This sends fixed copy. It contains no child's name, no child content and no
// real sign-in token, so it is safe to read anywhere (SAFEGUARDING rule 2).
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";

// The link under test. A real, fixed, public URL on our own domain, distinctive
// enough to find by eye in a wall of quoted-printable MIME.
const PROBE_URL = "https://storyjar.co.uk/legal/sub-processors?probe=verify-mail";

loadDotEnv();

const to = process.argv[2] ?? process.env.MAIL_CHECK_TO;
if (!to || !to.includes("@")) {
  fail(
    "Give me a recipient: node scripts/verify-mail.mjs you@your-domain.example\n" +
      "It must be a mailbox you control and can view the raw source of.",
  );
}

const apiKey = process.env.BREVO_API_KEY;
if (!apiKey) fail("No BREVO_API_KEY in the environment or .env.");

const senderEmail = process.env.EMAIL_FROM_ADDRESS ?? "hello@mail.storyjar.co.uk";
const senderName = process.env.EMAIL_FROM_NAME ?? "Storyjar";
const replyTo = process.env.EMAIL_REPLY_TO ?? "hello@storyjar.co.uk";

const subject = "Storyjar mail check";
const text = [
  "This is an automated check of Storyjar's transactional email path.",
  "",
  "The link below is a fixed, public page on storyjar.co.uk. It carries no",
  "sign-in token and no personal data.",
  "",
  PROBE_URL,
  "",
  "Nothing is expected of you. You can delete this message.",
].join("\n");

// Deliberately shaped like src/lib/emails.ts: a plain anchor, no image, no
// pixel, no web font, no external CSS. Anything extra in the delivered source
// was added by the provider, not by us, which is the whole point of the check.
const html =
  `<!doctype html><html lang="en"><body style="font-family:sans-serif;">` +
  `<p>Automated check of Storyjar's transactional email path.</p>` +
  `<p><a href="${PROBE_URL}">Sign in to Storyjar</a></p>` +
  `<p>Plain-text copy of the same link:<br>${PROBE_URL}</p>` +
  `</body></html>`;

const payload = {
  sender: { name: senderName, email: senderEmail },
  replyTo: { email: replyTo, name: senderName },
  to: [{ email: to }],
  subject,
  textContent: text,
  htmlContent: html,
  // Exactly what src/lib/mailer.ts sets on every real send. The point of the
  // check is to find out what this flag actually buys us.
  disableTracking: true,
};

const res = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify(payload),
});

const body = await res.text();
if (!res.ok) fail(`Brevo refused the send (HTTP ${res.status}): ${body}`);

console.log(`Sent "${subject}" to ${to}.`);
console.log(`Brevo said: ${body.trim()}`);
console.log("");
console.log("Now open the received message and view its SOURCE (not the rendered");
console.log("message). In Apple Mail: View > Message > Raw Source. In Gmail:");
console.log("the three-dot menu > Show original.");
console.log("");
console.log("Two things to look for.");
console.log("");
console.log("1. LINKS. We sent this href, and only this href:");
console.log(`     ${PROBE_URL}`);
console.log("   If the delivered source still shows storyjar.co.uk in the <a href>,");
console.log("   links are untouched and the click-tracking claim holds.");
console.log("   If the href instead points at a Brevo redirect domain (anything");
console.log("   like brevolink.com, sendibt*.com, r.<something>, or a host that is");
console.log("   not storyjar.co.uk), links ARE being rewritten. Stop and report it:");
console.log("   that is a blocking defect in the parent sign-in path, not a");
console.log("   documentation problem, and it needs its own entry in FINDINGS.md.");
console.log("");
console.log("2. OPEN PIXEL. Search the source for a 1x1 <img>, or any <img> at all.");
console.log("   We send none. Anything there was injected by the provider.");
console.log("");
console.log("Cross-check the event log afterwards:");
console.log("   node scripts/brevo-events.mjs");

// ---------------------------------------------------------------------------

function loadDotEnv() {
  // Deliberately not a dependency. Same reasoning as src/lib/mailer.ts: fewer
  // moving parts in the path a parent depends on.
  let raw;
  try {
    raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return; // No .env is fine if the variables are already in the environment.
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
