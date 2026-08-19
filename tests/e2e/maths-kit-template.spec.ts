import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, logout } from "./helpers";

// The invariant that is easiest to get backwards, exercised the way it actually
// happens in a classroom: the teacher builds the apparatus into the activity,
// and the child works on top of it.
//
//   Gating decides what a canvas OFFERS. It never decides what renders.
//
// An EYFS child is never shown the maths kit. But a hundred flat their teacher
// put on the page has to be there when they open it — and has to survive into
// the work they hand in. If gating ever leaked into rendering, this is the test
// that would say so, and it is the common case rather than an edge one.

// This test drives the template builder, which writes a local-first draft as it
// goes. A draft left behind is not a private mess: the restore modal is
// `aria-modal` and intercepts pointer events, so the next test to open the
// builder fails on a click that has nothing to do with what it was testing.
// That fragility is logged as F38 and wants a shared fixture; until then, a test
// that creates the problem clears up after itself.
test.afterEach(async ({ page }) => {
  // Navigate away FIRST. The canvas autosaves on a debounce, so deleting while
  // it is still mounted just races a write that lands a moment later — which is
  // exactly the trap this hook exists to avoid.
  await page.goto("about:blank");
  const db = new PrismaClient();
  await db.draft.deleteMany({});
  await db.$disconnect();
});

test("a teacher's apparatus renders for a child who is never offered it", async ({ page }) => {
  // --- The teacher builds a template carrying apparatus ---
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Hundreds and tens");
  await page.fill("#instructions", "Show me twenty-four.");
  await page.fill("#tags", "Maths");

  await page.getByRole("button", { name: /Build a template/ }).click();

  // The builder's canvas is the same full-screen one the children get, so the
  // kit is behind the ＋ fan. A teacher gets every kit whatever age they teach,
  // so this is reachable even though the class it is about to be assigned to is
  // Reception.
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Maths kit" }).click();
  await page.getByRole("tab", { name: "Place value" }).click();
  await page.getByRole("button", { name: "Base 10 hundred flat", exact: true }).click();

  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Maths kit" }).click();
  await page.getByRole("tab", { name: "Frames & arrays" }).click();
  await page.getByRole("button", { name: "Ten frame", exact: true }).click();

  // Two pieces of apparatus on the teacher's canvas.
  await expect(page.locator('svg[data-shape="grid"]')).toHaveCount(2);

  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /Save to library/ }).click();
  await page.waitForURL((url) => /^\/teacher\/activities\/[^/]+$/.test(url.pathname));

  // --- Assign it to the EYFS class ---
  await page.getByRole("button", { name: /Assign/ }).first().click();
  const acorns = page.getByRole("button", { name: /Acorns/ });
  if (await acorns.count()) await acorns.first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));

  // --- The Reception child opens it ---
  await logout(page);
  await page.goto("/login/student?code=ACO789");
  await page.getByRole("button", { name: "Ava", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");

  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Hundreds and tens/ }).click();
  await expect(page.locator("canvas")).toBeVisible();

  // The apparatus is on their page, drawn properly — divisions and all.
  const grids = page.locator('svg[data-shape="grid"]');
  await expect(grids).toHaveCount(2);
  const detail = grids.first().locator("path").nth(1);
  await expect(detail).toHaveAttribute("fill", "none");

  // And they still cannot ADD any. That is the whole distinction.
  await page.locator('button[title="Add"]').click();
  await expect(page.getByRole("button", { name: "Maths kit" })).toHaveCount(0);
});
