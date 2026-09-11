import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_B, loginStudent } from "../helpers";

// ===========================================================================
// F79 · A chosen-pupil activity does not follow a child into next year's class.
//
// Every to-do query used to match a chosen-pupil run on its AssignmentStudent
// row alone, with no class. The September move-up (`moveClassUp`,
// src/app/actions/rollover.ts) moves the children with one
// `student.updateMany({ classId })` and archives last year's class without
// closing its runs, so a chosen-pupil run stayed on the child's list in their
// new class, opened, took drafts, and accepted a hand-in filed under last year's
// run. One definition now decides a pupil's list (src/lib/studentRuns.ts) and
// it requires the run's class to be the pupil's.
//
// The move is simulated with the same single write the move-up makes, because
// the property is what the pupil's list does AFTER the move, not the move-up
// screen (class-rollover.spec.ts owns that). The positive control is the same
// pupil, the same run, before the move. Run against the old query, this fails
// on the list: "To do · Beeches chosen · Start" in the new class.
// ===========================================================================

const db = new PrismaClient();
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const code = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";

test("a chosen-pupil run does not follow a child into their new class [F79]", async ({ page }) => {
  const teacher = await db.teacher.findFirstOrThrow({ where: { email: SCHOOL_B.teacher.email } });
  const mk = (name: string) =>
    db.class.create({ data: { name, ageMode: "KS1", classCode: code(), teacherId: teacher.id, schoolId: teacher.schoolId } });
  const lastYear = await mk("Rollover Rowans");
  const thisYear = await mk("Rollover Rowans next year");
  const ivy = await db.student.create({ data: { name: "Ivy", classId: lastYear.id } });
  const template = await db.activityTemplate.create({ data: { title: "Rowans activity", teacherId: teacher.id } });
  const run = await db.assignment.create({
    data: { templateId: template.id, classId: lastYear.id, wholeClass: false, status: "LIVE", title: "Rowans chosen", students: { create: [{ studentId: ivy.id }] } },
  });
  const draftStatus = () =>
    page.evaluate(
      async ({ contextKey, png }) =>
        (
          await fetch("/api/drafts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ surface: "ACTIVITY_RESPONSE", contextKey, pages: [png], fields: {} }),
          })
        ).status,
      { contextKey: run.id, png: TINY_PNG },
    );

  try {
    // Positive control: in her own class, the run she was chosen for is hers.
    await loginStudent(page, lastYear.classCode, "Ivy");
    await page.goto("/student/activities");
    await expect(page.getByText("Rowans chosen")).toBeVisible();
    expect(await draftStatus(), "and she may keep a draft of it").toBe(200);

    // September: Ivy moves up, as `moveClassUp` moves every child.
    await db.student.update({ where: { id: ivy.id }, data: { classId: thisYear.id } });
    await page.context().clearCookies();
    await loginStudent(page, thisYear.classCode, "Ivy");

    await page.goto("/student/activities");
    await expect(page.locator("body"), "last year's chosen-pupil run is not on this year's list").not.toContainText("Rowans chosen");
    await page.goto(`/student/activities/${run.id}`);
    await page.waitForURL((u) => u.pathname === "/student/activities");
    expect(await draftStatus(), "nor can she keep a draft for it").toBe(400);
  } finally {
    await db.draft.deleteMany({ where: { studentId: ivy.id } });
    await db.assignment.deleteMany({ where: { templateId: template.id } });
    await db.class.deleteMany({ where: { id: { in: [lastYear.id, thisYear.id] } } });
    await db.activityTemplate.deleteMany({ where: { id: template.id } });
    await db.$disconnect();
  }
});
