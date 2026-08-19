import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInOperator } from "../helpers";

// ===========================================================================
// Accessibility of the operator handbook (SAFEGUARDING rule 18)
//
// An EMPTY axe baseline, like every other operator screen: no rule excluded and
// no impact level forgiven.
//
// This screen is almost entirely prose, which changes what is worth asserting.
// The risks on a page of text are not colour and contrast alone, they are:
//
//   Heading order. A handbook is read by jumping between headings, and a screen
//   reader user jumps by level. A page that skips from h2 to h4 tells them a
//   section is missing.
//
//   Disclosure widgets. The five procedures are <details>, so their content is
//   in the accessibility tree only when open, and open and closed are two
//   different documents. Both are scanned.
//
//   Reading it on a phone at 3am, which is when a procedure is actually needed.
// ===========================================================================

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ROUTE = "/ops/handbook";

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

test("a11y (AA, empty baseline): the handbook, procedures closed", async ({ page }) => {
  await signInOperator(page);
  await page.goto(ROUTE);
  // An axe scan of a page that did not render is a clean scan, so anchor first.
  await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
  await expect(page.locator("main")).toContainText("How StoryJar works");
  await assertStrictNoViolations(page, "handbook (closed)");
});

test("a11y (AA, empty baseline): the handbook with every procedure open", async ({ page }) => {
  await signInOperator(page);
  await page.goto(ROUTE);
  await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();

  const summaries = page.locator("main details summary");
  const count = await summaries.count();
  expect(count, "the five procedures should be on the page").toBe(5);
  for (let i = 0; i < count; i += 1) await summaries.nth(i).click();

  await expect(page.locator("main")).toContainText("Notify before you look");
  await assertStrictNoViolations(page, "handbook (every procedure open)");
});

test("the heading order steps down one level at a time", async ({ page }) => {
  await signInOperator(page);
  await page.goto(ROUTE);
  await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
  // Open everything: the deepest headings live inside the procedures, so a
  // closed page would prove the order of half the document.
  const summaries = page.locator("main details summary");
  for (let i = 0; i < (await summaries.count()); i += 1) await summaries.nth(i).click();

  const levels = await page
    .locator("main h1, main h2, main h3, main h4, main h5, main h6")
    .evaluateAll((hs) => hs.map((h) => Number(h.tagName.slice(1))));

  expect(levels.length, "a handbook with no headings is not navigable").toBeGreaterThan(5);
  expect(levels[0], "the page should start at h1").toBe(1);
  for (let i = 1; i < levels.length; i += 1) {
    expect(
      levels[i] - levels[i - 1],
      `heading ${i} jumps from h${levels[i - 1]} to h${levels[i]}, so a section reads as missing`,
    ).toBeLessThanOrEqual(1);
  }
});

test("every procedure can be opened from the keyboard alone", async ({ page }) => {
  await signInOperator(page);
  await page.goto(ROUTE);
  const first = page.locator("main details").first();
  await expect(first).not.toHaveAttribute("open", /.*/);

  await first.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("open", /.*/);
});

test(`no horizontal overflow on ${ROUTE} at 390px`, async ({ page }) => {
  await signInOperator(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE);
  await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
  // Open everything: the procedures carry the longest unbroken lines.
  const summaries = page.locator("main details summary");
  for (let i = 0; i < (await summaries.count()); i += 1) await summaries.nth(i).click();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "the handbook should not scroll sideways on a phone").toBeLessThanOrEqual(0);
});
