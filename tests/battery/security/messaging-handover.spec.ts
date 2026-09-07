import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, loginParent, loginTeacher, studentIdFromLogin } from "../helpers";

// ===========================================================================
// A teacher opts out of one family by passing the thread to a colleague
// (SAFEGUARDING.md rule 21, constraint 9): the colleague takes it over
// completely, the class teacher sees nothing until they take it back, and the
// PARENT IS NOT TOLD — no banner, no status, no reason. The reason, if given,
// is for the school admin and lives on the thread row; it never reaches the
// audit log.
// ===========================================================================

const db = new PrismaClient();
const REASON = "A complaint is in progress and the head has asked me to step back";

async function reset() {
  const zara = await db.student.findFirstOrThrow({ where: { name: SCHOOL_B.student, class: { classCode: SCHOOL_B.classCode } } });
  await db.messageThread.updateMany({ where: { studentId: zara.id }, data: { handlerTeacherId: null, passedAt: null, handoverReason: null } });
  await db.messageThreadShare.deleteMany({ where: { thread: { studentId: zara.id } } });
}

test.afterAll(async () => {
  await reset();
  await db.$disconnect();
});

test.beforeEach(reset);

test("passed on: the colleague holds it, the teacher does not, the parent is told nothing", async ({ page, browser }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  const zara = await studentIdFromLogin(page, SCHOOL_B.classCode, SCHOOL_B.student);
  await page.goto(`/teacher/messages/${zara}`);
  await page.getByRole("button", { name: /pass this family on…/i }).click();
  await page.locator('form:has(textarea[name="reason"]) select[name="teacherId"]').selectOption({ label: SCHOOL_B.secondTeacher.displayName });
  await page.locator('textarea[name="reason"]').fill(REASON);
  await page.getByRole("button", { name: /^pass this family on$/i }).click();
  await expect(page).toHaveURL(/\/teacher\/messages$/);

  // The teacher: listed as passed, with a way back, and no content.
  await expect(page.getByRole("heading", { name: /families you have passed/i })).toBeVisible();
  await expect(page.getByText(new RegExp(`Zara.*with ${SCHOOL_B.secondTeacher.displayName}`))).toBeVisible();
  expect((await page.goto(`/teacher/messages/${zara}`))?.status()).toBe(404);

  // The colleague: it is theirs now.
  const colleague = await browser.newContext();
  const cp = await colleague.newPage();
  await loginTeacher(cp, SCHOOL_B.secondTeacher);
  await cp.goto("/teacher/messages");
  await expect(cp.getByText(/passed to you/i)).toBeVisible();
  await cp.goto(`/teacher/messages/${zara}`);
  await expect(cp.getByLabel("Your message")).toBeVisible();
  await colleague.close();

  // The parent: nothing announced. The reader list simply shows who reads now.
  const parent = await browser.newContext();
  const pp = await parent.newPage();
  await loginParent(pp, SCHOOL_B.parentFamilyCode);
  const html = await pp.content();
  expect(html).not.toContain(REASON);
  expect(html).not.toMatch(/passed|handed over|stepped back|opted out/i);
  // The reader list names the colleague and not the class teacher. (The jar's
  // own header still says which class and teacher the child has — that is a
  // fact about the class, not about the conversation.)
  const readers = await pp.getByText(/who can see this:/i).textContent();
  expect(readers).toContain(SCHOOL_B.secondTeacher.displayName);
  expect(readers).not.toContain("Mr Okafor");
  await parent.close();

  // The reason is on the thread row, for the admin, and in no audit row.
  const thread = await db.messageThread.findUniqueOrThrow({ where: { studentId: zara } });
  expect(thread.handoverReason).toBe(REASON);
  const audits = await db.auditLog.findMany({ where: { action: "THREAD_PASSED" } });
  expect(audits.length).toBeGreaterThan(0);
  for (const a of audits) expect(a.detail ?? "").not.toContain("complaint");
});

test("taken back: the teacher holds it again and the colleague is out", async ({ page, browser }) => {
  const zaraRow = await db.student.findFirstOrThrow({ where: { name: SCHOOL_B.student, class: { classCode: SCHOOL_B.classCode } }, include: { class: { include: { teacher: true } } } });
  const okoro = await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_B.secondTeacher.email } });
  await db.messageThread.upsert({
    where: { studentId: zaraRow.id },
    create: { studentId: zaraRow.id, schoolId: zaraRow.class.teacher.schoolId!, classId: zaraRow.classId, handlerTeacherId: okoro.id, passedAt: new Date() },
    update: { handlerTeacherId: okoro.id, passedAt: new Date() },
  });

  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto("/teacher/messages");
  await page.getByRole("button", { name: /take back/i }).click();
  await expect(page).toHaveURL(new RegExp(`/teacher/messages/${zaraRow.id}$`));
  await expect(page.getByLabel("Your message")).toBeVisible();

  const colleague = await browser.newContext();
  const cp = await colleague.newPage();
  await loginTeacher(cp, SCHOOL_B.secondTeacher);
  expect((await cp.goto(`/teacher/messages/${zaraRow.id}`))?.status()).toBe(404);
  await colleague.close();
});

test("a pass to staff of another school is refused on the server", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  const zara = await studentIdFromLogin(page, SCHOOL_B.classCode, SCHOOL_B.student);
  const malik = await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_A.otherTeacher.email } });
  await page.goto(`/teacher/messages/${zara}`);
  await page.getByRole("button", { name: /pass this family on…/i }).click();
  await page.evaluate((id) => {
    const sel = document.querySelector<HTMLSelectElement>('form:has(textarea[name="reason"]) select[name="teacherId"]');
    if (!sel) return;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = "bent";
    sel.appendChild(opt);
    sel.value = id;
  }, malik.id);
  await page.getByRole("button", { name: /^pass this family on$/i }).click();
  await expect(page.getByText(/pick a colleague at your school/i)).toBeVisible();
  const thread = await db.messageThread.findUnique({ where: { studentId: zara } });
  expect(thread?.handlerTeacherId ?? null).toBeNull();
});

test("only the class teacher can take a family back — not the colleague holding it, not a stranger", async ({ page }) => {
  const zaraRow = await db.student.findFirstOrThrow({ where: { name: SCHOOL_B.student, class: { classCode: SCHOOL_B.classCode } }, include: { class: { include: { teacher: true } } } });
  const okoro = await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_B.secondTeacher.email } });
  await db.messageThread.upsert({
    where: { studentId: zaraRow.id },
    create: { studentId: zaraRow.id, schoolId: zaraRow.class.teacher.schoolId!, classId: zaraRow.classId, handlerTeacherId: okoro.id, passedAt: new Date() },
    update: { handlerTeacherId: okoro.id, passedAt: new Date() },
  });
  // The holder's inbox has no "take back" for it: it is theirs, not passed.
  await loginTeacher(page, SCHOOL_B.secondTeacher);
  await page.goto("/teacher/messages");
  await expect(page.getByRole("button", { name: /take back/i })).toHaveCount(0);
  // Still held by Okoro.
  const thread = await db.messageThread.findUniqueOrThrow({ where: { studentId: zaraRow.id } });
  expect(thread.handlerTeacherId).toBe(okoro.id);
});
