"use client";

import { useCallback, useEffect, useState } from "react";

// A child's words survive a reload, and survive tapping the wrong tile.
//
// The canvas has kept a draft since F34; the words box never did. On the jar
// the capture surfaces are an accordion and only the open one is mounted
// (`AddToJar.tsx`), so opening Photo after writing a sentence threw the
// sentence away there and then — no reload needed. On a classroom tablet the
// reload happens by itself. "My writing has gone" is the same loss whichever
// way it happened, and it is the one thing a child cannot get back.
//
// sessionStorage rather than the IndexedDB draft store, for three reasons.
// Nothing here is bigger than a string. The tab is usually the end of its life,
// which is the more protective default for work that was never handed in —
// though only usually: "reopen closed tab" and restore-on-launch bring
// sessionStorage back with the tab, so it is the better store and not a
// guarantee, which is why it is swept on sign-out (`clearCaptureDrafts`). And
// F34's lesson was that a restore which waits on something unbounded is a
// restore that never arrives — a synchronous read has no wait to bound, so the
// failure mode that finding describes cannot occur here.
//
// A classroom tablet is a shared device, so a draft is guarded three ways, and
// the three do different jobs:
//
//  1. The key carries the child's id, so two children on one tab have separate
//     drafts and neither destroys the other's. `draftStore` does the same.
//  2. The record carries `ownerId` and it is re-checked on READ. This is the
//     one that stops anything being shown to the wrong child; a key alone
//     would be one layer where the comment claims two.
//  3. Sign-out sweeps the lot (`clearCaptureDrafts`, called from
//     `LogoutForm`), the way `clearAllDrafts` already sweeps the canvas store.
//     Per-child keys RETAIN more than one shared key did, so the sweep is not
//     optional alongside them — it is what stops the extra retention.

type CaptureDraft = { ownerId: string; text: string; caption: string };

/** The kinds of capture that carry typed words. Drawing has its own store. */
export type CaptureDraftType = "PHOTO" | "AUDIO" | "TEXT";

export type CaptureDraftState = {
  text: string;
  setText: (v: string) => void;
  caption: string;
  setCaption: (v: string) => void;
  /** Write the current values back — used when a failed submit bounces. */
  save: (text: string, caption: string) => void;
  /** Forget it: the work has been handed in, or is about to be. */
  clear: () => void;
};

/** Every capture draft on this device shares this prefix, so they can be swept. */
const PREFIX = "sj-draft-capture-";

/**
 * Wipe every capture draft on this device, whoever it belongs to.
 *
 * Called on sign-out beside `clearAllDrafts()`, and for the same reason its
 * comment gives: on a shared classroom device the next child can never be
 * offered the previous child's in-progress work. The read-time owner check is
 * the guarantee; this is defence-in-depth, and it is also the retention answer
 * — words a child never handed in should not outlive their session on a tablet
 * that goes back in the trolley.
 */
export function clearCaptureDrafts(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) doomed.push(k);
    }
    for (const k of doomed) sessionStorage.removeItem(k);
  } catch {
    /* storage unavailable — there is nothing stored to clear */
  }
}

export function useCaptureDraft(ownerId: string, type: CaptureDraftType): CaptureDraftState {
  // The child is IN the key, not only inside the record: two children sharing a
  // tab keep separate drafts, so opening the Words box does not destroy the
  // writing the last child left in it. The owner check on read below is still
  // what decides whether anything is shown.
  const key = `${PREFIX}${ownerId}-${type}`;
  const [text, setText] = useState("");
  const [caption, setCaption] = useState("");
  // Nothing is written back until the read has happened, so the empty first
  // render cannot delete the draft it is about to restore.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      const d = raw ? (JSON.parse(raw) as CaptureDraft) : null;
      if (d && d.ownerId === ownerId) {
        if (d.text) setText(d.text);
        if (d.caption) setCaption(d.caption);
      } else if (d) {
        // Somebody else's. Not ours to keep, and not ours to show.
        sessionStorage.removeItem(key);
      }
    } catch {
      // Unreadable — a truncated write, or a shape from an older build. It is
      // removed rather than left to sit there being unparseable at every mount,
      // so "we do not keep what we cannot verify" is true of both ways a draft
      // can fail the check, not just the one.
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* storage unavailable — nothing was stored to remove */
      }
    }
    setRestored(true);
  }, [key, ownerId]);

  const save = useCallback(
    (t: string, c: string) => {
      try {
        if (t || c) sessionStorage.setItem(key, JSON.stringify({ ownerId, text: t, caption: c }));
        else sessionStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    },
    [key, ownerId],
  );

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }, [key]);

  useEffect(() => {
    if (restored) save(text, caption);
  }, [restored, text, caption, save]);

  return { text, setText, caption, setCaption, save, clear };
}
