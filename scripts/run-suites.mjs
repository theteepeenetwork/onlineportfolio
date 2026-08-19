#!/usr/bin/env node
// Run suites in parallel, locally, by giving each lane its own everything.
//
// WHY THIS IS NOT JUST `workers: 4`
//
// The suites share one SQLite database and mutate sessions and rows, so
// `workers: 1` in both configs has to stand: two workers against one database
// would be a flaky security gate, which is worse than a slow one.
//
// What they do NOT share is anything a lane cannot have its own copy of. Both
// configs already derive `baseURL` from `PORT`, so a run started with its own
// PORT and its own DATABASE_URL gets its own dev server, its own database and
// its own seed — the same isolation CI gets from putting each shard on its own
// runner, on one machine instead of several. `--shard` splits by file, so
// nothing is skipped and no test meets a neighbour it did not meet before.
//
// THE POOL IS THE POINT. Four suites sharded three ways is twelve dev servers,
// which on a four-core laptop is slower than running them one at a time. So
// there are exactly LANES lanes, each holding one port, one database and one
// server at a time, and every (suite, shard) job queues for one.
//
// WHY EACH LANE STILL COMPILES, RATHER THAN SHARING ONE `next build`
//
// Building once and running `next start` in every lane is faster — a build is
// 30s and a start is 148ms, against a dev server that lazily compiles each
// route again in every lane. It is also a different application. A production
// build sets NODE_ENV=production, and the product deliberately behaves
// differently there: `signInLinkMayBeShown()` hides a parent's magic-link URL
// outside development, which is the fix for FINDINGS F19 and the reason
// `family.spec.ts` asserts the on-screen link exists. Tests that pass against
// `next dev` and fail against `next start` are the gate doing its job. Speed is
// not worth testing a build nobody ships to a school.
import { spawn, spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

// A dev server is roughly 1.5 GB and compiles on its own core. Three is a
// comfortable default on a four-core machine; PW_SHARDS=1 turns it all off.
const DEFAULT_LANES = Math.max(1, Math.min(3, cpus().length - 1));
export const LANES = Math.max(1, Number(process.env.PW_SHARDS ?? DEFAULT_LANES));
const BASE_PORT = Number(process.env.PW_BASE_PORT ?? 3200);

// A lane's database sits beside the real one and is never it: `dev.db` is what
// somebody's own `npm run dev` is pointed at, and a test run must not reseed the
// class they were in the middle of looking at.
const laneDb = (lane) => `file:./dev-shard-${lane}.db`;
const laneEnv = (lane) => ({
  ...process.env,
  PORT: String(BASE_PORT + lane),
  DATABASE_URL: laneDb(lane),
  // Next refuses to run two dev servers out of one output directory, whatever
  // the port, so each lane compiles into its own (next.config.ts reads this).
  NEXT_DIST_DIR: `.next-lane-${lane}`,
});

function prepareLane(lane) {
  const push = spawnSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: laneEnv(lane),
    encoding: "utf8",
  });
  if (push.status !== 0) {
    process.stderr.write(push.stderr ?? "");
    throw new Error(`could not prepare the database for lane ${lane}`);
  }
}

function runJob(job, lane) {
  const started = Date.now();
  const args = job.shards === 1 ? job.argv : [...job.argv, `--shard=${job.shard}/${job.shards}`];
  return new Promise((resolve) => {
    const child = spawn("npx", args, { env: laneEnv(lane), stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code) => {
      const seconds = (Date.now() - started) / 1000;
      const summary = output.match(/^\s*\d+ (passed|failed|flaky).*$/gm)?.join("  ") ?? "";
      process.stdout.write(`  ${code === 0 ? "✓" : "✖"} ${job.name.padEnd(20)} ${seconds.toFixed(0)}s  ${summary}\n`);
      resolve({ name: job.name, ok: code === 0, output, seconds });
    });
  });
}

/**
 * Run every suite, sharded, through a fixed pool of isolated lanes.
 *
 * @param {{ suite: string, argv: string[] }[]} suites
 * @returns {Promise<{ name: string, ok: boolean, output: string, seconds: number }[]>}
 */
export async function runAll(suites) {
  // `next dev` writes its own output directory into tsconfig's `include`, so
  // three lanes would leave three `.next-lane-N/types` entries behind in a file
  // that is checked in. The lanes are a detail of how the tests ran, not a
  // change to the project, so the file goes back exactly as it was found.
  const tsconfig = readFileSync("tsconfig.json", "utf8");
  try {
    return await runJobs(suites);
  } finally {
    if (readFileSync("tsconfig.json", "utf8") !== tsconfig) writeFileSync("tsconfig.json", tsconfig);
  }
}

async function runJobs(suites) {
  // Biggest suites first: a long job that starts last is a long job everything
  // else waits for.
  const ORDER = ["e2e", "ops", "security", "a11y"];
  const jobs = [];
  for (const { suite, argv } of [...suites].sort((a, b) => ORDER.indexOf(a.suite) - ORDER.indexOf(b.suite))) {
    const shards = Math.min(LANES, suite === "a11y" ? 1 : LANES); // a11y is a minute; splitting it only adds seeds
    for (let shard = 1; shard <= shards; shard += 1) {
      jobs.push({
        suite,
        argv,
        shard,
        shards,
        name: shards === 1 ? suite : `${suite} ${shard}/${shards}`,
      });
    }
  }

  for (let lane = 1; lane <= LANES; lane += 1) prepareLane(lane);

  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: LANES }, (_, n) => {
      const lane = n + 1;
      return (async () => {
        while (next < jobs.length) {
          const job = jobs[next++];
          results.push(await runJob(job, lane));
        }
      })();
    }),
  );
  return results;
}

export function cleanUpLanes() {
  for (let lane = 1; lane <= LANES; lane += 1) {
    for (const suffix of ["", "-journal"]) {
      try {
        rmSync(`prisma/dev-shard-${lane}.db${suffix}`, { force: true });
      } catch {
        /* nothing to remove */
      }
    }
  }
}
