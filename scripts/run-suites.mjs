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
import { createServer } from "node:net";
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

const lanePort = (lane) => BASE_PORT + lane;

// Is anything already holding a lane's port? Asked by BINDING it rather than by
// asking it for a page: a dev server that is still compiling holds the port
// without answering HTTP, so an HTTP probe reports "free" for the case that
// matters most.
function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

/**
 * Refuse to run against a server this runner did not start.
 *
 * Both configs set `reuseExistingServer: true`, which is right for a person
 * running one spec against their own `npm run dev`, and wrong here: a lane
 * hands Playwright a PORT, and if something is already on it Playwright adopts
 * it and never starts the lane's own. The lane's DATABASE_URL still points at
 * `dev-shard-N.db`, so the setup wipes and seeds one database while every
 * request is answered by a server reading another. Two ways that bites:
 *
 *   - Somebody is running `PORT=3201 npm run dev` on `prisma/dev.db`. The suite
 *     then drives THEIR database — and the persona journeys delete staff,
 *     classes and access — so the cost of getting this wrong is their own data,
 *     not a red test.
 *   - A second lane run is already going (two agents on one tree, which
 *     `docs/agent-fleet.md` describes). It owns these ports and these shard
 *     databases, and each run's setup reseeds under the other's feet. Every
 *     symptom is a timeout somewhere unrelated.
 *
 * Neither is distinguishable from a slow machine once the output arrives, so
 * this stops before the run rather than explaining afterwards.
 */
async function claimLanePorts() {
  const taken = [];
  for (let lane = 1; lane <= LANES; lane += 1) {
    if (!(await portIsFree(lanePort(lane)))) taken.push(lanePort(lane));
  }
  if (!taken.length) return;
  throw new Error(
    `lane port${taken.length > 1 ? "s" : ""} ${taken.join(", ")} already in use.\n\n` +
      `  A lane starts its own dev server. Something is already on that port, and because\n` +
      `  both Playwright configs reuse an existing server, this run would test whatever is\n` +
      `  there — against a database it did not seed.\n\n` +
      `  If it is a leftover lane server:  pkill -f "next dev"\n` +
      `  If it is another battery run:     let it finish; they share these ports.\n` +
      `  If it is your own dev server:     move it, or set PW_BASE_PORT to another block.\n`,
  );
}

function prepareLane(lane) {
  // Start from a database file that does not exist rather than one left behind
  // by an interrupted run. The seeds force a wipe either way, so this is not
  // about stale ROWS; it is about a file whose schema belongs to whichever
  // branch was last checked out, which `db push --accept-data-loss` then has to
  // reconcile instead of simply creating. Cheap, and it removes the "stale
  // database that reads as a broken branch" class in F56 for the lane path.
  //
  // The `.next-lane-N` build caches are deliberately NOT cleared: measured on
  // 2026-08-24, the same 29 specs took 33.2s cold and 30.4s against a warm
  // server and warm cache, so deleting them costs a full recompile per lane and
  // buys nothing. Clearing them stays the manual step AGENTS.md describes.
  removeLaneDb(lane);
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
  const restore = () => {
    if (readFileSync("tsconfig.json", "utf8") !== tsconfig) writeFileSync("tsconfig.json", tsconfig);
  };
  // Also on the way out under a Ctrl-C or a kill, because the window where the
  // file is wrong is the window somebody is most likely to `git add -A` in.
  process.once("SIGINT", restore);
  process.once("SIGTERM", restore);
  process.once("exit", restore);
  try {
    return await runJobs(suites);
  } finally {
    restore();
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

  // Before anything is generated, pushed or seeded: the lanes' ports have to be
  // ours. First because everything below WRITES — a run that is going to refuse
  // should refuse before it has reseeded three databases.
  await claimLanePorts();

  // Regenerate the Prisma client ONCE, before any lane touches a database.
  //
  // `prepareLane` below runs `db push --skip-generate` per lane, and that flag is
  // right: three lanes each regenerating is waste, and `postinstall` has usually
  // done it already. What it is not is sufficient. On the first run after a
  // schema change the lanes get the new TABLE and the client is left not knowing
  // the model exists — so `db.establishment` is undefined at typecheck and at
  // runtime while the column sits there in every shard database. It presents as
  // `Property 'establishment' does not exist on type 'PrismaClient'`, which reads
  // like a broken branch rather than a stale artefact, and the obvious next move
  // — run the battery — is the very thing that pushed the schema without the
  // client. Costs a couple of seconds once per run (F54).
  const generated = spawnSync("npx", ["prisma", "generate"], { encoding: "utf8" });
  if (generated.status !== 0) {
    process.stderr.write(generated.stderr ?? "");
    throw new Error("could not generate the Prisma client");
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

// One lane's database and everything SQLite keeps beside it. `-wal` and `-shm`
// matter as much as the file itself: leaving a write-ahead log next to a deleted
// database is how a fresh file comes back holding the last run's pages.
function removeLaneDb(lane) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    try {
      rmSync(`prisma/dev-shard-${lane}.db${suffix}`, { force: true });
    } catch {
      /* nothing to remove */
    }
  }
}

export function cleanUpLanes() {
  for (let lane = 1; lane <= LANES; lane += 1) removeLaneDb(lane);
}
