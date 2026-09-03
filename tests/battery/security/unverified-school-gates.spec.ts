import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_B, SCHOOL_E, loginTeacher } from "../helpers";

// ===========================================================================
// UNTIL A SCHOOL'S PAYMENT HAS BEEN CONFIRMED, ITS ADMIN MAY NOT MOVE A CLASS,
// MAY NOT REMOVE A COLLEAGUE WHO HAS ALREADY JOINED, AND MAY NOT MAKE ANYBODY
// ELSE AN ADMIN — BY PROMOTION OR BY INVITATION.
//
// WHAT BREAKS IF THIS FAILS. Self-serve purchase makes buying the act that
// creates a `School` and makes the buyer its `ADMIN`. `createTeacherAccount`
// verifies no email address and checks no domain (FINDINGS F67), so anybody at
// all can sign up as a teacher at any school, with any URN, and raise a
// purchase order against it. The card route prices that out — several hundred
// pounds and a traceable payment, and the school is verified the instant it
// exists. The invoice route cannot: an invoice on 30-day terms is unpaid by
// definition, and raising one costs the person raising it nothing.
//
// The damage is not on day one, when the squatter's school is empty. It is on
// day thirty, when a real teacher at that school signs up, is told the school
// is already on StoryJar and asks to be added — and the squatter removes them
// and inherits their classes and their pupils' journals through `removeStaff`
// → `handOverClasses`. On that route these three refusals are not belt and
// braces. They are the whole defence. (docs/dpo-decisions.md, 30 August and
// 1 September 2026.)
//
// THE GATES ARE PROVED BY POSTING, NOT BY LOOKING AT A DISABLED BUTTON. The
// console withholds all three controls, and that is a courtesy to an honest
// admin; the server refusal is the control. Every negative below therefore
// sends a real, well-formed, authenticated request and reads the DATABASE
// afterwards.
//
// HOW THE REQUEST IS FORGED, and why it is not a hand-built POST. A POST
// assembled by hand is refused by Next before any application code runs ("Failed
// to find Server Action" — an action needs a valid action id), so an assertion
// against one holds against a request that could never have done anything; it
// cannot fail. `staff-invite-isolation.spec.ts` records that lesson and
// `class-handover.spec.ts` records the way past it, which this file follows:
// TAMPER WITH A FORM THE SERVER ITSELF RENDERED. Two shapes of tamper appear
// below, both genuine:
//
//   1. THE STALE TAB. Stamp `verifiedAt`, load the console so it renders the
//      real control, clear `verifiedAt`, then press it. The request carries a
//      valid action id and a real session; only the screen is out of date. This
//      is also the honest case the server gate exists for, rather than a
//      contrived one — the note above `assignClassToStaff` says so.
//   2. THE REWRITTEN FIELD. Take a form the unverified console still renders
//      because its ordinary use is allowed (setting a role to TEACHER, removing
//      an invitation) and rewrite the one value that makes it a refusal.
//
// EVERY NEGATIVE HAS A POSITIVE CONTROL THAT DIFFERS BY ONE THING, and in this
// file that one thing is usually `verifiedAt` itself — same school, same admin,
// same session, same form. Without it the test would prove only that some
// request or other did nothing, which a typo also proves.
//
// This is a BLOCKING test.
// ===========================================================================

const db = new PrismaClient();

/** Stamp or clear the fixture school's payment date. The one variable. */
async function setVerified(schoolId: string, verified: boolean) {
  await db.school.update({
    where: { id: schoolId },
    data: { verifiedAt: verified ? new Date() : null },
  });
}

async function pennyfields() {
  const school = await db.school.findFirstOrThrow({ where: { name: SCHOOL_E.name } });
  const admin = await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_E.admin.email } });
  const teacher = await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_E.teacher.email } });
  const klass = await db.class.findFirstOrThrow({ where: { teacherId: teacher.id } });
  return { school, admin, teacher, klass };
}

/**
 * How many staff invitations StoryJar has tried to send today, across every
 * outcome.
 *
 * `MailCounter` is a per-day tally rather than a row per send, on purpose
 * (FINDINGS F6 — a per-send list rebuilds the account-enumeration oracle that
 * `requestMagicLink` is careful not to be). A tally is still enough to answer
 * the only question asked here: did an invitation go out, or not. Summed over
 * outcomes because a fixture environment's mail is not configured and every
 * attempt lands under FAILED or UNCONFIGURED — which is still an attempt, and
 * still means the address was told something.
 */
async function inviteMailAttempts(): Promise<number> {
  const rows = await db.mailCounter.findMany({ where: { templateKey: "staff-invite" } });
  return rows.reduce((n, r) => n + r.count, 0);
}

/** An invited colleague of Pennyfields', which the fixture deliberately lacks. */
function mkInvited(schoolId: string, tag: string) {
  return db.teacher.create({
    data: {
      name: `Invited ${tag}`,
      displayName: `Invited ${tag}`,
      email: `penny.${tag.toLowerCase()}.${Date.now()}@example.test`,
      passwordHash: "",
      role: "TEACHER",
      status: "INVITED",
      schoolId,
    },
  });
}

/** Open a staff row's ⋯ menu and step into one of its submenus. */
async function openStaffMenu(page: Page, name: string, item?: RegExp) {
  await page.goto("/admin");
  await page.getByRole("button", { name: new RegExp(`actions for ${name}`, "i") }).click();
  if (item) await page.getByRole("menuitem", { name: item }).click();
}

// Leave the fixture exactly as the seed left it, whatever happened above. Every
// test here mutates the one column the whole file is about, and a run that died
// holding it stamped would hand the next spec a verified Pennyfields and a green
// tick that means nothing.
test.afterEach(async () => {
  const school = await db.school.findFirst({ where: { name: SCHOOL_E.name } });
  if (school) await setVerified(school.id, false);
});

test.afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// GATE 1 — assignClassToStaff
// ---------------------------------------------------------------------------
test("an unverified school cannot move a class to another member of staff [by direct POST]", async ({
  page,
}) => {
  const { school, admin, teacher, klass } = await pennyfields();

  try {
    await loginTeacher(page, SCHOOL_E.admin);

    // ===== POSITIVE CONTROL: the same school, verified =====
    // If this does not move the class, the negative below proves nothing: it
    // would be the picker, the tab, the ids or the action that was wrong rather
    // than the gate that refused.
    await setVerified(school.id, true);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Classes", exact: true }).click();
    await page.getByLabel(`Teacher for ${klass.name}`).selectOption(admin.id);
    await page.getByRole("button", { name: /^hand to/i }).click();
    await expect
      .poll(async () => (await db.class.findUniqueOrThrow({ where: { id: klass.id } })).teacherId, {
        message: "a VERIFIED school must still be able to hand a class over",
        timeout: 15_000,
      })
      .toBe(admin.id);

    // Put the class back where the seed had it, code and all, so the negative
    // starts from the same state the positive did.
    await db.class.update({
      where: { id: klass.id },
      data: { teacherId: teacher.id, classCode: SCHOOL_E.classCode },
    });

    // ===== THE NEGATIVE: one thing changes, `verifiedAt` =====
    // Render the control while the school is verified, then clear the payment
    // date underneath it. What is left on screen is a stale tab holding a
    // genuine server-action form, which is exactly what the server gate is for.
    await page.goto("/admin");
    await page.getByRole("button", { name: "Classes", exact: true }).click();
    await page.getByLabel(`Teacher for ${klass.name}`).selectOption(admin.id);
    await setVerified(school.id, false);

    const auditBefore = await db.auditLog.count({
      where: { action: "CLASS_ASSIGNED", subjectId: klass.id },
    });
    await page.getByRole("button", { name: /^hand to/i }).click();

    // A void action explaining itself: the refusal lands on the console with a
    // reason in the URL, and the console says it in words.
    await page.waitForURL(/\/admin\?blocked=verify/, { timeout: 15_000 });
    await expect(page.getByRole("status")).toContainText(
      "Your school plan hasn’t been paid for yet",
    );
    await expect(page.getByRole("status")).toContainText("the change you just tried didn’t happen");

    // ===== THE CONSEQUENCE =====
    const after = await db.class.findUniqueOrThrow({ where: { id: klass.id } });
    expect(after.teacherId, "the class must not have moved to the unverified admin").toBe(
      teacher.id,
    );
    expect(
      after.classCode,
      "and its code must not have rotated — that alone would lock every child in it out",
    ).toBe(SCHOOL_E.classCode);
    expect(
      await db.auditLog.count({ where: { action: "CLASS_ASSIGNED", subjectId: klass.id } }),
      "no audit row may claim a handover that did not happen",
    ).toBe(auditBefore);
  } finally {
    await db.class.update({
      where: { id: klass.id },
      data: { teacherId: teacher.id, classCode: SCHOOL_E.classCode },
    });
    await db.auditLog.deleteMany({ where: { action: "CLASS_ASSIGNED", subjectId: klass.id } });
  }
});

// ---------------------------------------------------------------------------
// GATE 2 — setStaffRole, and only when the target role is ADMIN
// ---------------------------------------------------------------------------
test("an unverified school cannot promote anybody to admin, but can still set TEACHER and TA [by direct POST]", async ({
  page,
}) => {
  const { school, teacher } = await pennyfields();

  try {
    await loginTeacher(page, SCHOOL_E.admin);

    // ===== WHAT THE SCREEN DOES, which is a courtesy and not the control =====
    await openStaffMenu(page, teacher.name, /edit role/i);
    await expect(
      page.getByText(/making somebody an admin waits until the school plan is paid for/i),
      "the reason belongs next to the control it withholds, not only in the banner",
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Admin" })).toBeDisabled();

    // ===== POSITIVE CONTROL: a role change an unverified school KEEPS =====
    // TEACHER and TA change nothing StoryJar permits, and a school setting
    // itself up on a purchase order needs its staff list right. This also proves
    // the form, the action and the session all work before anything is forged.
    await page.getByRole("menuitem", { name: "Teaching assistant" }).click();
    await expect
      .poll(async () => (await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).role, {
        message: "an unverified school must still be able to set TEACHER and TA",
        timeout: 15_000,
      })
      .toBe("TA");

    // ===== THE NEGATIVE: the same form, one value rewritten =====
    // The "Teacher" button's hidden `role` is rewritten to ADMIN in the DOM
    // before it is pressed. The request is well-formed, correctly routed and
    // authenticated as this school's real admin; only the value is a lie. This
    // is what a tampered client sends, and it is also what the disabled ADMIN
    // button above would send if somebody deleted the `disabled` attribute.
    await openStaffMenu(page, teacher.name, /edit role/i);
    const planted = await page.evaluate(() => {
      // `endsWith`, not `===`: each role button carries a decorative ★ or • in
      // an aria-hidden span, so its textContent is "•Teacher". Ending the match
      // also keeps "Teacher" from selecting "Teaching assistant".
      const submit = Array.from(document.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").trim().endsWith("Teacher"),
      );
      const field = submit?.closest("form")?.querySelector<HTMLInputElement>('input[name="role"]');
      if (!field) return 0;
      field.value = "ADMIN";
      return 1;
    });
    expect(
      planted,
      "the role form's own hidden field must be found and rewritten, or nothing forged has been sent",
    ).toBe(1);
    await page.getByRole("menuitem", { name: "Teacher", exact: true }).click();

    await page.waitForURL(/\/admin\?blocked=verify/, { timeout: 15_000 });
    const afterForge = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(
      afterForge.role,
      "an unverified school may not manufacture a second admin — and the refusal must not fall back to the role the button named either",
    ).toBe("TA");
    expect(
      await db.auditLog.count({
        where: { action: "STAFF_ROLE_CHANGED", subjectId: teacher.id, detail: { contains: "ADMIN" } },
      }),
      "no audit row may claim a promotion that did not happen",
    ).toBe(0);

    // ===== THE SAME PRESS, ON A VERIFIED SCHOOL =====
    // Nothing differs but `verifiedAt`, so nothing else can explain the
    // difference — and without this leg the test says only that some request
    // did nothing.
    await setVerified(school.id, true);
    await openStaffMenu(page, teacher.name, /edit role/i);
    await expect(page.getByRole("menuitem", { name: "Admin" })).toBeEnabled();
    await page.getByRole("menuitem", { name: "Admin" }).click();
    await expect
      .poll(async () => (await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).role, {
        message: "a VERIFIED school must still be able to promote somebody to admin",
        timeout: 15_000,
      })
      .toBe("ADMIN");
  } finally {
    await db.teacher.update({ where: { id: teacher.id }, data: { role: "TEACHER" } });
    await db.auditLog.deleteMany({
      where: { action: "STAFF_ROLE_CHANGED", subjectId: teacher.id },
    });
  }
});

// ---------------------------------------------------------------------------
// GATE 3 — removeStaff, and only where the staff member is ACTIVE
// ---------------------------------------------------------------------------
test("an unverified school cannot remove a colleague who has joined, but can still cancel an invitation [by direct POST]", async ({
  page,
}) => {
  const { school, admin, teacher, klass } = await pennyfields();
  const carrier = await mkInvited(school.id, "Carrier");
  const allowed = await mkInvited(school.id, "Allowed");
  // An ACTIVE colleague of our own for the verified control, so the leg that
  // proves removal still works does not delete the fixture's only teacher —
  // and an ADMIN one, because their `role` is the second thing being asserted.
  const removable = await db.teacher.create({
    data: {
      name: "Removable Deputy",
      displayName: "Removable Deputy",
      email: `penny.removable.${Date.now()}@example.test`,
      passwordHash: "",
      role: "ADMIN",
      status: "ACTIVE",
      schoolId: school.id,
    },
  });

  // Plant a `staffId` into the REMOVAL form specifically, by walking up from its
  // own submit button. An invited colleague's open menu also holds "Resend
  // invite", a second form with a second `staffId`; forging that one is a
  // different action and a different spec's subject.
  const plantAndSubmit = async (staffId: string) => {
    await openStaffMenu(page, carrier.name, /remove from school/i);
    const planted = await page.evaluate((forgedId) => {
      const submit = Array.from(document.querySelectorAll("button")).find((b) =>
        /^yes, remove/i.test((b.textContent ?? "").trim()),
      );
      const field = submit
        ?.closest("form")
        ?.querySelector<HTMLInputElement>('input[name="staffId"]');
      if (!field) return 0;
      field.value = forgedId;
      return 1;
    }, staffId);
    expect(
      planted,
      "the removal form's own staffId must be found and rewritten, or nothing forged has been sent",
    ).toBe(1);
    await page.getByRole("menuitem", { name: new RegExp(`yes, remove ${carrier.name}`, "i") }).click();
  };

  try {
    await loginTeacher(page, SCHOOL_E.admin);

    // ===== WHAT THE SCREEN DOES for an ACTIVE colleague =====
    await openStaffMenu(page, teacher.name, /remove from school/i);
    await expect(
      page.getByText(/waits until the school plan is paid for/i),
      "the admin must be told why before they press, not bounced afterwards",
    ).toBeVisible();
    expect(
      await page.getByRole("menuitem", { name: new RegExp(`yes, remove ${teacher.name}`, "i") }).count(),
      "and the confirmation itself must be replaced, not merely styled differently",
    ).toBe(0);

    // ===== POSITIVE CONTROL, WHICH IS ALSO A RETAINED POWER =====
    // Removing an INVITED row stays allowed while unpaid: it cancels an
    // invitation the admin sent minutes ago, which they need in order to correct
    // a mistyped address, and it moves nobody's data. The forged id is one this
    // admin IS allowed to remove, so a success here proves the planted value is
    // the value the server acts on.
    await plantAndSubmit(allowed.id);
    await expect
      .poll(async () => db.teacher.count({ where: { id: allowed.id } }), {
        message:
          "removing an INVITED colleague must still work while unpaid — and the planted id must be the one the server acts on, or the negative below is Next dropping the request rather than the gate refusing it",
        timeout: 15_000,
      })
      .toBe(0);
    expect(
      await db.teacher.count({ where: { id: carrier.id } }),
      "and the row named on the button must be untouched, which is what makes it a forgery",
    ).toBe(1);

    // ===== THE NEGATIVE: the same forgery, aimed at an ACTIVE colleague =====
    await plantAndSubmit(teacher.id);
    await page.waitForURL(/\/admin\?blocked=verify/, { timeout: 15_000 });

    const afterForge = await db.teacher.findUnique({
      where: { id: teacher.id },
      include: { classes: { select: { id: true, teacherId: true, classCode: true } } },
    });
    expect(afterForge, "the ACTIVE colleague must still exist").toBeTruthy();
    expect(afterForge!.schoolId, "and must still belong to the school").toBe(school.id);
    expect(
      afterForge!.classes.map((c) => c.teacherId),
      "and must still hold their own class — this is the branch that moves it to the admin",
    ).toEqual([teacher.id]);
    expect(
      afterForge!.classes.map((c) => c.classCode),
      "and its code must not have rotated",
    ).toEqual([SCHOOL_E.classCode]);
    expect(
      await db.teacher.count({ where: { id: carrier.id } }),
      "the forged request must be refused outright, not redirected onto the row the form named",
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: { action: "STAFF_REMOVED", subjectType: "TEACHER", subjectId: teacher.id },
      }),
      "no audit row may claim a removal that did not happen",
    ).toBe(0);

    // ===== THE SAME REMOVAL, ON A VERIFIED SCHOOL =====
    await setVerified(school.id, true);
    await openStaffMenu(page, removable.name, /remove from school/i);
    await page
      .getByRole("menuitem", { name: new RegExp(`yes, remove ${removable.name}`, "i") })
      .click();
    await expect
      .poll(
        async () =>
          (await db.teacher.findUniqueOrThrow({ where: { id: removable.id } })).schoolId,
        {
          message: "a VERIFIED school must still be able to remove an ACTIVE colleague",
          timeout: 15_000,
        },
      )
      .toBeNull();

    // AND THE REMOVED ADMIN IS NO LONGER AN ADMIN. `removeStaff` used to null
    // `schoolId` and leave `role: "ADMIN"` in place. That is inert only while
    // `requireAdmin` needs both — and the invitation work that follows gives a
    // schoolless teacher a route to a NEW `schoolId`, at which point a removed
    // admin would arrive as somebody else's. `detachBuyer` already clears it on
    // the refund path; this asserts the two agree.
    expect(
      (await db.teacher.findUniqueOrThrow({ where: { id: removable.id } })).role,
      "a removed admin must not keep ADMIN on an account that can later join another school",
    ).toBe("TEACHER");
  } finally {
    for (const id of [carrier.id, allowed.id, removable.id]) {
      await db.auditLog.deleteMany({ where: { subjectId: id } });
      await db.subscription.deleteMany({ where: { teacherId: id } });
      await db.teacherPasswordToken.deleteMany({ where: { teacherId: id } });
      await db.session.deleteMany({ where: { teacherId: id } });
      await db.teacher.deleteMany({ where: { id } });
    }
    await db.class.update({
      where: { id: klass.id },
      data: { teacherId: teacher.id, classCode: SCHOOL_E.classCode },
    });
    await db.auditLog.deleteMany({ where: { subjectId: admin.id } });
  }
});

// ---------------------------------------------------------------------------
// GATE 4 — inviteStaff, and only when the invitation is for an ADMIN
// ---------------------------------------------------------------------------
test("an unverified school cannot invite a new admin, but can still invite a teacher [by direct POST]", async ({
  page,
}) => {
  const { school } = await pennyfields();
  const stamp = Date.now();
  const asAdmin = `penny.forged.admin.${stamp}@example.test`;
  const asTeacher = `penny.honest.teacher.${stamp}@example.test`;
  const whenPaid = `penny.paid.admin.${stamp}@example.test`;

  // Fill the form and send it, with `role` forced to a value the select will not
  // offer. Removing the `disabled` attribute before setting the value is the
  // forgery in its plainest form — it is exactly what a tampered client does,
  // and it proves the attribute is a courtesy rather than the control.
  const inviteAs = async (name: string, email: string, role: string) => {
    await page.goto("/admin");
    await page.getByRole("button", { name: /invite staff/i }).click();
    await page.fill("#inv-name", name);
    await page.fill("#inv-email", email);
    const planted = await page.evaluate((wanted) => {
      const select = document.querySelector<HTMLSelectElement>("#inv-role");
      const option = select?.querySelector<HTMLOptionElement>(`option[value="${wanted}"]`);
      if (!select || !option) return 0;
      option.disabled = false;
      select.value = wanted;
      return select.value === wanted ? 1 : 0;
    }, role);
    expect(
      planted,
      "the role must actually be set on the form, or nothing has been sent as that role",
    ).toBe(1);
    await page.getByRole("button", { name: /send invite/i }).click();
  };

  try {
    await loginTeacher(page, SCHOOL_E.admin);

    // ===== WHAT THE SCREEN DOES, which is a courtesy and not the control =====
    await page.goto("/admin");
    await page.getByRole("button", { name: /invite staff/i }).click();
    await expect(page.locator('#inv-role option[value="ADMIN"]')).toBeDisabled();
    await expect(
      page.getByText(/making somebody an admin waits until the school plan is paid for/i).last(),
      "the reason must be visible beside the select, not hidden inside an option nobody can reach",
    ).toBeVisible();

    // ===== POSITIVE CONTROL: the invitation an unpaid school KEEPS =====
    // Inviting staff is retained by the 1 September decision, and this is what
    // that retention is worth: a school setting itself up on a purchase order
    // can still bring its teachers in. It also proves the form, the action and
    // the session work before anything is forged.
    const mailBefore = await inviteMailAttempts();
    await inviteAs("Honest Teacher", asTeacher, "TEACHER");
    await expect
      .poll(async () => db.teacher.count({ where: { email: asTeacher } }), {
        message: "an unverified school must still be able to invite a teacher",
        timeout: 15_000,
      })
      .toBe(1);
    // Polled, not read once: the row is created BEFORE the send, so the poll
    // above returns while the invitation is still in flight.
    await expect
      .poll(inviteMailAttempts, {
        message:
          "and that invitation must actually be sent, or the assertion below proves only that nothing works",
        timeout: 15_000,
      })
      .toBeGreaterThan(mailBefore);

    // ===== THE NEGATIVE: the same form, one value forced =====
    const mailBeforeForge = await inviteMailAttempts();
    await inviteAs("Forged Admin", asAdmin, "ADMIN");

    // This action HAS an error channel, so the refusal is a sentence on the
    // screen rather than a redirect. Reading it is also how we know the request
    // arrived and was answered by the application.
    // Scoped to the form's own alert: Next renders a permanently empty
    // `role="alert"` route announcer, so an unscoped role query matches two.
    await expect(page.locator('p[role="alert"]')).toContainText(/not another admin/i);

    expect(
      await db.teacher.count({ where: { email: asAdmin } }),
      "NO TEACHER ROW may be created — a refusal after the row exists is not a refusal",
    ).toBe(0);
    expect(
      await inviteMailAttempts(),
      "and no invitation may be sent: the address must not even be told that this school exists",
    ).toBe(mailBeforeForge);
    expect(
      await db.auditLog.count({
        where: { action: "STAFF_INVITED", schoolId: school.id, detail: { contains: "Forged Admin" } },
      }),
      "and nothing may be written down as having happened",
    ).toBe(0);

    // ===== THE SAME PRESS, ON A VERIFIED SCHOOL =====
    // Admin stays in the form for a school that has paid; only `verifiedAt`
    // differs, so nothing else can explain the difference in outcome.
    await setVerified(school.id, true);
    await page.goto("/admin");
    await page.getByRole("button", { name: /invite staff/i }).click();
    await expect(page.locator('#inv-role option[value="ADMIN"]')).toBeEnabled();
    await inviteAs("Paid Admin", whenPaid, "ADMIN");
    await expect
      .poll(async () => (await db.teacher.findFirst({ where: { email: whenPaid } }))?.role ?? null, {
        message: "a VERIFIED school must still be able to invite an admin",
        timeout: 15_000,
      })
      .toBe("ADMIN");
  } finally {
    for (const email of [asAdmin, asTeacher, whenPaid]) {
      const row = await db.teacher.findFirst({ where: { email } });
      if (!row) continue;
      await db.auditLog.deleteMany({ where: { subjectId: row.id } });
      await db.teacherPasswordToken.deleteMany({ where: { teacherId: row.id } });
      await db.teacher.delete({ where: { id: row.id } });
    }
  }
});

// ---------------------------------------------------------------------------
// The gate is not a substitute for tenant scoping, and does not become one.
// ---------------------------------------------------------------------------
test("an unverified admin cannot change another school's staff role [cross-tenant]", async ({
  page,
}) => {
  const { school, teacher } = await pennyfields();
  const outsider = await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_B.teacher.email } });
  expect(outsider.schoolId, "the fixture must belong to another school").not.toBe(school.id);
  const wasRole = outsider.role;

  try {
    await loginTeacher(page, SCHOOL_E.admin);

    // The positive control for this plant is the previous test: the same form,
    // the same rewrite, aimed at this admin's OWN colleague, changes their role.
    // Here one thing differs — the id belongs to Oakfield.
    await openStaffMenu(page, teacher.name, /edit role/i);
    const planted = await page.evaluate((forgedId) => {
      const submit = Array.from(document.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").trim().endsWith("Teaching assistant"),
      );
      const form = submit?.closest("form");
      const field = form?.querySelector<HTMLInputElement>('input[name="staffId"]');
      if (!field) return 0;
      field.value = forgedId;
      return 1;
    }, outsider.id);
    expect(planted, "the role form's staffId must be found and rewritten").toBe(1);
    await page.getByRole("menuitem", { name: "Teaching assistant" }).click();
    await page.waitForTimeout(2000);

    expect(
      (await db.teacher.findUniqueOrThrow({ where: { id: outsider.id } })).role,
      "another school's staff must be unreachable by id, gate or no gate",
    ).toBe(wasRole);
    expect(
      await db.auditLog.count({
        where: { action: "STAFF_ROLE_CHANGED", subjectId: outsider.id, schoolId: school.id },
      }),
      "and nothing may be written against them under this school",
    ).toBe(0);
  } finally {
    await db.teacher.update({ where: { id: outsider.id }, data: { role: wasRole } });
    await db.teacher.update({ where: { id: teacher.id }, data: { role: "TEACHER" } });
    await db.auditLog.deleteMany({
      where: { action: "STAFF_ROLE_CHANGED", subjectId: { in: [outsider.id, teacher.id] } },
    });
  }
});

// ---------------------------------------------------------------------------
// The console, on a school that HAS paid. The screen-level half of the proof,
// read from an untouched fixture rather than from a column this file wrote.
// ---------------------------------------------------------------------------
test("a verified school's console carries no unpaid banner and keeps every control", async ({
  page,
}) => {
  await loginTeacher(page, SCHOOL_B.admin);
  await page.goto("/admin");

  await expect(
    page.getByText(/your school plan hasn’t been paid for yet/i),
    "a school that has paid must never be told it has not",
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Classes", exact: true }).click();
  expect(
    await page.getByLabel(/^Teacher for /).count(),
    "and its class handover picker is a control, not a sentence",
  ).toBeGreaterThan(0);
});
