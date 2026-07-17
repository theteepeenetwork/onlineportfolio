import { test, expect } from "@playwright/test";
import { studentLogin, openDrawing } from "./helpers";

// SJ-09 — the canvas is the best child UI in the app, with one desktop residue:
// a "Select" tool. A child tapping it found every pen had silently stopped
// working, with nothing on screen to say why — the classic child-UX trap, and a
// Year 1 doesn't know what a pointer is. They just touch.
//
// The fix is to make the tool honest rather than the app clever: Move exists
// only when there is something to move.
//
// Deliberately NOT the audit's "quietly hand the pen back after a move" —
// objectMode="answer" (a drag-the-objects worksheet) STARTS on this tool
// because moving IS the task, so that would hand the child a pencil and turn
// their next tap into a stray dot on their own answers.
//
// Dev has no seeded work and no other spec drives him.
test.describe("The Move tool only exists when it can do something", () => {
  test("a blank page offers no Move tool — so a child can't get stuck on it", async ({ page }) => {
    await studentLogin(page, "Dev");
    await openDrawing(page);

    // The pens are all there…
    await expect(page.locator('button[aria-label="Pen"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Eraser"]')).toBeVisible();
    // …and Move is not, because there is nothing on the page to move.
    await expect(page.locator('button[aria-label="Move"]')).toHaveCount(0);
  });

  test("adding a shape brings Move out, because now it means something", async ({ page }) => {
    await studentLogin(page, "Dev");
    await openDrawing(page);
    await expect(page.locator('button[aria-label="Move"]')).toHaveCount(0);

    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.getByRole("button", { name: "Rectangle" }).click();
    await expect(page.locator("svg path[stroke]").first()).toBeVisible();

    // The shape exists → the tool that moves it exists.
    await expect(page.locator('button[aria-label="Move"]')).toBeVisible();
  });

  // The tool a child taps is a picture — the shelf renders only the glyph, so
  // "Move" is what a teacher hovers and a screen reader announces, never what a
  // child reads. Both have to be right, for different people.
  test("Move is announced as Move, not Select", async ({ page }) => {
    await studentLogin(page, "Dev");
    await openDrawing(page);
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.getByRole("button", { name: "Rectangle" }).click();

    const move = page.locator('button[aria-label="Move"]');
    await expect(move).toBeVisible();
    await expect(move).toHaveAttribute("title", /^Move/);
    await expect(page.locator('button[aria-label="Select"]')).toHaveCount(0);
  });
});
