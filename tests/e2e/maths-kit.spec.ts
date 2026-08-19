import { test, expect, type Page } from "@playwright/test";
import { openDrawing } from "./helpers";

// The maths kit: who is offered it, and what it draws.
//
// The rule it exists to pin is easy to get backwards, so it is worth stating in
// one place: gating decides what the palette OFFERS. It never decides what
// renders. A KS2 template full of apparatus, assigned to a Reception class,
// must still draw for that child and still flatten into their hand-in — they
// simply cannot add more of it.

async function loginTo(page: Page, code: string, name: string) {
  await page.goto(`/login/student?code=${code}`);
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");
}

async function openFan(page: Page) {
  await page.locator('button[title="Add"]').click();
}

test.describe("who is offered the kit", () => {
  test("a KS1 child is offered the maths kit", async ({ page }) => {
    await loginTo(page, "SUN234", "Ella");
    await openDrawing(page);
    await openFan(page);
    await expect(page.getByRole("button", { name: "Maths kit" })).toBeVisible();
    // Shapes is unchanged for every age and sits alongside it.
    await expect(page.getByRole("button", { name: "Shapes" })).toBeVisible();
  });

  test("a KS2 child is offered the maths kit", async ({ page }) => {
    await loginTo(page, "BUG456", "Grace");
    await openDrawing(page);
    await openFan(page);
    await expect(page.getByRole("button", { name: "Maths kit" })).toBeVisible();
  });

  test("an EYFS child is not, and their ＋ fan is otherwise unchanged", async ({ page }) => {
    await loginTo(page, "ACO789", "Ava");
    await openDrawing(page);
    await openFan(page);
    // Place value and frames are teacher apparatus. A Reception ＋ fan stays
    // sparse — that is the whole point of the youngest register.
    await expect(page.getByRole("button", { name: "Maths kit" })).toHaveCount(0);
    // The rest of the fan is exactly as it was. Scoped to the fan itself,
    // because "Text" also names the tool on the shelf below.
    const fan = page.locator("div.w-44");
    await expect(fan.getByRole("button", { name: "Shapes" })).toBeVisible();
    await expect(fan.getByRole("button", { name: "Photo / PDF" })).toBeVisible();
    await expect(fan.getByRole("button", { name: "Text" })).toBeVisible();
  });
});

test.describe("what the kit draws", () => {
  test.beforeEach(async ({ page }) => {
    await loginTo(page, "SUN234", "Ella");
    await openDrawing(page);
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
    await place(page, "Fractions", "Ring");
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
});
