import { execSync } from "node:child_process";

// Reset the database to the clean demo class (Sunflower Class, teacher
// teacher@school.uk / password, code SUN123) before the test suite runs, so
// every run starts from the same known state.
export default async function globalSetup() {
  console.log("\n[tests] Reseeding the database to the demo state…");
  execSync("npm run db:seed", { stdio: "inherit" });
}
