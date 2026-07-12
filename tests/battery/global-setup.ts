import { execSync } from "node:child_process";

// Reseed the database to the TWO-tenant fixtures (School A = St Bede's demo,
// School B = Oakfield) before the battery runs, so cross-tenant isolation has
// something to isolate. Fictional data only — never point this at real pupils.
export default async function globalSetup() {
  console.log("\n[battery] Reseeding to two-tenant fixtures …");
  execSync("npx tsx prisma/seed-test.ts", { stdio: "inherit", env: { ...process.env, FORCE_SEED: "1" } });
}
