import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_B, loginTeacher, studentIdFromLogin } from "../helpers";

// ===========================================================================
// Who may message families is the SCHOOL's decision, per member of staff
// (SAFEGUARDING.md rule 21). A teaching assistant may not by default; an admin
// can say otherwise; and a member of staff cannot change their own answer.
//
// The persona finding this also answers: "Nothing says what a teaching
// assistant is allowed to do. I found out by pressing things." A TA who is
// not set up is told so in words, on the page, rather than shown an empty one.
// ===========================================================================

const db = new PrismaClient();

async function zaraThread() {
  const zara = await db.student.findFirstOrThrow({ where: { name: SCHOOL_B.student, class: { classCode: SCHOOL_B.classCode } }, include: { class: { include: { teacher: true } } } });
  const thread = await db.messageThread.upsert({
    where: { studentId: zara.id },
    create: { studentId: zara.id, schoolId: zara.class.teacher.schoolId!, classId: zara.classId },
    update: {},
  });
  return { zara, thread };
}

test.afterAll(async () => {
  await db.$disconnect();
});

test.beforeEach(async () => {
  // Start every case from the role default.
  await db.teacher.update({ where: { email: SCHOOL_B.ta.email }, data: { mayMessageParents: null } });
});

test("a teaching assistant is told, in words, that they are not set up to message families", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.ta);
  await page.goto("/teacher/messages");
  await expect(page.getByText(/aren’t set up to message families/i)).toBeVisible();
  await expect(page.getByText(/ask them if you think you should be/i)).toBeVisible();
});

test("a TA given a thread by another route can read it but not reply, until the admin says so", async ({ page }) => {
  const { zara, thread } = await zaraThread();
  const ta = await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_B.ta.email } });
  // A share row written directly, as if a colleague had bent the rules: the
  // per-staff switch still governs sending.
  await db.messageThreadShare.upsert({
    where: { threadId_teacherId: { threadId: thread.id, teacherId: ta.id } },
    create: { threadId: thread.id, teacherId: ta.id },
    update: {},
  });
  try {
    await loginTeacher(page, SCHOOL_B.ta);
    await page.goto(`/teacher/messages/${zara.id}`);
    await expect(page.getByRole("heading", { name: /zara/i })).toBeVisible();
    await expect(page.getByLabel("Your message")).toHaveCount(0);
    await expect(page.getByText(/aren’t set up to message families/i)).toBeVisible();

    // The admin flips the switch for this one member of staff.
    await db.teacher.update({ where: { id: ta.id }, data: { mayMessageParents: true } });
    await page.reload();
    await expect(page.getByLabel("Your message")).toBeVisible();
  } finally {
    await db.messageThreadShare.deleteMany({ where: { threadId: thread.id, teacherId: ta.id } });
  }
});

test("the admin's per-staff switch is on the Staff tab, and it is audited", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.admin);
  await page.goto("/admin");
  await page.getByRole("button", { name: `Actions for Priya Shah` }).click();
  await page.getByRole("menuitem", { name: /parent messages/i }).click();
  await page.getByRole("menuitem", { name: /^may message families$/i }).click();

  await expect.poll(async () => (await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_B.ta.email } })).mayMessageParents).toBe(true);
  const audit = await db.auditLog.findFirst({ where: { action: "STAFF_MESSAGING_CHANGED" }, orderBy: { at: "desc" } });
  expect(audit?.detail).toMatch(/Priya Shah may message parents/);

  // The row now says so.
  await page.reload();
  await expect(page.getByText(/may message families/i).first()).toBeVisible();
});

test("a teacher cannot reach the switch for themselves or anyone else", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/teacher$/);
  // And there is no such control on their own screens.
  await page.goto("/teacher/account");
  expect(await page.content()).not.toMatch(/may message families|message parents/i);
});

test("a TA is never offered in the share picker while they may not message families", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  const zara = await studentIdFromLogin(page, SCHOOL_B.classCode, SCHOOL_B.student);
  await page.goto(`/teacher/messages/${zara}`);
  const options = await page.locator('select[name="teacherId"]').first().locator("option").allTextContents();
  expect(options).toContain(SCHOOL_B.secondTeacher.displayName);
  expect(options).not.toContain(SCHOOL_B.ta.displayName);
});
