import { test, expect } from "@playwright/test";
import { teacherLogin, studentLogin, logout, drawOnCanvas, pageCount } from "./helpers";

// Use Finn, who has no seeded work, so the assertions are unambiguous.
test("a student's drawing goes through approval into their journal", async ({ page }) => {
  // Student draws on the full-screen canvas and hands it in. The Drawing tile on
  // their jar deep-links straight here — there's no tab to pick first (SJ-03).
  await studentLogin(page, "Finn");
  await page.getByRole("link", { name: "Drawing" }).click();
  await drawOnCanvas(page);
  expect(await pageCount(page, "drawingPages")).toBeGreaterThan(0);
  await page.locator('button[title="Done"]').click();
  // Celebration, then back to the jar where it now waits.
  await page.waitForURL((url) => url.pathname === "/student/popped");
  await page.getByRole("link", { name: /Back to my jar/ }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  await expect(page.getByText(/Waiting for your teacher/)).toBeVisible();

  // Teacher finds Finn's submission in the queue and approves it.
  await logout(page);
  await teacherLogin(page);
  await page.goto("/teacher/queue");
  const finnCard = page.locator('[data-child="Finn"]');
  await expect(finnCard).toBeVisible();
  await finnCard.getByRole("button", { name: /Add to jar/ }).click();
  // The row leaves the queue once approved.
  await expect(finnCard).toHaveCount(0);

  // It now shows as published in Finn's journal.
  await page.goto("/teacher");
  await page.getByRole("link", { name: /Finn/ }).click();
  await expect(page.getByText("Published")).toBeVisible();
});

// SJ-03 — a child used to tap "Photo" on their jar and land on a screen that
// asked them again, in teacher's clothes: three small tabs, a 14px text link as
// the only way back, and the caption instruction hidden in placeholder text.
// Young children navigate by landmark, so a register change mid-task reads as
// "I'm lost" and they back out.
test.describe("Adding work stays in the child's world", () => {
  test.use({ viewport: { width: 1024, height: 768 } }); // classroom iPad, landscape

  for (const [tile, path, heading] of [
    ["Photo", "/student/new/photo", /take a photo/i],
    ["My words", "/student/new/words", /my words/i],
  ] as const) {
    test(`the ${tile} tile goes straight to its capture surface`, async ({ page }) => {
      await studentLogin(page, "Finn");
      await page.getByRole("link", { name: tile, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();

      // The choice was already made on the jar — nothing here re-asks it.
      for (const tab of ["Write", "Draw"]) {
        await expect(page.getByRole("button", { name: tab, exact: true })).toHaveCount(0);
      }
    });
  }

  test("the way back is a real button a child can hit, not a 14px link", async ({ page }) => {
    await studentLogin(page, "Finn");
    await page.goto("/student/new/words");
    const back = page.getByRole("link", { name: /back to my jar/i });
    const box = (await back.boundingBox())!;
    expect(box.height, "back target (SAFEGUARDING rule 18)").toBeGreaterThanOrEqual(64);
    await back.click();
    await expect(page).toHaveURL(/\/student$/);
  });

  // The caption instruction used to live only in placeholder text, so it
  // vanished the moment a child tapped the box — taking the question away
  // exactly when they were trying to answer it.
  test("the caption keeps its instruction visible while you answer it", async ({ page }) => {
    await studentLogin(page, "Finn");
    await page.goto("/student/new/photo");
    const label = page.getByText(/tell us about your work/i);
    await expect(label).toBeVisible();
    await page.getByRole("textbox", { name: /tell us about your work/i }).fill("My tower");
    await expect(label, "the instruction must survive being answered").toBeVisible();
  });

  // Chloe, because this one SUBMITS: Dev/Ella/Finn are the "clean" children the
  // canvas specs rely on, and leaving an extra waiting moment in Finn's jar
  // breaks stickers.spec, which needs exactly one. Chloe already carries seeded
  // waiting work, so count the strips rather than asserting one is present —
  // otherwise the seed alone would pass this test.
  test("a child's words reach the jar, and wait for the teacher", async ({ page }) => {
    await studentLogin(page, "Chloe");
    const waiting = page.getByText(/Waiting for your teacher/);
    const before = await waiting.count();

    await page.getByRole("link", { name: "My words", exact: true }).click();
    await page.getByRole("textbox", { name: /write your words here/i }).fill("Today I built a rocket.");
    await page.getByRole("button", { name: /add to my jar/i }).click();
    await page.waitForURL((url) => url.pathname === "/student/popped");
    await page.getByRole("link", { name: /Back to my jar/ }).click();

    await expect(waiting, "the words moment joins the queue, it doesn't publish itself").toHaveCount(before + 1);
  });

  // A bookmarked or shared /student/new is a dead end for a child who can't
  // read an error — send them somewhere they recognise.
  test("the old add screen sends a child to their jar, not a 404", async ({ page }) => {
    await studentLogin(page, "Finn");
    await page.goto("/student/new");
    await expect(page).toHaveURL(/\/student$/);
  });
});
