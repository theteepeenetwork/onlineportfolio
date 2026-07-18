"use client";

import { useCallback, useEffect, useState } from "react";
import { studentCopyNeutral } from "@/lib/copy/student";
import { CODE_LENGTH, KEYPAD_DIGITS, KEYPAD_LETTERS, isCodeChar } from "@/lib/classCodeChars";
import { canReadAloud, readAloud } from "@/lib/readAloud";

// The code screen runs before we know the class, so its register is unknown —
// it always uses the neutral (younger, gentlest) wording. See studentCopyNeutral.
const c = studentCopyNeutral.signIn;

// The full alphabet and 0–9, in the order a child expects. Rows of nine keep it
// inside an iPad's width. Keys the code alphabet excludes are shown but inert —
// see KEYPAD_LETTERS for why they aren't simply left out.
const ROWS: string[] = [
  KEYPAD_LETTERS.slice(0, 9),
  KEYPAD_LETTERS.slice(9, 18),
  KEYPAD_LETTERS.slice(18),
  KEYPAD_DIGITS,
];

const KEY: React.CSSProperties = {
  // 64 on BOTH axes — rule 18 is a target, not a height. The widest row is the
  // ten digits, so the pad below is sized to fit 10 x 64 plus its gaps.
  minWidth: 64,
  minHeight: 64,
  flex: "1 1 0",
  font: "600 24px var(--font-fredoka)",
  color: "var(--ink)",
  background: "var(--cream)",
  border: "3px solid var(--ink)",
  borderRadius: 12,
  boxShadow: "0 3px 0 rgba(34,48,74,0.14)",
  cursor: "pointer",
  padding: 0,
};

// A character no class code contains. Present so the alphabet stays whole and
// familiar; visibly not a choice, so it's never a dead end.
const KEY_OFF: React.CSSProperties = {
  ...KEY,
  color: "var(--sj-muted)",
  background: "transparent",
  border: "3px dashed #D9D2C0",
  boxShadow: "none",
  cursor: "default",
  opacity: 0.55,
};

// Stage one of the child's sign-in: the class code.
//
// The old screen was a single autoFocusing text field. On a classroom iPad the
// OS keyboard rose on load and buried the Next button, the field gave the code
// no shape (how many characters? letters or numbers?), and a wrong code was
// answered with a sentence — which is no answer at all if you can't read yet.
//
// So: per-character slots that show the code's shape, our own on-screen pad so
// the OS keyboard never appears, and a neutral wobble on a wrong code. A
// physical keyboard still works throughout, because Year 6 and teachers have
// one and it's faster.
export function CodeEntry({ notFound }: { notFound: boolean }) {
  const [chars, setChars] = useState<string[]>([]);
  // Start wobbling if we arrived back here from a code that didn't match.
  const [wobbling, setWobbling] = useState(notFound);
  const [speechReady, setSpeechReady] = useState(false);

  const complete = chars.length === CODE_LENGTH;

  // Feature-detect after mount so the server and client agree on first paint.
  useEffect(() => setSpeechReady(canReadAloud()), []);

  // One wobble, then rest. Never a loop: the child has to be able to think.
  useEffect(() => {
    if (!wobbling) return;
    const t = setTimeout(() => setWobbling(false), 600);
    return () => clearTimeout(t);
  }, [wobbling]);

  const push = useCallback((ch: string) => {
    setChars((prev) => (prev.length >= CODE_LENGTH ? prev : [...prev, ch]));
  }, []);

  const back = useCallback(() => setChars((prev) => prev.slice(0, -1)), []);

  // A physical keyboard still drives the same slots. Letters and digits that
  // can't appear in a code are ignored rather than shown and then rejected.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        back();
        return;
      }
      if (e.key.length !== 1) return;
      const up = e.key.toUpperCase();
      if (isCodeChar(up)) {
        e.preventDefault();
        push(up);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [push, back]);

  return (
    <form method="get" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      {/* The value the server actually reads. The slots are the interface; this
          is the plumbing, and it keeps the ?code= URL contract that the printed
          hand-out's QR and the teacher's preview link both rely on. */}
      <input type="hidden" name="code" value={chars.join("")} />

      {/* Slots. Decorative to a screen reader — the live status below says the
          same thing in words, without spelling the code out letter by letter. */}
      <div
        data-code-slots={wobbling ? "wobble" : undefined}
        aria-hidden="true"
        style={{ display: "flex", gap: "clamp(6px, 1.4vw, 12px)", marginTop: "clamp(16px, 3vh, 28px)" }}
      >
        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
          <span
            key={i}
            data-code-slot={chars[i] ? "filled" : "empty"}
            style={{
              width: "clamp(46px, 8vw, 68px)",
              height: "clamp(58px, 10vh, 84px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "600 clamp(28px, 5vw, 44px) var(--font-fredoka)",
              color: "var(--ink)",
              background: chars[i] ? "var(--glass-light)" : "var(--cream)",
              border: "3px solid var(--ink)",
              borderRadius: 14,
              boxSizing: "border-box",
            }}
          >
            {chars[i] ?? ""}
          </span>
        ))}
      </div>

      <p role="status" aria-live="polite" className="sj-sr-only">
        {complete ? `Class code complete: ${CODE_LENGTH} of ${CODE_LENGTH} letters` : c.slotLabel(chars.length, CODE_LENGTH)}
      </p>

      {notFound && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 14 }}>
          {/* Kraft, not red. A child who mistypes hasn't done anything wrong. */}
          <p style={{ margin: 0, font: "700 17px var(--font-atkinson)", color: "var(--honey-ink)", background: "var(--honey-tint)", borderRadius: 12, padding: "10px 16px" }}>
            {c.codeNotFound}
          </p>
          {speechReady && (
            <button
              type="button"
              onClick={() => readAloud(c.codeNotFound)}
              style={{ minHeight: 64, display: "inline-flex", alignItems: "center", gap: 6, font: "700 15px var(--font-atkinson)", color: "var(--ink)", background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 999, padding: "8px 18px", cursor: "pointer" }}
            >
              <span aria-hidden="true">🔊</span>
              {c.hearIt}
            </button>
          )}
        </div>
      )}

      {/* Our own pad, so the iPad's keyboard never rises over the Next button. */}
      {/* Sized for the widest row: 10 digits x 64px + 9 x 6px gaps = 694. Both
          iPad orientations clear that (landscape 96vw = 983, portrait = 737). */}
      <div style={{ display: "flex", flexDirection: "column", gap: "clamp(6px, 1.2vh, 10px)", marginTop: "clamp(14px, 2.6vh, 24px)", width: "min(700px, 96vw)" }}>
        {ROWS.map((row) => (
          <div key={row} style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            {row.split("").map((ch) => {
              const usable = isCodeChar(ch);
              return (
                <button
                  key={ch}
                  type="button"
                  data-key={ch}
                  disabled={!usable}
                  aria-label={usable ? c.pickLetter(ch) : c.notInCodes(ch)}
                  onClick={usable ? () => push(ch) : undefined}
                  style={usable ? KEY : KEY_OFF}
                >
                  {ch}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "clamp(10px, 2vw, 18px)", marginTop: "clamp(14px, 2.6vh, 26px)", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={back}
          disabled={chars.length === 0}
          aria-label={c.backspace}
          style={{ ...KEY, flex: "0 0 auto", minWidth: 84, opacity: chars.length === 0 ? 0.4 : 1, cursor: chars.length === 0 ? "default" : "pointer" }}
        >
          <span aria-hidden="true">⌫</span>
        </button>
        <button
          type="submit"
          disabled={!complete}
          style={{
            minHeight: 64,
            font: "600 clamp(20px, 3vw, 26px) var(--font-fredoka)",
            color: "var(--paper)",
            background: "var(--jam)",
            border: "none",
            padding: "14px clamp(28px, 6vw, 56px)",
            borderRadius: 999,
            boxShadow: "0 5px 0 var(--jam-deep)",
            cursor: complete ? "pointer" : "default",
            opacity: complete ? 1 : 0.45,
          }}
        >
          {c.next} →
        </button>
      </div>
    </form>
  );
}
