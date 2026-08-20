import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonArray } from "@/lib/activities";
import { readQuiz, readAnswers, type QuizAnswer } from "@/lib/quiz";
import { readTemplateObjects } from "@/lib/canvasObjects";
import { ActivityResponseForm } from "./ActivityResponseForm";

export default async function RespondToActivity({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "STUDENT") return null;
  const { id } = await params;

  // The run (assignment) must be live and assigned to this child.
  const assignment = await db.assignment.findFirst({
    where: {
      id,
      status: "LIVE",
      OR: [
        { wholeClass: true, classId: user.student.classId },
        { wholeClass: false, students: { some: { studentId: user.student.id } } },
      ],
    },
  });
  if (!assignment) notFound();

  // This child's response to the run, if any. A RETURNED item means the teacher
  // asked for another go, so the child may reopen and re-submit (createJournalItem
  // updates it in place). Any other status = already handed in → their journal.
  const mine = await db.journalItem.findFirst({
    where: { assignmentId: id, studentId: user.student.id },
    orderBy: { createdAt: "desc" },
    select: { status: true, returnMode: true, quizAnswersJson: true, teacherNote: true },
  });
  if (mine && mine.status !== "RETURNED") redirect("/student");

  // How a sent-back activity reopens: "continue" restores the child's saved work
  // (their strokes and objects, fully editable); "fresh" (or legacy null) starts
  // again on the blank template. The canvas resolves the saved work itself.
  const resumeMode =
    mine?.status === "RETURNED" ? (mine.returnMode === "CONTINUE" ? "continue" : "fresh") : undefined;

  // On a "carry on" reopen of a quiz, every previous answer comes back: the ones
  // they got right are locked and ticked, and the ones they got wrong are
  // returned AS THEY ANSWERED THEM and marked for another look.
  //
  // The wrong ones used to be dropped, which meant a child reopening a nine out
  // of ten saw nine green questions and one that looked as though they had never
  // done it. "Have another go at this one" is a different thing to say than
  // nothing at all, and it is the whole reason sending work back is kinder than
  // making them start again.
  //
  // Correctness is resolved HERE, against the frozen snapshot. `wrongIds` says
  // which questions to look at again and nothing more — the client is never told
  // which option is the right one, so changing an answer stays a decision rather
  // than a copy.
  const quiz = readQuiz(assignment.quizSnapshotJson);
  let initialAnswers: QuizAnswer[] | undefined;
  let wrongIds: string[] | undefined;
  if (resumeMode === "continue" && quiz.questions.length) {
    const prev = new Map(readAnswers(mine?.quizAnswersJson).map((a) => [a.questionId, a.selectedOptionId]));
    const answered = quiz.questions.filter((q) => prev.get(q.id) != null);
    initialAnswers = answered.map((q) => ({
      questionId: q.id,
      selectedOptionId: prev.get(q.id)!,
    }));
    wrongIds = answered.filter((q) => prev.get(q.id) !== q.correctOptionId).map((q) => q.id);
  }

  return (
    <ActivityResponseForm
      assignmentId={assignment.id}
      studentId={user.student.id}
      title={assignment.title}
      instructions={assignment.instructions ?? undefined}
      template={jsonArray(assignment.templateSnapshotJson)}
      quiz={quiz}
      objects={readTemplateObjects(assignment.objectsSnapshotJson).pages}
      resumeMode={resumeMode}
      // What the teacher asked them to change, on the work itself (F38). Read
      // only when this child's own response is RETURNED, so it is never anyone
      // else's words and never on a first attempt.
      teacherNote={mine?.status === "RETURNED" ? mine.teacherNote ?? undefined : undefined}
      initialAnswers={initialAnswers}
      wrongIds={wrongIds}
      quizReview={resumeMode === "continue" && quiz.questions.length > 0}
    />
  );
}
