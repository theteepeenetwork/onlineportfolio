import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loginTeacher, loginParent } from "../helpers";

// ===========================================================================
// Notices — one-way, from the school to families (SAFEGUARDING rule 24).
//
// THE PROPERTY THAT MATTERS IS A NEGATIVE ONE, and it is asserted on the
// rendered page rather than trusted from the code: the family's notice board
// contains no form, no textarea, no input and no button. "No way to respond" is
// the absence of anything to post to. A second assertion checks the page source
// for a notice id inside any <form>, so a form elsewhere on the page could not
// be quietly carrying one either.
//
// Also proved: whole-school reaches every family and a class notice reaches
// only that class; a teacher cannot send to the whole school, or to a class they
// do not hold, or at all if the school has not let them write to families;
// cross-tenant; taking down removes it for families and keeps the row; the
// audit log carries the title and never the body.
// ===========================================================================

const db = new PrismaClient();

type World = {
  schoolId: string;
  robinsId: string;
  robinsName: string;
  wrensId: string;
  wrensName: string;
  adminEmail: string;
  teacherEmail: string;
  teacherId: string;
  taEmail: string;
  robinsFam: string;
  wrensFam: string;
  parentIds: string[];
};

async function makeSchool(tag: string): Promise<World> {
  const stamp = `${tag}-${Math.random().toString(36).slice(2, 7)}`;
  const school = await db.school.create({ data: { name: `Notice ${stamp}`, verifiedAt: new Date() } });
  await db.subscription.create({ data: { kind: "SCHOOL", status: "ACTIVE", schoolId: school.id } });
  const mk = (role: string, label: string, extra: Record<string, unknown> = {}) =>
    db.teacher.create({
      data: {
        name: `${label} ${stamp}`, displayName: label, email: `${label.toLowerCase()}-${stamp}@notice.test`,
        passwordHash: bcrypt.hashSync("password", 10), role, status: "ACTIVE", schoolId: school.id,
        emailConfirmedAt: new Date(), ...extra,
      },
    });
  const admin = await mk("ADMIN", "Admin");
  const teacher = await mk("TEACHER", "Teacher");
  const other = await mk("TEACHER", "Other");
  // A TA the school has NOT let write to families — the per-staff switch, off.
  const ta = await mk("TA", "Assistant", { mayMessageParents: false });

  const robins = await db.class.create({
    data: { name: `Robins ${stamp}`, classCode: `NR${stamp.slice(-4).toUpperCase()}`, teacherId: teacher.id, schoolId: school.id },
  });
  const wrens = await db.class.create({
    data: { name: `Wrens ${stamp}`, classCode: `NW${stamp.slice(-4).toUpperCase()}`, teacherId: other.id, schoolId: school.id },
  });
  const a = await db.student.create({ data: { name: "Amara", classId: robins.id, avatarColor: "#E08A9B" } });
  const b = await db.student.create({ data: { name: "Bo", classId: wrens.id, avatarColor: "#8AA9E0" } });
  const pa = await db.parent.create({ data: { familyCode: `NRA${stamp.slice(-5).toUpperCase()}`, children: { connect: { id: a.id } } } });
  const pb = await db.parent.create({ data: { familyCode: `NWB${stamp.slice(-5).toUpperCase()}`, children: { connect: { id: b.id } } } });
  void ta;

  return {
    schoolId: school.id,
    robinsId: robins.id,
    robinsName: robins.name,
    wrensId: wrens.id,
    wrensName: wrens.name,
    adminEmail: admin.email,
    teacherEmail: teacher.email,
    teacherId: teacher.id,
    taEmail: ta.email,
    robinsFam: pa.familyCode,
    wrensFam: pb.familyCode,
    parentIds: [pa.id, pb.id],
  };
}

async function teardown(w: World) {
  await db.noticeClass.deleteMany({ where: { notice: { schoolId: w.schoolId } } });
  await db.notice.deleteMany({ where: { schoolId: w.schoolId } });
  await db.parent.deleteMany({ where: { id: { in: w.parentIds } } });
  await db.student.deleteMany({ where: { class: { schoolId: w.schoolId } } });
  await db.class.deleteMany({ where: { schoolId: w.schoolId } });
  await db.auditLog.deleteMany({ where: { schoolId: w.schoolId } });
  await db.subscription.deleteMany({ where: { schoolId: w.schoolId } });
  await db.teacher.deleteMany({ where: { schoolId: w.schoolId } });
  await db.school.deleteMany({ where: { id: w.schoolId } });
}

async function onNoticesTab(page: import("@playwright/test").Page, email: string) {
  await loginTeacher(page, { email, password: "password" });
  await page.waitForLoadState("networkidle");
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Notices", exact: true }).first().click();
}

const BODY_SENTENCE = "The boiler has failed and the building will be shut.";

test("whole school reaches every family, a class notice reaches one, and nobody can reply", async ({ page, browser }) => {
  const w = await makeSchool("send");
  try {
    // ── the office sends to the whole school ──────────────────────────────
    await onNoticesTab(page, w.adminEmail);
    await page.getByRole("button", { name: /^Send a notice$/ }).click();
    await page.getByLabel(/^Title$/).fill("School closed on Friday");
    await page.getByLabel(/^The notice$/).fill(BODY_SENTENCE);
    await page.getByRole("radio", { name: /whole school/i }).check();
    await page.getByRole("button", { name: /Send the notice/i }).click();
    await expect(page.getByText(/Sent to every family in the school/i)).toBeVisible({ timeout: 15_000 });

    // ── the Robins teacher sends to Robins only ───────────────────────────
    const tc = await browser.newContext();
    const tp = await tc.newPage();
    await loginTeacher(tp, { email: w.teacherEmail, password: "password" });
    await tp.goto("/teacher/messages");
    await tp.getByRole("button", { name: /Write a notice/i }).click();
    await tp.getByLabel(/^Title$/).fill("PE kit tomorrow");
    await tp.getByLabel(/^The notice$/).fill("Please make sure it is named.");
    await expect(tp.getByText(new RegExp(`To every family in`))).toBeVisible(); // one class, no picker
    await tp.getByRole("button", { name: /Send the notice/i }).click();
    await expect(tp.getByText(new RegExp(`Sent to ${w.robinsName}`))).toBeVisible({ timeout: 15_000 });
    await tc.close();

    // ── the Robins family sees both; the Wrens family sees only the school one
    const rc = await browser.newContext();
    const rp = await rc.newPage();
    await loginParent(rp, w.robinsFam);
    const board = rp.getByRole("region", { name: /Notices from school/i });
    await expect(board.getByRole("heading", { name: "School closed on Friday" })).toBeVisible();
    await expect(board.getByRole("heading", { name: "PE kit tomorrow" })).toBeVisible();
    await expect(board.getByText("Whole school")).toBeVisible();
    await expect(board.getByText(w.robinsName, { exact: true })).toBeVisible();

    // NO WAY TO RESPOND, asserted on the rendered board and not on the code.
    await expect(board.locator("form, textarea, input, button, [contenteditable]")).toHaveCount(0);
    // And no form anywhere on the page carries a notice id.
    const html = await rp.content();
    const ids = await db.notice.findMany({ where: { schoolId: w.schoolId }, select: { id: true } });
    for (const { id } of ids) {
      for (const form of html.match(/<form[\s\S]*?<\/form>/g) ?? []) expect(form).not.toContain(id);
    }
    await rc.close();

    const wc = await browser.newContext();
    const wp = await wc.newPage();
    await loginParent(wp, w.wrensFam);
    const wBoard = wp.getByRole("region", { name: /Notices from school/i });
    await expect(wBoard.getByRole("heading", { name: "School closed on Friday" })).toBeVisible();
    await expect(wBoard.getByRole("heading", { name: "PE kit tomorrow" })).toHaveCount(0);
    await wc.close();

    // ── the audit log has the title and never the body ────────────────────
    const rows = await db.auditLog.findMany({ where: { schoolId: w.schoolId, action: "NOTICE_SENT" } });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.detail ?? "").not.toContain("boiler");
      expect(r.detail ?? "").not.toContain("named");
    }
    expect(rows.some((r) => (r.detail ?? "").includes("School closed on Friday"))).toBe(true);
  } finally {
    await teardown(w);
  }
});

test("a teacher cannot send to the whole school, to a class they do not hold, or without the school's permission", async ({ page }) => {
  const w = await makeSchool("scope");
  try {
    await loginTeacher(page, { email: w.teacherEmail, password: "password" });
    await page.goto("/teacher/messages");
    await page.getByRole("button", { name: /Write a notice/i }).click();
    await page.getByLabel(/^Title$/).fill("Not mine to send");
    await page.getByLabel(/^The notice$/).fill("Aiming wider than my class.");

    // WHOLE SCHOOL from a teacher's session: the composer has no such option,
    // so it is posted by repointing the hidden audience field — the stale-tab
    // shape. Refused, not narrowed.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('input[name="audience"]');
      if (el) el.value = "SCHOOL";
    });
    await page.getByRole("button", { name: /Send the notice/i }).click();
    await expect(page.getByText(/Only the school office can send a notice to the whole school/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.notice.count({ where: { schoolId: w.schoolId } })).toBe(0);

    // A CLASS THEY DO NOT HOLD (Wrens), by repointing the class id.
    await page.reload();
    await page.getByRole("button", { name: /Write a notice/i }).click();
    await page.getByLabel(/^Title$/).fill("Not mine to send");
    await page.getByLabel(/^The notice$/).fill("Aiming at a colleague's class.");
    await page.evaluate((wrens) => {
      const el = document.querySelector<HTMLInputElement>('input[name="classIds"]');
      if (el) el.value = wrens;
    }, w.wrensId);
    await page.getByRole("button", { name: /Send the notice/i }).click();
    await expect(page.getByText(/isn’t one of yours/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.noticeClass.count({ where: { classId: w.wrensId } })).toBe(0);

    // A POSITIVE CONTROL: the same press, untouched, works.
    await page.reload();
    await page.getByRole("button", { name: /Write a notice/i }).click();
    await page.getByLabel(/^Title$/).fill("Mine to send");
    await page.getByLabel(/^The notice$/).fill("Reading books back on Monday.");
    await page.getByRole("button", { name: /Send the notice/i }).click();
    await expect(page.getByText(/^✓ Sent to/)).toBeVisible({ timeout: 15_000 });
    expect(await db.noticeClass.count({ where: { classId: w.robinsId } })).toBe(1);
  } finally {
    await teardown(w);
  }
});

test("a TA the school has not let write to families is offered no composer, and cannot borrow the teacher's", async ({ page, browser }) => {
  const w = await makeSchool("ta");
  try {
    await loginTeacher(page, { email: w.taEmail, password: "password" });
    await page.goto("/teacher/messages");
    await expect(page.getByRole("button", { name: /Write a notice/i })).toHaveCount(0);

    // THE PAGE IS NOT THE ENFORCEMENT POINT. Open the composer as the teacher
    // who holds the class, then swap in the TA's session cookie before pressing
    // send — the stale-tab shape at the level of the session rather than a
    // field. The action re-resolves the sender from the cookie, and the SERVER
    // must be the thing that says no.
    const taCookies = await page.context().cookies();

    const tc = await browser.newContext();
    const tp = await tc.newPage();
    await loginTeacher(tp, { email: w.teacherEmail, password: "password" });
    await tp.goto("/teacher/messages");
    await tp.getByRole("button", { name: /Write a notice/i }).click();
    await tp.getByLabel(/^Title$/).fill("Borrowed composer");
    await tp.getByLabel(/^The notice$/).fill("Sent from a page the TA should not have.");
    await tc.clearCookies();
    await tc.addCookies(taCookies);
    await tp.getByRole("button", { name: /Send the notice/i }).click();
    await expect(tp.getByText(/aren’t set up to write to families/i)).toBeVisible({ timeout: 15_000 });
    await tc.close();

    expect(await db.notice.count({ where: { schoolId: w.schoolId } })).toBe(0);
  } finally {
    await teardown(w);
  }
});

test("cross-tenant: one school's office cannot address another school's class; taking down hides, never deletes", async ({ page, browser }) => {
  const a = await makeSchool("tenant-a");
  const b = await makeSchool("tenant-b");
  try {
    await onNoticesTab(page, b.adminEmail);
    await page.getByRole("button", { name: /^Send a notice$/ }).click();
    await page.getByLabel(/^Title$/).fill("Not yours");
    await page.getByLabel(/^The notice$/).fill("A class in another school entirely.");
    await page.getByRole("radio", { name: /chosen classes/i }).check();
    await expect(page.getByRole("checkbox", { name: new RegExp(a.robinsName) })).toHaveCount(0);
    await page.getByRole("checkbox", { name: new RegExp(b.robinsName) }).check();
    await page.evaluate((foreign) => {
      const box = document.querySelector<HTMLInputElement>('input[name="classIds"]:checked');
      if (box) box.value = foreign;
    }, a.robinsId);
    await page.getByRole("button", { name: /Send the notice/i }).click();
    await expect(page.getByText(/isn’t one of yours/i)).toBeVisible({ timeout: 15_000 });
    expect(await db.notice.count({ where: { schoolId: a.schoolId } })).toBe(0);
    expect(await db.noticeClass.count({ where: { classId: a.robinsId } })).toBe(0);

    // ── take down: School B sends its own, then withdraws it ──────────────
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Notices", exact: true }).first().click();
    await page.getByRole("button", { name: /^Send a notice$/ }).click();
    await page.getByLabel(/^Title$/).fill("Wrong date, ignore");
    await page.getByLabel(/^The notice$/).fill("Sent in error.");
    await page.getByRole("radio", { name: /whole school/i }).check();
    await page.getByRole("button", { name: /Send the notice/i }).click();
    await expect(page.getByText(/Sent to every family/i)).toBeVisible({ timeout: 15_000 });

    const fc = await browser.newContext();
    const fp = await fc.newPage();
    await loginParent(fp, b.robinsFam);
    await expect(fp.getByRole("heading", { name: "Wrong date, ignore" })).toBeVisible();

    await page.getByRole("button", { name: /^Take down$/ }).first().click();
    await expect(page.getByText(/taken down/i)).toBeVisible({ timeout: 15_000 });

    await fp.reload();
    await expect(fp.getByRole("heading", { name: "Wrong date, ignore" })).toHaveCount(0);
    await fc.close();

    // Hidden, never deleted: the row is still there with the stamp on it.
    const row = await db.notice.findFirstOrThrow({ where: { schoolId: b.schoolId, title: "Wrong date, ignore" } });
    expect(row.retractedAt).not.toBeNull();
    expect(row.retractedByName).toBe("Admin");
  } finally {
    await teardown(a);
    await teardown(b);
  }
});
