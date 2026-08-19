import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { openDrawing, teacherLogin } from "./helpers";

// The maths kit: who is offered it, and what it draws.
//
// It is a tool for BUILDING a worksheet, so it belongs to the teacher doing the
// building and to nobody else. Children get no place-value palette at all —
// what they need arrives on the page, and they pull copies off it.
//
// The rule that is easiest to get backwards, in one place: gating decides what
// a canvas OFFERS. It never decides what renders. A template full of apparatus
// must still draw for the child it is assigned to, and still flatten into their
// hand-in — they simply cannot add more of it.

async function loginTo(page: Page, code: string, name: string) {
  await page.goto(`/login/student?code=${code}`);
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");
}

async function openFan(page: Page) {
  await page.locator('button[title="Add"]').click();
}

// These tests open the template builder, which autosaves a local-first draft.
// A draft left behind blocks the NEXT test — anywhere in the suite — with a
// restore modal that is `aria-modal` and intercepts pointer events, so the next
// click times out on something unrelated to what it was testing. That is F38,
// and it wants a shared fixture; until it has one, a test that creates the
// problem clears up on both sides of itself.
//
// Before, so a draft left by someone else cannot break these. After, so these
// cannot break anyone else — and after means navigating away first and then
// retrying, because a save already in flight can land after a single delete.
async function clearDrafts() {
  const db = new PrismaClient();
  try {
    for (let i = 0; i < 3; i++) {
      await db.draft.deleteMany({});
      if ((await db.draft.count()) === 0) break;
    }
  } finally {
    await db.$disconnect();
  }
}

test.beforeEach(clearDrafts);

test.afterEach(async ({ page }) => {
  await page.goto("about:blank");
  await clearDrafts();
});

test.describe("who is offered the kit", () => {
  for (const [band, code, child] of [
    ["KS1", "SUN234", "Ella"],
    ["KS2", "BUG456", "Grace"],
    ["EYFS", "ACO789", "Ava"],
  ] as const) {
    test(`a ${band} child gets Shapes and no maths kit`, async ({ page }) => {
      await loginTo(page, code, child);
      await openDrawing(page);
      await openFan(page);

      // Building a worksheet is a teacher's job at every age.
      await expect(page.getByRole("button", { name: "Maths kit" })).toHaveCount(0);

      // Scoped to the fan, because "Text" also names the tool on the shelf.
      const fan = page.locator("div.w-44");
      await expect(fan.getByRole("button", { name: "Shapes" })).toBeVisible();
      await expect(fan.getByRole("button", { name: "Photo / PDF" })).toBeVisible();
      await expect(fan.getByRole("button", { name: "Text" })).toBeVisible();

      // The line, the arrow and the ring are not apparatus, so they are here
      // for everyone — a child had no way to draw a straight line at all.
      await page.getByRole("button", { name: "Shapes" }).click();
      for (const name of ["Line", "Arrow", "Ring", "Rectangle", "Circle"]) {
        await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
      }
    });
  }

  test("a teacher building a template gets the full kit", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/teacher/activities/new");
    await page.fill("#title", "Kit check");
    await page.getByRole("button", { name: /Build a template/ }).click();
    await page.locator('button[title="Add"]').click();
    await expect(page.getByRole("button", { name: "Maths kit" })).toBeVisible();
  });
});

test.describe("what the kit draws", () => {
  // Driven through the template builder, which is now the only place the kit
  // exists.
  test.beforeEach(async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/teacher/activities/new");
    await page.fill("#title", "Apparatus");
    await page.getByRole("button", { name: /Build a template/ }).click();
  });

  async function place(page: Page, group: string, name: string) {
    await openFan(page);
    await page.getByRole("button", { name: "Maths kit" }).click();
    await page.getByRole("tab", { name: group }).click();
    await page.getByRole("button", { name, exact: true }).click();
  }

  test("a ten rod draws its ten divisions, thinner than its own outline", async ({ page }) => {
    await place(page, "Place value", "Base 10 ten rod");
    const svg = page.locator('svg[data-shape="grid"]');
    await expect(svg).toBeVisible();

    const paths = svg.locator("path");
    // Outline plus one detail path carrying every division.
    await expect(paths).toHaveCount(2);

    const outlineW = Number(await paths.nth(0).getAttribute("stroke-width"));
    const detailW = Number(await paths.nth(1).getAttribute("stroke-width"));
    // The whole reason a shape is a list of parts rather than one path: a rod
    // whose divisions are as heavy as its outline is a smear.
    expect(detailW).toBeLessThan(outlineW);
    // Divisions are never filled — filling them would black the rod in.
    await expect(paths.nth(1)).toHaveAttribute("fill", "none");

    // Nine internal rules make ten units.
    const d = (await paths.nth(1).getAttribute("d"))!;
    expect(d.match(/M /g)!.length).toBe(9);
  });

  test("a ring keeps its hole, and says so with even-odd", async ({ page }) => {
    await place(page, "Fractions", "Fraction ring in quarters");
    const path = page.locator('svg[data-shape="ring"] path').first();
    await expect(path).toBeVisible();
    // Two concentric subpaths in one outline...
    const d = (await path.getAttribute("d"))!;
    expect(d.match(/M /g)!.length).toBe(2);
    // ...and the rule that keeps the middle transparent rather than painted.
    await expect(path).toHaveAttribute("fill-rule", "evenodd");
  });

  test("a counter arrives round and labelled, and stays round when resized", async ({ page }) => {
    await place(page, "Place value", "Counter 100");
    const wrapper = page.locator('svg[data-shape="ellipse"]').first().locator("xpath=ancestor::div[1]");
    await expect(page.getByText("100", { exact: true }).first()).toBeVisible();

    const before = (await wrapper.boundingBox())!;
    expect(Math.abs(before.width - before.height)).toBeLessThan(4);

    // Drag the corner hard in one axis only. A counter squashed into an oval
    // stops reading as a counter, so its proportion is locked.
    const handle = page.locator('div[title="Resize"]');
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 160, hb.y + hb.height / 2, { steps: 6 });
    await page.mouse.up();

    const after = (await wrapper.boundingBox())!;
    expect(after.width).toBeGreaterThan(before.width + 30);
    expect(Math.abs(after.width - after.height)).toBeLessThan(6);
  });

  test("a fraction bar is meant to stretch, so it does", async ({ page }) => {
    await place(page, "Fractions", "Fraction bar in quarters");
    const wrapper = page.locator('svg[data-shape="grid"]').first().locator("xpath=ancestor::div[1]");
    const before = (await wrapper.boundingBox())!;

    const handle = page.locator('div[title="Resize"]');
    const hb = (await handle.boundingBox())!;
    // Purely horizontal — same y, so any height change is the shape's doing
    // rather than the drag's.
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 160, hb.y + hb.height / 2, { steps: 6 });
    await page.mouse.up();

    const after = (await wrapper.boundingBox())!;
    // Width grew and height did not follow — the opposite of the counter.
    expect(after.width).toBeGreaterThan(before.width + 30);
    expect(Math.abs(after.height - before.height)).toBeLessThan(8);
  });

  test("the stepper reaches a denominator no button offers", async ({ page }) => {
    await place(page, "Fractions", "Fraction circle in quarters");
    const detail = page.locator('svg[data-shape="pie"] path').nth(1);
    expect((await detail.getAttribute("d"))!.match(/M /g)!.length).toBe(4);

    // Six buttons instead of twelve, and ninths are still reachable — which is
    // the trade the stepper exists to make.
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: "Parts: more" }).click();
    }
    expect((await detail.getAttribute("d"))!.match(/M /g)!.length).toBe(9);
  });

  test("a ring's band is the ring's to set", async ({ page }) => {
    await place(page, "Fractions", "Fraction ring in quarters");
    const outline = page.locator('svg[data-shape="ring"] path').first();

    // The hole is the SECOND subpath of the outline. Fattening the band shrinks
    // it; a sorting hoop and a fraction ring want very different numbers, which
    // is why this stopped being one constant for every ring on every page.
    const holeRadius = async () => {
      const d = (await outline.getAttribute("d"))!;
      // "… M x y A rx ry …" — the second arc's rx.
      return Number(d.split("M ")[2].match(/A ([\d.]+)/)![1]);
    };

    const before = await holeRadius();
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Thickness: more" }).click();
    }
    expect(await holeRadius()).toBeLessThan(before);

    // Still a ring, not a disc.
    await expect(outline).toHaveAttribute("fill-rule", "evenodd");
  });

  test("a clock shows the hours, or lets a child write them on", async ({ page }) => {
    await place(page, "Shape & measure", "Clock face");
    const clock = page.locator('svg[data-shape="clock"]');
    await expect(clock).toBeVisible();

    // Twelve numerals, drawn as part of the shape's geometry rather than as a
    // label — a label is one string in the middle.
    await expect(clock.locator("text")).toHaveCount(12);
    await expect(clock.locator("text").first()).toHaveText("1");

    // A blank face a child numbers themselves is a worksheet in its own right.
    await page.getByRole("button", { name: "Clock numbers" }).click();
    await expect(clock.locator("text")).toHaveCount(0);

    // The hours are not a setting: a clock with seven hours is not a clock.
    await expect(page.getByRole("button", { name: "Parts: more" })).toHaveCount(0);
  });
});
