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
