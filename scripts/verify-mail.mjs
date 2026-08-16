// scripts/verify-mail.mjs
//
// Operational check: does THIS environment's BREVO_API_KEY actually work?
//
// Run it with the production variables injected, so it tests the real value
// without you or anyone else ever seeing it:
//
//     railway run node scripts/verify-mail.mjs you@example.com
//
// Or against your local .env:
//
//     node --env-file=.env scripts/verify-mail.mjs you@example.com
//
// It sends ONE fixed message to the address you pass on the command line.
// It contains no child's name and no child's work, exactly like every template
// in src/lib/emails.ts, because this file is operational tooling and must never
// become a way to put child data into an email.
//
// The key is never printed, never logged, and never written anywhere. On
// failure it reports Brevo's status code and body only.

const to = process.argv[2];
if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.error("Usage: node scripts/verify-mail.mjs you@example.com");
  process.exit(1);
}

const key = process.env.BREVO_API_KEY;
if (!key) {
  console.error("BREVO_API_KEY is not set in this environment. Nothing sent.");
  console.error("If you expected it to be, check that .env has it on its own line.");
  process.exit(1);
}

const from = process.env.EMAIL_FROM_ADDRESS ?? "hello@mail.storyjar.co.uk";
const name = process.env.EMAIL_FROM_NAME ?? "Storyjar";
const replyTo = process.env.EMAIL_REPLY_TO ?? "hello@storyjar.co.uk";

console.log(`Sending a test message as ${name} <${from}> to ${to} ...`);

const res = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "api-key": key,
    "content-type": "application/json",
    accept: "application/json",
  },
  body: JSON.stringify({
    sender: { name, email: from },
    replyTo: { email: replyTo, name },
    to: [{ email: to }],
    subject: "Storyjar mail check",
    textContent:
      "This is an operational test of Storyjar's transactional email. If you are reading it, the API key, the sending domain and DKIM are all working. Nothing is wrong and no action is needed.",
    htmlContent:
      "<p>This is an operational test of Storyjar's transactional email. If you are reading it, the API key, the sending domain and DKIM are all working. Nothing is wrong and no action is needed.</p>",
    disableTracking: true,
  }),
});

if (res.ok) {
  console.log(`OK (${res.status}). Brevo accepted the message.`);
  console.log("Now refresh Brevo > SMTP & API > API keys. 'Last used on' should show a timestamp.");
  console.log("If the timestamp appears but no email arrives, the problem is deliverability, not the key.");
  process.exit(0);
}

console.error(`FAILED (${res.status}).`);
console.error(await res.text());
console.error("");
console.error("401 means the key is wrong or was revoked.");
console.error("If you have just rotated, check the running deploy actually picked up the new value.");
process.exit(1);
