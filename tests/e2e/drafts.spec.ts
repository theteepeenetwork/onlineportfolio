import { test, expect } from "@playwright/test";
import { teacherLogin, studentLogin, logout, drawOnCanvas } from "./helpers";

// Local-first draft autosave: in-progress work survives an accidental close /
// crash / lost connection (simulated here by a full page reload, which throws
// away all in-memory React state — exactly what a crash does).

test("a teacher's in-progress template survives a reload and saves correctly", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Recovered worksheet");

  await page.getByRole("button", { name: /Build a template/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await drawOnCanvas(page);
  await page.waitForTimeout(1300); // let the ~1s debounced autosave reach IndexedDB

  // Crash/close: reload throws away React state (templatePages, the title field).
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#title")).toHaveValue(""); // proves state was really lost

  // Reopen the editor → the restore prompt offers the saved work.
  await page.getByRole("button", { name: /Build a template/ }).click();
  await expect(page.getByRole("dialog", { name: /restore your unsaved work/i })).toBeVisible();
  await page.getByRole("button", { name: /Restore my work/i }).click();

  // The restored drawing is back in the editor's hidden field…
  await expect
    .poll(async () => (await page.locator('input[name="__templateEditor"]').inputValue()).length)
    .toBeGreaterThan(5000);
  await page.locator('button[title="Done"]').click();
  // …the restored pages come back as builder thumbnails…
  await expect(page.locator('img[alt^="Template page"]').first()).toBeVisible();
  // …and the title field was restored too.
  await expect(page.locator("#title")).toHaveValue("Recovered worksheet");

  // The restored work saves like any other template (restore→submit fidelity).
  await page.getByRole("button", { name: /Save to library/ }).click();
  await expect(page.getByRole("heading", { name: "Recovered worksheet" })).toBeVisible();
});

test("a child's in-progress drawing survives a reload", async ({ page }) => {
  // Assign a blank activity to the whole class first.
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Draft recovery activity");
  await page.getByRole("button", { name: /Save to library/ }).click();
  await expect(page.getByRole("heading", { name: "Draft recovery activity" })).toBeVisible();
  await page.getByRole("button", { name: /Assign/ }).first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));
  await logout(page);

  // Child opens it and starts drawing.
  await studentLogin(page, "Amara");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Draft recovery activity/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await drawOnCanvas(page);
  await page.waitForTimeout(1300);

  // Their tablet reloads (lost connection / closed lid) — work would be gone.
  await page.reload({ waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog", { name: /restore your unsaved work/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  // a11y: the primary action is auto-focused and meets the child touch-target floor.
  const restoreBtn = page.getByRole("button", { name: /Restore my work/i });
  await expect(restoreBtn).toBeFocused();
  expect((await restoreBtn.boundingBox())!.height).toBeGreaterThanOrEqual(64);

  await restoreBtn.click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(async () => (await page.locator('input[name="drawingPages"]').inputValue()).length)
    .toBeGreaterThan(1000);
});

test("a child never sees another child's draft on a shared device", async ({ page }) => {
  // Assign an activity to the whole class.
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Shared device activity");
  await page.getByRole("button", { name: /Save to library/ }).click();
  await expect(page.getByRole("heading", { name: "Shared device activity" })).toBeVisible();
  await page.getByRole("button", { name: /Assign/ }).first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));
  await logout(page);

  // Amara drafts on the class tablet.
  await studentLogin(page, "Amara");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Shared device activity/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await drawOnCanvas(page);
  await page.waitForTimeout(1300);

  // Ben signs in on the same device (same browser storage) and opens the activity.
  await logout(page);
  await studentLogin(page, "Ben");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Shared device activity/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  // Ben is NEVER offered Amara's work (drafts are keyed per pupil).
  await expect(page.getByRole("dialog", { name: /restore your unsaved work/i })).toHaveCount(0);
});
