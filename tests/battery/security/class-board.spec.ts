import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// SAFEGUARDING rule 25: what the board is GIVEN is what it shows, and no more.
//
// The run page hands the board component an id, a first name, a status and the
// page pictures for each piece of work that may go up. The caption a child
// typed, their quiz score, the teacher's note and praise, and anything sent
// back must never reach the browser at all — a prop that is serialised and
// never rendered is still in the page, and a projector's laptop is a shared
// device. So this reads the raw page source (HTML and the flight payload),
// not the rendered text.
//
// With a positive control on the same response: the piece's own picture path
// IS in the source, so the absences below are the shape of the data and not a
// page that rendered nothing.
// ===========================================================================

const db = new PrismaClient();
const MARK = "zqboard";

test("the board's data carries pictures and names, never a caption, a score or a note", async ({ page }) => {
  const teacher = await db.teacher.findFirstOrThrow({ where: { email: SCHOOL_B.teacher.email } });
  const klass = await db.class.create({
    data: { name: "Board Source Class", ageMode: "KS1", classCode: `BS${Date.now().toString(36).slice(-4).toUpperCase()}`, teacherId: teacher.id, schoolId: teacher.schoolId },
  });
  const template = await db.activityTemplate.create({ data: { title: "Board source activity", teacherId: teacher.id } });
  try {
    const run = await db.assignment.create({ data: { templateId: template.id, classId: klass.id, wholeClass: true, status: "LIVE", title: "Board source activity" } });
    const [ro, sam, tia] = await Promise.all(["Ro", "Sam", "Tia"].map((name) => db.student.create({ data: { name, classId: klass.id } })));
    const base = { authorRole: "STUDENT", classId: klass.id, assignmentId: run.id, type: "DRAWING" };
    await db.journalItem.create({
      data: {
        ...base,
        status: "APPROVED",
        approvedAt: new Date(),
        studentId: ro.id,
        mediaPath: `/uploads/${MARK}-ro.svg`,
        caption: `caption-${MARK}`,
        quizScore: 7,
        quizTotal: 9,
        quizAnswersJson: JSON.stringify([{ questionId: `q-${MARK}`, selectedOptionId: `opt-${MARK}` }]),
        praiseNote: `praise-${MARK}`,
        stickersJson: JSON.stringify(["star"]),
      },
    });
    await db.journalItem.create({ data: { ...base, status: "PENDING", studentId: sam.id, mediaPath: `/uploads/${MARK}-sam.svg`, caption: `pending-caption-${MARK}` } });
    await db.journalItem.create({ data: { ...base, status: "RETURNED", studentId: tia.id, mediaPath: `/uploads/${MARK}-tia.svg`, teacherNote: `note-${MARK}` } });

    await loginTeacher(page, SCHOOL_B.teacher);
    const res = await page.goto(`/teacher/activities/runs/${run.id}`);
    expect(res?.status()).toBe(200);
    const source = await page.content();

    // Positive control: the board was given the two pieces it may show.
    expect(source).toContain(`/uploads/${MARK}-ro.svg`);
    expect(source).toContain(`/uploads/${MARK}-sam.svg`);

    // And nothing else about them.
    for (const secret of [`caption-${MARK}`, `pending-caption-${MARK}`, `praise-${MARK}`, `note-${MARK}`, `q-${MARK}`, `opt-${MARK}`]) {
      expect(source, `"${secret}" must never reach the page`).not.toContain(secret);
    }
    // The column names too, in whatever quoting the flight payload uses: a
    // field that arrived empty is still a field somebody will one day fill.
    for (const field of ["quizScore", "quizTotal", "quizAnswersJson", "stickersJson", "praiseNote", "teacherNote"]) {
      expect(source, `the field "${field}" must not be in the board's data`).not.toContain(field);
    }
    // Sent-back work is not offered, so its picture is not even in the page.
    expect(source).not.toContain(`/uploads/${MARK}-tia.svg`);
  } finally {
    await db.assignment.deleteMany({ where: { templateId: template.id } });
    await db.class.deleteMany({ where: { id: klass.id } });
    await db.activityTemplate.deleteMany({ where: { id: template.id } });
    await db.$disconnect();
  }
});
