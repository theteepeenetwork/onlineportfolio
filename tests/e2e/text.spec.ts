import { test, expect } from "@playwright/test";
import { studentLogin } from "./helpers";

// Text boxes are objects: after being placed they can be re-selected, moved,
// and re-edited. (Dev has no seeded or other-test work.)
test("text can be placed, re-selected, moved and re-edited", async ({ page }) => {
  await studentLogin(page, "Dev");
  await page.goto("/student/new");
  await page.getByRole("button", { name: /Draw/ }).click();

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const cbox = (await canvas.boundingBox())!;

  // Pick the Text tool and tap the canvas to place a text box, then type.
  await page.locator('button[title="Text"]').click();
  await page.mouse.click(cbox.x + cbox.width * 0.4, cbox.y + cbox.height * 0.4);
  await page.locator('textarea[placeholder="Type…"]').waitFor();
  await page.keyboard.type("Hello");

  // Commit by switching to the pen.
  await page.locator('button[title="Pen"]').click();
  const label = page.getByText("Hello", { exact: true });
  await expect(label).toBeVisible();
  await expect(page.locator('textarea[placeholder="Type…"]')).toHaveCount(0);

  // With the cursor tool, re-select by tapping it — the controls appear.
  await page.locator('button[aria-label="Select"]').click();
  const before = (await label.boundingBox())!;
  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
  await expect(page.getByRole("button", { name: "Edit text" })).toBeVisible();

  // Move it.
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 160, before.y + before.height / 2 + 120, {
    steps: 6,
  });
  await page.mouse.up();
  const after = (await label.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 60);
  expect(after.y).toBeGreaterThan(before.y + 40);

  // Re-edit via the ✎ button.
  await page.getByRole("button", { name: "Edit text" }).click();
  const editor = page.locator('textarea[placeholder="Type…"]');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue("Hello");
  await page.keyboard.press("End");
  await page.keyboard.type(" world");
  await page.locator('button[title="Pen"]').click();
  await expect(page.getByText("Hello world", { exact: true })).toBeVisible();

  // Hand it in — the text is flattened into the saved image.
  await page.locator('button[title="Done"]').click();
  await page.waitForURL((url) => url.pathname === "/student");
  await expect(page.getByText("Waiting for you")).toBeVisible();
});
