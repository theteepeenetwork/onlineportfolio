import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_E, loginTeacher } from "../helpers";

// ===========================================================================
// The staff table with a PENDING INVITATION in it, and the invite form beside
// it, held to WCAG 2.2 AA — in both the verified and the unverified state.
//
// WHY IT IS NOT ANOTHER LINE IN axe.spec.ts. That file's admin scans reach a
// staff table made entirely of `Teacher` rows, because that is all a fixture
// school has. A pending `SchoolInvitation` — an offer made to somebody who
// already had a StoryJar account — is a row nothing seeds and nothing on the
// unverified console can create, since an unverified school is refused that
// invitation on purpose. So the row is written here, directly, which is the
// only way either state can be scanned at all.
//
// WHAT IS SCANNED, AND WHY EACH ONE IS ITS OWN SURFACE:
//
//   1. THE TABLE WITH AN INVITATION IN IT. The row is deliberately identical to
//      a fresh INVITED teacher's — same label, same colour, same place — so a
//      scan of it is mostly a scan of markup that already passed. It is here
//      because "mostly" is doing work in that sentence: the row is built from a
//      different object, and a missing accessible name on its actions button
//      would be new.
//
//   2. THE ⋯ MENU OF AN INVITATION, which is a `role="menu"` nothing has ever
//      opened. It has one item where a teacher's has four.
//
//   3. THE CANCEL CONFIRMATION INSIDE IT. This is the one that earns its place:
//      a `role="menu"` may own only menu items and groups, so a confirmation
//      that is a paragraph plus two controls has to be wrapped in a
//      `role="group"` or it is a critical `aria-required-children`. That exact
//      fault was found in the three sibling panels in this console the first
//      time anything opened one, and this panel is the fourth of its kind.
//
//   4. THE INVITE FORM, in both states, which is where an admin forms the
//      intention. axe.spec.ts already scans it; what is new here is scanning it
//      on a console that has an invitation row on it, because that is the
//      screen an admin actually has in front of them the second time they use
//      the form.
//
// The F11 contrast baseline is honoured — that is the palette debt every screen
// in this product carries — and nothing else is tolerated.
// ===========================================================================

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BASELINE_RULES = new Set(["color-contrast", "link-in-text-block"]);

const db = new PrismaClient();

// The schoolless fixture teacher (prisma/seed-test.ts): a real ACTIVE account
// with a class and three pupils and no school, which is what makes an
// invitation to her a realistic row rather than a hand-built one.
const FREE_TEACHER_EMAIL = "free.teacher@example.test";

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
}

function assertNoSeriousViolations(results: Awaited<ReturnType<typeof scan>>, where: string) {
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const blocking = serious.filter((v) => !BASELINE_RULES.has(v.id));
  const baseline = serious.filter((v) => BASELINE_RULES.has(v.id));
  if (baseline.length) {
    const nodes = baseline.reduce((n, v) => n + v.nodes.length, 0);
    console.log(
      `[a11y] ${where}: F11 baseline — ${baseline.map((v) => v.id).join(", ")} (${nodes} node(s), tracked).`,
    );
  }
  expect(
    blocking.map((v) => `(${v.impact}) ${v.id}: ${v.help} [${v.nodes.length} node(s)]`),
    `NEW serious/critical WCAG 2.2 AA violations on ${where}`,
  ).toEqual([]);
}

/** Put a pending invitation from `schoolName` to the schoolless fixture teacher. */
async function inviteFixtureTeacher(schoolName: string) {
  const school = await db.school.findFirstOrThrow({ where: { name: schoolName } });
  const teacher = await db.teacher.findUniqueOrThrow({ where: { email: FREE_TEACHER_EMAIL } });
  await db.schoolInvitation.deleteMany({ where: { teacherId: teacher.id, schoolId: school.id } });
  await db.schoolInvitation.create({
    data: {
      schoolId: school.id,
      teacherId: teacher.id,
      role: "TEACHER",
      // The name the ADMIN typed, never the account's own — see the column's
      // comment in prisma/schema.prisma. It is a plain fictional name here for
      // the same reason it is one everywhere else in these fixtures.
      invitedName: "Sam Taylor",
      invitedByName: "Mrs Lindqvist",
      state: "PENDING",
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
}

// The row is removed however the test ended. A11y specs share a database with
// the security project's, and an invitation left standing would put an extra
// row on a staff table that other specs count.
test.afterEach(async () => {
  const teacher = await db.teacher.findUnique({ where: { email: FREE_TEACHER_EMAIL } });
  if (teacher) await db.schoolInvitation.deleteMany({ where: { teacherId: teacher.id } });
});

test.afterAll(async () => {
  await db.$disconnect();
});

test("a11y (AA): a pending invitation on a verified school's staff table", async ({ page }) => {
  await inviteFixtureTeacher(SCHOOL_A.name);
  await loginTeacher(page, SCHOOL_A.admin);

  await page.goto("/admin");
  const row = page.locator("[data-staff-row]").filter({ hasText: FREE_TEACHER_EMAIL });
  await expect(row, "the invitation must be merged into the staff table").toHaveCount(1);
  assertNoSeriousViolations(await scan(page), "admin staff table with an invitation");

  // The invite form, on a console that already has an invitation row on it.
  await page.getByRole("button", { name: /invite staff/i }).click();
  await expect(page.locator('#inv-role option[value="ADMIN"]')).toBeEnabled();
  assertNoSeriousViolations(await scan(page), "admin invite form beside an invitation");

  // The invitation's own menu: one item where a teacher's has four.
  await page.goto("/admin");
  await row.getByRole("button", { name: /^actions for /i }).click();
  await expect(page.getByRole("menuitem", { name: /cancel invitation/i })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: /assign classes/i }),
    "an invitation has no Teacher row in this school to assign a class to",
  ).toHaveCount(0);
  assertNoSeriousViolations(await scan(page), "invitation row menu");

  // THE CONFIRMATION, which is a paragraph and two controls inside a
  // `role="menu"` — the shape that was a critical `aria-required-children` in
  // all three sibling panels until each was wrapped in a group.
  await page.getByRole("menuitem", { name: /cancel invitation/i }).click();
  await expect(page.getByText(/nothing has moved and nothing is deleted/i)).toBeVisible();
  assertNoSeriousViolations(await scan(page), "cancel invitation confirmation");
});

test("a11y (AA): a pending invitation on an unpaid school's staff table", async ({ page }) => {
  // AN UNVERIFIED SCHOOL CANNOT MAKE ONE OF THESE, which is the whole point of
  // the gate — so the row is written directly. What it can still do is HOLD
  // one: a school that invited an existing teacher and then stopped paying, or
  // whose invoice has not landed yet, has this exact screen. The banner, the
  // disabled admin option and the invitation row are all on it at once, and
  // that combination has never been scanned.
  await inviteFixtureTeacher(SCHOOL_E.name);
  await loginTeacher(page, SCHOOL_E.admin);

  await page.goto("/admin");
  await expect(page.getByRole("status")).toBeVisible();
  const row = page.locator("[data-staff-row]").filter({ hasText: FREE_TEACHER_EMAIL });
  await expect(row).toHaveCount(1);
  assertNoSeriousViolations(await scan(page), "unpaid admin staff table with an invitation");

  await page.getByRole("button", { name: /invite staff/i }).click();
  await expect(page.locator('#inv-role option[value="ADMIN"]')).toBeDisabled();
  assertNoSeriousViolations(await scan(page), "unpaid invite form beside an invitation");

  // CANCELLING IS NOT GATED ON PAYMENT, and this scan is where that is visible.
  // Every other gate in this console withholds something that moves children's
  // work between adults; withdrawing an offer only ever narrows what a school
  // is offering, and an unpaid school that typed the wrong address needs to be
  // able to take it back.
  await page.goto("/admin");
  await row.getByRole("button", { name: /^actions for /i }).click();
  await page.getByRole("menuitem", { name: /cancel invitation/i }).click();
  await expect(page.getByText(/nothing has moved and nothing is deleted/i)).toBeVisible();
  assertNoSeriousViolations(await scan(page), "unpaid cancel invitation confirmation");
});
