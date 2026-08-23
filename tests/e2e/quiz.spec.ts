import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, studentLogin, logout } from "./helpers";

// The full quiz flow: a teacher builds a multiple-choice quiz that spans two
// NON-CONSECUTIVE pages (1 and 3), marks the correct answers, and assigns it.
// A child answers across both pages and submits — silently, seeing no
// right/wrong. The teacher then sees the child's score in the approval queue,
// where the response is still PENDING.
test("teacher builds a multi-page quiz, a child answers it, teacher sees the score", async ({
  page,
}) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Animal quiz");

  // --- Open the editor and add the Quiz toolbox ---
  await page.getByRole("button", { name: /Build a template or quiz/ }).click();
  await page.locator('button[title="Add"]').click(); // the ＋ fan toggle
  await page.getByRole("button", { name: "Quiz", exact: true }).click();

  // The worksheet box and the panel are two editing surfaces for the same
  // question, so answer fields exist in both — scope to the panel.
  const panel = page.getByRole("region", { name: "Quiz builder" });

  // Question 1 on page 1: correct answer is the first option ("Moo"). A new
  // question opens expanded in the accordion, ready to type into.
  await panel.getByRole("button", { name: /Add question to page 1/ }).click();
  await panel.getByPlaceholder("What do you want to ask?").fill("What does a cow say?");
  await panel.getByPlaceholder("Type an answer").nth(0).fill("Moo");
  await panel.getByPlaceholder("Type an answer").nth(1).fill("Woof");

  // Add two more pages, then a question on page 3 (non-consecutive with page 1).
  await page.locator('button[title="Add page"]').click();
  await page.locator('button[title="Add page"]').click();
  await panel.getByRole("button", { name: /Add question to page 3/ }).click();
  await panel.getByPlaceholder("What do you want to ask?").fill("How many legs has a spider?");
  await panel.getByPlaceholder("Type an answer").nth(0).fill("Four");
  await panel.getByPlaceholder("Type an answer").nth(1).fill("Eight");
  // Mark the SECOND option ("Eight") as correct for this question.
  await panel.getByRole("button", { name: /Mark .* as correct/ }).nth(1).click();

  // Finish the editor and save the template.
  await page.locator('button[title="Done"]').click();
  await expect(page.getByText(/2 quiz questions/)).toBeVisible();
  await page.getByRole("button", { name: /Save to library/ }).click();
  // Lands on the new template's detail page (not /new).
  await expect(page.getByRole("heading", { name: "Animal quiz" })).toBeVisible();
  const templatePath = new URL(page.url()).pathname;

  // --- Assign it to the whole class ---
  await page.getByRole("button", { name: /Assign/ }).first().click();
  // No class is preselected; choose one before assigning (Item 5).
  await page.getByRole("button", { name: "Sunflower Class" }).click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));

  // --- Child answers the quiz across both pages ---
  await logout(page);
  await studentLogin(page, "Amara");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Animal quiz/ }).click();
  await expect(page.locator("canvas")).toBeVisible();

  // Page 1: the answer is a real, keyboard-focusable button with a child-sized
  // (≥64px) touch target, then answer correctly ("Moo").
  const moo = page.getByRole("button", { name: "Moo" });
  expect((await moo.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  await moo.focus();
  await expect(moo).toBeFocused();
  await moo.click();
  // Jump to page 3 via its thumbnail and answer INCORRECTLY ("Four").
  await page.locator('img[alt="Page 3"]').click();
  await page.getByRole("button", { name: "Four" }).click();

  // Nothing tells the child whether they were right — silent capture.
  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /hand it in/i }).click();
  await page.waitForURL((url) => url.pathname === "/student/popped");
  await expect(page.locator("body")).not.toContainText(/\b\d\s*\/\s*\d\b/); // no score shown
  await expect(page.locator("body")).not.toContainText(/correct/i);

  // --- Teacher sees the score in the approval queue (still PENDING) ---
  await logout(page);
  await teacherLogin(page);
  await page.goto("/teacher/queue");
  // Amara scored 1 of 2 (cow right, spider wrong).
  const quizBadge = page.getByRole("button", { name: /Quiz 1\/2/ });
  await expect(quizBadge).toBeVisible();

  // Expand the review: the spider question shows her wrong answer + the correct one.
  await quizBadge.click();
  await expect(page.getByText(/How many legs has a spider\?/)).toBeVisible();
  await expect(page.getByText(/Correct:\s*Eight/)).toBeVisible();

  // The THUMBNAIL shows the quiz too.
  //
  // This is the first thing a teacher sees, and it was a blank white rectangle:
  // question boxes are never flattened into the page PNG (that invariant is
  // what keeps a published drawing a drawing), so the work of record for a quiz
  // page is genuinely an empty sheet. A hand-in therefore stores a PICTURE of
  // itself alongside the work, and the looking-surfaces use it.
  //
  // Scoped to the card carrying the quiz badge, not `.first()`. Amara hands work
  // in during activities.spec.ts too, and this suite runs serially against one
  // database — so "the first Amara card in the queue" is whichever spec ran
  // most recently, and the assertion below silently compared a drawing's
  // thumbnail against a quiz's preview.
  const quizCard = page.locator("div[data-child]").filter({ has: page.getByRole("button", { name: /Quiz 1\/2/ }) });
  const thumb = quizCard.getByRole("button", { name: "Open Amara's work" }).locator("img");
  const thumbSrc = (await thumb.getAttribute("src"))!;
  // It renders. `/uploads` authorises by column, so a path the route does not
  // recognise is served to nobody — which is how a stored picture can still
  // arrive as a broken image.
  await expect
    .poll(async () => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);

  // The picture and the work of record are two different files, and the work of
  // record is the one that stays free of question boxes.
  const db = new PrismaClient();
  let shownFirst = "";
  try {
    const item = await db.journalItem.findFirst({
      where: { student: { name: "Amara" }, assignment: { title: "Animal quiz" } },
      select: { mediaPath: true, mediaPathsJson: true, previewPathsJson: true },
      orderBy: { createdAt: "desc" },
    });
    expect(item, "the hand-in was saved").not.toBeNull();
    const work = JSON.parse(item!.mediaPathsJson!) as string[];
    const shown = JSON.parse(item!.previewPathsJson!) as string[];
    expect(shown, "a picture of every page, not just the cover").toHaveLength(work.length);
    expect(shown[0], "the picture is its own file").not.toBe(work[0]);
    expect(thumbSrc, "the queue shows the picture, not the blank page").toBe(shown[0]);
    shownFirst = shown[0];

    // Page 1 carries a question box and nothing else, so its work of record is
    // a blank sheet while its picture is not. Bytes are a coarse measure and a
    // deliberately generous one: a blank PNG compresses to almost nothing.
    const { statSync } = await import("node:fs");
    // Media lives outside public/ — it is served only through the authorising
    // /uploads route, never statically (SAFEGUARDING rule 7).
    const mediaDir = process.env.MEDIA_DIR || `${process.cwd()}/.media`;
    const onDisk = (p: string) => statSync(`${mediaDir}/${p.replace("/uploads/", "")}`).size;
    expect(
      onDisk(shown[0]),
      "the picture carries the question the blank page does not",
    ).toBeGreaterThan(onDisk(work[0]) * 2);
  } finally {
    await db.$disconnect();
  }

  // And the same when OPENING the work, which is where a teacher actually
  // looks at it. Question boxes are deliberately never flattened into the page
  // PNG — that is what keeps a child's drawing free of them — so without this
  // the viewer showed the drawing and no sign anything had been answered.
  // The same card as the thumbnail above, for the same reason.
  await quizCard.getByRole("button", { name: "Open Amara's work" }).click();
  const viewer = page.getByRole("dialog");
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText("Quiz · 1 of 2");
  await expect(viewer).toContainText(/How many legs has a spider\?/);
  await expect(viewer).toContainText(/Correct:\s*Eight/);
  // Never the tick alone — the words say it too (rule 18).
  await expect(viewer).toContainText("not right");
  await page.keyboard.press("Escape");

  // The response is still awaiting approval on the run.
  await page.goto(templatePath);
  await expect(page.getByText(/1 waiting/).first()).toBeVisible();

  // --- And once it is in her jar, SHE can see it too ---
  //
  // The jar read `mediaPath` straight off the row — the cover of the work of
  // record, which for a quiz page is the blank sheet. A child who answered
  // every question opened her jar and found a white rectangle with her
  // teacher's stickers stuck to nothing on it.
  await page.goto("/teacher/queue");
  const row = page.locator('[data-child="Amara"]').filter({ hasText: "Animal quiz" });
  await row.getByRole("button", { name: /Add to jar/ }).click();
  await expect(row).toHaveCount(0, { timeout: 15_000 });

  await logout(page);
  await studentLogin(page, "Amara");
  await page.goto("/student");
  const card = page.locator(`img[src="${shownFirst}"]`).first();
  await expect(card, "her jar shows the picture, not the blank page").toBeVisible();
  // And it loads: /uploads authorises by column, and a child reaching her own
  // picture is a different query from a teacher reaching it.
  await expect
    .poll(async () => card.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
});

// The quiz box on the worksheet and the panel's accordion are two editing
// surfaces for ONE question: they read and write the same data, so a keystroke
// in either shows up in the other. Marking the correct answer is deliberately
// the panel's job alone — the box only reflects it.
test("the worksheet box and the quiz panel edit the same question, both ways", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Mirror quiz");

  await page.getByRole("button", { name: /Build a template or quiz/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Quiz", exact: true }).click();

  const panel = page.getByRole("region", { name: "Quiz builder" });
  const box = page.getByRole("group", { name: "Question box" });
  await panel.getByRole("button", { name: /Add question to page 1/ }).click();

  const panelPrompt = panel.getByPlaceholder("What do you want to ask?");
  const boxPrompt = box.getByPlaceholder("Type your question here");

  // Panel → worksheet.
  await panelPrompt.fill("What colour is the bus?");
  await expect(boxPrompt).toHaveValue("What colour is the bus?");

  // Worksheet → panel, per keystroke (not just on blur), and the box keeps
  // focus while it mirrors so the teacher can keep typing.
  await boxPrompt.fill("");
  await boxPrompt.pressSequentially("Where is Harry?");
  await expect(panelPrompt).toHaveValue("Where is Harry?");
  await expect(boxPrompt).toBeFocused();
  // The accordion header title tracks the prompt too.
  await expect(panel.getByRole("button", { name: /Where is Harry\?/ })).toBeVisible();

  // Answers mirror both ways as well.
  await panel.getByPlaceholder("Type an answer").nth(0).fill("At the bus stop");
  await expect(box.getByPlaceholder("Type an answer").nth(0)).toHaveValue("At the bus stop");
  await box.getByPlaceholder("Type an answer").nth(1).fill("In bed");
  await expect(panel.getByPlaceholder("Type an answer").nth(1)).toHaveValue("In bed");

  // Marking the correct answer is panel-only: the box has no control for it,
  // but it does show which answer is marked.
  await expect(box.getByRole("button", { name: /Mark .* as correct/ })).toHaveCount(0);
  await panel.getByRole("button", { name: /Mark "In bed" as correct/ }).click();
  await expect(box.getByTitle(/Correct answer/)).toBeVisible();
});

// Four answers lay out two-per-row. The fields are textareas, which carry an
// intrinsic width a plain <span> never had, so the grid columns will refuse to
// shrink and spill out of the box unless they're allowed to. The box clips its
// overflow, so when that happens the teacher simply loses half their answers.
test("a four-answer question stays inside its box on the worksheet", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Four answers");

  await page.getByRole("button", { name: /Build a template or quiz/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Quiz", exact: true }).click();

  const panel = page.getByRole("region", { name: "Quiz builder" });
  const box = page.getByRole("group", { name: "Question box" });
  await panel.getByRole("button", { name: /Add question to page 1/ }).click();

  // Two answers by default → add two more to get the two-column layout.
  await panel.getByRole("button", { name: /^＋ Add answer$/ }).click();
  await panel.getByRole("button", { name: /^＋ Add answer$/ }).click();
  const answers = box.getByPlaceholder("Type an answer");
  await expect(answers).toHaveCount(4);

  // Real, wrapping answer text — short words would fit even a broken layout.
  await answers.nth(0).fill("He was stood next to the bus stop");
  await answers.nth(1).fill("He was fast asleep in his bed");
  await answers.nth(2).fill("He was riding his bicycle to school");
  await answers.nth(3).fill("He was eating his breakfast");

  // Every answer sits within the box, and none of the text is cut off.
  const boxBox = (await box.boundingBox())!;
  for (let i = 0; i < 4; i++) {
    const row = (await answers.nth(i).boundingBox())!;
    expect(row.x).toBeGreaterThanOrEqual(boxBox.x - 1);
    expect(row.x + row.width).toBeLessThanOrEqual(boxBox.x + boxBox.width + 1);
  }
  const clipped = await box.evaluate((el) =>
    [...el.querySelectorAll("textarea")].some((t) => t.scrollHeight > t.clientHeight + 1),
  );
  expect(clipped).toBe(false);
});

// A teacher can shrink a question to an aside. The contents are designed at the
// box's birth size and scale down with it, so a smaller box shows everything at
// smaller type rather than keeping the type and clipping — which is what the old
// fixed sizes did, and why the box couldn't usefully go below its old floor.
test("shrinking a question box scales its contents instead of clipping them", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Small box");

  await page.getByRole("button", { name: /Build a template or quiz/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Quiz", exact: true }).click();

  const panel = page.getByRole("region", { name: "Quiz builder" });
  const box = page.getByRole("group", { name: "Question box" });
  await panel.getByRole("button", { name: /Add question to page 1/ }).click();

  const prompt = box.getByPlaceholder("Type your question here");
  await prompt.fill("How do you know Harry was waiting for the bus?");
  await box.getByPlaceholder("Type an answer").nth(0).fill("He was stood next to the bus stop");
  await box.getByPlaceholder("Type an answer").nth(1).fill("He was in bed");

  const fontOf = (l: ReturnType<typeof page.locator>) =>
    l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await fontOf(prompt);

  // Drag the resize handle well past the old 220×160 floor.
  const handle = page.locator('[title="Resize"]');
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x - 260, h.y - 190, { steps: 8 });
  await page.mouse.up();

  // The box really did get smaller than the old 220 floor. Measured in canvas
  // units (offsetWidth), not the rendered box: the canvas scales to fit the
  // window, so a bounding box in CSS pixels reads under 220 even when the
  // question is still pinned at the old floor.
  const shrunkWidth = await box.evaluate((el) => (el as HTMLElement).offsetWidth);
  expect(shrunkWidth).toBeLessThan(220);

  // …the type came down with it…
  const after = await fontOf(prompt);
  expect(after).toBeLessThan(before);

  // …and everything still fits: no clipped fields, no overflow.
  const state = await box.evaluate((el) => ({
    clipped: [...el.querySelectorAll("textarea")].some((t) => t.scrollHeight > t.clientHeight + 1),
    overflows: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
  }));
  expect(state).toEqual({ clipped: false, overflows: false });
});

// Answer rows stretch to share out the box's height, so their size says little
// about how much text is in them — two short answers in a tall box left small
// text marooned in a big empty row. The text is grown to fill the row it's in,
// at one shared size so the answers stay consistent with each other.
test("answer text grows to fill its row, at one size for every answer", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Fit to box");

  await page.getByRole("button", { name: /Build a template or quiz/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Quiz", exact: true }).click();

  const panel = page.getByRole("region", { name: "Quiz builder" });
  const box = page.getByRole("group", { name: "Question box" });
  await panel.getByRole("button", { name: /Add question to page 1/ }).click();
  await box.getByPlaceholder("Type your question here").fill("hello this is the question");

  const answers = box.getByPlaceholder("Type an answer");
  await answers.nth(0).fill("hello this is the answer to the question");
  await answers.nth(1).fill("hello this is the answer to the question");

  // The text fills most of the row it sits in, rather than floating small in a
  // tall box. (It was 16px in a ~96px row before — about a quarter of it.)
  const fill = await box.evaluate((el) => {
    const t = el.querySelector("textarea[aria-label='Answer text']") as HTMLTextAreaElement;
    return t.offsetHeight / (t.parentElement as HTMLElement).clientHeight;
  });
  expect(fill).toBeGreaterThan(0.5);

  // Every answer is the same size — sizing each to its own text would leave one
  // answer looming over another.
  const sizes = await box.evaluate(() =>
    [...document.querySelectorAll("textarea[aria-label='Answer text']")].map(
      (t) => getComputedStyle(t).fontSize,
    ),
  );
  expect(new Set(sizes).size).toBe(1);

  // Growing must not push the text out of its row.
  const clipped = await box.evaluate((el) =>
    [...el.querySelectorAll("textarea")].some((t) => t.scrollHeight > t.clientHeight + 1),
  );
  expect(clipped).toBe(false);

  // A different answer length must not change the shared size mid-flight, and
  // four answers in narrower columns must shrink to fit rather than spill.
  await panel.getByRole("button", { name: /^＋ Add answer$/ }).click();
  await panel.getByRole("button", { name: /^＋ Add answer$/ }).click();
  await answers.nth(2).fill("He was riding his bicycle to school");
  await answers.nth(3).fill("Red");
  const after = await box.evaluate(() => ({
    sizes: [...document.querySelectorAll("textarea[aria-label='Answer text']")].map(
      (t) => getComputedStyle(t).fontSize,
    ),
    clipped: [...document.querySelectorAll("textarea[aria-label='Answer text']")].some(
      (t) => (t as HTMLTextAreaElement).scrollHeight > t.clientHeight + 1,
    ),
  }));
  expect(new Set(after.sizes).size).toBe(1);
  expect(after.clipped).toBe(false);
});

// Another go at the ones they got wrong.
//
// Sending a nine-out-of-ten back as "start again" is demoralising, so a
// "carry on" return keeps what they got right and reopens what they didn't.
// None of this path had a test — not returnMode, not CONTINUE, not a sent-back
// quiz — which is how a returned quiz came to blank the wrong answers entirely,
// leaving a child looking at questions that seemed never to have been done.
test("a sent-back quiz says which ones to look at again, without giving the answer", async ({
  page,
}) => {
  const db = new PrismaClient();
  try {
    await teacherLogin(page);
    await page.goto("/teacher/activities/new");
    await page.fill("#title", "Second go");
    await page.getByRole("button", { name: /Build a template or quiz/ }).click();
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Quiz", exact: true }).click();

    const panel = page.getByRole("region", { name: "Quiz builder" });
    await panel.getByRole("button", { name: /Add question to page 1/ }).click();
    await panel.getByPlaceholder("What do you want to ask?").fill("What does a cow say?");
    await panel.getByPlaceholder("Type an answer").nth(0).fill("Moo");
    await panel.getByPlaceholder("Type an answer").nth(1).fill("Woof");

    // Page 2, not page 1: two boxes on one page overlap and swallow each
    // other's taps.
    await page.locator('button[title="Add page"]').click();
    await panel.getByRole("button", { name: /Add question to page 2/ }).click();
    await panel.getByPlaceholder("What do you want to ask?").fill("How many legs has a spider?");
    await panel.getByPlaceholder("Type an answer").nth(0).fill("Four");
    await panel.getByPlaceholder("Type an answer").nth(1).fill("Eight");
    await panel.getByRole("button", { name: /Mark .* as correct/ }).nth(1).click();

    await page.locator('button[title="Done"]').click();
    await page.getByRole("button", { name: /Save to library/ }).click();
    await expect(page.getByRole("heading", { name: "Second go" })).toBeVisible();
    await page.getByRole("button", { name: /Assign/ }).first().click();
    // No class is preselected; choose one before assigning (Item 5).
    await page.getByRole("button", { name: "Sunflower Class" }).click();
    await page.getByRole("button", { name: /Assign to whole class/ }).click();
    await page.waitForURL((url) => url.searchParams.has("run"));
    // Every DB check below is scoped to THIS run: the spec above also leaves
    // Amara an item, and "her only quiz" would then count two.
    const runId = new URL(page.url()).searchParams.get("run")!;

    // --- The child gets one right and one wrong ---
    await logout(page);
    await studentLogin(page, "Amara");
    await page.goto("/student/activities");
    await page.getByRole("link", { name: /Second go/ }).click();
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: "Moo" }).click();
    await page.locator('img[alt="Page 2"]').click();
    await page.getByRole("button", { name: "Four" }).click();
    await page.locator('button[title="Done"]').click();
    await page.getByRole("button", { name: /hand it in/i }).click();
    await page.waitForURL((url) => url.pathname === "/student/popped");

    // --- The teacher sends it back, keeping their work ---
    await logout(page);
    await teacherLogin(page);
    await page.goto("/teacher/queue");
    // By activity as well as child: the spec above leaves Amara a second card.
    const card = page.locator('[data-child="Amara"]').filter({ hasText: "Second go" });
    await card.getByRole("button", { name: /Send back/ }).click();
    // "Keep their work" is the default, which is what makes this a second go
    // rather than a fresh start.
    await card.getByRole("button", { name: "Send back", exact: true }).click();
    await expect
      .poll(async () => (await db.journalItem.findFirst({
        where: { status: "RETURNED", assignmentId: runId },
      }))?.returnMode ?? null, { timeout: 15_000 })
      .toBe("CONTINUE");

    // --- The child reopens it ---
    await logout(page);
    await studentLogin(page, "Amara");
    await page.goto("/student/activities");
    await page.getByRole("link", { name: /Second go/ }).click();
    await expect(page.locator("canvas")).toBeVisible();

    // The one they got right is settled: still chosen, and no longer tappable,
    // so a stray tap cannot undo it.
    const moo = page.getByRole("button", { name: "Moo" });
    await expect(moo).toHaveAttribute("aria-pressed", "true");
    await expect(moo).toBeDisabled();

    // The one they got wrong comes back AS THEY ANSWERED IT, said in words and
    // still tappable — not blanked, which read as "you never did this".
    await page.locator('img[alt="Page 2"]').click();
    await expect(page.getByText("Have another go at this one")).toBeVisible();
    const four = page.getByRole("button", { name: "Four" });
    await expect(four).toHaveAttribute("aria-pressed", "true");
    await expect(four).toBeEnabled();

    // And the answer is NOT given away. This is what keeps a second go a
    // decision rather than a copy: "Eight" is on screen as an option, but
    // nothing marks it as the right one.
    const eight = page.getByRole("button", { name: "Eight" });
    await expect(eight).toBeEnabled();
    await expect(eight).toHaveAttribute("aria-pressed", "false");
    expect(
      await eight.evaluate((el) => el.className),
      "the correct answer must not be marked on a question they got wrong",
    ).not.toMatch(/emerald/);

    // --- They fix it and hand in again ---
    await eight.click();
    // Having had another go, they are no longer told to.
    await expect(page.getByText("Have another go at this one")).toHaveCount(0);
    await page.locator('button[title="Done"]').click();
    await page.getByRole("button", { name: /hand it in/i }).click();
    await page.waitForURL((url) => url.pathname === "/student/popped");

    // Full marks, on ONE item — a re-do updates the returned row rather than
    // making the run show as both sent back and waiting.
    await expect
      .poll(async () => {
        const rows = await db.journalItem.findMany({ where: { assignmentId: runId } });
        return rows.length === 1 ? `${rows[0].quizScore}/${rows[0].quizTotal}` : `rows:${rows.length}`;
      }, { timeout: 15_000 })
      .toBe("2/2");
  } finally {
    // This spec hands work in twice; several others are written around a child
    // having exactly one waiting item, so it clears up after itself.
    await db.journalItem.deleteMany({ where: { assignment: { title: "Second go" } } });
    await db.$disconnect();
  }
});

// A picture inside an answer goes through the same door as a picture on the
// canvas.
//
// It did not, and that was the whole bug: the picker offers `image/*`, the
// store keeps only some of that, and the canvas import had learned to re-encode
// the rest while this second entry point had not. So an AVIF sailed in, showed
// up in the question, and was refused several steps later with "That image
// couldn't be read" — after the teacher had placed it.
test("a picture in an answer is re-encoded and kept small", async ({ page }) => {
  const db = new PrismaClient();
  try {
    await teacherLogin(page);
    await page.goto("/teacher/activities/new");
    await page.fill("#title", "Picture answers");
    await page.getByRole("button", { name: /Build a template or quiz/ }).click();
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Quiz", exact: true }).click();

    const panel = page.getByRole("region", { name: "Quiz builder" });
    await panel.getByRole("button", { name: /Add question to page 1/ }).click();
    await panel.getByPlaceholder("What do you want to ask?").fill("Which city?");
    await panel.getByPlaceholder("Type an answer").nth(0).fill("London");
    await panel.getByPlaceholder("Type an answer").nth(1).fill("Paris");

    await panel.getByRole("button", { name: /picture/i }).first().click();
    await page.locator('input[type="file"]').last().setInputFiles("tests/fixtures/sample.avif");

    // Scoped to the question box: the Pages strip is full of PNG thumbnails, so
    // the first data: image on the page is one of those, not the answer's.
    const optionImg = page.getByRole("group", { name: "Question box" }).locator("img").first();
    await expect(optionImg).toBeVisible({ timeout: 15_000 });
    const shape = await optionImg.evaluate((el) => {
      const i = el as HTMLImageElement;
      return { fmt: i.src.slice(0, 20), bytes: i.src.length };
    });

    expect(shape.fmt, "re-encoded into something the store keeps").toMatch(
      /^data:image\/(webp|jpeg);/,
    );
    // An answer's picture is shown at about thumbnail size, so carrying the
    // 3840px original would be a slow save for detail nobody sees — and several
    // of them ride in one form post.
    expect(
      shape.bytes,
      `an answer's picture should stay small (was ${Math.round(shape.bytes / 1024)}KB)`,
    ).toBeLessThan(400 * 1024);

    // And the save it used to die on now goes through.
    await page.locator('button[title="Done"]').click();
    await page.getByRole("button", { name: /Save to library/ }).click();
    await page.waitForURL((u) => /^\/teacher\/activities\/[a-z0-9]{20,}$/.test(u.pathname), {
      timeout: 30_000,
    });
    await expect(page.getByText(/couldn't be read/i)).toHaveCount(0);
  } finally {
    await db.activityTemplate.deleteMany({ where: { title: "Picture answers" } });
    await db.$disconnect();
  }
});
