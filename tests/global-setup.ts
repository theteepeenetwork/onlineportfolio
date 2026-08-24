import { execSync } from "node:child_process";

// Reset the database to the clean demo class (Sunflower Class, teacher
// teacher@school.uk / password, code SUN234) before the test suite runs, so
// every run starts from the same known state.
export default async function globalSetup() {
  console.log("\n[tests] Reseeding the database to the demo state…");
  // Bring the schema up to date BEFORE seeding, or a run on a branch that adds a
  // column fails on the seed with a message about the column rather than about
  // the schema — which reads as a broken branch instead of a stale database.
  //
  // This is the third place the same gap has been found in one day, and the
  // three together are the reason it is written here rather than fixed narrowly
  // again: `scripts/run-suites.mjs` pushes to each LANE's own shard database and
  // deliberately never touches this one; `tests/battery/global-setup.ts` gained
  // its push earlier today for the direct battery path; and this file, which is
  // what plain `npm run test:e2e` and therefore `npm run test:gate` run, still
  // had none. Each fix covered the path its author happened to be standing on.
  //
  // It destroys nothing that was not already being destroyed: the seed on the
  // next line runs with FORCE_SEED and wipes-and-reseeds the same database.
  execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit" });
  // The seed is idempotent in production (it skips a populated database so real
  // data is never wiped). Tests need a *clean* known state every run, so force
  // it to wipe-and-reseed.
  execSync("npm run db:seed", { stdio: "inherit", env: { ...process.env, FORCE_SEED: "1" } });
}
