import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// Stage 2: a draft started on one device can be resumed on another. Two browser
// CONTEXTS = two devices (separate IndexedDB), so a restore in the second can
// only have come from the server sync.

test("a template draft synced on one device is offered on another", async ({ browser }) => {
  // --- Device 1: build a template, draw, and sync to the account ---
  const device1 = await browser.newContext();
  const page1 = await device1.newPage();
  await teacherLogin(page1);
  await page1.goto("/teacher/activities/new");
  await page1.fill("#title", "Synced across devices");
  await page1.getByRole("button", { name: /Build a template/ }).click();
  await expect(page1.locator("canvas")).toBeVisible();

  const canvas = page1.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas box");
  await page1.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page1.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page1.mouse.move(box.x + box.width * 0.3 + i * 16, box.y + box.height * 0.4 + i * 6);
  }
  await page1.mouse.up();

  // The editor has captured the composite pages into its hidden field. Push them
  // to the account exactly as the client's debounced server sync does.
  await expect
    .poll(async () => (await page1.locator('input[name="__templateEditor"]').inputValue()).length)
    .toBeGreaterThan(5000);
  const pages = JSON.parse(await page1.locator('input[name="__templateEditor"]').inputValue()) as string[];
  const status = await page1.evaluate(
    ({ pages }) =>
      fetch("/api/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          surface: "TEMPLATE_NEW",
          contextKey: "tmpl-new",
          pages,
          fields: { title: "Synced across devices" },
        }),
      }).then((r) => r.status),
    { pages },
  );
  expect(status).toBe(200);
  await device1.close();

  // --- Device 2: a fresh context (empty IndexedDB) is offered the server draft ---
  const device2 = await browser.newContext();
  const page2 = await device2.newPage();
  await teacherLogin(page2);
  await page2.goto("/teacher/activities/new");
  await page2.getByRole("button", { name: /Build a template/ }).click();
  await expect(page2.getByRole("dialog", { name: /restore your work from another device/i })).toBeVisible();
  await page2.getByRole("button", { name: /Restore my work/i }).click();
  // The synced pages come back into the editor.
  await expect
    .poll(async () => (await page2.locator('input[name="__templateEditor"]').inputValue()).length)
    .toBeGreaterThan(5000);
  // And the title synced with it.
  await page2.locator('button[title="Done"]').click();
  await expect(page2.locator("#title")).toHaveValue("Synced across devices");
  await device2.close();
});
