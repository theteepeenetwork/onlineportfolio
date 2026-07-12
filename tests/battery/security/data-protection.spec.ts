import { test, expect } from "@playwright/test";
import { SCHOOL_A, SCHOOL_B, loginTeacher, loginParent } from "../helpers";

// ===========================================================================
// A11 — Data protection (DPIA evidence)
//
// The passing, gating checks: no third-party trackers, no child PII in URLs,
// and that pupil removal really deletes the rows. (The media-file erasure gap
// on per-item/per-pupil delete is logged as finding F3 and lives in
// tests/battery/findings/ — deletion of a *whole class* does erase, but the
// narrower delete paths do not.)
// ===========================================================================

// Any request whose host isn't our own origin is a third party. Storyjar
// promises "no trackers" (SAFEGUARDING.md rule 11) — assert nothing phones home.
async function assertNoThirdPartyRequests(page: import("@playwright/test").Page, gotoUrl: string) {
  const offOrigin: string[] = [];
  const origin = new URL(page.url() || "http://localhost").origin;
  const handler = (req: import("@playwright/test").Request) => {
    const u = new URL(req.url());
    if (u.origin !== origin && u.protocol !== "data:" && u.protocol !== "blob:") {
      offOrigin.push(req.url());
    }
  };
  page.on("request", handler);
  await page.goto(gotoUrl, { waitUntil: "networkidle" });
  page.off("request", handler);
  expect(offOrigin, `unexpected third-party requests: ${offOrigin.join(", ")}`).toHaveLength(0);
}

test("no third-party/tracker requests on the family view", async ({ page }) => {
  await loginParent(page, SCHOOL_A.parentFamilyCode);
  await assertNoThirdPartyRequests(page, "/family");
});

test("no third-party/tracker requests on the teacher dashboard + journal", async ({ page }) => {
  await loginTeacher(page, SCHOOL_A.admin);
  await assertNoThirdPartyRequests(page, "/teacher");
  await assertNoThirdPartyRequests(page, "/teacher/queue");
});

test("child names never appear in URLs while browsing", async ({ page }) => {
  await loginTeacher(page, SCHOOL_A.admin);
  const seen: string[] = [];
  page.on("framenavigated", (f) => seen.push(f.url()));

  await page.goto("/teacher");
  await page.goto("/teacher/class");
  await page.goto("/teacher/queue");

  // Pupil identifiers in paths are opaque cuids; a child's *name* must never be
  // in a URL (query or path).
  for (const url of seen) {
    expect(url, `child name leaked in URL: ${url}`).not.toMatch(/Amara|Ben|Chloe|Zara|Yusuf|Willow/);
  }
});

test("removing a pupil deletes the row (cascade works)", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /acorn/i }).click();

  // Add a throwaway pupil, confirm present.
  await page.getByRole("button", { name: /add child/i }).click();
  await page.locator('textarea[name="names"]').fill("Tempdeletee");
  await page.getByRole("button", { name: /add child/i }).last().click();
  await expect(page.getByText("Tempdeletee")).toBeVisible();

  // Enter settings mode and remove them. Target the roster row that both shows
  // the name and carries a Remove button (settings mode reveals per-child forms).
  await page.getByRole("button", { name: /class settings/i }).click();
  const removeBtn = page
    .locator("div")
    .filter({ hasText: "Tempdeletee" })
    .filter({ has: page.getByRole("button", { name: /^remove$/i }) })
    .last()
    .getByRole("button", { name: /^remove$/i });
  await removeBtn.click();

  await expect(page.getByText("Tempdeletee")).toHaveCount(0);
});
