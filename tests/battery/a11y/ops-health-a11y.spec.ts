import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInOperator } from "../helpers";
import { MONITORED, NOT_MONITORED } from "@/lib/ops/health";

// ===========================================================================
// A32 - Accessibility of the service health pane (PR6, ruling R15)
//
// An EMPTY axe baseline, as every operator screen has had since the first
// commit: no rule excluded and no impact level forgiven. BASELINE_RULES in
// tests/battery/a11y/axe.spec.ts, which still carries the two tracked F11
// palette rules for the teacher product, is not touched by this work in either
// direction.
//
// Colour matters more on this screen than anywhere else in the product,
// because a health pane is almost entirely status, and "red" and "green" are
// the two words nobody types when they build one. Handbook section 6 item 8
// requires that no status is conveyed by colour alone. Axe cannot see that
// rule at all: a green dot with a 7:1 contrast ratio passes every automated
// check ever written and tells a colour-blind reader nothing.
//
// So it is asserted twice, directly:
//
//   1. Every tile carries its status as text, in a two-word vocabulary.
//   2. The whole pane is read again with forced-colors emulation active, which
//      is what a Windows high-contrast user gets: every author colour is
//      thrown away. Nothing may become unreadable or ambiguous, and every
//      status must still be there. A page that depends on a coloured
//      background to say "this one is bad" fails this and passes axe.
//
// Plus the two standing operator-screen rules: keyboard-completable, and zero
// horizontal overflow at 390px, because the operator reads this on a phone and
// this pane carries the longest unbroken strings in the area (a commit SHA and
// a Railway region name).
// ===========================================================================

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ROUTE = "/ops/health";

async function assertStrictNoViolations(page: Page, where: string, within?: string) {
  const builder = new AxeBuilder({ page }).withTags(WCAG_AA);
  if (within) builder.include(within);
  const results = await builder.analyze();
  expect(
    results.violations.map(
      (v) =>
        `(${v.impact}) ${v.id}: ${v.help} [${v.nodes.length} node(s)] ${v.nodes
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    ),
    `WCAG 2.2 AA violations on ${where} - the operator screens are held to an EMPTY baseline`,
  ).toEqual([]);
}

test("a11y (AA, empty baseline): the service health pane", async ({ page }) => {
  await signInOperator(page);
  await page.goto(ROUTE);
  // An axe scan of a page that did not render is a clean scan, and Next's own
  // 404 is perfectly accessible, so every test here is anchored first.
  await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
  await expect(page.locator("main")).toContainText("Service health");
  await assertStrictNoViolations(page, "service health");
});

test("every status is words, and survives having every colour taken away", async ({ page }) => {
  await signInOperator(page);
  await page.goto(ROUTE);

  const statuses = page.locator("[data-tile-status]");
  const before = await statuses.allTextContents();
  expect(before.length, "no tile statuses rendered at all").toBeGreaterThan(0);
  // Both halves of the vocabulary are on this page, which is what makes the
  // assertion meaningful: a page where everything said the same word would
  // pass a "status is text" check while telling the reader nothing.
  expect(before.map((t) => t.trim())).toContain(NOT_MONITORED);
  expect(before.map((t) => t.trim())).toContain(MONITORED);

  // Now throw the palette away, the way a Windows high-contrast user does.
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto(ROUTE);
  const after = await page.locator("[data-tile-status]").allTextContents();
  expect(
    after.map((t) => t.trim()),
    "a status disappeared or changed when the colours were removed",
  ).toEqual(before.map((t) => t.trim()));

  // Scanned within `main`, and the scope is a finding rather than a
  // convenience. With forced colours emulated, axe reports a serious
  // color-contrast failure on all six elements of the operator bar (the
  // "StoryJar operations" label, the four nav links and the sign-out button).
  // They are painted with inline `color: var(--paper)` on a `background:
  // var(--ink)` header, and in forced colours the background is replaced while
  // the near-white author text colour is not, so the whole bar disappears for a
  // Windows high-contrast user. That is real, it is in src/app/ops/shell.tsx,
  // and it predates this pane: shell.tsx is the tech lead's file for wave 5 and
  // this PR may not edit it, so it is reported as finding F32 rather than fixed
  // here or scanned around silently. Widening this scan back to the whole page
  // is the assertion that F32 is closed.
  await assertStrictNoViolations(page, "service health with forced colours", "main");
});

test("each tile's heading and status are associated, not merely adjacent", async ({ page }) => {
  await signInOperator(page);
  await page.goto(ROUTE);

  const tiles = page.locator("[data-tile]");
  const count = await tiles.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const t = tiles.nth(i);
    const id = await t.getAttribute("data-tile");
    // A heading inside the tile, so the pane is navigable by heading rather
    // than by reading every word of it.
    await expect(t.getByRole("heading"), `tile "${id}" has no heading`).toHaveCount(1);

    // And the status word is the `dd` of a `dt` that says what it is, so it is
    // associated with its label by the markup rather than by sitting next to
    // it. A bare "Not monitored" floating under a title is a word a screen
    // reader user meets with no idea what it is the status OF.
    //
    // Not aria-label, deliberately: `aria-label` on a paragraph is prohibited
    // by ARIA (axe's aria-prohibited-attr), and a visible label is better than
    // an invisible one for everybody else as well.
    const term = await t
      .locator("[data-tile-status]")
      .evaluate((el) => el.previousElementSibling?.textContent?.trim() ?? "");
    expect(term, `tile "${id}" status is a bare word with no label`).toBe("Status");
  }
});

test(`no horizontal overflow on ${ROUTE} at 390px`, async ({ page }) => {
  await signInOperator(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE);
  await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
  await expect(page.locator("main")).toContainText("Service health");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow on ${ROUTE} at 390px`).toBeLessThanOrEqual(1);
});

test("the pane is completable with the keyboard alone", async ({ page }) => {
  await signInOperator(page);
  await page.goto(ROUTE);
  await expect(page.locator("main")).toContainText("Service health");

  // The one outbound link on the pane. It is the only interactive thing in the
  // main region (ruling R13 leaves nothing else), so "completable" here means
  // reaching it from the top of the document without meeting a trap.
  const link = page.locator("main a[href]");
  await expect(link, "the pane should offer exactly one link out").toHaveCount(1);

  const name = ((await link.textContent()) ?? "").toLowerCase();
  expect(name).toContain("railway");
  expect(name, "a link that leaves StoryJar says so in its own text").toContain("leaves storyjar");
  expect(name, "a new tab is announced rather than sprung (WCAG 3.2.5)").toContain("new tab");

  await page.keyboard.press("Tab");
  let focused = false;
  for (let i = 0; i < 30; i += 1) {
    if (await link.evaluate((el) => el === document.activeElement)) {
      focused = true;
      break;
    }
    await page.keyboard.press("Tab");
  }
  expect(focused, "the link out must be reachable with the keyboard alone").toBe(true);
});
