import { test, expect } from "@playwright/test";
import { studentLogin } from "./helpers";

async function openDrawing(page: import("@playwright/test").Page) {
  await page.goto("/student/new");
  await page.getByRole("button", { name: /Draw/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
}

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
  await page.locator('button[aria-label="Select"]').click();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 130, before.y + before.height / 2 + 80, {
    steps: 6,
  });
  await page.mouse.up();
  expect((await wrapper.boundingBox())!.x).toBeGreaterThan(before.x + 50);
});

test("double-tapping a shape adds a text box inside it", async ({ page }) => {
  await studentLogin(page, "Finn");
  await openDrawing(page);

  const shape = await addRectangle(page);
  const box = (await shape.locator("xpath=ancestor::div[1]").boundingBox())!;

  // Double-click the shape (cursor tool is active after adding).
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const editor = page.locator('textarea[placeholder="Type…"]');
  await expect(editor).toBeVisible();
  await page.keyboard.type("Hi");
  await page.locator('button[title="Pen"]').click();
  await expect(page.getByText("Hi", { exact: true })).toBeVisible();
});
