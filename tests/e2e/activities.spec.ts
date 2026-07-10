// NOTE: imported images/PDFs are now movable/resizable objects (see
// objects.spec.ts). They are flattened into the saved template/response image.
import { test, expect } from "@playwright/test";
import { teacherLogin, studentLogin, logout, drawOnCanvas } from "./helpers";

// The full activity loop, including the regression that a PDF template must
// actually appear on the child's canvas when they open the activity.
test("teacher sets a PDF-template activity, a child responds on it, teacher sees it", async ({
  page,
}) => {
  // --- Teacher builds the activity on the same canvas the children use ---
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Count worksheet");
  await page.fill("#instructions", "Circle how many apples.");

  await page.getByRole("button", { name: /Build a template/ }).click();
  // Import the worksheet PDF into the full-screen editor and wait until it has
  // actually been rasterised into the editor's captured pages (a big data URL —
  // a blank page would be tiny). This avoids clicking Done mid-import.
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/worksheet.pdf");
  await expect
    .poll(async () => (await page.locator('input[name="__templateEditor"]').inputValue()).length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(10_000);
  await page.locator('button[title="Done"]').click();

  // Back in the builder, the template preview is shown.
  await expect(page.locator('img[alt^="Template page"]').first()).toBeVisible();
  await page.getByRole("button", { name: /Save & assign/ }).click();
  await page.waitForURL((url) => url.pathname === "/teacher/activities");
  await expect(page.getByText("Count worksheet")).toBeVisible();

  // --- Child opens the activity: the template must be on their canvas ---
  await logout(page);
  await studentLogin(page, "Amara");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Count worksheet/ }).click();

  // The activity title + instructions are shown over the canvas.
  await expect(page.getByText("Count worksheet")).toBeVisible();
  await expect(page.getByText("Circle how many apples.")).toBeVisible();

  // The regression check: the template (a large image, not a blank page) must
  // load into the child's response canvas.
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(async () => (await page.locator('input[name="drawingPages"]').inputValue()).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(10_000);

  // Child draws on the worksheet and hands it in.
  await drawOnCanvas(page);
  await page.locator('button[title="Done"]').click();
  await page.waitForURL((url) => url.pathname === "/student");

  // --- Teacher sees the response in the side-by-side view ---
  await logout(page);
  await teacherLogin(page);
  await page.goto("/teacher/activities");
  await page.getByText("Count worksheet").click();
  await expect(page.getByText(/1 of 6 responded/)).toBeVisible();
  await expect(page.getByAltText("Amara's response")).toBeVisible();
});
