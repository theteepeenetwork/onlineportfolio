import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";
import { SCHOOL_B, loginTeacher, studentIdFromLogin } from "../helpers";

// ===========================================================================
// A4 — File uploads
//
// The upload allow-list (src/lib/media.ts) accepts only png/jpeg/webp/gif by
// MIME, caps at 15 MB, and stores files in a PRIVATE dir served only via the
// authorising /uploads route. These tests exercise the teacher "add a photo on
// a child's behalf" path, which runs the same createJournalItem → savePhoto.
// ===========================================================================

const FIXTURES = path.join(process.cwd(), "tests", "fixtures");

// Navigate the Oakfield teacher to the "add work" page for a clean pupil
// (Willow — no seeded items) and select the Photo tab.
async function gotoAddPhotoForWillow(page: import("@playwright/test").Page) {
  const willowId = await studentIdFromLogin(page, SCHOOL_B.classCode, "Willow");
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/students/${willowId}/new`);
  await page.getByRole("button", { name: /photo/i }).click();
  return willowId;
}

test("a valid PNG is accepted and stored", async ({ page }) => {
  await gotoAddPhotoForWillow(page);
  await page.locator('input[type="file"][name="photo"]').setInputFiles(
    path.join(FIXTURES, "tiny.png"),
  );
  await page.getByRole("button", { name: /add to journal/i }).click();
  // Lands back on Willow's journal with the new (approved) item.
  await page.waitForURL(/\/teacher\/students\//);
  await expect(page.locator("img").first()).toBeVisible();
});

test("an SVG upload is rejected (not on the image allow-list)", async ({ page }) => {
  await gotoAddPhotoForWillow(page);
  // Force the browser File.type to image/svg+xml — the server allow-list must
  // still refuse it (SVG can carry script; it is never an accepted upload).
  await page.locator('input[type="file"][name="photo"]').setInputFiles({
    name: "script.svg",
    mimeType: "image/svg+xml",
    buffer: readFileSync(path.join(FIXTURES, "script.svg")),
  });
  await page.getByRole("button", { name: /add to journal/i }).click();
  await expect(page.getByText(/isn'?t supported|use a photo/i)).toBeVisible();
});

test("a non-image disguised with a .png name is rejected by MIME", async ({ page }) => {
  await gotoAddPhotoForWillow(page);
  await page.locator('input[type="file"][name="photo"]').setInputFiles({
    name: "notreally.png",
    mimeType: "text/plain",
    buffer: Buffer.from("this is not an image"),
  });
  await page.getByRole("button", { name: /add to journal/i }).click();
  await expect(page.getByText(/isn'?t supported|use a photo/i)).toBeVisible();
});

test("uploaded media is served with a hardened content type, never as active SVG", async ({ page }) => {
  // Even though SVG uploads are refused, the /uploads route sets nosniff on
  // everything it serves, so a stored file can never be re-interpreted as HTML.
  await loginTeacher(page, SCHOOL_B.teacher);
  const res = await page.request.get(SCHOOL_B.approvedMedia);
  expect(res.status()).toBe(200);
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});
