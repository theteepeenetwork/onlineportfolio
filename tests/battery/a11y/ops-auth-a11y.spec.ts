import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { OPERATOR, operatorCode, signInOperator } from "../helpers";

// ===========================================================================
// A22 — Accessibility of the operator door (PR1)
//
// Handbook ruling R15: the frontend role owns the ops accessibility standard;
// this role builds sign-in, TOTP enrolment and TOTP entry to it. The standard
// is an EMPTY baseline, and that is the whole difference between this file and
// tests/battery/a11y/axe.spec.ts, which still carries the two tracked F11 rules
// while the palette debt is worked off. These screens are new, so they start
// clean and stay clean. BASELINE_RULES in that file is not touched here, and no
// rule is excluded here either: every violation axe reports at WCAG 2.2 AA,
// at any impact, fails this suite.
//
// The three requirements most easily lost by being helpful, all from
// SAFEGUARDING rule 18 by way of WCAG 2.2:
//
//   3.3.8 Accessible Authentication — paste works, autofill is not disabled,
//   and the autocomplete values are the ones a password manager and a phone's
//   code-suggestion bar look for. A code field that refuses a paste is a memory
//   test, which is exactly what 3.3.8 exists to forbid.
//
//   2.2.1 Timing Adjustable — two time limits exist here (a code that changes
//   every 30 seconds and a sign-in step that expires after 10 minutes) and both
//   are stated on screen before they bite. They are not extendable, which 2.2.1
//   permits only under its essential exception; a sign-in step for the account
//   that can reach every school's billing state is inside it. What the copy
//   must then do is say what expires, when, and that nothing is lost.
//
//   3.3.1 / 3.3.3 Error identification — the single generic failure string is
//   announced, tied to the field, and never colour alone.
// ===========================================================================

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

async function assertStrictNoViolations(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(
    results.violations.map(
      (v) => `(${v.impact}) ${v.id}: ${v.help} [${v.nodes.length} node(s)] ${v.nodes[0]?.target?.join(" ")}`,
    ),
    `WCAG 2.2 AA violations on ${where} — the operator screens are held to an EMPTY baseline`,
  ).toEqual([]);
}

async function passwordStage(page: Page) {
  await page.context().clearCookies();
  await page.goto("/ops/sign-in");
}

async function codeStage(page: Page) {
  await passwordStage(page);
  await page.fill("#email", OPERATOR.email);
  await page.fill("#password", OPERATOR.password);
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByLabel(/6-digit code/i)).toBeVisible();
}

test("a11y (AA, empty baseline): operator sign-in, password stage", async ({ page }) => {
  await passwordStage(page);
  await assertStrictNoViolations(page, "operator sign-in (password)");
});

test("a11y (AA, empty baseline): operator sign-in, code stage, including the error state", async ({
  page,
}) => {
  await codeStage(page);
  await assertStrictNoViolations(page, "operator sign-in (code)");

  // The error state is a different page state and gets its own scan: an alert
  // that fails contrast is a message the person who most needs it cannot read.
  await page.fill("#code", "000000");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.locator("#ops-error")).not.toBeEmpty();
  await assertStrictNoViolations(page, "operator sign-in (code, error shown)");

  // Announced, associated with the field, and not colour alone.
  await expect(page.locator("#ops-error")).toHaveAttribute("role", "alert");
  await expect(page.locator("#code")).toHaveAttribute("aria-invalid", "true");
  const describedBy = (await page.locator("#code").getAttribute("aria-describedby")) ?? "";
  expect(describedBy.split(/\s+/)).toContain("ops-error");
});

test("a11y (AA, empty baseline): TOTP enrolment", async ({ page }) => {
  await db.operator.update({
    where: { email: OPERATOR.email },
    data: { totpConfirmedAt: null, lastTotpStep: null },
  });
  try {
    await passwordStage(page);
    await page.fill("#email", OPERATOR.email);
    await page.fill("#password", OPERATOR.password);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByRole("heading", { name: /set up your authenticator/i })).toBeVisible();
    await assertStrictNoViolations(page, "operator TOTP enrolment");
  } finally {
    await db.operator.update({
      where: { email: OPERATOR.email },
      data: { totpConfirmedAt: new Date() },
    });
  }
});

test("a11y (AA, empty baseline): the operator console", async ({ page }) => {
  await signInOperator(page);
  await assertStrictNoViolations(page, "operator console");
});

test("the code field takes a paste and asks for the right autofill", async ({ page, context }) => {
  await codeStage(page);
  const code = page.locator("#code");

  // 3.3.8: the values a password manager and a phone's code bar look for.
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await expect(page.locator("#password").first()).toHaveCount(0); // the password field is on the previous stage
  const attrs = await code.evaluate((el) => el.outerHTML);
  expect(attrs).not.toMatch(/autocomplete="off"/);
  expect(attrs).not.toMatch(/onpaste|readonly|disabled/i);

  // And a real paste, with the browser's own clipboard, not a synthetic event:
  // a synthetic ClipboardEvent is untrusted and would pass even against a field
  // that blocks paste, which is the failure mode this test exists to catch.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const real = await operatorCode();
  await page.evaluate((v) => navigator.clipboard.writeText(v), real);
  await code.click();
  await page.keyboard.press("ControlOrMeta+V");
  await expect(code).toHaveValue(real);

  // Pasted, then submitted, and it works: the field accepts what was pasted
  // rather than sanitising it into something the server will not take.
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => url.pathname === "/ops");
});

test("the time limits are stated before they bite (2.2.1)", async ({ page }) => {
  await codeStage(page);
  const help = (await page.locator("#ops-code-help").textContent()) ?? "";
  expect(help).toMatch(/30 seconds/);
  expect(help).toMatch(/10 minutes/);
  expect(help.toLowerCase()).toContain("nothing is lost");

  await signInOperator(page);
  const body = (await page.textContent("main")) ?? "";
  expect(body).toMatch(/30 minutes/);
  expect(body).toMatch(/8 hours/);
});

test("the whole door is completable with the keyboard alone", async ({ page }) => {
  await passwordStage(page);
  // Tab from the top of the document until focus lands in the email field, so
  // this fails if a decorative element ever becomes a keyboard trap.
  await page.keyboard.press("Tab");
  for (let i = 0; i < 10; i += 1) {
    if ((await page.evaluate(() => document.activeElement?.id)) === "email") break;
    await page.keyboard.press("Tab");
  }
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("email");

  await page.keyboard.type(OPERATOR.email);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("password");
  await page.keyboard.type(OPERATOR.password);
  await page.keyboard.press("Enter");

  await expect(page.getByLabel(/6-digit code/i)).toBeVisible();
  await page.keyboard.press("Tab");
  for (let i = 0; i < 10; i += 1) {
    if ((await page.evaluate(() => document.activeElement?.id)) === "code") break;
    await page.keyboard.press("Tab");
  }
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("code");
  await page.keyboard.type(await operatorCode());
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.pathname === "/ops");

  // And out again, without a mouse.
  await page.keyboard.press("Tab");
  for (let i = 0; i < 10; i += 1) {
    const label = await page.evaluate(() => document.activeElement?.textContent ?? "");
    if (/sign out/i.test(label)) break;
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.pathname === "/ops/sign-in");
});
