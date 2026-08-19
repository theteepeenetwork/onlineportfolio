#!/usr/bin/env node
// ---------------------------------------------------------------------------
// mail-events: print what Mailjet recorded about StoryJar's recent sends.
//
// The companion to scripts/verify-mail.ts. verify-mail proves what arrives in
// one mailbox on one occasion; this prints what the provider recorded about
// every send in a window, which is the other half of the same question.
//
// WHY THIS SURVIVED THE PROVIDER CHANGE. Its Brevo predecessor is what produced
// the evidence behind the August 2026 correction to StoryJar's email-tracking
// claims: it showed an `opened` event recorded against a sign-in email that the
// application had sent with tracking explicitly disabled. Tracking is now off
// three ways (account setting, per-message properties, per-message headers),
// but "off three ways" is a claim about configuration, not about behaviour, and
// the last provider ignored the switch it was given. This script is how that
// class of failure gets noticed again rather than discovered by a parent whose
// sign-in link has already been consumed.
//
// It also reads delivery status, which is what identified the demo parent's
// hard bounce on 16 August 2026.
//
// Two Mailjet endpoints, both read-only:
//   /v3/REST/message                  the messages sent in the window
//   /v3/REST/messagehistory/{id}      the per-message event trail
//
// Recipient addresses are masked in the output. They are adult email addresses
// belonging to real people, and this script's output tends to end up pasted
// into pull requests and issues. Pass --full only if you actually need the
// whole address to chase a specific delivery failure.
//
// Usage:
//   node scripts/mail-events.mjs             # last 7 days, masked
//   node scripts/mail-events.mjs 30          # last 30 days
//   node scripts/mail-events.mjs 7 --full    # do not mask addresses
//
// Under production credentials, without ever seeing them:
//   railway run node scripts/mail-events.mjs
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";

loadDotEnv();

const apiKey = process.env.MAILJET_API_KEY;
const secretKey = process.env.MAILJET_SECRET_KEY;
if (!apiKey || !secretKey) {
  console.error("No MAILJET_API_KEY / MAILJET_SECRET_KEY in the environment or .env.");
  process.exit(1);
}

const showFull = process.argv.includes("--full");
const days = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 7);

// How many messages to pull, and how many of those to fetch an event trail for.
// StoryJar sends one kind of email at low volume, so these are generous. They
// exist so a bad argument cannot turn into hundreds of API calls.
const MESSAGE_LIMIT = 200;
const HISTORY_LIMIT = 60;

const nowSec = Math.floor(Date.now() / 1000);
const fromSec = nowSec - days * 24 * 60 * 60;
const auth = `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString("base64")}`;

async function get(path) {
  const res = await fetch(`https://api.mailjet.com${path}`, {
    headers: { authorization: auth, accept: "application/json" },
  });
  if (!res.ok) {
    console.error(`Mailjet returned HTTP ${res.status} for ${path}: ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
}

// ShowSubject and ShowContactAlt are what turn the numeric contact id and the
// bare message id into something a human can read.
const listed = await get(
  `/v3/REST/message?Limit=${MESSAGE_LIMIT}&FromTS=${fromSec}&ToTS=${nowSec}` +
    "&ShowSubject=true&ShowContactAlt=true",
);
const messages = listed.Data ?? [];

const window = `${isoDay(fromSec)} to ${isoDay(nowSec)}`;
if (messages.length === 0) {
  console.log(`No messages sent in the last ${days} days (${window}).`);
  process.exit(0);
}

console.log(`${messages.length} message(s), ${window}:\n`);

const tracked = [];
const failed = [];

for (const [i, m] of messages.entries()) {
  const address = m.ContactAlt || String(m.ContactID ?? "");
  const line = [
    isoStamp(m.ArrivedAt),
    pad(m.Status, 14),
    pad(showFull ? address : mask(address), 34),
    m.Subject ?? "",
  ];
  if (m.StatePermanent) line.push("permanent-failure");
  console.log(line.join("  "));

  if (/bounce|blocked|spam|hard/i.test(String(m.Status))) {
    failed.push({ status: m.Status, address: mask(address) });
  }

  // The event trail is the part that answers the tracking question. Cap it: the
  // status above is already enough for a bounce hunt.
  if (i >= HISTORY_LIMIT) continue;
  const history = await get(`/v3/REST/messagehistory/${m.ID}`);
  for (const e of history.Data ?? []) {
    const type = String(e.EventType ?? "").toLowerCase();
    console.log(`        ${isoStamp(e.EventAt)}  ${type}${e.Comment ? `  ${e.Comment}` : ""}`);
    if (type === "opened" || type === "clicked") {
      tracked.push({ type, address: mask(address), at: isoStamp(e.EventAt) });
    }
  }
}

if (messages.length > HISTORY_LIMIT) {
  console.log(
    `\nEvent trails shown for the first ${HISTORY_LIMIT} of ${messages.length} messages.`,
  );
  console.log("Narrow the window if you need the rest.");
}

if (failed.length > 0) {
  console.log(`\n${failed.length} message(s) did not reach the recipient:`);
  for (const f of failed) console.log(`  ${pad(f.status, 14)} ${f.address}`);
  console.log("A hard bounce from a StoryJar-controlled address means a broken alias.");
  console.log("See the demo parent note in README and prisma/seed.ts.");
}

// The alarm. Every send sets TrackOpens and TrackClicks to disabled, sets the
// X-MJ-TrackOpen and X-MJ-TrackClick headers, and the account has both switched
// off as well. An `opened` or `clicked` event here means one of those three is
// not doing what it says, which is precisely how the previous provider failed.
if (tracked.length > 0) {
  console.log(`\n!! ${tracked.length} open/click event(s) recorded despite tracking being off:`);
  for (const t of tracked) console.log(`!!   ${t.at}  ${t.type}  ${t.address}`);
  console.log("!!");
  console.log("!! A `clicked` event means the href was rewritten to route through the");
  console.log("!! provider. On a sign-in email that is a blocking defect, not a");
  console.log("!! statistic: a single-use token is consumed by anything that follows");
  console.log("!! the link first. Run scripts/verify-mail.ts, read the delivered raw");
  console.log("!! source, and open a finding in FINDINGS.md.");
  console.log("!!");
  console.log("!! An `opened` event alone means the pixel is being injected. That is a");
  console.log("!! claims problem: /legal/sub-processors and docs/DPIA.md R14 both say");
  console.log("!! we cannot tell whether a particular parent opened an email.");
  process.exitCode = 2;
}

// ---------------------------------------------------------------------------

function mask(address) {
  if (!address || !address.includes("@")) return String(address ?? "");
  const [local, domain] = address.split(/@(?=[^@]*$)/);
  return `${local.slice(0, 2)}***@${domain}`;
}

function pad(s, n) {
  return String(s ?? "").padEnd(n).slice(0, n);
}

/** Mailjet returns RFC3339 strings on some fields and unix seconds on others. */
function isoStamp(value) {
  if (value == null) return "".padEnd(19);
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 19).replace("T", " ");
}

function isoDay(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function loadDotEnv() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return;
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
