// Per-class age mode (SJ-06). A class shows one of two child-facing registers:
//
//   • "KS1" — younger. The voice, jar metaphor and pace that ship today.
//   • "KS2" — older. Terser copy, a tighter type scale, calmer motion, and the
//             journal metaphor instead of the jar.
//
// It is a teacher's per-class DISPLAY choice, asked once when the class is made.
// It is not data about a child and carries no personal data — see RETENTION.md.
//
// Two rules live here so they can't drift:
//   1. NULL means KS1. A class with no answer (skipped at creation, or created
//      before this existed) gets the younger, more protective register — the
//      Children's Code default-to-most-protective, and SAFEGUARDING rule 8
//      (deny by default / no assumptions). Never infer it from `yearGroup`.
//   2. Only "KS1" and "KS2" are ever stored. Anything else is treated as NULL.

export type AgeMode = "KS1" | "KS2";

// Read a stored `Class.ageMode` column into a definite register. NULL, an old
// row, or any unexpected value resolves to the protective default, KS1. This is
// the ONLY place child-facing code should turn the raw column into a register.
export function resolveAgeMode(raw: string | null | undefined): AgeMode {
  return raw === "KS2" ? "KS2" : "KS1";
}

// Sanitise a value coming off the class-creation form into what we store.
// Deliberately returns NULL (not "KS1") when the teacher didn't choose: we store
// the ABSENCE of an answer, so the default lives in one place (resolveAgeMode)
// and "skipped" and "chose younger" stay distinguishable in the data. The form
// pre-selects nothing (no nudge — Children's Code), so skipping is expected.
export function normaliseAgeModeInput(value: unknown): AgeMode | null {
  return value === "KS1" || value === "KS2" ? value : null;
}
