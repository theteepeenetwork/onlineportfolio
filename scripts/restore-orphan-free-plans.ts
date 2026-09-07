#!/usr/bin/env npx tsx
// Give every schoolless teacher who has no subscription their free plan back.
//
// WHAT WENT WRONG. `Subscription` is the only thing that answers "may this
// account write". Until today `removeStaff` set `Teacher.schoolId` to NULL and
// created nothing, and signup was the only place a FREE row was ever written —
// so a teacher who was invited into a school from scratch (and therefore never
// had one) or who joined through `joinSchoolPlan` (which deletes it on the way
// in) came out of a removal with no governing subscription at all.
//
// The write gate then denies by default, which is right (SAFEGUARDING rule 8),
// but `accountStateForTeacher` reports status "NONE", the frozen banner tests
// for "FROZEN" and so never renders, and the plan label reads "No plan yet".
// The teacher sees a working app in which every save fails and nothing on
// screen says why. That is worse than being frozen.
//
// `removeStaff` is fixed, and a fix going forward does not reach anyone it has
// already happened to. This does. Run it ONCE at the deploy that carries the
// fix; it is safe to run again at any time.
//
// Usage:  npx tsx scripts/restore-orphan-free-plans.ts
//         npx tsx scripts/restore-orphan-free-plans.ts --dry-run
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// The same row `restoreFreePlan` writes (src/lib/billing.ts): FREE, ACTIVE, and
// a NULL `trialEndsAt`, which is what encodes "nothing to lapse" — a teacher's
// own plan has no clock and no route to FROZEN.
//
// WRITTEN OUT HERE RATHER THAN IMPORTED, and that is not an oversight worth
// tidying: `src/lib/billing.ts` starts with `import "server-only"`, a module
// whose whole job is to THROW when it is loaded outside a React Server
// Component. A plain script importing it dies on the import line. The three
// values are asserted against the running product by
// tests/battery/security/removed-staff-keep-a-free-plan.spec.ts, so a drift
// between here and there is caught by a blocking gate rather than by a teacher.
const FREE_TEACHER_PLAN = { kind: "FREE", status: "ACTIVE", trialEndsAt: null, frozenAt: null };

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Teachers who belong to no school AND hold no subscription of their own.
  // Both halves matter: a teacher inside a school is governed by the school's
  // row and is not stranded, and a teacher who already has a free plan needs
  // nothing done to them.
  const orphans = await db.teacher.findMany({
    where: { schoolId: null, subscription: null },
    // The id ONLY. The address is never printed (see the log line below), so
    // selecting it would put an adult's email in this process's memory for no
    // purpose — SAFEGUARDING rule 13 reads on what is handled, not only on what
    // is written out.
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (orphans.length === 0) {
    console.log("[restore-orphan-free-plans] Nothing to do: every schoolless teacher has a plan.");
    return;
  }

  console.log(
    `[restore-orphan-free-plans] ${orphans.length} teacher(s) have no governing subscription${
      dryRun ? " (dry run, writing nothing)" : ""
    }.`,
  );

  let restored = 0;
  for (const teacher of orphans) {
    // Upserted, not created, for the same reason `restoreFreePlan` upserts: it
    // makes a second run of this script a no-op rather than a constraint error,
    // and two copies running at once cannot race each other into one.
    if (!dryRun) {
      await db.subscription.upsert({
        where: { teacherId: teacher.id },
        create: { ...FREE_TEACHER_PLAN, teacherId: teacher.id },
        update: { ...FREE_TEACHER_PLAN },
      });
    }
    restored += 1;
    // The id, never the address. This runs against production and its output
    // goes wherever deploy logs go (SAFEGUARDING rule 13, safeLog).
    console.log(`  ${dryRun ? "would restore" : "restored"} free plan for teacher ${teacher.id}`);
  }

  console.log(
    `[restore-orphan-free-plans] ${dryRun ? "Would restore" : "Restored"} ${restored} free plan(s).`,
  );
}

main()
  .catch((err) => {
    console.error("[restore-orphan-free-plans] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
