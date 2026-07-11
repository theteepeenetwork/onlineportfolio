import { test, expect } from "@playwright/test";
import { teacherLogin, studentLogin } from "./helpers";

test.describe("Sign in", () => {
  test("teacher signs in and sees their dashboard", async ({ page }) => {
    await teacherLogin(page);
    await expect(page.getByRole("heading", { name: /Hello,/ })).toBeVisible();
    await expect(page.getByText("Sunflower Class")).toBeVisible();
  });

  test("teacher is rejected with a wrong password", async ({ page }) => {
    await page.goto("/login/teacher");
    await page.fill("#email", "teacher@school.uk");
    await page.fill("#password", "wrong");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/don't match/)).toBeVisible();
  });

  test("student signs in with the class code and their name", async ({ page }) => {
    await studentLogin(page, "Amara");
    await expect(page.getByText("Add to my jar")).toBeVisible();
    await expect(page.getByText("Sunflower Class")).toBeVisible();
  });
});
