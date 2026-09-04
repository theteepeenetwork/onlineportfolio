import type { AgeMode } from "@/lib/ageMode";

// Every word a child reads, in one place — now in three registers.
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
//  2. **Three registers (SJ-06).** StoryJar is for ages 3–11. A Year 6 should
//     not be told "Bye bye 👋", and a pre-reader in Reception should not be made
//     to read at all. `studentCopy(mode)` returns the EYFS (3–5), KS1 (5–7) or
//     KS2 (7–11) register for a class; the register is chosen once at class
//     creation (`Class.ageMode`) and resolved via `src/lib/ageMode.ts`. EYFS
//     shares the younger (KS1) wording unless a string overrides it — see `p`.
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
  // pick by register — the one place a string forks. `p(ks1, ks2)` keeps the
  // original younger/older fork; EYFS is the youngest and reads almost exactly
  // like KS1 (its 6a design uses the younger wording — "Bye bye 👋", "Add to my
  // jar", "Popped in!"), so it FALLS BACK to the KS1 string unless a third arg
  // gives it its own. That keeps every existing `p(a, b)` call correct for EYFS
  // and lets the handful of genuinely EYFS-specific strings override in place.
  const p = <T>(ks1: T, ks2: T, eyfs: T = ks1): T =>
    mode === "KS2" ? ks2 : mode === "EYFS" ? eyfs : ks1;

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

    // The child's own home. For older children the jar metaphor matures into a
    // journal (J1–J9): the same moments, a plainer container, no jar picture.
    // The product NAME stays "storyjar" everywhere — only this in-app metaphor
    // changes.
    home: {
      // #1 — the audit's own example of the voice reading too young for a Y6.
      signOut: p("Bye bye 👋", "Sign out"),
      // J6 — the header title.
      title: (name: string) => p(`${name}'s jar`, `${name}'s journal`),
      // EYFS has no header — a warm spoken greeting IS the top of the screen
      // (design 6a). Defined for every register but only EYFS renders it.
      greeting: (name: string) => `Hello, ${name}!`,
      // What the greeting's 🔊 speaks. Deliberately name-FREE: read-aloud may
      // only ever voice fixed copy, never a child's own name — on some platforms
      // speechSynthesis ships the text to a cloud voice, and a child's first name
      // must not leave the device (SAFEGUARDING rules 10 & 11; see readAloud.ts).
      greetingSpoken: "Hello!",
      // The activities strip's call to action. Pre-readers (EYFS) get just the
      // one word beside the icon + count; older registers pair it with a
      // sentence built from `count` above.
      startActivities: "Start",
      // J7 — the count line. Younger gets the warm "moments" beside the jar;
      // older gets a plain "in your journal" (and no jar drawing).
      count: (n: number) => p(`${n} ${n === 1 ? "moment" : "moments"}`, `${n} in your journal`),
      // J5 — the empty state.
      emptyHeading: p("Your jar is empty", "Your journal is empty"),
      emptyHelp: "Add your first moment above!",
      // J9 / M2 — a moment approved while the child was away. Younger watches it
      // drop into the jar; older, with no jar, gets a quiet tag on the moment.
      arrivedBadge: "Added ✓",
    },

    // Adding work. A child arrives here having already chosen — they tapped
    // "Photo" on their jar — so nothing here asks them to choose again.
    add: {
      photoHeading: "Take a photo",
      // A teacher's photo frame on the canvas. Fixed UI copy in every register
      // (never the teacher's own prompt, which is shown and not spoken), so the
      // camera dialog says the same thing to a child and in the teacher's
      // preview.
      photoAgain: "Take it again",
      camera: {
        take: "Take photo",
        cancel: "Cancel",
        choose: "Choose a picture instead",
        flip: "Switch camera",
        failed: "We couldn't open the camera. You can choose a picture instead.",
      },
      wordsHeading: "My words",
      audioHeading: p("Record your voice", "Record a voice note"),
      // Voice-note controls. Plain, calm words a pre-reader can be shown by an
      // adult; the older register is terser. Fixed UI copy (never child content),
      // so it's safe to read aloud.
      audio: {
        record: p("Record", "Record"),
        stop: p("Stop", "Stop"),
        again: p("Record again", "Record again"),
        ready: p("Your voice note is ready", "Voice note ready"),
        recording: p("Recording…", "Recording…"),
        player: p("Your voice note", "Your voice note"),
        hint: p("Tap record, say your bit, then tap stop.", "Tap record, speak, then stop."),
        // 🔒 mic error — nobody is at fault; the fix is to try again or ask the teacher.
        micError: p(
          "We couldn't use the microphone. Have another go, or ask your teacher.",
          "We couldn't use the microphone. Try again, or ask your teacher.",
        ),
      },
      backToJar: p("Back to my jar", "Back to my journal"), // J2
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
      // Drawing never opens inline — it hands off to the full-screen canvas. The
      // capture surface for it is a single line + a button that opens the canvas.
      drawInline: p("Drawing opens your big full-screen canvas", "Drawing opens the full-screen canvas"),
      drawOpen: p("Open my canvas", "Open canvas"),
      // The circular ✕ that closes an open capture surface (design 6a/5a/3c).
      close: "Close",
      submit: p("Add to my jar", "Add to my journal"), // J1
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
      inTheJar: p("In your jar", "In your journal"), // J3
      // The moment the product exists for: approved while they were away, so the
      // first time they see it is now. The older one states it rather than cheers.
      justArrived: p("This went in your jar!", "Added to your journal"), // J4
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
