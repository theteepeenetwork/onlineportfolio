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
