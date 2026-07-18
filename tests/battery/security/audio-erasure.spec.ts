import { test, expect } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// Voice notes (AUDIO): deletion erases the audio file, not just the row
//
// Right to Erasure (SAFEGUARDING.md rule 9, UK GDPR Art. 17) requires deletion
// to remove rows AND the underlying media files — for EVERY media type. A voice
// note is stored on JournalItem.mediaPath exactly like a photo, and every delete
// path (deleteItem / deleteClass / removeStudent) erases mediaPath via the same
// deleteMediaFiles() call, which is extension-agnostic. This test proves that
// end to end for AUDIO, and doubles as coverage of the teacher "add a voice note
// on a child's behalf" path (which runs the same createJournalItem → saveAudio).
//
// It drives the real saveAudio path by setting the hidden `audio` file input
// (the field AudioCapture arms from the MediaRecorder blob), so no microphone is
// needed in CI.
// ===========================================================================

const MEDIA_DIR = path.join(process.cwd(), ".media");

// A tiny placeholder "m4a" — bytes don't matter to saveAudio (it validates the
// MIME type, not the contents) or to the /uploads route (which serves whatever
// is on disk). The point is that a real file lands on disk, then is erased.
const AUDIO_FIXTURE = {
  name: "voice.m4a",
  mimeType: "audio/mp4",
  buffer: Buffer.from([0, 0, 0, 32, 102, 116, 121, 112]),
};

test("adding a voice note stores a file; removing the pupil erases it [AUDIO / rule 9]", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);

  // Add a throwaway pupil to Acorn.
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /acorn/i }).click();
  await page.getByRole("button", { name: /add pupil/i }).click();
  await page.locator('textarea[name="names"]').fill("Voicetest");
  await page.getByRole("button", { name: /add pupil/i }).last().click();
  await expect(page.getByText("Voicetest")).toBeVisible();

  // Open THIS pupil's journal and add a voice note (publishes straight away for
  // a teacher — consistent with the other capture types on this path).
  await page
    .locator("div")
    .filter({ hasText: "Voicetest" })
    .filter({ has: page.getByRole("link", { name: /journal/i }) })
    .last()
    .getByRole("link", { name: /journal/i })
    .click();
  await page.waitForURL(/\/teacher\/students\/[^/]+$/);
  await page.getByRole("link", { name: /^＋ Add$|add/i }).first().click();
  await page.waitForURL(/\/new$/);

  // Choose the Voice tab, then arm the hidden `audio` field directly (the same
  // field AudioCapture sets from a recording) and submit.
  await page.getByRole("button", { name: /voice/i }).click();
  await page.locator('input[type="file"][name="audio"]').setInputFiles(AUDIO_FIXTURE);
  await page.getByRole("button", { name: /add to journal/i }).click();
  await page.waitForURL(/\/teacher\/students\/[^/]+$/);

  // The stored voice note renders as an <audio> element served via /uploads.
  const src = await page.locator('audio[src^="/uploads/"]').first().getAttribute("src");
  expect(src, "expected a stored voice note").toMatch(/^\/uploads\/.+\.(m4a|webm|ogg|mp3)$/);
  const file = path.join(MEDIA_DIR, path.basename(src!));
  expect(existsSync(file), "the audio file should exist on disk before removal").toBe(true);

  // Remove the pupil via class settings → Remove.
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /acorn/i }).click();
  await page.getByRole("button", { name: /class settings/i }).click();
  await page
    .locator("div")
    .filter({ hasText: "Voicetest" })
    .filter({ has: page.getByRole("button", { name: /^remove$/i }) })
    .last()
    .getByRole("button", { name: /^remove$/i })
    .click();
  await expect(page.getByText("Voicetest")).toHaveCount(0);

  // Rule 9: erasure is real — the audio file is gone from disk, not just the row.
  expect(existsSync(file), "the audio file must be erased when the pupil is removed (rule 9)").toBe(false);
});
