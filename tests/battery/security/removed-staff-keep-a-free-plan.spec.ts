import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// Removing a teacher from a school ends their access to THAT SCHOOL, and
// leaves their own account working on the free plan.
//
// THE BUG THIS FIXES, because the shape of it is what the assertions below are
// arranged around. `removeStaff` set `Teacher.schoolId` to NULL and created no
// `Subscription`, and until today signup was the only place a FREE row was ever
// written. So a teacher who was INVITED into the school from scratch — the
// ordinary way a colleague arrives, and one that writes no subscription — came
// out of a removal governed by nothing at all.
//
// What that looks like to them is the reason this is a blocking gate rather
// than a tidy-up. `requireWritableAccountForTeacher` denies by default, which
// is right (SAFEGUARDING rule 8). But `accountStateForTeacher` reports status
// "NONE"; the frozen banner tests for "FROZEN" and so never renders; and
// `planLabel` says "No plan yet". The teacher gets a normal-looking app in
// which every save fails and no screen explains why — strictly worse than
// being frozen, because a frozen account at least says so.
//
// So there are two properties here and they are not the same property:
//
//   1. THE ROW EXISTS, and is the right row — FREE, ACTIVE, `trialEndsAt` NULL,
//      which is what encodes "nothing to lapse" (src/lib/billing.ts). Asserted
//      against the database, because the row is the thing the write gate reads.
//   2. THE ACCOUNT ACTUALLY WORKS. A row satisfying a query is not a teacher
//      who can save anything, so the removed teacher signs in and completes a
//      real write through the real UI.
//
// And then the invariant, which is the part that outlives this change: NO
// teacher who belongs to no school is left without a subscription. Three code
// paths detach a teacher today and a fourth will be added by somebody who has
// never read this file. That sweep is what catches them.
// ===========================================================================

const db = new PrismaClient();

// A member of staff built the way `inviteStaff` builds one: ACTIVE, in the
// school, and with NO subscription of their own. That absence is the whole
// precondition — a teacher who already had a free row would prove nothing,
// because the row found at the end would be the row that was there at the
// start. Built here rather than in the shared fixtures so this spec cannot
// shift any other spec's counts.
const LEAVER = { email: "leaver@oakfield.test", password: "password" };

let leaverId = "";
let handedOverClassId = "";
let oakfieldAdminId = "";

test.beforeAll(async () => {
  await db.teacher.deleteMany({ where: { email: LEAVER.email } });

  const school = await db.school.findFirstOrThrow({ where: { name: { contains: "Oakfield" } } });
  const admin = await db.teacher.findFirstOrThrow({ where: { email: SCHOOL_B.admin.email } });
  oakfieldAdminId = admin.id;

  const leaver = await db.teacher.create({
    data: {
      name: "Tomas Leaver",
      displayName: "Mr Leaver",
      email: LEAVER.email,
      passwordHash: await bcrypt.hash(LEAVER.password, 10),
      role: "TEACHER",
      status: "ACTIVE",
      schoolId: school.id,
      // Deliberately no `subscription`. See the note above.
    },
  });
  leaverId = leaver.id;

  // One class, so the removal takes the branch that actually happens: classes
  // hand over to the admin who pressed the button, codes rotate, and the
  // confirmation sentence has something to say. No pupils — the handover
  // itself is class-handover.spec.ts's subject, not this one's.
  const klass = await db.class.create({
    data: { name: "Leaver's Larks", ageMode: "KS1", classCode: "LVR001", teacherId: leaver.id },
  });
  handedOverClassId = klass.id;
});

test.afterAll(async () => {
  // Put Oakfield back exactly as it was. Deleting the teacher cascades their
  // subscription, sessions and anything they made after the removal — but NOT
  // the class they held before it, which by then belongs to the admin who
  // removed them. Left behind it would quietly add a class to School B's admin
  // and move somebody else's counts.
  await db.class.deleteMany({ where: { id: handedOverClassId } });
  await db.class.deleteMany({ where: { teacherId: leaverId } });
  await db.teacher.deleteMany({ where: { email: LEAVER.email } });
  await db.$disconnect();
});

test("a removed teacher keeps a working account on the free plan", async ({ page, browser }) => {
  // POSITIVE CONTROL, and it is what makes everything after it mean something.
  // This teacher has no subscription of their own right now, so any row found
  // below was created by the removal rather than found by it.
  expect(
    await db.subscription.count({ where: { teacherId: leaverId } }),
    "the leaver must start with no plan of their own, or this spec proves nothing",
  ).toBe(0);

  // The real path: the admin signs in and presses the control a head teacher
  // presses, rather than the database being edited to look like they had.
  await loginTeacher(page, SCHOOL_B.admin);
  await page.goto("/admin");
  await page.getByRole("button", { name: /actions for Tomas Leaver/i }).click();
  await page.getByRole("menuitem", { name: /remove from school/i }).click();

  // THE SENTENCE BEFORE THE CLICK. Removal ends access to this school and
  // nothing else, and the confirmation has to say so: an admin who believes
  // removal closes an account will not do the thing that actually closes one.
  await expect(
    page.getByText(/loses access to your school.s StoryJar/i),
    "the confirmation must not claim removal ends the person's access to StoryJar itself",
  ).toBeVisible();
  await expect(
    page.getByText(/own account stays open on the free plan/i),
    "the confirmation must say what becomes of their own account",
  ).toBeVisible();

  await page.getByRole("menuitem", { name: /yes, remove Tomas Leaver/i }).click();

  // The detach really happened. Polled rather than slept on: this is the
  // server's own state changing, not an animation finishing.
  await expect
    .poll(
      async () =>
        (await db.teacher.findUnique({ where: { id: leaverId }, select: { schoolId: true } }))
          ?.schoolId,
      { message: "the removal must actually detach them from the school", timeout: 15_000 },
    )
    .toBeNull();

  // 1. THE ROW. Exactly the row signup writes — the definition lives in one
  //    place now (`restoreFreePlan` in src/lib/billing.ts) and this is what it
  //    is. `trialEndsAt` and `frozenAt` are asserted individually because they
  //    are the two columns that decide whether an account can ever be frozen
  //    and whether RETENTION.md's 12-month deletion clock is running.
  const sub = await db.subscription.findUnique({ where: { teacherId: leaverId } });
  expect(sub, "a removed teacher must be governed by SOMETHING — nothing is worse than frozen")
    .toBeTruthy();
  expect(sub!.kind, "their own plan is the free teacher plan").toBe("FREE");
  expect(sub!.status, "and it is writable from the moment they are removed").toBe("ACTIVE");
  expect(sub!.trialEndsAt, "a free plan carries no countdown — there is nothing to lapse").toBeNull();
  expect(sub!.frozenAt, "no deletion clock may be started by being removed from a school").toBeNull();

  // 2. THE ACCOUNT WORKS. A row that satisfies a query is not a teacher who can
  //    save anything: the write gate reads the row, the action reads the gate,
  //    and the screen reads the action. So sign in as them, in a fresh context
  //    because their sessions were revoked by the removal, and complete a real
  //    write. Creating a class is the one to use — it is write-gated
  //    (src/app/actions/classes.ts) and it is also the first thing a teacher
  //    who has just left a school actually does.
  const ctx = await browser.newContext();
  const theirs = await ctx.newPage();
  try {
    await loginTeacher(theirs, LEAVER);
    await theirs.goto("/teacher/class");
    await theirs.getByRole("button", { name: /New class/i }).click();
    await theirs.fill("#className", "Starting Again");
    await theirs.getByRole("button", { name: /^Create class/ }).click();
    await expect(
      theirs.getByRole("button", { name: /Starting Again/ }),
      "a removed teacher must be able to carry on in their own account",
    ).toBeVisible();

    // The server made it, not the screen. If the write gate had denied, the
    // action would have returned the frozen refusal and nothing would exist.
    expect(
      await db.class.count({ where: { teacherId: leaverId, name: "Starting Again" } }),
      "the write completed on the server, not just in the browser",
    ).toBe(1);
  } finally {
    await ctx.close();
  }

  // The classes went with the school, which is class-handover.spec.ts's
  // property — asserted here only far enough to show that "they keep a free
  // plan" did not quietly become "they keep the children's work".
  const handed = await db.class.findUnique({
    where: { id: handedOverClassId },
    select: { teacherId: true },
  });
  expect(handed?.teacherId, "their old class stays with the school, not with them").toBe(
    oakfieldAdminId,
  );
});

// ===========================================================================
// THE INVARIANT, and the reason it is a separate test.
//
// Everything above proves one route works. This proves there is no other route
// that does not. `Subscription` is the only thing that answers "may this
// account write", so a teacher who belongs to no school and holds no
// subscription is an account with no governing plan at all — the state the
// whole file exists to make unreachable.
//
// Three paths detach a teacher today: `removeStaff`, `joinSchoolPlan` (which
// deletes the free row on the way IN, so a later detach must put one back),
// and an admin's account being wound down by hand. A fourth will be written by
// somebody who has never read this file, and this is the test that will tell
// them. It is deliberately a sweep of the whole table rather than a check on
// one teacher: the point is the ones nobody thought of.
//
// IT BRINGS ITS OWN CANARY rather than leaning on the test above. It would be
// neater to sweep while the removed teacher is still detached, but a Playwright
// worker is discarded and restarted after a failed test, so `beforeAll` re-runs
// and the leaver is back in their school by the time this would read the table.
// A test whose meaning depends on whether an earlier test passed is a test that
// reports something else on the day it matters. So this one strands a teacher
// itself, proves the query sees them, gives them the plan the product gives
// them, and then sweeps for real.
// ===========================================================================
const CANARY = "canary.stranded@example.test";

test("no teacher anywhere belongs to no school and no plan", async () => {
  await db.teacher.deleteMany({ where: { email: CANARY } });
  // Exactly the state this file exists to make unreachable: no school, no
  // subscription, nothing governing their writes.
  const canary = await db.teacher.create({
    data: { name: "Stranded Canary", displayName: "Canary", email: CANARY, passwordHash: "" },
  });

  try {
    // POSITIVE CONTROL. A sweep that cannot see a stranded teacher is not a
    // sweep, and it would pass every day while the thing it names went wrong.
    const seen = await db.teacher.findMany({
      where: { schoolId: null, subscription: null },
      select: { id: true },
    });
    expect(
      seen.map((t) => t.id),
      "the sweep must be able to find a stranded teacher, or the assertion below means nothing",
    ).toContain(canary.id);

    // Give them what the product now gives them, and the sweep must go quiet
    // about them — which also pins the other half of the query: a teacher with
    // a plan of their own is not stranded, however schoolless they are.
    await db.subscription.create({
      data: { kind: "FREE", status: "ACTIVE", trialEndsAt: null, teacherId: canary.id },
    });

    const stranded = await db.teacher.findMany({
      where: { schoolId: null, subscription: null },
      select: { id: true, status: true },
    });
    expect(
      stranded,
      `${stranded.length} teacher(s) belong to no school and have no subscription. Their write gate ` +
        "denies by default (right), but accountStateForTeacher reports NONE, so no frozen banner " +
        "renders and the plan label reads 'No plan yet' — a working-looking app in which every save " +
        "fails silently. Whatever detached them must call restoreFreePlan in the same transaction. " +
        "scripts/restore-orphan-free-plans.ts repairs the ones already out there.",
    ).toEqual([]);
  } finally {
    await db.teacher.deleteMany({ where: { email: CANARY } });
  }
});
