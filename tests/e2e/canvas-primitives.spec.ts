import { test, expect } from "@playwright/test";
import { studentLogin, openDrawing, turnObject as turn } from "./helpers";

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

// A line's box is not a frame around the line, it IS the line: the stroke runs
// corner to corner. So a free resize does not make it longer, it re-aims it —
// a child reaching for the corner to stretch a number line got a diagonal
// instead. Resize now holds the proportion it started the drag with; turning is
// the turn handle's job, and only the turn handle's.
test("resizing a line makes it longer without re-aiming it", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  await addShape(page, "Line");
  const path = page.locator('svg[data-shape="line"] path').first();
  const ends = async () => {
    const d = (await path.getAttribute("d"))!;
    const m = d.match(/^M 0 0 L ([-\d.]+) ([-\d.]+)/)!;
    return { w: parseFloat(m[1]), h: parseFloat(m[2]) };
  };
  const before = await ends();

  // Drag the resize corner well down as well as out — the direction that used
  // to tip a flat rule into a diagonal.
  const handle = page.locator('div[title="Resize"]');
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 150, hb.y + hb.height / 2 + 120, { steps: 8 });
  await page.mouse.up();

  const after = await ends();
  expect(after.w).toBeGreaterThan(before.w + 40);
  expect(after.h / after.w).toBeCloseTo(before.h / before.w, 3);
});

// ...and shorter. A locked proportion means one number to clamp, and the floor
// has to go on the side that is the shape's size. On the short side instead, a
// 105:1 rule turned a height floor of 2 into a width floor of 210 — the line
// snapped back to full length the moment it was dragged in, so it could be
// grown but never shrunk.
test("a line can be made shorter again", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  await addShape(page, "Line");
  const path = page.locator('svg[data-shape="line"] path').first();
  const ends = async () => {
    const d = (await path.getAttribute("d"))!;
    const m = d.match(/^M 0 0 L ([-\d.]+) ([-\d.]+)/)!;
    return { w: parseFloat(m[1]), h: parseFloat(m[2]) };
  };
  const before = await ends();

  // Pull the resize corner back towards the middle of the line.
  const handle = page.locator('div[title="Resize"]');
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 - 120, hb.y + hb.height / 2, { steps: 8 });
  await page.mouse.up();

  const after = await ends();
  expect(after.w, `wanted shorter than ${before.w}, got ${after.w}`).toBeLessThan(before.w - 60);
  // Still the same line, just less of it.
  expect(after.h / after.w).toBeCloseTo(before.h / before.w, 3);
});

// Resize holds the corner a child is NOT dragging. x/y pin the top-left but the
// rotation turns about the centre, so growing the box swings it — and the
// correction for that was applied with the wrong sign on both axes. It cancels
// to nothing at 0°, so an upright shape resized correctly and every existing
// test passed; a turned one walked across the page as it grew.
test("resizing a turned shape holds the corner it is not being dragged by", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  await addShape(page, "Rectangle");
  await turn(page, 45);

  // The pencil sits on the corner opposite the resize handle — the anchor.
  const anchor = async () => {
    const b = (await page.locator('[aria-label="Edit text"]').boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const before = await anchor();

  const hb = (await page.locator('div[title="Resize"]').boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 120, hb.y + hb.height / 2 + 90, { steps: 8 });
  await page.mouse.up();

  const after = await anchor();
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  expect(moved, `the anchor corner drifted ${Math.round(moved)}px`).toBeLessThan(4);
});
