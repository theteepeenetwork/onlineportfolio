import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, logout, demoClassCode } from "./helpers";

// What a child may do to the teacher's worksheet — through EVERY route, not
// just the ones the corner controls offer.
//
// `objCapabilities` has always been the answer: a template object is
// `editable: false` for the child answering it, which is why they get no ✕ and
// no toolbar on it. The right-click menu and the keyboard shortcuts are newer
// routes to the same actions, and a route that does not ask the same question
// is a way round the answer. This is the test that says they all ask.

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

async function assignTemplateWithAShape(page: Page, title: string) {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", title);
  await page.getByRole("button", { name: /Build a template/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /Save to library/ }).click();
  await page.waitForURL((u) => /^\/teacher\/activities\/[^/]+$/.test(u.pathname));
  await page.getByRole("button", { name: /Assign/ }).first().click();
  // No class is preselected; choose one before assigning (Item 5).
  await page.getByRole("button", { name: "Sunflower Class" }).click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((u) => u.searchParams.has("run"));
}

async function openAsChild(page: Page, title: string) {
  await logout(page);
  await page.goto(`/login/student?code=${await demoClassCode()}`);
  await page.getByRole("button", { name: "Finn", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/student");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.locator("canvas")).toBeVisible();
}

test("a child cannot cut, copy, duplicate or delete the teacher's worksheet", async ({ page }) => {
  await assignTemplateWithAShape(page, "Not yours to remove");
  await openAsChild(page, "Not yours to remove");

  const objects = page.locator("div[data-object]");
  await expect(objects).toHaveCount(1);
  const b = (await objects.first().boundingBox())!;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;

  // Selecting it is fine — this one is movable, so a child may arrange it.
  await page.mouse.click(cx, cy);
  // It has never offered them a ✕…
  await expect(page.getByRole("button", { name: "Remove object" })).toHaveCount(0);

  // …and the right-click menu says the same thing rather than a different one.
  await page.mouse.click(cx, cy, { button: "right" });
  for (const item of ["Cut", "Copy", "Duplicate", "Delete"]) {
    await expect(
      page.getByRole("menuitem", { name: item, exact: true }),
      `"${item}" must not be offered on the teacher's object`,
    ).toBeDisabled();
  }
  await page.keyboard.press("Escape");

  // Nor does the keyboard.
  await page.mouse.click(cx, cy);
  await page.keyboard.press("Backspace");
  await expect(objects, "Backspace must not remove the teacher's object").toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+x");
  await expect(objects, "cut must not remove the teacher's object").toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(objects, "there was nothing it was allowed to copy").toHaveCount(1);
});

test("a child's own work is still theirs to cut, copy and delete", async ({ page }) => {
  // The gate is about whose object it is, not about being a child — otherwise
  // it would take away the shortcuts on their own drawing too.
  await logout(page);
  await page.goto(`/login/student?code=${await demoClassCode()}`);
  await page.getByRole("button", { name: "Finn", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/student");
  await page.goto("/student/new/drawing");
  await expect(page.locator("canvas").first()).toBeVisible();

  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const objects = page.locator("div[data-object]");
  await expect(objects).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(objects).toHaveCount(2);
  await page.keyboard.press("Backspace");
  await expect(objects).toHaveCount(1);
});

test("a child is not offered the page structure controls", async ({ page }) => {
  // Copying and reordering pages is designing a worksheet, not filling one in.
  // Deleting a page of their OWN drawing is a separate, older permission and is
  // deliberately left alone.
  await logout(page);
  await page.goto(`/login/student?code=${await demoClassCode()}`);
  await page.getByRole("button", { name: "Finn", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/student");
  await page.goto("/student/new/drawing");
  await expect(page.locator("canvas").first()).toBeVisible();

  await expect(page.getByRole("button", { name: "Duplicate this page" })).toHaveCount(0);
  const thumb = (await page.getByRole("button", { name: "Page 1", exact: true }).boundingBox())!;
  await page.mouse.click(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2, { button: "right" });
  await expect(page.getByRole("menuitem", { name: "Move up" })).toHaveCount(0);
});
