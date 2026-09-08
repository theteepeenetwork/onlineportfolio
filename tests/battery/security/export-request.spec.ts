import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loginTeacher } from "../helpers";

// ===========================================================================
// A school asks one of its teachers for a copy of a class's data.
//
// docs/paid-tier-plan.md item 3, and the gap it names: "A subject access request
// lands on the school office, not the class teacher… But rule 5 says an admin
// never sees a pupil's work… That is a real gap, not an oversight to route
// around."
//
// THE PROPERTY THAT MATTERS MOST IS A NEGATIVE ONE. The admin gets a STATUS —
// asked, then done — and there is no route from their console to the file. That
// is asserted here rather than assumed, because it is the whole reason the
// feature is shaped this way instead of as a download button on the admin
// screen.
//
// Also proved: the ask reaches the teacher who holds the class, carrying the
// admin's own words; a second ask while one is outstanding is refused with the
// date of the first; only that class's teacher can mark it done; and an admin
// cannot ask about another school's class.
// ===========================================================================

const db = new PrismaClient();

type World = { schoolId: string; classId: string; className: string; adminEmail: string; teacherEmail: string; otherEmail: string };

async function makeSchool(tag: string): Promise<World> {
  const stamp = `${tag}-${Math.random().toString(36).slice(2, 7)}`;
  const school = await db.school.create({ data: { name: `Asking ${stamp}`, verifiedAt: new Date() } });
  await db.subscription.create({ data: { kind: "SCHOOL", status: "ACTIVE", schoolId: school.id } });
  const mk = (role: string, label: string) =>
    db.teacher.create({
      data: {
        name: `${label} ${stamp}`, displayName: label, email: `${label.toLowerCase()}-${stamp}@asking.test`,
        passwordHash: bcrypt.hashSync("password", 10), role, status: "ACTIVE", schoolId: school.id,
        emailConfirmedAt: new Date(),
      },
    });
  const admin = await mk("ADMIN", "Admin");
  const teacher = await mk("TEACHER", "Teacher");
  const other = await mk("TEACHER", "Other");
  const klass = await db.class.create({
    data: { name: `Robins ${stamp}`, classCode: `AS${stamp.slice(-4).toUpperCase()}`, teacherId: teacher.id, schoolId: school.id },
  });
  await db.student.create({ data: { name: "Amara", classId: klass.id, avatarColor: "#E08A9B" } });
  return { schoolId: school.id, classId: klass.id, className: klass.name, adminEmail: admin.email, teacherEmail: teacher.email, otherEmail: other.email };
}

async function teardown(w: World) {
  await db.exportRequest.deleteMany({ where: { schoolId: w.schoolId } });
  await db.student.deleteMany({ where: { classId: w.classId } });
  await db.class.deleteMany({ where: { schoolId: w.schoolId } });
  await db.auditLog.deleteMany({ where: { schoolId: w.schoolId } });
  await db.subscription.deleteMany({ where: { schoolId: w.schoolId } });
  await db.teacher.deleteMany({ where: { schoolId: w.schoolId } });
  await db.school.deleteMany({ where: { id: w.schoolId } });
}

async function onClasses(page: import("@playwright/test").Page, email: string) {
  await loginTeacher(page, { email, password: "password" });
  await page.waitForLoadState("networkidle");
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Classes" }).first().click();
}

test("the admin asks, the teacher is told, and the admin never sees the file", async ({ page, browser }) => {
  const w = await makeSchool("ask");
  try {
    await onClasses(page, w.adminEmail);
    await page.getByRole("button", { name: /Ask for a copy of this class/i }).click();
    await page.getByLabel(/What is it for/i).fill("A subject access request from a family.");
    await page.getByRole("button", { name: /^Ask$/ }).click();
    await expect(page.getByText(/waiting for their teacher/i)).toBeVisible({ timeout: 15_000 });

    const row = await db.exportRequest.findFirstOrThrow({ where: { classId: w.classId } });
    expect(row.fulfilledAt).toBeNull();
    expect(row.requestReason).toContain("subject access request");

    // THE NEGATIVE THAT MATTERS: nothing on the admin's console is a route to
    // the class's data. Rule 5 holds at the last step as well as everywhere
    // else, which is the whole reason the admin had to ask a teacher at all.
    const html = await page.content();
    expect(html, "an admin console must never offer a class export").not.toContain(`/teacher/export/${w.classId}`);
    const direct = await page.request.get(`/teacher/export/${w.classId}`);
    expect(direct.status(), "and the route itself refuses them").toBe(404);

    // A SECOND ASK IS REFUSED, with the date of the first — which is the thing
    // the admin actually wanted to know.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Classes" }).first().click();
    await expect(page.getByText(/Copy asked for on .* waiting for their teacher/i)).toBeVisible();

    // THE TEACHER IS TOLD, on the class it is about, in the admin's own words.
    const teacherCtx = await browser.newContext();
    const tPage = await teacherCtx.newPage();
    await loginTeacher(tPage, { email: w.teacherEmail, password: "password" });
    await tPage.waitForLoadState("networkidle");
    await tPage.goto(`/teacher/class?class=${w.classId}`);
    await expect(tPage.getByText(/Your school has asked you for a copy of this class/i)).toBeVisible();
    await expect(tPage.getByText(/A subject access request from a family/i)).toBeVisible();
    // And they can produce the file, which the admin could not.
    const theirs = await tPage.request.get(`/teacher/export/${w.classId}`);
    expect(theirs.status()).toBe(200);

    await tPage.getByRole("button", { name: /mark this done/i }).click();
    await expect(tPage.getByText(/Your school has asked you/i)).toHaveCount(0, { timeout: 15_000 });
    await teacherCtx.close();

    expect((await db.exportRequest.findFirstOrThrow({ where: { classId: w.classId } })).fulfilledAt).not.toBeNull();

    // The admin sees that it is done — and is told, in words, that they were
    // never shown what was in it.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Classes" }).first().click();
    await expect(page.getByText(/never showed you what was in it/i)).toBeVisible();

    // Both halves are on the record, and no child is named in either.
    const rows = await db.auditLog.findMany({ where: { schoolId: w.schoolId } });
    const asked = rows.find((r) => r.action === "CLASS_EXPORT_REQUESTED");
    const done = rows.find((r) => r.action === "CLASS_EXPORT_FULFILLED");
    expect(asked).toBeTruthy();
    expect(done).toBeTruthy();
    expect(asked?.detail).not.toContain("Amara");
    // The reason is NOT copied into the audit log: a second copy on a different
    // retention clock is the thing that keeps message bodies out of it too.
    expect(asked?.detail).not.toContain("subject access request");
  } finally {
    await teardown(w);
  }
});

test("only the class's own teacher can mark a request done", async ({ page }) => {
  const w = await makeSchool("wrong");
  try {
    const admin = await db.teacher.findFirstOrThrow({ where: { email: w.adminEmail } });
    const request = await db.exportRequest.create({
      data: {
        schoolId: w.schoolId, classId: w.classId, requestedByTeacherId: admin.id,
        requestedByName: "Admin", requestReason: "A subject access request from a family.",
      },
    });

    // A colleague at the same school, who does not hold this class.
    await loginTeacher(page, { email: w.otherEmail, password: "password" });
    await page.waitForLoadState("networkidle");
    // They cannot even see it: the band is rendered on the class, and the class
    // is not theirs.
    await page.goto(`/teacher/class?class=${w.classId}`);
    await expect(page.getByText(/Your school has asked you for a copy/i)).toHaveCount(0);

    // And the action refuses them, resolved through the class they hold rather
    // than by the request id they were given.
    const still = await db.exportRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(still.fulfilledAt).toBeNull();
  } finally {
    await teardown(w);
  }
});

test("cross-tenant: the class is resolved with the school, so a stale tab cannot reach another school's class", async ({ page }) => {
  const mine = await makeSchool("mine");
  const theirs = await makeSchool("theirs");
  try {
    await onClasses(page, mine.adminEmail);
    await page.getByRole("button", { name: /Ask for a copy of this class/i }).click();
    await page.getByLabel(/What is it for/i).fill("Asking about a class that has since left.");

    // THE TAMPER IS THE STALE TAB, not a forged field.
    //
    // The first version of this test wrote another school's id into the hidden
    // input through the DOM. React owns that input and writes it back on the
    // render the click itself causes, so the forged value never reached the
    // server and the test PASSED WHILE CREATING A REQUEST FOR MY OWN CLASS —
    // proving nothing. (That React wins here is a good property of the product;
    // it is just not a way to test the server.)
    //
    // So the id stays honest and its OWNERSHIP changes underneath the open form,
    // which is how this actually goes wrong in the world: an admin has the page
    // open while the class moves. The posted id is now another school's, and the
    // action must refuse it — which it does by resolving the class with `id` AND
    // `schoolId` together, never by id alone (rule 8).
    await db.class.update({ where: { id: mine.classId }, data: { schoolId: theirs.schoolId } });

    await page.getByRole("button", { name: /^Ask$/ }).click();
    await expect(page.getByText(/isn't one of yours/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.exportRequest.count({ where: { classId: mine.classId } })).toBe(0);
    expect(await db.exportRequest.count({ where: { schoolId: theirs.schoolId } })).toBe(0);

    // THE POSITIVE CONTROL, differing by that one column and nothing else: put
    // the class back and the same press succeeds. Without this the refusal above
    // could as easily be a broken form.
    await db.class.update({ where: { id: mine.classId }, data: { schoolId: mine.schoolId } });
    await page.getByRole("button", { name: /^Ask$/ }).click();
    await expect(page.getByText(/waiting for their teacher/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.exportRequest.count({ where: { classId: mine.classId } })).toBe(1);
  } finally {
    await db.class.updateMany({ where: { id: mine.classId }, data: { schoolId: mine.schoolId } });
    await teardown(mine);
    await teardown(theirs);
  }
});
