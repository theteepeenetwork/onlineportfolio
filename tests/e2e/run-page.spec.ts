import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin } from "./helpers";

// ===========================================================================
// Who has and hasn't done an activity (teacher feedback item 4).
//
// The run page answers one class's question about one activity, pupil by
// pupil, in four words that never include "not started": a pupil's unfinished
// draft is private even from their teacher, so all the page can know is that
// nothing has been handed in yet.
//
// IT BUILDS ITS OWN CLASS. The demo's Sunflower runs are approved, sent back and
// handed in by half the files that sort before this one, so asserting "Ben is
// waiting" against them would be asserting the run order. Here every pupil's
// standing is set by this file and nothing else, and it is all deleted after.
// ===========================================================================

const db = new PrismaClient();

const CLASS_NAME = "Heron Class (run page)";
const TITLE = "Pond dipping (run page)";
const CHOSEN_TITLE = "Pond sketch (run page, chosen)";

let classId = "";
let runId = "";
let chosenRunId = "";
let templateId = "";
let beaItemId = "";

test.beforeAll(async () => {
  const teacher = await db.teacher.findFirstOrThrow({ where: { email: "teacher@school.uk" } });
  const klass = await db.class.create({
    data: { name: CLASS_NAME, ageMode: "KS1", classCode: `HRN${Date.now().toString().slice(-3)}`, teacherId: teacher.id, schoolId: teacher.schoolId },
  });
  classId = klass.id;
  const [asha, bea, cal, dot] = await Promise.all(
    ["Asha", "Bea", "Cal", "Dot"].map((name) => db.student.create({ data: { name, classId: klass.id } })),
  );
  const template = await db.activityTemplate.create({
    data: { title: TITLE, instructions: "Draw what you found in the net.", teacherId: teacher.id },
  });
  templateId = template.id;
  const run = await db.assignment.create({
    data: { templateId: template.id, classId: klass.id, wholeClass: true, status: "LIVE", title: TITLE, instructions: template.instructions },
  });
  runId = run.id;
  const item = (studentId: string, status: string) =>
    db.journalItem.create({
      data: { type: "TEXT", textContent: `A newt (${status})`, status, approvedAt: status === "APPROVED" ? new Date() : null, authorRole: "STUDENT", studentId, classId: klass.id, assignmentId: run.id },
    });
  await item(asha.id, "APPROVED");
  beaItemId = (await item(bea.id, "PENDING")).id;
  await item(cal.id, "RETURNED");
  void dot; // Dot has handed nothing in — and may well have a draft, which is none of this page's business.

  // A chosen-pupil run set to two of the four.
  const chosen = await db.assignment.create({
    data: {
      templateId: template.id,
      classId: klass.id,
      wholeClass: false,
      status: "LIVE",
      title: CHOSEN_TITLE,
      students: { create: [{ studentId: asha.id }, { studentId: dot.id }] },
    },
  });
  chosenRunId = chosen.id;
});

test.afterAll(async () => {
  // The class cascades its pupils, their work and both runs' pupil lists.
  await db.assignment.deleteMany({ where: { templateId } });
  await db.class.deleteMany({ where: { id: classId } });
  await db.activityTemplate.deleteMany({ where: { id: templateId } });
  await db.$disconnect();
});

test("Live now opens a run, and every pupil's standing is named in the teacher's words", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities");

  const live = page.locator("#live-now");
  await expect(live.getByRole("heading", { name: "Live now" })).toBeVisible();
  await live.getByRole("link", { name: new RegExp(TITLE.replace(/[()]/g, "\\$&")) }).click();
  await page.waitForURL(`**/teacher/activities/runs/${runId}`);

  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  const status = (name: string) => page.locator(`li[data-pupil="${name}"]`);
  await expect(status("Asha")).toHaveAttribute("data-status", "IN_JAR");
  await expect(status("Asha")).toContainText("In their jar");
  await expect(status("Bea")).toHaveAttribute("data-status", "WAITING");
  await expect(status("Bea")).toContainText("Waiting for you");
  await expect(status("Cal")).toHaveAttribute("data-status", "SENT_BACK");
  await expect(status("Cal")).toContainText("Sent back");
  await expect(status("Dot")).toHaveAttribute("data-status", "NOT_HANDED_IN");
  await expect(status("Dot")).toContainText("Not handed in yet");

  // The band counts the same four things the rows say.
  await expect(page.getByText("3 of 4 pupils have handed something in")).toBeVisible();
  for (const [key, n] of [["IN_JAR", 1], ["WAITING", 1], ["SENT_BACK", 1], ["NOT_HANDED_IN", 1]] as const) {
    await expect(page.locator(`[data-count="${key}"] strong`)).toHaveText(String(n));
  }

  // Never a claim about the draft table.
  await expect(page.locator("main, body").first()).not.toContainText(/not started/i);
});

test("a pupil waiting for you links to that piece of work, and nobody else does", async ({ page }) => {
  await teacherLogin(page);
  await page.goto(`/teacher/activities/runs/${runId}`);
  // Only Bea has work waiting, so only Bea's row has the button.
  await expect(page.getByRole("link", { name: /^Look at .*'s work$/ })).toHaveCount(1);
  await page.getByRole("link", { name: "Look at Bea's work" }).click();
  await page.waitForURL(`**/teacher/queue/${beaItemId}`);
});

test("a chosen-pupil run lists only the pupils it was set to", async ({ page }) => {
  await teacherLogin(page);
  await page.goto(`/teacher/activities/runs/${chosenRunId}`);
  await expect(page.locator("li[data-pupil]")).toHaveCount(2);
  await expect(page.locator('li[data-pupil="Asha"]')).toBeVisible();
  await expect(page.locator('li[data-pupil="Dot"]')).toBeVisible();
  await expect(page.locator('li[data-pupil="Bea"]')).toHaveCount(0);
  await expect(page.getByText("0 of 2 pupils have handed something in")).toBeVisible();
});

test("the dashboard's live count is the Live now list's count, and lands on it", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities");
  const listed = await page.locator("#live-now li").count();
  expect(listed, "the fixture runs above are live, so the list cannot be empty").toBeGreaterThanOrEqual(2);

  await page.goto("/teacher");
  const card = page.getByRole("link", { name: /activities live now/ });
  await expect(card).toHaveText(new RegExp(`^\\s*${listed}\\s*activities live now\\s*$`));
  await card.click();
  await page.waitForURL("**/teacher/activities#live-now");
  await expect(page.locator("#live-now")).toBeVisible();
});

test("/teacher/activities/runs on its own goes to the Live now list", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/runs");
  await expect(page).toHaveURL(/\/teacher\/activities(#live-now)?$/);
  await expect(page.locator("#live-now")).toBeVisible();
});

test("the template page's runs open the run page, and its old per-pupil grid is gone", async ({ page }) => {
  await teacherLogin(page);
  await page.goto(`/teacher/activities/${templateId}`);
  await expect(page.getByText(/^Responses —/)).toHaveCount(0);
  await page.locator(`a[href="/teacher/activities/runs/${runId}"]`).click();
  await page.waitForURL(`**/teacher/activities/runs/${runId}`);
  // The author sees the way back to the activity.
  await expect(page.getByRole("link", { name: "Open the activity" })).toHaveAttribute(
    "href",
    `/teacher/activities/${templateId}?run=${runId}`,
  );
});

test("an id that is not a run in your class is a 404", async ({ page }) => {
  await teacherLogin(page);
  const res = await page.goto("/teacher/activities/runs/not-a-real-run");
  expect(res?.status()).toBe(404);
});
