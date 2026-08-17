import { execSync } from "node:child_process";
import { BATTERY_MAIL_HMAC_KEY } from "./mailHmacFixtureKey";

// Reseed the database to the TWO-tenant fixtures (School A = St Bede's demo,
// School B = Oakfield) before the battery runs, so cross-tenant isolation has
// something to isolate. Fictional data only — never point this at real pupils.
//
// MAIL_HMAC_KEY is passed through because the seed hashes its fixture email
// addresses into MailSuppression labels, and the running app hashes the address
// an operator types in order to compare it (PR5). Two different keys would
// produce two different labels for one address, the seeded suppression would
// match nothing, and the mail specs would fail for a reason that has nothing to
// do with the code. The same constant is set on the dev server in
// playwright.battery.config.ts.
export default async function globalSetup() {
  console.log("\n[battery] Reseeding to two-tenant fixtures …");
  execSync("npx tsx prisma/seed-test.ts", {
    stdio: "inherit",
    env: { ...process.env, FORCE_SEED: "1", MAIL_HMAC_KEY: BATTERY_MAIL_HMAC_KEY },
  });
}
