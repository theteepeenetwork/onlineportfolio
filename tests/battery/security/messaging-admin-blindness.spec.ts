import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// The school governs the channel, not the conversation (SAFEGUARDING.md rules
// 5 and 21). A school admin sets the hours and who may message families, and
// can see METADATA about threads. A message body never reaches the admin
// console — including for an admin who also teaches a class elsewhere in the
// school, and including in the server-rendered payload underneath the page,
// not only what is painted.
// ===========================================================================

const db = new PrismaClient();
const stamp = () => `adm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function seedDeliveredMessage(studentName: string, classCode: string) {
  const student = await db.student.findFirstOrThrow({ where: { name: studentName, class: { classCode } }, include: { class: { include: { teacher: true } } } });
  const thread = await db.messageThread.upsert({
    where: { studentId: student.id },
    create: { studentId: student.id, schoolId: student.class.teacher.schoolId!, classId: student.classId, lastMessageAt: new Date() },
    update: { lastMessageAt: new Date() },
  });
  const body = `${studentName} has been unsettled at home this week ${stamp()}`;
  await db.message.create({ data: { threadId: thread.id, senderType: "PARENT", messageBody: body, deliverAt: new Date(Date.now() - 60_000) } });
  return body;
}

test.afterAll(async () => {
  await db.$disconnect();
});

test("an admin who teaches nothing sees no message text anywhere on the console", async ({ page }) => {
  const body = await seedDeliveredMessage(SCHOOL_B.student, SCHOOL_B.classCode);
  await loginTeacher(page, SCHOOL_B.admin);
  await page.goto("/admin");
  expect(await page.content()).not.toContain(body);
  for (const tab of ["Messages", "Audit log", "Overview", "Classes"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    expect(await page.content()).not.toContain(body);
  }
});

test("an admin who ALSO teaches a class sees no message text on the console either — only on their own thread page", async ({ page }) => {
  // teacher@school.uk is St Bede's admin and teaches Sunflower.
  const body = await seedDeliveredMessage(SCHOOL_A.student, SCHOOL_A.classCode);
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/admin");
  expect(await page.content()).not.toContain(body);
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  expect(await page.content()).not.toContain(body);
  // The teacher's own thread page, by contrast, is where it belongs.
  const amara = await db.student.findFirstOrThrow({ where: { name: SCHOOL_A.student, class: { classCode: SCHOOL_A.classCode } } });
  await page.goto(`/teacher/messages/${amara.id}`);
  await expect(page.getByText(body)).toBeVisible();
});

test("no message text reaches an audit row or the audit tab", async ({ page }) => {
  const rows = await db.auditLog.findMany({ where: { action: { in: ["MESSAGE_SENT", "THREAD_SHARED", "THREAD_UNSHARED", "THREAD_PASSED", "THREAD_TAKEN_BACK"] } } });
  const bodies = await db.message.findMany({ select: { messageBody: true } });
  for (const r of rows) {
    for (const b of bodies) {
      if (b.messageBody.length >= 12) expect(r.detail ?? "").not.toContain(b.messageBody);
    }
  }
  await loginTeacher(page, SCHOOL_B.admin);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Audit log", exact: true }).click();
  const html = await page.content();
  for (const b of bodies) if (b.messageBody.length >= 12) expect(html).not.toContain(b.messageBody);
});
