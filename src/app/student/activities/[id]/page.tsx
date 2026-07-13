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
    select: { status: true, returnMode: true, quizAnswersJson: true },
  });
  if (mine && mine.status !== "RETURNED") redirect("/student");

  // How a sent-back activity reopens: "continue" restores the child's saved work
  // (their strokes and objects, fully editable); "fresh" (or legacy null) starts
  // again on the blank template. The canvas resolves the saved work itself.
  const resumeMode =
    mine?.status === "RETURNED" ? (mine.returnMode === "CONTINUE" ? "continue" : "fresh") : undefined;

  // On a "carry on" reopen of a quiz, keep the answers they got right (locked +
  // shown green) and clear the ones they got wrong so they can try those again.
  // Correctness is resolved here against the frozen snapshot; only the correct
  // picks are passed on (wrong / unanswered are simply omitted).
  const quiz = readQuiz(assignment.quizSnapshotJson);
  let initialAnswers: QuizAnswer[] | undefined;
  if (resumeMode === "continue" && quiz.questions.length) {
    const prev = new Map(readAnswers(mine?.quizAnswersJson).map((a) => [a.questionId, a.selectedOptionId]));
    initialAnswers = quiz.questions
      .filter((q) => prev.get(q.id) === q.correctOptionId)
      .map((q) => ({ questionId: q.id, selectedOptionId: q.correctOptionId }));
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
      initialAnswers={initialAnswers}
      quizReview={resumeMode === "continue" && quiz.questions.length > 0}
    />
  );
}
