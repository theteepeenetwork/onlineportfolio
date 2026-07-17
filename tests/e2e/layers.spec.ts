import { test, expect } from "@playwright/test";
import { studentLogin, openDrawing } from "./helpers";

async function addRectangle(page: import("@playwright/test").Page) {
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();
  const shape = page.locator("svg path[stroke]").first();
  await expect(shape).toBeVisible();
  return shape;
}

test("a drawing tool writes over objects; the cursor tool moves them", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  const shape = await addRectangle(page); // adding auto-selects the cursor tool
  const wrapper = shape.locator("xpath=ancestor::div[1]");
  const before = (await wrapper.boundingBox())!;

  // With the pen, dragging across the shape should DRAW, not move the shape.
  await page.locator('button[title="Pen"]').click();
  await page.mouse.move(before.x + before.width * 0.2, before.y + before.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width * 0.8, before.y + before.height * 0.5, { steps: 6 });
  await page.mouse.up();

  const afterDraw = (await wrapper.boundingBox())!;
  expect(Math.abs(afterDraw.x - before.x)).toBeLessThan(4); // shape stayed put
  const pages = await page.locator('input[name="drawingPages"]').inputValue();
  expect(pages.length).toBeGreaterThan(1000); // a stroke was recorded

  // With the cursor tool, dragging the shape moves it.
  await page.locator('button[aria-label="Move"]').click();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 130, before.y + before.height / 2 + 80, {
    steps: 6,
  });
  await page.mouse.up();
  expect((await wrapper.boundingBox())!.x).toBeGreaterThan(before.x + 50);
});

test("a shape's label is locked inside it, and re-fits when the shape resizes", async ({
  page,
}) => {
  await studentLogin(page, "Finn");
  await openDrawing(page);

  const shape = await addRectangle(page); // cursor tool is active after adding
  const wrapper = shape.locator("xpath=ancestor::div[1]");
  const box0 = (await wrapper.boundingBox())!;

  // Double-tap the shape to add a label inside it.
  await page.mouse.dblclick(box0.x + box0.width / 2, box0.y + box0.height / 2);
  await expect(page.locator('textarea[placeholder="Type…"]')).toBeVisible();
  await page.keyboard.type("Label");
  await page.locator('button[aria-label="Move"]').click(); // commit, stay on cursor tool

  const label = page.getByText("Label", { exact: true });
  await expect(label).toBeVisible();
  const fontOf = () => label.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const fontBefore = await fontOf();

  // Grow the shape — the label auto-sizes bigger to fit.
  const handle = page.locator('div[title="Resize"]');
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 220, hb.y + 160, { steps: 6 });
  await page.mouse.up();
  expect(await fontOf()).toBeGreaterThan(fontBefore + 2);

  // Move the shape — the label moves with it (it's locked to the shape).
  const labelBefore = (await label.boundingBox())!;
  const box1 = (await wrapper.boundingBox())!;
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await page.mouse.down();
  await page.mouse.move(box1.x + box1.width / 2 + 150, box1.y + box1.height / 2 + 90, {
    steps: 6,
  });
  await page.mouse.up();
  const labelAfter = (await label.boundingBox())!;
  expect(labelAfter.x).toBeGreaterThan(labelBefore.x + 60);
  expect(labelAfter.y).toBeGreaterThan(labelBefore.y + 30);
});
