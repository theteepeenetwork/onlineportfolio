#!/usr/bin/env node
// ---------------------------------------------------------------------------
// One-off remediation: move the seeded demo parent off the bouncing address.
//
// Why a script rather than just the seed change:
//
// `prisma/seed.ts` skips a database that already has data, so that real
// signups and real children's work are never wiped by a redeploy. That guard is
// correct and must stay. It also means the demo parent row was written to the
// production database once, on the very first boot, and editing the seed does
// nothing to the row that is already there. Deploying the seed fix alone would
// leave `parent@home.com` live in production, still reachable from the public
// family sign-in form, still hard-bouncing (Brevo log, 16 August 2026, 14:05,
// "550 Invalid Recipient").
//
// Reseeding with FORCE_SEED=1 would fix it and destroy every real account and
// every child's work in the process. Never do that to production.
//
// So: this. It is deliberately the smallest possible change.
//   - It matches ONE row, by its exact old address.
//   - It updates one column. It creates nothing and deletes nothing.
//   - It leaves the family code, the name and the child links untouched, so the
//     demo carries on working exactly as before.
//   - If the row is absent or already fixed, it reports that and exits cleanly,
//     so it is safe to run twice.
//
// Usage (against whichever database DATABASE_URL points at):
//   node scripts/fix-demo-parent-address.mjs           # show what it would do
//   node scripts/fix-demo-parent-address.mjs --apply   # actually change it
// ---------------------------------------------------------------------------

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const OLD = "parent@home.com";
const NEW = "demo-parent@storyjar.co.uk";

const apply = process.argv.includes("--apply");
const db = new PrismaClient();

try {
  const rows = await db.parent.findMany({
    where: { email: OLD },
    select: { id: true, name: true, familyCode: true },
  });

  if (rows.length === 0) {
    const already = await db.parent.count({ where: { email: NEW } });
    console.log(
      already > 0
        ? `Nothing to do: no parent on ${OLD}, and ${already} already on ${NEW}.`
        : `Nothing to do: no parent row with the address ${OLD}.`,
    );
    process.exit(0);
  }

  console.log(`Found ${rows.length} parent row(s) on ${OLD}:`);
  for (const r of rows) console.log(`  ${r.name} (family code ${r.familyCode})`);

  if (!apply) {
    console.log(`\nDry run. Re-run with --apply to change the address to ${NEW}.`);
    console.log("Nothing else about the row is touched.");
    process.exit(0);
  }

  const result = await db.parent.updateMany({ where: { email: OLD }, data: { email: NEW } });
  console.log(`\nUpdated ${result.count} row(s) to ${NEW}.`);
  console.log("Family code, name and child links are unchanged.");
  console.log(`Reminder: ${NEW} needs a forwarding alias on storyjar.co.uk,`);
  console.log("or it will reject mail and we are back to a hard bounce.");
} finally {
  await db.$disconnect();
}
