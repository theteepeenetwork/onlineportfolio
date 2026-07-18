import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// updateAgeMode — a teacher must not change another school's class register
//
// The age-mode edit takes `classId` from the form. Like every id-taking action
// it is ownership-scoped (findFirst on teacherId → deny by default), so a
// School B teacher tampering the hidden classId to point at a School A class
// must change nothing. SAFEGUARDING rules 4 (scope by ownership) and 8 (deny by
// default). Age mode carries no child data, but it decides how a class's
// children's screens read — no one but that class's own teacher may set it.
//
// Same shape as f15: tamper ONLY the hidden id on a page the actor is entitled
// to be on, submit, then assert the effect never landed (read straight from the
// database — the same PrismaClient pattern the age-mode-creation spec uses).
// ===========================================================================

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

test("a teacher cannot change another school's class age mode", async ({ page }) => {
  // School A's class, and its register as seeded (NULL → younger).
  const before = await db.class.findFirst({
    where: { classCode: SCHOOL_A.classCode },
    select: { id: true, ageMode: true },
  });
  expect(before, "seed has School A's class").not.toBeNull();

  // School B's teacher, on their OWN class's settings — a page they may be on.
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /Acorn/ }).click();
  await page.getByRole("button", { name: /Class settings/ }).click();

  // Pick the register their class is NOT in, to arm the Save button...
  await page.getByRole("radio", { name: /older children/i }).check();

  // ...then tamper ONLY the hidden classId to point at School A's class.
  await page.locator('form:has(input[name="ageMode"]) input[name="classId"]').evaluate(
    (el, id) => {
      (el as HTMLInputElement).value = id as string;
    },
    before!.id,
  );

  await page.getByRole("button", { name: /^Save$/ }).click();
  await page.waitForLoadState("networkidle");

  // The real assertion: School A's register is untouched, whatever the UI did.
  const after = await db.class.findFirst({
    where: { classCode: SCHOOL_A.classCode },
    select: { ageMode: true },
  });
  expect(
    after?.ageMode,
    "a School B teacher changed School A's class age mode",
  ).toBe(before!.ageMode);
});
