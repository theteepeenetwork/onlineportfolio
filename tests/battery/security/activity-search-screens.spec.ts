import { test, expect } from "@playwright/test";
import { db } from "@/lib/db";
import { SCHOOL_A, SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// Search, on both activity screens.
//
// A search box is the one control on these screens that can quietly turn into a
// disclosure, because "search" invites the reader to assume it searches
// everything. It does not. Both screens filter in memory over rows the server
// already scoped, so search narrows what is on the page and can never widen it.
//
// That is a structural claim, so it is asserted structurally: the words that
// would match another teacher's activity, or an unpublished library activity,
// are typed into the box and must return nothing. Each is paired with a control
// proving the same box does find what it should, so a search that had simply
// stopped working could not pass.
// ===========================================================================

test.beforeEach(async () => {
  await db.activityTemplate.deleteMany({ where: { sourceSharedActivityId: { not: null } } });
});

test("the Storyjar library filters as you type, and says how many are left", async ({ page }) => {
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/teacher/activities/shared");
  const shared = await db.sharedActivity.findUnique({ where: { slug: "seed-autumn-walk" } });
  await expect(page.locator("body")).toContainText(shared!.title);

  const box = page.getByLabel("Search the library");
  await box.fill("autumn");
  await expect(page.locator("body")).toContainText(shared!.title);

  // A word in nothing: the grid empties and says so, rather than going blank.
  await box.fill("fractions");
  await expect(page.locator("body")).not.toContainText(shared!.title);
  await expect(page.locator("body")).toContainText("Nothing matches that");

  // Clearing brings it back, which is the control for the assertion above.
  await page.getByRole("button", { name: "Clear the search" }).click();
  await expect(page.locator("body")).toContainText(shared!.title);
});

test("searching the library cannot reach an unpublished activity", async ({ page }) => {
  const hidden = await db.sharedActivity.findUnique({ where: { slug: "seed-not-published-yet" } });
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/teacher/activities/shared");

  // Type the unpublished activity's own title at it.
  await page.getByLabel("Search the library").fill(hidden!.title);
  await expect(page.locator("body")).not.toContainText(hidden!.title.slice(0, 20));
  await expect(page.locator("body")).toContainText("Nothing matches that");

  // Control: the same box, the same session, finds the published one.
  await page.getByLabel("Search the library").fill("autumn");
  const shown = await db.sharedActivity.findUnique({ where: { slug: "seed-autumn-walk" } });
  await expect(page.locator("body")).toContainText(shown!.title);
});

test("a teacher's own grid filters, and cannot reach another teacher's activity", async ({ page }) => {
  // A distinctive title in School B, which School A must never surface.
  const theirs = await db.activityTemplate.findFirst({
    where: { teacher: { email: SCHOOL_B.teacher.email } },
    select: { id: true },
  });
  expect(theirs, "School B needs a template for this to prove anything").toBeTruthy();
  await db.activityTemplate.update({
    where: { id: theirs!.id },
    data: { title: "Oakfield zzqx marker activity" },
  });

  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/teacher/activities");

  const mine = await db.activityTemplate.findFirst({
    where: { teacher: { email: SCHOOL_A.admin.email }, archived: false },
    select: { title: true },
  });
  expect(mine).toBeTruthy();

  const box = page.getByLabel(/^Search /);
  // Control first: the box finds this teacher's own work.
  await box.fill(mine!.title.split(" ")[0]);
  await expect(page.locator("body")).toContainText(mine!.title);

  // Then the marker word that only exists in the other tenant.
  await box.fill("zzqx");
  await expect(
    page.locator("body"),
    "search must narrow what this teacher already has, never reach another tenant",
  ).not.toContainText("Oakfield zzqx marker activity");
  await expect(page.locator("body")).toContainText("Nothing matches that");
});

test("an empty search result is not treated as an empty library", async ({ page }) => {
  // The first-day empty state offers the Storyjar library. A teacher who has
  // activities but has mistyped a search is not on their first day, and telling
  // them their library is empty would be a lie at the worst moment.
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/teacher/activities");
  await page.getByLabel(/^Search /).fill("zzqx");

  await expect(page.locator("body")).toContainText("Nothing matches that");
  await expect(
    page.locator("body"),
    "an empty RESULT must not render the empty-LIBRARY prompt",
  ).not.toContainText("Browse the Storyjar library");
});
