import { test, expect } from "@playwright/test";
import { teacherLogin, studentLogin, logout, drawOnCanvas, pageCount, openDrawing } from "./helpers";

// Sticker feedback (design 1b + 1d): the teacher opens a waiting moment on the
// sticker sheet, peels stickers onto the work with a kind note, and the child
// sees the sticker arrive in their jar and sends a heart back.
test("stickers travel from the teacher's sheet to the child's jar and back", async ({ page }) => {
  // Finn (no seeded work) draws and hands it in.
  await studentLogin(page, "Finn");
  await openDrawing(page);
  await drawOnCanvas(page);
  expect(await pageCount(page, "drawingPages")).toBeGreaterThan(0);
  await page.locator('button[title="Done"]').click();
  await page.waitForURL((url) => url.pathname === "/student/popped");

  // Teacher opens Finn's moment on the sticker sheet.
  await logout(page);
  await teacherLogin(page);
  await page.goto("/teacher/queue");
  const finnCard = page.locator('[data-child="Finn"]');
  await expect(finnCard).toBeVisible();
  await finnCard.getByRole("link", { name: /Stickers/ }).click();
  await page.waitForURL(/\/teacher\/queue\/.+/);
  await expect(page.getByRole("heading", { name: /The sticker sheet/ })).toBeVisible();

  // Peel two stickers on — one from Praise, one from Feelings (a holo).
  await page.getByRole("button", { name: "Star work" }).click();
  await expect(page.getByText("1 of 4 placed")).toBeVisible();
  await page.getByRole("button", { name: "Feelings" }).click();
  await page.getByRole("button", { name: "So proud" }).click();
  await expect(page.getByText("2 of 4 placed")).toBeVisible();

  // A kind note rides along, and the button counts the stickers.
  await page.getByPlaceholder(/A note to Finn/).fill("So proud of this, Finn!");
  await page.getByRole("button", { name: /Add to jar with 2 stickers/ }).click();

  // Back on the queue, Finn's moment has gone into the jar.
  await page.waitForURL((url) => url.pathname === "/teacher/queue");
  await expect(page.locator('[data-child="Finn"]')).toHaveCount(0);

  // Finn opens his jar: the sticker arrival panel plays, with the note.
  await logout(page);
  await studentLogin(page, "Finn");
  const panel = page.getByRole("region", { name: /A new sticker just arrived/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("“So proud of this, Finn!”")).toBeVisible();

  // He sends nothing back. A child is read-only to their teacher's feedback
  // (product decision, 2026-08-24): the panel shows what arrived and offers no
  // reply. Asserted rather than merely deleted, because a removal nothing
  // checks is a removal that comes back.
  await expect(panel.getByRole("button", { name: /back/i })).toHaveCount(0);

  // On the next visit the panel has done its job and gone. What retires it is
  // now `jarSeenAt` — "has this child looked since" — because the heart reply
  // that used to dismiss it no longer exists. Without that, a card headed "A
  // new sticker just arrived" would sit there for ever, so this assertion is
  // the one that proves the replacement works.
  await page.reload();
  await expect(page.getByRole("region", { name: /A new sticker just arrived/ })).toHaveCount(0);

  // And the payoff survives the panel: the stickers and the note live on the
  // moment card in the timeline.
  await expect(page.getByText("“So proud of this, Finn!”")).toBeVisible();
});
