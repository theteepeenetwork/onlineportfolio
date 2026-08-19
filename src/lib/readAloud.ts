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

// ---------------------------------------------------------------------------
// Reading a TEACHER'S OWN WORDS aloud — a different mechanism, on purpose.
//
// The rule above still stands for `readAloud`: it speaks Storyjar's fixed copy
// and nothing else, because on some platforms `speechSynthesis` is not local and
// the text leaves the device.
//
// F38 needs one exception, and it is the narrowest one that does the job. When a
// teacher sends work back they write the child a note, and the child — who may
// be four — has to be able to act on it. Showing it is not enough for a
// pre-reader, so it has to be speakable.
//
// The mechanism is therefore ON-DEVICE ONLY. `SpeechSynthesisVoice.localService`
// is the platform telling us whether a voice runs locally; we pick a local
// English voice explicitly and speak with it. If the device offers none, this
// returns false, the listen button is never rendered, and the note stays as text
// beside a teacher — which is the correct failure, not a degraded one. Nothing
// is ever sent to a network voice: no local voice, no speech.
//
// Two things this deliberately does NOT do. It does not fall back to the default
// voice (that is the cloud path, and it is the whole thing being avoided), and
// it never fires by itself — a child presses a button, every time (WCAG 1.4.2).

/** The best on-device English voice, or null when the platform has none. */
export function onDeviceVoice(): SpeechSynthesisVoice | null {
  if (!canReadAloud()) return null;
  let voices: SpeechSynthesisVoice[];
  try {
    voices = window.speechSynthesis.getVoices();
  } catch {
    return null;
  }
  // `localService === true` is the only acceptable answer. `undefined` on an old
  // implementation is NOT a maybe: unknown means remote, because deny-by-default
  // is what SAFEGUARDING rule 8 asks for when the answer is not knowable.
  const local = voices.filter((v) => v.localService === true);
  return (
    local.find((v) => v.lang?.toLowerCase().startsWith("en-gb")) ??
    local.find((v) => v.lang?.toLowerCase().startsWith("en")) ??
    null
  );
}

/**
 * Speak a teacher's note with an on-device voice. Returns false — and says
 * nothing at all — when there is no local voice to say it with.
 */
export function readAloudOnDevice(text: string): boolean {
  const voice = onDeviceVoice();
  if (!voice) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang || "en-GB";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
