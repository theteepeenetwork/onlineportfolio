#!/usr/bin/env node
// B6 — Error-message audit. Collects user-facing strings from src/ and flags
// developer jargon a teacher should never see mid-lesson ("500", "Prisma",
// "payload", "undefined", stack-trace words). Report-only by default; pass
// --strict to fail CI when hard jargon is found.
//
// Usage: node scripts/error-string-audit.mjs [--strict]
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const STRICT = process.argv.includes("--strict");

// Hard jargon: never acceptable in a user-facing string.
const HARD = [/\bPrisma\b/, /\bpayload\b/i, /\bundefined\b/, /\bnull\b/, /\bstack trace\b/i, /\bECONNREFUSED\b/, /\b5\d\d\b/];
// Soft jargon: worth a human look.
const SOFT = [/\berror code\b/i, /\bexception\b/i, /\btoken\b/i, /\bserver\b/i, /\brequest failed\b/i];

const hard = [];
const soft = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) scan(full);
  }
}

function scan(file) {
  const text = readFileSync(file, "utf8");
  const rel = path.relative(process.cwd(), file);
  // Heuristic: only look at strings that are plausibly user-facing — those on a
  // line mentioning error/message/toast/return { error, or JSX text.
  text.split("\n").forEach((line, i) => {
    if (!/error|message|toast|showToast|placeholder|label|title:/i.test(line)) return;
    const strings = line.match(/["'`]([^"'`]{6,})["'`]/g) ?? [];
    for (const raw of strings) {
      const val = raw.slice(1, -1);
      if (/[A-Za-z]{4,}/.test(val) === false) continue;
      if (HARD.some((re) => re.test(val))) hard.push(`${rel}:${i + 1}  ${val}`);
      else if (SOFT.some((re) => re.test(val))) soft.push(`${rel}:${i + 1}  ${val}`);
    }
  });
}

walk(SRC);

console.log("=== Error / user-facing string audit ===\n");
console.log(`HARD jargon (a teacher must never see these): ${hard.length}`);
for (const h of hard) console.log("  ✖ " + h);
console.log(`\nSOFT jargon (review): ${soft.length}`);
for (const sfx of soft) console.log("  • " + sfx);

if (STRICT && hard.length) {
  console.error(`\n✖ ${hard.length} hard-jargon string(s) — failing (--strict).`);
  process.exit(1);
}
console.log(`\n✓ Audit complete (${hard.length} hard, ${soft.length} soft).`);
