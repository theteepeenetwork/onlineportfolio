// Every word a child reads, in one place.
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
//  2. **Two registers, later.** Storyjar is for ages 3–11. A Year 6 should not
//     be told "Bye bye 👋". The planned per-class age mode swaps the register,
//     and it can only do that if the words are data rather than scattered
//     through JSX.
//
// Rules for anything added here: it is shown to a child, it is fixed (never
// user or teacher content), and it says what happened rather than what went
// wrong. No jargon, no blame, no "invalid".

export const studentCopy = {
  signIn: {
    codeHeading: "What's your class code?",
    codeHelp: "Your teacher will show you.",
    // Deliberately not "invalid code" or a sad face. A child who mistypes has
    // done nothing wrong; the app just didn't find the class. The wobble
    // carries the meaning for pre-readers — this is for those who can read, and
    // for the read-aloud button.
    codeNotFound: "We couldn't find that class code. Have another go!",
    codeFieldLabel: "Class code",
    next: "Next",
    backspace: "Delete the last letter",
    hearIt: "Hear it",
    pickLetter: (ch: string) => `Add ${ch}`,
    // Class codes never contain I, L, O, 0 or 1 — they're too easy to mistake
    // for each other. The key stays on the pad so the alphabet looks right, but
    // says plainly why it does nothing.
    notInCodes: (ch: string) => `${ch} is never in a class code`,
    // Each empty slot is announced so a screen-reader user knows how many
    // characters the code has and where they are in it.
    slotLabel: (i: number, total: number) => `Letter ${i + 1} of ${total}`,
    namesHeading: "Tap your name!",
    wrongClass: "← Wrong class?",
    noNames: "No names here yet — ask your teacher to add you.",
  },
} as const;
