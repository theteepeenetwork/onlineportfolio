import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { asOperator } from "../helpers";
import { MAIL_VERDICT_LABEL } from "@/lib/mailStatus";

// ===========================================================================
// A30 - Accessibility of the operator mail screen (PR5, ruling R15)
//
// An EMPTY axe baseline, as every ops screen has had since the first commit:
// no rule excluded and no impact level forgiven. BASELINE_RULES in
// tests/battery/a11y/axe.spec.ts, which still carries the two tracked F11
// palette rules for the teacher product, is not touched by this work in either
// direction.
//
// The things axe cannot see, asserted directly:
//
//   Delivery state is a sentence. This is the screen most likely to grow a red
//   dot, because "is mail broken?" is a yes/no question and a coloured
//   indicator is the obvious way to answer it. Handbook section 6 item 8 is
//   explicit, and the practical reason is stronger than the rule: this figure
//   gets read out over the phone at ten to nine, and a colour cannot be read
//   out.
//
//   Two windows that disagree. The fixtures make Today calm and the last seven
//   days not, so the assertions cannot pass on a component that renders one
//   sentence regardless.
//
//   Zero horizontal overflow at 390px. The operator reads this on a phone, and
//   the page carries long explanatory sentences and a command name in a code
//   element, which are what push a card wider than the viewport.
//
//   Keyboard completable. There is nothing to operate here, so what has to hold
//   is that a keyboard user can traverse the page and get back out through the
//   nav rather than landing in a dead end.
//
// ONE SIGN-IN, SHARED. The door has no bypass (ruling R6) and TOTP replay
// protection refuses a step at or below the last accepted one, so consecutive
// sign-ins wait for the clock rather than for the app. Five sign-ins in one
// file is four minutes of sleeping. These tests share one context and run in
// order; every one of them is a read of the same page and none mutates
// anything.
// ===========================================================================

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ROUTE = "/ops/mail";

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

test.describe("the operator mail screen", () => {
  test.describe.configure({ mode: "serial" });

  let context: BrowserContext;
  let page: Page;

  // browser.newContext() rather than browser.newPage(), and it is not a
  // stylistic preference: @axe-core/playwright refuses a page that was created
  // straight off the browser with "Please use browser.newContext()", because it
  // needs to install its own frame handling on the context.
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await asOperator(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("a11y (AA, empty baseline)", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(ROUTE);
    // An axe scan of a page that did not render is a clean scan, and Next's own
    // 404 is perfectly accessible, so every test here is anchored first.
    await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
    await expect(page.locator("main")).toContainText("Parent sign-in link");
    await assertStrictNoViolations(page, "mail");
  });

  test("every delivery state on the page is a sentence, not a colour", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(ROUTE);
    const main = page.locator("main");

    // Each window card carries EXACTLY ONE verdict sentence from the closed
    // list in src/lib/mailStatus.ts. Asserted that way rather than against a
    // particular sentence because which one is true depends on what has been
    // sent, and every magic-link request made by any other spec in the battery
    // is a real attempt that lands in today's counter. What must hold whatever
    // the numbers are: none is a bare figure, and none is a colour.
    const cards = main.locator("ul > li.card");
    await expect(cards).toHaveCount(2);
    const sentences = Object.values(MAIL_VERDICT_LABEL);
    for (let i = 0; i < 2; i += 1) {
      const text = (await cards.nth(i).textContent()) ?? "";
      const found = sentences.filter((sentence) => text.includes(sentence));
      expect(found, `window ${i} must state exactly one verdict in words`).toHaveLength(1);
    }

    // The seeded week fails by a wide margin, so the loud verdict is on screen
    // and a reader who cannot see colour gets the same warning as everyone else.
    await expect(main).toContainText(MAIL_VERDICT_LABEL.NEEDS_ATTENTION);

    // Nothing conveys state by appearance alone: no hidden decoration is
    // carrying meaning the assistive tree cannot see.
    expect(
      await main.locator("[aria-hidden='true']").count(),
      "a hidden decoration on this page would be carrying the status",
    ).toBe(0);

    // The headings say what each figure is, so no number is bare.
    await expect(main.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "The last 7 days" })).toBeVisible();
  });

  test("the heading order steps down one level at a time", async () => {
    await page.goto(ROUTE);
    const levels = await page
      .locator("main h1, main h2, main h3, main h4")
      .evaluateAll((nodes) => nodes.map((n) => Number(n.tagName.slice(1))));

    // Positive control: there are headings to check.
    expect(levels.length).toBeGreaterThan(3);
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(
        levels[i] - levels[i - 1],
        `heading level jumped from h${levels[i - 1]} to h${levels[i]}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("the page is traversable by keyboard and has no trap", async () => {
    await page.goto(ROUTE);
    await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();

    // There is nothing to operate in main, so what must hold is that tabbing
    // from the top reaches sign out, which is the last control in the bar and
    // the way back out.
    const signOut = page.getByRole("button", { name: /sign out/i });
    await expect(signOut).toBeVisible();

    let reached = false;
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      if (await signOut.evaluate((el) => el === document.activeElement)) {
        reached = true;
        break;
      }
    }
    expect(reached, "sign out must be reachable with the keyboard alone").toBe(true);
  });

  test(`no horizontal overflow on ${ROUTE} at 390px`, async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE);
    await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
    await expect(page.locator("main")).toContainText("Addresses Mailjet is refusing");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${ROUTE} at 390px`).toBeLessThanOrEqual(1);
  });

  test("a11y (AA, empty baseline) at 390px, where the layout is different", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE);
    await expect(page.locator("main")).toContainText("Parent sign-in link");
    await assertStrictNoViolations(page, "mail at 390px");
  });
});
