"use client";

// The furniture round the edge of the full-screen canvas: the way out, undo and
// redo, the "where is this work up to" chip, the way in to the jar, and the
// toast that names what the last thing did.
//
// All of it in design units scaled by one number, so the whole frame keeps its
// proportions from a 768px classroom tablet to a desk monitor, and none of it
// is a Tailwind class that can be purged out from under a child (see the
// `holdUp` note in DrawingCanvas for the time that happened).

import { useEffect, useState, type ReactNode } from "react";
import { SPRING, SPRING_MS, Z_TOAST } from "@/lib/canvasFan";
import type { Unit } from "./Fan";

const INK = "#22304a";
const CREAM = "#fffdf7";
const PAPER = "#faf6ee";
const HONEY_TINT = "#fbeed3";
const HONEY_INK = "#8a5f1e";
const KRAFT = "#c9a87c";
const GLASS = "#37796f";

/** A 64px round control in the top-left cluster: undo, redo, a teacher's ✕. */
export function ChromeRound({
  u,
  label,
  onClick,
  disabled,
  title,
  children,
}: {
  u: Unit;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: u(64, 64),
        height: u(64, 64),
        borderRadius: 999,
        flex: "0 0 auto",
        // Disabled is drawn as an EMPTY outline rather than a greyed button:
        // there is nothing to take back yet, and a faded solid button reads as
        // one that is broken.
        background: disabled ? "transparent" : CREAM,
        border: disabled
          ? `${Math.max(2, u(3))}px dashed ${KRAFT}`
          : `${Math.max(2, u(3))}px solid ${INK}`,
        boxShadow: disabled ? "none" : `0 ${u(4)}px 0 rgba(34,48,74,.15)`,
        opacity: disabled ? 0.4 : 1,
        color: INK,
      }}
    >
      {children}
    </button>
  );
}

/** The child's labelled way out: "← [jar] Back to my jar". */
export function ChromePill({
  u,
  label,
  onClick,
  children,
}: {
  u: Unit;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: u(8),
        height: u(64, 64),
        padding: `0 ${u(22)}px 0 ${u(18)}px`,
        borderRadius: 999,
        background: CREAM,
        border: `${Math.max(2, u(3))}px solid ${INK}`,
        boxShadow: `0 ${u(4)}px 0 rgba(34,48,74,.15)`,
        font: `700 ${u(18)}px var(--font-atkinson)`,
        color: INK,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/** "Not in your jar yet" / "Draft template" — where this work has got to. */
export function StatusChip({ u, children }: { u: Unit; children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: u(8),
        height: u(44, 44),
        padding: `0 ${u(14)}px`,
        borderRadius: 999,
        background: HONEY_TINT,
        border: `${Math.max(2, u(3))}px solid ${INK}`,
        font: `700 ${u(15)}px var(--font-atkinson)`,
        color: HONEY_INK,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** The way in to the jar: the one green thing on the screen. */
export function ChromeDone({
  u,
  label,
  title,
  type = "button",
  onClick,
  children,
}: {
  u: Unit;
  label: string;
  title?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: u(10),
        height: u(64, 64),
        padding: `0 ${u(26)}px`,
        borderRadius: 999,
        background: GLASS,
        border: "none",
        boxShadow: `0 ${u(4)}px 0 #35706a`,
        font: `600 ${u(22)}px var(--font-fredoka)`,
        color: PAPER,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/**
 * What the last thing did, in the words undo would take back. It is deliberately
 * the undo LABEL and not a confirmation: "Star gone" tells a child both what
 * happened and what the arrow beside their jar will bring back.
 */
export function Toast({ u, message }: { u: Unit; message: { text: string; at: number } | null }) {
  // Which toast has had its turn. Tracking the one that is FINISHED rather than
  // the one that is showing means the same words twice in a row still show
  // twice — each has its own `at` — and nothing is set during a render.
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setDone(message.at), 1600);
    return () => clearTimeout(t);
  }, [message]);

  if (!message || done === message.at) return null;
  const { at, text: shown } = message;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute"
      key={at}
      style={{
        left: "50%",
        bottom: u(150),
        zIndex: Z_TOAST,
        background: INK,
        color: PAPER,
        borderRadius: 999,
        padding: `${u(10)}px ${u(18)}px`,
        font: `600 ${u(18)}px var(--font-fredoka)`,
        whiteSpace: "nowrap",
        animation: `sj-toast-in ${SPRING_MS}ms ${SPRING} backwards`,
      }}
    >
      {shown}
    </div>
  );
}
