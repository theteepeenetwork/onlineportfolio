import { test, expect, type Page } from "@playwright/test";
import { SCHOOL_A, loginStudent } from "../helpers";

// ===========================================================================
// B3 — Every control a CHILD taps is at least 64px
//
// SAFEGUARDING rule 18 sits under "Access for every child": ">=64px child touch
// targets". Not 44 — 44 is the general web floor, written for adults with adult
// fingers and adult motor control. A four-year-old's aim is not an adult's, and
// a child who cannot hit the button cannot use the tool.
//
// This lives in the BLOCKING a11y gate rather than the report-only UX project
// because rule 18 is a safeguarding rule, not a nicety. It sweeps whole pages
// rather than naming buttons, so a control added tomorrow is covered without
// anyone remembering to come back here.
//
// Why it exists: three child controls shipped at 44px this week — including the
// read-aloud buttons, which are the affordance FOR the pre-readers the floor is
// written to protect. Nothing caught them. axe has no touch-target rule at AA,
// and the one existing 64px assertion (ux/responsive.spec.ts) checks name-cards
// only, and is report-only.
// ===========================================================================

const FLOOR = 64;

// Controls that are legitimately not a child's target, even on a child's page.
// Keep this list tiny and justify every entry — it is the whole way this gate
// can be weakened.
const NOT_A_CHILD_TARGET = [
  // The Next.js dev-tools badge, injected only in dev. Not ours, not shipped.
  "[data-nextjs-dev-tools-button]",
  "#next-logo",
];

async function undersizedControls(page: Page) {
  return page.evaluate(
    ({ floor, exempt }) => {
      const out: { label: string; w: number; h: number }[] = [];
      const controls = document.querySelectorAll<HTMLElement>("button, a[href], input:not([type=hidden]), select, textarea");
      for (const el of controls) {
        if (exempt.some((sel) => el.matches(sel) || el.closest(sel))) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue; // not rendered
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (r.height < floor || r.width < floor) {
          const label =
            el.getAttribute("aria-label") ||
            (el.textContent || "").trim().slice(0, 40) ||
            el.tagName.toLowerCase();
          out.push({ label, w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
      return out;
    },
    { floor: FLOOR, exempt: NOT_A_CHILD_TARGET },
  );
}

// The classroom iPad in landscape — the device these screens are designed for.
test.use({ viewport: { width: 1024, height: 768 } });

test("every control on the class-code screen meets the child touch floor", async ({ page }) => {
  await page.goto("/login/student");
  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px: ${JSON.stringify(small)}`).toEqual([]);
});

test("every control on the name picker meets the child touch floor", async ({ page }) => {
  await page.goto(`/login/student?code=${SCHOOL_A.classCode}`);
  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px: ${JSON.stringify(small)}`).toEqual([]);
});

test("every control on a child's jar meets the child touch floor", async ({ page }) => {
  // Chloe carries seeded waiting work, so the status strips — and their
  // read-aloud buttons — are on screen to be measured.
  await loginStudent(page, SCHOOL_A.classCode, "Chloe");
  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px: ${JSON.stringify(small)}`).toEqual([]);
});

test("every control on the add-work screens meets the child touch floor", async ({ page }) => {
  await loginStudent(page, SCHOOL_A.classCode, "Chloe");
  for (const path of ["/student/new/photo", "/student/new/words", "/student/new/audio"]) {
    await page.goto(path);
    const small = await undersizedControls(page);
    expect(small, `${path} — controls below ${FLOOR}px: ${JSON.stringify(small)}`).toEqual([]);
  }
});

// ---------------------------------------------------------------------------
// The shape palettes, measured where they actually live.
//
// The sweeps above visit whole pages. The drawing canvas is deliberately NOT
// one of them yet: it carries a long tail of pre-existing sub-floor controls
// (the tool shelf, the page filmstrip, undo/redo, the ＋ and ✓ buttons), and
// adding it wholesale would turn a blocking gate red for reasons that have
// nothing to do with the change that added this test. That debt is logged as
// F37 in FINDINGS.md, with a repro under tests/battery/findings/.
//
// What IS asserted here is everything a child taps to place a shape. Those are
// new or newly resized, they are the densest grid of controls on the canvas,
// and there is no reason for them to be under the floor.
// ---------------------------------------------------------------------------

async function paletteButtonsUnderFloor(page: Page) {
  return page.evaluate((floor) => {
    const out: { label: string; w: number; h: number }[] = [];
    for (const group of document.querySelectorAll<HTMLElement>('[role="group"]')) {
      for (const el of group.querySelectorAll<HTMLElement>("button")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.height < floor || r.width < floor) {
          out.push({
            label: el.getAttribute("aria-label") || "(unlabelled)",
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
      }
    }
    return out;
  }, FLOOR);
}

test("every shape a child can place is at least 64px, in every kit", async ({ page }) => {
  await loginStudent(page, SCHOOL_A.classCode, "Chloe");
  await page.goto("/student/new/drawing");
  await expect(page.locator("canvas")).toBeVisible();

  // The fan stays open once opened — picking a kit swaps the palette rather
  // than closing the menu — so it is opened once, not once per kit.
  await page.locator('button[title="Add"]').click();
  for (const kit of ["Shapes", "Maths kit"]) {
    await page.getByRole("button", { name: kit }).click();

    // Every group in the kit, not just the one that opens first — a tab nobody
    // clicks is still a tab a child will.
    const tabs = page.getByRole("tab");
    const count = await tabs.count();
    for (let i = 0; i < Math.max(1, count); i++) {
      if (count) await tabs.nth(i).click();
      const small = await paletteButtonsUnderFloor(page);
      expect(small, `${kit} — controls below ${FLOOR}px: ${JSON.stringify(small)}`).toEqual([]);
    }
  }
});

test("every shape button carries a name, and no two are the same", async ({ page }) => {
  // A grid of unlabelled icon buttons is unusable with a screen reader, and two
  // buttons sharing a name is the same problem wearing a disguise.
  await loginStudent(page, SCHOOL_A.classCode, "Chloe");
  await page.goto("/student/new/drawing");
  await expect(page.locator("canvas")).toBeVisible();

  const names: string[] = [];
  await page.locator('button[title="Add"]').click();
  for (const kit of ["Shapes", "Maths kit"]) {
    await page.getByRole("button", { name: kit }).click();
    const tabs = page.getByRole("tab");
    const count = await tabs.count();
    for (let i = 0; i < Math.max(1, count); i++) {
      if (count) await tabs.nth(i).click();
      names.push(
        ...(await page.evaluate(() =>
          Array.from(document.querySelectorAll('[role="group"] button')).map(
            (b) => b.getAttribute("aria-label") ?? "",
          ),
        )),
      );
    }
  }

  expect(names.length).toBeGreaterThan(20);
  expect(names.filter((n) => !n)).toEqual([]);
  expect([...new Set(names)].length).toBe(names.length);
});
