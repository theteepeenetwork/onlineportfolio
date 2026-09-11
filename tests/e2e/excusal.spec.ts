import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, drawOnCanvas } from "./helpers";

// ===========================================================================
// "Not needed": a teacher takes an activity off one pupil's to-do list
// (teacher feedback, item 5), and can put it back.
//
// What a pupil sees is the whole point, so every assertion here is on a
// pupil's own screens, in both registers that list activities differently:
// KS1 names each one on the jar, EYFS shows only a count and a button.
//
// IT BUILDS ITS OWN CLASSES, for the reason run-page.spec.ts gives: the demo
// runs are handed in and sent back by the files before this one.
// ===========================================================================

const db = new PrismaClient();

// Class codes from the real alphabet (no 0/O, 1/I/L), because a pupil in these
// tests signs in by typing one.
const KS1 = { name: "Otter Class (not needed)", code: "XQTTR7", pupils: ["Nell", "Otis"] };
const EYFS = { name: "Puffin Class (not needed)", code: "XPFFN8", pupils: ["Pia"] };
const TITLE = "Autumn leaves (not needed)";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";

let templateId = "";
const classIds: string[] = [];
const runs: Record<string, string> = {}; // class name -> run id
const pupilIds: Record<string, string> = {};

test.beforeAll(async () => {
  const teacher = await db.teacher.findFirstOrThrow({ where: { email: "teacher@school.uk" } });
  const template = await db.activityTemplate.create({
    data: { title: TITLE, instructions: "Draw three leaves.", teacherId: teacher.id },
  });
  templateId = template.id;
  for (const [c, mode] of [[KS1, "KS1"], [EYFS, "EYFS"]] as const) {
    await db.class.deleteMany({ where: { classCode: c.code } });
    const klass = await db.class.create({
      data: { name: c.name, classCode: c.code, ageMode: mode, teacherId: teacher.id, schoolId: teacher.schoolId },
    });
    classIds.push(klass.id);
    for (const name of c.pupils) {
      pupilIds[name] = (await db.student.create({ data: { name, classId: klass.id } })).id;
    }
    runs[c.name] = (
      await db.assignment.create({
        data: { templateId: template.id, classId: klass.id, wholeClass: true, status: "LIVE", title: TITLE, instructions: template.instructions },
      })
    ).id;
  }
});

test.afterAll(async () => {
  await db.assignment.deleteMany({ where: { templateId } });
  await db.class.deleteMany({ where: { id: { in: classIds } } });
  await db.activityTemplate.deleteMany({ where: { id: templateId } });
  await db.$disconnect();
});

async function pupilSignIn(page: Page, code: string, name: string) {
  await page.context().clearCookies();
  await page.goto(`/login/student?code=${code}`);
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/student");
}

async function pressOnRunPage(page: Page, runId: string, button: RegExp) {
  await page.context().clearCookies();
  await teacherLogin(page);
  await page.goto(`/teacher/activities/runs/${runId}`);
  await page.getByRole("button", { name: button }).click();
}

const excusalCount = (runId: string, studentId: string) =>
  db.assignmentExcusal.count({ where: { assignmentId: runId, studentId } });

test("Not needed takes it off a KS1 pupil's jar and activities list, and Put back brings it back", async ({ page }) => {
  const runId = runs[KS1.name];

  // Before: it is Nell's to do.
  await pupilSignIn(page, KS1.code, "Nell");
  await expect(page.getByText(TITLE).first()).toBeVisible();

  await pressOnRunPage(page, runId, /^Not needed for Nell$/);
  await expect(page.locator('li[data-pupil="Nell"]')).toHaveAttribute("data-status", "NOT_NEEDED");
  await expect(page.locator('li[data-pupil="Nell"]')).toContainText("Not needed");
  expect(await excusalCount(runId, pupilIds.Nell)).toBe(1);
  // The count leaves her out: one pupil left to do it, not two.
  await expect(page.getByText("0 of 1 pupil has handed something in")).toBeVisible();

  // Nell's own screens.
  await pupilSignIn(page, KS1.code, "Nell");
  await expect(page.locator("body")).not.toContainText(TITLE);
  await page.goto("/student/activities");
  await expect(page.locator("body")).not.toContainText(TITLE);
  // A direct link (an old bookmark, a tab left open on the list) goes to the list.
  await page.goto(`/student/activities/${runId}`);
  await page.waitForURL((u) => u.pathname === "/student/activities");

  // Otis, in the same class, still has it.
  await pupilSignIn(page, KS1.code, "Otis");
  await expect(page.getByText(TITLE).first()).toBeVisible();

  // Put back.
  await pressOnRunPage(page, runId, /^Put back on Nell's list$/);
  await expect(page.locator('li[data-pupil="Nell"]')).toHaveAttribute("data-status", "NOT_HANDED_IN");
  expect(await excusalCount(runId, pupilIds.Nell)).toBe(0);
  await pupilSignIn(page, KS1.code, "Nell");
  await expect(page.getByText(TITLE).first()).toBeVisible();
});

test("the EYFS jar's activity count leaves out a run marked not needed", async ({ page }) => {
  const runId = runs[EYFS.name];
  const activitiesButton = page.locator('a[href="/student/activities"]');

  await pupilSignIn(page, EYFS.code, "Pia");
  await expect(activitiesButton.first(), "positive control: the EYFS jar offers her activity").toBeVisible();

  await pressOnRunPage(page, runId, /^Not needed for Pia$/);
  await expect(page.locator('li[data-pupil="Pia"]')).toHaveAttribute("data-status", "NOT_NEEDED");

  await pupilSignIn(page, EYFS.code, "Pia");
  await expect(activitiesButton).toHaveCount(0);
  await page.goto("/student/activities");
  await expect(page.locator("body")).not.toContainText(TITLE);

  await pressOnRunPage(page, runId, /^Put back on Pia's list$/);
  await pupilSignIn(page, EYFS.code, "Pia");
  await expect(activitiesButton.first()).toBeVisible();
});

test("a draft for a run marked not needed is refused, and accepted again once it is put back", async ({ page }) => {
  const runId = runs[KS1.name];
  const saveDraft = () =>
    page.evaluate(
      async ({ contextKey, png }) =>
        (
          await fetch("/api/drafts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ surface: "ACTIVITY_RESPONSE", contextKey, pages: [png], fields: {} }),
          })
        ).status,
      { contextKey: runId, png: TINY_PNG },
    );

  await pupilSignIn(page, KS1.code, "Otis");
  expect(await saveDraft(), "positive control: Otis may keep a draft of his own activity").toBe(200);

  await db.assignmentExcusal.create({ data: { assignmentId: runId, studentId: pupilIds.Otis } });
  try {
    expect(await saveDraft(), "a run off his list is not a run he can keep a draft for").toBe(400);
  } finally {
    await db.assignmentExcusal.deleteMany({ where: { assignmentId: runId, studentId: pupilIds.Otis } });
    await db.draft.deleteMany({ where: { assignmentId: runId, studentId: pupilIds.Otis } });
  }
  expect(await saveDraft()).toBe(200);
  await db.draft.deleteMany({ where: { assignmentId: runId, studentId: pupilIds.Otis } });
});

test("a pupil whose page was already open can still hand in, and the mark is cleared", async ({ page, browser }) => {
  const runId = runs[KS1.name];

  // Otis opens the activity and starts drawing…
  await pupilSignIn(page, KS1.code, "Otis");
  await page.goto(`/student/activities/${runId}`);
  await drawOnCanvas(page);

  // …while his teacher, at her desk, marks it not needed for him.
  const desk = await browser.newContext();
  const teacher = await desk.newPage();
  await pressOnRunPage(teacher, runId, /^Not needed for Otis$/);
  await expect(teacher.locator('li[data-pupil="Otis"]')).toHaveAttribute("data-status", "NOT_NEEDED");
  expect(await excusalCount(runId, pupilIds.Otis)).toBe(1);

  // He finishes and hands it in. A child's finished work is never turned away.
  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /hand it in/i }).click();
  await page.waitForURL((u) => u.pathname === "/student/popped");

  const item = await db.journalItem.findFirst({ where: { assignmentId: runId, studentId: pupilIds.Otis } });
  expect(item?.status, "his work is in the queue like anybody else's").toBe("PENDING");
  expect(await excusalCount(runId, pupilIds.Otis), "and the mark went in the same transaction").toBe(0);

  await teacher.reload();
  await expect(teacher.locator('li[data-pupil="Otis"]')).toHaveAttribute("data-status", "WAITING");
  await desk.close();
});

test("a pupil who has handed something in is never offered Not needed", async ({ page }) => {
  // Otis handed in above; Nell has not.
  const runId = runs[KS1.name];
  await teacherLogin(page);
  await page.goto(`/teacher/activities/runs/${runId}`);
  await expect(page.getByRole("button", { name: /^Not needed for Nell$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Not needed for Otis$/ })).toHaveCount(0);
});
