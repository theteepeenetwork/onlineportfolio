import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SCHOOL_A, asOperator } from "../helpers";
import { REASON_MIN } from "@/lib/ops/dto";

// ===========================================================================
// A24 - Accessibility of the operator read screens (PR2)
//
// Handbook ruling R15: ops screens are held to strict WCAG 2.2 AA with an EMPTY
// baseline from the first commit. No rule is excluded here and no impact level
// is forgiven, which is the whole difference between this file and
// tests/battery/a11y/axe.spec.ts, where the two tracked F11 palette rules are
// still being worked off. BASELINE_RULES in that file is not touched by this
// work, in either direction.
//
// The three things axe cannot see, asserted directly:
//
//   Submit is never disabled (ruling R16). A disabled control is unfocusable,
//   announces nothing, and hands a keyboard or screen reader user a dead end
//   with no stated cause. Enforcing a minimum reason length by greying out the
//   button is the obvious implementation and it is the forbidden one.
//
//   Status is never colour alone. A frozen account says "Read-only, payment
//   lapsed" in words; nothing on these screens depends on a colour to be
//   understood.
//
//   Zero horizontal overflow at 390px. The operator reads this on a phone, and
//   the schools list is a list of cards rather than a six-column table for
//   exactly that reason.
// ===========================================================================

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const ROUTES = [
  ["/ops", "operator console"],
  ["/ops/schools", "schools list"],
  ["/ops/lookup", "adult lookup"],
] as const;

async function assertStrictNoViolations(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(
    results.violations.map(
      (v) => `(${v.impact}) ${v.id}: ${v.help} [${v.nodes.length} node(s)] ${v.nodes[0]?.target?.join(" ")}`,
    ),
    `WCAG 2.2 AA violations on ${where} - the operator screens are held to an EMPTY baseline`,
  ).toEqual([]);
}

for (const [route, label] of ROUTES) {
  test(`a11y (AA, empty baseline): ${label}`, async ({ page }) => {
    await asOperator(page);
    await page.goto(route);
    // An axe scan of a page that did not render is a clean scan. Next's own 404
    // is perfectly accessible, so without this anchor every test in this file
    // would pass against a route that has stopped existing.
    await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
    await assertStrictNoViolations(page, label);
  });

  test(`no horizontal overflow on ${route} at 390px`, async ({ page }) => {
    await asOperator(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${route} at 390px`).toBeLessThanOrEqual(1);
  });
}

test("a11y (AA, empty baseline): the lookup error state and the result state", async ({ page }) => {
  await asOperator(page);
  await page.goto("/ops/lookup");

  // The error state is different markup and gets its own scan: an alert that
  // nobody can read is the one that matters.
  await page.fill("#email", SCHOOL_A.admin.email);
  await page.fill("#reason", "too short");
  await page.getByRole("button", { name: /search and record the reason/i }).click();
  await expect(page.locator("#ops-lookup-error")).not.toBeEmpty();
  await assertStrictNoViolations(page, "adult lookup (reason refused)");

  // Announced, tied to the field, focus moved to it, and not colour alone.
  await expect(page.locator("#ops-lookup-error")).toHaveAttribute("role", "alert");
  await expect(page.locator("#reason")).toHaveAttribute("aria-invalid", "true");
  const describedBy = (await page.locator("#reason").getAttribute("aria-describedby")) ?? "";
  expect(describedBy.split(/\s+/)).toContain("ops-lookup-error");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("reason");

  // And the result state.
  await page.fill("#reason", "The office asked whether this account is active.");
  await page.getByRole("button", { name: /search and record the reason/i }).click();
  await expect(page.getByRole("heading", { name: /^result$/i })).toBeVisible();
  await assertStrictNoViolations(page, "adult lookup (result shown)");
});

test("submit is never disabled, whatever is in the reason box (R16)", async ({ page }) => {
  await asOperator(page);
  await page.goto("/ops/lookup");
  const submit = page.getByRole("button", { name: /search and record the reason/i });

  // Empty, too short, and long enough: the button is focusable and pressable in
  // all three states, and the server is what refuses.
  await expect(submit).toBeEnabled();
  await page.fill("#reason", "no");
  await expect(submit).toBeEnabled();
  await page.fill("#reason", "a".repeat(REASON_MIN));
  await expect(submit).toBeEnabled();

  const html = await submit.evaluate((el) => el.outerHTML);
  expect(html).not.toMatch(/\sdisabled/);
  expect(html).not.toMatch(/aria-disabled="true"/);
});

test("a payment state is words, never colour alone", async ({ page }) => {
  await asOperator(page);
  await page.goto("/ops/schools");
  // Larchwood is FROZEN in the fixtures. If this were a red dot, a colour-blind
  // reader and a screen reader would both learn nothing.
  await expect(page.locator("main")).toContainText("Read-only, payment lapsed");
  await expect(page.locator("main")).toContainText("On trial");
});

test("a whole lookup is completable with the keyboard alone", async ({ page }) => {
  await asOperator(page);
  await page.goto("/ops/lookup");

  // Tab from the top of the document until focus reaches the first radio, so
  // this fails if anything in the bar ever becomes a keyboard trap.
  await page.keyboard.press("Tab");
  for (let i = 0; i < 12; i += 1) {
    if ((await page.evaluate(() => document.activeElement?.id)) === "kind-TEACHER") break;
    await page.keyboard.press("Tab");
  }
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("kind-TEACHER");

  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("email");
  await page.keyboard.type(SCHOOL_A.admin.email);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("reason");
  await page.keyboard.type("Confirming the office has the right address on file.");

  for (let i = 0; i < 5; i += 1) {
    const label = await page.evaluate(() => document.activeElement?.textContent ?? "");
    if (/search and record/i.test(label)) break;
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /^result$/i })).toBeVisible();
  await expect(page.locator("main")).toContainText(SCHOOL_A.admin.email);
});
