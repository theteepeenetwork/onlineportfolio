import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, demoClassCode, holdPageCard, drawOnCanvas } from "./helpers";

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

  // Copy and throw-away live in the page card's own menu, which a finger
  // reaches by holding the card — the gesture that also slides it.
  await holdPageCard(page, 0);
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

// The hidden field's pages once they have stopped changing. A page operation
// repaints the stroke layer asynchronously, so a read taken on the click can
// catch the value from before it (see undo-stroke-layer.spec's `settled`).
async function settledPages(page: Page, field: string, count: number): Promise<string[]> {
  const read = async () => JSON.parse((await page.locator(`input[name="${field}"]`).inputValue()) || "[]") as string[];
  await expect.poll(async () => (await read()).length, { timeout: 10_000 }).toBe(count);
  let last = JSON.stringify(await read());
  await expect
    .poll(async () => {
      const now = JSON.stringify(await read());
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
  return read();
}

async function openApples(page: Page, child: string) {
  await page.goto(`/login/student?code=${await demoClassCode()}`);
  await page.getByRole("button", { name: child, exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  await page.goto("/student/activities");
  // A seeded live run for the whole of Sunflower, with one page of the
  // teacher's worksheet. Opening it hands nothing in.
  await page.getByRole("link", { name: /Count the apples/ }).first().click();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);
}

test("a pupil can throw away a page they added, and Undo brings it back — never the teacher's", async ({
  page,
}) => {
  // Deny by default (rule 8). The teacher's pages are the worksheet and the
  // shape of what comes back, so a pupil can neither copy nor throw one away.
  // A page they added is their own, and wears a cross.
  await openApples(page, "Ella");
  await expect(page.getByRole("button", { name: /^Throw away page/ })).toHaveCount(0);
  await holdPageCard(page, 0);
  await expect(page.getByRole("button", { name: "Duplicate this page" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete page/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.locator('button[title="Add page"]').click();
  await expect(page.getByRole("button", { name: "Throw away page 2", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Throw away page 1", exact: true }),
    "the teacher's page never gets a cross",
  ).toHaveCount(0);

  // Something on the page to bring back.
  await drawOnCanvas(page);
  const before = await settledPages(page, "drawingPages", 2);

  await page.getByRole("button", { name: "Throw away page 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Page 2", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Undo brings page 2 back" })).toBeVisible();
  await settledPages(page, "drawingPages", 1);

  // The toast's promise, kept: the page, its drawing, and the child is on it.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Page 2", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
  const after = await settledPages(page, "drawingPages", 2);
  expect(after[1], "the drawing on the page came back with it").toBe(before[1]);
  expect(after[0]).toBe(before[0]);
  await expect(page.getByRole("button", { name: "Throw away page 2", exact: true })).toBeVisible();
});

// A question knows its page BY INDEX. Throwing a page away used to leave every
// later question pointing one page too far on, and the deleted page's own
// question stranded on whatever slid into its place.
test("throwing a page away takes its questions with it, and Undo puts them back", async ({ page }) => {
  await builder(page, "Renumbered quiz");
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  const panel = page.getByRole("region", { name: "Quiz builder" });
  const prompts = panel.getByPlaceholder("What do you want to ask?");

  for (const [i, words] of ["One", "Two", "Three"].entries()) {
    if (i > 0) await page.locator('button[title="Add page"]').click();
    await panel.getByRole("button", { name: new RegExp(`Add question to page ${i + 1}`) }).click();
    // Each on a later page than the last, so the newest card is the last one.
    const card = panel.locator('[id^="quiz-q-"]').last();
    await card.getByPlaceholder("What do you want to ask?").fill(words);
    await card.getByPlaceholder("Type an answer").nth(0).fill("Yes");
    await card.getByPlaceholder("Type an answer").nth(1).fill("No");
  }
  await expect(prompts).toHaveCount(3);

  await page.getByRole("button", { name: "Throw away page 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Page 3", exact: true })).toHaveCount(0);
  await expect(prompts).toHaveCount(2);
  await expect(prompts.nth(0)).toHaveValue("One");
  await expect(prompts.nth(1)).toHaveValue("Three");

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(prompts).toHaveCount(3);
  await expect(prompts.nth(1)).toHaveValue("Two");

  // And what is SAVED agrees: throw page 2 away again and keep it that way.
  await page.getByRole("button", { name: "Throw away page 2", exact: true }).click();
  await expect(prompts).toHaveCount(2);
  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /Save to library/ }).click();
  await expect(page.getByRole("heading", { name: "Renumbered quiz" })).toBeVisible();

  const db = new PrismaClient();
  try {
    const saved = await db.activityTemplate.findFirstOrThrow({
      where: { title: "Renumbered quiz" },
      orderBy: { createdAt: "desc" },
    });
    const questions = (JSON.parse(saved.quizJson ?? "{}").questions ?? []) as {
      prompt: string;
      pageIndex: number;
    }[];
    expect(questions.map((q) => [q.prompt, q.pageIndex])).toEqual([
      ["One", 0],
      ["Three", 1],
    ]);
  } finally {
    await db.$disconnect();
  }
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
  // Every page in the builder is the teacher's own to throw away.
  await expect(page.getByRole("button", { name: "Throw away page 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Throw away page 2", exact: true })).toBeVisible();

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

// The pictures on the page cards are pictures, not the pages themselves.
//
// They used to be the full-size page image handed to a 96x84 <img> for the
// browser to shrink, which meant a ten-page drawing kept ten extra full-page
// PNGs alive to draw ten postage stamps. On a school iPad that is memory the
// canvas does not have. They are small JPEGs now, drawn from the same render
// the page's own image comes from.
test("a page card carries a small picture of the page, not the page itself", async ({ page }) => {
  await builder(page, "Thumbnails");
  await drawOnCanvas(page);

  const thumb = page.getByRole("button", { name: "Page 1", exact: true }).locator("img");
  await expect(thumb).toHaveCount(1);
  const src = (await thumb.getAttribute("src"))!;
  expect(src.startsWith("data:image/jpeg")).toBe(true);
  // A full-page PNG of a drawing is hundreds of kilobytes and upwards; this is
  // 200x140 of JPEG. The cap is generous on purpose — it is here to catch the
  // day someone hands the tray a full-size page again, not to police encoders.
  expect(src.length).toBeLessThan(40 * 1024);
});
