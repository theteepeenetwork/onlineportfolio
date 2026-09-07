"use client";

import { useEffect, useState } from "react";
import { canReadAloud, onDeviceVoice } from "./readAloud";

// Is read-aloud available in this browser? `speechSynthesis` support is only
// knowable on the client, so the 🔊 affordance renders OFF first — matching the
// server render — then turns on once mounted. That is the SSR-safe pattern (the
// same one StatusStrip uses): a deliberate sync with a browser capability, not
// derived state, hence the eslint suppression on the one-shot post-mount set.
export function useSpeechReady(): boolean {
  const [ready, setReady] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setReady(canReadAloud()), []);
  return ready;
}

// Is there a voice the platform says runs ON THIS DEVICE? The stricter sibling
// of the above, and the one that gates reading an ADULT'S OWN WORDS aloud — a
// teacher's note, a teacher's question — where `canReadAloud` would be a
// promise we cannot keep, because a cloud voice ships the text off the tablet
// (SAFEGUARDING rules 10 & 11, and the 2026-08-19 scope note).
//
// False until proven otherwise, twice over: `getVoices()` is usually empty on
// first paint, so the list is re-read when `voiceschanged` fires, and a voice
// that does not say `localService === true` is treated as remote. Where the
// answer is false the listen button is not rendered at all — deny by default,
// not a degraded fallback. This is the effect TeacherNote has carried inline
// since F38; it lives here now because a second surface needs exactly it.
export function useOnDeviceVoiceReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const check = () => setReady(onDeviceVoice() !== null);
    check();
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.addEventListener?.("voiceschanged", check);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", check);
  }, []);
  return ready;
}
