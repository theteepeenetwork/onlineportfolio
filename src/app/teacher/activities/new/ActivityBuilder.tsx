"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { createTemplate } from "@/app/actions/activities";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import type { QuizPayload } from "@/lib/quiz";
import { markDraftForClear } from "@/lib/draftStore";

// Build a reusable template: title, instructions, tags, and an optional
// template canvas. Assigning it to a class is a separate step (the assign sheet).
export function ActivityBuilder({ teacherId }: { teacherId: string }) {
  const [state, action, pending] = useActionState(createTemplate, {});

  // The template is built on the exact same full-screen canvas the children
  // use. It's opened as an editor; on ✓ Done the pages are handed back here.
  const [templatePages, setTemplatePages] = useState<string[]>([]);
  const [quiz, setQuiz] = useState<QuizPayload>({ questions: [] });
  const [editorOpen, setEditorOpen] = useState(false);

  // Refs to the uncontrolled fields so the autosave draft captures/restores them.
  const titleRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const tagsRef = useRef<HTMLInputElement>(null);
  const draftKey = `tmpl-new:${teacherId}`;

  return (
    <form
      action={action}
      className="space-y-6"
      onSubmit={() => markDraftForClear(draftKey, "TEMPLATE_NEW", "tmpl-new")} // saving redirects on success → clear local + server draft there
    >
      <input type="hidden" name="templatePages" value={JSON.stringify(templatePages)} />
      <input type="hidden" name="quizPayload" value={JSON.stringify(quiz)} />

      {/* Title + instructions + tags */}
      <div className="card space-y-4 p-5">
        <div>
          <label className="label" htmlFor="title">
            Template title
          </label>
          <input ref={titleRef} id="title" name="title" className="input" placeholder="e.g. Make 10 — part-whole model" required />
        </div>
        <div>
          <label className="label" htmlFor="instructions">
            Instructions (optional)
          </label>
          <textarea
            ref={instructionsRef}
            id="instructions"
            name="instructions"
            rows={3}
            className="input"
            placeholder="Tell the children what to do. Keep it short — you can read it aloud too."
          />
        </div>
        <div>
          <label className="label" htmlFor="tags">
            Tags (optional)
          </label>
          <input ref={tagsRef} id="tags" name="tags" className="input" placeholder="Maths, Number  — comma separated" />
          <p className="mt-1 text-xs text-muted">Used to filter your library.</p>
        </div>
      </div>

      {/* Template */}
      <div className="card p-5">
        <h2 className="text-lg font-bold">Template (optional)</h2>
        <p className="mb-3 text-sm text-muted">
          Build a template on the same canvas the children use — draw it, or add a
          PDF / picture (for example a worksheet). Leave it blank for a free response.
          Use <span className="font-semibold">❓ Quiz</span> in the ＋ menu to add
          multiple-choice questions across the pages.
        </p>

        {quiz.questions.length > 0 && (
          <p className="mb-3 inline-block rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand">
            ❓ {quiz.questions.length} quiz question{quiz.questions.length === 1 ? "" : "s"}
          </p>
        )}

        {templatePages.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {templatePages.map((src, i) => (
              <Image key={i} src={src} alt={`Template page ${i + 1}`} width={160} height={112} unoptimized className="h-24 w-auto rounded-lg border border-border" />
            ))}
          </div>
        )}

        <button type="button" onClick={() => setEditorOpen(true)} className="btn-brand">
          {templatePages.length > 0 || quiz.questions.length > 0 ? "🎨 Edit template & quiz" : "🎨 Build a template or quiz"}
        </button>
        {(templatePages.length > 0 || quiz.questions.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setTemplatePages([]);
              setQuiz({ questions: [] });
            }}
            className="ml-2 rounded-lg px-3 py-2 text-sm text-muted hover:text-rose-600"
          >
            Remove template
          </button>
        )}
      </div>

      {editorOpen && (
        <DrawingCanvas
          name="__templateEditor"
          fullScreen
          allowImport
          quizMode="author"
          initialQuiz={quiz}
          title="Build the template"
          subtitle="Draw or add a PDF / picture, and add quiz questions with ❓ Quiz."
          background={templatePages.length ? templatePages : undefined}
          draftKey={draftKey}
          ownerId={teacherId}
          getExtraDraftFields={() => ({
            title: titleRef.current?.value ?? "",
            instructions: instructionsRef.current?.value ?? "",
            tags: tagsRef.current?.value ?? "",
          })}
          onRestoreFields={(f) => {
            if (titleRef.current && typeof f.title === "string") titleRef.current.value = f.title;
            if (instructionsRef.current && typeof f.instructions === "string") instructionsRef.current.value = f.instructions;
            if (tagsRef.current && typeof f.tags === "string") tagsRef.current.value = f.tags;
          }}
          onClose={() => setEditorOpen(false)}
          onDone={(pages, q) => {
            setTemplatePages(pages);
            setQuiz(q ?? { questions: [] });
            setEditorOpen(false);
          }}
        />
      )}

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-brand w-full py-3 text-lg">
        {pending ? "Saving…" : "Save to library"}
      </button>
      <p className="text-center text-sm text-muted">You&apos;ll assign it to a class on the next screen.</p>
    </form>
  );
}
