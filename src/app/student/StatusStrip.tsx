"use client";

import { useEffect, useState } from "react";
import { studentCopy } from "@/lib/copy/student";
import { canReadAloud, readAloud } from "@/lib/readAloud";

const c = studentCopy.status;

// The status line, said three ways at once: a tag you can see, a sentence you
// can read, and a button that reads it to you.
//
// It used to be a sentence and an emoji — "Waiting for your teacher to see it
// ⏳" — which is exactly nothing to a child who can't read yet, and the
// approve-then-publish loop is the product's core promise. Now the tag carries
// it, the words stay for the children who have them, and the speaker covers the
// rest. Read-aloud only ever speaks `studentCopy`, never the child's caption or
// a teacher's note — see src/lib/readAloud.ts.
export function StatusStrip({ returned }: { returned: boolean }) {
  const [speechReady, setSpeechReady] = useState(false);
  useEffect(() => setSpeechReady(canReadAloud()), []);

  const line = returned ? c.returned : c.waiting;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
      {/* The kraft luggage tag — a returned moment wears one, a waiting one
          doesn't. Shape and icon, not just colour (WCAG 1.4.1). */}
      {returned ? (
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--kraft-tag)", border: "3px solid var(--ink)", borderRadius: 8, padding: "3px 12px", font: "600 16px var(--font-fredoka)", color: "var(--ink)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20l4-1 10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 15.5 4 20z" fill="none" stroke="#22304A" strokeWidth="2.2" strokeLinejoin="round" />
          </svg>
          {c.returnedShort}
        </span>
      ) : (
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#FFFDF7", border: "3px solid var(--ink)", borderRadius: 8, padding: "3px 12px", font: "600 16px var(--font-fredoka)", color: "var(--honey-ink)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="#8A5F1E" strokeWidth="2.2" />
            <path d="M12 7.5V12l3 2" fill="none" stroke="#8A5F1E" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          {c.waitingShort}
        </span>
      )}

      <span style={{ font: "400 17px var(--font-atkinson)", color: "#8A5F1E" }}>{line}</span>

      {speechReady && (
        <button
          type="button"
          aria-label={`${c.hearIt}: ${line}`}
          onClick={(e) => {
            // The whole strip can be a link to the activity; hearing it read
            // shouldn't navigate away mid-sentence.
            e.preventDefault();
            e.stopPropagation();
            readAloud(line);
          }}
          // 64px, not the 44px web default: this is a child's control, and it
          // is the one that exists FOR the children who can't read the line
          // beside it (SAFEGUARDING rule 18).
          style={{ minHeight: 64, minWidth: 64, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 999, padding: "4px 14px", font: "700 14px var(--font-atkinson)", color: "var(--ink)", cursor: "pointer" }}
        >
          <span aria-hidden="true">🔊</span>
        </button>
      )}
    </div>
  );
}
