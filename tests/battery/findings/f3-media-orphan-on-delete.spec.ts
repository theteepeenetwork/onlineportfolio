import { test, expect } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { SCHOOL_B, loginTeacher, studentIdFromLogin } from "../helpers";

// ===========================================================================
// FINDING F3 (High) — deleting a moment (or a pupil) orphans its media file
//
// classes.ts:deleteClass() carefully erases media files (calls deleteMediaFiles)
// so a *whole-class* delete is real. But the narrower delete paths do NOT:
//   - journal.ts:deleteItem()   → deletes the DB row only
//   - roster.ts:removeStudent() → cascades rows only
// The child's photo/drawing therefore survives on disk after the record is
// gone, which fails the Right to Erasure (SAFEGUARDING.md rule 9, UK GDPR
// Art.17).
//
// This test asserts the INTENDED behaviour (the file is gone after delete), so
// it FAILS today. Non-blocking `security-findings` project. Fix = call
// deleteMediaFiles() from deleteItem()/removeStudent(); then this goes green.
// ===========================================================================

const MEDIA_DIR = path.join(process.cwd(), ".media");

test("deleting a single moment also erases its media file [F3]", async ({ page }) => {
  // Create a disposable photo moment on a clean pupil (Willow) so we don't
  // disturb seeded fixtures other tests read.
  const willowId = await studentIdFromLogin(page, SCHOOL_B.classCode, "Willow");
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/students/${willowId}/new`);
  await page.getByRole("button", { name: /photo/i }).click();
  await page.locator('input[type="file"][name="photo"]').setInputFiles(
    path.join(process.cwd(), "tests", "fixtures", "tiny.png"),
  );
  await page.getByRole("button", { name: /add to journal/i }).click();
  // Land specifically on the journal page (…/students/<id>), NOT the /new page —
  // otherwise we'd read the blob: preview instead of the saved /uploads image.
  await page.waitForURL(/\/teacher\/students\/[^/]+$/);

  // Read the stored media URL from the rendered image, map to its disk path.
  const src = await page.locator('img[src^="/uploads/"]').first().getAttribute("src");
  expect(src, "expected an uploaded image").toMatch(/^\/uploads\//);
  const file = path.join(MEDIA_DIR, path.basename(src!));
  expect(existsSync(file), "uploaded file should exist on disk before delete").toBe(true);

  // Delete the moment via the journal page's Delete control.
  await page.goto(`/teacher/students/${willowId}`);
  await page.getByRole("button", { name: /^delete$/i }).first().click();
  await page.waitForLoadState("networkidle");

  // SECURE expectation: the underlying file is erased too. (Today: FAILS — the
  // row is gone but the file remains, orphaned, on disk.)
  expect(existsSync(file), "media file must be erased when the moment is deleted (rule 9)").toBe(false);
});
