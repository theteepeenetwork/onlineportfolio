import { test, expect } from "@playwright/test";

// The seeded parent (Priya Shah) is linked to Amara (Sunflower) and Grace
// (Ladybird): family code FAM123, magic-link email parent@home.com.

test.describe("Parent / family space", () => {
  test("a parent signs in with the family code and sees a read-only home", async ({ page }) => {
    await page.goto("/family");
    await page.getByRole("button", { name: "Use the family code from your letter" }).click();
    await page.fill("#pl-code", "FAM123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: /Hello, Amara.s grown-ups/ })).toBeVisible();
    // Only approved moments, and the read-only promise, are shown.
    await expect(page.getByText("only moments the teacher has approved")).toBeVisible();
    await expect(page.getByText(/only their teacher can add or change/)).toBeVisible();
    await expect(page.getByText("Count the apples")).toBeVisible();
  });

  test("the sibling switcher scopes to each child", async ({ page }) => {
    await page.goto("/family");
    await page.getByRole("button", { name: "Use the family code from your letter" }).click();
    await page.fill("#pl-code", "FAM123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: /Hello, Amara/ })).toBeVisible();

    // Switch to the sibling in a different class.
    await page.getByRole("button", { name: /Grace/ }).click();
    await expect(page.getByRole("heading", { name: /Hello, Grace.s grown-ups/ })).toBeVisible();
    await expect(page.getByText(/in Ladybird Class/)).toBeVisible();
    await expect(page.getByText("My junk-model rocket")).toBeVisible();
  });

  test("a magic link signs the parent in", async ({ page }) => {
    await page.goto("/family");
    await page.fill("#pl-email", "parent@home.com");
    await page.getByRole("button", { name: "Email me a magic link" }).click();

    // The confirmation offers a one-tap link (standing in for the emailed link).
    const open = page.getByRole("link", { name: /Open it now/ });
    await expect(open).toBeVisible();
    await open.click();

    await expect(page).toHaveURL((url) => url.pathname === "/family");
    await expect(page.getByRole("heading", { name: /grown-ups/ })).toBeVisible();
  });

  test("an unknown email gets a neutral response (no account enumeration)", async ({ page }) => {
    // Security (FINDINGS F6): the response must NOT reveal whether an email is on
    // file — it's identical for known and unknown addresses.
    await page.goto("/family");
    await page.fill("#pl-email", "nobody@nowhere.com");
    await page.getByRole("button", { name: "Email me a magic link" }).click();
    await expect(page.getByText(/if that email is on file/i)).toBeVisible();
    await expect(page.getByText(/couldn.t find a family/i)).toHaveCount(0);
  });

  test("a wrong family code is rejected", async ({ page }) => {
    await page.goto("/family");
    await page.getByRole("button", { name: "Use the family code from your letter" }).click();
    await page.fill("#pl-code", "WRONG9");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/family code isn.t right/)).toBeVisible();
  });
});
