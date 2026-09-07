import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, loginParent, loginTeacher, studentIdFromLogin } from "../helpers";

// ===========================================================================
// Sharing a family's conversation with a colleague (SAFEGUARDING.md rule 21).
//
// A share is a per-thread grant to staff of the SAME school who may message
// families. It gives the colleague exactly what the teacher has on that
// thread; it is visible to the parent in the reader list; and it ends the
// moment it is withdrawn. A share to anyone outside those bounds is refused
// on the server, whatever the form said.
// ===========================================================================

const db = new PrismaClient();
const stamp = () => `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function zaraId() {
  return (await db.student.findFirstOrThrow({ where: { name: SCHOOL_B.student, class: { classCode: SCHOOL_B.classCode } } })).id;
}

test.afterAll(async () => {
  await db.$disconnect();
});

test.afterEach(async () => {
  // Leave Zara's thread unshared for the next case.
  const zara = await zaraId();
  await db.messageThreadShare.deleteMany({ where: { thread: { studentId: zara } } });
});

test("shared, the colleague reads and replies; the parent sees their name; unshared, the door shuts", async ({ page, browser }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  const zara = await studentIdFromLogin(page, SCHOOL_B.classCode, SCHOOL_B.student);
  await page.goto(`/teacher/messages/${zara}`);
  await page.locator('form:has(button:text-is("Share")) select[name="teacherId"]').selectOption({ label: SCHOOL_B.secondTeacher.displayName });
  await page.getByRole("button", { name: /^share$/i }).click();
  await expect(page.getByRole("status")).toContainText(/Mr Okoro can now see this conversation/);

  // The parent is told who can read.
  const parent = await browser.newContext();
  const pp = await parent.newPage();
  await loginParent(pp, SCHOOL_B.parentFamilyCode);
  await expect(pp.getByText(/who can see this: .*Mr Okoro/i)).toBeVisible();
  await parent.close();

  // The colleague can read and reply.
  const colleague = await browser.newContext();
  const cp = await colleague.newPage();
  await loginTeacher(cp, SCHOOL_B.secondTeacher);
  await cp.goto("/teacher/messages");
  await expect(cp.getByText(/shared with you/i)).toBeVisible();
  await cp.goto(`/teacher/messages/${zara}`);
  const body = `From Mr Okoro ${stamp()}`;
  await cp.getByLabel("Your message").fill(body);
  await cp.getByRole("button", { name: /^send$/i }).click();
  await expect(cp.getByRole("status")).toContainText(/sent/i);

  // The class teacher sees the colleague's (held) reply — same side of the room.
  await page.reload();
  await expect(page.getByText(body)).toBeVisible();

  // Withdrawn: the colleague gets a 404, nothing else.
  await page.getByRole("button", { name: `Stop sharing with ${SCHOOL_B.secondTeacher.displayName}` }).click();
  await expect(page.getByRole("button", { name: `Stop sharing with ${SCHOOL_B.secondTeacher.displayName}` })).toHaveCount(0);
  const res = await cp.goto(`/teacher/messages/${zara}`);
  expect(res?.status()).toBe(404);
  await colleague.close();
});

test("a share to staff of another school, or to staff who may not message families, is refused on the server", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  const zara = await studentIdFromLogin(page, SCHOOL_B.classCode, SCHOOL_B.student);
  const malik = await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_A.otherTeacher.email } });
  const ta = await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_B.ta.email } });

  for (const target of [malik.id, ta.id]) {
    await page.goto(`/teacher/messages/${zara}`);
    // Let React hydrate before bending the form, or the submit is a plain
    // POST whose returned refusal is never painted (the server still refuses).
    await page.waitForLoadState("networkidle");
    // Put an id the picker never offered into the form.
    await page.evaluate((id) => {
      const form = Array.from(document.querySelectorAll("form")).find((f) => f.querySelector('button')?.textContent?.trim() === "Share");
      const sel = form?.querySelector<HTMLSelectElement>('select[name="teacherId"]');
      if (!sel) return;
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = "bent";
      sel.appendChild(opt);
      sel.value = id;
    }, target);
    await page.getByRole("button", { name: /^share$/i }).click();
    await expect(page.getByText(/pick a colleague at your school/i)).toBeVisible();
  }
  expect(await db.messageThreadShare.count({ where: { thread: { studentId: zara }, teacherId: { in: [malik.id, ta.id] } } })).toBe(0);
});

test("a colleague who leaves the school loses every share at once", async ({ page }) => {
  const zara = await zaraId();
  const okoro = await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_B.secondTeacher.email } });
  const zaraRow = await db.student.findUniqueOrThrow({ where: { id: zara }, include: { class: { include: { teacher: true } } } });
  const thread = await db.messageThread.upsert({
    where: { studentId: zara },
    create: { studentId: zara, schoolId: zaraRow.class.teacher.schoolId!, classId: zaraRow.classId },
    update: {},
  });
  await db.messageThreadShare.create({ data: { threadId: thread.id, teacherId: okoro.id } });

  await loginTeacher(page, SCHOOL_B.secondTeacher);
  await expect((await page.goto(`/teacher/messages/${zara}`))?.status()).toBe(200);

  // Removed from the school (removeStaff's active path: schoolId → null).
  await db.teacher.update({ where: { id: okoro.id }, data: { schoolId: null } });
  try {
    expect((await page.goto(`/teacher/messages/${zara}`))?.status()).toBe(404);
  } finally {
    await db.teacher.update({ where: { id: okoro.id }, data: { schoolId: zaraRow.class.teacher.schoolId } });
  }
});
