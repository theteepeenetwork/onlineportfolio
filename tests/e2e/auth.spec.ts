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

  // SJ-01: the landing page used to offer "Teacher sign in" and nothing else, so
  // a child on a fresh classroom iPad had no way in without an adult. The pupil
  // door is their only self-serve route — if it ever disappears again, a child
  // is stuck, so guard it here rather than in the report-only UX project.
  test("a child can reach sign-in from the landing page on their own", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "I'm a pupil" }).click();
    await expect(page.getByRole("heading", { name: /what's your class code/i })).toBeVisible();
  });
});
