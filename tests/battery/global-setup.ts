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
  // Bring THIS run's database up to the committed schema before seeding it.
  //
  // scripts/run-suites.mjs pushes to each lane's own `dev-shard-N.db` and
  // deliberately never touches `prisma/dev.db`, because that is the database
  // somebody's own `npm run dev` is pointed at. Nothing else pushes to it. So a
  // developer running ONE spec directly — no lanes, DATABASE_URL from `.env` —
  // gets a database that is a schema behind, and the seed below fails on a table
  // that does not exist yet. It reads as a broken branch; it is a missing push.
  //
  // Here rather than in the runner because this is the hook every battery run
  // goes through, lanes or not. It is a no-op for a lane, whose schema
  // `prepareLane` has already pushed.
  //
  // `--skip-generate` because the runner generates once up front and a direct
  // run does not need twelve of them; if the CLIENT is stale rather than the
  // database, the answer is `npx prisma generate` (F54).
  //
  // This does not widen what a battery run destroys: the seed on the next line
  // already reseeds whatever database it is pointed at.
  console.log("[battery] Bringing the database up to the committed schema …");
  execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit" });

  console.log("\n[battery] Reseeding to two-tenant fixtures …");
  execSync("npx tsx prisma/seed-test.ts", {
    stdio: "inherit",
    env: { ...process.env, FORCE_SEED: "1", MAIL_HMAC_KEY: BATTERY_MAIL_HMAC_KEY },
  });

  // The user-tester team's own school (Bramblewood Primary), appended after the
  // fixtures above. It is separate for one reason: the personas WRITE. They
  // invite and remove staff, delete a class, return work, rotate codes and hand
  // pupils on to the next year. Pointed at St Bede's or Oakfield they would take
  // the security and a11y gates' fixtures apart, and the first thing anyone
  // would see is an unrelated suite going red.
  //
  // Seeded for EVERY battery run, not only the personas project, so that a
  // developer running one suite never gets a database the next suite cannot use.
  // It appends; it deletes nothing outside its own school.
  console.log("[battery] Appending the tester team's school …");
  execSync("npx tsx prisma/seed-personas.ts", { stdio: "inherit" });
}

