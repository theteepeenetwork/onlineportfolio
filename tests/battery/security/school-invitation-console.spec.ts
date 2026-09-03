import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, SCHOOL_E, loginTeacher } from "../helpers";

// ===========================================================================
// BRINGING A TEACHER WHO ALREADY HAS AN ACCOUNT INTO A SCHOOL: THE FOUR-CASE
// BRANCH, THE ORACLE IT CLOSES, AND THE ONE NEW ID-TAKING ACTION IT SHIPS.
//
// WHAT CHANGED. `inviteStaff` used to refuse any address that already belonged
// to a teacher, flatly: "Someone with that email is already on StoryJar." It
// now reads `{ id, schoolId }` and branches four ways — no account (create the
// INVITED Teacher row, as before); an account with no school (write a
// `SchoolInvitation` and mail a notification); an account already on this
// school (refuse); an account on another school (refuse, WITHOUT naming it).
// docs/dpo-decisions.md, 2 September 2026.
//
// WHAT BREAKS IF THIS FAILS, in three separate ways.
//
//   1. THE ACCOUNT-EXISTENCE ORACLE. The old sentence let anybody with an
//      admin console type any address in the country and be told whether that
//      person has a StoryJar account. That is FINDINGS F6's problem — the one
//      `requestMagicLink` is careful not to be — wearing an admin's clothes.
//      Cases 1 and 2 now render identically, so a schoolless account no longer
//      confirms itself. If they ever stop rendering identically, the oracle is
//      back and nobody will notice, because the screen will look tidier.
//
//   2. AN UNVERIFIED SCHOOL PULLING IN SOMEBODY ELSE'S PUPILS. Anybody at all
//      can sign up as a teacher (no address is verified — F67), raise a
//      purchase order against a school they have nothing to do with, and get an
//      admin console on 30-day terms. The 1 September decision lets such a
//      school invite staff, on the ground that an invitation does nothing until
//      it is accepted. That is true of a brand-new person, who brings nothing.
//      It is FALSE of this invitee, who brings classes, pupils and journals
//      into a stranger's console — so an unverified school is refused for every
//      case where an account already exists.
//
//   3. A NEW ACTION THAT TAKES AN ID. `cancelSchoolInvitation` accepts an
//      invitation id from a form. An id-taking action that is not scoped to the
//      caller's school is a cross-tenant write, which is why that is the first
//      test in this file rather than the last.
//
// HOW THE REQUESTS ARE MADE, and why none of them is a hand-built POST. Next
// refuses a POST assembled by hand before any application code runs (an action
// needs a valid action id), so an assertion against one holds against a request
// that could never have done anything and cannot fail. Every negative below
// either fills in a form the server itself rendered, or TAMPERS WITH ONE — the
// technique `class-handover.spec.ts` and `unverified-school-gates.spec.ts`
// record.
//
// EVERY NEGATIVE HAS A POSITIVE CONTROL THAT DIFFERS BY ONE THING. For the
// cross-tenant test that one thing is the id in a hidden field; for the
// unverified test it is `School.verifiedAt`; for case 4 it is the address
// typed. Without them a green test would only prove that some request or other
// did nothing, which a typo also proves.
//
// This is a BLOCKING test.
// ===========================================================================

const db = new PrismaClient();

// The schoolless fixture teacher: a real, ACTIVE, free-plan account with a
// class and three pupils and no school at all (prisma/seed-test.ts). She is
// case 2 in person — the teacher who signed up free in September and whose
// school buys in January.
//
// Declared here rather than in `tests/battery/helpers.ts` on purpose: the
// teacher's own side of this feature is being built in a second session, and
// two sessions adding constants to one shared helper is a merge conflict in the
// file every spec imports. Promote it there when both halves have landed.
const FREE_TEACHER = {
  email: "free.teacher@example.test",
  password: "password",
} as const;

/**
 * How many school invitations StoryJar has tried to send, across every outcome.
 *
 * SUMMED OVER OUTCOMES, and that is not laziness. A fixture environment has no
 * mail credentials, so every attempt lands under FAILED or UNCONFIGURED — which
 * is still an attempt, and still means the address was told something. Counting
 * only SENT would make "no mail was sent" pass in an environment where mail
 * never works, which is every environment this suite runs in.
 *
 * `MailCounter` is a per-day tally rather than a row per send, on purpose
 * (F6: a per-send list rebuilds the enumeration oracle). A tally still answers
 * the only question asked here — did something go out, or not.
 */
async function schoolInvitationMail(): Promise<number> {
  const rows = await db.mailCounter.findMany({ where: { templateKey: "school-invitation" } });
  return rows.reduce((n, r) => n + r.count, 0);
}

/** Stamp or clear a school's payment date. The one variable in test 2. */
async function setVerified(schoolId: string, verified: boolean) {
  await db.school.update({
    where: { id: schoolId },
    data: { verifiedAt: verified ? new Date() : null },
  });
}

/** Fill in and send the console's own invite form. */
async function invite(page: Page, name: string, email: string) {
  await page.goto("/admin");
  await page.getByRole("button", { name: /invite staff/i }).click();
  await page.fill("#inv-name", name);
  await page.fill("#inv-email", email);
  await page.selectOption("#inv-role", "TEACHER");
  await page.getByRole("button", { name: /send invite/i }).click();
}

/** One rendered staff row, picked out by the address in it. */
function staffRow(page: Page, email: string) {
  return page.locator("[data-staff-row]").filter({ hasText: email });
}

async function schoolByName(name: string) {
  return db.school.findFirstOrThrow({ where: { name } });
}

async function freeTeacher() {
  return db.teacher.findUniqueOrThrow({ where: { email: FREE_TEACHER.email } });
}

// Leave the fixtures as the seed left them. Every test here writes invitation
// rows against shared schools, and one that died holding a PENDING offer would
// hand the next spec a staff table with an extra row in it — and, worse, hand
// the teacher-side specs an invitation nobody made.
test.afterEach(async () => {
  const teacher = await db.teacher.findUnique({ where: { email: FREE_TEACHER.email } });
  if (teacher) {
    await db.schoolInvitation.deleteMany({ where: { teacherId: teacher.id } });
  }
  const pennyfields = await db.school.findFirst({ where: { name: SCHOOL_E.name } });
  if (pennyfields) await setVerified(pennyfields.id, false);
});

test.afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// CROSS-TENANT FIRST. A new action takes an id.
// ---------------------------------------------------------------------------
test("School B's admin cannot cancel School A's invitation [cross-tenant]", async ({ page }) => {
  const bede = await schoolByName(SCHOOL_A.name);
  const oakfield = await schoolByName(SCHOOL_B.name);
  const teacher = await freeTeacher();

  // The same teacher, invited by both schools. The model is unique on
  // (teacherId, schoolId), so this is an ordinary state rather than a contrived
  // one: a teacher looking for a job may be asked by two schools at once.
  const inviteFor = (schoolId: string, who: string) =>
    db.schoolInvitation.create({
      data: {
        schoolId,
        teacherId: teacher.id,
        role: "TEACHER",
        invitedName: "Sam Taylor",
        invitedByName: who,
        state: "PENDING",
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

  const bedeInvite = await inviteFor(bede.id, "St Bede's admin");
  let oakInvite = await inviteFor(oakfield.id, "Oakfield's admin");

  await loginTeacher(page, SCHOOL_B.admin);

  // ===== POSITIVE CONTROL: Oakfield cancels its OWN invitation =====
  // If this does not work, the negative below proves nothing — it would be the
  // menu, the action or the session that was wrong rather than the scoping that
  // refused. It also proves the row is rendered on Oakfield's console at all.
  await page.goto("/admin");
  await staffRow(page, FREE_TEACHER.email)
    .getByRole("button", { name: /actions for sam taylor/i })
    .click();
  await page.getByRole("menuitem", { name: /cancel invitation/i }).click();
  await page.getByRole("menuitem", { name: /yes, cancel it/i }).click();
  await expect
    .poll(
      async () =>
        (await db.schoolInvitation.findUniqueOrThrow({ where: { id: oakInvite.id } })).state,
      { message: "a school must be able to cancel its own invitation", timeout: 15_000 },
    )
    .toBe("REVOKED");

  // Put Oakfield's offer back so the negative starts from the state the
  // positive did.
  await db.schoolInvitation.delete({ where: { id: oakInvite.id } });
  oakInvite = await inviteFor(oakfield.id, "Oakfield's admin");

  // ===== THE NEGATIVE: the same form, one value rewritten =====
  // Take the cancel form Oakfield's own console renders and swap the hidden
  // invitation id for St Bede's. The request carries a valid action id, a real
  // session and Oakfield's own admin; only the id is a lie. This is what a
  // tampered client sends.
  await page.goto("/admin");
  await staffRow(page, FREE_TEACHER.email)
    .getByRole("button", { name: /actions for sam taylor/i })
    .click();
  await page.getByRole("menuitem", { name: /cancel invitation/i }).click();
  const planted = await page.evaluate((wanted) => {
    const field = document.querySelector<HTMLInputElement>('input[name="invitationId"]');
    if (!field) return 0;
    field.value = wanted;
    return field.value === wanted ? 1 : 0;
  }, bedeInvite.id);
  expect(
    planted,
    "the cancel form's own hidden field must be found and rewritten, or nothing forged has been sent",
  ).toBe(1);

  const auditBefore = await db.auditLog.count({
    where: { action: "SCHOOL_INVITATION_CANCELLED", schoolId: bede.id },
  });
  await page.getByRole("menuitem", { name: /yes, cancel it/i }).click();
  await page.waitForURL(/\/admin/, { timeout: 15_000 });

  // ===== THE CONSEQUENCE =====
  await expect
    .poll(
      async () =>
        (await db.schoolInvitation.findUniqueOrThrow({ where: { id: bedeInvite.id } })).state,
      {
        message: "another school's invitation must be untouched by an id posted from this console",
        timeout: 15_000,
      },
    )
    .toBe("PENDING");
  expect(
    (await db.schoolInvitation.findUniqueOrThrow({ where: { id: oakInvite.id } })).state,
    "and the forgery must not have cancelled Oakfield's own offer either — a `where` matching nothing changes nothing",
  ).toBe("PENDING");
  expect(
    await db.auditLog.count({
      where: { action: "SCHOOL_INVITATION_CANCELLED", schoolId: bede.id },
    }),
    "and nothing may be written down against St Bede's as having happened",
  ).toBe(auditBefore);
});

// ---------------------------------------------------------------------------
// AN UNVERIFIED SCHOOL WRITES NOTHING AND SENDS NOTHING, WHATEVER THE ADDRESS
// ---------------------------------------------------------------------------
test("an unverified school cannot invite an existing account, and gets one sentence for every kind [counted]", async ({
  page,
}) => {
  const pennyfields = await schoolByName(SCHOOL_E.name);
  const teacher = await freeTeacher();

  await setVerified(pennyfields.id, false);
  await loginTeacher(page, SCHOOL_E.admin);

  const mailBefore = await schoolInvitationMail();
  const refusals: string[] = [];

  // ===== CASE 2: an account with no school =====
  await invite(page, "Sam Taylor", FREE_TEACHER.email);
  await expect(page.locator('p[role="alert"]')).toContainText(/while the school plan is unpaid/i);
  refusals.push((await page.locator('p[role="alert"]').innerText()).trim());

  // ===== CASE 3: an account already on THIS school =====
  await invite(page, "Sam Taylor", SCHOOL_E.teacher.email);
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  refusals.push((await page.locator('p[role="alert"]').innerText()).trim());

  // ===== CASE 4: an account on ANOTHER school =====
  await invite(page, "Sam Taylor", SCHOOL_B.teacher.email);
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  refusals.push((await page.locator('p[role="alert"]').innerText()).trim());

  // ONE SENTENCE, THE SAME ONE, FOR ALL THREE. This is the assertion that
  // matters most in this test: an unpaid school must not be able to tell, from
  // the wording it gets back, whether the address it typed belongs to a teacher
  // with no school, to one of its own colleagues, or to somebody at a school it
  // has never heard of.
  expect(
    new Set(refusals).size,
    "an unverified school must get the SAME refusal whichever kind of account it typed",
  ).toBe(1);

  // ===== NOTHING WAS WRITTEN =====
  expect(
    await db.schoolInvitation.count({ where: { schoolId: pennyfields.id } }),
    "no invitation row may exist — a refusal after the row is written is not a refusal",
  ).toBe(0);
  expect(
    await db.teacher.count({ where: { id: teacher.id, schoolId: { not: null } } }),
    "and the invitee must still have no school",
  ).toBe(0);

  // ===== NOTHING WAS SENT, PROVED AGAINST A CONTROL THAT RAISES THE COUNT ====
  // On its own, "the counter did not move" passes identically when mail is
  // broken for everybody. So the same school, the same admin, the same form and
  // the same address are used again with ONE thing changed — `verifiedAt` — and
  // the count has to move. Without this half the assertion above is worthless.
  const mailAfterRefusals = await schoolInvitationMail();
  expect(
    mailAfterRefusals,
    "an unverified school's refused invitation must send no notification at all",
  ).toBe(mailBefore);

  await setVerified(pennyfields.id, true);
  await invite(page, "Sam Taylor", FREE_TEACHER.email);
  await expect
    .poll(
      async () =>
        db.schoolInvitation.count({
          where: { schoolId: pennyfields.id, teacherId: teacher.id, state: "PENDING" },
        }),
      {
        message: "a VERIFIED school must be able to invite the same teacher, or nothing is proved",
        timeout: 15_000,
      },
    )
    .toBe(1);
  await expect
    .poll(schoolInvitationMail, {
      message:
        "and that invitation must actually send mail — otherwise 'no mail was sent' above proves only that mail is broken",
      timeout: 15_000,
    })
    .toBeGreaterThan(mailAfterRefusals);
});

// ---------------------------------------------------------------------------
// THE ORACLE. Cases 1 and 2 must be the same row.
// ---------------------------------------------------------------------------
test("an address with an account and one without produce the same row on the console", async ({
  page,
}) => {
  const bede = await schoolByName(SCHOOL_A.name);
  const stamp = Date.now();
  const newcomer = `bede.newcomer.${stamp}@example.test`;

  // St Bede's already has one INVITED colleague in the fixtures (J. Reed), so
  // the counts below are read as a BASELINE PLUS TWO rather than hardcoded. A
  // number written into the test is a number that goes stale the next time
  // somebody adds a fixture, and the assertion that matters is that BOTH
  // invitations moved the same count — not what it started at.
  const baseInvited =
    (await db.teacher.count({ where: { schoolId: bede.id, status: "INVITED" } })) +
    (await db.schoolInvitation.count({
      where: { schoolId: bede.id, state: "PENDING", expiresAt: { gt: new Date() } },
    }));

  try {
    await loginTeacher(page, SCHOOL_A.admin);

    // THE SAME NAME IS TYPED FOR BOTH, deliberately. `invitedName` is what the
    // admin typed and never the account's own, so an admin inviting two people
    // they believe to be similar gets rows that differ only by address — which
    // is what makes the comparison below about the CODE rather than about two
    // different strings.
    await invite(page, "Sam Taylor", newcomer); // case 1: no account
    await expect
      .poll(async () => db.teacher.count({ where: { email: newcomer } }), { timeout: 15_000 })
      .toBe(1);

    await invite(page, "Sam Taylor", FREE_TEACHER.email); // case 2: schoolless account
    await expect
      .poll(
        async () =>
          db.schoolInvitation.count({ where: { schoolId: bede.id, state: "PENDING" } }),
        { message: "the invitation must have been written, or there is no second row", timeout: 15_000 },
      )
      .toBe(1);

    await page.goto("/admin");
    const one = staffRow(page, newcomer);
    const two = staffRow(page, FREE_TEACHER.email);
    await expect(one).toHaveCount(1);
    await expect(two).toHaveCount(1);

    // ===== THE ROWS THEMSELVES =====
    // Read as text and with the address blanked out, because the address is the
    // ONE thing that is legitimately different. Anything else that differs is a
    // signal telling the admin which of the two addresses already had a StoryJar
    // account — the oracle the four-case branch exists to close.
    const textOf = async (row: ReturnType<typeof staffRow>, email: string) =>
      (await row.innerText()).split(email).join("{{EMAIL}}").replace(/\s+/g, " ").trim();
    expect(
      await textOf(one, newcomer),
      "a fresh INVITED teacher and a pending invitation must read identically",
    ).toBe(await textOf(two, FREE_TEACHER.email));

    // The role badge is an attribute rather than text, so it is checked
    // separately — a different colour or a different word here would be the
    // same tell by another route.
    expect(await one.locator("[data-staff-role]").getAttribute("data-staff-role")).toBe(
      await two.locator("[data-staff-role]").getAttribute("data-staff-role"),
    );
    expect(
      await one.locator("[data-staff-role]").evaluate((el) => getComputedStyle(el).color),
      "and the same colour",
    ).toBe(await two.locator("[data-staff-role]").evaluate((el) => getComputedStyle(el).color));

    // ===== THE COUNTS ON THE OVERVIEW TAB =====
    // Two invitations pending, not one. A stats card or a to-do line that
    // counted only Teacher rows would move for case 1 and stand still for case
    // 2, which is the oracle again on a different tab.
    const expectedInvited = baseInvited + 2;
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await expect(page.getByText(`${expectedInvited} invites pending`)).toBeVisible();
    await expect(
      page.getByText(
        new RegExp(`${expectedInvited} colleagues have not accepted their invite yet`, "i"),
      ),
    ).toBeVisible();

    // ===== THE AUDIT TAB =====
    // Both writes land as STAFF_INVITED with the same detail, so the log cannot
    // be read backwards to learn which address had an account.
    const auditDetails = await db.auditLog.findMany({
      where: { action: "STAFF_INVITED", schoolId: bede.id, detail: "Invited Sam Taylor as TEACHER" },
      select: { id: true },
    });
    expect(
      auditDetails.length,
      "both invitations must be audited in the same words, or the audit tab is the oracle",
    ).toBe(2);

    // ===== WHERE THEY DO DIFFER, STATED RATHER THAN LEFT TO BE FOUND =====
    // The ⋯ menu. An invitation has no Teacher row in this school, so there is
    // nothing to assign a class to and no role to edit; a fresh INVITED teacher
    // has both. That is a real residual — an admin who opens the menu can tell
    // which kind of row it is — and it is asserted here so that the
    // "indistinguishable" claim above is read as the narrow, true one rather
    // than as a promise the product does not keep.
    // WAIT FOR HYDRATION BEFORE EACH CLICK, and this is not belt-and-braces.
    // A server-rendered ⋯ button is visible, enabled and stable — everything
    // Playwright's click waits for — before React has attached its handler, so
    // a click that lands first does nothing and leaves no trace. The CI trace
    // for the first red run measured these two clicks at 10ms and 11ms after
    // their goto; the first happened to win the race and the second happened
    // to lose it, on the same runner, on three runs in a row. `networkidle` is
    // the idiom the rest of the battery already uses for this (seven specs).
    // The F69 popover did not cause it — it made the console's hydration
    // heavier and exposed a race this spec always carried.
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await one.getByRole("button", { name: /actions for sam taylor/i }).click();
    await expect(page.getByRole("menuitem", { name: /assign classes/i })).toBeVisible();
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await two.getByRole("button", { name: /actions for sam taylor/i }).click();
    await expect(page.getByRole("menuitem", { name: /cancel invitation/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /assign classes/i })).toHaveCount(0);
  } finally {
    const row = await db.teacher.findFirst({ where: { email: newcomer } });
    if (row) {
      await db.auditLog.deleteMany({ where: { subjectId: row.id } });
      await db.teacherPasswordToken.deleteMany({ where: { teacherId: row.id } });
      await db.teacher.delete({ where: { id: row.id } });
    }
    await db.auditLog.deleteMany({
      where: { action: "STAFF_INVITED", detail: "Invited Sam Taylor as TEACHER" },
    });
  }
});

// ---------------------------------------------------------------------------
// CASE 4 NEVER NAMES THE OTHER SCHOOL
// ---------------------------------------------------------------------------
test("inviting a teacher who works at another school never says which school", async ({ page }) => {
  const bede = await schoolByName(SCHOOL_A.name);
  const outsider = await db.teacher.findUniqueOrThrow({
    where: { email: SCHOOL_B.teacher.email },
  });

  await loginTeacher(page, SCHOOL_A.admin);

  // ===== THE NEGATIVE =====
  await invite(page, "Sam Taylor", SCHOOL_B.teacher.email);
  const alert = page.locator('p[role="alert"]');
  await expect(alert).toBeVisible();
  const said = await alert.innerText();

  // WHERE A STRANGER WORKS IS REAL INFORMATION ABOUT AN ADULT, and the admin
  // supplied only an email address to get it. Nor may the sentence carry that
  // adult's name, which the admin also did not have.
  expect(said, "the other school must never be named").not.toContain(SCHOOL_B.name);
  expect(said, "nor any part of it").not.toMatch(/oakfield/i);
  expect(said, "nor the person's real name").not.toContain(outsider.name);
  expect(said, "nor their display name").not.toContain(outsider.displayName);
  // CONDITIONAL WORDING, which is what lets the sentence be useful without
  // being a confirmation: it tells an admin what to do if the address belongs
  // to somebody already using StoryJar, without asserting that it does.
  expect(said).toMatch(/if they already use storyjar with another school/i);

  expect(
    await db.schoolInvitation.count({ where: { schoolId: bede.id, teacherId: outsider.id } }),
    "and no invitation row may be written for somebody another school already holds",
  ).toBe(0);
  expect(
    (await db.teacher.findUniqueOrThrow({ where: { id: outsider.id } })).schoolId,
    "and the outsider must still be at their own school",
  ).not.toBe(bede.id);

  // ===== POSITIVE CONTROL: the same form, one address different =====
  // A schoolless account goes through. So the refusal above is about the
  // invitee's `schoolId` and not about the form, the session or the action.
  await invite(page, "Sam Taylor", FREE_TEACHER.email);
  await expect
    .poll(async () => db.schoolInvitation.count({ where: { schoolId: bede.id, state: "PENDING" } }), {
      message: "the same form must still work for a teacher with no school",
      timeout: 15_000,
    })
    .toBe(1);
  await db.auditLog.deleteMany({
    where: { action: "STAFF_INVITED", detail: "Invited Sam Taylor as TEACHER" },
  });
});
