import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loginTeacher } from "../helpers";

// ===========================================================================
// A school closes its own account.
//
// The business manager's words, one of three findings she recorded as "could
// not carry on": "There is no way for me to close our account and have the
// children's data deleted… the only route I can see is emailing somebody and
// hoping."
//
// WHAT THIS PROVES, and the first one is the one that matters:
//
//   1. NOTHING IS DELETED. Counted either side, the way class-handover.spec.ts
//      counts for F68. Closing records an instruction; it does not erase, and it
//      must not, because owner decision D5 says school deletion does not exist
//      in v1 and handbook R12 blocks every deletion path until a restore has
//      been rehearsed (docs/restore-rehearsal.md).
//   2. The instruction is ON THE RECORD — date, admin, reason — because that is
//      the whole difference between this and emailing somebody and hoping.
//   3. Staff go back to their own free plans, keeping what they brought in.
//   4. The plan is frozen, so the school is read-only from that moment.
//   5. It cannot be done by accident: the school's name must be typed, and a
//      reason given, and BOTH are re-checked on the server rather than only in
//      the browser.
//   6. Cross-tenant: an admin cannot close another school.
// ===========================================================================

const db = new PrismaClient();

type World = { schoolId: string; schoolName: string; adminEmail: string; teacherId: string; broughtId: string; ownId: string; pupilId: string };

async function makeSchool(tag: string): Promise<World> {
  const stamp = `${tag}-${Math.random().toString(36).slice(2, 7)}`;
  const school = await db.school.create({ data: { name: `Closing ${stamp}`, verifiedAt: new Date() } });
  await db.subscription.create({ data: { kind: "SCHOOL", status: "ACTIVE", schoolId: school.id } });
  const mk = (role: string, label: string) =>
    db.teacher.create({
      data: {
        name: `${label} ${stamp}`, displayName: label, email: `${label.toLowerCase()}-${stamp}@closing.test`,
        passwordHash: bcrypt.hashSync("password", 10), role, status: "ACTIVE", schoolId: school.id,
        emailConfirmedAt: new Date(),
      },
    });
  const admin = await mk("ADMIN", "Admin");
  const teacher = await mk("TEACHER", "Teacher");
  const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();
  // One she ARRIVED with, one the school made and gave her.
  const brought = await db.class.create({
    data: { name: "Brought In", classCode: code(), teacherId: teacher.id, schoolId: school.id, broughtInByTeacherId: teacher.id },
  });
  const own = await db.class.create({
    data: { name: "School's Own", classCode: code(), teacherId: teacher.id, schoolId: school.id },
  });
  const pupil = await db.student.create({ data: { name: "Amara", classId: own.id, avatarColor: "#E08A9B" } });
  await db.journalItem.create({
    data: { type: "TEXT", textContent: "hello", status: "APPROVED", studentId: pupil.id, classId: own.id, authorRole: "STUDENT" },
  });
  return { schoolId: school.id, schoolName: school.name, adminEmail: admin.email, teacherId: teacher.id, broughtId: brought.id, ownId: own.id, pupilId: pupil.id };
}

async function teardown(w: World) {
  await db.journalItem.deleteMany({ where: { student: { class: { OR: [{ id: w.broughtId }, { id: w.ownId }] } } } });
  await db.student.deleteMany({ where: { classId: { in: [w.broughtId, w.ownId] } } });
  await db.class.deleteMany({ where: { id: { in: [w.broughtId, w.ownId] } } });
  await db.auditLog.deleteMany({ where: { schoolId: w.schoolId } });
  await db.subscription.deleteMany({ where: { OR: [{ schoolId: w.schoolId }, { teacherId: w.teacherId }] } });
  await db.teacher.deleteMany({ where: { OR: [{ schoolId: w.schoolId }, { id: w.teacherId }] } });
  await db.school.deleteMany({ where: { id: w.schoolId } });
}

async function onBilling(page: import("@playwright/test").Page, email: string) {
  await loginTeacher(page, { email, password: "password" });
  // Settle the sign-in redirect before navigating, or the goto aborts the
  // navigation already running (the ERR_ABORTED class-rollover.spec.ts hit).
  await page.waitForLoadState("networkidle");
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Billing" }).click();
}

test("closing records the instruction, releases the staff, and deletes nothing", async ({ page }) => {
  const w = await makeSchool("close");
  try {
    const before = {
      classes: await db.class.count({ where: { id: { in: [w.broughtId, w.ownId] } } }),
      pupils: await db.student.count({ where: { classId: { in: [w.broughtId, w.ownId] } } }),
      moments: await db.journalItem.count({ where: { studentId: w.pupilId } }),
    };

    await onBilling(page, w.adminEmail);
    // The card says what it does and what it does not, BEFORE the press.
    await expect(page.getByText(/Nothing is deleted by closing/i)).toBeVisible();
    await expect(page.getByText(/Ask your teachers to export their classes first/i)).toBeVisible();

    await page.getByRole("button", { name: /Close this account/i }).click();
    await page.getByLabel(/Why is the school closing/i).fill("Moving to a different system at the end of term.");
    await page.getByLabel(/Type .* to confirm/i).fill(w.schoolName);
    await page.getByRole("button", { name: /^Close the account$/ }).click();
    // THE ADMIN IS SENT TO THEIR OWN ACCOUNT PAGE, and this is the behaviour
    // rather than a redirect for tidiness. Closing detaches every member of
    // staff INCLUDING the admin who pressed it, so a moment later `requireAdmin`
    // no longer knows them and the console bounces them to /teacher. Left alone,
    // the most consequential action in the product threw the person who took it
    // out of the room with no word about whether it had worked; this test is
    // what found that.
    await expect(page.getByText(/account is closed and the instruction is recorded/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Nothing has been deleted/i)).toBeVisible();

    // 1. NOTHING WAS DELETED.
    expect(await db.class.count({ where: { id: { in: [w.broughtId, w.ownId] } } })).toBe(before.classes);
    expect(await db.student.count({ where: { classId: { in: [w.broughtId, w.ownId] } } })).toBe(before.pupils);
    expect(await db.journalItem.count({ where: { studentId: w.pupilId } })).toBe(before.moments);
    expect(await db.school.findUnique({ where: { id: w.schoolId } }), "the School row is the billing stub and stays").not.toBeNull();

    // 2. The instruction is on the record, with the reason and no child in it.
    const school = await db.school.findUniqueOrThrow({ where: { id: w.schoolId } });
    expect(school.closedAt).not.toBeNull();
    expect(school.closureReason).toContain("different system");
    const closed = await db.auditLog.findFirstOrThrow({ where: { schoolId: w.schoolId, action: "SCHOOL_CLOSED" } });
    expect(closed.detail).toContain("Nothing has been deleted");
    expect(closed.detail, "no child is named in the record of an adult's decision").not.toContain("Amara");

    // 3. Staff are back on their own plans, with what they brought.
    const teacher = await db.teacher.findUniqueOrThrow({ where: { id: w.teacherId } });
    expect(teacher.schoolId).toBeNull();
    expect(teacher.role).toBe("TEACHER");
    expect((await db.subscription.findUnique({ where: { teacherId: w.teacherId } }))?.kind).toBe("FREE");
    expect((await db.class.findUniqueOrThrow({ where: { id: w.broughtId } })).schoolId, "she keeps what she brought").toBeNull();
    expect((await db.class.findUniqueOrThrow({ where: { id: w.ownId } })).schoolId, "the school's own stays the school's").toBe(w.schoolId);

    // 4. The plan is frozen.
    expect((await db.subscription.findUniqueOrThrow({ where: { schoolId: w.schoolId } })).status).toBe("FROZEN");
  } finally {
    await teardown(w);
  }
});

test("it cannot be done by accident: the name and the reason are re-checked on the server", async ({ page }) => {
  const w = await makeSchool("guard");
  try {
    await onBilling(page, w.adminEmail);
    await page.getByRole("button", { name: /Close this account/i }).click();

    // A reason too short to be an instruction.
    await page.getByLabel(/Why is the school closing/i).fill("no");
    await page.getByLabel(/Type .* to confirm/i).fill(w.schoolName);
    await page.getByRole("button", { name: /^Close the account$/ }).click();
    await expect(page.getByText(/say in a sentence why/i)).toBeVisible({ timeout: 15_000 });
    expect((await db.school.findUniqueOrThrow({ where: { id: w.schoolId } })).closedAt).toBeNull();

    // The wrong name, with a good reason. THE FORM IS BENT rather than a POST
    // built by hand — that is how a stale tab or a tampered form actually
    // arrives (agent-memory: forge by tampering with a form the server rendered).
    await page.getByLabel(/Why is the school closing/i).fill("Moving to a different system at the end of term.");
    await page.getByLabel(/Type .* to confirm/i).fill("Some Other School");
    await page.getByRole("button", { name: /^Close the account$/ }).click();
    await expect(page.getByText(/Type the school's name exactly/i)).toBeVisible({ timeout: 15_000 });
    expect((await db.school.findUniqueOrThrow({ where: { id: w.schoolId } })).closedAt).toBeNull();

    // THE POSITIVE CONTROL: the same form, with the right name, does close it —
    // so the two refusals above are the guard working and not the form being
    // broken.
    await page.getByLabel(/Type .* to confirm/i).fill(w.schoolName);
    await page.getByRole("button", { name: /^Close the account$/ }).click();
    await expect(page.getByText(/account is closed and the instruction is recorded/i)).toBeVisible({ timeout: 15_000 });
    expect((await db.school.findUniqueOrThrow({ where: { id: w.schoolId } })).closedAt).not.toBeNull();
  } finally {
    await teardown(w);
  }
});

test("cross-tenant: an admin cannot close another school", async ({ page }) => {
  const mine = await makeSchool("mine");
  const theirs = await makeSchool("theirs");
  try {
    await onBilling(page, mine.adminEmail);
    await page.getByRole("button", { name: /Close this account/i }).click();
    await page.getByLabel(/Why is the school closing/i).fill("Trying to close somebody else's school.");
    // Their name, on my form. The action resolves the school from the SESSION
    // and never from anything posted, so the confirmation cannot match.
    await page.getByLabel(/Type .* to confirm/i).fill(theirs.schoolName);
    await page.getByRole("button", { name: /^Close the account$/ }).click();
    await expect(page.getByText(/Type the school's name exactly/i)).toBeVisible({ timeout: 15_000 });

    expect((await db.school.findUniqueOrThrow({ where: { id: theirs.schoolId } })).closedAt).toBeNull();
    expect((await db.school.findUniqueOrThrow({ where: { id: mine.schoolId } })).closedAt).toBeNull();
    expect((await db.teacher.findUniqueOrThrow({ where: { id: theirs.teacherId } })).schoolId).toBe(theirs.schoolId);
  } finally {
    await teardown(mine);
    await teardown(theirs);
  }
});
