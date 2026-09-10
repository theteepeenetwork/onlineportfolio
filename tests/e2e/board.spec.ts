import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { teacherLogin } from "./helpers";

// ===========================================================================
// Show work on the board (teacher feedback, item 3; SAFEGUARDING rule 25).
//
// The teacher picks, then shows. What these tests hold the product to, in the
// rule's own order:
//   - work waiting in the queue can be picked only once it has been opened;
//     work in a jar can be picked straight away; work sent back is not offered;
//   - the board covers the whole screen, corner to corner;
//   - "Hide names" takes the name off the screen AND out of the alt text;
//   - arrows step, Escape closes;
//   - the picks live in the page and nowhere else — a reload forgets them;
//   - showing changes no status.
//
// IT BUILDS ITS OWN CLASS and its own picture files, so every piece's status is
// this file's and nothing else's.
// ===========================================================================

const db = new PrismaClient();
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), ".media");

const TITLE = "Seaside sketch (board)";
const svg = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><circle cx="200" cy="150" r="80" fill="${fill}"/></svg>`;

let classId = "";
let templateId = "";
let runId = "";
const itemIds: Record<string, string> = {};

test.beforeAll(async () => {
  mkdirSync(MEDIA_DIR, { recursive: true });
  const file = (name: string, fill: string) => {
    writeFileSync(path.join(MEDIA_DIR, name), svg(fill));
    return `/uploads/${name}`;
  };
  const stamp = Date.now();
  const teacher = await db.teacher.findFirstOrThrow({ where: { email: "teacher@school.uk" } });
  const klass = await db.class.create({
    data: { name: "Gull Class (board)", ageMode: "KS1", classCode: `BRD${String(stamp).slice(-3)}`, teacherId: teacher.id, schoolId: teacher.schoolId },
  });
  classId = klass.id;
  const [ada, bo, cy, di] = await Promise.all(
    ["Ada", "Bo", "Cy", "Di"].map((name) => db.student.create({ data: { name, classId: klass.id } })),
  );
  const template = await db.activityTemplate.create({ data: { title: TITLE, teacherId: teacher.id } });
  templateId = template.id;
  runId = (
    await db.assignment.create({ data: { templateId: template.id, classId: klass.id, wholeClass: true, status: "LIVE", title: TITLE } })
  ).id;
  const base = { authorRole: "STUDENT", classId: klass.id, assignmentId: runId };
  itemIds.Ada = (
    await db.journalItem.create({
      data: { ...base, type: "DRAWING", status: "APPROVED", approvedAt: new Date(), studentId: ada.id, mediaPath: file(`board-ada-${stamp}.svg`, "#f59e0b"), caption: "Ada's secret caption zq", quizScore: 7, quizTotal: 9, praiseNote: "Lovely waves zq" },
    })
  ).id;
  itemIds.Bo = (
    await db.journalItem.create({
      data: {
        ...base,
        type: "DRAWING",
        status: "PENDING",
        studentId: bo.id,
        mediaPath: file(`board-bo1-${stamp}.svg`, "#3b82f6"),
        mediaPathsJson: JSON.stringify([file(`board-bo1b-${stamp}.svg`, "#3b82f6"), file(`board-bo2-${stamp}.svg`, "#10b981")]),
      },
    })
  ).id;
  itemIds.Cy = (
    await db.journalItem.create({
      data: { ...base, type: "DRAWING", status: "RETURNED", studentId: cy.id, mediaPath: file(`board-cy-${stamp}.svg`, "#ef4444"), teacherNote: "Add a boat zq" },
    })
  ).id;
  // Words, not a picture: nothing to put on a board.
  itemIds.Di = (await db.journalItem.create({ data: { ...base, type: "TEXT", status: "PENDING", studentId: di.id, textContent: "The sea is loud." } })).id;
});

test.afterAll(async () => {
  await db.assignment.deleteMany({ where: { templateId } });
  await db.class.deleteMany({ where: { id: classId } });
  await db.activityTemplate.deleteMany({ where: { id: templateId } });
  await db.$disconnect();
});

const board = (page: Page) => page.getByRole("dialog", { name: "Work on the board" });
const piece = (page: Page, name: string) => page.locator(`li[data-board-piece="${name}"]`);
const tick = (page: Page, name: string) => piece(page, name).getByRole("checkbox", { name: "Add to the board" });

async function openRun(page: Page) {
  await teacherLogin(page);
  await page.goto(`/teacher/activities/runs/${runId}`);
  await expect(page.getByRole("heading", { name: /on the board/i })).toBeVisible();
}

test("what can be picked follows the status: jar yes, waiting once opened, sent back never", async ({ page }) => {
  await openRun(page);

  // Offered: the two pictures that are in a jar or waiting. Not offered: the
  // sent-back one, or words.
  await expect(page.locator("li[data-board-piece]")).toHaveCount(2);
  await expect(piece(page, "Cy")).toHaveCount(0);
  await expect(piece(page, "Di")).toHaveCount(0);

  await expect(tick(page, "Ada"), "in a jar: pickable straight away").toBeEnabled();
  await expect(tick(page, "Bo"), "waiting: not until the teacher has looked").toBeDisabled();
  await expect(piece(page, "Bo")).toContainText("Open it first");

  // Open Bo's work full size; the viewer offers the tick.
  await page.getByRole("button", { name: "Open Bo's work" }).click();
  const viewer = page.getByRole("dialog", { name: "Bo's work" });
  await expect(viewer).toBeVisible();
  await viewer.getByRole("checkbox", { name: "Add to the board" }).check();
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(tick(page, "Bo")).toBeEnabled();
  await expect(tick(page, "Bo")).toBeChecked();

  await tick(page, "Ada").check();
  await expect(page.getByRole("button", { name: /Show on the board \(2\)/ })).toBeEnabled();
});

test("the board covers the screen, steps with the arrows, hides names from the alt text too, and closes on Escape", async ({ page }) => {
  await openRun(page);
  await tick(page, "Ada").check();
  await page.getByRole("button", { name: "Open Bo's work" }).click();
  await page.getByRole("dialog", { name: "Bo's work" }).getByRole("checkbox", { name: "Add to the board" }).check();
  await page.getByRole("dialog", { name: "Bo's work" }).getByRole("button", { name: "Close" }).click();

  const show = page.getByRole("button", { name: /Show on the board/ });
  await show.click();
  await expect(board(page)).toBeVisible();

  // Opaque and full screen: every corner and the middle of the viewport is the
  // board, so nothing of the run page — its pupil names, who has not handed in
  // — can be read round the edges on a projector.
  const covered = await page.evaluate(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const points = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2], [w / 2, h / 2]];
    return points.map(([x, y]) => !!document.elementFromPoint(x, y)?.closest("[data-board]"));
  });
  expect(covered).toEqual([true, true, true, true, true]);
  const bg = await board(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg, "opaque, not dimmed").not.toMatch(/rgba\(.*,\s*0(\.\d+)?\)$/);

  const label = board(page).locator("[data-board-label]");
  const img = board(page).getByRole("img");
  await expect(label).toHaveText("Ada");
  await expect(img).toHaveAttribute("alt", "Ada's work");

  await page.keyboard.press("ArrowRight");
  await expect(label).toHaveText("Bo · page 1 of 2");
  await page.keyboard.press("ArrowRight");
  await expect(label).toHaveText("Bo · page 2 of 2");
  await expect(img).toHaveAttribute("alt", "Bo's work, page 2 of 2");
  await page.keyboard.press("ArrowRight"); // the last slide stays put
  await expect(label).toHaveText("Bo · page 2 of 2");
  await page.keyboard.press("ArrowLeft");
  await expect(label).toHaveText("Bo · page 1 of 2");

  // Hide names: off the screen and out of the alt text.
  const hide = board(page).getByRole("switch", { name: "Hide names" });
  await hide.click();
  await expect(hide).toHaveAttribute("aria-checked", "true");
  await expect(label).toHaveText("page 1 of 2");
  const alt = await img.getAttribute("alt");
  expect(alt).not.toContain("Bo");
  expect(alt).not.toContain("Ada");
  await expect(board(page)).not.toContainText("Bo");

  // The 64px floor on the board's controls.
  for (const name of ["Previous", "Next", "Done"]) {
    const box = await board(page).getByRole("button", { name, exact: true }).boundingBox();
    expect(box!.height, `${name} is big enough to hit from across a room`).toBeGreaterThanOrEqual(64);
  }

  await page.keyboard.press("Escape");
  await expect(board(page)).toHaveCount(0);
  await expect(show).toBeFocused();
});

test("the picks are kept nowhere: a reload forgets them, and no status changed", async ({ page }) => {
  await openRun(page);
  // The server is not told that anything was picked or shown: from the first
  // tick to the board closing, the page sends nothing but reads.
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") sent.push(`${r.method()} ${r.url()}`);
  });
  await tick(page, "Ada").check();
  await page.getByRole("button", { name: /Show on the board \(1\)/ }).click();
  await expect(board(page)).toBeVisible();
  await board(page).getByRole("switch", { name: "Hide names" }).click();
  await page.keyboard.press("Escape");
  await expect(board(page)).toHaveCount(0);
  expect(sent, "picking and showing must not reach the server").toEqual([]);

  // Nothing in the address, nothing in storage.
  expect(new URL(page.url()).search).toBe("");
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  const beforeReload = stored;

  await page.reload();
  await expect(page.getByRole("button", { name: /Show on the board \(0\)/ })).toBeDisabled();
  await expect(tick(page, "Ada")).not.toBeChecked();
  // Storage did not grow by showing anything (it may hold unrelated keys).
  const after = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  expect(after).toEqual(beforeReload);

  // Showing is not approving, returning or anything else.
  const rows = await db.journalItem.findMany({ where: { id: { in: Object.values(itemIds) } }, select: { id: true, status: true } });
  const status = Object.fromEntries(rows.map((r) => [r.id, r.status]));
  expect(status[itemIds.Ada]).toBe("APPROVED");
  expect(status[itemIds.Bo]).toBe("PENDING");
  expect(status[itemIds.Cy]).toBe("RETURNED");
  expect(status[itemIds.Di]).toBe("PENDING");
});
