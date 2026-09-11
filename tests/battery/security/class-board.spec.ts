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
//
// A QUIZ HAND-IN MAY GO UP, AS ITS PICTURE AND NOTHING ELSE (owner decision,
// 10 September 2026, reversing the safeguarding review's exclusion of the same
// day). Its picture (`previewPathsJson`, drawn by DrawingCanvas's
// `drawQuizForPreview`) shows the questions, the options and the one the child
// chose, and never which option was right. What must not reach the browser is
// everything else the row holds about the quiz: the score, the total and the
// stored answers. So the quiz pieces here carry a score and a total no page
// would ever print by accident, and the source is searched for the numbers
// themselves as well as for the field names.
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
    const [ro, sam, tia, uma, vic] = await Promise.all(["Ro", "Sam", "Tia", "Uma", "Vic"].map((name) => db.student.create({ data: { name, classId: klass.id } })));
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
    // Two quiz hand-ins, stored the way createJournalItem stores one: the work
    // of record, the picture of it with the question boxes drawn on, the
    // server's score and total, and the child's answers as ids. One in a jar,
    // pickable at once, and one waiting, pickable only once opened. The score
    // and total are six-digit numbers so that "absent from the page" is a real
    // search and not a coincidence with a "1 of 2" somewhere else.
    const SCORE = { uma: 739024, vic: 612587 };
    const TOTAL = { uma: 851663, vic: 794318 };
    const quiz = (who: "uma" | "vic") => ({
      mediaPath: `/uploads/${MARK}-${who}.png`,
      previewPathsJson: JSON.stringify([`/uploads/${MARK}-${who}-preview.png`]),
      quizScore: SCORE[who],
      quizTotal: TOTAL[who],
      quizAnswersJson: JSON.stringify([{ questionId: `q-${MARK}-${who}`, selectedOptionId: `opt-${MARK}-${who}` }]),
    });
    await db.journalItem.create({ data: { ...base, status: "APPROVED", approvedAt: new Date(), studentId: uma.id, ...quiz("uma") } });
    await db.journalItem.create({ data: { ...base, status: "PENDING", studentId: vic.id, ...quiz("vic") } });
    await db.journalItem.create({ data: { ...base, status: "PENDING", studentId: sam.id, mediaPath: `/uploads/${MARK}-sam.svg`, caption: `pending-caption-${MARK}` } });
    await db.journalItem.create({ data: { ...base, status: "RETURNED", studentId: tia.id, mediaPath: `/uploads/${MARK}-tia.svg`, teacherNote: `note-${MARK}` } });

    await loginTeacher(page, SCHOOL_B.teacher);
    const res = await page.goto(`/teacher/activities/runs/${run.id}`);
    expect(res?.status()).toBe(200);
    const source = await page.content();

    // Positive control: the board was given the four pieces it may show. A
    // quiz hand-in is given its PICTURE, the page as it looked with the
    // child's chosen answers on it, as the page to show.
    expect(source).toContain(`/uploads/${MARK}-ro.svg`);
    expect(source).toContain(`/uploads/${MARK}-sam.svg`);
    expect(source).toContain(`/uploads/${MARK}-uma-preview.png`);
    expect(source).toContain(`/uploads/${MARK}-vic-preview.png`);

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

    // A quiz hand-in's score and total are not in the page in any form: not
    // as fields (the loop above), and not as the numbers themselves, so not
    // as an "n of m" either. Its stored answers are not there (their ids are
    // in the first loop). The picture already
    // shows the chosen answers; nothing may say whether they were right.
    for (const who of ["uma", "vic"] as const) {
      expect(source, `${who}'s quiz score must never reach the page`).not.toContain(String(SCORE[who]));
      expect(source, `${who}'s quiz total must never reach the page`).not.toContain(String(TOTAL[who]));
      // The work of record is not sent either: the board shows the picture,
      // and the flattened page without the question boxes is not needed.
      expect(source, `${who}'s work of record is not what the board is given`).not.toContain(`${MARK}-${who}.png`);
    }

    // All four are offered, the quiz hand-ins with them.
    const offered = await page.locator("li[data-board-piece]").evaluateAll((els) => els.map((e) => e.getAttribute("data-board-piece")));
    expect(offered.sort()).toEqual(["Ro", "Sam", "Uma", "Vic"]);

    // On the same rules as a drawing. In a jar: drawn in the list and
    // pickable. Waiting: no picture in the list and no tick until opened.
    const piece = (name: string) => page.locator(`li[data-board-piece="${name}"]`);
    const tick = (name: string) => piece(name).getByRole("checkbox", { name: "Add to the board" });
    await expect(piece("Uma").locator(`img[src="/uploads/${MARK}-uma-preview.png"]`)).toHaveCount(1);
    await expect(tick("Uma")).toBeEnabled();
    await expect(piece("Vic").locator("img"), "a waiting quiz's picture is not drawn before it is opened").toHaveCount(0);
    await expect(tick("Vic")).toBeDisabled();
    expect(await page.locator(`img[src*="${MARK}-vic-preview"]`).count(), "nowhere on the page").toBe(0);

    // Opening it full size shows the picture and nothing about the mark: the
    // viewer on this page is given no score, because this page may be the one
    // on the projector.
    await page.getByRole("button", { name: /^Open Vic's work/ }).click();
    const viewer = page.getByRole("dialog", { name: "Vic's work" });
    await expect(viewer.locator(`img[src="/uploads/${MARK}-vic-preview.png"]`)).toHaveCount(1);
    await expect(viewer).not.toContainText(String(SCORE.vic));
    await expect(viewer).not.toContainText(/quiz/i);
    await viewer.getByRole("button", { name: "Close" }).click();
    await expect(tick("Vic"), "once opened, a waiting quiz can be picked").toBeEnabled();
    // And opening it fetched nothing new about it: the page source after the
    // look carries the score no more than it did before.
    expect(await page.content()).not.toContain(String(SCORE.vic));
  } finally {
    await db.assignment.deleteMany({ where: { templateId: template.id } });
    await db.class.deleteMany({ where: { id: klass.id } });
    await db.activityTemplate.deleteMany({ where: { id: template.id } });
    await db.$disconnect();
  }
});
