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
//   - work waiting in the queue can be picked only once it has been opened,
//     and its picture is not even drawn in the list until then, because the
//     run page may already be on the projector; work in a jar can be picked
//     straight away; work sent back is not offered;
//   - a quiz hand-in is offered on those same terms and goes up as its
//     picture, the child's chosen answers and nothing else: never a score, a
//     total or which answer was right (owner decision, 10 September 2026);
//   - the board covers the whole screen, corner to corner, and while it is up
//     the page behind it is inert, so Tab cannot reach the pupil list;
//   - "Hide names" takes the name off the screen AND out of the alt text;
//   - arrows step, Escape closes;
//   - the picks live in the page and nowhere else — a reload forgets them;
//   - showing changes no status;
//   - a look is of the work as it was: a hand-in sent back and handed in again
//     keeps its id, so when the page refreshes under the picks the new attempt
//     is unseen work again — no thumbnail, no tick, not on the board — and one
//     sent back drops off altogether.
//
// IT BUILDS ITS OWN CLASS and its own picture files, so every piece's status is
// this file's and nothing else's.
// ===========================================================================

const db = new PrismaClient();
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), ".media");

const TITLE = "Seaside sketch (board)";
const svg = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><circle cx="200" cy="150" r="80" fill="${fill}"/></svg>`;
// Eli's quiz picture: a stand-in for what drawQuizForPreview draws — a question
// box with its options, one of them filled in as chosen. The real renderer is
// the canvas's; this file only needs a picture that is visibly not Eli's work
// of record, so the test can tell which one the board put up.
const quizSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#FFFDF7"/>` +
  `<rect x="40" y="30" width="320" height="240" rx="18" fill="#FFFDF7" stroke="#22304A" stroke-width="3"/>` +
  `<text x="200" y="70" text-anchor="middle" font-size="20" fill="#22304A">Which shell is biggest?</text>` +
  `<rect x="60" y="95" width="280" height="44" rx="22" fill="#FFFDF7" stroke="#E4DCC8" stroke-width="2"/>` +
  `<rect x="60" y="150" width="280" height="44" rx="22" fill="#FBEED3" stroke="#22304A" stroke-width="2"/>` +
  `<circle cx="80" cy="172" r="10" fill="#BD3F63" stroke="#22304A" stroke-width="2"/>` +
  `<rect x="60" y="205" width="280" height="44" rx="22" fill="#FFFDF7" stroke="#E4DCC8" stroke-width="2"/></svg>`;

// Eli's quiz mark, which must never be on the board or in the viewer.
const ELI_SCORE = 17;
const ELI_TOTAL = 19;

let classId = "";
let templateId = "";
let runId = "";
const itemIds: Record<string, string> = {};

test.beforeAll(async () => {
  mkdirSync(MEDIA_DIR, { recursive: true });
  const file = (name: string, fill: string, body = svg(fill)) => {
    writeFileSync(path.join(MEDIA_DIR, name), body);
    return `/uploads/${name}`;
  };
  const stamp = Date.now();
  const teacher = await db.teacher.findFirstOrThrow({ where: { email: "teacher@school.uk" } });
  const klass = await db.class.create({
    data: { name: "Gull Class (board)", ageMode: "KS1", classCode: `BRD${String(stamp).slice(-3)}`, teacherId: teacher.id, schoolId: teacher.schoolId },
  });
  classId = klass.id;
  const [ada, bo, cy, di, eli] = await Promise.all(
    ["Ada", "Bo", "Cy", "Di", "Eli"].map((name) => db.student.create({ data: { name, classId: klass.id } })),
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
  // A quiz hand-in, WAITING, stored as createJournalItem stores one: the work of
  // record, the picture of the page with the question boxes and the chosen
  // answer on it, the server's score and total, and the answers as ids. The
  // score and total are numbers the board has no other reason to print.
  itemIds.Eli = (
    await db.journalItem.create({
      data: {
        ...base,
        type: "DRAWING",
        status: "PENDING",
        studentId: eli.id,
        mediaPath: file(`board-eli-${stamp}.svg`, "#a855f7"),
        previewPathsJson: JSON.stringify([file(`board-eli-preview-${stamp}.svg`, "", quizSvg())]),
        quizScore: ELI_SCORE,
        quizTotal: ELI_TOTAL,
        quizAnswersJson: JSON.stringify([{ questionId: "q1", selectedOptionId: "o2" }]),
      },
    })
  ).id;
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

// `fetched`, when given, collects every URL the RUN PAGE asks for — attached
// after sign-in, because the teacher's dashboard shows their own class's jar
// and is entitled to fetch pictures this page is not.
async function openRun(page: Page, fetched?: string[]) {
  await teacherLogin(page);
  if (fetched) page.on("request", (r) => fetched.push(r.url()));
  await page.goto(`/teacher/activities/runs/${runId}`);
  await expect(page.getByRole("heading", { name: /on the board/i })).toBeVisible();
}

test("what can be picked follows the status: jar yes, waiting once opened, sent back never", async ({ page }) => {
  // Every picture the page asks for, so that "not drawn" can be proved by the
  // request never being made, not only by the element being absent.
  const fetched: string[] = [];
  await openRun(page, fetched);

  // Offered: the three pictures that are in a jar or waiting, a quiz hand-in
  // among them. Not offered: the sent-back one, or words.
  await expect(page.locator("li[data-board-piece]")).toHaveCount(3);
  await expect(piece(page, "Cy")).toHaveCount(0);
  await expect(piece(page, "Di")).toHaveCount(0);

  await expect(tick(page, "Ada"), "in a jar: pickable straight away").toBeEnabled();
  await expect(tick(page, "Bo"), "waiting: not until the teacher has looked").toBeDisabled();
  await expect(piece(page, "Bo")).toContainText("Open it first");
  // Opening a waiting piece shows it full size, so with waiting work on the
  // list the teacher is told to do the looking before the page is projected.
  await expect(page.locator("[data-board-look-first]")).toHaveText("Open waiting work before this page is on the projector.");

  // The run page may already be on the projector, so a waiting piece's
  // picture is not drawn in the list until the teacher has opened it: a
  // placeholder stands in, and the browser has not even asked for the file.
  // Ada's, in a jar, is drawn.
  await expect(piece(page, "Ada").locator("img")).toHaveCount(1);
  await expect(piece(page, "Bo").locator("img"), "no thumbnail of unseen work").toHaveCount(0);
  await expect(piece(page, "Bo").locator("[data-board-unseen]")).toHaveText("Waiting for you — open it to look");
  expect(fetched.some((u) => u.includes("board-bo")), "Bo's picture has not been fetched before it is opened").toBe(false);

  // Open Bo's work full size; the viewer offers the tick.
  await page.getByRole("button", { name: "Open Bo's work" }).click();
  const viewer = page.getByRole("dialog", { name: "Bo's work" });
  await expect(viewer).toBeVisible();
  await viewer.getByRole("checkbox", { name: "Add to the board" }).check();
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(tick(page, "Bo")).toBeEnabled();
  await expect(tick(page, "Bo")).toBeChecked();
  // Looked at now, so its thumbnail is drawn.
  await expect(piece(page, "Bo").locator("[data-board-unseen]")).toHaveCount(0);
  await expect(piece(page, "Bo").locator("img")).toHaveCount(1);

  await tick(page, "Ada").check();
  await expect(page.getByRole("button", { name: /Show on the board \(2\)/ })).toBeEnabled();
});

test("a waiting quiz hand-in can be picked once opened, and goes up as its picture with no score", async ({ page }) => {
  const fetched: string[] = [];
  await openRun(page, fetched);

  // Waiting, so exactly as Bo: a placeholder, no tick, and its picture not
  // fetched before the teacher has looked.
  await expect(piece(page, "Eli")).toHaveAttribute("data-status", "PENDING");
  await expect(tick(page, "Eli"), "waiting: not until the teacher has looked").toBeDisabled();
  await expect(piece(page, "Eli").locator("img"), "no thumbnail of an unseen quiz").toHaveCount(0);
  expect(fetched.some((u) => u.includes("board-eli")), "Eli's picture has not been fetched before it is opened").toBe(false);

  // Opened full size: the picture of the page with the chosen answer on it,
  // and nothing about the mark. This page may be the one on the projector.
  await page.getByRole("button", { name: /^Open Eli's work/ }).click();
  const viewer = page.getByRole("dialog", { name: "Eli's work" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("img").first()).toHaveAttribute("src", /board-eli-preview-/);
  await expect(viewer).not.toContainText(String(ELI_SCORE));
  await expect(viewer).not.toContainText(String(ELI_TOTAL));
  await viewer.getByRole("checkbox", { name: "Add to the board" }).check();
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(tick(page, "Eli")).toBeEnabled();
  await expect(tick(page, "Eli")).toBeChecked();

  // On the board: the picture, not the work of record, with Eli's name and
  // no score, no total, and no word about right or wrong.
  await page.getByRole("button", { name: /Show on the board \(1\)/ }).click();
  await expect(board(page)).toBeVisible();
  const img = board(page).getByRole("img");
  await expect(img).toHaveAttribute("src", /board-eli-preview-/);
  await expect(img).toHaveAttribute("alt", "Eli's work");
  await expect(board(page).locator("[data-board-label]")).toHaveText("Eli");
  const words = (await board(page).innerText()).replace(/\s+/g, " ").trim();
  expect(words, "the board says whose it is and where you are, and nothing else").toBe("‹ Eli 1 of 1 › Hide names Done");
  for (const n of [ELI_SCORE, ELI_TOTAL]) expect(words).not.toContain(String(n));
  await page.keyboard.press("Escape");
  await expect(board(page)).toHaveCount(0);
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

  // Opaque to the eye is not opaque to the keyboard. While the board is up the
  // page behind it is inert: the pupil list and the picks are under an inert
  // ancestor, and Tab, however far it goes, lands on the board or on nothing,
  // never on a pupil's name.
  await expect(board(page).getByRole("button", { name: "Done" })).toBeFocused();
  const behind = await page.evaluate(() =>
    [document.querySelector('ul[aria-label^="Pupils set"]'), document.querySelector('ul[aria-label="Work you could show"]')].map(
      (el) => !!el && !!el.closest("[inert]"),
    ),
  );
  expect(behind, "the pupil list and the picks are inert behind the board").toEqual([true, true]);
  expect(await board(page).evaluate((el) => !!el.closest("[inert]")), "the board itself is not").toBe(false);
  for (let n = 0; n < 8; n++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return "nothing";
      return a.closest("[data-board]") ? "board" : `${a.tagName} ${a.textContent?.slice(0, 40)}`;
    });
    expect(["board", "nothing"], `Tab ${n + 1} must stay on the board`).toContain(where);
  }
  await board(page).getByRole("button", { name: "Done" }).focus();

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
  // And the page is given back: nothing is left inert.
  expect(await page.evaluate(() => document.querySelectorAll("[inert]").length)).toBe(0);
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
  expect(status[itemIds.Eli]).toBe("PENDING");
});

test("a hand-in that changes under the page is work nobody has looked at: placeholder back, tick off, off the board", async ({ page }) => {
  // Two pupils of this test's own, so the pieces the tests above rely on are
  // untouched: Gus, with a drawing waiting, and Fen, with nothing handed in,
  // so the run page offers "Not needed" for Fen — a real action, which
  // refreshes the page with what the server now holds, under the picks.
  const stamp = Date.now();
  const drawn = (name: string, fill: string) => {
    writeFileSync(path.join(MEDIA_DIR, name), svg(fill));
    return `/uploads/${name}`;
  };
  const [gus, fen] = await Promise.all(["Gus", "Fen"].map((name) => db.student.create({ data: { name, classId } })));
  const gusItem = await db.journalItem.create({
    data: { authorRole: "STUDENT", classId, assignmentId: runId, type: "DRAWING", status: "PENDING", studentId: gus.id, mediaPath: drawn(`board-gus-first-${stamp}.svg`, "#0ea5e9") },
  });
  try {
    const fetched: string[] = [];
    await openRun(page, fetched);

    // The teacher opens Gus's first attempt and picks it, and Ada's from her jar.
    await page.getByRole("button", { name: /^Open Gus's work/ }).click();
    const viewer = page.getByRole("dialog", { name: "Gus's work" });
    await viewer.getByRole("checkbox", { name: "Add to the board" }).check();
    await viewer.getByRole("button", { name: "Close" }).click();
    await tick(page, "Ada").check();
    await expect(tick(page, "Gus")).toBeChecked();
    await expect(piece(page, "Gus").locator("img")).toHaveAttribute("src", /board-gus-first-/);
    await expect(page.getByRole("button", { name: /Show on the board \(2\)/ })).toBeEnabled();

    // Meanwhile Gus's work is sent back and handed in again, as returnItem and
    // createJournalItem do it: the SAME row, back to waiting, with new pictures
    // at a new path. Nobody has looked at this one.
    await db.journalItem.update({ where: { id: gusItem.id }, data: { status: "RETURNED", teacherNote: "Add the sun" } });
    const second = drawn(`board-gus-second-${stamp}.svg`, "#dc2626");
    await db.journalItem.update({ where: { id: gusItem.id }, data: { status: "PENDING", mediaPath: second, teacherNote: null } });

    // The teacher takes the activity off Fen's list, and the page refreshes.
    await page.getByRole("button", { name: "Not needed for Fen" }).click();
    await expect(page.locator('li[data-pupil="Fen"]')).toHaveAttribute("data-status", "NOT_NEEDED");

    // Gus's second attempt is unseen work: the placeholder is back, the tick is
    // off and cannot go on, the count has dropped, and the new picture was
    // never so much as asked for.
    await expect(piece(page, "Gus").locator("[data-board-unseen]")).toHaveText("Waiting for you — open it to look");
    await expect(piece(page, "Gus").locator("img"), "no thumbnail of the unseen second attempt").toHaveCount(0);
    await expect(tick(page, "Gus")).toBeDisabled();
    await expect(tick(page, "Gus")).not.toBeChecked();
    await expect(piece(page, "Gus")).toContainText("Open it first");
    const show = page.getByRole("button", { name: /Show on the board \(1\)/ });
    await expect(show).toBeEnabled();
    expect(fetched.some((u) => u.includes("board-gus-second-")), "the second attempt's picture was not fetched").toBe(false);

    // And the board has Ada on it, and only Ada.
    await show.click();
    await expect(board(page)).toBeVisible();
    await expect(board(page).locator("[data-board-label]")).toHaveText("Ada");
    await expect(board(page)).toContainText("1 of 1");
    await expect(board(page).getByRole("img")).not.toHaveAttribute("src", /board-gus-/);
    await page.keyboard.press("Escape");
    await expect(board(page)).toHaveCount(0);

    // Now the teacher looks at the second attempt and picks it; then it is
    // sent back. Sent-back work is never offered, so when the page refreshes
    // ("Put back" for Fen) it leaves the list, and the count with it.
    await page.getByRole("button", { name: /^Open Gus's work/ }).click();
    await viewer.getByRole("checkbox", { name: "Add to the board" }).check();
    await viewer.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("button", { name: /Show on the board \(2\)/ })).toBeEnabled();
    await db.journalItem.update({ where: { id: gusItem.id }, data: { status: "RETURNED", teacherNote: "One more go" } });
    await page.getByRole("button", { name: "Put back on Fen's list" }).click();
    await expect(page.locator('li[data-pupil="Fen"]')).toHaveAttribute("data-status", "NOT_HANDED_IN");
    await expect(piece(page, "Gus")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Show on the board \(1\)/ })).toBeEnabled();
  } finally {
    await db.student.deleteMany({ where: { id: { in: [gus.id, fen.id] } } });
  }
});
