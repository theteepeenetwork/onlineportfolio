import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_B } from "../helpers";

// ===========================================================================
// F59 (OPEN) — "Remove from school" does not remove access.
//
// REPORT-ONLY, and it FAILS ON PURPOSE. This asserts the behaviour a school
// believes it is getting, not the behaviour the product has, which is this
// directory's whole convention: a logged gap keeps a test that goes green the
// day somebody fixes it. When it does, it moves into
// tests/battery/security/ and F59 is deleted from FINDINGS.md rather than
// reworded.
//
// WHAT IS BROKEN. `removeStaff` (src/app/actions/admin.ts:107) sets
// `teacher.schoolId = null` for active staff. `Class` has no `schoolId` — a
// class belongs to a school only through its teacher — so the classes leave the
// school with the person, while `Class.teacherId` still points at them and
// every teacher-scoped query still answers. The head teacher's console loses
// the classes; the removed teacher loses nothing.
//
// WHY IT IS WORTH A TEST AND NOT ONLY A NOTE. This is the operation a school
// performs *because* somebody should no longer see children's work — they have
// left, or they have been suspended. Rule 1 covers access control, the
// approval queue and children's data, and this touches all three while
// reporting success and writing STAFF_REMOVED to the audit log.
//
// SCHOOL B, deliberately. School A's teacher owns the fixtures half the
// blocking suite signs in as, and this test removes somebody from their school.
// Oakfield's teacher owns one class (Acorn) and nothing else depends on them.
// The row is put back in `finally` whatever happens, because a findings test
// that leaves the fixtures broken takes the gates down with it.
// ===========================================================================

const db = new PrismaClient();

test("a member of staff removed from a school cannot reach its children's work [F59]", async ({
  page,
}) => {
  const teacher = await db.teacher.findFirst({
    where: { email: SCHOOL_B.teacher.email },
    select: { id: true, schoolId: true, name: true },
  });
  expect(teacher, "School B's teacher fixture is missing").not.toBeNull();
  const original = teacher!.schoolId;

  try {
    // What the head teacher's click does, at the level the action does it.
    await db.teacher.update({ where: { id: teacher!.id }, data: { schoolId: null } });

    // The classes they held. If access is really revoked, none of these should
    // be reachable by them any more.
    const classes = await db.class.findMany({
      where: { teacherId: teacher!.id },
      select: { name: true, _count: { select: { students: true, journalItems: true } } },
    });

    // Now they sign in for themselves. A fresh page: no session survives from
    // before the removal, so this is the "they still know their password"
    // case, which is the one a school is worried about.
    await page.goto("/login/teacher");
    await page.fill("#email", SCHOOL_B.teacher.email);
    await page.fill("#password", SCHOOL_B.teacher.password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");

    const landed = new URL(page.url()).pathname;
    const body = await page.locator("body").innerText();

    // THE ASSERTION, and it is the intended behaviour rather than the observed
    // one. Somebody removed from a school should not land in a teacher's
    // console holding that school's classes.
    const stillHoldsClasses = classes.filter((c) => body.includes(c.name));
    expect(
      stillHoldsClasses.map((c) => c.name),
      `a teacher removed from ${SCHOOL_B.name} signed in at ${landed} and still sees ` +
        `${stillHoldsClasses.length} of their ${classes.length} classes, holding ` +
        `${classes.reduce((n, c) => n + c._count.students, 0)} pupils and ` +
        `${classes.reduce((n, c) => n + c._count.journalItems, 0)} journal items. ` +
        `Removing somebody from a school is how a school revokes access.`,
    ).toEqual([]);
  } finally {
    await db.teacher.update({ where: { id: teacher!.id }, data: { schoolId: original } });
    await db.$disconnect();
  }
});

test("the school keeps the classes of a member of staff it removes [F59]", async ({}) => {
  // The other half, and the one a head teacher meets second: the classes do not
  // merely stay reachable by the wrong person, they stop being reachable by the
  // right one. There is no screen that puts them back.
  const teacher = await db.teacher.findFirst({
    where: { email: SCHOOL_B.teacher.email },
    select: { id: true, schoolId: true },
  });
  const original = teacher!.schoolId;
  try {
    const before = await db.class.count({ where: { teacher: { schoolId: original } } });
    await db.teacher.update({ where: { id: teacher!.id }, data: { schoolId: null } });
    const after = await db.class.count({ where: { teacher: { schoolId: original } } });

    expect(
      after,
      `removing one member of staff took ${before - after} of ${before} classes out of the ` +
        `school's own console. The action's comment says they "are left intact and can be ` +
        `reassigned"; there is no screen that can reach them to reassign.`,
    ).toBe(before);
  } finally {
    await db.teacher.update({ where: { id: teacher!.id }, data: { schoolId: original } });
    await db.$disconnect();
  }
});
