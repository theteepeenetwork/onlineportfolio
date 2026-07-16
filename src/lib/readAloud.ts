"use client";

// Speak a fixed piece of Storyjar's own copy aloud, for children who can't yet
// read it.
//
// ⚠️ THE RULE: only ever pass strings from `src/lib/copy/student.ts`.
//
// On some platforms (notably Android Chrome) `speechSynthesis` is not local — it
// ships the text to a cloud voice service. Speaking our own fixed UI wording
// discloses nothing. Speaking a child's caption, a pupil's name, or a teacher's
// instructions would send children's personal data to a third party with no DPA,
// breaking SAFEGUARDING rules 10 and 11. There is no way to tell from here where
// a given voice runs, so the safe assumption is "it leaves the device".
//
// That is why this takes copy from the module rather than arbitrary text, and
// why read-aloud on teacher-authored instructions is NOT built yet — it needs a
// different mechanism (a real decision about a voice provider, or on-device
// only), not this one.
//
// Also: user-initiated only. Nothing here fires on page load. Thirty iPads
// spontaneously talking is its own kind of classroom failure, and WCAG 1.4.2
// wants the user in control of audio.

// Is speech available at all? Feature-detected per call: `getVoices()` can be
// empty on first paint, voices load asynchronously, and there is no guarantee
// of an en-GB voice on any given device. Read-aloud is always an addition to
// readable text, never the only route to the meaning.
export function canReadAloud(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Speak one line of our own copy. Cancels anything still speaking so a child
// tapping twice doesn't queue up an echo.
export function readAloud(text: string): void {
  if (!canReadAloud()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 0.9; // a little slower than default — this is for a 5-year-old
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech is a bonus, never a dependency. If the platform refuses, the child
    // still has the words on screen and a teacher in the room.
  }
}
