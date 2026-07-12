#!/usr/bin/env node
// A6 — Static security gate. Cheap, deterministic checks that complement the
// runtime XSS/injection specs. Exits non-zero (fails CI) on a violation.
//
//   1. No unsafe raw Prisma queries ($queryRawUnsafe / $executeRawUnsafe, or
//      string-built $queryRaw). Parameterised tagged-template $queryRaw is fine.
//   2. No dangerouslySetInnerHTML on user content anywhere in src/.
//
// Usage: node scripts/audit-static.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const violations = [];
const reviewed = [];

// Reviewed, justified exceptions for dangerouslySetInnerHTML. Each entry is a
// file whose single use has been assessed as NOT user content. Any NEW use
// (different file, or a second use in these files) still fails the gate.
// Keep this list tiny and re-justify on every change.
const DSIH_ALLOWLIST = [
  {
    file: "src/app/signup/teacher/welcome/page.tsx",
    why: "Renders a QR SVG produced by the `qrcode` library from the class-code sign-in URL — machine-generated vector shapes, not user HTML (finding F9, reviewed).",
  },
];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) scan(full);
  }
}

function scan(file) {
  const text = readFileSync(file, "utf8");
  const rel = path.relative(process.cwd(), file);
  text.split("\n").forEach((line, i) => {
    const n = i + 1;
    // Unsafe raw query APIs — never allowed.
    if (/\$(queryRawUnsafe|executeRawUnsafe)\s*\(/.test(line)) {
      violations.push(`${rel}:${n}  unsafe raw Prisma API: ${line.trim()}`);
    }
    // $queryRaw / $executeRaw built from string concatenation or interpolation
    // that isn't a tagged template (heuristic: a "(" right after the call means
    // a function call, not the safe tagged-template form).
    if (/\$(queryRaw|executeRaw)\s*\(/.test(line)) {
      violations.push(`${rel}:${n}  raw Prisma call not using a tagged template: ${line.trim()}`);
    }
    // dangerouslySetInnerHTML — banned on user content (SAFEGUARDING rule 15).
    // Allowed only for explicitly reviewed, non-user-content uses.
    if (/dangerouslySetInnerHTML/.test(line)) {
      const ok = DSIH_ALLOWLIST.find((a) => a.file === rel);
      if (ok) reviewed.push(`${rel}:${n}  (reviewed) ${ok.why}`);
      else violations.push(`${rel}:${n}  dangerouslySetInnerHTML on unreviewed content: ${line.trim()}`);
    }
  });
}

walk(SRC);

if (violations.length) {
  console.error("✖ Static security gate failed:\n");
  for (const v of violations) console.error("  " + v);
  console.error(`\n${violations.length} violation(s). See SAFEGUARDING.md rules 4 & 15.`);
  process.exit(1);
}
if (reviewed.length) {
  console.log("Reviewed exceptions (allowlisted):");
  for (const r of reviewed) console.log("  • " + r);
}
console.log("✓ Static security gate passed (no unsafe raw queries; dangerouslySetInnerHTML limited to reviewed exceptions).");
