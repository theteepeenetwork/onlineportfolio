import { test, expect, type Page } from "@playwright/test";
import { SCHOOL_A, loginStudent, loginTeacher } from "../helpers";

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
      const controls = document.querySelectorAll<HTMLElement>(
        'button, a[href], input:not([type=hidden]), select, textarea, [role="button"], [role="slider"]',
      );
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

// The two full-screen CANVASES and the EYFS jar (F37). They were outside this
// gate's list of URLs until 19 August 2026, which is how a child's most-used
// screens came to carry ten controls under the floor while a gate named "child
// touch targets" passed. A page list is exactly as good as the pages on it.
test("every tool on a child's drawing canvas meets the child touch floor", async ({ page }) => {
  await loginStudent(page, SCHOOL_A.classCode, "Chloe");
  await page.goto("/student/new/drawing");
  await expect(page.locator("canvas")).toBeVisible();

  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px on the drawing canvas: ${JSON.stringify(small)}`).toEqual([]);
});

test("the controls that only appear once a child taps something meet the floor too", async ({
  page,
}) => {
  // F41: the sweep above loads the page with NOTHING selected, so it never saw
  // the controls that appear AROUND an object once a child taps it — four of
  // them, at 20 and 24px against a floor of 64. F37's lesson was that a page
  // list is exactly as good as the pages on it; this is its sibling, that a
  // page sweep is exactly as good as the states it visits.
  //
  // Both object types are visited, because they used to disagree: a shape had a
  // pencil and a text box had nothing at all (F42).
  await loginStudent(page, SCHOOL_A.classCode, "Chloe");
  await page.goto("/student/new/drawing");
  await expect(page.locator("canvas")).toBeVisible();
  const box = (await page.locator("canvas").boundingBox())!;

  // A shape, placed then tapped.
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.locator('[role="group"] button').first().click();
  await page.locator('button[aria-label="Move"]').click();
  await expect(page.getByRole("button", { name: "Remove object" })).toBeVisible();
  let small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px around a selected shape: ${JSON.stringify(small)}`).toEqual(
    [],
  );

  // A text box, placed then tapped. Same four corners, same floor.
  await page.locator('button[title="Text"]').click();
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.7);
  await page.locator('textarea[placeholder="Type…"]').waitFor();
  await page.keyboard.type("Hi");
  await page.locator('button[title="Pen"]').click();
  await page.locator('button[aria-label="Move"]').click();
  const label = page.getByText("Hi", { exact: true });
  const lbox = (await label.boundingBox())!;
  await page.mouse.click(lbox.x + lbox.width / 2, lbox.y + lbox.height / 2);
  await expect(page.getByRole("button", { name: "Remove text" })).toBeVisible();
  small = await undersizedControls(page);
  expect(
    small,
    `controls below ${FLOOR}px around a selected text box: ${JSON.stringify(small)}`,
  ).toEqual([]);
});

test("every tool on an activity response meets the child touch floor", async ({ page }) => {
  await loginStudent(page, SCHOOL_A.classCode, "Dev");
  await page.goto("/student/activities");
  const activity = page.locator('a[href^="/student/activities/"]').first();
  await expect(activity).toBeVisible();
  await activity.click();
  await expect(page.locator("canvas")).toBeVisible();

  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px on an activity response: ${JSON.stringify(small)}`).toEqual([]);
});

test("every control on an EYFS child's jar meets the child touch floor", async ({ page }) => {
  // A different shell entirely (EyfsHome), for the youngest children in the
  // product, and measured the way a Reception child holds a tablet: portrait.
  await page.setViewportSize({ width: 768, height: 1024 });
  await loginStudent(page, "ACO789", "Ava");
  await expect(page.getByRole("heading", { name: /hello/i })).toBeVisible();

  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px on an EYFS jar: ${JSON.stringify(small)}`).toEqual([]);
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

// Walk every group of the currently-open palette, running `check` on each.
// Every group, not just the one that opens first — a tab nobody clicks in a
// test is still a tab a child will tap.
async function forEachPaletteGroup(page: Page, check: () => Promise<void>) {
  const tabs = page.getByRole("tab");
  const count = await tabs.count();
  for (let i = 0; i < Math.max(1, count); i++) {
    if (count) await tabs.nth(i).click();
    await check();
  }
}

test("every shape a child can place is at least 64px", async ({ page }) => {
  await loginStudent(page, SCHOOL_A.classCode, "Chloe");
  await page.goto("/student/new/drawing");
  await expect(page.locator("canvas")).toBeVisible();

  // Children get one palette at every age. The maths kit is a teacher's tool
  // for building a worksheet and is not reachable here at all — what a child
  // needs arrives on the page, not in a menu.
  await page.locator('button[title="Add"]').click();
  await expect(page.getByRole("button", { name: "Maths kit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Shapes" }).click();

  await forEachPaletteGroup(page, async () => {
    const small = await paletteButtonsUnderFloor(page);
    expect(small, `controls below ${FLOOR}px: ${JSON.stringify(small)}`).toEqual([]);
  });
});

async function paletteNames(page: Page): Promise<string[]> {
  const names: string[] = [];
  await forEachPaletteGroup(page, async () => {
    names.push(
      ...(await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="group"] button')).map(
          (b) => b.getAttribute("aria-label") ?? "",
        ),
      )),
    );
  });
  return names;
}

test("every shape button carries a name, and no two are the same", async ({ page }) => {
  // A grid of unlabelled icon buttons is unusable with a screen reader, and two
  // buttons sharing a name is the same problem wearing a disguise.
  //
  // Checked across BOTH palettes, because a teacher holds both at once: a
  // duplicate between the two would be as confusing as a duplicate within one.
  await loginStudent(page, SCHOOL_A.classCode, "Chloe");
  await page.goto("/student/new/drawing");
  await expect(page.locator("canvas")).toBeVisible();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  const childNames = await paletteNames(page);

  expect(childNames.length).toBeGreaterThan(5);
  expect(childNames.filter((n) => !n)).toEqual([]);

  // The maths kit lives on the template builder, so it is measured there.
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Palette names");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Maths kit" }).click();
  const kitNames = await paletteNames(page);

  expect(kitNames.length).toBeGreaterThan(20);
  expect(kitNames.filter((n) => !n)).toEqual([]);

  const all = [...childNames, ...kitNames];
  expect([...new Set(all)].length).toBe(all.length);
});
