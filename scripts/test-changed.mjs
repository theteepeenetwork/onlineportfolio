#!/usr/bin/env node
// Run the suites THIS branch's changes actually need, in parallel, and no others.
//
//   npm run test:changed                 against origin/main
//   npm run test:changed -- --base HEAD~3
//   npm run test:changed -- --all        every suite, still parallel
//   PW_SHARDS=1 npm run test:changed     one at a time, on a small machine
//
// Two ideas, both of which have to hold for this to be quick:
//
//   WHAT to run — scripts/select-suites.mjs, the same rules the PR will use, so
//   what you run here is what CI runs there.
//
//   HOW to run it — scripts/run-suites.mjs, which gives each shard its own port,
//   its own dev server and its own database. The suites cannot share a database
//   between workers, but they can each have one.
//
// `npm run test:gate` still runs everything the old way and is still what to
// reach for when you are unsure.
import { execFileSync, spawnSync } from "node:child_process";
import { COMMANDS, SUITES, selectSuites } from "./select-suites.mjs";
import { LANES, cleanUpLanes, runAll } from "./run-suites.mjs";

const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base");
const base = baseFlag >= 0 ? args[baseFlag + 1] : "origin/main";
const everything = args.includes("--all");

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

let picked;
if (everything) {
  picked = { security: true, a11y: true, e2e: true, ops: true, reason: "--all" };
} else {
  let files = [];
  try {
    // Committed on the branch, plus anything still in the working tree, because
    // the point is what you are about to push, not what you last pushed.
    files = [
      ...new Set([
        ...git("diff", "--name-only", `${base}...HEAD`).split("\n"),
        ...git("diff", "--name-only", "HEAD").split("\n"),
        ...git("ls-files", "--others", "--exclude-standard").split("\n"),
      ]),
    ].filter(Boolean);
  } catch {
    console.error(
      `[test:changed] could not diff against "${base}". Fetch it, or pass --base <ref>. ` +
        `Running everything instead, which is the safe way to be wrong.`,
    );
    files = ["unclassified"];
  }
  picked = selectSuites(files);
}

const chosen = SUITES.filter((s) => picked[s]);
console.log(`\n[test:changed] ${chosen.join(", ") || "nothing to run"} — ${picked.reason}`);
if (!chosen.length) process.exit(0);
console.log(`[test:changed] ${LANES} lane(s), each with its own port, dev server and database\n`);

// The static gates are a couple of seconds and catch the class of breakage that
// used to take three suites down at once, so they run whatever else does.
const check = spawnSync("npm", ["run", "check"], { stdio: "inherit" });
if (check.status !== 0) process.exit(check.status ?? 1);
console.log("");

const started = Date.now();
const results = await runAll(chosen.map((suite) => ({ suite, argv: COMMANDS[suite] })));
cleanUpLanes();

const failed = results.filter((r) => !r.ok);
console.log(`\n[test:changed] ${((Date.now() - started) / 1000 / 60).toFixed(1)} min wall-clock`);

if (failed.length) {
  for (const f of failed) {
    console.log(`\n───── ${f.name} ─────`);
    process.stdout.write(f.output);
  }
  console.log(`\n[test:changed] ✖ ${failed.map((f) => f.name).join(", ")}`);
  // `process.exitCode`, NOT `process.exit()`. Writes to a pipe are asynchronous,
  // and `process.exit()` does not wait for them: piped into `tee`, a log file or
  // a CI step, the failure report above is cut off at 64KB — measured — and a
  // failing e2e shard alone prints more than that. What is lost is the end,
  // including the ✖ line naming the suites, so a red run can read as a run that
  // stopped mid-sentence. Setting the code and falling off the end of the script
  // exits 1 just the same, after Node has flushed everything.
  process.exitCode = 1;
} else {
  console.log("[test:changed] ✓ everything this change needs is green");
}
