import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

test("a teacher can sign up and gets their first class", async ({ page }) => {
  await page.goto("/signup/teacher");
  await page.fill("#name", "New Teacher");
  await page.fill("#email", "newteacher@school.uk");
  await page.fill("#password", "password123");
  await page.fill("#className", "Rainbow Class");
  await page.getByRole("button", { name: /Create account/ }).click();

  await page.waitForURL((url) => url.pathname === "/teacher/class");
  await expect(page.getByRole("heading", { name: "Rainbow Class" })).toBeVisible();
  await expect(page.getByText("Class code", { exact: true })).toBeVisible();
});

test("signing up with an existing email is rejected", async ({ page }) => {
  await page.goto("/signup/teacher");
  await page.fill("#name", "Someone");
  await page.fill("#email", "teacher@school.uk"); // the seeded demo teacher
  await page.fill("#password", "password123");
  await page.getByRole("button", { name: /Create account/ }).click();
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
