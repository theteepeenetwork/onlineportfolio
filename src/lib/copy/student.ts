import type { AgeMode } from "@/lib/ageMode";

// Every word a child reads, in one place — now in two registers.
//
// Why this exists, beyond tidiness:
//
//  1. **Read-aloud safety.** On some platforms `speechSynthesis` sends the text
//     it speaks to a cloud voice service. That is fine for fixed UI wording and
//     absolutely not fine for a child's caption or a teacher's instructions
//     (SAFEGUARDING rules 10 & 11 — no personal data to un-DPA'd third
//     parties). Keeping the speakable strings in one static module is what makes
//     "we only ever speak our own copy" a rule you can check, rather than a
//     promise. See `src/lib/readAloud.ts`.
//  2. **Two registers (SJ-06).** Storyjar is for ages 3–11. A Year 6 should not
//     be told "Bye bye 👋". `studentCopy(mode)` returns the younger (KS1) or
//     older (KS2) register for a class; the register is chosen once at class
//     creation (`Class.ageMode`) and resolved via `src/lib/ageMode.ts`.
//
// The wording below is the owner-approved SJ-06 copy spec, verbatim. "Older" is
// calmer and ~15% terser — plainer, never babyish, never a form. Five strings
// carry a safeguarding promise (🔒 below): reworded for age, meaning preserved.
// A test (copy-registers.spec) asserts that promise survives in both registers.
//
// NOTE: the jar → journal wording (a KS2 "journal" metaphor) is a later step; here
// both registers still say "jar". The sign-in CODE screen runs before the class
// (and therefore its register) is known, so it always uses the younger, gentlest
// wording — see `studentCopyNeutral`.
//
// Rules for anything added here: it is shown to a child, it is fixed (never user
// or teacher content), and it says what happened rather than what went wrong.

function reg(mode: AgeMode) {
  const older = mode === "KS2";
  // pick(younger, older) — the one place a string forks by register.
  const p = <T>(ks1: T, ks2: T): T => (older ? ks2 : ks1);

  return {
    signIn: {
      codeHeading: "What's your class code?",
      codeHelp: "Your teacher will show you.",
      // 🔒4 — a child who mistypes has done nothing wrong; the app just didn't
      // find the class. No "invalid", no blame. (Meaning: try again, no blame.)
      codeNotFound: p(
        "We couldn't find that class code. Have another go!",
        "We couldn't find that code. Try again.",
      ),
      codeFieldLabel: "Class code",
      next: "Next",
      backspace: "Delete the last letter",
      hearIt: "Hear it",
      pickLetter: (ch: string) => `Add ${ch}`,
      // 🔒5 — this key is intentionally dead (I/L/O/0/1 are never in a code),
      // and it says why rather than just failing.
      notInCodes: (ch: string) => p(`${ch} is never in a class code`, `${ch} isn't used in codes`),
      slotLabel: (i: number, total: number) => `Letter ${i + 1} of ${total}`,
      namesHeading: p("Tap your name!", "Tap your name"),
      wrongClass: p("← Wrong class?", "← Not your class?"),
      // 🔒3 — not the child's fault; the fix is to ask the teacher.
      noNames: p("No names here yet — ask your teacher to add you.", "No names here yet — ask your teacher."),
    },

    // The child's own jar/home.
    home: {
      // #1 — the audit's own example of the voice reading too young for a Y6.
      signOut: p("Bye bye 👋", "Sign out"),
    },

    // Adding work. A child arrives here having already chosen — they tapped
    // "Photo" on their jar — so nothing here asks them to choose again.
    add: {
      photoHeading: "Take a photo",
      wordsHeading: "My words",
      backToJar: "Back to my jar",
      // A visible label, not a placeholder. Placeholder text vanishes the moment
      // a child taps the box — taking the instruction away when they need it.
      captionLabel: "Tell us about your work",
      // 🔒2 — nobody is stuck; this field is skippable.
      captionOptional: p("You don't have to.", "Optional."),
      // #12 — an example of the thing they just did; the older one is a prompt,
      // not a toddler's sentence.
      captionPlaceholder: p("I made a tower with the big blocks…", "What is this? Where were you?"),
      wordsLabel: "Write your words here",
      wordsPlaceholder: "Today I…",
      submit: "Add to my jar",
      // 🔒1 — the approval promise, in the child's own words, at the moment they
      // hand it over. (Meaning: nothing is public until the teacher approves.)
      teacherWillSee: p("Your teacher will see it first.", "Your teacher checks it first."),
      saving: p("Popping it in…", "Adding…"),
    },

    // Where a child's work is, in three states. These sentences are the readable
    // version of the status — the state is also carried by position + icon, so a
    // pre-reader gets it without reading. Nothing by colour alone (WCAG 1.4.1).
    status: {
      waiting: p("Waiting for your teacher to see it", "Waiting for your teacher"),
      waitingShort: "Waiting",
      returned: p("Have another go — your teacher sent it back", "Sent back — have another go"),
      returnedShort: p("Have another go", "Redo"),
      inTheJar: "In your jar",
      // The moment the product exists for: approved while they were away, so the
      // first time they see it is now. The older one states it rather than cheers.
      justArrived: p("This went in your jar!", "Added to your jar"),
      tryAgain: "Try again",
      hearIt: "Hear it",
    },

    // The celebration right after a moment is added.
    celebration: {
      heading: p("Popped in!", "Added ✓"),
      // Aligns with the 🔒1 promise above, calmer.
      subtitle: p("Your teacher will see it soon.", "Your teacher will see it first."),
    },
  } as const;
}

export type StudentCopyPack = ReturnType<typeof reg>;

// The register a class shows its children. Call with the class's resolved
// `ageMode` (see src/lib/ageMode.ts).
export function studentCopy(mode: AgeMode): StudentCopyPack {
  return reg(mode);
}

// The sign-in CODE screen runs BEFORE we know which class (and register) is
// coming, so it can't be age-aware. It always uses the younger, gentlest
// wording — the safe default when the register is unknown.
export const studentCopyNeutral: StudentCopyPack = reg("KS1");
