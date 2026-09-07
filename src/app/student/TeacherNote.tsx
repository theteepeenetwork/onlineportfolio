"use client";

import { readAloudOnDevice } from "@/lib/readAloud";
import { useOnDeviceVoiceReady } from "@/lib/useSpeechReady";
import { studentCopy } from "@/lib/copy/student";
import type { AgeMode } from "@/lib/ageMode";

// What the teacher actually asked the child to change (F38).
//
// The teacher writes this when they send work back — the queue prompts them for
// it with an example — and until now the child was told only that something had
// come back. They were left to guess which part, or to ask, which is the
// classroom time this product exists to give back.
//
// It appears in BOTH places a child looks: on the strip on their jar, and again
// at the top of the work when they reopen it. Same component, same words.
//
// THE LISTEN BUTTON IS CONDITIONAL, AND THAT IS THE SAFEGUARDING PART. This is
// an adult's free text, not Storyjar's fixed copy, so it is spoken only by a
// voice the platform says runs on the device (see readAloudOnDevice). Where no
// local voice exists the button does not render at all and the note is text
// beside a teacher. It never speaks on its own.
export function TeacherNote({
  note,
  mode,
  compact = false,
}: {
  note: string;
  mode: AgeMode;
  compact?: boolean;
}) {
  // The gate this component used to carry inline. It moved to a hook when the
  // quiz question needed the same one, and this call site moved with it: two
  // copies of a safeguarding-load-bearing check is how one of them gets
  // hardened and the other quietly does not.
  const canSpeak = useOnDeviceVoiceReady();

  const c = studentCopy(mode);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        marginTop: compact ? 6 : 10,
        background: "var(--paper)",
        border: "3px solid var(--ink)",
        borderRadius: 14,
        padding: compact ? "8px 12px" : "12px 16px",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>
        💬
      </span>
      <p
        style={{
          margin: 0,
          flex: 1,
          minWidth: 160,
          font: `400 calc(${compact ? 16 : 18}px * var(--sj-type-scale, 1))/1.5 var(--font-atkinson)`,
          color: "var(--ink)",
        }}
      >
        {note}
      </p>
      {canSpeak && (
        <button
          type="button"
          aria-label={`${c.status.hearIt}: ${note}`}
          onClick={(event) => {
            // The whole strip is often a link into the activity; hearing the
            // note read should not navigate away mid-sentence.
            event.preventDefault();
            event.stopPropagation();
            readAloudOnDevice(note);
          }}
          // 64px, because this is the control that exists FOR the children who
          // cannot read the words beside it (SAFEGUARDING rule 18).
          style={{
            minHeight: 64,
            minWidth: 64,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--cream)",
            border: "3px solid var(--ink)",
            borderRadius: 999,
            fontSize: 22,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <span aria-hidden="true">🔊</span>
        </button>
      )}
    </div>
  );
}
