"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createJournalItem } from "@/app/actions/journal";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { studentCopy } from "@/lib/copy/student";
import type { AgeMode } from "@/lib/ageMode";
import type { QuizPayload, QuizAnswer } from "@/lib/quiz";
import type { CanvasObj } from "@/lib/canvasObjects";

// A child responds to an activity by working on top of its template, on the
// full-screen canvas.
export function ActivityResponseForm({
  assignmentId,
  studentId,
  mode,
  title,
  instructions,
  template,
  quiz,
  objects,
  resumeMode,
  teacherNote,
  initialAnswers,
  wrongIds,
  quizReview,
}: {
  assignmentId: string;
  studentId: string;
  /** The child's register, for the words on the way out. */
  mode: AgeMode;
  title: string;
  instructions?: string;
  template: string[];
  quiz?: QuizPayload;
  objects?: CanvasObj[][];
  // Reopening a handed-back activity: "continue" restores the child's saved work
  // (fully editable), "fresh" starts them again on the blank template.
  resumeMode?: "continue" | "fresh";
  /** What the teacher asked them to change, when this is a reopened piece (F38). */
  teacherNote?: string;
  // On a "carry on" quiz reopen: the answers they got right (pre-filled + locked
  // green), with the review flag; wrong ones are omitted so they retry them.
  initialAnswers?: QuizAnswer[];
  // Which of those they got wrong, so the canvas can say which to look at
  // again. Never which option is right.
  wrongIds?: string[];
  quizReview?: boolean;
}) {
  const [state, action] = useActionState(createJournalItem, {});
  const router = useRouter();
  const c = studentCopy(mode).add;

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
        wrongIds={wrongIds}
        quizReview={quizReview}
        objectMode={objects && objects.length ? "answer" : undefined}
        initialObjects={objects}
        resumeMode={resumeMode}
        teacherNote={teacherNote}
        draftKey={`resp:${assignmentId}:${studentId}`}
        ownerId={studentId}
        confirmSubmit
        allowPageDelete={false}
        // Every way out of a child screen lands on the jar, in the words of
        // their own register: the one landmark a non-reader navigates by, and
        // the place the complaint asked for. The activities list is one tap
        // from there. An unlabelled ✕ to the list was not a way back that a
        // four-year-old could see.
        captionLabel={c.captionLabel}
        // The registers that cannot read yet get a listen button on the
        // question. KS2 does not — the same line CaptureSurface already draws
        // between "shown a speaker" and "reads it themselves". Whether the
        // button actually appears is decided again inside, on whether the
        // platform has an on-device voice to say it with.
        hearItLabel={mode === "KS2" ? undefined : studentCopy(mode).status.hearIt}
        closeLabel={c.backToJar}
        onClose={() => router.push("/student")}
      />

      {state?.error && (
        <p className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-rose-600 px-3 py-2 text-sm text-white shadow-lg">
          {state.error}
        </p>
      )}
    </form>
  );
}
