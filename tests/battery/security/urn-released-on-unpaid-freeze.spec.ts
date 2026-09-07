import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loginTeacher } from "../helpers";
import { SCHOOL_URN_RELEASED, sweepFrozenUnverifiedUrns } from "../../../src/lib/urnRelease";

// ===========================================================================
// AN UNPAID SCHOOL GIVES ITS REGISTER CLAIM BACK
//
// Owner decision, docs/dpo-decisions.md 2 September 2026. Raising a purchase
// order costs the person raising it nothing up front and signup verifies no
// email address (F67), so anybody could claim any school in the DfE register —
// and until this change NOTHING EVER RELEASED THE CLAIM. An unpaid school
// lapsed to FROZEN and held that register entry for ever, with no operator
// action to clear one. Repeatable across the whole country, at no cost.
//
// TWO ASSERTIONS, AND THE SECOND IS THE ONE THAT WILL ROT FIRST:
//
//   1. An UNVERIFIED school that freezes loses its `urn`, and says so in the
//      audit log with the URN in the sentence.
//   2. A VERIFIED school that freezes KEEPS its `urn`. A school that paid and
//      later lapsed has a real claim on its register entry. `verifiedAt` is the
//      line, and a release that forgot to read it would quietly evict paying
//      customers from their own identity on the day their card expired — with
//      nothing on any screen to say it had happened.
//
// AND THE RELEASE MUST HAPPEN ON EVERY PATH TO FROZEN, not just the one that is
// easy to drive. There are two implementations of the freeze in this
// repository, deliberately: `freezeSubscription` in src/lib/billing.ts, which
// the lazy trial lapse and both of the Stripe webhook's freezing events funnel
// through, and `scripts/freeze-expired.mjs`, a standalone daily job that does
// its own guarded `updateMany` because it runs with no request behind it. This
// file exercises both, and the last test runs the actual job as a subprocess
// against a database of its own.
//
// NOTHING HERE IS DELETED. The release takes the claim and nothing else, so
// every test asserts the school row, its staff and its classes are still there
// afterwards. That is the half a future "tidy up frozen schools" change is most
// likely to break.
// ===========================================================================

const db = new PrismaClient();

// Fictional URNs outside every seeded range (900001–900007, 900100–900124,
// 900200, and 900301 in school-purchase-guard.spec.ts), removed in afterAll, so
// nothing counting register rows or schools can see them.
const SQUAT_URN = "900411";
const PAID_URN = "900412";
const SWEPT_URN = "900413";
const SWEPT_PAID_URN = "900414";
const ALL_URNS = [SQUAT_URN, PAID_URN, SWEPT_URN, SWEPT_PAID_URN];

const SQUAT_ADMIN = { email: "squat.admin@thornsett.test", password: "password" };
const PAID_ADMIN = { email: "paid.admin@kettleby.test", password: "password" };
const STAFF_EMAILS = [SQUAT_ADMIN.email, PAID_ADMIN.email];

// A trial that ran out yesterday, with no Stripe subscription behind it. This
// is the ONE local state `settleStatus` will freeze on, and it is what makes a
// freeze drivable from a browser with no Stripe environment at all.
const LAPSED = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

let squatSchoolId = "";
let paidSchoolId = "";
let sweptSchoolId = "";

/**
 * A school on a lapsed trial, with an admin who can sign in and a class, so
 * that "nothing else was taken" is a claim with something behind it.
 */
async function lapsedSchool(args: {
  name: string;
  urn: string;
  verified: boolean;
  admin?: { email: string; password: string };
  frozenAlready?: boolean;
}): Promise<string> {
  const school = await db.school.create({
    data: { name: args.name, urn: args.urn, verifiedAt: args.verified ? new Date() : null },
  });
  await db.subscription.create({
    data: {
      kind: "SCHOOL",
      status: args.frozenAlready ? "FROZEN" : "TRIAL",
      trialEndsAt: LAPSED(),
      frozenAt: args.frozenAlready ? LAPSED() : null,
      schoolId: school.id,
    },
  });
  if (args.admin) {
    const admin = await db.teacher.create({
      data: {
        name: "Kit Warrender",
        title: "Mrs",
        displayName: "Mrs Warrender",
        email: args.admin.email,
        passwordHash: await bcrypt.hash(args.admin.password, 10),
        role: "ADMIN",
        status: "ACTIVE",
        schoolId: school.id,
        emailConfirmedAt: new Date(),
      },
    });
    await db.class.create({
      data: { name: "Hazel", classCode: `H${args.urn.slice(-4)}`, ageMode: "KS1", teacherId: admin.id },
    });
  }
  return school.id;
}

test.beforeAll(async () => {
  // Idempotent, because a failed test discards the worker and this runs again.
  await db.teacher.deleteMany({ where: { email: { in: STAFF_EMAILS } } });
  await db.school.deleteMany({ where: { urn: { in: ALL_URNS } } });

  // The squat: claimed by purchase order, never paid for, trial run out.
  squatSchoolId = await lapsedSchool({
    name: "Thornsett Primary",
    urn: SQUAT_URN,
    verified: false,
    admin: SQUAT_ADMIN,
  });
  // The customer: paid once, `verifiedAt` stamped, now lapsing. Identical in
  // every other respect, which is the point — one column decides.
  paidSchoolId = await lapsedSchool({
    name: "Kettleby Primary",
    urn: PAID_URN,
    verified: true,
    admin: PAID_ADMIN,
  });
  // Already FROZEN, and nothing in this run froze it. This is the school the
  // by-state sweep exists for: a path to FROZEN that never went through
  // `freezeSubscription`, which is what every path will look like to the
  // reader who adds the fourth one.
  sweptSchoolId = await lapsedSchool({
    name: "Marrable Primary",
    urn: SWEPT_URN,
    verified: false,
    frozenAlready: true,
  });
  // Its control: frozen just as long, and paid for. The sweep must walk past it.
  await lapsedSchool({
    name: "Alderway Primary",
    urn: SWEPT_PAID_URN,
    verified: true,
    frozenAlready: true,
  });
});

test.afterAll(async () => {
  await db.teacher.deleteMany({ where: { email: { in: STAFF_EMAILS } } });
  await db.school.deleteMany({ where: { urn: { in: ALL_URNS } } });
  await db.$disconnect();
});

test("an unverified school that freezes gives its URN back, and nothing else", async ({ page }) => {
  const before = await db.school.findUniqueOrThrow({
    where: { id: squatSchoolId },
    select: { urn: true, verifiedAt: true },
  });
  expect(before.urn, "the fixture must start holding the claim").toBe(SQUAT_URN);
  expect(before.verifiedAt, "and must start unverified, or this proves nothing").toBeNull();

  const staffBefore = await db.teacher.count({ where: { schoolId: squatSchoolId } });
  const classesBefore = await db.class.count({ where: { teacher: { schoolId: squatSchoolId } } });

  // THE FREEZE IS DRIVEN THROUGH THE REAL APPLICATION, not by writing FROZEN
  // into the database. Loading the account page resolves the governing
  // subscription, which calls `settleStatus`, which sees a trial that ran out
  // with no Stripe subscription and calls `freezeSubscription`. That is the
  // lazy on-request freeze a real school meets, and it needs no Stripe key.
  await loginTeacher(page, SQUAT_ADMIN);
  await page.goto("/teacher/account");
  await expect(page.getByRole("heading", { name: /account/i }).first()).toBeVisible();

  const sub = await db.subscription.findFirstOrThrow({ where: { schoolId: squatSchoolId } });
  expect(sub.status, "the account page must have frozen the lapsed trial").toBe("FROZEN");

  const after = await db.school.findUniqueOrThrow({
    where: { id: squatSchoolId },
    select: { urn: true, name: true },
  });
  expect(after.urn, "an unverified school that freezes must release its register claim").toBeNull();

  // THE AUDIT LINE, WITH THE URN IN IT. Once the column is null this row is the
  // only record of which register entry was given up, and "why can I claim this
  // school now when I could not last week" is a question somebody will ask.
  const released = await db.auditLog.findMany({
    where: { action: SCHOOL_URN_RELEASED, schoolId: squatSchoolId },
  });
  expect(released, "exactly one release row, however many times the page is loaded").toHaveLength(1);
  expect(released[0].detail, "the URN must be in the detail, because the column no longer holds it").toContain(SQUAT_URN);
  expect(released[0].actorType).toBe("SYSTEM");

  // AND NOTHING ELSE WAS TAKEN. The row, its name, its staff and its classes.
  expect(after.name, "releasing a claim must not touch the school's name").toBe("Thornsett Primary");
  expect(await db.teacher.count({ where: { schoolId: squatSchoolId } }), "nor its staff").toBe(staffBefore);
  expect(
    await db.class.count({ where: { teacher: { schoolId: squatSchoolId } } }),
    "nor a single class, which is where the children are",
  ).toBe(classesBefore);

  // IDEMPOTENT. A second load must not write a second audit row, and there is
  // nothing left to release.
  await page.goto("/teacher/account");
  await expect(page.getByRole("heading", { name: /account/i }).first()).toBeVisible();
  expect(
    await db.auditLog.count({ where: { action: SCHOOL_URN_RELEASED, schoolId: squatSchoolId } }),
    "a release is recorded once, not once per page load",
  ).toBe(1);
});

test("a school that PAID and later lapsed keeps its URN", async ({ page }) => {
  await loginTeacher(page, PAID_ADMIN);
  await page.goto("/teacher/account");
  await expect(page.getByRole("heading", { name: /account/i }).first()).toBeVisible();

  const sub = await db.subscription.findFirstOrThrow({ where: { schoolId: paidSchoolId } });
  expect(sub.status, "this school must actually have frozen, or the test asserts nothing").toBe("FROZEN");

  const after = await db.school.findUniqueOrThrow({
    where: { id: paidSchoolId },
    select: { urn: true, verifiedAt: true },
  });
  expect(after.urn, "a school that paid keeps its claim on its own register entry").toBe(PAID_URN);
  expect(after.verifiedAt, "and `verifiedAt` is the line that decided it").not.toBeNull();
  expect(
    await db.auditLog.count({ where: { action: SCHOOL_URN_RELEASED, schoolId: paidSchoolId } }),
    "and nothing claimed to release anything",
  ).toBe(0);
});

test("the by-state sweep releases a school frozen by any other path, and walks past a paid one", async () => {
  const released = await sweepFrozenUnverifiedUrns(db, "swept by the security battery");

  expect(released, "a FROZEN, unverified school still holding a URN must be found").toContain(SWEPT_URN);
  expect(released, "a FROZEN school that PAID must be walked past, however long it has been frozen").not.toContain(
    SWEPT_PAID_URN,
  );

  const swept = await db.school.findUniqueOrThrow({ where: { id: sweptSchoolId }, select: { urn: true } });
  expect(swept.urn).toBeNull();

  const paid = await db.school.findFirstOrThrow({ where: { urn: SWEPT_PAID_URN }, select: { urn: true } });
  expect(paid.urn, "the paid school's claim is untouched by the sweep").toBe(SWEPT_PAID_URN);

  // Running it twice must find nothing the second time and write no second row.
  const again = await sweepFrozenUnverifiedUrns(db, "swept by the security battery");
  expect(again, "the sweep is safe to run daily, which means the second run is empty").not.toContain(SWEPT_URN);
  expect(
    await db.auditLog.count({ where: { action: SCHOOL_URN_RELEASED, schoolId: sweptSchoolId } }),
    "one release, one row",
  ).toBe(1);
});

test("the daily freeze job really runs, and really releases", async () => {
  // THE JOB AS A SUBPROCESS, ON A DATABASE OF ITS OWN.
  //
  // Two things are being proved that no in-process call can prove. First, that
  // `scripts/freeze-expired.mjs` still EXECUTES: it imports a TypeScript module
  // now, so it runs under tsx rather than plain node, and a wrong runner in
  // package.json would show up nowhere else until a scheduled job silently
  // stopped freezing accounts. Second, that the job's own guarded freeze — a
  // second implementation, deliberately, because it runs with no request behind
  // it — reaches the same release.
  //
  // ITS OWN DATABASE, because the job is indiscriminate by design: it freezes
  // every lapsed trial it can find. Pointed at the lane's database it would
  // freeze fixtures belonging to specs that have not run yet.
  const dir = mkdtempSync(path.join(tmpdir(), "storyjar-freeze-job-"));
  const url = `file:${path.join(dir, "job.db")}`;
  try {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
      timeout: 120_000,
    });

    const jobDb = new PrismaClient({ datasources: { db: { url } } });
    try {
      const squat = await jobDb.school.create({
        data: { name: "Hebden Row Primary", urn: "900415", verifiedAt: null },
      });
      await jobDb.subscription.create({
        data: { kind: "SCHOOL", status: "TRIAL", trialEndsAt: LAPSED(), schoolId: squat.id },
      });
      const paid = await jobDb.school.create({
        data: { name: "Ryeburn Primary", urn: "900416", verifiedAt: new Date() },
      });
      await jobDb.subscription.create({
        data: { kind: "SCHOOL", status: "TRIAL", trialEndsAt: LAPSED(), schoolId: paid.id },
      });

      const out = execFileSync("npx", ["tsx", "scripts/freeze-expired.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: url },
        encoding: "utf8",
        timeout: 120_000,
      });
      expect(out, "the job must say what it did, including what it released").toContain("released 1");
      expect(out).toContain("900415");

      const squatAfter = await jobDb.school.findUniqueOrThrow({ where: { id: squat.id }, select: { urn: true } });
      const paidAfter = await jobDb.school.findUniqueOrThrow({ where: { id: paid.id }, select: { urn: true } });
      expect(squatAfter.urn, "the job froze it and took the claim back").toBeNull();
      expect(paidAfter.urn, "and left the paying school's claim exactly where it was").toBe("900416");

      expect(
        await jobDb.auditLog.count({ where: { action: SCHOOL_URN_RELEASED, schoolId: squat.id } }),
        "the job audits the release the same way the app does",
      ).toBe(1);
    } finally {
      await jobDb.$disconnect();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
