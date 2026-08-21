import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin } from "./helpers";

// A picture of the template, for showing a teacher.
//
// The saved BACKGROUND is deliberately partial: movable pieces are left out so
// they don't appear twice when the template is reopened, and question boxes are
// never flattened at all. A template built from those alone therefore saved a
// blank white page — and a blank page is a truthy string, so every `thumb ? …`
// check passed and the library showed a white rectangle that read as "it didn't
// save". The picture is a separate thing, stored alongside.

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

async function startTemplate(page: Page, title: string) {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", title);
  await page.getByRole("button", { name: /Build a template/ }).click();
}

async function save(page: Page) {
  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /Save to library/ }).click();
  await page.waitForURL((u) => /^\/teacher\/activities\/[a-z0-9]{20,}$/.test(u.pathname), {
    timeout: 30_000,
  });
}

test("a template of pieces and questions has a picture, and it is not the background", async ({
  page,
}) => {
  const db = new PrismaClient();
  try {
    await startTemplate(page, "Pieces and questions");
    // A movable piece and a question, and no pen strokes at all — so the
    // background is a blank white page.
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.getByRole("button", { name: "Star", exact: true }).click();
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Quiz", exact: true }).click();
    const panel = page.getByRole("region", { name: "Quiz builder" });
    await panel.getByRole("button", { name: /Add question to page 1/ }).click();
    await panel.getByPlaceholder("What do you want to ask?").fill("Which shape is this?");
    await panel.getByPlaceholder("Type an answer").nth(0).fill("A star");
    await panel.getByPlaceholder("Type an answer").nth(1).fill("A circle");
    await save(page);

    const row = await db.activityTemplate.findFirst({ where: { title: "Pieces and questions" } });
    expect(row?.previewPathsJson, "a picture should have been saved").toBeTruthy();
    // The two are different files: the background is what the editor gets back,
    // the picture is what a teacher is shown.
    expect(row?.previewPathsJson).not.toBe(row?.templatePathsJson);

    // And the card actually shows it.
    await page.goto("/teacher/activities");
    const shown = JSON.parse(row!.previewPathsJson!)[0] as string;
    const img = page.locator(`img[src="${shown}"]`).first();
    await expect(img, "the library card should show the picture").toBeVisible();
    // It loads — a path this route does not recognise is a path it will not
    // serve, which showed up as a broken image.
    expect(
      await img.evaluate((el) => (el as HTMLImageElement).naturalWidth),
      "the picture has to be served, not just referenced",
    ).toBeGreaterThan(0);
  } finally {
    await db.activityTemplate.deleteMany({ where: { title: "Pieces and questions" } });
    await db.$disconnect();
  }
});

test("the background a template is reopened with stays free of the pieces", async ({ page }) => {
  // The reason the background is partial in the first place. If the pieces were
  // baked into it, reopening would show each one twice — once flat and once
  // still movable.
  const db = new PrismaClient();
  try {
    await startTemplate(page, "Still one star");
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.getByRole("button", { name: "Star", exact: true }).click();
    await save(page);

    await page.goto(`${new URL(page.url()).pathname}/edit`);
    // The builder opens on the form; the canvas comes with it.
    await page.getByRole("button", { name: /Edit template/ }).click();
    await expect(page.locator("canvas").first()).toBeVisible();
    await expect(
      page.locator('svg[data-shape="star"]'),
      "reopening should show the star once, as an object",
    ).toHaveCount(1);
  } finally {
    await db.activityTemplate.deleteMany({ where: { title: "Still one star" } });
    await db.$disconnect();
  }
});
