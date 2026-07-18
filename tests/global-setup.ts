import { execSync } from "node:child_process";

// Reset the database to the clean demo class (Sunflower Class, teacher
// teacher@school.uk / password, code SUN234) before the test suite runs, so
// every run starts from the same known state.
export default async function globalSetup() {
  console.log("\n[tests] Reseeding the database to the demo state…");
  // The seed is idempotent in production (it skips a populated database so real
  // data is never wiped). Tests need a *clean* known state every run, so force
  // it to wipe-and-reseed.
  execSync("npm run db:seed", { stdio: "inherit", env: { ...process.env, FORCE_SEED: "1" } });
}
