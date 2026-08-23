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

// Any request whose host isn't our own origin is a third party. StoryJar
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
  // Wait for the ADD to land, not merely for the name to be somewhere on the
  // page: the box a teacher typed into still holds the name until the server
  // action comes back, so "the name is visible" can be true while the register
  // below is still the old one. The form clears itself on success, so an empty
  // box is the signal that the roster on screen is the roster in the database —
  // and the row locators below depend on that being true.
  await expect(page.locator('textarea[name="names"]')).toHaveValue("");
  await expect(page.getByText("Tempdeletee")).toBeVisible();

  // Enter settings mode and remove them. Target the roster row that both shows
  // the name and carries a Remove button (settings mode reveals per-child forms).
  await page.getByRole("button", { name: /class settings/i }).click();
  const removeBtn = page
    .getByRole("main")
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

test("the per-pupil export answers for one child, and only to that child's teacher", async ({ page }) => {
  // The subject-access export: "what do you hold about my child". Scoped the
  // same way the class export and the pupil's own journal page are — the
  // teacher whose class the child is in, nobody else.
  const zaraId = await studentIdFromLogin(page, SCHOOL_B.classCode, "Zara");
  const url = `/teacher/export/pupil/${zaraId}`;

  // The teacher who owns Acorn → 200, and it is about Zara.
  await loginTeacher(page, SCHOOL_B.teacher);
  const mine = await page.request.get(url);
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-disposition"]).toContain("attachment");
  expect(mine.headers()["cache-control"]).toContain("no-store");
  const body = await mine.json();
  expect(body.schema).toBe("storyjar-pupil-export-v1");
  expect(body.pupil.firstName).toBe("Zara");

  // One child's file holds one child. Yusuf is in the same class and must not
  // be in it.
  const raw = JSON.stringify(body);
  expect(raw, "another pupil's name leaked into a per-pupil export").not.toContain("Yusuf");

  // Nothing in this file may be a credential or a profile: a parent is handed
  // it. The class code signs somebody in as any pupil in the class, the family
  // code signs them in as a household, and jarSeenAt is profiling (rule 11).
  expect(raw, "a class code must never leave in a pupil export").not.toContain(SCHOOL_B.classCode);
  expect(raw, "a family code must never leave in a pupil export").not.toContain(SCHOOL_B.parentFamilyCode);
  expect(raw, "when a child last opened their jar must never be exported").not.toContain("jarSeenAt");

  // Family access is a COUNT and nothing else. A per-household date or flag is
  // a written claim about the OTHER household, in a file handed to this one —
  // and `takenUp` was wrong in both directions besides, because parent sessions
  // are purged 7 days after they expire.
  expect(body.familyAccess.places, "how many households can see this jar").toBeGreaterThanOrEqual(0);
  expect(body.familyAccess.households, "no per-household detail may be exported").toBeUndefined();
  expect(raw, "a session-derived 'taken up' claim about a household").not.toContain("takenUp");

  // Rule 3's human gate: the file carries work nobody has approved, so it has
  // to say so where the person handing it over will see it.
  expect(body.reviewBeforeSharing.momentsNotApproved).toBeGreaterThan(0); // Zara's quiz answer is PENDING
  expect(body.reviewBeforeSharing.note).toMatch(/not been through the approval queue/i);

  // A subject access answer has to be intelligible. Stored answers are opaque
  // ids ("opt2"), so they are resolved against the frozen quiz into the words
  // the child was actually shown.
  const quizMoment = body.moments.find((m: { quizAnswers?: unknown[] }) => m.quizAnswers?.length);
  expect(quizMoment, "Zara's seeded quiz response").toBeTruthy();
  expect(quizMoment.quizAnswers[0].question, "the question, not its id").toContain("oak leaf");
  expect(JSON.stringify(quizMoment.quizAnswers)).not.toMatch(/"opt\d/);

  // Another teacher in the SAME school, who does not teach Acorn, gets nothing.
  // A subject access request is a reason to read out what is held, not a reason
  // to widen who may read it.
  await loginTeacher(page, SCHOOL_B.admin);
  const colleague = await page.request.get(url);
  expect(colleague.status(), "a school colleague who does not teach this child").toBe(404);

  // Cross-tenant: School A must not reach School B's child.
  await loginTeacher(page, SCHOOL_A.admin);
  const theirs = await page.request.get(url);
  expect(theirs.status(), "School A reached School B's pupil").toBe(404);
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
