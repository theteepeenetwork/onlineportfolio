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

  // Question 1 on page 1: correct answer is the first option ("Moo").
  await page.getByRole("button", { name: /Add question on this page/ }).click();
  await page.getByPlaceholder("What do you want to ask?").fill("What does a cow say?");
  await page.getByPlaceholder("Answer").nth(0).fill("Moo");
  await page.getByPlaceholder("Answer").nth(1).fill("Woof");

  // Add two more pages, then a question on page 3 (non-consecutive with page 1).
  await page.locator('button[title="Add page"]').click();
  await page.locator('button[title="Add page"]').click();
  await page.getByRole("button", { name: /Add question on this page/ }).click();
  await page.getByPlaceholder("What do you want to ask?").fill("How many legs has a spider?");
  await page.getByPlaceholder("Answer").nth(0).fill("Four");
  await page.getByPlaceholder("Answer").nth(1).fill("Eight");
  // Mark the SECOND option ("Eight") as correct for this question.
  await page.getByRole("button", { name: /Mark .* as correct/ }).nth(1).click();

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
