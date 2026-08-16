#!/usr/bin/env node
// ---------------------------------------------------------------------------
// brevo-events — print Brevo's transactional event log for the last few days.
//
// The companion to scripts/verify-mail.mjs. verify-mail proves what arrives in
// a mailbox; this prints what the provider recorded about the send, which is
// the other half of the same question.
//
// This is the tool that produced the evidence behind the August 2026 correction
// to Storyjar's email-tracking claims: it showed an `opened` event recorded
// against a magic-link email that the application sent with
// `disableTracking: true`.
//
// Recipient addresses are masked in the output. They are adult email addresses
// belonging to real people, and this script's output tends to end up pasted
// into pull requests and issues. Pass --full only if you actually need the
// whole address to chase a specific delivery failure.
//
// Usage:
//   node scripts/brevo-events.mjs            # last 7 days, masked
//   node scripts/brevo-events.mjs 30         # last 30 days
//   node scripts/brevo-events.mjs 7 --full   # do not mask addresses
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";

loadDotEnv();

const apiKey = process.env.BREVO_API_KEY;
if (!apiKey) {
  console.error("No BREVO_API_KEY in the environment or .env.");
  process.exit(1);
}

const showFull = process.argv.includes("--full");
const days = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 7);

// Brevo rejects an end date in the future, so "today" is the latest we can ask
// for, and the window is inclusive of it.
const today = new Date();
const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
const iso = (d) => d.toISOString().slice(0, 10);

const url =
  "https://api.brevo.com/v3/smtp/statistics/events" +
  `?limit=200&startDate=${iso(start)}&endDate=${iso(today)}`;

const res = await fetch(url, { headers: { "api-key": apiKey, accept: "application/json" } });
if (!res.ok) {
  console.error(`Brevo returned HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const { events = [] } = await res.json();
if (events.length === 0) {
  console.log(`No transactional events in the last ${days} days.`);
  process.exit(0);
}

console.log(`${events.length} event(s), ${iso(start)} to ${iso(today)}:\n`);
for (const e of events) {
  const parts = [e.date, pad(e.event, 14), pad(showFull ? e.email : mask(e.email), 34), e.subject ?? ""];
  if (e.link) parts.push(`link=${e.link}`);
  if (e.reason) parts.push(`reason=${e.reason}`);
  console.log(parts.join("  "));
}

// A `link` on any event above means Brevo recorded a click, which means it
// rewrote the href to route through itself. On a magic-link email that is a
// blocking defect, not a statistic. See scripts/verify-mail.mjs.
if (events.some((e) => e.link)) {
  console.log("\n!! At least one event carries a rewritten link. Read the note at the");
  console.log("!! bottom of scripts/brevo-events.mjs and open a finding.");
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
