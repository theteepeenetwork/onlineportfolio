#!/usr/bin/env node
// Run the suites THIS branch's changes actually need, and no others.
//
//   npm run test:changed              against origin/main
//   npm run test:changed -- --base HEAD~3
//
// The selection rules live in scripts/select-suites.mjs, which CI uses too, so
// what you run here is what the PR will run. `npm run test:gate` still runs
// everything and is still what to reach for when you are unsure — this is for
// the loop in between, where waiting on the operator door to prove a change to
// a teacher's register is just waiting.
import { execFileSync, spawnSync } from "node:child_process";
import { COMMANDS, SUITES, selectSuites } from "./select-suites.mjs";

const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base");
const base = baseFlag >= 0 ? args[baseFlag + 1] : "origin/main";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

let files = [];
try {
  // Committed on the branch, plus anything still in the working tree, because
  // the point is to check what you are about to push, not what you last pushed.
  const merged = new Set([
    ...git("diff", "--name-only", `${base}...HEAD`).split("\n"),
    ...git("diff", "--name-only", "HEAD").split("\n"),
    ...git("ls-files", "--others", "--exclude-standard").split("\n"),
  ]);
  files = [...merged].filter(Boolean);
} catch {
  console.error(
    `[test:changed] could not diff against "${base}". Fetch it, or pass --base <ref>. ` +
      `Running the whole gate instead, which is the safe way to be wrong.`,
  );
  files = ["unknown"];
}

const picked = selectSuites(files);
const chosen = SUITES.filter((s) => picked[s]);

console.log(`\n[test:changed] ${files.length} changed file(s) since ${base}`);
console.log(`[test:changed] ${chosen.length ? chosen.join(", ") : "nothing to run"} — ${picked.reason}\n`);

if (!chosen.length) process.exit(0);

// The static gates are cheap and catch the breakage that used to take three
// suites down at once, so they run whatever else does.
const check = spawnSync("npm", ["run", "check"], { stdio: "inherit" });
if (check.status !== 0) process.exit(check.status ?? 1);

let failed = false;
for (const suite of chosen) {
  const [bin, ...rest] = COMMANDS[suite];
  console.log(`\n[test:changed] ── ${suite} ─────────────────────────────────`);
  const run = spawnSync("npx", [bin, ...rest], { stdio: "inherit" });
  if (run.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
