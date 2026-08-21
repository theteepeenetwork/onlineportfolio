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

// The picker offers `image/*`, so the app has to mean it.
//
// An AVIF passed the file dialog, decoded fine in the browser, landed on the
// canvas — and then the SAVE rejected it, because the store keeps only
// png/jpeg/webp/gif. A teacher had already chosen the file, watched it appear
// and arranged it before being told "That image couldn't be read." Anything
// outside the storable set is redrawn as a PNG on the way in now, the same way
// an imported PDF page already is.
test("an image in a format the store doesn't keep still imports and saves", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Modern picture");
  await page.getByRole("button", { name: /Build a template/ }).click();

  await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/sample.avif");
  const img = page.locator('img[alt="Added picture"]').first();
  await expect(img).toBeVisible({ timeout: 30_000 });

  const shape = await img.evaluate((el) => {
    const i = el as HTMLImageElement;
    return { w: i.naturalWidth, h: i.naturalHeight, src: i.src.slice(0, 20), bytes: i.src.length };
  });
  // Re-encoded into something the store keeps...
  expect(shape.src).toMatch(/^data:image\/(webp|jpeg);/);
  // ...capped, because a phone photo arrives at 3840 wide...
  expect(Math.max(shape.w, shape.h)).toBeLessThanOrEqual(2000);
  // ...and small enough to actually send. The first version of this re-encoded
  // to PNG, which turned this 0.9 MB photo into an 18.3 MB data URL and blew
  // the 16 MB a server action accepts — the save died with a stack trace.
  expect(
    shape.bytes,
    `an imported picture must not be anywhere near the 16MB body limit (was ${(shape.bytes / 1048576).toFixed(1)}MB)`,
  ).toBeLessThan(4 * 1024 * 1024);

  // And it survives the round trip that used to reject it.
  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /Save to library/ }).click();
  await page.waitForURL((u) => /^\/teacher\/activities\/[^/]+$/.test(u.pathname), {
    timeout: 30_000,
  });
  await expect(page.getByText(/couldn't be read/i)).toHaveCount(0);
});
