import { test, expect } from "@playwright/test";
import { loginStudent, loginTeacher } from "../helpers";
import { ACADEMY } from "../personas/world";

// ===========================================================================
// F38 — the teacher's note on returned work never reaches the child.
//
// `returnItem` (src/app/actions/journal.ts) stores the teacher's note on the
// moment as `teacherNote`, and the queue asks for it with a placeholder that
// tells the teacher what a good one looks like: "A kind note — e.g. 'Lovely!
// Can you add a label to your diagram?'".
//
// The child never sees it. `/student` renders returned work as a strip with a
// generic status line from `studentCopy` ("Have another go"), and `StatusStrip`
// deliberately reads aloud only that fixed copy. The one component that renders
// `teacherNote` — `JournalItemCard` — is used on ONE screen:
// `/teacher/students/[studentId]`, which is the teacher's own view.
//
// So the loop is: the teacher writes what to change, the product asks them to,
// and the child is told only that something came back. Which of the two things
// they did wrong is left for them to guess, or for the teacher to say out loud
// — which is the classroom the product is meant to give time back to.
//
// Found by the user-tester team: Wren, aged ten
// (tests/battery/personas/children.spec.ts) and again by Mr Reeves watching a
// child pick his feedback up (personas/teacher-activities.spec.ts).
//
// This asserts the INTENDED behaviour and therefore FAILS until it is built.
// When it is, move it into `tests/e2e/journal.spec.ts` and delete F38.
// ===========================================================================

test("F38 — a child can read the note their teacher sent the work back with", async ({ page }) => {
  // The fixture leaves one piece already returned with a note (seed-personas).
  await loginStudent(page, ACADEMY.classes.ks2.code, ACADEMY.returned.child);

  // The child is told something came back — this part works today.
  await expect(page.getByText(/again|back/i).first()).toBeVisible();

  // And what their teacher actually asked them to change. This is the gap.
  await expect(
    page.getByText(ACADEMY.returned.note),
    "the teacher's note must be readable by the child it was written for",
  ).toBeVisible();
});

test("F38 — the note a teacher types in the queue is the note the child gets", async ({ page }) => {
  const note = "Can you add the units to each number?";

  await loginTeacher(page, ACADEMY.teacher);
  await page.goto("/teacher/queue");

  const row = page.locator(`[data-child="${ACADEMY.waiting.child}"]`).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /send back/i }).click();
  await page.getByPlaceholder(/a kind note/i).fill(note);
  await page.getByRole("button", { name: /^send back$/i }).click();
  await page.waitForTimeout(1000);

  await page.context().clearCookies();
  await loginStudent(page, ACADEMY.classes.ks1.code, ACADEMY.waiting.child);
  await expect(page.getByText(note), "the child must be able to read the words their teacher wrote").toBeVisible();
});
