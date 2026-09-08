import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loginTeacher, loginParent } from "../helpers";

// ===========================================================================
// Escalation to a named safeguarding lead (SAFEGUARDING rule 21a).
//
// FIVE PROPERTIES, and each is a decision the feature would be wrong without:
//
//   • A LEAD READS WHAT WAS RAISED TO THEM AND NOTHING ELSE. Being named a lead
//     grants no standing access: the assertion is that a second family's
//     conversation, in the same school, stays a 404 to them.
//   • A NON-LEAD CANNOT BE RAISED TO. There is no role default, so a school with
//     nobody named has nobody to raise to — and a colleague who is merely
//     eligible for an ordinary share is refused.
//   • THE REASON NEVER REACHES AN AUDIT ROW. It is the most sensitive free text
//     in the product; the log records who, to whom, and when.
//   • THE PARENT'S PAGES NEVER SAY "SAFEGUARDING". The reader list gains a name
//     — that is rule 21's existing transparency — and nothing else changes.
//   • Cross-tenant: a lead at School B cannot be raised to from School A.
// ===========================================================================

const db = new PrismaClient();

type World = {
  schoolId: string;
  teacherEmail: string;
  leadEmail: string;
  plainEmail: string;
  leadId: string;
  plainId: string;
  childId: string;
  childName: string;
  otherChildId: string;
  famCode: string;
  parentIds: string[];
};

async function makeSchool(tag: string): Promise<World> {
  const stamp = `${tag}-${Math.random().toString(36).slice(2, 7)}`;
  const school = await db.school.create({ data: { name: `Raise ${stamp}`, verifiedAt: new Date() } });
  await db.subscription.create({ data: { kind: "SCHOOL", status: "ACTIVE", schoolId: school.id } });
  // Messaging on, wide hours, so nothing in this spec is about the hold.
  await db.messagingPolicy.create({
    data: {
      schoolId: school.id,
      enabled: true,
      windows: { create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, openMinute: 6 * 60, closeMinute: 16 * 60 })) },
    },
  });
  const mk = (role: string, label: string, extra: Record<string, unknown> = {}) =>
    db.teacher.create({
      data: {
        name: `${label} ${stamp}`, displayName: label, email: `${label.toLowerCase()}-${stamp}@raise.test`,
        passwordHash: bcrypt.hashSync("password", 10), role, status: "ACTIVE", schoolId: school.id,
        emailConfirmedAt: new Date(), ...extra,
      },
    });
  await mk("ADMIN", "Admin");
  const teacher = await mk("TEACHER", "Teacher");
  const lead = await mk("TEACHER", "Lead", { isSafeguardingLead: true });
  const plain = await mk("TEACHER", "Plain");

  const klass = await db.class.create({
    data: { name: `Robins ${stamp}`, classCode: `RS${stamp.slice(-4).toUpperCase()}`, teacherId: teacher.id, schoolId: school.id },
  });
  const child = await db.student.create({ data: { name: `Amara${stamp.slice(-3)}`, classId: klass.id, avatarColor: "#E08A9B" } });
  // A SECOND child in the SAME class, so "a lead reads only what was raised"
  // cannot pass merely because the other child is out of reach anyway.
  const otherChild = await db.student.create({ data: { name: `Bo${stamp.slice(-3)}`, classId: klass.id, avatarColor: "#8AA9E0" } });
  const parent = await db.parent.create({ data: { familyCode: `RSE${stamp.slice(-5).toUpperCase()}`, children: { connect: { id: child.id } } } });
  const otherParent = await db.parent.create({ data: { familyCode: `RSF${stamp.slice(-5).toUpperCase()}`, children: { connect: { id: otherChild.id } } } });

  return {
    schoolId: school.id,
    teacherEmail: teacher.email,
    leadEmail: lead.email,
    plainEmail: plain.email,
    leadId: lead.id,
    plainId: plain.id,
    childId: child.id,
    childName: child.name,
    otherChildId: otherChild.id,
    famCode: parent.familyCode,
    parentIds: [parent.id, otherParent.id],
  };
}

async function teardown(w: World) {
  await db.messageThreadShare.deleteMany({ where: { thread: { schoolId: w.schoolId } } });
  await db.message.deleteMany({ where: { thread: { schoolId: w.schoolId } } });
  await db.messageThread.deleteMany({ where: { schoolId: w.schoolId } });
  await db.parent.deleteMany({ where: { id: { in: w.parentIds } } });
  await db.student.deleteMany({ where: { class: { schoolId: w.schoolId } } });
  await db.class.deleteMany({ where: { schoolId: w.schoolId } });
  await db.auditLog.deleteMany({ where: { schoolId: w.schoolId } });
  await db.messagingPolicy.deleteMany({ where: { schoolId: w.schoolId } });
  await db.subscription.deleteMany({ where: { schoolId: w.schoolId } });
  await db.teacher.deleteMany({ where: { schoolId: w.schoolId } });
  await db.school.deleteMany({ where: { id: w.schoolId } });
}

/** A family writes, so there is a real conversation to raise. */
async function seedThread(w: World, studentId: string) {
  const thread = await db.messageThread.create({
    data: {
      studentId,
      schoolId: w.schoolId,
      classId: (await db.student.findFirstOrThrow({ where: { id: studentId }, select: { classId: true } })).classId,
    },
  });
  await db.message.create({
    data: {
      threadId: thread.id,
      senderType: "PARENT",
      senderParentId: w.parentIds[0],
      messageBody: "Could we have a word about reading books please.",
      deliverAt: new Date(Date.now() - 60_000),
    },
  });
  return thread;
}

test("a teacher raises it, the lead reads that one conversation, and the reason never reaches the log", async ({ page, browser }) => {
  const w = await makeSchool("raise");
  try {
    await seedThread(w, w.childId);
    await seedThread(w, w.otherChildId);

    await loginTeacher(page, { email: w.teacherEmail, password: "password" });
    await page.goto(`/teacher/messages/${w.childId}`);
    await expect(page.getByRole("heading", { name: /Raise this with your safeguarding lead/i })).toBeVisible();

    // The three "what this is not" lines are on the screen, not only in a
    // document: a school that mistook this for a reporting channel would be the
    // worst outcome of having built it.
    await expect(page.getByText(/not a report to StoryJar/i)).toBeVisible();
    await expect(page.getByText(/does not go anywhere outside your school/i)).toBeVisible();
    await expect(page.getByText(/not a substitute for your school/i)).toBeVisible();

    await page.getByRole("button", { name: /Raise this conversation…/i }).click();
    await page.getByLabel(/Why are you raising it/i).fill("Something said at pick-up that I think you should see.");
    await page.getByRole("button", { name: /^Raise it$/ }).click();
    await expect(page.getByText(/can now see this conversation/i)).toBeVisible({ timeout: 15_000 });

    const share = await db.messageThreadShare.findFirstOrThrow({ where: { teacherId: w.leadId } });
    expect(share.raisedReason).toContain("pick-up");
    expect(share.raisedAt).not.toBeNull();

    // THE REASON IS NOT IN THE AUDIT LOG. Checked against every row for this
    // school, not only the raise row: a copy anywhere is the failure.
    const rows = await db.auditLog.findMany({ where: { schoolId: w.schoolId } });
    expect(rows.some((r) => r.action === "THREAD_RAISED_WITH_LEAD")).toBe(true);
    for (const r of rows) expect(r.detail ?? "").not.toContain("pick-up");

    // ── the lead reads the raised conversation, and NOT the other child's ──
    const lc = await browser.newContext();
    const lp = await lc.newPage();
    await loginTeacher(lp, { email: w.leadEmail, password: "password" });
    await lp.goto(`/teacher/messages/${w.childId}`);
    await expect(lp.getByText(/reading books/i)).toBeVisible();
    // Being a lead grants nothing on its own. The second child is in the SAME
    // class, so this fails if escalation leaked anything wider than one thread.
    const res = await lp.goto(`/teacher/messages/${w.otherChildId}`);
    expect(res?.status()).toBe(404);
    await lc.close();

    // ── the family is not told, and their pages never say "safeguarding" ───
    const fc = await browser.newContext();
    const fp = await fc.newPage();
    await loginParent(fp, w.famCode);
    const html = await fp.content();
    expect(html.toLowerCase()).not.toContain("safeguarding");
    expect(html).not.toContain("pick-up");
    // The reader list — rule 21's existing transparency — is what changed.
    expect(html).toContain("Lead");
    await fc.close();
  } finally {
    await teardown(w);
  }
});

test("a colleague who is not a named lead cannot be raised to", async ({ page }) => {
  const w = await makeSchool("notlead");
  try {
    await seedThread(w, w.childId);
    await loginTeacher(page, { email: w.teacherEmail, password: "password" });
    await page.goto(`/teacher/messages/${w.childId}`);
    await page.getByRole("button", { name: /Raise this conversation…/i }).click();

    // The picker offers only named leads, so aiming at anyone else means
    // posting their id. The stale-tab shape: real ids, real session, wrong
    // entitlement. React owns the select's value, so it is repointed on the DOM
    // in the instant before the press.
    //
    // SCOPED TO THE RAISE SELECT, and that is not a detail. The Share and Pass
    // cards on the same page list every eligible colleague, "Plain" among them,
    // so a page-wide assertion here finds them and says nothing about this
    // picker. The first version of this test did exactly that and failed —
    // correctly, and for a reason that had nothing to do with the feature.
    const leadPicker = page.locator('select[name="leadTeacherId"]');
    await expect(leadPicker.getByRole("option", { name: /^Plain/ })).toHaveCount(0);
    await expect(leadPicker.getByRole("option", { name: /^Lead/ })).toHaveCount(1);
    await page.getByLabel(/Why are you raising it/i).fill("Aiming this at somebody who is not a lead.");
    await page.evaluate((id) => {
      const sel = document.querySelector<HTMLSelectElement>('select[name="leadTeacherId"]');
      if (sel) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.selected = true;
        sel.appendChild(opt);
      }
    }, w.plainId);
    await page.getByRole("button", { name: /^Raise it$/ }).click();
    await expect(page.getByText(/Pick a colleague at your school/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.messageThreadShare.count({ where: { teacherId: w.plainId } })).toBe(0);

    // A POSITIVE CONTROL, so the refusal above is not simply the form being
    // broken: the same press at the real lead works.
    await page.reload();
    await page.getByRole("button", { name: /Raise this conversation…/i }).click();
    await page.getByLabel(/Why are you raising it/i).fill("The same words, at the actual lead.");
    await page.getByRole("button", { name: /^Raise it$/ }).click();
    await expect(page.getByText(/can now see this conversation/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.messageThreadShare.count({ where: { teacherId: w.leadId } })).toBe(1);
  } finally {
    await teardown(w);
  }
});

test("a reason is required, and cross-tenant: another school's lead cannot be raised to", async ({ page }) => {
  const a = await makeSchool("tenant-a");
  const b = await makeSchool("tenant-b");
  try {
    await seedThread(a, a.childId);
    await loginTeacher(page, { email: a.teacherEmail, password: "password" });
    await page.goto(`/teacher/messages/${a.childId}`);
    await page.getByRole("button", { name: /Raise this conversation…/i }).click();

    // School B's lead is not in School A's picker, so reaching them means
    // posting the id — and a reason is typed, so the refusal that comes back
    // has to be about the tenant rather than about the empty field.
    await page.getByLabel(/Why are you raising it/i).fill("Aiming this at another school entirely.");
    await page.evaluate((id) => {
      const sel = document.querySelector<HTMLSelectElement>('select[name="leadTeacherId"]');
      if (sel) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.selected = true;
        sel.appendChild(opt);
      }
    }, b.leadId);
    await page.getByRole("button", { name: /^Raise it$/ }).click();
    await expect(page.getByText(/Pick a colleague at your school/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.messageThreadShare.count({ where: { teacherId: b.leadId } })).toBe(0);

    // ── and a raise with no reason is refused ─────────────────────────────
    //
    // The field is `required`, so the browser stops an empty submit — which is
    // exactly why this posts whitespace instead: the assertion is about the
    // SERVER refusing, not about the form's own validation.
    await page.reload();
    await page.getByRole("button", { name: /Raise this conversation…/i }).click();
    await page.getByLabel(/Why are you raising it/i).fill("   ");
    await page.getByRole("button", { name: /^Raise it$/ }).click();
    await expect(page.getByText(/Say briefly why you are raising this/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.messageThreadShare.count({ where: { teacherId: a.leadId } })).toBe(0);
  } finally {
    await teardown(a);
    await teardown(b);
  }
});
