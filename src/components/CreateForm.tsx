"use client";

import { useActionState, useState } from "react";
import { createJournalItem } from "@/app/actions/journal";
import { DrawingCanvas } from "./DrawingCanvas";
import { PhotoCapture } from "./PhotoCapture";
import { AudioCapture } from "./AudioCapture";
import { Icon, type IconName } from "./icons/Icon";

type Tab = "PHOTO" | "TEXT" | "DRAWING" | "AUDIO";
type Skill = { id: string; name: string };

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: "PHOTO", label: "Photo", icon: "camera" },
  { key: "TEXT", label: "Write", icon: "write" },
  { key: "DRAWING", label: "Draw", icon: "draw" },
  { key: "AUDIO", label: "Voice", icon: "voice" },
];

// A teacher adds work on a child's behalf. Tabs are right here: a teacher is
// deciding what to capture while sitting with a child, and works on a laptop
// with a register they already know.
//
// Children used to share this form, arriving from a jar tile that had ALREADY
// asked them which kind of work they were adding — so it asked twice, in
// teacher's clothes (SJ-03). They now go straight to their own capture surface
// (src/app/student/new/[type]) and this is teacher-only.
export function CreateForm({
  studentId,
  skills = [],
}: {
  studentId?: string;
  skills?: Skill[];
}) {
  const [tab, setTab] = useState<Tab>("PHOTO");
  const [state, action, pending] = useActionState(createJournalItem, {});

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="type" value={tab} />
      {studentId && <input type="hidden" name="studentId" value={studentId} />}

      {/* Choose how to respond */}
      <div className="grid grid-cols-4 gap-2">
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

      {/* Draw — inline for teachers; the child's canvas is full-screen. */}
      {tab === "DRAWING" && <DrawingCanvas name="drawingPages" />}

      {/* Voice — record a short note (publishes straight away on this path). */}
      {tab === "AUDIO" && <AudioCapture />}

      {/* Caption */}
      {tab !== "TEXT" && (
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

      {/* Tag skills at the point of adding */}
      {skills.length > 0 && (
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

      <button type="submit" disabled={pending} className="btn-green w-full py-4 text-lg">
        {pending ? "Saving…" : "✓ Add to journal"}
      </button>
    </form>
  );
}
