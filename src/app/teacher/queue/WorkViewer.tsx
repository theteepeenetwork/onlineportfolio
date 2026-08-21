"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { workPages } from "@/lib/journalMedia";

export type QuizLine = {
  prompt: string;
  chosen: { text: string; imagePath?: string } | null;
  correct: { text: string; imagePath?: string } | null;
  isCorrect: boolean;
};

// The child's work, big enough to actually look at.
//
// The queue is the approval gate — nothing reaches a jar until a teacher acts
// on it — and until now the only thing that gate showed them was an 84×64
// crop. A teacher was being asked to approve work they could not see. This is
// the "open it" the queue was missing.
//
// `contain`, never `cover`: the thumbnails crop, which is fine for a list, but
// cropping the thing being judged hides the corner a child drew something in.
//
// Not a focus trap. `src/app/ops/ConfirmAction.tsx` sets out this codebase's
// case against them — "a dialog that fails to restore focus strands a keyboard
// user" — so this closes on Escape, on a click outside it, and on its own
// button, and hands focus back where it found it.
export function WorkViewer({
  child,
  activity,
  when,
  type,
  mediaPath,
  mediaPathsJson,
  previewPathsJson,
  text,
  quizReview,
  quizScore,
  quizTotal,
  onClose,
}: {
  child: string;
  activity: string;
  when: string;
  type: string;
  mediaPath: string | null;
  mediaPathsJson: string | null;
  previewPathsJson: string | null;
  text: string | null;
  // How the child answered, if this was a quiz. Passed in rather than derived,
  // because the queue has already built it from the assignment snapshot.
  quizReview: QuizLine[] | null;
  quizScore: number | null;
  quizTotal: number | null;
  onClose: () => void;
}) {
  // A drawing can run to several pages. `mediaPath` is only ever the cover, so
  // reading it alone showed page one and quietly lost the rest — on the screen
  // where a teacher decides whether to publish the whole thing.
  // The picture, when there is one. A quiz page's work of record is blank by
  // design — the boxes are never flattened into it — so a teacher opening a
  // quiz response saw an empty white sheet and no sign that anything had been
  // done. `workPages` falls back to the work whenever no picture was stored.
  const pages = workPages({ mediaPath, mediaPathsJson, previewPathsJson });
  const [page, setPage] = useState(0);
  const at = Math.min(page, Math.max(0, pages.length - 1));
  const many = pages.length > 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Arrow keys turn the page, so a teacher can go through a piece of work
      // without reaching for the mouse between every page.
      if (e.key === "ArrowRight") setPage((p) => Math.min(pages.length - 1, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pages.length]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${child}'s work`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15,20,32,.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper)",
          borderRadius: 18,
          padding: 18,
          maxWidth: "min(1100px, 94vw)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, font: "700 20px var(--font-atkinson)", color: "var(--ink)" }}>
              {child}
            </p>
            <p style={{ margin: "2px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              {activity} · {when}
              {many ? ` · page ${at + 1} of ${pages.length}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              font: "700 15px var(--font-atkinson)",
              color: "var(--ink)",
              background: "var(--cream)",
              border: "2px solid var(--calm-border)",
              borderRadius: 999,
              padding: "10px 18px",
              minHeight: 44,
              cursor: "pointer",
            }}
          >
            <Icon name="close" size={16} decorative /> Close
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--cream)",
            borderRadius: 12,
            overflow: "auto",
          }}
        >
          {type === "AUDIO" && mediaPath ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 36 }}>
              <Icon name="voice" size={64} decorative />
              <audio src={mediaPath} controls autoPlay={false} aria-label={`Play ${child}'s voice note`} style={{ width: 360, maxWidth: "70vw" }} />
            </div>
          ) : pages.length ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pages[at]}
              alt={many ? `${child}'s work, page ${at + 1} of ${pages.length}` : `${child}'s work`}
              style={{ maxWidth: "100%", maxHeight: "78vh", objectFit: "contain", display: "block" }}
            />
          ) : text ? (
            <p style={{ margin: 0, padding: 28, font: "400 19px/1.6 var(--font-atkinson)", color: "var(--ink)", whiteSpace: "pre-wrap", maxWidth: 760 }}>
              {text}
            </p>
          ) : (
            <p style={{ margin: 0, padding: 36, font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              There is nothing to show for this one.
            </p>
          )}
        </div>

        {/* The quiz, which the pages cannot show.
            Question boxes are deliberately NEVER flattened into the page PNG —
            that invariant is what keeps a child's drawing free of them — so a
            teacher opening the work saw the drawing and no sign that anything
            had been answered. */}
        {quizReview && quizReview.length > 0 && (
          <div style={{ borderTop: "2px dashed var(--calm-border)", paddingTop: 12 }}>
            <p style={{ margin: "0 0 8px", font: "700 15px var(--font-atkinson)", color: "var(--ink)" }}>
              Quiz{quizTotal != null ? ` · ${quizScore ?? 0} of ${quizTotal}` : ""}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, maxHeight: "22vh", overflow: "auto" }}>
              {quizReview.map((q, i) => (
                <li key={i} style={{ font: "400 14px var(--font-atkinson)" }}>
                  <p style={{ margin: 0, fontWeight: 700, color: "var(--ink)" }}>
                    <span aria-hidden="true" style={{ marginRight: 6 }}>{q.isCorrect ? "✅" : "❌"}</span>
                    {q.prompt || `Question ${i + 1}`}
                    {/* Never the tick alone: the words say it too (rule 18). */}
                    <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--sj-muted)" }}>
                      {q.isCorrect ? "right" : "not right"}
                    </span>
                  </p>
                  <p style={{ margin: "2px 0 0", color: "var(--sj-muted)" }}>
                    Their answer:{" "}
                    <span style={{ color: q.isCorrect ? "#2E6B64" : "var(--jam)", fontWeight: 700 }}>
                      {q.chosen?.text ?? "—"}
                    </span>
                    {!q.isCorrect && q.correct && (
                      <> · Correct: <span style={{ fontWeight: 700 }}>{q.correct.text}</span></>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {many && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={at === 0}
              aria-label="Previous page"
              style={turner(at === 0)}
            >
              ‹ Back
            </button>
            {/* Every page reachable directly, so a teacher going back to the
                one they wanted does not have to walk there. */}
            <div style={{ display: "flex", gap: 6 }}>
              {pages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-label={`Page ${i + 1}`}
                  aria-current={i === at ? "true" : undefined}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    cursor: "pointer",
                    font: "700 14px var(--font-atkinson)",
                    color: i === at ? "var(--paper)" : "var(--ink-soft)",
                    background: i === at ? "var(--glass)" : "var(--cream)",
                    border: `2px solid ${i === at ? "var(--glass)" : "var(--calm-border)"}`,
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
              disabled={at === pages.length - 1}
              aria-label="Next page"
              style={turner(at === pages.length - 1)}
            >
              Next ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function turner(disabled: boolean): React.CSSProperties {
  return {
    font: "700 15px var(--font-atkinson)",
    color: "var(--ink)",
    background: "var(--cream)",
    border: "2px solid var(--calm-border)",
    borderRadius: 999,
    padding: "10px 18px",
    minHeight: 44,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  };
}
