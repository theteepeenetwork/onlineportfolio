"use client";

import { useActionState } from "react";
import { excuseFromRun, putBackOnRun, type RunPupilState } from "@/app/actions/runs";

// The two buttons on a run page's pupil row: "Not needed", for a pupil who has
// handed nothing in, and "Put back", for one who has been marked. What they do
// and what they refuse is in src/app/actions/runs.ts; this only draws them.
//
// The accessible name carries the pupil's name ("Not needed for Nell") because a
// screen-reader user tabbing down a register hears the button without the row,
// and "Not needed, Not needed, Not needed" says nothing. The visible words stay
// the short ones, and are the start of the name (WCAG 2.5.3).
export function PupilRunControl({
  runId,
  studentId,
  name,
  excused,
}: {
  runId: string;
  studentId: string;
  name: string;
  excused: boolean;
}) {
  const [state, action, pending] = useActionState<RunPupilState, FormData>(excused ? putBackOnRun : excuseFromRun, {});
  const hintId = `run-control-hint-${studentId}`;
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="studentId" value={studentId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={excused ? `Put back on ${name}'s list` : `Not needed for ${name}`}
        aria-describedby={hintId}
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: 44,
          boxSizing: "border-box",
          font: "700 14px var(--font-atkinson)",
          color: "var(--ink)",
          background: excused ? "var(--cream)" : "transparent",
          border: `2px ${excused ? "solid" : "dashed"} var(--ink-soft)`,
          borderRadius: 999,
          padding: "8px 14px",
          cursor: pending ? "progress" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {excused ? "Put back" : "Not needed"}
      </button>
      <span id={hintId} className="sr-only">
        {excused
          ? `Puts it back on ${name}'s to-do list.`
          : `Takes it off ${name}'s to-do list. You can put it back.`}
      </span>
      {state?.error && (
        <p role="alert" style={{ margin: 0, maxWidth: 220, textAlign: "right", font: "700 13px/1.4 var(--font-atkinson)", color: "var(--jam)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
