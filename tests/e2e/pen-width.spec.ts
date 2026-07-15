import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// The line-width control used to be buried inside the colour pop-up, so children
// never found it. It is now a line button under the hue bar that opens a slider.
// These lock in the parts that made it findable — and the keyboard route to
// colour, which the hue bar is now solely responsible for.

async function openCanvasWithPen(page: import("@playwright/test").Page) {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await expect(page.locator("canvas").first()).toBeVisible();
  // The template builder opens on Select; the slider is for drawing tools.
  await page.getByRole("button", { name: "Pen", exact: true }).click();
}

test("the line button opens a width slider and the width sticks to the pen", async ({ page }) => {
  await openCanvasWithPen(page);

  const slider = page.getByRole("slider", { name: /How thick your line is/ });
  await expect(slider).toBeHidden();

  await page.getByRole("button", { name: "Line thickness" }).click();
  await expect(slider).toBeVisible();

  await slider.fill("30");
  await expect(slider).toHaveValue("30");

  // Each tool remembers its own width: switch away and back.
  await page.getByRole("button", { name: "Highlighter", exact: true }).click();
  await page.getByRole("button", { name: "Line thickness" }).click();
  await expect(slider).not.toHaveValue("30");

  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.getByRole("button", { name: "Line thickness" }).click();
  await expect(slider).toHaveValue("30");
});

test("the slider gets out of the way when the child draws", async ({ page }) => {
  await openCanvasWithPen(page);
  await page.getByRole("button", { name: "Line thickness" }).click();

  const slider = page.getByRole("slider", { name: /How thick your line is/ });
  await expect(slider).toBeVisible();

  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas box");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.mouse.up();

  await expect(slider).toBeHidden();
});

test("colour is reachable with the keyboard alone", async ({ page }) => {
  await openCanvasWithPen(page);

  // The hue bar is the only colour control on this canvas, so it has to work
  // without a pointer.
  const hue = page.getByRole("slider", { name: "Colour" });
  const before = await hue.getAttribute("aria-valuetext");

  await hue.focus();
  await expect(hue).toBeFocused();
  for (let i = 0; i < 6; i++) await hue.press("ArrowDown");

  await expect(hue).not.toHaveAttribute("aria-valuetext", before ?? "");
});
