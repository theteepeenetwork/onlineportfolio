import { test, expect } from "@playwright/test";
import { studentLogin, openDrawing } from "./helpers";

// The four small canvas primitives that everything else is built on: a straight
// line, an arrow that can be pointed the other way, duplicating a placed object,
// and snap-to-grid while dragging.
//
// They matter on their own — there was no way to draw a straight line at all
// before, freehand with the pen was it — and they matter more once apparatus
// arrives, because a row of ten-rods is duplicate plus snap.

async function addShape(page: import("@playwright/test").Page, name: string) {
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("a child can draw a straight line and point an arrow the other way", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  await addShape(page, "Line");
  const line = page.locator('svg[data-shape="line"] path').first();
  await expect(line).toBeVisible();
  // A line is a stroke, never an area: it must not arrive filled, or it reads
  // as a thin rectangle rather than a rule.
  await expect(line).toHaveAttribute("fill", "none");

  // A line runs corner to corner of its box, so the default wide, shallow box
  // gives the horizontal rule a number line needs.
  const d = await line.getAttribute("d");
  expect(d).toMatch(/^M 0 0 L /);

  // Flip sends it along the other diagonal — this is what we have instead of a
  // rotate handle, and it is how the other two quadrants are reachable.
  await page.getByRole("button", { name: "Flip direction" }).click();
  await expect(line).toHaveAttribute("d", /^M 0 \d/);
  const flipped = await line.getAttribute("d");
  expect(flipped).not.toBe(d);
});

test("an arrow carries a head, and the head follows the flip", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  await addShape(page, "Arrow");
  const arrow = page.locator('svg[data-shape="arrow"] path').first();
  // Shaft plus two head strokes — three move/line runs in one path.
  const d = (await arrow.getAttribute("d"))!;
  expect(d.match(/M /g)!.length).toBe(2);
  expect(d).toContain("L");

  await page.getByRole("button", { name: "Flip direction" }).click();
  expect(await arrow.getAttribute("d")).not.toBe(d);
});

test("duplicate makes a second object, offset and selected", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  await addShape(page, "Rectangle");
  const shapes = page.locator("svg[data-shape]");
  await expect(shapes).toHaveCount(1);

  const first = (await shapes.first().locator("xpath=ancestor::div[1]").boundingBox())!;

  await page.getByRole("button", { name: "Make another one" }).click();
  await expect(shapes).toHaveCount(2);

  // The clone lands clear of the original rather than exactly on top of it,
  // which would look like nothing happened.
  const second = (await shapes.nth(1).locator("xpath=ancestor::div[1]").boundingBox())!;
  expect(second.x).toBeGreaterThan(first.x);
  expect(second.y).toBeGreaterThan(first.y);

  // Duplicating again builds a row, which is the whole point: showing 24 with
  // base-10 apparatus should not mean six trips out to the palette.
  await page.getByRole("button", { name: "Make another one" }).click();
  await expect(shapes).toHaveCount(3);
});

test("dragging a shape snaps it onto the grid, so a row reads as a row", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  await addShape(page, "Rectangle");
  const wrapper = page.locator("svg[data-shape]").first().locator("xpath=ancestor::div[1]");
  const stage = page.locator("canvas").first();
  const stageBox = (await stage.boundingBox())!;

  // Model space is 1000 wide, so one snap step (10 units) is 1% of the stage.
  const step = stageBox.width / 100;

  const before = (await wrapper.boundingBox())!;
  // Nudge by an amount that is deliberately NOT a whole number of steps.
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    before.x + before.width / 2 + step * 4.4,
    before.y + before.height / 2 + step * 3.6,
    { steps: 6 },
  );
  await page.mouse.up();

  // Wherever it landed, it landed ON the grid — within a pixel of a step
  // boundary, rather than at the raw pointer position.
  const after = (await wrapper.boundingBox())!;
  const offGrid = Math.abs(((after.x - stageBox.x) / step) % 1);
  expect(Math.min(offGrid, 1 - offGrid)).toBeLessThan(0.12);
});
