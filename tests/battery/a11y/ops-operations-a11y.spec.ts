import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_C, asOperator } from "../helpers";

// ===========================================================================
// A28 - Accessibility of the named operations (PR4, ruling R15)
//
// An EMPTY axe baseline, as every ops screen has had since the first commit:
// no rule excluded and no impact level forgiven. BASELINE_RULES in
// tests/battery/a11y/axe.spec.ts, which still carries the two tracked F11
// palette rules for the teacher product, is not touched by this work in either
// direction.
//
// A confirm step is where an accessible screen usually stops being one, so the
// things axe cannot see are asserted directly:
//
//   Submit is NEVER disabled, not for a reason that is too short and not while
//   the request is in flight. A disabled control is unfocusable, announces
//   nothing, and hands a keyboard or screen reader user a dead end with no
//   stated cause. The button says what is happening and aria-busy carries it.
//
//   Opening the panel moves focus into it, so the title and then every
//   consequence are read in order rather than appearing silently below the
//   fold. Cancelling puts focus back on the control that was pressed, which is
//   the half people forget.
//
//   The whole operation is completable with the keyboard alone: reach the
//   trigger, open it, type the reason, confirm, read the outcome.
//
//   No state is carried by colour. Refused, working and done are sentences.
//
//   Zero horizontal overflow at 390px with the panel open. The operator does
//   this on a phone, mid-call, and the panel is the widest thing in the area.
// ===========================================================================

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const db = new PrismaClient();

const FIXTURE_EMAIL = "pr4-a11y-family@storyjar.test";
const ROTATE = /issue a new family code/i;
const REVEAL = /show this address in full/i;

test.beforeAll(async () => {
  const pupil = await db.student.findFirst({
    where: { name: SCHOOL_C.student, class: { classCode: SCHOOL_C.classCode } },
    select: { id: true },
  });
  expect(pupil, "the frozen school's fixture pupil").not.toBeNull();
  await db.parent.deleteMany({ where: { email: FIXTURE_EMAIL } });
  await db.parent.create({
    data: {
      email: FIXTURE_EMAIL,
      familyCode: "PR4A11Y1",
      children: { connect: { id: pupil!.id } },
    },
  });
});

test.afterAll(async () => {
  const family = await db.parent.findUnique({ where: { email: FIXTURE_EMAIL }, select: { id: true } });
  if (family) await db.opsAuditLog.deleteMany({ where: { subjectId: family.id } });
  await db.parent.deleteMany({ where: { email: FIXTURE_EMAIL } });
  await db.$disconnect();
});

async function assertStrictNoViolations(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(
    results.violations.map(
      (v) =>
        `(${v.impact}) ${v.id}: ${v.help} [${v.nodes.length} node(s)] ${v.nodes[0]?.target?.join(" ")}`,
    ),
    `WCAG 2.2 AA violations on ${where} - the operator screens are held to an EMPTY baseline`,
  ).toEqual([]);
}

async function findTheFamily(page: Page) {
  await page.goto("/ops/lookup");
  await page.check("#kind-PARENT");
  await page.fill("#email", FIXTURE_EMAIL);
  await page.fill("#reason", "Checking the record before acting on it, as asked.");
  await page.getByRole("button", { name: /search and record the reason/i }).click();
  await expect(page.getByRole("heading", { name: /^result$/i })).toBeVisible();
}

test("a11y (AA, empty baseline): a record with both operations, closed and open", async ({
  page,
}) => {
  await asOperator(page);
  await findTheFamily(page);
  // An axe scan of a page that did not render is a clean scan, so anchor first.
  await expect(page.getByRole("button", { name: ROTATE })).toBeVisible();
  await assertStrictNoViolations(page, "a parent record with both operations offered");

  await page.getByRole("button", { name: ROTATE }).click();
  await expect(page.getByRole("region", { name: ROTATE })).toBeVisible();
  await assertStrictNoViolations(page, "the rotation confirm step, open");

  // And with a message in the live region, which is the state where a wrongly
  // associated error or an unlabelled control usually shows up.
  await page.getByRole("region", { name: ROTATE }).getByRole("textbox").fill("short");
  await page.getByRole("button", { name: /yes, issue a new code/i }).click();
  await expect(page.getByRole("region", { name: ROTATE }).getByRole("alert")).toContainText(
    "At least 12 characters",
  );
  await assertStrictNoViolations(page, "the rotation confirm step, refused");
});

test("the whole operation is completable with the keyboard alone", async ({ page }) => {
  await asOperator(page);
  await findTheFamily(page);

  // Tab until the trigger has focus, rather than clicking it. A control that
  // cannot be reached this way is a control the operator cannot use.
  const trigger = page.getByRole("button", { name: REVEAL });
  await expect(trigger).toBeVisible();
  for (let i = 0; i < 40 && !(await trigger.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  expect(
    await trigger.evaluate((el) => el === document.activeElement),
    "the operation trigger was not reachable by Tab",
  ).toBe(true);

  await page.keyboard.press("Enter");
  const panel = page.getByRole("region", { name: REVEAL });
  await expect(panel).toBeVisible();

  // Focus moved into the panel, onto its title, so a screen reader reads the
  // title and then the consequences in order instead of announcing nothing.
  expect(
    await panel.evaluate((el) => el.firstElementChild === document.activeElement),
    "opening the panel did not move focus to its title",
  ).toBe(true);

  // Reach the reason box, type, and confirm, all from the keyboard.
  const reason = panel.getByRole("textbox");
  for (let i = 0; i < 10 && !(await reason.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await page.keyboard.type("Parent reports no sign-in link arriving at all.");
  const confirm = panel.getByRole("button", { name: /yes, show the address/i });
  for (let i = 0; i < 10 && !(await confirm.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Enter");
  await expect(panel).toContainText(FIXTURE_EMAIL);
  await assertStrictNoViolations(page, "the disclosure outcome");
});

test("cancelling puts focus back on the control that was pressed", async ({ page }) => {
  await asOperator(page);
  await findTheFamily(page);
  await page.getByRole("button", { name: ROTATE }).click();
  await expect(page.getByRole("region", { name: ROTATE })).toBeVisible();

  await page.getByRole("region", { name: ROTATE }).getByRole("button", { name: /^cancel$/i }).click();
  const trigger = page.getByRole("button", { name: ROTATE });
  await expect(trigger).toBeVisible();
  expect(
    await trigger.evaluate((el) => el === document.activeElement),
    "cancelling stranded focus at the top of the document",
  ).toBe(true);
});

test("submit is never disabled, and every state is words rather than colour", async ({ page }) => {
  await asOperator(page);
  await findTheFamily(page);
  await page.getByRole("button", { name: ROTATE }).click();
  const panel = page.getByRole("region", { name: ROTATE });
  const confirm = panel.getByRole("button", { name: /yes, issue a new code/i });

  // Empty reason: still enabled.
  await expect(confirm).not.toBeDisabled();
  await confirm.click();
  await expect(panel.getByRole("alert")).toContainText("Say why");
  await expect(confirm, "submit was disabled after a refusal").not.toBeDisabled();

  // The consequences are sentences, and the one that matters most is the one
  // amendment C1 turns on: the operator is told, in words, that they will not
  // see the code and who will.
  await expect(panel).toContainText("You will not see the new code");
  await expect(panel).toContainText("The school is not told automatically");
});

test("no horizontal overflow at 390px with a confirm step open", async ({ page }) => {
  await asOperator(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await findTheFamily(page);
  await page.getByRole("button", { name: REVEAL }).click();
  await expect(page.getByRole("region", { name: REVEAL })).toBeVisible();
  // The long fixture address is on screen at this width, and an email address
  // is the content most likely to push a card out.
  await expect(page.locator("main")).toContainText("pr***@storyjar.test");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "horizontal overflow on /ops/lookup at 390px").toBeLessThanOrEqual(1);
});
