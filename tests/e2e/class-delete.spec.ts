import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// Deleting a whole class is a Right-to-Erasure operation (SAFEGUARDING.md rule
// 9). It must carry deliberate friction — an exact, case-sensitive name match
// and a second confirmation — before it removes the class and everything in it.
test.describe("Delete a whole class", () => {
  test("is permanent, name-confirmed (case-sensitive) and two-step", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/teacher/class");

    // Make a throwaway class to delete.
    await page.getByRole("button", { name: /New class/ }).click();
    await page.getByLabel("Class name").fill("Delete Me Please");
    await page.getByRole("button", { name: "Create class" }).click();
    await expect(page.getByRole("button", { name: /Delete Me Please/ })).toBeVisible();

    // Open it, reveal the danger zone.
    await page.getByRole("button", { name: /Delete Me Please/ }).click();
    await page.getByRole("button", { name: /Class settings/ }).click();
    await page.getByRole("button", { name: /Delete this class/ }).click();

    // The dialog states it is permanent.
    await expect(page.getByText(/Permanent · cannot be undone/i)).toBeVisible();

    const confirm = page.getByLabel("Type the class name to confirm");
    const deleteBtn = page.getByRole("button", { name: "Delete class" });

    // Wrong case must NOT unlock deletion.
    await confirm.fill("delete me please");
    await expect(deleteBtn).toBeDisabled();

    // The exact name unlocks it.
    await confirm.fill("Delete Me Please");
    await expect(deleteBtn).toBeEnabled();
    await deleteBtn.click();

    // Second confirmation, then commit.
    await expect(page.getByRole("heading", { name: /absolutely sure/i })).toBeVisible();
    await page.getByRole("button", { name: /Yes, permanently delete/ }).click();

    // Back on the grid, the class is gone.
    await expect(page.getByRole("button", { name: /Delete Me Please/ })).toHaveCount(0);
  });
});
