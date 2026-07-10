import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// An imported image / PDF page is a movable + resizable object, not a locked
// background.
test("imported PDF/image can be selected, moved and resized", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.getByRole("button", { name: /Build a template/ }).click();

  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/worksheet.pdf");

  const obj = page.locator('img[alt="Added picture"]').first();
  await expect(obj).toBeVisible({ timeout: 30_000 });
  const wrapper = obj.locator(".."); // the positioned wrapper div

  // --- Move: drag the object body up-and-left ---
  const before = (await wrapper.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 - 120, before.y + before.height / 2 - 70, {
    steps: 6,
  });
  await page.mouse.up();

  const afterMove = (await wrapper.boundingBox())!;
  expect(afterMove.x).toBeLessThan(before.x - 40);
  expect(afterMove.y).toBeLessThan(before.y - 20);

  // --- Resize: drag the corner handle outward ---
  const widthBefore = afterMove.width;
  const handle = page.locator('div[title="Resize"]');
  await expect(handle).toBeVisible();
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 90, hb.y + 60, { steps: 6 });
  await page.mouse.up();

  const widthAfter = (await wrapper.boundingBox())!.width;
  expect(widthAfter).toBeGreaterThan(widthBefore + 30);

  // --- Remove: the ✕ deletes the object ---
  await page.getByRole("button", { name: "Remove object" }).click();
  await expect(obj).toHaveCount(0);
});
