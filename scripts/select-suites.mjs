#!/usr/bin/env node
// Which suites does THIS change actually need?
//
// The battery is the executable form of SAFEGUARDING.md and none of it is
// optional. What is optional is running all of it against a change that cannot
// possibly have touched it. This module is the single place that decides, and
// it is used by two callers so the rule can never drift between them:
//
//   .github/workflows/battery.yml   picks which blocking jobs to run on a PR
//   npm run test:changed            runs the same set locally, before you push
//
// THE SAFETY NET, STATED FIRST BECAUSE IT IS WHAT MAKES THIS SAFE
//
// Selection applies to PRs only. Every push to `main` runs everything, and so
// does the nightly. So the worst a wrong rule here can do is let something
// through to a red `main` run minutes later — not never. Add `full-battery` as
// a label on a PR and it runs the lot too.
//
// Two more things keep it honest:
//   • Deny by default. A path this file does not recognise selects EVERYTHING.
//     New directories are therefore safe on the day they appear, and get
//     narrowed on purpose, by someone reading this comment.
//   • The one non-obvious claim it makes — that a change under src/components
//     or src/app/teacher cannot affect the operator screens — is not a hope. It
//     is what scripts/check-ops-blindness.mjs enforces, deny-by-default, on
//     every PR: ops code may import @/lib/ops/* and exactly five other local
//     modules, named below. `assertOpsAllowlistUnchanged` re-reads that gate and
//     refuses to narrow anything if the list has moved.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The suites a change can select. `static` is not here: the static gates cost
// about a minute for the whole repository and catch the class of breakage that
// used to take three suites down at once, so they always run.
export const SUITES = ["security", "a11y", "e2e", "ops"];

// ---------------------------------------------------------------------------
// The five non-ops modules operator code is allowed to import.
//
// Read from the gate rather than remembered, because the whole narrowing rests
// on this list being complete. If the gate's allowlist grows and this file has
// not been updated, we do not quietly under-select: we select everything and
// say why.
// ---------------------------------------------------------------------------
const OPS_SHARED_MODULES = [
  "@/lib/billing-plans",
  "@/lib/rateLimit",
  "@/lib/stripeMode",
  "@/lib/familyCodeMint",
  "@/lib/mailStatus",
  // Added alongside the PR5 widening in check-ops-blindness.mjs: the HMAC
  // helper moved out of @/lib/ops/ so the in-app scheduler can call it
  // without entering the ops import scan.
  "@/lib/mailHmac",
];

function opsAllowlistMatchesTheGate() {
  try {
    const gate = readFileSync(path.join(ROOT, "scripts/check-ops-blindness.mjs"), "utf8");
    // The gate's own ALLOWED_LOCAL_IMPORTS array, read as declared. Scoped to
    // the array rather than to the whole file, because that file names other
    // modules in prose — including the two it explains at length for NOT being
    // on the list.
    const block = /const ALLOWED_LOCAL_IMPORTS\s*=\s*\[([\s\S]*?)\n\];/.exec(gate);
    if (!block) return false;
    const named = new Set(
      [...block[1].matchAll(/^\s*"(@\/[A-Za-z0-9/_-]+)",/gm)].map((m) => m[1]),
    );
    if (named.size !== OPS_SHARED_MODULES.length) return false;
    return OPS_SHARED_MODULES.every((m) => named.has(m));
  } catch {
    return false;
  }
}

const opsSharedPaths = new Set(OPS_SHARED_MODULES.map((m) => `src/lib/${m.slice("@/lib/".length)}.ts`));

// ---------------------------------------------------------------------------
// The rules, most specific first.
// ---------------------------------------------------------------------------
const isProse = (f) =>
  f.endsWith(".md") ||
  f.endsWith(".zip") ||
  f === "LICENSE" ||
  f.startsWith("docs/") ||
  f.startsWith("Context/") ||
  f.startsWith("Themeing/");

// Anything every suite stands on: the schema and fixtures they all seed from,
// the harness itself, the dependency tree, the global stylesheet and root
// layout that render inside every page, and the tooling that runs any of it.
const isFoundation = (f) =>
  f.startsWith("prisma/") ||
  f.startsWith("scripts/") ||
  f.startsWith(".github/") ||
  f === "package.json" ||
  f === "package-lock.json" ||
  f === "src/app/globals.css" ||
  f === "src/app/layout.tsx" ||
  f === "src/middleware.ts" ||
  f === "src/lib/db.ts" ||
  f === "src/lib/auth.ts" ||
  /^(next\.config|tsconfig|postcss\.config|eslint\.config|playwright[\w.]*\.config|lighthouserc)\./.test(f) ||
  /^tests\/(battery\/)?(helpers|global-setup)\.ts$/.test(f) ||
  /^tests\/battery\/(stripeFixtureKey|mailHmacFixtureKey)\.ts$/.test(f);

const isOps = (f) =>
  f.startsWith("src/app/ops/") ||
  f.startsWith("src/app/actions/ops/") ||
  f.startsWith("src/lib/ops/") ||
  /^tests\/battery\/(security|a11y)\/ops-/.test(f);

// The product a child, a teacher, a parent or a school admin touches. Operator
// code cannot import any of it (see the allowlist above), so it cannot move the
// operator screens.
const isApp = (f) =>
  f.startsWith("src/app/") ||
  f.startsWith("src/components/") ||
  f.startsWith("src/lib/") ||
  f.startsWith("public/") ||
  f.startsWith("content/") ||
  f.startsWith("tests/e2e/") ||
  f.startsWith("tests/battery/security/") ||
  f.startsWith("tests/battery/a11y/") ||
  f.startsWith("tests/battery/ux/") ||
  f.startsWith("tests/battery/personas/") ||
  f.startsWith("tests/battery/findings/") ||
  f.startsWith("tests/fixtures/");

const ALL = Object.freeze({ security: true, a11y: true, e2e: true, ops: true });
const NONE = Object.freeze({ security: false, a11y: false, e2e: false, ops: false });

/**
 * @param {string[]} files paths relative to the repository root
 * @returns {{ security: boolean, a11y: boolean, e2e: boolean, ops: boolean, reason: string }}
 */
export function selectSuites(files) {
  if (!files.length) return { ...NONE, reason: "nothing changed" };

  if (!opsAllowlistMatchesTheGate()) {
    return {
      ...ALL,
      reason:
        "the ops import allowlist in check-ops-blindness.mjs no longer matches the one this selector was written against, so nothing is narrowed",
    };
  }

  const picked = { security: false, a11y: false, e2e: false, ops: false };
  const why = new Set();

  for (const f of files) {
    if (isProse(f)) continue;

    if (isFoundation(f)) return { ...ALL, reason: `${f} is under every suite` };

    // The five shared modules are the one place both sides meet: the operator
    // screens are allowed to import them, and the product already did. A change
    // there selects BOTH, which is the whole reason they are enumerated rather
    // than pattern-matched.
    if (opsSharedPaths.has(f)) {
      picked.ops = picked.security = picked.a11y = picked.e2e = true;
      why.add("a module the product and the operator screens both import");
      continue;
    }

    if (isOps(f)) {
      picked.ops = true;
      why.add("operator code or its specs");
      continue;
    }

    if (isApp(f)) {
      picked.security = picked.a11y = picked.e2e = true;
      why.add("product code or its specs");
      continue;
    }

    // Deny by default: a path nobody has classified is a path nobody has
    // thought about, and guessing is how a gate stops covering something.
    return { ...ALL, reason: `${f} is not classified, so nothing is narrowed` };
  }

  const nothing = SUITES.every((s) => !picked[s]);
  return {
    ...picked,
    reason: nothing ? "prose only" : [...why].join(" + "),
  };
}

// How each selected suite is run. The ops specs are split out by a path filter
// rather than by project, so `--project=security` still means the whole security
// project everywhere else (in CI on main, in `npm run test:gate`, in anybody's
// terminal) and cannot quietly come to mean less than it says.
export const COMMANDS = {
  security: ["playwright", "test", "-c", "playwright.battery.config.ts", "--project=security", "security/(?!ops-)"],
  a11y: ["playwright", "test", "-c", "playwright.battery.config.ts", "--project=a11y", "a11y/(?!ops-)"],
  e2e: ["playwright", "test"],
  ops: [
    "playwright",
    "test",
    "-c",
    "playwright.battery.config.ts",
    "--project=security",
    "--project=a11y",
    "(security|a11y)/ops-",
  ],
};

// ---------------------------------------------------------------------------
// Self-test
//
// This file decides what runs. A rule that has quietly stopped meaning what it
// says is worse here than anywhere else in the repository, because its failure
// mode is silence: suites that no longer run, on a PR that goes green. So it is
// checked by `npm run check`, in the same breath as the gates it selects.
// ---------------------------------------------------------------------------
const CASES = [
  { files: [], want: [], why: "no change selects nothing" },
  { files: ["README.md", "docs/DPIA.md"], want: [], why: "prose selects nothing" },
  {
    files: ["src/app/teacher/page.tsx", "src/components/Avatar.tsx"],
    want: ["security", "a11y", "e2e"],
    why: "product code cannot reach the operator screens (the import allowlist forbids it)",
  },
  { files: ["src/app/ops/page.tsx"], want: ["ops"], why: "operator code selects the operator specs" },
  { files: ["src/lib/ops/reads.ts"], want: ["ops"], why: "so does the operator library" },
  {
    files: ["tests/battery/a11y/ops-reads-a11y.spec.ts"],
    want: ["ops"],
    why: "and so do the operator specs themselves",
  },
  {
    files: ["src/lib/rateLimit.ts"],
    want: ["security", "a11y", "e2e", "ops"],
    why: "a shared module selects BOTH sides — the case that makes the allowlist worth enumerating",
  },
  { files: ["prisma/seed-test.ts"], want: ["security", "a11y", "e2e", "ops"], why: "fixtures are under everything" },
  { files: ["tests/battery/helpers.ts"], want: ["security", "a11y", "e2e", "ops"], why: "so is the harness" },
  { files: ["package-lock.json"], want: ["security", "a11y", "e2e", "ops"], why: "so is the dependency tree" },
  {
    files: ["src/somewhere/nobody/classified.ts"],
    want: ["security", "a11y", "e2e", "ops"],
    why: "deny by default: an unclassified path narrows nothing",
  },
  {
    files: ["README.md", "src/app/ops/page.tsx"],
    want: ["ops"],
    why: "prose alongside code does not widen or narrow it",
  },
];

function runSelfTest() {
  const failures = [];

  if (!opsAllowlistMatchesTheGate()) {
    failures.push(
      "the ops import allowlist read from scripts/check-ops-blindness.mjs does not match OPS_SHARED_MODULES. " +
        "Selection is falling back to everything, which is safe but means this file has stopped narrowing anything. " +
        "Update OPS_SHARED_MODULES to match the gate.",
    );
  }

  for (const c of CASES) {
    const got = SUITES.filter((s) => selectSuites(c.files)[s]);
    if (got.join() !== c.want.join()) {
      failures.push(
        `${JSON.stringify(c.files)} selected [${got.join(", ")}], expected [${c.want.join(", ")}] — ${c.why}`,
      );
    }
  }

  if (failures.length) {
    console.error("✖ Suite-selection gate failed:\n");
    for (const f of failures) console.error("  • " + f);
    process.exit(1);
  }
  console.log(
    `✓ Suite-selection gate passed (${CASES.length} cases; the ops import allowlist still matches the blindness gate).`,
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    process.exit(0);
  }
  const files = process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--"))
    .flatMap((a) => a.split("\n"))
    .map((s) => s.trim())
    .filter(Boolean);

  const picked = selectSuites(files);
  const line = SUITES.map((s) => `${s}=${picked[s]}`).join("\n");

  if (process.argv.includes("--github")) {
    process.stdout.write(`${line}\nreason=${picked.reason}\n`);
  } else {
    console.log(JSON.stringify(picked, null, 2));
  }
  console.error(
    `[select-suites] ${files.length} changed file(s) → ` +
      `${SUITES.filter((s) => picked[s]).join(", ") || "no suites"} (${picked.reason})`,
  );
}
