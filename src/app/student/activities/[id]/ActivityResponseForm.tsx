"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createJournalItem } from "@/app/actions/journal";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import type { QuizPayload, QuizAnswer } from "@/lib/quiz";
import type { CanvasObj } from "@/lib/canvasObjects";

// A child responds to an activity by working on top of its template, on the
// full-screen canvas.
export function ActivityResponseForm({
  assignmentId,
  studentId,
  title,
  instructions,
  template,
  quiz,
  objects,
  resumeMode,
  initialAnswers,
  quizReview,
}: {
  assignmentId: string;
  studentId: string;
  title: string;
  instructions?: string;
  template: string[];
  quiz?: QuizPayload;
  objects?: CanvasObj[][];
  // Reopening a handed-back activity: "continue" restores the child's saved work
  // (fully editable), "fresh" starts them again on the blank template.
  resumeMode?: "continue" | "fresh";
  // On a "carry on" quiz reopen: the answers they got right (pre-filled + locked
  // green), with the review flag; wrong ones are omitted so they retry them.
  initialAnswers?: QuizAnswer[];
  quizReview?: boolean;
}) {
  const [state, action] = useActionState(createJournalItem, {});
  const router = useRouter();

  return (
    <form action={action}>
      <input type="hidden" name="type" value="DRAWING" />
      <input type="hidden" name="assignmentId" value={assignmentId} />

      <DrawingCanvas
        name="drawingPages"
        fullScreen
        withCaption
        title={title}
        subtitle={instructions}
        background={template.length ? template : undefined}
        allowImport
        quizMode={quiz && quiz.questions.length ? "answer" : undefined}
        initialQuiz={quiz}
        initialAnswers={initialAnswers}
        quizReview={quizReview}
        objectMode={objects && objects.length ? "answer" : undefined}
        initialObjects={objects}
        resumeMode={resumeMode}
        draftKey={`resp:${assignmentId}:${studentId}`}
        ownerId={studentId}
        confirmSubmit
        allowPageDelete={false}
        onClose={() => router.push("/student/activities")}
      />

      {state?.error && (
        <p className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-rose-600 px-3 py-2 text-sm text-white shadow-lg">
          {state.error}
        </p>
      )}
    </form>
  );
}
