import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// Seeded calendar runs are dated relative to "now", so derive the labels the
// same way the app does (local time).
const now = new Date();
const monthLabel = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const todayLong = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const todayInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

test.describe("Teacher calendar", () => {
  test("shows the current month with a summary", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/teacher/calendar");

    await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
    await expect(page.getByText(monthLabel)).toBeVisible();
    for (const label of ["Runs this month", "Completion", "Live now", "Waiting to approve", "Overdue"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("opening today shows its runs with completion, linking to the run", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/teacher/calendar");

    // "Today" jumps to the current month and opens today's detail panel.
    await page.getByRole("button", { name: "Today" }).click();
    await expect(page.getByRole("heading", { name: todayLong })).toBeVisible();

    const run = page.getByRole("link", { name: /Count the apples/ }).first();
    await expect(run).toBeVisible();
    await expect(page.getByText(/in the jar/).first()).toBeVisible();

    await run.click();
    await expect(page).toHaveURL(/\/teacher\/activities\/[^/]+\?run=/);
  });

  test("the class filter scopes the grid", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/teacher/calendar");

    await expect(page.getByText("Count the apples").first()).toBeVisible();
    await page.getByRole("button", { name: "Ladybird Class" }).click();
    await expect(page.getByText("Count the apples")).toHaveCount(0); // Sunflower runs hidden
    await page.getByRole("button", { name: "All classes" }).click();
    await expect(page.getByText("Count the apples").first()).toBeVisible();
  });

  test("month navigation and Today", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/teacher/calendar");

    await expect(page.getByText(monthLabel)).toBeVisible();
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page.getByText(monthLabel)).toHaveCount(0);
    await page.getByRole("button", { name: "Today" }).click();
    await expect(page.getByText(monthLabel)).toBeVisible();
  });

  test("the agenda view lists runs under day headings", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/teacher/calendar");

    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await expect(page.getByRole("heading", { name: todayLong })).toBeVisible();
    await expect(page.getByRole("link", { name: /Count the apples/ }).first()).toBeVisible();
  });

  test("overdue and due-soon runs are flagged", async ({ page }) => {
    // The seeded overdue (due yesterday) / due-soon (due in 2 days) runs sit in a
    // different month within a couple of days of a month boundary — skip there.
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    test.skip(now.getDate() < 4 || dim - now.getDate() < 4, "near a month boundary the ±day seeded runs split months");

    await teacherLogin(page);
    await page.goto("/teacher/calendar");
    await page.getByRole("button", { name: "Agenda", exact: true }).click();

    await expect(page.getByRole("link").filter({ hasText: "Overdue" }).first()).toBeVisible();
    await expect(page.getByRole("link").filter({ hasText: "Due soon" }).first()).toBeVisible();
  });

  test("assigning with a due date puts the run on the calendar", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/teacher/activities");

    // Assign the unfiled "Draw your family" template with a due date of today.
    await page.getByRole("button", { name: "More actions for Draw your family" }).click();
    await page.getByRole("menu").getByRole("menuitem", { name: "Send to a class" }).click();
    await page.locator('input[name="dueDate"]').fill(todayInput);
    await page.getByRole("button", { name: /Assign to whole class/ }).click();
    await expect(page).toHaveURL(/\/teacher\/activities\/[^/]+\?run=/);

    await page.goto("/teacher/calendar");
    await expect(page.getByText("Draw your family").first()).toBeVisible();
  });
});
