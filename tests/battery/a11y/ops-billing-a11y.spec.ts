import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SCHOOL_A, SCHOOL_C, signInOperator } from "../helpers";

// ===========================================================================
// A26 - Accessibility of the operator billing screen (PR3, ruling R15)
//
// An EMPTY axe baseline, as every ops screen has had since the first commit:
// no rule excluded and no impact level forgiven. BASELINE_RULES in
// tests/battery/a11y/axe.spec.ts, which still carries the two tracked F11
// palette rules for the teacher product, is not touched by this work in either
// direction.
//
// The things axe cannot see, asserted directly:
//
//   A payment state is words. "Read-only, payment lapsed" and "Payment
//   overdue" are sentences, not a red dot. A colour-blind reader and a screen
//   reader user both get the same information as everybody else, and so does
//   somebody reading a printout.
//
//   The one outbound link in the operator area says where it goes and that it
//   leaves Storyjar, in its own text, so it still makes sense read out of
//   context in a list of links. It also opens in a new tab, which WCAG 3.2.5
//   asks be announced rather than sprung, so the text says that too.
//
//   Zero horizontal overflow at 390px. The operator reads this on a phone, and
//   a Stripe id is a long unbreakable-looking string, which is exactly the kind
//   of content that pushes a card wider than the viewport.
// ===========================================================================

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ROUTE = "/ops/billing";

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

test("a11y (AA, empty baseline): the billing screen", async ({ page }) => {
  await signInOperator(page);
  await page.goto(ROUTE);
  // An axe scan of a page that did not render is a clean scan, and Next's own
  // 404 is perfectly accessible, so every test here is anchored first.
  await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
  await expect(page.locator("main")).toContainText(SCHOOL_C.name);
  await assertStrictNoViolations(page, "billing");
});

test(`no horizontal overflow on ${ROUTE} at 390px`, async ({ page }) => {
  await signInOperator(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE);
  await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
  // The long Stripe id is on screen at this width, which is the content most
  // likely to push the card out.
  await expect(page.locator("main")).toContainText(SCHOOL_C.stripeCustomerId);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow on ${ROUTE} at 390px`).toBeLessThanOrEqual(1);
});

test("a payment state is words, never colour alone", async ({ page }) => {
  await signInOperator(page);
  await page.goto(ROUTE);
  // Larchwood is FROZEN in the fixtures, and St Bede's is not. Both states are
  // legible as text.
  await expect(page.locator("main")).toContainText("Read-only, payment lapsed");
  await expect(page.locator("main")).toContainText("On trial");
  // The band and the count that decides it are words and numbers too.
  await expect(page.locator("main")).toContainText("pupils on roll (count only, no names)");
});

test("the link out to Stripe names its destination and is reachable by keyboard", async ({
  page,
}) => {
  await signInOperator(page);
  await page.goto(ROUTE);

  const link = page.locator("main a[href]").first();
  await expect(link).toBeVisible();

  // Its accessible name carries the destination, the object and the fact that
  // it leaves Storyjar, so "Open customer cus_… in Stripe" still means
  // something in a screen reader's list of links with no surrounding text.
  const name = ((await link.textContent()) ?? "").toLowerCase();
  expect(name).toContain("stripe");
  expect(name).toContain("leaves storyjar");
  expect(name, "a new tab is announced rather than sprung (WCAG 3.2.5)").toContain("new tab");

  // Tab from the top of the document until focus reaches it, so this fails if
  // anything above ever becomes a keyboard trap.
  await page.keyboard.press("Tab");
  let focused = false;
  for (let i = 0; i < 25; i += 1) {
    if (await link.evaluate((el) => el === document.activeElement)) {
      focused = true;
      break;
    }
    await page.keyboard.press("Tab");
  }
  expect(focused, "the Stripe link must be reachable with the keyboard alone").toBe(true);
});

test("nothing on the billing screen is a disabled control, because there are no controls", async ({
  page,
}) => {
  await signInOperator(page);
  await page.goto(ROUTE);
  // Positive control: the screen rendered.
  await expect(page.locator("main")).toContainText(SCHOOL_A.name);

  // Owner decision D6 dropped manual payment recording, and the honest way to
  // express "you cannot do this" is to not offer it and say why in a sentence,
  // never a greyed-out button. A disabled control is unfocusable, announces
  // nothing, and hands a keyboard or screen reader user a dead end with no
  // stated cause (the same reasoning as ruling R16's "submit is never
  // disabled").
  await expect(page.locator("main [disabled], main [aria-disabled='true']")).toHaveCount(0);
  await expect(page.locator("main button, main input, main select, main textarea")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("Nothing here can be changed.");
});
