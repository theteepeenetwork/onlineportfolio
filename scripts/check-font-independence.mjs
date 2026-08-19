#!/usr/bin/env node
// The build must not depend on somebody else's CDN being up.
//
// FINDINGS F28: `next/font/google` downloads a typeface during `next build`, so
// fonts.gstatic.com sat on the critical path of every build and every deploy. A
// 404 or an outage there failed the build outright, which took out a CI job on
// 2026-08-17 and would equally have failed a production deploy at any hour.
//
// The fonts are now vendored in src/app/fonts with their licences. This gate
// exists so that stays true: reaching for `next/font/google` again is a one-line
// change that would reopen the finding silently, and nothing else in the build
// would complain until the day it mattered.
//
// It matches IMPORTS only, so the prose in layout.tsx and in
// src/app/fonts/README.md explaining why this rule exists does not trip it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const CODE = /\.(ts|tsx|js|jsx|mjs)$/;
// `from "next/font/google"` or `require("next/font/google")`, in either quote.
const IMPORT = /(?:from\s*|require\(\s*)["']next\/font\/google["']/;

const offenders = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (CODE.test(entry) && IMPORT.test(readFileSync(full, "utf8"))) {
      offenders.push(path.relative(ROOT, full));
    }
  }
};
walk(SRC);

if (offenders.length) {
  console.error("✖ Font independence gate FAILED:\n");
  for (const f of offenders) console.error(`  ${f} imports next/font/google.`);
  console.error(
    "\nThat fetches the typeface at BUILD time, so an outage at fonts.gstatic.com\n" +
      "fails the build and blocks the deploy (FINDINGS F28). The fonts are vendored\n" +
      "in src/app/fonts; use next/font/local and add the file there instead.",
  );
  process.exit(1);
}

console.log("✓ Font independence gate passed (no build-time font fetch; typefaces are vendored in src/app/fonts).");
