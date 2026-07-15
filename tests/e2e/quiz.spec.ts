import { test, expect } from "@playwright/test";
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

  // The response is still awaiting approval on the run.
  await page.goto(templatePath);
  await expect(page.getByText(/1 waiting/).first()).toBeVisible();
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
