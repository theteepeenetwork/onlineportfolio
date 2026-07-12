import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// Teachers usually have a register with full names; Storyjar keeps first names
// only (SAFEGUARDING.md rule 2). Where a first name repeats, the shortest
// surname prefix that tells them apart is appended.
test("pasting a register with surnames keeps first names and disambiguates", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/class");

  await page.getByRole("button", { name: /New class/ }).click();
  await page.locator("#className").fill("Surname Class");
  await page.getByRole("button", { name: /^Create class/ }).click();

  await page.getByRole("button", { name: /Surname Class/ }).click();
  await expect(page.getByRole("heading", { name: "Surname Class" })).toBeVisible();
  await page.getByRole("button", { name: /Add pupil/ }).click();

  await page.getByLabel(/Add pupils/).fill("Olivia Smith\nOlivia Small\nJack Brown");
  await page.getByRole("button", { name: "Add 3 pupils" }).click();

  // Unique first name -> surname dropped.
  await expect(page.getByText("Jack", { exact: true })).toBeVisible();
  // Colliding first names -> shortest distinguishing surname prefix.
  await expect(page.getByText("Olivia Smi", { exact: true })).toBeVisible();
  await expect(page.getByText("Olivia Sma", { exact: true })).toBeVisible();

  // Full surnames are never stored or shown.
  await expect(page.getByText("Smith")).toHaveCount(0);
  await expect(page.getByText("Small")).toHaveCount(0);
  await expect(page.getByText("Brown")).toHaveCount(0);
});

// From "My classes", each class links to its own printable class-code sheet.
test("a class links to its printable class code", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/class");

  await page.getByRole("button", { name: /Sunflower Class/ }).click();
  const link = page.getByRole("link", { name: /Printable code/ });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(/\/signup\/teacher\/welcome\?class=/);
  await expect(page.getByRole("heading", { name: /Sunflower Class.s class code/ })).toBeVisible();
});
