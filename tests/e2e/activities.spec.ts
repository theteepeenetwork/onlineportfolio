import { test, expect } from "@playwright/test";
import { teacherLogin, studentLogin, logout, drawOnCanvas } from "./helpers";

// The full library flow: create a reusable template, assign it as a run, a child
// responds on the template, and the teacher sees the run's response.
test("teacher creates a template, assigns it, a child responds, teacher sees the run", async ({
  page,
}) => {
  // --- Create a template (title, instructions, tag, PDF template canvas) ---
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Count worksheet");
  await page.fill("#instructions", "Circle how many apples.");
  await page.fill("#tags", "Maths");

  await page.getByRole("button", { name: /Build a template/ }).click();
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/worksheet.pdf");
  await expect
    .poll(async () => (await page.locator('input[name="__templateEditor"]').inputValue()).length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(10_000);
  await page.locator('button[title="Done"]').click();
  await expect(page.locator('img[alt^="Template page"]').first()).toBeVisible();

  await page.getByRole("button", { name: /Save to library/ }).click();
  // Lands on the template detail page.
  await page.waitForURL((url) => /^\/teacher\/activities\/[^/]+$/.test(url.pathname));
  await expect(page.getByRole("heading", { name: "Count worksheet" })).toBeVisible();
  const templatePath = new URL(page.url()).pathname;

  // --- Assign it to the whole class (a new run) ---
  await page.getByRole("button", { name: /Assign/ }).first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));
  await expect(page.getByText(/whole class/).first()).toBeVisible();

  // --- Child opens the run: the template must be on their canvas ---
  await logout(page);
  await studentLogin(page, "Amara");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Count worksheet/ }).click();
  await expect(page.getByText("Circle how many apples.")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(async () => (await page.locator('input[name="drawingPages"]').inputValue()).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(10_000);

  await drawOnCanvas(page);
  await page.locator('button[title="Done"]').click();
  await page.waitForURL((url) => url.pathname === "/student");

  // --- Teacher sees the response on the run ---
  await logout(page);
  await teacherLogin(page);
  await page.goto(templatePath);
  await expect(page.getByText(/1 waiting/).first()).toBeVisible();
  // Amara's tile shows in the response grid as waiting for approval.
  await expect(page.getByText("Amara")).toBeVisible();
});

test("the library filters templates by tag and status", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities");

  // Seed has Count the apples (Maths, live), Minibeast hunt (Science, live),
  // Draw your family (Writing, never run).
  await expect(page.getByRole("link", { name: "Count the apples" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Draw your family" })).toBeVisible();

  // Filter to the Writing tag → only the never-run template remains.
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await expect(page.getByRole("link", { name: "Draw your family" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Count the apples" })).toHaveCount(0);

  // Back to All, then "Never run" → still just the never-run one.
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Never run", exact: true }).click();
  await expect(page.getByRole("link", { name: "Draw your family" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Minibeast hunt" })).toHaveCount(0);
});
