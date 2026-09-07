import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, SCHOOL_C, loginParent, loginTeacher, studentIdFromLogin } from "../helpers";
import { EARLIEST_OPEN_MINUTE, LATEST_CLOSE_MINUTE, localParts } from "@/lib/messaging/officeHours";

// ===========================================================================
// SAFEGUARDING.md rule 21: a parent–teacher message is never delivered
// outside the school's office hours — a SECURITY property, not a UX one.
//
// What "delivered" means in code is that the recipient can read it. So the
// assertion is that a held message is unreachable by the recipient by every
// route the product has: the page they land on and the raw HTML underneath
// it. The sender, by contrast, always sees their own message with a label
// saying when it lands.
//
// Fixtures (prisma/seed-test.ts): Oakfield's only office hours fall on
// TOMORROW's weekday, so a send there is always held without any clock being
// faked. St Bede's has ordinary Monday–Friday hours, which the in-hours case
// rewrites around the real time — and skips, honestly, when the real time is
// outside StoryJar's own 06:00–20:00 caps, because then no valid window can
// be open and the product is right to hold everything.
// ===========================================================================

const db = new PrismaClient();

const oakfieldSchoolId = async () =>
  (await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_B.teacher.email }, select: { schoolId: true } })).schoolId!;
const bedesSchoolId = async () =>
  (await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_A.admin.email }, select: { schoolId: true } })).schoolId!;

async function sendAsParent(page: Page, text: string) {
  await page.getByLabel("Your message").fill(text);
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(page.getByRole("status")).toContainText(/sent/i);
  return page.getByRole("status").textContent();
}

// Unique so a leak is unmistakable and no other run's text can satisfy it.
const stamp = () => `held-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

test.afterAll(async () => {
  await db.$disconnect();
});

test.describe("a message written out of hours is held", () => {
  test("the parent is told exactly when it will arrive, and the teacher cannot see it until then", async ({ page, browser }) => {
    const body = `Please can Zara bring her reading book ${stamp()}`;
    await loginParent(page, SCHOOL_B.parentFamilyCode);
    const status = await sendAsParent(page, body);
    expect(status).toMatch(/outside school hours/i);
    expect(status).toMatch(/will get this at 8:00am tomorrow/i);

    // The sender sees their own held message, labelled.
    await expect(page.getByText(body)).toBeVisible();
    await expect(page.getByText(/will reach .* at 8:00am tomorrow/i).first()).toBeVisible();

    // In the database it is genuinely in the future, not merely hidden.
    const row = await db.message.findFirstOrThrow({ where: { messageBody: body } });
    expect(row.deliverAt.getTime()).toBeGreaterThan(Date.now());

    // The recipient: neither the inbox nor the thread page carries a word of it.
    const teacher = await browser.newContext();
    const tp = await teacher.newPage();
    await loginTeacher(tp, SCHOOL_B.teacher);
    const zara = await studentIdFromLogin(tp, SCHOOL_B.classCode, SCHOOL_B.student);
    await tp.goto(`/teacher/messages/${zara}`);
    await expect(tp.getByRole("heading", { name: /zara/i })).toBeVisible();
    expect(await tp.content()).not.toContain(body);
    await tp.goto("/teacher/messages");
    expect(await tp.content()).not.toContain(body);
    await teacher.close();
  });

  test("the read-side filter is what enforces it: a past deliverAt is visible, a future one is not", async ({ page }) => {
    await loginParent(page, SCHOOL_B.parentFamilyCode);
    await page.getByLabel("Your message").fill(`opening the thread ${stamp()}`);
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByRole("status")).toContainText(/sent/i);

    const zara = await db.student.findFirstOrThrow({ where: { name: SCHOOL_B.student, class: { classCode: SCHOOL_B.classCode } } });
    const thread = await db.messageThread.findUniqueOrThrow({ where: { studentId: zara.id } });
    const teacher = await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_B.teacher.email } });

    const delivered = `already delivered ${stamp()}`;
    const held = `still held ${stamp()}`;
    await db.message.createMany({
      data: [
        { threadId: thread.id, senderType: "TEACHER", senderTeacherId: teacher.id, messageBody: delivered, deliverAt: new Date(Date.now() - 60_000) },
        { threadId: thread.id, senderType: "TEACHER", senderTeacherId: teacher.id, messageBody: held, deliverAt: new Date(Date.now() + 6 * 3_600_000) },
      ],
    });

    await page.goto("/family");
    const html = await page.content();
    expect(html).toContain(delivered);
    expect(html).not.toContain(held);
  });

  test("a school with no office hours cannot receive a message at all — refused, not parked", async ({ page }) => {
    const schoolId = await oakfieldSchoolId();
    const policy = await db.messagingPolicy.findUniqueOrThrow({ where: { schoolId }, include: { windows: true } });
    await db.officeHourWindow.deleteMany({ where: { policyId: policy.id } });
    try {
      await loginParent(page, SCHOOL_B.parentFamilyCode);
      // The box is withheld when nothing can arrive; the reason is stated.
      await expect(page.getByText(/has not set any office hours yet/i)).toBeVisible();
      await expect(page.getByLabel("Your message")).toHaveCount(0);
    } finally {
      await db.officeHourWindow.createMany({ data: policy.windows.map((w) => ({ policyId: policy.id, weekday: w.weekday, openMinute: w.openMinute, closeMinute: w.closeMinute })) });
    }
  });
});

test.describe("a message written in hours arrives at once", () => {
  test("parent to teacher, delivered immediately", async ({ page, browser }) => {
    const now = new Date();
    const local = localParts(now, "Europe/London");
    // Inside the caps there is always a valid window containing now: open an
    // hour either side, clipped to 06:00–20:00.
    const open = Math.max(EARLIEST_OPEN_MINUTE, local.minute - 60);
    const close = Math.min(LATEST_CLOSE_MINUTE, local.minute + 60);
    test.skip(
      local.minute < EARLIEST_OPEN_MINUTE || local.minute >= LATEST_CLOSE_MINUTE || close <= open,
      `It is ${local.minute} minutes past midnight in London: outside StoryJar's 06:00–20:00 caps, no school can be open now, so this case cannot exist. The held path above is what runs at this hour.`,
    );

    const schoolId = await bedesSchoolId();
    const policy = await db.messagingPolicy.findUniqueOrThrow({ where: { schoolId }, include: { windows: true } });
    await db.officeHourWindow.deleteMany({ where: { policyId: policy.id } });
    await db.officeHourWindow.create({ data: { policyId: policy.id, weekday: local.weekday, openMinute: open, closeMinute: close } });
    try {
      const body = `Amara has a dentist appointment ${stamp()}`;
      await loginParent(page, SCHOOL_A.parentFamilyCode);
      const status = await sendAsParent(page, body);
      expect(status).not.toMatch(/outside school hours/i);

      const teacher = await browser.newContext();
      const tp = await teacher.newPage();
      await loginTeacher(tp, SCHOOL_A.admin); // teacher@school.uk teaches Sunflower
      const amara = await studentIdFromLogin(tp, SCHOOL_A.classCode, SCHOOL_A.student);
      await tp.goto(`/teacher/messages/${amara}`);
      await expect(tp.getByText(body)).toBeVisible();
      await teacher.close();
    } finally {
      await db.officeHourWindow.deleteMany({ where: { policyId: policy.id } });
      await db.officeHourWindow.createMany({ data: policy.windows.map((w) => ({ policyId: policy.id, weekday: w.weekday, openMinute: w.openMinute, closeMinute: w.closeMinute })) });
    }
  });
});

test.describe("the school's caps are enforced on the server", () => {
  test("an eleven-hour day and a five-in-the-morning start are both refused even when the form is bent", async ({ page }) => {
    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Messages" }).click();
    await expect(page.getByRole("heading", { name: /office hours/i })).toBeVisible();

    // Strip the browser-side limits so the server is the only thing left.
    const bend = async (open: string, close: string) => {
      await page.evaluate(([o, c]) => {
        const day = document.querySelector<HTMLInputElement>('input[name="day-1"]');
        if (day && !day.checked) day.click();
        for (const name of ["open-1", "close-1"]) {
          const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
          el?.removeAttribute("min");
          el?.removeAttribute("max");
          el?.removeAttribute("step");
        }
        const o1 = document.querySelector<HTMLInputElement>('input[name="open-1"]');
        const c1 = document.querySelector<HTMLInputElement>('input[name="close-1"]');
        if (o1) o1.value = o;
        if (c1) c1.value = c;
      }, [open, close]);
      await page.getByRole("button", { name: /save office hours/i }).click();
    };

    await bend("07:00", "18:00");
    await expect(page.getByText(/at most 10 hours/i)).toBeVisible();

    await bend("05:00", "12:00");
    await expect(page.getByText(/cannot open before 6:00am/i)).toBeVisible();

    await bend("11:00", "20:30");
    await expect(page.getByText(/cannot close after 8:00pm/i)).toBeVisible();

    // Nothing was written by any of them.
    const schoolId = await bedesSchoolId();
    const monday = await db.officeHourWindow.findFirst({ where: { policy: { schoolId }, weekday: 1 } });
    expect(monday?.openMinute).toBe(8 * 60);
    expect(monday?.closeMinute).toBe(16 * 60);
  });

  test("a teacher who is not an admin has no way to the hours", async ({ page }) => {
    await loginTeacher(page, SCHOOL_A.otherTeacher);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/teacher$/);
  });
});

test.describe("a paused school plan", () => {
  test("keeps what was said readable and refuses anything new, in the school's words", async ({ page }) => {
    // Larchwood is FROZEN. Its teacher can open the inbox and a thread but not write.
    await loginTeacher(page, SCHOOL_C.teacher);
    const pip = await studentIdFromLogin(page, SCHOOL_C.classCode, SCHOOL_C.student);
    await page.goto(`/teacher/messages/${pip}`);
    await expect(page.getByRole("heading", { name: /pip/i })).toBeVisible();
    await expect(page.getByLabel("Your message")).toHaveCount(0);
    await expect(page.getByText(/plan is paused/i)).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/FROZEN|subscription|billing/i);
  });
});
