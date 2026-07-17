#!/usr/bin/env node
// Reduced-motion gate. SAFEGUARDING rule 18 requires prefers-reduced-motion to
// be honoured — for a child with vestibular sensitivity, motion is not a
// preference.
//
// This exists because the guard used to be SEVEN @media blocks scattered beside
// the animations they covered, each naming its own selectors. Honouring the rule
// therefore depended on whoever added an animation remembering to walk over and
// add a line to one of seven lists. `.sj-btn-door:hover` shipped with a 3px lift
// and no override — not through carelessness, but because the lists were the
// wrong mechanism.
//
// So: exactly one block, containing a catch-all, and nothing outside it setting
// a duration it can't reach. A new animation is then covered by default.
//
// Checks:
//   1. globals.css has EXACTLY ONE prefers-reduced-motion block.
//   2. That block contains a `*, *::before, *::after` catch-all declaring BOTH
//      animation-duration and transition-duration as !important.
//   3. No animation-duration / transition-duration !important anywhere else in
//      globals.css — i.e. nothing can out-rank the catch-all.
//
// Deliberately NOT checked: that the block is last. Author !important beats a
// later normal declaration regardless of order, so position proves nothing —
// and `@media print` legitimately sits after it.
//
// Usage: node scripts/audit-motion.mjs
import { readFileSync } from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "src/app/globals.css");
const css = readFileSync(FILE, "utf8");
const violations = [];

// --- 1. Exactly one block -------------------------------------------------
const opens = [...css.matchAll(/@media \([^)]*prefers-reduced-motion[^)]*\)\s*\{/g)];
if (opens.length === 0) {
  violations.push("globals.css has NO prefers-reduced-motion block — rule 18 requires one.");
} else if (opens.length > 1) {
  const lines = opens.map((m) => css.slice(0, m.index).split("\n").length);
  violations.push(
    `globals.css has ${opens.length} prefers-reduced-motion blocks (lines ${lines.join(", ")}). ` +
      `There must be exactly ONE — scattered blocks are how .sj-btn-door:hover shipped unguarded. ` +
      `Add your selector to the single block, or rely on its catch-all.`,
  );
}

// Brace-balance the one block so checks 2 and 3 can tell inside from outside.
let block = "";
let blockStart = -1;
let blockEnd = -1;
if (opens.length === 1) {
  blockStart = opens[0].index;
  let i = blockStart + opens[0][0].length;
  let depth = 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  blockEnd = i;
  block = css.slice(blockStart, blockEnd);
}

// --- 2. The catch-all exists and kills both durations ----------------------
if (block) {
  const hasUniversal = /\*\s*,\s*\*::before\s*,\s*\*::after\s*\{/.test(block);
  if (!hasUniversal) {
    violations.push(
      "the prefers-reduced-motion block has no `*, *::before, *::after` catch-all — " +
        "without it, every new animation must be remembered by hand, which is the failure this gate exists to stop.",
    );
  } else {
    const universal = block.slice(block.search(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{/));
    const body = universal.slice(universal.indexOf("{") + 1, universal.indexOf("}"));
    for (const prop of ["animation-duration", "transition-duration"]) {
      if (!new RegExp(`${prop}\\s*:[^;]*!important`).test(body)) {
        violations.push(`the catch-all does not declare \`${prop}\` as !important.`);
      }
    }
    // An infinite animation at 0.01ms flickers instead of stopping — worse than
    // the motion it replaced. This is the check nobody thinks of.
    if (!/animation-iteration-count\s*:[^;]*!important/.test(body)) {
      violations.push(
        "the catch-all does not declare `animation-iteration-count: 1 !important` — " +
          "an infinite animation would then run at 0.01ms per cycle and flicker rather than stop.",
      );
    }
  }
}

// --- 3. Nothing outside can out-rank it -----------------------------------
if (blockStart >= 0) {
  const outside = css.slice(0, blockStart) + css.slice(blockEnd);
  for (const m of outside.matchAll(/(animation-duration|transition-duration)\s*:[^;]*!important/g)) {
    const line = outside.slice(0, m.index).split("\n").length;
    violations.push(
      `globals.css:~${line}  \`${m[0].trim()}\` sits OUTSIDE the reduced-motion block. ` +
        `An !important duration elsewhere can out-rank the guard — move it inside or drop the !important.`,
    );
  }
}

if (violations.length) {
  console.error("✖ Reduced-motion gate failed:\n");
  for (const v of violations) console.error("  • " + v);
  console.error(`\n${violations.length} violation(s). See SAFEGUARDING.md rule 18.`);
  process.exit(1);
}
console.log("✓ Reduced-motion gate passed (one guard, with a catch-all nothing outranks).");
