"use client";

import { useActionState, useState } from "react";
import { createJournalItem } from "@/app/actions/journal";
import { DrawingCanvas } from "./DrawingCanvas";
import { PhotoCapture } from "./PhotoCapture";
import { Icon, type IconName } from "./icons/Icon";

type Tab = "PHOTO" | "TEXT" | "DRAWING";
type Skill = { id: string; name: string };

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: "PHOTO", label: "Photo", icon: "camera" },
  { key: "TEXT", label: "Write", icon: "write" },
  { key: "DRAWING", label: "Draw", icon: "draw" },
];

// The creation canvas. A child (or teacher, on a child's behalf) picks a way
// to respond and adds it to a journal.
export function CreateForm({
  mode,
  studentId,
  skills = [],
  defaultTab = "PHOTO",
}: {
  mode: "student" | "teacher";
  studentId?: string;
  skills?: Skill[];
  defaultTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [state, action, pending] = useActionState(createJournalItem, {});

  // A child's drawing takes over the whole screen; the canvas owns its own
  // caption and green ✓ submit button in that mode.
  const fsDraw = mode === "student" && tab === "DRAWING";

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="type" value={tab} />
      {mode === "teacher" && studentId && (
        <input type="hidden" name="studentId" value={studentId} />
      )}

      {/* Choose how to respond */}
      <div className="grid grid-cols-3 gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 py-4 font-semibold transition-colors ${
              tab === t.key
                ? "border-brand bg-brand/10 text-brand"
                : "border-border bg-surface text-muted hover:bg-background"
            }`}
          >
            <Icon name={t.icon} size={28} decorative />
            {t.label}
          </button>
        ))}
      </div>

      {/* Photo — take one live or upload */}
      {tab === "PHOTO" && <PhotoCapture />}

      {/* Write */}
      {tab === "TEXT" && (
        <textarea
          name="textContent"
          rows={6}
          className="input text-lg leading-relaxed"
          placeholder="Type your words here…"
        />
      )}

      {/* Draw — full-screen and child-led for students, inline for teachers */}
      {tab === "DRAWING" && (
        <DrawingCanvas
          name="drawingPages"
          fullScreen={mode === "student"}
          withCaption={mode === "student"}
          onClose={mode === "student" ? () => setTab("PHOTO") : undefined}
        />
      )}

      {/* Caption (the full-screen canvas provides its own) */}
      {tab !== "TEXT" && !fsDraw && (
        <div>
          <label className="label" htmlFor="caption">
            Add a caption (optional)
          </label>
          <input
            id="caption"
            name="caption"
            className="input"
            placeholder="Tell us about your work…"
          />
        </div>
      )}

      {/* Teacher-only: tag skills at the point of adding */}
      {mode === "teacher" && skills.length > 0 && (
        <div>
          <p className="label">Tag against skills (optional)</p>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:checked]:text-brand"
              >
                <input type="checkbox" name="skillIds" value={s.id} className="accent-brand" />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      {/* In full-screen drawing the canvas has its own ✓ Done button. */}
      {!fsDraw && (
        <>
          <button type="submit" disabled={pending} className="btn-green w-full py-4 text-lg">
            {pending
              ? "Saving…"
              : mode === "student"
                ? "✓ Add to my journal"
                : "✓ Add to journal"}
          </button>
          {mode === "student" && (
            <p className="text-center text-sm text-muted">
              Your teacher will see it before it&apos;s saved.
            </p>
          )}
        </>
      )}
    </form>
  );
}
