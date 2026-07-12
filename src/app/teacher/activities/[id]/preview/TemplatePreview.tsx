"use client";

import { useRouter } from "next/navigation";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import type { QuizPayload } from "@/lib/quiz";

// A read-only "view as a child" preview: the exact full-screen canvas a pupil
// gets for this activity, but nothing is saved. The ✓ and Close both just take
// the teacher back — no journal item is ever created (no form / no draftKey).
export function TemplatePreview({
  templateId,
  title,
  instructions,
  pages,
  quiz,
}: {
  templateId: string;
  title: string;
  instructions?: string;
  pages: string[];
  quiz?: QuizPayload;
}) {
  const router = useRouter();
  const back = () => router.push(`/teacher/activities/${templateId}`);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-2">
        <span className="pointer-events-auto rounded-full border-2 border-brand bg-white px-4 py-1.5 text-sm font-bold text-brand shadow">
          👀 Preview — this is what your pupils see. Nothing is saved.
        </span>
      </div>
      <DrawingCanvas
        name="__preview"
        fullScreen
        withCaption
        allowImport
        title={title}
        subtitle={instructions}
        background={pages.length ? pages : undefined}
        quizMode={quiz && quiz.questions.length ? "answer" : undefined}
        initialQuiz={quiz}
        onClose={back}
        onDone={back}
      />
    </>
  );
}
