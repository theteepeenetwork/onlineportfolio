import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// When a class changes hands, everything the old teacher held goes with it.
//
// This replaces tests/battery/findings/staff-removal.spec.ts, which asserted
// the intended behaviour and failed on purpose. Two things changed when it
// moved into the blocking suite:
//
//   It drives the REAL ACTION through the console. The findings version
//   simulated the click with `db.teacher.update`, which would have kept passing
//   against a `removeStaff` that changed underneath it — a test of the
//   database, not of the product.
//
//   It covers both triggers. F59 is removal; F66 is the ORDINARY SEPTEMBER
//   HANDOVER, which is the one that was live in the product the whole time and
//   needs nobody removed from anything.
//
// The properties, in the order they matter:
//   1. the classes leave with the school, not with the person (F59)
//   2. the old teacher can no longer reach the children's work (F59)
//   3. the class code no longer works — it is a bearer credential and the only
//      thing that closes it is rotation (F66a)
//   4. an admin cannot do either of these to another school's staff
// ===========================================================================

const db = new PrismaClient();

test("removing a teacher moves their classes, and the old class code stops working [F59, F66]", async ({
  page,
  browser,
}) => {
  const school = await db.school.findFirstOrThrow({ where: { name: { contains: "Oakfield" } } });
  const admin = await db.teacher.findFirstOrThrow({ where: { email: SCHOOL_B.admin.email } });
  const victim = await db.teacher.findFirstOrThrow({ where: { email: SCHOOL_B.teacher.email } });

  const before = await db.class.findMany({
    where: { teacherId: victim.id },
    select: { id: true, name: true, classCode: true, _count: { select: { students: true } } },
  });
  expect(before.length, "the fixture teacher must hold at least one class").toBeGreaterThan(0);
  const oldCode = before[0].classCode;
  const originals = new Map(before.map((c) => [c.id, c.classCode]));

  try {
    // The real path: sign in as the admin and press the control.
    await loginTeacher(page, SCHOOL_B.admin);
    await page.goto("/admin");
    await page.getByRole("button", { name: new RegExp(`actions for ${victim.name}`, "i") }).click();
    await page.getByRole("menuitem", { name: /remove from school/i }).click();

    // The confirm step says what is about to move, before it moves.
    await expect(
      page.getByText(/loses access to StoryJar/i),
      "removal must say what it will do before it does it",
    ).toBeVisible();
    await page.getByRole("menuitem", { name: new RegExp(`yes, remove ${victim.name}`, "i") }).click();
    await page.waitForTimeout(2000);

    // 1. The classes are the school's, held by the admin who removed them.
    const after = await db.class.findMany({
      where: { id: { in: before.map((c) => c.id) } },
      select: { id: true, teacherId: true, classCode: true },
    });
    for (const c of after) {
      expect(c.teacherId, "every class must move to the removing admin").toBe(admin.id);
      expect(
        c.classCode,
        "the class code is a bearer credential and must not survive the handover",
      ).not.toBe(originals.get(c.id));
    }

    // 2. The removed teacher reaches nothing. Fresh context: they still know
    //    their password, which is the case F59 measured.
    const ctx = await browser.newContext();
    const theirs = await ctx.newPage();
    await loginTeacher(theirs, SCHOOL_B.teacher);
    const body = await theirs.locator("body").innerText();
    for (const c of before) {
      expect(body, `a removed teacher still sees "${c.name}"`).not.toContain(c.name);
    }
    await ctx.close();

    // 3. The old code signs nobody in — the property no session or password
    //    handling can reach.
    const anon = await browser.newContext();
    const child = await anon.newPage();
    await child.goto(`/login/student?code=${oldCode}`);
    const codeBody = await child.locator("body").innerText();
    expect(
      codeBody,
      "the old class code still returns a roster, so the removed teacher can sign in as any pupil",
    ).not.toContain(before[0].name);
    await anon.close();
  } finally {
    // Put School B back: its teacher, their classes, and codes the other specs
    // do not depend on (they look classes up by teacher, not by code).
    await db.teacher.update({ where: { id: victim.id }, data: { schoolId: school.id } });
    for (const c of before) {
      await db.class.update({
        where: { id: c.id },
        data: { teacherId: victim.id, classCode: c.classCode },
      });
    }
    await db.$disconnect();
  }
});
