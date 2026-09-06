// Which corner the canvas fans open from.
//
// A DEVICE preference, not a person's: the tablet on the left-handed table is
// the left-handed one. It holds nothing about a child, so it lives in
// localStorage rather than in their record — RETENTION.md's rule that nothing
// about a child is stored that need not be.
//
// It is a tiny external store rather than a piece of component state so the
// canvas can read it with `useSyncExternalStore`: the server has no
// localStorage, and setting the value from an effect after mount would be one
// more cascading render on the heaviest screen in the app.

import type { Hand } from "./canvasFan";

const KEY = "sj-canvas-hand";

let cached: Hand | null = null;
const listeners = new Set<() => void>();

export function subscribeHand(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** What this device is set to. "right" wherever storage is unavailable. */
export function readHand(): Hand {
  if (cached) return cached;
  try {
    cached = window.localStorage.getItem(KEY) === "left" ? "left" : "right";
  } catch {
    // A private window, or a locked-down kiosk. Right-handed is the default
    // anyway, and a child can still swap it for this session.
    cached = "right";
  }
  return cached;
}

/** What the server renders, before any device is known. */
export function serverHand(): Hand {
  return "right";
}

export function writeHand(next: Hand): void {
  cached = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    /* the swap still holds for this session */
  }
  for (const fn of listeners) fn();
}
