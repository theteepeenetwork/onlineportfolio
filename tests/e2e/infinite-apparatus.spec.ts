import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, logout } from "./helpers";

// Endless apparatus: a teacher marks a placed counter or base-10 block as a
// source, and a child drags copies off it.
//
// This is what makes taking the maths kit away from children cost them nothing.
// They never open a place-value palette, because what they need is already on
// the worksheet — which is exactly how the physical apparatus works: a tray of
// counters on the desk, not a cupboard they have to go and find.

// These tests open the template builder, which autosaves a local-first draft.
// A draft left behind blocks the NEXT test — anywhere in the suite — with a
// restore modal that is `aria-modal` and intercepts pointer events, so the next
// click times out on something unrelated to what it was testing. That is F38,
// and it wants a shared fixture; until it has one, a test that creates the
// problem clears up on both sides of itself.
//
// Before, so a draft left by someone else cannot break these. After, so these
// cannot break anyone else — and after means navigating away first and then
// retrying, because a save already in flight can land after a single delete.
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

// One test here hands work in, which puts a PENDING item in the teacher's queue
// and a "waiting" card on the child's jar. Several OTHER specs — journal,
// stickers — are written around a child having exactly one of those, so work
// left behind here fails them somewhere else entirely, with an error that says
// nothing about this file. Picking a different child only moves the problem to
// whoever is written next, so instead this cleans up everything it created.
let startedAt = new Date(0);

test.beforeEach(async () => {
  startedAt = new Date();
  await clearDrafts();
});

test.afterEach(async ({ page }) => {
  await page.goto("about:blank");
  await clearDrafts();
  const db = new PrismaClient();
  try {
    // Scoped to this test's own window, so seeded fixtures are untouched.
    await db.journalItem.deleteMany({ where: { createdAt: { gte: startedAt } } });
  } finally {
    await db.$disconnect();
  }
});

async function buildTemplateWithSource(page: import("@playwright/test").Page, title: string) {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", title);
  await page.fill("#instructions", "Show me twenty-four.");
  await page.getByRole("button", { name: /Build a template/ }).click();

  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Maths kit" }).click();
  await page.getByRole("tab", { name: "Place value" }).click();
  await page.getByRole("button", { name: "Counter 10", exact: true }).click();

  // Make it endless. Teacher-only, and it sits beside the padlock.
  await page.getByRole("button", { name: "Endless supply off" }).click();
  await expect(page.getByRole("button", { name: "Endless supply on" })).toBeVisible();

  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /Save to library/ }).click();
  await page.waitForURL((url) => /^\/teacher\/activities\/[^/]+$/.test(url.pathname));

  await page.getByRole("button", { name: /Assign/ }).first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));
}

async function openAsChild(page: import("@playwright/test").Page, title: string) {
  await logout(page);
  await page.goto("/login/student?code=SUN234");
  // Finn, not Ella: shapes.spec.ts relies on Ella having no other waiting work,
  // and one of the tests below hands work in.
  await page.getByRole("button", { name: "Finn", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.locator("canvas")).toBeVisible();
}

test("a child drags a new counter off the source, and the source stays put", async ({ page }) => {
  await buildTemplateWithSource(page, "Endless tens");
  await openAsChild(page, "Endless tens");

  const counters = page.locator('svg[data-shape="ellipse"]');
  await expect(counters).toHaveCount(1);

  const source = counters.first().locator("xpath=ancestor::div[@data-object]");
  const before = (await source.boundingBox())!;

  // Drag the source. The point of the whole feature: this must not move it.
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 220, before.y + before.height / 2 + 120, {
    steps: 10,
  });
  await page.mouse.up();

  // There are now two, and the one the teacher placed has not moved a pixel.
  await expect(counters).toHaveCount(2);
  const after = (await source.boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);

  // The copy landed where the child dragged it, well clear of the source.
  const copy = (await counters.nth(1).locator("xpath=ancestor::div[@data-object]").boundingBox())!;
  expect(copy.x).toBeGreaterThan(before.x + 100);

  // Dragging again keeps giving: a child builds a row without a palette.
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 200, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(counters).toHaveCount(3);
});

test("the copy belongs to the child, and is not itself endless", async ({ page }) => {
  await buildTemplateWithSource(page, "Copy ownership");
  await openAsChild(page, "Copy ownership");

  const counters = page.locator('svg[data-shape="ellipse"]');
  const source = counters.first().locator("xpath=ancestor::div[@data-object]");
  const box = (await source.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await expect(counters).toHaveCount(2);

  // A copy arrives unselected — its toolbar would otherwise cover the source
  // and block the next drag — so tap it, the way a child would.
  const copyWrap = counters.nth(1).locator("xpath=ancestor::div[@data-object]");
  await copyWrap.click();

  // The copy is the child's own work: they can delete it, which they could not
  // do to anything belonging to the template.
  await expect(page.getByRole("button", { name: "Remove object" })).toBeVisible();

  // And dragging the copy MOVES it rather than breeding a third — endlessness
  // does not come along with the copy, or a child would flood the page.
  const cb = (await copyWrap.boundingBox())!;
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 - 90, cb.y + cb.height / 2, { steps: 6 });
  await page.mouse.up();

  await expect(counters).toHaveCount(2);
  expect((await copyWrap.boundingBox())!.x).toBeLessThan(cb.x - 40);
});

test("the source is part of the worksheet, so it lands in the hand-in", async ({ page }) => {
  await buildTemplateWithSource(page, "Source in handin");
  await openAsChild(page, "Source in handin");

  const counters = page.locator('svg[data-shape="ellipse"]');
  const box = (await counters.first().locator("xpath=ancestor::div[@data-object]").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2 + 90, { steps: 8 });
  await page.mouse.up();
  await expect(counters).toHaveCount(2);

  // Nothing disappears at hand-in time. The dispenser is a printed strip of
  // counters down the side of the page, not a tool that vanishes.
  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /hand it in/i }).click();
  await page.waitForURL((url) => url.pathname === "/student/popped");
});
