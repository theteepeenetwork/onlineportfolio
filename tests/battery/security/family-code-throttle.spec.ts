import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_B, loginTeacher, ownThrottleKey } from "../helpers";

// ===========================================================================
// F2: family-code entry is throttled, and an honest family is never locked out
//
// A family code is a bearer credential for a child's photographs, so the two
// places it can be typed (the sign-in form, and the "add another child" form
// behind it) are throttled per source, on ONE shared budget. Two budgets would
// leave the second form an unmetered oracle for the first.
//
// The counter is failure-based and a CORRECT code clears it, which is the half
// that protects real families: a parent squinting at a letter gets their typos
// forgiven the moment they get it right.
//
// Why these tests can be blocking, when the sibling throttle specs are not:
// each one runs against its OWN synthetic throttle key, fresh every run
// (`ownThrottleKey()` in ../helpers, which explains the mechanism and why it
// says nothing about production). No 15-minute block bleeds into the specs that
// follow, or into the next run on a warm dev server.
// ===========================================================================

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

// Make a real family code the honest way, through the teacher's own screen.
async function makeFamilyCode(page: Page, pupilName: string) {
  const student = await db.student.findFirst({
    where: { name: pupilName, class: { classCode: SCHOOL_B.classCode } },
    select: { id: true },
  });
  expect(student, `fixture pupil ${pupilName}`).not.toBeNull();

  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/students/${student!.id}`);
  const before = await db.parent.count({ where: { children: { some: { id: student!.id } } } });
  await page.getByRole("button", { name: /Add (family access|another family)/ }).click();
  await expect
    .poll(async () => db.parent.count({ where: { children: { some: { id: student!.id } } } }))
    .toBe(before + 1);

  const family = (
    await db.parent.findMany({
      where: { children: { some: { id: student!.id } } },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { id: true, familyCode: true },
    })
  )[0];
  return family;
}

async function typeCode(page: Page, code: string) {
  await page.getByLabel(/family code from your letter/i).fill(code);
  const signIn = page.getByRole("button", { name: /^sign in$/i });
  await signIn.click();
  await expect(signIn.or(page.getByRole("heading", { name: /grown-ups/i })).first()).toBeVisible();
}

test("a correct family code clears the counter, so typos never lock a family out", async ({ page, browser }) => {
  const family = await makeFamilyCode(page, "Zara");

  // Our own throttle key, so this spends nobody else's budget.
  const ctx = await browser.newContext({ extraHTTPHeaders: ownThrottleKey("20") });
  const parent = await ctx.newPage();
  try {
    // Two rounds of four typos, each ended by getting it right. Eight failures
    // in total: more than the ceiling, and yet the family is never turned away,
    // because each success wipes the count. If clearing ever broke, the second
    // round would trip the block and the final sign-in would be refused.
    for (const round of [1, 2]) {
      await parent.goto("/family");
      await parent.getByRole("button", { name: /family code from your letter/i }).click();

      for (let attempt = 1; attempt <= 4; attempt++) {
        await typeCode(parent, `WRONG${round}${attempt}`);
        await expect(
          parent.getByText(/family code isn.t right/i),
          `round ${round}, typo ${attempt} should be a plain rejection, not a lockout`,
        ).toBeVisible();
      }

      await typeCode(parent, family.familyCode);
      await expect(
        parent.getByRole("heading", { name: /Hello, Zara/ }),
        `round ${round}: the family should get in with the right code`,
      ).toBeVisible();

      await parent.getByRole("button", { name: /Sign out/ }).click();
    }
  } finally {
    await ctx.close();
    await db.parent.deleteMany({ where: { id: family.id } });
  }
});

test("adding another child is throttled on the same budget as signing in", async ({ page, browser }) => {
  const family = await makeFamilyCode(page, "Yusuf");

  const ctx = await browser.newContext({ extraHTTPHeaders: ownThrottleKey("30") });
  const parent = await ctx.newPage();
  try {
    await parent.goto("/family");
    await parent.getByRole("button", { name: /family code from your letter/i }).click();
    await typeCode(parent, family.familyCode);
    await expect(parent.getByRole("heading", { name: /Hello, Yusuf/ })).toBeVisible();

    // Grind the "add another child" box. Five wrong codes is the ceiling.
    await parent.getByRole("button", { name: /Your family space/ }).click();
    const add = parent.getByRole("button", { name: /Add this child/ });
    let throttled = false;
    let rejectedNormally = false;
    for (let attempt = 1; attempt <= 6; attempt++) {
      await parent.getByLabel(/Family code from their letter/i).fill(`NOPE${attempt}XYZ`);
      await add.click();
      await expect(add).toBeEnabled();
      const panel = await parent.locator("form:has(#add-code)").locator("xpath=..").innerText();
      if (/isn.t right/i.test(panel)) rejectedNormally = true;
      if (/too many attempts/i.test(panel)) {
        throttled = true;
        break;
      }
    }

    // Guard: the loop really exercised the form (not a silently broken button).
    expect(rejectedNormally, "wrong codes were processed").toBe(true);
    expect(throttled, "the add-a-child box must be throttled too").toBe(true);

    // And it is ONE budget: the sign-in form on the same source is now throttled
    // as well, even for a correct code.
    await parent.getByRole("button", { name: /Sign out/ }).click();
    await parent.getByRole("button", { name: /family code from your letter/i }).click();
    await typeCode(parent, family.familyCode);
    await expect(
      parent.getByText(/too many attempts/i),
      "the two code boxes must share one throttle budget",
    ).toBeVisible();
  } finally {
    await ctx.close();
    await db.parent.deleteMany({ where: { id: family.id } });
  }
});
