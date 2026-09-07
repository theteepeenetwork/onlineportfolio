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
    // Each alternative opens and closes on the SAME quote character, and the
    // length filter lives below rather than in the pattern. Both halves are
    // load-bearing and neither works alone (F52).
    //
    // The old pattern was /["'`]([^"'`]{6,})["'`]/g. Two faults. It could open
    // on `"` and close on `'`, so an apostrophe inside a double-quoted string
    // ended it and everything after "doesn't" was invisible to this audit. And
    // the {6,} minimum meant a string too short to match never consumed its own
    // quotes: the engine advanced and retried from the CLOSING quote of the
    // short string, ran to the OPENING quote of the next one, and audited the
    // code in between. A scanner whose extractor can mistake a closing quote
    // for an opening one is not reporting on strings; it is reporting on
    // whatever happens to lie between them.
    const strings = line.match(/"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g) ?? [];
    for (const raw of strings) {
      const val = raw.slice(1, -1);
      // Was `{6,}` inside the pattern above. It has to be applied after
      // extraction, or a short string silently offsets every quote after it.
      if (val.length < 6) continue;
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
