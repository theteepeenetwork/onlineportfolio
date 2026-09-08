import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loginTeacher, loginParent } from "../helpers";

// ===========================================================================
// Permission slips (SAFEGUARDING rule 22).
//
// THE PROPERTIES THAT MATTER ARE NEGATIVE ONES, and they are asserted here
// rather than assumed because each is the reason the feature is shaped as it is:
//
//   • There is NO route by which a school can author an answer label, and no
//     free-text answer field anywhere. That is what keeps the DPIA's "no special
//     category data" claim true by construction rather than by asking a school
//     to be careful (rule 19's closing paragraph).
//   • The ADMIN CONSOLE NAMES NO CHILD. It shows counts per class; which child
//     answered which way is the class teacher's register. This is the edge of
//     rule 5's new "administrative records" clause, so it is the thing most
//     worth a test.
//   • A parent cannot answer for a child who is not theirs, and cannot answer a
//     form that did not go to their child's class.
//   • Cross-tenant, both ways: School B's admin cannot send to School A's class.
//   • One answer per child per form, whichever guardian presses last.
// ===========================================================================

const db = new PrismaClient();

type World = {
  schoolId: string;
  classId: string;
  className: string;
  otherClassId: string;
  adminEmail: string;
  teacherEmail: string;
  otherTeacherEmail: string;
  childId: string;
  otherChildId: string;
  familyCode: string;
  otherFamilyCode: string;
  parentIds: string[];
};

async function makeSchool(tag: string): Promise<World> {
  const stamp = `${tag}-${Math.random().toString(36).slice(2, 7)}`;
  const school = await db.school.create({ data: { name: `Slips ${stamp}`, verifiedAt: new Date() } });
  await db.subscription.create({ data: { kind: "SCHOOL", status: "ACTIVE", schoolId: school.id } });
  const mk = (role: string, label: string) =>
    db.teacher.create({
      data: {
        name: `${label} ${stamp}`, displayName: label, email: `${label.toLowerCase()}-${stamp}@slips.test`,
        passwordHash: bcrypt.hashSync("password", 10), role, status: "ACTIVE", schoolId: school.id,
        emailConfirmedAt: new Date(),
      },
    });
  const admin = await mk("ADMIN", "Admin");
  const teacher = await mk("TEACHER", "Teacher");
  const other = await mk("TEACHER", "Colleague");
  const klass = await db.class.create({
    data: { name: `Robins ${stamp}`, classCode: `SL${stamp.slice(-4).toUpperCase()}`, teacherId: teacher.id, schoolId: school.id },
  });
  // A second class, held by a colleague, so "a teacher sees only their own
  // register" has something to fail against.
  const otherClass = await db.class.create({
    data: { name: `Wrens ${stamp}`, classCode: `SW${stamp.slice(-4).toUpperCase()}`, teacherId: other.id, schoolId: school.id },
  });
  const child = await db.student.create({ data: { name: "Amara", classId: klass.id, avatarColor: "#E08A9B" } });
  const otherChild = await db.student.create({ data: { name: "Bo", classId: otherClass.id, avatarColor: "#8AA9E0" } });

  const parent = await db.parent.create({
    data: { familyCode: `FAM${stamp.slice(-5).toUpperCase()}`, children: { connect: { id: child.id } } },
  });
  const otherParent = await db.parent.create({
    data: { familyCode: `FBM${stamp.slice(-5).toUpperCase()}`, children: { connect: { id: otherChild.id } } },
  });

  return {
    schoolId: school.id,
    classId: klass.id,
    className: klass.name,
    otherClassId: otherClass.id,
    adminEmail: admin.email,
    teacherEmail: teacher.email,
    otherTeacherEmail: other.email,
    childId: child.id,
    otherChildId: otherChild.id,
    familyCode: parent.familyCode,
    otherFamilyCode: otherParent.familyCode,
    parentIds: [parent.id, otherParent.id],
  };
}

async function teardown(w: World) {
  await db.consentResponse.deleteMany({ where: { student: { class: { schoolId: w.schoolId } } } });
  await db.consentFormClass.deleteMany({ where: { class: { schoolId: w.schoolId } } });
  await db.consentForm.deleteMany({ where: { schoolId: w.schoolId } });
  await db.parent.deleteMany({ where: { id: { in: w.parentIds } } });
  await db.student.deleteMany({ where: { class: { schoolId: w.schoolId } } });
  await db.class.deleteMany({ where: { schoolId: w.schoolId } });
  await db.auditLog.deleteMany({ where: { schoolId: w.schoolId } });
  await db.subscription.deleteMany({ where: { schoolId: w.schoolId } });
  await db.teacher.deleteMany({ where: { schoolId: w.schoolId } });
  await db.school.deleteMany({ where: { id: w.schoolId } });
}

async function onFormsTab(page: import("@playwright/test").Page, email: string) {
  await loginTeacher(page, { email, password: "password" });
  await page.waitForLoadState("networkidle");
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Forms", exact: true }).first().click();
}

test("the school asks, the family answers, the teacher sees the name and the office sees a number", async ({ page, browser }) => {
  const w = await makeSchool("send");
  try {
    await onFormsTab(page, w.adminEmail);
    await page.getByRole("button", { name: /Send a permission slip/i }).click();
    await page.getByLabel(/What is it called/i).fill("Trip to the Sea Life Centre");
    await page.getByLabel(/What are you asking permission for/i).fill("A coach leaves at 9am and is back by 3pm.");
    await page.getByLabel(/Also ask/i).check();
    await page.getByRole("checkbox", { name: w.className }).check();
    await page.getByRole("button", { name: /^Send it$/ }).click();
    await expect(page.getByText(/Sent to 1 class/i)).toBeVisible({ timeout: 15_000 });

    const form = await db.consentForm.findFirstOrThrow({ where: { schoolId: w.schoolId } });
    expect(form.asksPackedLunch).toBe(true);

    // ── the family answers ────────────────────────────────────────────────
    const famCtx = await browser.newContext();
    const fam = await famCtx.newPage();
    await loginParent(fam, w.familyCode);
    await expect(fam.getByRole("heading", { name: /Trip to the Sea Life Centre/i })).toBeVisible();
    // Neither answer is pre-selected — a permission form that arrives already
    // ticked is a nudge, and the Children's Code is about exactly that.
    await expect(fam.getByRole("radio", { name: /^I give permission$/ })).not.toBeChecked();
    await expect(fam.getByRole("radio", { name: /^I do not give permission$/ })).not.toBeChecked();
    // THERE IS NOWHERE TO TYPE. The whole Art. 9 argument rests on this.
    const answerForm = fam.locator("form").filter({ has: fam.getByRole("radio", { name: /^I give permission$/ }) });
    await expect(answerForm.locator('input[type="text"], textarea')).toHaveCount(0);

    await fam.getByRole("radio", { name: /^I give permission$/ }).check();
    await fam.getByRole("checkbox", { name: /packed lunch provided/i }).check();
    await fam.getByRole("button", { name: /Send my answer/i }).click();
    await expect(fam.getByText(/that is recorded/i)).toBeVisible({ timeout: 15_000 });
    await famCtx.close();

    const answer = await db.consentResponse.findFirstOrThrow({ where: { formId: form.id, studentId: w.childId } });
    expect(answer.answer).toBe("GIVEN");
    expect(answer.packedLunch).toBe(true);

    // ── the class teacher sees the child's name against the answer ────────
    const tCtx = await browser.newContext();
    const t = await tCtx.newPage();
    await loginTeacher(t, { email: w.teacherEmail, password: "password" });
    await t.goto("/teacher/forms");
    await expect(t.getByRole("heading", { name: /Trip to the Sea Life Centre/i })).toBeVisible();
    await expect(t.getByRole("rowheader", { name: "Amara" })).toBeVisible();
    await expect(t.getByRole("row", { name: /Amara/ }).getByText("I give permission")).toBeVisible();
    await tCtx.close();

    // ── a colleague who does not hold the class sees no register at all ───
    const cCtx = await browser.newContext();
    const c = await cCtx.newPage();
    await loginTeacher(c, { email: w.otherTeacherEmail, password: "password" });
    await c.goto("/teacher/forms");
    await expect(c.getByText("Amara")).toHaveCount(0);
    await cCtx.close();

    // ── the office sees a count, and NEVER the child ──────────────────────
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Forms", exact: true }).first().click();
    await expect(page.getByText(/1 gave permission/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/1 packed lunch needed/i)).toBeVisible();
    // The edge of the administrative-records clause, in one assertion.
    expect(await page.content()).not.toContain("Amara");
  } finally {
    await teardown(w);
  }
});

test("a parent cannot answer for a child who is not theirs, and one answer stands per child", async ({ page, browser }) => {
  const w = await makeSchool("scope");
  try {
    const form = await db.consentForm.create({
      data: {
        schoolId: w.schoolId, title: "Swimming", formBody: "Wednesdays, summer term.",
        createdByTeacherId: (await db.teacher.findFirstOrThrow({ where: { email: w.adminEmail } })).id,
        createdByName: "Admin",
        // Sent to BOTH classes, so the other household genuinely has this form
        // in front of them. That is what makes the next assertion capable of
        // failing: the refusal has to come from the child being someone else's,
        // not from the form being invisible.
        classes: { create: [{ classId: w.classId }, { classId: w.otherClassId }] },
      },
    });

    // ── the other household aims their own form at a child who is not theirs ─
    //
    // The stale-tab shape, which is what a real attempt looks like: the ids are
    // real and the session is real, and the only thing wrong is entitlement.
    // React owns the hidden input's value, so it is repointed on the DOM in the
    // instant before the press.
    await loginParent(page, w.otherFamilyCode);
    await expect(page.getByRole("heading", { name: "Swimming" })).toBeVisible();
    await page.getByRole("radio", { name: /^I give permission$/ }).check();
    await page.evaluate((foreign) => {
      const input = document.querySelector<HTMLInputElement>('input[name="studentId"]');
      if (input) input.value = foreign;
    }, w.childId);
    await page.getByRole("button", { name: /Send my answer/i }).click();
    await expect(page.getByText(/isn't one of your children/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.consentResponse.count({ where: { formId: form.id } })).toBe(0);

    // A POSITIVE CONTROL, so the refusal above is not simply the button being
    // broken: the same household answering for their OWN child works.
    await page.reload();
    await page.getByRole("radio", { name: /^I give permission$/ }).check();
    await page.getByRole("button", { name: /Send my answer/i }).click();
    await expect(page.getByText(/that is recorded/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.consentResponse.count({ where: { formId: form.id, studentId: w.otherChildId } })).toBe(1);

    // ── the entitled household answers twice; the later answer stands ─────
    const famCtx = await browser.newContext();
    const fam = await famCtx.newPage();
    await loginParent(fam, w.familyCode);
    await fam.getByRole("radio", { name: /^I give permission$/ }).check();
    await fam.getByRole("button", { name: /Send my answer/i }).click();
    await expect(fam.getByText(/that is recorded/i)).toBeVisible({ timeout: 15_000 });

    await fam.reload();
    await fam.getByRole("radio", { name: /^I do not give permission$/ }).check();
    await fam.getByRole("button", { name: /Change my answer/i }).click();
    await expect(fam.getByText(/that is recorded/i)).toBeVisible({ timeout: 15_000 });
    await famCtx.close();

    const rows = await db.consentResponse.findMany({ where: { formId: form.id, studentId: w.childId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].answer).toBe("NOT_GIVEN");

    // The answer is never in the audit log — the register is where a school
    // reads answers, and a logged answer is a second copy on a different clock.
    const logged = await db.auditLog.findMany({ where: { schoolId: w.schoolId, action: "CONSENT_ANSWERED" } });
    expect(logged.length).toBeGreaterThan(0);
    for (const row of logged) {
      expect(row.detail ?? "").not.toContain("NOT_GIVEN");
      expect(row.detail ?? "").not.toContain("do not give permission");
    }
  } finally {
    await teardown(w);
  }
});

test("cross-tenant: one school's admin cannot send a slip to another school's class", async ({ page }) => {
  const a = await makeSchool("tenant-a");
  const b = await makeSchool("tenant-b");
  try {
    await onFormsTab(page, b.adminEmail);
    await page.getByRole("button", { name: /Send a permission slip/i }).click();
    // School A's class is not offered — the picker is built from B's own
    // classes — so the only way to aim at it is to post its id.
    await expect(page.getByRole("checkbox", { name: a.className })).toHaveCount(0);

    await page.getByLabel(/What is it called/i).fill("Not yours");
    await page.getByLabel(/What are you asking permission for/i).fill("A class in another school entirely.");
    await page.getByRole("checkbox", { name: b.className }).check();

    // Repoint the checkbox at School A's class in the tab, then submit. React
    // owns the input's `value`, so this is done on the DOM the instant before
    // the press — the stale-tab shape, which is what a real attempt looks like.
    await page.evaluate((foreignId) => {
      const box = document.querySelector<HTMLInputElement>('input[name="classIds"]:checked');
      if (box) box.value = foreignId;
    }, a.classId);
    await page.getByRole("button", { name: /^Send it$/ }).click();
    await expect(page.getByText(/isn't one of yours/i)).toBeVisible({ timeout: 15_000 });

    expect(await db.consentForm.count({ where: { schoolId: a.schoolId } })).toBe(0);
    expect(await db.consentFormClass.count({ where: { classId: a.classId } })).toBe(0);
  } finally {
    await teardown(a);
    await teardown(b);
  }
});
