import { test, expect } from "@playwright/test";

import { POLICIES } from "@/app/legal/policies";

// The banner is not decoration. It is the statement that a page has not been
// reviewed, so this spec asserts it on exactly the pages POLICIES still marks
// as drafts, and asserts its ABSENCE on the published ones. Deleting the
// assertion would let an unreviewed page go live quietly; this keeps proving
// that it cannot.
const DRAFT = POLICIES.filter((p) => p.status === "draft").map((p) => p.key);
const PUBLISHED = POLICIES.filter((p) => p.status === "published").map((p) => p.key);

const HEADING: Record<string, string> = {
  privacy: "Privacy Policy",
  cookies: "Cookie Policy",
  safeguarding: "Safeguarding & Child Protection",
  terms: "Terms of Service",
  "acceptable-use": "Acceptable Use Policy",
  "data-processing": "Data Processing Agreement (DPA)",
  "sub-processors": "Sub-processors",
  accessibility: "Accessibility Statement",
  "privacy-for-families": "Privacy — the plain-English version",
};

test.describe("Legal / policy pages", () => {
  test("the footer links to the policies, and the privacy policy is published", async ({ page }) => {
    await page.goto("/");
    // The landing footer links to the privacy policy.
    await expect(page.locator('a[href="/legal/privacy"]').first()).toBeVisible();

    await page.goto("/legal/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    // Published: no draft banner, and the identifying details a school looks for.
    await expect(page.getByText(/Draft for review/)).toHaveCount(0);
    await expect(page.getByText(/Storyjar Limited/)).toBeVisible();
    await expect(page.getByText(/C2015410/)).toBeVisible();
    // Core relationship is stated.
    await expect(page.getByText(/school is the data controller/)).toBeVisible();
  });

  test("every policy loads, and each one is named in POLICIES", async ({ page }) => {
    await page.goto("/legal");
    for (const p of POLICIES) {
      const name = HEADING[p.key];
      expect(name, `${p.key} needs a heading in this spec`).toBeTruthy();
      await page.goto(`/legal/${p.key}`);
      await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    }
  });

  test("a draft policy carries the banner", async ({ page }) => {
    expect(DRAFT.length, "if nothing is a draft, delete this test deliberately").toBeGreaterThan(0);
    for (const key of DRAFT) {
      await page.goto(`/legal/${key}`);
      await expect(page.getByText(/Draft for review — not legal advice/)).toBeVisible();
    }
  });

  test("a published policy does not carry the banner, and carries a real date", async ({ page }) => {
    for (const key of PUBLISHED) {
      await page.goto(`/legal/${key}`);
      await expect(page.getByText(/Draft for review/)).toHaveCount(0);
      // A published page states when it was last updated, not "not yet published".
      await expect(page.getByText(/Last updated: \d/)).toBeVisible();
    }
  });

  test("no policy page still shows a bracketed placeholder", async ({ page }) => {
    for (const p of POLICIES) {
      await page.goto(`/legal/${p.key}`);
      const body = (await page.locator("main").innerText()) ?? "";
      expect(body, `${p.key} still contains a [placeholder]`).not.toMatch(
        /\[(Full name|business address|registration number|Confirm|Open item|Residency)/,
      );
    }
  });
});
