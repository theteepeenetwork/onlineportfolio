import { test, expect } from "@playwright/test";
import { studentLogin, openDrawing } from "./helpers";

// The small canvas primitives everything else is built on: a straight line, an
// arrow, free rotation, duplicating a placed object, and snap-to-grid while
// dragging.
//
// They matter on their own — there was no way to draw a straight line at all
// before, freehand with the pen was it — and they matter more once apparatus
// arrives, because a row of ten-rods is duplicate plus snap.

// Every shape a child is offered lives in one palette, at every age.
async function addShape(page: import("@playwright/test").Page, name: string) {
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

// Drag the rotate handle a given number of degrees around the shape's centre.
async function turn(page: import("@playwright/test").Page, degrees: number) {
  const wrapper = page.locator("div[data-object]").first();
  const box = (await wrapper.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const handle = page.locator('div[title="Turn"]');
  const hb = (await handle.boundingBox())!;
  const hx = hb.x + hb.width / 2;
  const hy = hb.y + hb.height / 2;
  const radius = Math.hypot(hx - cx, hy - cy);
  const start = Math.atan2(hy - cy, hx - cx);
  const end = start + (degrees * Math.PI) / 180;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(cx + Math.cos(end) * radius, cy + Math.sin(end) * radius, { steps: 10 });
  await page.mouse.up();
}

test("a child can draw a straight line, in one palette, at any age", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  await addShape(page, "Line");
  const line = page.locator('svg[data-shape="line"] path').first();
  await expect(line).toBeVisible();
  // A line is a stroke, never an area: it must not arrive filled, or it reads
  // as a thin rectangle rather than a rule.
  await expect(line).toHaveAttribute("fill", "none");

  // It runs corner to corner of its box, so the default wide, shallow box gives
  // the horizontal rule a number line needs. Any other angle is rotation.
  expect(await line.getAttribute("d")).toMatch(/^M 0 0 L /);
});

test("an arrow carries a head", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  await addShape(page, "Arrow");
  const arrow = page.locator('svg[data-shape="arrow"] path').first();
  // Shaft plus two head strokes — two move runs in one path.
  const d = (await arrow.getAttribute("d"))!;
  expect(d.match(/M /g)!.length).toBe(2);
  expect(d).toContain("L");
});

test("a shape turns to any angle, all the way round", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  await addShape(page, "Arrow");
  const wrapper = page.locator("div[data-object]").first();
  // Upright shapes carry no transform at all — 0 is never stored.
  expect(await wrapper.evaluate((el) => getComputedStyle(el).transform)).toBe("none");

  await turn(page, 90);
  const t = await wrapper.evaluate((el) => getComputedStyle(el).transform);
  expect(t).not.toBe("none");
  // A quarter turn: the matrix is (cos, sin, -sin, cos) = (0, 1, -1, 0).
  const m = t.match(/matrix\(([^)]+)\)/)![1].split(",").map(Number);
  expect(m[0]).toBeCloseTo(0, 1);
  expect(m[1]).toBeCloseTo(1, 1);

  // And it keeps going the same way rather than stopping at a quadrant — this
  // is what replaced the Flip button.
  await turn(page, 150);
  const t2 = await wrapper.evaluate((el) => getComputedStyle(el).transform);
  expect(t2).not.toBe(t);
});

test("the delete button stays the right way up on a turned shape", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  await addShape(page, "Rectangle");
  await turn(page, 180);

  // The controls are children of the rotating wrapper, so without a
  // counter-rotation they hang upside-down. Their own transform must undo the
  // wrapper's exactly, leaving them visually upright.
  const del = page.locator('button[aria-label="Remove object"]');
  const m = (await del.evaluate((el) => getComputedStyle(el).transform))
    .match(/matrix\(([^)]+)\)/)![1]
    .split(",")
    .map(Number);
  expect(m[0]).toBeCloseTo(-1, 1);
  expect(m[1]).toBeCloseTo(0, 1);
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
