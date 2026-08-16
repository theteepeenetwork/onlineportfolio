// Per-class age mode (SJ-06). A class shows one of three child-facing registers:
//
//   • "EYFS" — youngest (3–5). Icon-only, no reading required, everything
//              speakable, minimal free-text. The most locked-down register.
//   • "KS1"  — younger (5–7). Labelled tiles, the jar metaphor and pace.
//   • "KS2"  — older (7–11). Terser copy, a tighter type scale, calmer motion,
//              and the journal metaphor instead of the jar.
//
// It is a teacher's per-class DISPLAY choice, asked once when the class is made.
// It is not data about a child and carries no personal data — see RETENTION.md.
//
// Two rules live here so they can't drift:
//   1. NULL means EYFS. A class with no answer (skipped at creation, or created
//      before this existed) gets the youngest, most protective register — the
//      Children's Code default-to-most-protective, and SAFEGUARDING rule 8
//      (deny by default / no assumptions). EYFS is the most locked-down of the
//      three (icon-only, no reading, minimal child free-text), so an unanswered
//      class errs toward the safest experience until a teacher chooses. Never
//      infer the register from `yearGroup`.
//
//      (Owner / data-protection-lead decision, 2026-07-19: the NULL fallback was moved from KS1 to
//      EYFS when EYFS was added. This STRENGTHENS the protective default rather
//      than trading anything away — no SAFEGUARDING.md rule-trade amendment is
//      needed. The visible consequence the owner accepted: an unanswered class
//      that is really KS2 shows a very juvenile UI until its teacher sets it.)
//   2. Only "EYFS", "KS1" and "KS2" are ever stored. Anything else is NULL.

export type AgeMode = "EYFS" | "KS1" | "KS2";

// Read a stored `Class.ageMode` column into a definite register. NULL, an old
// row, or any unexpected value resolves to the protective default, EYFS. Only an
// explicitly stored "KS1"/"KS2" leaves the youngest register. This is the ONLY
// place child-facing code should turn the raw column into a register.
export function resolveAgeMode(raw: string | null | undefined): AgeMode {
  if (raw === "KS1") return "KS1";
  if (raw === "KS2") return "KS2";
  return "EYFS";
}

// Sanitise a value coming off the class-creation form into what we store.
// Deliberately returns NULL (not "EYFS") when the teacher didn't choose: we store
// the ABSENCE of an answer, so the default lives in one place (resolveAgeMode)
// and "skipped" and "chose youngest" stay distinguishable in the data. The form
// pre-selects nothing (no nudge — Children's Code), so skipping is expected.
export function normaliseAgeModeInput(value: unknown): AgeMode | null {
  return value === "EYFS" || value === "KS1" || value === "KS2" ? value : null;
}

// The three registers a teacher can pick from, youngest → oldest, with the
// plain-English label and hint shown on every age-mode form (class creation, the
// after-creation switch, and the signup wizard). One source so their wording
// can't drift. Order and wording are even-handed — no "recommended", and the
// forms pre-select nothing (Children's Code / no nudge). Teacher-facing display
// text only; it carries no child data.
export const AGE_MODE_OPTIONS: { value: AgeMode; label: string; hint: string }[] = [
  { value: "EYFS", label: "Early years", hint: "Nursery & Reception · ages 3–5" },
  { value: "KS1", label: "Younger children", hint: "Years 1 and 2 · ages 5–7" },
  { value: "KS2", label: "Older children", hint: "Years 3 to 6 · ages 7–11" },
];
