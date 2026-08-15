"use client";

import { useEffect, useState } from "react";
import { canReadAloud } from "./readAloud";

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
