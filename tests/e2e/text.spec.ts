import { test, expect } from "@playwright/test";
import { studentLogin, openDrawing, pickTool, openPenFan } from "./helpers";

// Text boxes are objects: after being placed they can be re-selected, moved,
// and re-edited. (Dev has no seeded or other-test work.)
test("text can be placed, re-selected, moved and re-edited", async ({ page }) => {
  await studentLogin(page, "Dev");
  await openDrawing(page);

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const cbox = (await canvas.boundingBox())!;

  // Pick the Text tool and tap the canvas to place a text box, then type.
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Words", exact: true }).click();
  await page.mouse.click(cbox.x + cbox.width * 0.4, cbox.y + cbox.height * 0.4);
  await page.locator('textarea[placeholder="Type…"]').waitFor();
  await page.keyboard.type("Hello");

  // Commit by switching to the pen.
  await page.locator('button[title="Pens"]').click();
  const label = page.getByText("Hello", { exact: true });
  await expect(label).toBeVisible();
  await expect(page.locator('textarea[placeholder="Type…"]')).toHaveCount(0);

  // With the cursor tool, re-select by tapping it — the controls appear.
  await pickTool(page, "Move");
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
  await page.locator('button[title="Pens"]').click();
  await expect(page.getByText("Hello world", { exact: true })).toBeVisible();

  // Turn it. A text box carries the same four corners a shape does, so it
  // answers to the same hands (F42) — and the turn is stored, not just drawn,
  // which is what lets the export renderer put it in the hand-in the same way
  // up as the child left it.
  const turned = page.getByText("Hello world", { exact: true });
  const tbox = (await turned.boundingBox())!;
  const wrapper = turned.locator("..");
  // Committing with the pen dropped the selection, so pick the box up again.
  await pickTool(page, "Move");
  await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  await expect(page.getByRole("button", { name: "Turn text" })).toBeVisible();
  expect(await wrapper.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  const handle = page.getByRole("button", { name: "Turn text" });
  const hbox = (await handle.boundingBox())!;
  await page.mouse.move(hbox.x + hbox.width / 2, hbox.y + hbox.height / 2);
  await page.mouse.down();
  // Swing round to the far side of the box's centre, which is a half turn. The
  // turn handle is the top-right disc, so the far side is down and to the left.
  await page.mouse.move(tbox.x - tbox.width * 0.5, tbox.y + tbox.height * 2, { steps: 8 });
  await page.mouse.up();
  const matrix = await wrapper.evaluate((el) => getComputedStyle(el).transform);
  expect(matrix, "the text box should have turned").not.toBe("none");

  // Hand it in — the text is flattened into the saved image.
  await page.locator('button[title="Done"]').click();
  await page.waitForURL((url) => url.pathname === "/student/popped");
  await page.getByRole("link", { name: /Back to my jar/ }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  await expect(page.getByText(/Waiting for your teacher/)).toBeVisible();
});

// Words is a one-shot tool.
//
// Placing words is almost never done twice in a row — the job is place it,
// type it, move it — but the tool stayed armed, so the tap AFTER committing an
// edit dropped a second empty box on the page. The new box still opens for
// typing; it is the tool that hands over to Move.
test("Words places one box and then hands over to Move", async ({ page }) => {
  await studentLogin(page, "Dev");
  await openDrawing(page);
  const canvas = page.locator("canvas").first();
  const c = (await canvas.boundingBox())!;

  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Words", exact: true }).click();
  await page.mouse.click(c.x + c.width * 0.35, c.y + c.height * 0.35);

  // Open for typing straight away — handing over must not cost the edit.
  await page.locator('textarea[placeholder="Type…"]').waitFor();
  await page.keyboard.type("Hello");

  // Commit the way a child does, by tapping the paper; then tap again.
  await page.mouse.click(c.x + c.width * 0.7, c.y + c.height * 0.6);
  await page.mouse.click(c.x + c.width * 0.55, c.y + c.height * 0.75);
  await expect(
    page.locator("div[data-object]"),
    "tapping after an edit made a second words box",
  ).toHaveCount(1);

  // And Move is what is in hand, so that tap picked things up instead.
  await openPenFan(page);
  await expect(page.locator('button[aria-label="Move — drag & resize things"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
