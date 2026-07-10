import { test, expect } from "@playwright/test";
import { studentLogin } from "./helpers";

// Shapes can be added, are movable / resizable, and their fill + line colour
// can be changed.
test("a child can add a shape, recolour it, move and resize it", async ({ page }) => {
  // Ella has no seeded or other-test work, so "Waiting for you" is unambiguous.
  await studentLogin(page, "Ella");
  await page.goto("/student/new");
  await page.getByRole("button", { name: /Draw/ }).click();

  // Open the ＋ fan → Shapes → add a rectangle.
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();

  const shape = page.locator("svg path[stroke]").first();
  await expect(shape).toBeVisible();

  // Change fill + line colour via the style bar.
  await page.locator('input[aria-label="Fill colour"]').fill("#ef4444");
  await page.locator('input[aria-label="Line colour"]').fill("#10b981");
  await expect(shape).toHaveAttribute("fill", "#ef4444");
  await expect(shape).toHaveAttribute("stroke", "#10b981");

  // Move it and resize it.
  const wrapper = shape.locator("xpath=ancestor::div[1]");
  const before = (await wrapper.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 - 100, before.y + before.height / 2 - 60, {
    steps: 6,
  });
  await page.mouse.up();
  const afterMove = (await wrapper.boundingBox())!;
  expect(afterMove.x).toBeLessThan(before.x - 30);

  const handle = page.locator('div[title="Resize"]');
  const hb = (await handle.boundingBox())!;
  const widthBefore = afterMove.width;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 80, hb.y + 80, { steps: 6 });
  await page.mouse.up();
  expect((await wrapper.boundingBox())!.width).toBeGreaterThan(widthBefore + 30);

  // Hand it in — the shape is flattened into the saved image.
  await page.locator('button[title="Done"]').click();
  await page.waitForURL((url) => url.pathname === "/student");
  await expect(page.getByText("Waiting for you")).toBeVisible();
});
