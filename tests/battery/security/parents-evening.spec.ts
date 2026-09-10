import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loginTeacher, loginParent } from "../helpers";

// ===========================================================================
// Parents' evening booking (SAFEGUARDING rule 23).
//
// FOUR PROPERTIES, and each is the reason a piece of this is shaped as it is:
//
//   • TWO FAMILIES CANNOT TAKE ONE SLOT. Asserted by racing two real bookings
//     at the same row and requiring exactly one winner — the thing the
//     conditional update exists for. A test that booked them one after the
//     other would pass against a plain `create` and prove nothing.
//   • A PARENT NEVER LEARNS WHO TOOK A SLOT. Asserted against the whole page
//     source, not against what is rendered: the reduction happens on the server,
//     so the other child's name and id must not be in the HTML at all.
//   • ONE APPOINTMENT PER CHILD PER EVENING, and booking again MOVES.
//   • Cross-tenant, and a parent cannot book for a child who is not theirs.
// ===========================================================================

const db = new PrismaClient();

type World = {
  schoolId: string;
  classId: string;
  className: string;
  teacherName: string;
  adminEmail: string;
  teacherEmail: string;
  childAId: string;
  childBId: string;
  childAName: string;
  childBName: string;
  famA: string;
  famB: string;
  parentIds: string[];
};

async function makeSchool(tag: string): Promise<World> {
  const stamp = `${tag}-${Math.random().toString(36).slice(2, 7)}`;
  const school = await db.school.create({ data: { name: `Evening ${stamp}`, verifiedAt: new Date() } });
  await db.subscription.create({ data: { kind: "SCHOOL", status: "ACTIVE", schoolId: school.id } });
  const mk = (role: string, label: string) =>
    db.teacher.create({
      data: {
        name: `${label} ${stamp}`, displayName: label, email: `${label.toLowerCase()}-${stamp}@evening.test`,
        passwordHash: bcrypt.hashSync("password", 10), role, status: "ACTIVE", schoolId: school.id,
        emailConfirmedAt: new Date(),
      },
    });
  const admin = await mk("ADMIN", "Admin");
  const teacher = await mk("TEACHER", "Teacher");
  const klass = await db.class.create({
    data: { name: `Robins ${stamp}`, classCode: `EV${stamp.slice(-4).toUpperCase()}`, teacherId: teacher.id, schoolId: school.id },
  });
  // Distinctive names, so "the other family's child is not in this HTML" is a
  // real assertion rather than a search for a word the page uses anyway.
  const childA = await db.student.create({ data: { name: `Amarantha${stamp.slice(-3)}`, classId: klass.id, avatarColor: "#E08A9B" } });
  const childB = await db.student.create({ data: { name: `Bartholomew${stamp.slice(-3)}`, classId: klass.id, avatarColor: "#8AA9E0" } });
  const pa = await db.parent.create({ data: { familyCode: `EVA${stamp.slice(-5).toUpperCase()}`, children: { connect: { id: childA.id } } } });
  const pb = await db.parent.create({ data: { familyCode: `EVB${stamp.slice(-5).toUpperCase()}`, children: { connect: { id: childB.id } } } });

  return {
    schoolId: school.id,
    classId: klass.id,
    className: klass.name,
    teacherName: teacher.displayName ?? teacher.name,
    adminEmail: admin.email,
    teacherEmail: teacher.email,
    childAId: childA.id,
    childBId: childB.id,
    childAName: childA.name,
    childBName: childB.name,
    famA: pa.familyCode,
    famB: pb.familyCode,
    parentIds: [pa.id, pb.id],
  };
}

async function teardown(w: World) {
  await db.meetingSlot.deleteMany({ where: { class: { schoolId: w.schoolId } } });
  await db.meetingEvent.deleteMany({ where: { schoolId: w.schoolId } });
  await db.parent.deleteMany({ where: { id: { in: w.parentIds } } });
  await db.student.deleteMany({ where: { class: { schoolId: w.schoolId } } });
  await db.class.deleteMany({ where: { schoolId: w.schoolId } });
  await db.auditLog.deleteMany({ where: { schoolId: w.schoolId } });
  await db.subscription.deleteMany({ where: { schoolId: w.schoolId } });
  await db.teacher.deleteMany({ where: { schoolId: w.schoolId } });
  await db.school.deleteMany({ where: { id: w.schoolId } });
}

/** An evening laid out directly, when the point of the test is the booking. */
async function layOut(w: World, title: string, times: string[]) {
  const admin = await db.teacher.findFirstOrThrow({ where: { email: w.adminEmail } });
  const teacher = await db.teacher.findFirstOrThrow({ where: { email: w.teacherEmail } });
  const event = await db.meetingEvent.create({
    data: {
      schoolId: w.schoolId, title, eventDate: "2026-10-14", slotMinutes: 10,
      createdByTeacherId: admin.id, createdByName: "Admin",
    },
  });
  await db.meetingSlot.createMany({
    data: times.map((t) => ({ eventId: event.id, teacherId: teacher.id, classId: w.classId, startsAt: new Date(t) })),
  });
  return event;
}

async function onEveningsTab(page: import("@playwright/test").Page, email: string) {
  await loginTeacher(page, { email, password: "password" });
  await page.waitForLoadState("networkidle");
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Evenings", exact: true }).first().click();
}

test("the school lays it out, a family books, the teacher sees the name and the office sees a number", async ({ page, browser }) => {
  const w = await makeSchool("book");
  try {
    await onEveningsTab(page, w.adminEmail);
    await page.getByRole("button", { name: /Set up an evening/i }).click();
    await page.getByLabel(/What is it called/i).fill("Autumn parents' evening");
    await page.getByLabel(/Which evening/i).fill("2026-10-14");
    await page.getByLabel(/^From$/).fill("16:00");
    await page.getByLabel(/^Until$/).fill("16:30");
    await page.getByRole("checkbox", { name: new RegExp(w.className) }).check();
    // The arithmetic is shown before the press, by the same pure function the
    // server uses. 16:00–16:30 in ten-minute slots is three.
    await expect(page.getByText(/3 appointments for each of 1 class/i)).toBeVisible();
    await page.getByRole("button", { name: /^Set it up$/ }).click();
    await expect(page.getByText(/3 appointments across 1 class/i)).toBeVisible({ timeout: 15_000 });

    const slots = await db.meetingSlot.findMany({ where: { classId: w.classId }, orderBy: { startsAt: "asc" } });
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => s.studentId === null)).toBe(true);

    // ── family A books ────────────────────────────────────────────────────
    const a = await browser.newContext();
    const pa = await a.newPage();
    await loginParent(pa, w.famA);
    await expect(pa.getByRole("heading", { name: /Autumn parents' evening/i })).toBeVisible();
    await pa.getByRole("button", { name: "4:10pm" }).click();
    await expect(pa.getByText(/Booked — 4:10pm/i)).toBeVisible({ timeout: 15_000 });
    await a.close();

    const booked = await db.meetingSlot.findFirstOrThrow({ where: { studentId: w.childAId } });
    expect(booked.bookedAt).not.toBeNull();

    // ── family B sees 4:10pm as taken, and cannot learn who took it ───────
    const b = await browser.newContext();
    const pb = await b.newPage();
    await loginParent(pb, w.famB);
    await expect(pb.getByRole("button", { name: "4:10pm" })).toBeDisabled();
    // THE ASSERTION THAT MATTERS. Against the whole page source, because the
    // reduction to a boolean happens on the server: if the other child's id or
    // name were in the payload, a rendered page could still look correct.
    const html = await pb.content();
    expect(html).not.toContain(w.childAName);
    expect(html).not.toContain(w.childAId);
    await b.close();

    // ── the teacher sees the name against the time ────────────────────────
    const t = await browser.newContext();
    const pt = await t.newPage();
    await loginTeacher(pt, { email: w.teacherEmail, password: "password" });
    await pt.goto("/teacher/meetings");
    await expect(pt.getByRole("rowheader", { name: "4:10pm" })).toBeVisible();
    await expect(pt.getByRole("row", { name: /4:10pm/ }).getByText(w.childAName)).toBeVisible();
    await expect(pt.getByText(new RegExp(`Not booked yet:.*${w.childBName}`))).toBeVisible();
    await t.close();

    // ── the office sees a count, and NEVER the child ──────────────────────
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Evenings", exact: true }).first().click();
    await expect(page.getByText(/1 of 3 booked/i)).toBeVisible({ timeout: 15_000 });
    expect(await page.content()).not.toContain(w.childAName);
  } finally {
    await teardown(w);
  }
});

test("two classes with one teacher are refused in words, not with a crashed page", async ({ page }) => {
  // The press that took the admin console down on 10 September 2026: the demo
  // admin holds three classes, chose two, and the (event, teacher, minute)
  // unique index threw through the transaction as an unhandled error. The
  // refusal now happens before anything is written, and the form says the same
  // thing before the press.
  const w = await makeSchool("twice");
  const teacher = await db.teacher.findFirstOrThrow({ where: { email: w.teacherEmail } });
  const second = await db.class.create({
    data: { name: `Wrens ${w.className.split(" ")[1]}`, classCode: `EW${w.className.slice(-4).toUpperCase()}`, teacherId: teacher.id, schoolId: w.schoolId },
  });
  try {
    await onEveningsTab(page, w.adminEmail);
    await page.getByRole("button", { name: /Set up an evening/i }).click();
    await page.getByLabel(/What is it called/i).fill("Both classes");
    await page.getByLabel(/Which evening/i).fill("2026-10-14");
    await page.getByLabel(/^From$/).fill("16:00");
    await page.getByLabel(/^Until$/).fill("16:30");
    await page.getByRole("checkbox", { name: new RegExp(w.className) }).check();
    await page.getByRole("checkbox", { name: new RegExp(second.name) }).check();
    // Said before the press, by the pure helper the action shares.
    await expect(page.getByText(/one person can't hold two appointments at the same time/i)).toBeVisible();

    // The press itself, because the form line is a convenience and the action
    // is the enforcement point: a stale tab can post any two ids it likes.
    await page.getByRole("button", { name: /^Set it up$/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: /one person can't hold two appointments/i })).toBeVisible({ timeout: 15_000 });
    expect(await db.meetingEvent.count({ where: { schoolId: w.schoolId } })).toBe(0);
    expect(await db.meetingSlot.count({ where: { class: { schoolId: w.schoolId } } })).toBe(0);

    // Positive control: untick one and the same press succeeds, so the refusal
    // was the clash and not the form.
    // After a server action React settles the form; an untick that lands in that
    // instant is put back. Wait for the button to re-enable, which is the end
    // of the transition, before touching the form again.
    await expect(page.getByRole("button", { name: /^Set it up$/ })).toBeEnabled();
    // THE TICKS SURVIVE THE REFUSAL. React 19 resets a form after its action
    // and restores controlled text inputs but not controlled checkboxes, so
    // without the form's `onReset` cancel these two came back unticked while the
    // preview line still counted them. Asserted, because it was found by this
    // test and not by reading the code.
    await expect(page.getByLabel(/What is it called/i)).toHaveValue("Both classes");
    await expect(page.getByRole("checkbox", { name: new RegExp(w.className) })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: new RegExp(second.name) })).toBeChecked();
    const wrens = page.getByRole("checkbox", { name: new RegExp(second.name) });
    await wrens.uncheck();
    await expect(wrens).not.toBeChecked();
    await expect(page.getByText(/3 appointments for each of 1 class/i)).toBeVisible();
    await page.getByRole("button", { name: /^Set it up$/ }).click();
    await expect(page.getByText(/3 appointments across 1 class/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.meetingEvent.count({ where: { schoolId: w.schoolId } })).toBe(1);
  } finally {
    await teardown(w);
  }
});

test("two families pressing the same time: exactly one gets it", async ({ browser }) => {
  const w = await makeSchool("race");
  try {
    await layOut(w, "Race night", ["2026-10-14T16:00:00.000Z"]);
    const slot = await db.meetingSlot.findFirstOrThrow({ where: { classId: w.classId } });

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pa = await ctxA.newPage();
    const pb = await ctxB.newPage();
    await loginParent(pa, w.famA);
    await loginParent(pb, w.famB);

    // Both press at once. Whichever loses must be TOLD it lost — a silent
    // second winner is the failure this feature is shaped to prevent.
    const [ra, rb] = await Promise.allSettled([
      pa.getByRole("button", { name: /^\d/ }).first().click().then(() => pa.waitForTimeout(2_000)),
      pb.getByRole("button", { name: /^\d/ }).first().click().then(() => pb.waitForTimeout(2_000)),
    ]);
    expect([ra.status, rb.status]).not.toContain("rejected");

    const rows = await db.meetingSlot.findMany({ where: { id: slot.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].studentId).not.toBeNull();
    // Exactly one child holds it, and it is one of the two who pressed.
    expect([w.childAId, w.childBId]).toContain(rows[0].studentId);
    // And nobody else got a row: one appointment existed, one appointment is held.
    expect(await db.meetingSlot.count({ where: { classId: w.classId, studentId: { not: null } } })).toBe(1);

    // The loser is told, in words, on their own screen.
    const loser = rows[0].studentId === w.childAId ? pb : pa;
    await expect(loser.getByText(/took that time just before you did/i)).toBeVisible({ timeout: 15_000 });

    await ctxA.close();
    await ctxB.close();
  } finally {
    await teardown(w);
  }
});

test("one appointment per child: booking again moves it, and a parent cannot book for another child", async ({ page }) => {
  const w = await makeSchool("one");
  try {
    await layOut(w, "Moving night", ["2026-10-14T16:00:00.000Z", "2026-10-14T16:10:00.000Z"]);
    const [first, second] = await db.meetingSlot.findMany({ where: { classId: w.classId }, orderBy: { startsAt: "asc" } });

    await loginParent(page, w.famA);
    await page.getByRole("button", { name: /^\d/ }).first().click();
    await expect(page.getByText(/^Booked — /i)).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await page.getByRole("button", { name: /^\d/ }).nth(1).click();
    await expect(page.getByText(/^Booked — /i)).toBeVisible({ timeout: 15_000 });

    // MOVED, not accumulated: a second appointment is one the rest of the class
    // cannot have.
    const held = await db.meetingSlot.findMany({ where: { studentId: w.childAId } });
    expect(held).toHaveLength(1);
    expect(held[0].id).toBe(second.id);
    expect((await db.meetingSlot.findFirstOrThrow({ where: { id: first.id } })).studentId).toBeNull();

    // ── and family A cannot book for family B's child ─────────────────────
    //
    // The stale-tab shape: the ids are real and the session is real, and the
    // only thing wrong is entitlement. React owns the hidden input's value, so
    // it is repointed on the DOM in the instant before the press.
    await page.reload();
    // Hydration must be over before the repoint, or React writes the real id
    // back over it and the press books the parent's own child instead of being
    // refused. Seen twice in three runs on 10 September 2026, never on the
    // server's side.
    await page.waitForLoadState("networkidle");
    await page.evaluate((foreign) => {
      for (const el of Array.from(document.querySelectorAll<HTMLInputElement>('input[name="studentId"]'))) el.value = foreign;
    }, w.childBId);
    await page.getByRole("button", { name: /^\d/ }).first().click();
    await expect(page.getByText(/isn't one of your children/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.meetingSlot.count({ where: { studentId: w.childBId } })).toBe(0);

    // The answer's TIME is never in an audit row — the teacher's list is where
    // a school reads who is coming when.
    const logged = await db.auditLog.findMany({ where: { schoolId: w.schoolId, action: "MEETING_BOOKED" } });
    expect(logged.length).toBeGreaterThan(0);
    for (const row of logged) expect(row.detail ?? "").not.toMatch(/\d{1,2}[:.]\d{2}/);
  } finally {
    await teardown(w);
  }
});

test("cross-tenant: one school's admin cannot lay an evening out on another school's class", async ({ page }) => {
  const a = await makeSchool("tenant-a");
  const b = await makeSchool("tenant-b");
  try {
    await onEveningsTab(page, b.adminEmail);
    await page.getByRole("button", { name: /Set up an evening/i }).click();
    // School A's class is not offered — the picker is built from B's own
    // classes — so the only way to aim at it is to post its id.
    await expect(page.getByRole("checkbox", { name: new RegExp(a.className) })).toHaveCount(0);

    await page.getByLabel(/What is it called/i).fill("Not yours");
    await page.getByLabel(/Which evening/i).fill("2026-10-14");
    await page.getByLabel(/^From$/).fill("16:00");
    await page.getByLabel(/^Until$/).fill("16:30");
    await page.getByRole("checkbox", { name: new RegExp(b.className) }).check();
    await page.evaluate((foreignId) => {
      const box = document.querySelector<HTMLInputElement>('input[name="classIds"]:checked');
      if (box) box.value = foreignId;
    }, a.classId);
    await page.getByRole("button", { name: /^Set it up$/ }).click();
    await expect(page.getByText(/isn't one of yours/i)).toBeVisible({ timeout: 15_000 });

    expect(await db.meetingEvent.count({ where: { schoolId: a.schoolId } })).toBe(0);
    expect(await db.meetingSlot.count({ where: { classId: a.classId } })).toBe(0);
  } finally {
    await teardown(a);
    await teardown(b);
  }
});
