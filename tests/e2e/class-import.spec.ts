import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// "Paste a class list" — the September job. A teacher copies the names column
// out of their MIS and gets a class with its children already in it, in one
// step. Surnames are dropped on the way in (SAFEGUARDING.md rule 2), and the
// class code comes back so the sign-in sheet can be printed.
test("a teacher sets up a whole class from a pasted register", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/class");

  await page.getByRole("button", { name: /Paste a class list/ }).click();
  await page.fill("#import-name", "Hazel Class");
  await page.fill("#import-year", "Year 3");
  await page.getByRole("radio", { name: /Older children/ }).check();
  await page.fill("#import-names", "Olivia Smith\nOlivia Small\nJack Brown\nAmara");

  // The button counts what will be created before it is clicked. It counts
  // NAMES, which is what has been typed — the children do not exist yet, and
  // a surname on a line is not a second child.
  const submit = page.getByRole("button", { name: /Create the class from 4 names/ });
  await expect(submit).toBeVisible();
  await submit.click();

  // The confirmation reports the class, the count and the code to print.
  const done = page.getByRole("status");
  await expect(done).toContainText("4 pupils added");
  await expect(done).toContainText(/class code is/i);

  // The class is real, and holds first names only.
  await page.getByRole("link", { name: /Open Hazel Class/ }).click();
  await expect(page.getByRole("heading", { name: "Hazel Class" })).toBeVisible();
  await expect(page.getByText("Jack", { exact: true })).toBeVisible();
  await expect(page.getByText("Amara", { exact: true })).toBeVisible();
  // Colliding first names get the shortest distinguishing prefix, never a surname.
  await expect(page.getByText("Olivia Smi", { exact: true })).toBeVisible();
  await expect(page.getByText("Olivia Sma", { exact: true })).toBeVisible();
  await expect(page.getByText("Smith")).toHaveCount(0);
  await expect(page.getByText("Small")).toHaveCount(0);
});

test("a second class cannot reuse a name the teacher already has", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/class");

  await page.getByRole("button", { name: /Paste a class list/ }).click();
  await page.fill("#import-name", "Twice Class");
  await page.fill("#import-names", "Ada");
  await page.getByRole("button", { name: /Create the class/ }).click();
  await expect(page.getByRole("status")).toContainText("1 pupil added");

  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /Paste a class list/ }).click();
  await page.fill("#import-name", "Twice Class");
  await page.fill("#import-names", "Grace");
  await page.getByRole("button", { name: /Create the class/ }).click();
  // Scoped to main: Next's route announcer is also role="alert", and a locator
  // that matches two things fails strictly instead of saying what the screen said.
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/already have a class called/i);
});
