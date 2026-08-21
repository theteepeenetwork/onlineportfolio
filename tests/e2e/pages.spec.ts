import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { logout, teacherLogin } from "./helpers";

// The pages strip: adding, copying and deleting the pages of a template.
//
// Copying is the one that earns its place. A teacher building ten questions on
// one layout was rebuilding that layout ten times, and everything the page
// carries has to come with it or they are finishing the copy by hand — which is
// the job the button is there to remove.

async function clearDrafts() {
  const db = new PrismaClient();
  try {
    for (let i = 0; i < 3; i++) {
      await db.draft.deleteMany({});
      if ((await db.draft.count()) === 0) break;
    }
  } finally {
    await db.$disconnect();
  }
}
test.beforeEach(clearDrafts);
test.afterEach(async ({ page }) => {
  await page.goto("about:blank");
  await clearDrafts();
});

async function builder(page: Page, title: string) {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", title);
  await page.getByRole("button", { name: /Build a template/ }).click();
}

test("a page can be copied, and the copy carries what was on it", async ({ page }) => {
  await builder(page, "Copy a page");
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Maths kit" }).click();
  await page.getByRole("button", { name: "Number line", exact: true }).click();
  // Make it distinctive, so a copy that quietly dropped the settings shows up.
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Interval: more" }).click();
  }
  await expect(page.locator('svg[data-shape="numberline"] text').last()).toHaveText("50");

  await page.getByRole("button", { name: "Duplicate this page" }).click();

  // Two pages now, and the second is the one being shown.
  await expect(page.getByRole("button", { name: "Page 2", exact: true })).toBeVisible();
  // The copy carries the object, with the numbers it was given.
  await expect(page.locator("div[data-object]")).toHaveCount(1);
  await expect(page.locator('svg[data-shape="numberline"] text').last()).toHaveText("50");

  // A copy, not the same object: deleting it must not empty the original.
  await page.locator("div[data-object]").first().click();
  await page.getByRole("button", { name: "Remove object" }).click();
  await expect(page.locator("div[data-object]")).toHaveCount(0);
  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await expect(page.locator("div[data-object]")).toHaveCount(1);
});

test("a pupil answering an activity is not offered the page controls", async ({ page }) => {
  // Deny by default (rule 8). Copying the pages of a teacher's template is not
  // a thing a child answering it gets to do, and neither is deleting them — so
  // the copy button sits behind exactly the same gate as the delete cross
  // rather than behind the one that lets a child add a page of their own.
  await builder(page, "Gated pages");
  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /Save to library/ }).click();
  await page.waitForURL((url) => /^\/teacher\/activities\/[^/]+$/.test(url.pathname));

  await page.getByRole("button", { name: /Assign/ }).first().click();
  const sunflower = page.getByRole("button", { name: /Sunflower/ });
  if (await sunflower.count()) await sunflower.first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));

  await logout(page);
  await page.goto("/login/student?code=SUN234");
  await page.getByRole("button", { name: "Ella", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Gated pages/ }).click();
  await expect(page.locator("canvas").first()).toBeVisible();

  await expect(page.getByRole("button", { name: "Duplicate this page" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete page/ })).toHaveCount(0);
});

// Reordering. A page is not one thing — it is an entry in five parallel arrays
// plus a set of quiz questions that know their page BY INDEX — so the test that
// matters is whether everything moved, not whether the thumbnails swapped.
test("a page can be moved up and down, and takes its contents with it", async ({ page }) => {
  await builder(page, "Reorder");
  // Page 1 gets a number line; page 2 gets nothing, so they are told apart by
  // what is on them rather than by their position.
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Maths kit" }).click();
  await page.getByRole("button", { name: "Number line", exact: true }).click();
  await page.locator('button[title="Add page"]').click();
  await expect(page.locator("div[data-object]")).toHaveCount(0);

  // Right-click page 2 and send it up.
  const thumb = (await page.getByRole("button", { name: "Page 2", exact: true }).boundingBox())!;
  await page.mouse.click(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2, { button: "right" });
  await expect(page.getByRole("menuitem")).toHaveText(["Duplicate page", "Move up", "Move down"]);
  await page.getByRole("menuitem", { name: "Move up" }).click();

  // The blank page is now first, and we are still looking at it.
  await expect(page.locator("div[data-object]")).toHaveCount(0);
  // The number line went with the page it was on, which is now page 2.
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await expect(page.locator('svg[data-shape="numberline"]')).toHaveCount(1);

  // The ends are guarded: page 1 cannot go up.
  const first = (await page.getByRole("button", { name: "Page 1", exact: true }).boundingBox())!;
  await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2, { button: "right" });
  await expect(page.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Move down" })).toBeEnabled();
});
