import { test, expect } from "@playwright/test";
import { teacherLogin, studentLogin, logout, drawOnCanvas, pageCount } from "./helpers";

// Use Finn, who has no seeded work, so the assertions are unambiguous.
test("a student's drawing goes through approval into their journal", async ({ page }) => {
  // Student draws on the full-screen canvas and hands it in.
  await studentLogin(page, "Finn");
  await page.goto("/student/new");
  await page.getByRole("button", { name: /Draw/ }).click();
  await drawOnCanvas(page);
  expect(await pageCount(page, "drawingPages")).toBeGreaterThan(0);
  await page.locator('button[title="Done"]').click();
  // Celebration, then back to the jar where it now waits.
  await page.waitForURL((url) => url.pathname === "/student/popped");
  await page.getByRole("link", { name: /Back to my jar/ }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  await expect(page.getByText(/Waiting for your teacher/)).toBeVisible();

  // Teacher finds Finn's submission in the queue and approves it.
  await logout(page);
  await teacherLogin(page);
  await page.goto("/teacher/queue");
  const finnCard = page.locator('[data-child="Finn"]');
  await expect(finnCard).toBeVisible();
  await finnCard.getByRole("button", { name: /Add to jar/ }).click();
  // The row leaves the queue once approved.
  await expect(finnCard).toHaveCount(0);

  // It now shows as published in Finn's journal.
  await page.goto("/teacher");
  await page.getByRole("link", { name: /Finn/ }).click();
  await expect(page.getByText("Published")).toBeVisible();
});
