import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, loginTeacher } from "../helpers";

// ===========================================================================
// THE TEACHER'S SIDE of a school invitation, held to WCAG 2.2 AA: the banner
// that follows her around, the screen that explains what joining would mean,
// and the two buttons on it.
//
// WHY IT IS ITS OWN FILE rather than a line in axe.spec.ts, and why it is not
// in school-invitation.spec.ts beside it: that file scans the ADMIN console
// with an invitation on it. This one signs in as the person the offer was made
// to, which is a different account, a different shell and three screens nothing
// else in the battery has ever rendered.
//
// THE TWO BUTTONS ARE THE POINT OF THE LAST TEST. They are deliberately
// identical in weight — same size, same border, same colour — because the
// Children's Code's line on nudge techniques applies to an adult deciding
// whether a school becomes responsible for a class of children's work. A
// keyboard walk is how that survives a later redesign: if one of them ever
// stops being reachable, or stops being a button, the screen has started
// steering.
//
// The F11 contrast baseline is honoured, as everywhere; nothing else is.
// ===========================================================================

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BASELINE_RULES = new Set(["color-contrast", "link-in-text-block"]);

const db = new PrismaClient();

// The schoolless fixture teacher (prisma/seed-test.ts): a real ACTIVE account
// with a class and three pupils and no school, seeded for exactly this feature.
// NOTHING HERE ACCEPTS ANYTHING — an acceptance would put a shared fixture into
// a school for good and take the rest of this project's scans with it.
const FREE_TEACHER = { email: "free.teacher@example.test", password: "password" };

let invitationId = "";

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
}

function assertNoSeriousViolations(results: Awaited<ReturnType<typeof scan>>, where: string) {
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const blocking = serious.filter((v) => !BASELINE_RULES.has(v.id));
  const baseline = serious.filter((v) => BASELINE_RULES.has(v.id));
  if (baseline.length) {
    const nodes = baseline.reduce((n, v) => n + v.nodes.length, 0);
    console.log(`[a11y] ${where}: F11 baseline — ${baseline.map((v) => v.id).join(", ")} (${nodes} node(s), tracked).`);
  }
  expect(
    blocking.map((v) => `(${v.impact}) ${v.id}: ${v.help} [${v.nodes.length} node(s)]`),
    `NEW serious/critical WCAG 2.2 AA violations on ${where}`,
  ).toEqual([]);
}

test.beforeEach(async () => {
  const school = await db.school.findFirstOrThrow({ where: { name: SCHOOL_A.name } });
  const teacher = await db.teacher.findUniqueOrThrow({ where: { email: FREE_TEACHER.email } });
  expect(teacher.schoolId, "the fixture teacher must still be schoolless, or something accepted on her behalf").toBeNull();
  await db.schoolInvitation.deleteMany({ where: { teacherId: teacher.id } });
  const invitation = await db.schoolInvitation.create({
    data: {
      schoolId: school.id,
      teacherId: teacher.id,
      role: "TEACHER",
      invitedName: "Sam Taylor",
      invitedByName: "Mrs Lindqvist",
      state: "PENDING",
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  invitationId = invitation.id;
});

// Removed however the test ended. The a11y project shares a database with the
// security project's, and an invitation left standing puts a row on a staff
// table that other specs count.
test.afterEach(async () => {
  const teacher = await db.teacher.findUnique({ where: { email: FREE_TEACHER.email } });
  if (teacher) await db.schoolInvitation.deleteMany({ where: { teacherId: teacher.id } });
});

test.afterAll(async () => {
  await db.$disconnect();
});

test("a11y (AA): the invitation banner, on the screen a teacher lands on", async ({ page }) => {
  await loginTeacher(page, FREE_TEACHER);
  await page.goto("/teacher");

  const banner = page.getByRole("status").filter({ hasText: /has asked you to join/i });
  await expect(banner, "a schoolless teacher with an open offer must be told").toBeVisible();
  assertNoSeriousViolations(await scan(page), "the teacher dashboard with an invitation banner");

  // ITS ONE CONTROL, at the 44px floor. It sits outside the shell's
  // `data-shell` regions, so teacher-touch-targets.spec.ts does not reach it —
  // which is why it is measured here instead of nowhere.
  const link = banner.getByRole("link");
  await expect(link).toHaveCount(1);
  const size = await link.boundingBox();
  expect(size!.height, "the only control on a banner that appears on every screen").toBeGreaterThanOrEqual(44);

  // And it goes where it says it goes.
  await link.click();
  await page.waitForURL((url) => url.pathname === `/teacher/account/invitation/${invitationId}`);
});

test("a11y (AA): the acceptance screen, which is the whole argument in words", async ({ page }) => {
  await loginTeacher(page, FREE_TEACHER);
  await page.goto(`/teacher/account/invitation/${invitationId}`);

  await expect(page.getByRole("heading", { level: 1 })).toContainText(SCHOOL_A.name);
  assertNoSeriousViolations(await scan(page), "the invitation acceptance screen");

  // The card on the account page that leads here is the other way in, and it
  // is a different surface: a list, inside a page full of other cards.
  await page.goto("/teacher/account");
  await expect(page.getByRole("heading", { name: /has asked you to join/i })).toBeVisible();
  assertNoSeriousViolations(await scan(page), "the account page with an open invitation on it");
});

test("a11y (AA): both decisions are reachable by keyboard, and neither is styled to be pressed", async ({ page }) => {
  await loginTeacher(page, FREE_TEACHER);
  await page.goto(`/teacher/account/invitation/${invitationId}`);

  const join = page.getByRole("button", { name: /^Join / });
  const decline = page.getByRole("button", { name: /no thank you/i });
  await expect(join).toBeVisible();
  await expect(decline).toBeVisible();

  // Both at the AA target floor, and comfortably: this is a decision screen.
  for (const [label, control] of [["join", join], ["decline", decline]] as const) {
    const box = await control.boundingBox();
    expect(box!.height, `the ${label} button must be at least 44px tall`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `the ${label} button must be at least 44px wide`).toBeGreaterThanOrEqual(44);
  }

  // NEITHER IS NUDGED. Same background, same border, same font weight. This is
  // an assertion about a safeguarding decision (docs/dpo-decisions.md, 2
  // September 2026) that happens to be expressible in CSS: a filled jam-red
  // "Join" beside a quiet outlined "No thank you" would be the product having
  // an opinion about whether a school should get a class of children's work.
  const style = (l: typeof join) =>
    l.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderColor, weight: cs.fontWeight, size: cs.fontSize };
    });
  expect(await style(join), "the two decisions must look equally pressable").toEqual(await style(decline));

  // Both reachable with the keyboard alone, from the top of the page.
  const reached: string[] = [];
  await page.keyboard.press("Tab");
  for (let i = 0; i < 30; i++) {
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      return el.tagName.toLowerCase() === "button" ? (el.textContent ?? "").trim() : null;
    });
    if (label) reached.push(label);
    await page.keyboard.press("Tab");
  }
  expect(reached.some((l) => /^Join /.test(l)), "Join must be reachable without a mouse").toBe(true);
  expect(reached.some((l) => /no thank you/i.test(l)), "and so must the way out").toBe(true);
});
