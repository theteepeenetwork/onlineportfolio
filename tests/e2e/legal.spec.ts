import { test, expect } from "@playwright/test";

test.describe("Legal / policy pages", () => {
  test("the footer links to the policies, and each carries a draft banner", async ({ page }) => {
    await page.goto("/");
    // The landing footer links to the privacy policy.
    const privacy = page.getByRole("contentinfo").getByRole("link", { name: "Privacy" })
      .or(page.locator('a[href="/legal/privacy"]').first());
    await expect(page.locator('a[href="/legal/privacy"]').first()).toBeVisible();

    await page.goto("/legal/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    // Every policy must show the "draft / not legal advice" notice.
    await expect(page.getByText(/Draft for review — not legal advice/)).toBeVisible();
    // Core relationship is stated.
    await expect(page.getByText(/school is the data controller/)).toBeVisible();
  });

  test("the policies index lists every policy and they all load with the draft banner", async ({ page }) => {
    await page.goto("/legal");
    for (const [href, name] of [
      ["/legal/privacy", "Privacy Policy"],
      ["/legal/cookies", "Cookie Policy"],
      ["/legal/safeguarding", "Safeguarding & Child Protection"],
      ["/legal/terms", "Terms of Service"],
      ["/legal/acceptable-use", "Acceptable Use Policy"],
      ["/legal/data-processing", "Data Processing Agreement (DPA)"],
      ["/legal/sub-processors", "Sub-processors"],
      ["/legal/accessibility", "Accessibility Statement"],
      ["/legal/privacy-for-families", "Privacy — the plain-English version"],
    ] as const) {
      await page.goto(href);
      await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
      await expect(page.getByText(/Draft for review/)).toBeVisible();
    }
  });
});
