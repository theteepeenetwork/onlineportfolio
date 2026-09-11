import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_B, SCHOOL_C, loginTeacher } from "../helpers";

// ===========================================================================
// "Not needed" and "Put back" take a run id and a pupil id from a form
// (src/app/actions/runs.ts). AGENTS.md: a new action that takes an id gets a
// cross-tenant test before it ships. These are those, plus the two state rules
// the action enforces on the server.
//
// EVERY FORGERY IS A TAMPERED FORM THE SERVER RENDERED (agent memory, "forge by
// tampering"; the reason is recorded in class-handover.spec.ts): a hand-built
// POST is refused by Next before any application code runs, so an assertion
// against one proves nothing. Here the teacher opens their own run page, the
// genuine "Not needed" form for one of their own pupils is found, and its
// hidden `runId` / `studentId` are rewritten before the button is pressed.
//
// EVERY NEGATIVE HAS A POSITIVE CONTROL that differs from it by one thing: the
// same forgery aimed somewhere allowed, which writes a row. And every refusal
// is proved to have ARRIVED, not assumed: the action answers with a sentence
// and the form shows it, which a dropped request never would.
//
// The consequence is read from the database, because that is where a to-do
// list is decided.
//
// IT BUILDS ITS OWN ROWS in two schools and deletes them after.
// ===========================================================================

const db = new PrismaClient();

type World = {
  classIds: string[];
  templateIds: string[];
  bRun: string; // whole class, Oakfield teacher's
  bChosenRun: string; // chosen pupils: Ivy only
  bIvy: string;
  bJude: string;
  aRun: string; // St Bede's, Miss Malik's
  aKit: string;
};
let w: World;

// A class code from the real alphabet, like a real class's.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const code = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

async function makeClass(teacherEmail: string, name: string, pupils: string[]) {
  const teacher = await db.teacher.findFirstOrThrow({ where: { email: teacherEmail } });
  const klass = await db.class.create({
    data: { name, ageMode: "KS1", classCode: code(), teacherId: teacher.id, schoolId: teacher.schoolId },
  });
  const ids: Record<string, string> = {};
  for (const p of pupils) ids[p] = (await db.student.create({ data: { name: p, classId: klass.id } })).id;
  const template = await db.activityTemplate.create({ data: { title: `${name} activity`, teacherId: teacher.id } });
  return { klass, ids, template };
}

test.beforeAll(async () => {
  const b = await makeClass(SCHOOL_B.teacher.email, "Excusal Beeches", ["Ivy", "Jude"]);
  const a = await makeClass("a.malik@stbedes.sch.uk", "Excusal Alders", ["Kit"]);
  const bRun = await db.assignment.create({ data: { templateId: b.template.id, classId: b.klass.id, wholeClass: true, status: "LIVE", title: "Beeches whole class" } });
  const bChosenRun = await db.assignment.create({
    data: { templateId: b.template.id, classId: b.klass.id, wholeClass: false, status: "LIVE", title: "Beeches chosen", students: { create: [{ studentId: b.ids.Ivy }] } },
  });
  const aRun = await db.assignment.create({ data: { templateId: a.template.id, classId: a.klass.id, wholeClass: true, status: "LIVE", title: "Alders whole class" } });
  w = {
    classIds: [b.klass.id, a.klass.id],
    templateIds: [b.template.id, a.template.id],
    bRun: bRun.id,
    bChosenRun: bChosenRun.id,
    bIvy: b.ids.Ivy,
    bJude: b.ids.Jude,
    aRun: aRun.id,
    aKit: a.ids.Kit,
  };
});

test.afterEach(async () => {
  await db.assignmentExcusal.deleteMany({ where: { assignmentId: { in: [w.bRun, w.bChosenRun, w.aRun] } } });
  await db.journalItem.deleteMany({ where: { assignmentId: { in: [w.bRun, w.bChosenRun, w.aRun] } } });
});

test.afterAll(async () => {
  await db.assignment.deleteMany({ where: { templateId: { in: w.templateIds } } });
  await db.class.deleteMany({ where: { id: { in: w.classIds } } });
  await db.activityTemplate.deleteMany({ where: { id: { in: w.templateIds } } });
  await db.$disconnect();
});

// The action's answer, drawn inside the form that sent it. Scoped to the form
// because Next's route announcer is also role="alert" on every page.
const formAnswer = (page: Page) => page.locator('form [role="alert"]');

const marks = (runId: string, studentId: string) =>
  db.assignmentExcusal.count({ where: { assignmentId: runId, studentId } });

/**
 * On the teacher's own run page, find the genuine form behind `button`,
 * rewrite its hidden ids, press it, and wait for the server's answer.
 */
async function forgeAndPress(
  page: Page,
  runPage: string,
  button: string,
  forged: { runId?: string; studentId?: string },
  expectAnswer: RegExp | null,
) {
  await page.goto(`/teacher/activities/runs/${runPage}`);
  const btn = page.getByRole("button", { name: button, exact: true });
  await expect(btn).toBeVisible();
  const planted = await btn.evaluate((el, f) => {
    const form = el.closest("form");
    if (!form) return 0;
    let n = 0;
    for (const [k, v] of Object.entries(f)) {
      const input = form.querySelector<HTMLInputElement>(`input[name="${k}"]`);
      if (input && v) {
        input.value = v;
        n++;
      }
    }
    return n;
  }, forged);
  expect(planted, "the genuine form's hidden ids must be found and rewritten").toBe(Object.keys(forged).length);
  await btn.click();
  if (expectAnswer) {
    // The refusal arrived and was answered: a dropped request shows nothing.
    await expect(formAnswer(page)).toContainText(expectAnswer);
  }
}

test("School B cannot mark a School A pupil not needed [cross-tenant]", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);

  // POSITIVE CONTROL: the same forgery aimed at a pupil this teacher DOES hold —
  // Ivy's button, Jude's id. Jude gets the mark, Ivy does not.
  await forgeAndPress(page, w.bRun, "Not needed for Ivy", { studentId: w.bJude }, null);
  await expect.poll(() => marks(w.bRun, w.bJude), { message: "the planted id is the id the server acts on" }).toBe(1);
  expect(await marks(w.bRun, w.bIvy), "and the pupil named on the button is untouched").toBe(0);

  // THE NEGATIVE: one thing changes — the run and pupil are St Bede's.
  await forgeAndPress(page, w.bRun, "Not needed for Ivy", { runId: w.aRun, studentId: w.aKit }, /isn.t on this activity/i);
  expect(await marks(w.aRun, w.aKit), "no mark may be written for another school's pupil").toBe(0);
  expect(await marks(w.bRun, w.bIvy), "nor fall back onto the pupil the form named").toBe(0);

  // And the half-forgery: this teacher's own run, St Bede's pupil.
  await forgeAndPress(page, w.bRun, "Not needed for Ivy", { studentId: w.aKit }, /isn.t on this activity/i);
  expect(await marks(w.bRun, w.aKit), "a pupil from another school cannot be put on this run's marks").toBe(0);
});

test("School B cannot put a School A pupil back, either [cross-tenant]", async ({ page }) => {
  // A St Bede's mark that must survive, and one of Oakfield's own so the Put
  // back form renders at all.
  await db.assignmentExcusal.create({ data: { assignmentId: w.aRun, studentId: w.aKit } });
  await db.assignmentExcusal.create({ data: { assignmentId: w.bRun, studentId: w.bIvy } });
  await loginTeacher(page, SCHOOL_B.teacher);

  await forgeAndPress(page, w.bRun, "Put back on Ivy's list", { runId: w.aRun, studentId: w.aKit }, /isn.t on this activity/i);
  expect(await marks(w.aRun, w.aKit), "another school's mark must not be removable").toBe(1);
  expect(await marks(w.bRun, w.bIvy)).toBe(1);

  // POSITIVE CONTROL: the untampered form works.
  await page.goto(`/teacher/activities/runs/${w.bRun}`);
  await page.getByRole("button", { name: "Put back on Ivy's list", exact: true }).click();
  await expect.poll(() => marks(w.bRun, w.bIvy)).toBe(0);
});

test("a pupil who is not on a chosen-pupil run cannot be marked", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  // Jude is in the class and not chosen for this run.
  await forgeAndPress(page, w.bChosenRun, "Not needed for Ivy", { studentId: w.bJude }, /isn.t on this activity/i);
  expect(await marks(w.bChosenRun, w.bJude)).toBe(0);
  // Positive control: Ivy, who is on it.
  await page.goto(`/teacher/activities/runs/${w.bChosenRun}`);
  await page.getByRole("button", { name: "Not needed for Ivy", exact: true }).click();
  await expect.poll(() => marks(w.bChosenRun, w.bIvy)).toBe(1);
});

test("a pupil who handed in after the page was drawn cannot be marked (the stale tab)", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  const classId = w.classIds[0];

  // The page is drawn while Jude has nothing handed in, so the button exists…
  await page.goto(`/teacher/activities/runs/${w.bRun}`);
  const btn = page.getByRole("button", { name: "Not needed for Jude", exact: true });
  await expect(btn).toBeVisible();
  // …and then he hands in, before the teacher presses it.
  await db.journalItem.create({
    data: { type: "TEXT", textContent: "Three leaves.", status: "PENDING", authorRole: "STUDENT", studentId: w.bJude, classId, assignmentId: w.bRun },
  });
  await btn.click();
  await expect(formAnswer(page)).toContainText(/already handed something in/i);
  expect(await marks(w.bRun, w.bJude), "work that exists is not waved away").toBe(0);

  // The control differs by that row alone.
  await db.journalItem.deleteMany({ where: { assignmentId: w.bRun, studentId: w.bJude } });
  await page.goto(`/teacher/activities/runs/${w.bRun}`);
  await page.getByRole("button", { name: "Not needed for Jude", exact: true }).click();
  await expect.poll(() => marks(w.bRun, w.bJude)).toBe(1);
});

test("a frozen school's teacher reads the run page and cannot change a to-do list", async ({ page }) => {
  const c = await makeClass(SCHOOL_C.teacher.email, "Excusal Larches", ["Lark"]);
  const run = await db.assignment.create({ data: { templateId: c.template.id, classId: c.klass.id, wholeClass: true, status: "LIVE", title: "Larches whole class" } });
  try {
    await loginTeacher(page, SCHOOL_C.teacher);
    const res = await page.goto(`/teacher/activities/runs/${run.id}`);
    expect(res?.status(), "a frozen school still owes its teachers a readable screen").toBe(200);
    await page.getByRole("button", { name: "Not needed for Lark", exact: true }).click();
    await expect(formAnswer(page)).toContainText(/read-only/i);
    expect(await marks(run.id, c.ids.Lark)).toBe(0);
  } finally {
    await db.assignment.deleteMany({ where: { templateId: c.template.id } });
    await db.class.deleteMany({ where: { id: c.klass.id } });
    await db.activityTemplate.deleteMany({ where: { id: c.template.id } });
  }
});
