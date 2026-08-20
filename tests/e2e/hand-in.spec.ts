import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, studentLogin, logout } from "./helpers";

// Handing in is the end of the work, so it waits until the work is done.
//
// Two things used to be skippable with one tap of the ✓: pages a child had
// never turned to, and questions they had not answered. Neither is refused
// silently — the ✓ takes them TO the thing, because a child who cannot hand in
// and is not told why has been stopped rather than helped.

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

// A two-page activity with one question, on page 2.
async function assignTwoPager(page: Page, title: string) {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", title);
  await page.getByRole("button", { name: /Build a template/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  const panel = page.getByRole("region", { name: "Quiz builder" });
  await page.locator('button[title="Add page"]').click();
  await panel.getByRole("button", { name: /Add question to page 2/ }).click();
  await panel.getByPlaceholder("What do you want to ask?").fill("How many legs has a spider?");
  await panel.getByPlaceholder("Type an answer").nth(0).fill("Four");
  await panel.getByPlaceholder("Type an answer").nth(1).fill("Eight");
  await panel.getByRole("button", { name: /Mark .* as correct/ }).nth(1).click();
  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /Save to library/ }).click();
  await page.getByRole("button", { name: /Assign/ }).first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((u) => u.searchParams.has("run"));
  return new URL(page.url()).searchParams.get("run")!;
}

async function openAsChild(page: Page, title: string) {
  await logout(page);
  await studentLogin(page, "Amara");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.locator("canvas").first()).toBeVisible();
}

test("a child is walked through the pages before they can hand in", async ({ page }) => {
  const db = new PrismaClient();
  const runId = await assignTwoPager(page, "Two pager");
  try {
    await openAsChild(page, "Two pager");

    // Page 1 of 2: the button moves them ON rather than offering to finish.
    const go = page.getByRole("button", { name: "Next page" });
    await expect(go, "a child on page 1 of 2 should be offered Next, not Done").toBeVisible();
    await expect(page.getByRole("button", { name: "Done" })).toHaveCount(0);

    await go.click();
    // Page 2 of 2 is the end, so now it is a hand-in.
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next page" })).toHaveCount(0);
  } finally {
    await db.journalItem.deleteMany({ where: { assignmentId: runId } });
    await db.$disconnect();
  }
});

test("handing in waits for every question, and says which one", async ({ page }) => {
  const db = new PrismaClient();
  const runId = await assignTwoPager(page, "Answer first");
  try {
    await openAsChild(page, "Answer first");
    await page.getByRole("button", { name: "Next page" }).click();

    // The question on this page is untouched, so the ✓ does not hand in.
    await page.getByRole("button", { name: "Done" }).click();
    const told = page.getByText("There's still a question to answer");
    await expect(told).toBeVisible();
    await expect(page.getByRole("button", { name: /hand it in/i })).toHaveCount(0);

    // And it can be READ.
    //
    // `toBeVisible()` cannot tell: it passed the whole time this message was
    // white text on a background that was never painted, because the class
    // carrying the colour (`bg-amber-500`) is used nowhere else in the app and
    // so was never generated into the stylesheet. A child stuck on the one
    // screen that stops them was shown an empty pill. Assert the two things
    // that were actually wrong — an opaque background, and enough contrast
    // against it (WCAG 2.2 AA, 4.5:1).
    const ink = await told.evaluate((el) => {
      const s = getComputedStyle(el);
      const rgb = (v: string) => (v.match(/[\d.]+/g) ?? []).map(Number);
      return { color: rgb(s.color), background: rgb(s.backgroundColor) };
    });
    expect(ink.background[3] ?? 1, "the message has a background of its own").toBe(1);
    const lum = ([r, g, b]: number[]) => {
      const c = [r, g, b].map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const [hi, lo] = [lum(ink.color), lum(ink.background)].sort((a, b) => b - a);
    expect((hi + 0.05) / (lo + 0.05), "readable against it").toBeGreaterThanOrEqual(4.5);

    // Answer it and the same button finishes the job.
    await page.getByRole("button", { name: "Eight" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: /hand it in/i })).toBeVisible();
  } finally {
    await db.journalItem.deleteMany({ where: { assignmentId: runId } });
    await db.$disconnect();
  }
});

test("coming back to unfinished work starts at the first page", async ({ page }) => {
  const db = new PrismaClient();
  const runId = await assignTwoPager(page, "Come back");
  try {
    await openAsChild(page, "Come back");
    // Get to page 2 and leave from there.
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    // Give the local draft a moment to be written before walking away.
    await page.waitForTimeout(1500);

    await openAsChild(page, "Come back");
    const restore = page.getByRole("button", { name: /Restore|Carry on|Yes/ }).first();
    if (await restore.count()) await restore.click();

    // Back at the beginning: a child who left off on page 2 has no idea what is
    // on page 1 until they look, and starting there is what the Next flow walks
    // them through.
    await expect(
      page.getByRole("button", { name: "Next page" }),
      "reopening should land on page 1, where the button is still Next",
    ).toBeVisible();
  } finally {
    await db.journalItem.deleteMany({ where: { assignmentId: runId } });
    await db.$disconnect();
  }
});
