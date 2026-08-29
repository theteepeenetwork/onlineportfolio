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

// The raw-query and dangerouslySetInnerHTML checks are about APP code: they
// look for patterns that are dangerous in a page and unremarkable anywhere
// else. This gate's own source says "dangerouslySetInnerHTML" a dozen times
// because it hunts for it — scanning itself for that would be pure noise, and a
// gate that cries wolf gets ignored.
const APP = path.join(process.cwd(), "src");

// The control-byte check is different: it applies to any file a human or an
// agent might need to SEARCH, which includes the tooling. It is here because a
// gate that cannot see its own file is not a gate — this very check was first
// written with a raw NUL inside its own comment, and passed clean, because only
// src/ was ever scanned.
const SEARCHABLE = [APP, path.join(process.cwd(), "scripts")];

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
  {
    file: "src/components/storyjar/FamilyLetter.tsx",
    why: "Same pattern, reviewed: a QR SVG from the `qrcode` library for the /family sign-in URL, built in `src/lib/familyLetterQr.ts` from the request host and a fixed path. It carries no family code and no user text, so nothing user-supplied reaches the markup. This use MOVED here from src/app/teacher/students/[studentId]/letter/page.tsx when the letter was extracted for the whole-class sheet; the markup is byte-identical and both the single letter and /teacher/class/[classId]/letters now render through this one component, so there is one reviewed use rather than two.",
  },
];

// `visit` gets (file) and decides what to run on it. Same extension filter for
// both passes — deliberately not a fresh walker, because src/app/favicon.ico
// holds 29 control bytes and a blanket scan would red-line this gate on day one.
function walk(dir, visit) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, visit);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) visit(full);
  }
}

// A raw control byte makes grep, ripgrep and every code-search tool treat the
// whole file as binary and skip it SILENTLY — no error, just no results. One
// stray NUL in DrawingCanvas.tsx hid 4,025 lines from search, and that file is
// on the path children's work travels. Reviewing what you cannot search is
// guesswork, so this is a security concern, not tidiness.
//
// A written escape is fine: it is plain ASCII in the source and means the same
// thing at runtime. Only the raw byte is banned. Tab, newline and carriage
// return are excluded — they're ordinary whitespace.
function scanForControlBytes(file) {
  const text = readFileSync(file, "utf8");
  const rel = path.relative(process.cwd(), file);
  const control = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/);
  if (!control) return;
  const at = text.indexOf(control[0]);
  const line = text.slice(0, at).split("\n").length;
  const code = `\\x${control[0].charCodeAt(0).toString(16).padStart(2, "0")}`;
  violations.push(
    `${rel}:${line}  raw control byte ${code} — makes this file invisible to grep/rg. Write it as an escape instead.`,
  );
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

walk(APP, scan);
for (const dir of SEARCHABLE) walk(dir, scanForControlBytes);
checkSignInLinksAreGuarded();

// ---------------------------------------------------------------------------
// A sign-in URL may only reach the browser behind signInLinkMayBeShown().
// ---------------------------------------------------------------------------
//
// F19 already has a blocking spec, and it asserts the RULE:
// signInLinkMayBeShown("production") is false. What nothing asserted is that
// any particular action asks it. The pure function can be perfect while a new
// action returns a link without consulting it, and that is exactly the shape
// F19 was in before it was found — an implicit `if` in a server action where no
// gate could see it.
//
// It stopped being hypothetical on 25 August 2026: F61 added a SECOND action
// that mints a single-use URL, for a teacher's password rather than a parent's
// session. `requestPasswordReset` does consult the policy. Nothing would have
// noticed if it had not, and the next one is the one to worry about.
//
// So: any server action that hands a caller a field named `openUrl` must
// mention `signInLinkMayBeShown` in the same file. Deliberately a coarse check —
// it proves the decision is CONSULTED, not that it is obeyed, which is what a
// reviewer is for. Coarse and present beats exact and absent.
function checkSignInLinksAreGuarded() {
  walk(APP, (file) => {
    if (!/\.tsx?$/.test(file)) return;
    const src = readFileSync(file, "utf8");
    if (!/^\s*["']use server["']/m.test(src)) return;
    if (!/\bopenUrl\b/.test(src)) return;
    // The IMPORT, not a mention. A comment saying "callers must put it through
    // signInLinkMayBeShown()" satisfied the first version of this check, which
    // is precisely the sort of gate that reports green over a hole — caught by
    // deleting the guard and watching it stay green.
    if (/import\s*\{[^}]*\bsignInLinkMayBeShown\b[^}]*\}\s*from/.test(src)) return;
    const rel = path.relative(process.cwd(), file);
    violations.push(
      `${rel}  returns an \`openUrl\` without consulting signInLinkMayBeShown(). ` +
        `A sign-in or set-password URL on screen in production is a complete account ` +
        `takeover for anyone who can type somebody's address (FINDINGS F19, F61).`,
    );
  });
}

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
