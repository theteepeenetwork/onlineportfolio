import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// Walk the 5-step signup wizard through to (but not clicking) the final submit.
async function fillWizard(
  page: import("@playwright/test").Page,
  {
    fullName,
    title = "Mr",
    displayStyle = "formal",
    email,
    className,
    children,
  }: {
    fullName: string;
    title?: string;
    displayStyle?: "formal" | "first";
    email: string;
    className: string;
    children: string;
  },
) {
  await page.goto("/signup/teacher");
  await page.selectOption("#su-title", title);
  await page.fill("#su-fullname", fullName);
  // Pick how the class addresses the teacher (formal is selected by default).
  await page.getByRole("button", { name: displayStyle === "first" ? "First name" : "Title & surname" }).click();
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
    fullName: "New Teacher",
    email: "newteacher@school.uk",
    className: "Rainbow Class",
    children: "Amara\nBen\nChloe",
  });
  await page.getByRole("button", { name: "Add children" }).click();

  // Success step: the class name and a generated code, plus the sign-in guide.
  await expect(page.getByRole("heading", { name: /Rainbow Class.s class code/ })).toBeVisible();
  await expect(page.getByText("How your children sign in")).toBeVisible();
});

test("the dashboard greets a formal teacher by title + surname, not just the title", async ({ page }) => {
  // Regression: the old flow stored a raw name and greeted "Hello Mr". A teacher
  // who picks the formal style must be greeted "Hello Mr Pearson".
  await fillWizard(page, {
    title: "Mr",
    fullName: "Sam Pearson",
    displayStyle: "formal",
    email: "pearson@school.uk",
    className: "Kestrels",
    children: "Ada\nBen",
  });
  await page.getByRole("button", { name: "Add children" }).click();
  await expect(page.getByRole("heading", { name: /class code/ })).toBeVisible();

  // Land on the teacher dashboard and check the greeting.
  await page.goto("/teacher");
  await expect(page.getByRole("heading", { name: "Hello, Mr Pearson 👋" })).toBeVisible();
});

test("signing up with an existing email is rejected", async ({ page }) => {
  await fillWizard(page, {
    fullName: "Someone",
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
  // The seeded classes appear as cards in the grid.
  await expect(page.getByText("Sunflower Class", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /New class/ }).click();
  await page.locator("#className").fill("Bluebell Class");
  await page.getByRole("button", { name: /^Create class/ }).click();

  await expect(page.getByText("Bluebell Class", { exact: true })).toBeVisible();
  await expect(page.getByText("Sunflower Class", { exact: true })).toBeVisible();
});

test("a teacher can add several students at once by pasting a list", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/class");

  // Add a fresh class so the paste starts from an empty roster.
  await page.getByRole("button", { name: /New class/ }).click();
  await page.locator("#className").fill("Poppy Class");
  await page.getByRole("button", { name: /^Create class/ }).click();

  // Open the new class's roster and reveal the add-child form.
  await page.getByRole("button", { name: /Poppy Class/ }).click();
  await expect(page.getByRole("heading", { name: "Poppy Class" })).toBeVisible();
  await page.getByRole("button", { name: /Add child/ }).click();

  // Paste a messy register: commas, a blank line, and a case-only duplicate.
  await page.getByLabel(/Add children/).fill("Zed\nYara, Xavier\n\nzed");
  // The button counts the de-duplicated names.
  await expect(page.getByRole("button", { name: "Add 3 children" })).toBeVisible();
  await page.getByRole("button", { name: "Add 3 children" }).click();

  // All three land in the roster; the duplicate "zed" was collapsed to one.
  await expect(page.getByText("Zed", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Yara", { exact: true })).toBeVisible();
  await expect(page.getByText("Xavier", { exact: true })).toBeVisible();
});
