import { test, expect } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// F3 (FIXED — regression guard) — removing a pupil erases their media files
//
// Right to Erasure (SAFEGUARDING.md rule 9, UK GDPR Art.17) requires deletion
// to remove rows AND the underlying media files. All three delete paths now do:
//   - classes.ts:deleteClass()  ✓ erases media
//   - journal.ts:deleteItem()   ✓ erases media
//   - roster.ts:removeStudent() ✓ erases media (this fix — gathers the pupil's
//     media and calls deleteMediaFiles before deleting the row)
//
// This test guards the removeStudent fix: it uploads a photo for a throwaway
// pupil, removes the pupil, and asserts the file is gone from disk. (Promoted
// to the blocking security gate.)
// ===========================================================================

const MEDIA_DIR = path.join(process.cwd(), ".media");

test("removing a pupil also erases their media files [F3]", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);

  // Add a throwaway pupil to Acorn.
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /acorn/i }).click();
  await page.getByRole("button", { name: /add pupil/i }).click();
  await page.locator('textarea[name="names"]').fill("Orphantest");
  await page.getByRole("button", { name: /add pupil/i }).last().click();
  await expect(page.getByText("Orphantest")).toBeVisible();

  // Open THIS pupil's journal (their own row's link — not just any) and add a
  // photo (publishes straight away for a teacher).
  await page
    .locator("div")
    .filter({ hasText: "Orphantest" })
    .filter({ has: page.getByRole("link", { name: /journal/i }) })
    .last()
    .getByRole("link", { name: /journal/i })
    .click();
  await page.waitForURL(/\/teacher\/students\/[^/]+$/);
  const journalUrl = page.url();
  await page.getByRole("link", { name: /^＋ Add$|add/i }).first().click();
  await page.waitForURL(/\/new$/);
  await page.getByRole("button", { name: /photo/i }).click();
  await page.locator('input[type="file"][name="photo"]').setInputFiles(
    path.join(process.cwd(), "tests", "fixtures", "tiny.png"),
  );
  await page.getByRole("button", { name: /add to journal/i }).click();
  await page.waitForURL(/\/teacher\/students\/[^/]+$/);

  const src = await page.locator('img[src^="/uploads/"]').first().getAttribute("src");
  expect(src, "expected an uploaded image").toMatch(/^\/uploads\//);
  const file = path.join(MEDIA_DIR, path.basename(src!));
  expect(existsSync(file), "uploaded file should exist before removal").toBe(true);

  // Now remove the pupil via class settings → Remove.
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /acorn/i }).click();
  await page.getByRole("button", { name: /class settings/i }).click();
  const removeBtn = page
    .locator("div")
    .filter({ hasText: "Orphantest" })
    .filter({ has: page.getByRole("button", { name: /^remove$/i }) })
    .last()
    .getByRole("button", { name: /^remove$/i });
  await removeBtn.click();
  await expect(page.getByText("Orphantest")).toHaveCount(0);

  // SECURE expectation (FAILS today): the pupil's media is erased with them.
  expect(existsSync(file), "media must be erased when the pupil is removed (rule 9)").toBe(false);

  void journalUrl;
});
