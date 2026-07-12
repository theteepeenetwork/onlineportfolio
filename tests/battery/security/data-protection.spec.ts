import { test, expect } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { SCHOOL_A, SCHOOL_B, loginTeacher, loginParent, studentIdFromLogin } from "../helpers";

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
  await page.getByRole("button", { name: /add pupil/i }).click();
  await page.locator('textarea[name="names"]').fill("Tempdeletee");
  await page.getByRole("button", { name: /add pupil/i }).last().click();
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

test("a teacher can export their own class; another tenant cannot (F4)", async ({ page }) => {
  // School B teacher opens Acorn settings and finds the export link.
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /acorn/i }).click();
  await page.getByRole("button", { name: /class settings/i }).click();
  const href = await page.getByRole("link", { name: /export class data/i }).getAttribute("href");
  expect(href).toMatch(/^\/teacher\/export\//);

  // Own class → 200 with the pupils' data.
  const mine = await page.request.get(href!);
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-disposition"]).toContain("attachment");
  const body = await mine.json();
  expect(body.schema).toBe("storyjar-class-export-v1");
  expect(JSON.stringify(body)).toContain("Zara");

  // Cross-tenant: School A admin must NOT be able to export School B's class.
  await loginTeacher(page, SCHOOL_A.admin);
  const theirs = await page.request.get(href!);
  expect(theirs.status()).toBe(404);
});

test("deleting a moment erases its media file too (rule 9 — regression guard)", async ({ page }) => {
  // Guards the PR #28 fix: deleteItem must remove the row AND the file. If a
  // future change reverts to a row-only delete, this fails. (The pupil-removal
  // path is still open — see finding F3.)
  const willowId = await studentIdFromLogin(page, SCHOOL_B.classCode, "Willow");
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/students/${willowId}/new`);
  await page.getByRole("button", { name: /photo/i }).click();
  await page.locator('input[type="file"][name="photo"]').setInputFiles(
    path.join(process.cwd(), "tests", "fixtures", "tiny.png"),
  );
  await page.getByRole("button", { name: /add to journal/i }).click();
  await page.waitForURL(/\/teacher\/students\/[^/]+$/);

  const src = await page.locator('img[src^="/uploads/"]').first().getAttribute("src");
  const file = path.join(process.cwd(), ".media", path.basename(src!));
  expect(existsSync(file)).toBe(true);

  await page.goto(`/teacher/students/${willowId}`);
  await page.getByRole("button", { name: /^delete$/i }).first().click();
  await page.waitForLoadState("networkidle");

  expect(existsSync(file), "media file must be erased when a moment is deleted").toBe(false);
});
