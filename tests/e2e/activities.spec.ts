import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, studentLogin, logout, drawOnCanvas } from "./helpers";

// The full library flow: create a reusable template, assign it as a run, a child
// responds on the template, and the teacher sees the run's response.
test("teacher creates a template, assigns it, a child responds, teacher sees the run", async ({
  page,
}) => {
  // --- Create a template (title, instructions, tag, PDF template canvas) ---
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Count worksheet");
  await page.fill("#instructions", "Circle how many apples.");
  await page.fill("#tags", "Maths");

  await page.getByRole("button", { name: /Build a template/ }).click();
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/worksheet.pdf");
  await expect
    .poll(async () => (await page.locator('input[name="__templateEditor"]').inputValue()).length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(10_000);
  await page.locator('button[title="Done"]').click();
  await expect(page.locator('img[alt^="Template page"]').first()).toBeVisible();

  await page.getByRole("button", { name: /Save to library/ }).click();
  // Lands on the template detail page.
  await page.waitForURL((url) => /^\/teacher\/activities\/[^/]+$/.test(url.pathname));
  await expect(page.getByRole("heading", { name: "Count worksheet" })).toBeVisible();
  const templatePath = new URL(page.url()).pathname;

  // --- Assign it to the whole class (a new run) ---
  await page.getByRole("button", { name: /Assign/ }).first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));
  await expect(page.getByText(/whole class/).first()).toBeVisible();

  // --- Child opens the run: the template must be on their canvas ---
  await logout(page);
  await studentLogin(page, "Amara");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Count worksheet/ }).click();
  await expect(page.getByText("Circle how many apples.")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(async () => (await page.locator('input[name="drawingPages"]').inputValue()).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(10_000);

  await drawOnCanvas(page);
  await page.locator('button[title="Done"]').click();
  // A child must confirm before the work is handed in (no accidental submit).
  await page.getByRole("button", { name: /hand it in/i }).click();
  // Handing in a response shows the "Popped in!" celebration too.
  await page.waitForURL((url) => url.pathname === "/student/popped");

  // --- Teacher sees the response on the run ---
  await logout(page);
  await teacherLogin(page);
  await page.goto(templatePath);
  await expect(page.getByText(/1 waiting/).first()).toBeVisible();
  // Amara's tile shows in the response grid as waiting for approval.
  await expect(page.getByText("Amara")).toBeVisible();
});

// Editing a template must reopen it in the builder AND push the change onto any
// class already working on it (the live-run propagation, not the old snapshot).
test("editing an activity updates its title and pushes the change onto a live run", async ({
  page,
}) => {
  await teacherLogin(page);

  // A simple template (no canvas needed for this flow).
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Weather chart");
  await page.fill("#instructions", "Draw today's weather.");
  await page.getByRole("button", { name: /Save to library/ }).click();
  // Wait for the detail page proper (the heading), then capture its path — the
  // "…/[id]" pattern also matches "…/new", so don't trust the URL alone.
  await expect(page.getByRole("heading", { name: "Weather chart" })).toBeVisible();
  const templatePath = new URL(page.url()).pathname;

  // Assign to the whole class → a LIVE run that snapshots the current wording.
  await page.getByRole("button", { name: /Assign/ }).first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));

  // Edit via the 3-dot menu → change the title + instructions.
  await page.goto(templatePath);
  await page.getByRole("button", { name: /More actions/ }).click();
  await page.getByRole("menuitem", { name: /Edit activity/ }).click();
  await page.waitForURL((url) => /\/edit$/.test(url.pathname));
  await page.fill("#title", "Weather chart (updated)");
  await page.fill("#instructions", "Draw and label today's weather.");
  await page.getByRole("button", { name: /Save changes/ }).click();
  await page.waitForURL((url) => new URL(url).pathname === templatePath);
  await expect(page.getByRole("heading", { name: "Weather chart (updated)" })).toBeVisible();

  // The child on the already-live run sees the updated wording.
  await logout(page);
  await studentLogin(page, "Amara");
  await page.goto("/student/activities");
  await expect(page.getByRole("link", { name: /Weather chart \(updated\)/ })).toBeVisible();
  await expect(page.getByText("Draw and label today's weather.")).toBeVisible();
});

test("the folders sidebar filters the activity library", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities");

  // Seed files "Count the apples" under Maths & number, "Minibeast hunt" under
  // Autumn term, and leaves "Draw your family" unfiled.
  await expect(page.getByRole("link", { name: "Count the apples" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Draw your family" })).toBeVisible();

  // Pick the Maths & number folder → only its template remains.
  await page.getByRole("button", { name: /Maths & number/ }).click();
  await expect(page.getByRole("heading", { name: "Maths & number" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Count the apples" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Draw your family" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Minibeast hunt" })).toHaveCount(0);
});

test("the 3-dot menu opens above the cards and can move a template into a folder", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities");

  // Open the unfiled template's actions menu (the overlay, not clipped).
  await page.getByRole("button", { name: "More actions for Draw your family" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Edit activity/ })).toBeVisible();

  // Move it into "Maths & number".
  await menu.getByRole("menuitem", { name: /Move to folder/ }).click();
  await menu.getByRole("menuitem", { name: /Maths & number/ }).click();

  // It now shows under that folder alongside the seeded one.
  await page.getByRole("button", { name: /Maths & number/ }).first().click();
  await expect(page.getByRole("link", { name: "Draw your family" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Count the apples" })).toBeVisible();
});

// One activity, one picture, on every screen that offers it.
//
// The teacher's library card showed the worksheet — a photograph with the
// question drawn on it. The child being asked to answer that question saw a
// striped placeholder and a generic icon. Same activity, unrecognisable from
// one screen to the next, which is exactly the "is this the right one?" moment
// a picture exists to answer.
test("a child's activity card shows the same picture as the teacher's library card", async ({
  page,
}) => {
  const db = new PrismaClient();
  try {
    await teacherLogin(page);
    await page.goto("/teacher/activities/new");
    await page.fill("#title", "Where in the world");
    await page.getByRole("button", { name: /Build a template or quiz/ }).click();
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Quiz", exact: true }).click();
    const panel = page.getByRole("region", { name: "Quiz builder" });
    await panel.getByRole("button", { name: /Add question to page 1/ }).click();
    await panel.getByPlaceholder("What do you want to ask?").fill("Where is this?");
    await panel.getByPlaceholder("Type an answer").nth(0).fill("London");
    await panel.getByPlaceholder("Type an answer").nth(1).fill("Paris");
    await page.locator('button[title="Done"]').click();
    await page.getByRole("button", { name: /Save to library/ }).click();
    await expect(page.getByRole("heading", { name: "Where in the world" })).toBeVisible();

    await page.getByRole("button", { name: /Assign/ }).first().click();
    await page.getByRole("button", { name: /Assign to whole class/ }).click();
    await page.waitForURL((url) => url.searchParams.has("run"));

    // The run carries the picture, and it is the template's own.
    const run = (await db.assignment.findFirst({
      where: { title: "Where in the world" },
      orderBy: { createdAt: "desc" },
      include: { template: { select: { previewPathsJson: true } } },
    }))!;
    expect(run.previewSnapshotJson, "the run was given a picture").toBeTruthy();
    expect(run.previewSnapshotJson).toBe(run.template.previewPathsJson);
    const shot = (JSON.parse(run.previewSnapshotJson!) as string[])[0];

    // --- The child ---
    await logout(page);
    await studentLogin(page, "Ben");
    await page.goto("/student");
    const card = page.getByRole("link", { name: /Where in the world/ }).first();
    const img = card.locator(`img[src="${shot}"]`).first();
    await expect(img, "the child's card shows the activity, not a placeholder").toBeVisible();

    // And it LOADS. /uploads authorises by column and grants a child only the
    // material of a run they were actually set — a new column it does not
    // recognise is served to nobody, which is how a stored picture arrives as a
    // broken image.
    await expect
      .poll(async () => img.evaluate((i: HTMLImageElement) => i.naturalWidth))
      .toBeGreaterThan(0);

    // The list of activities shows it too, not only the jar's tile.
    await page.goto("/student/activities");
    await expect(page.locator(`img[src="${shot}"]`).first()).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

// Renaming an activity must not delete its worksheet.
//
// The regression this guards is data loss, and it was found in the wild: an
// activity built through the connector came back with six questions and ZERO
// pages. The cause was not the connector. The editor seeds its hidden
// `templatePages` field with the pages already saved — `/uploads/<file>` paths —
// and the canvas is not mounted until the teacher presses "Edit template & quiz".
// `parsePages` kept `data:image` entries ONLY, so a save that never opened the
// canvas submitted nothing it would accept, `templatePathsJson` was written NULL,
// and the worksheet was gone. updateTemplate pushes the same value onto LIVE
// runs, so it also went from under any class working on it at that moment.
test("renaming an activity keeps its pages, even without opening the canvas", async ({ page }) => {
  await teacherLogin(page);

  // "Minibeast hunt" is seeded with two template pages (prisma/seed.ts).
  await page.goto("/teacher/activities");
  await page.getByRole("link", { name: /Minibeast hunt/ }).first().click();
  await page.waitForURL(/\/teacher\/activities\/[a-z0-9]+$/);
  const activityUrl = page.url();

  const pagesBefore = await page.locator("main img").count();
  expect(pagesBefore, "the seeded activity has pages to lose").toBeGreaterThan(0);

  // Change ONLY the title, and never open the canvas — the shape of the bug.
  await page.goto(`${activityUrl}/edit`);
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.locator('input[name="title"]').fill("Minibeast hunt (renamed)");
  await page.getByRole("button", { name: /Save changes/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/edit"));

  // The pages are still there.
  await page.goto(activityUrl);
  await expect(page.getByRole("heading", { name: "Minibeast hunt (renamed)" })).toBeVisible();
  expect(await page.locator("main img").count(), "the worksheet survived the rename").toBe(pagesBefore);
});
