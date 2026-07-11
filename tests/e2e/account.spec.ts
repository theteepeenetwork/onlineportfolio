import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// Walk the 5-step signup wizard through to (but not clicking) the final submit.
async function fillWizard(
  page: import("@playwright/test").Page,
  { name, email, className, children }: { name: string; email: string; className: string; children: string },
) {
  await page.goto("/signup/teacher");
  await page.fill("#su-name", name);
  await page.fill("#su-email", email);
  await page.fill("#su-pass", "password123");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.fill("#su-school", "St Bede’s Primary");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.fill("#su-class", className);
  await page.getByRole("button", { name: "Create class" }).click();
  await page.fill("#su-children", children);
}

test("a teacher can sign up through the wizard and gets a class code", async ({ page }) => {
  await fillWizard(page, {
    name: "New Teacher",
    email: "newteacher@school.uk",
    className: "Rainbow Class",
    children: "Amara\nBen\nChloe",
  });
  await page.getByRole("button", { name: "Add children" }).click();

  // Success step: the class name and a generated code, plus the sign-in guide.
  await expect(page.getByRole("heading", { name: /Rainbow Class.s class code/ })).toBeVisible();
  await expect(page.getByText("How your children sign in")).toBeVisible();
});

test("signing up with an existing email is rejected", async ({ page }) => {
  await fillWizard(page, {
    name: "Someone",
    email: "teacher@school.uk", // the seeded demo teacher
    className: "Some Class",
    children: "Kit",
  });
  await page.getByRole("button", { name: "Add children" }).click();

  // The server rejects the duplicate and sends us back with a kind error.
  await expect(page.getByText(/already exists/)).toBeVisible();
});

test("a teacher can create more than one class", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/class");
  await expect(page.getByRole("heading", { name: "Sunflower Class" })).toBeVisible();

  await page.locator("#className").fill("Bluebell Class");
  await page.getByRole("button", { name: /Create class/ }).click();

  await expect(page.getByRole("heading", { name: "Bluebell Class" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sunflower Class" })).toBeVisible();
});

test("a teacher can add several students at once by pasting a list", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/class");

  // Add a fresh class so the paste starts from an empty roster.
  await page.locator("#className").fill("Poppy Class");
  await page.getByRole("button", { name: /Create class/ }).click();
  const poppy = page.locator("section", { hasText: "Poppy Class" });
  await expect(poppy.getByRole("heading", { name: "Poppy Class" })).toBeVisible();

  // Paste a messy register: commas, a blank line, and a case-only duplicate.
  await poppy.getByLabel("Add students").fill("Zed\nYara, Xavier\n\nzed");
  // The button counts the de-duplicated names.
  await expect(poppy.getByRole("button", { name: "Add 3 students" })).toBeVisible();
  await poppy.getByRole("button", { name: "Add 3 students" }).click();

  // All three land in the roster; the duplicate "zed" was collapsed to one.
  await expect(poppy.getByRole("link", { name: "Zed" })).toHaveCount(1);
  await expect(poppy.getByRole("link", { name: "Yara" })).toBeVisible();
  await expect(poppy.getByRole("link", { name: "Xavier" })).toBeVisible();
});
