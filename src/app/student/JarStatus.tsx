"use client";

import { useEffect, useState } from "react";
import { markJarSeen } from "@/app/actions/journal";
import { studentCopyNeutral } from "@/lib/copy/student";

// Only the register-independent "Waiting" is read here (see JarSummary), so the
// neutral pack is enough — this component needs no age mode.
const c = studentCopyNeutral.status;

// The jar, doing the job the sentences were doing badly.
//
// Storyjar's whole promise is: you make something → your teacher sees it → it
// goes in your jar. A child could only ever read that loop in prose ("Waiting
// for your teacher to see it ⏳"), which is invisible to a five-year-old. The
// jar itself was the one non-text status in the app and it only counted.
//
// So the jar now says where everything is, using the metaphor the child already
// understands:
//
//   waiting  → the tile sits ON THE RIM, not yet in. It's made, it's not in.
//   in       → the tile is INSIDE the jar.
//   arrived  → a tile approved while they were away FALLS IN, once (M2).
//
// The counts and sentences stay for the children who can read them, and every
// state has an icon as well as a colour — nothing here is carried by colour or
// motion alone (WCAG 1.4.1, and the a11y gate is blocking).
const TILE_COLOURS = ["#C2476B", "#F0B441", "#37796f", "#8AB9D6", "#A6C979"];

// Where the tiles sit inside the jar, bottom-up: a jar fills from the bottom.
const INSIDE = [
  { x: 24, y: 92, r: -6 },
  { x: 45, y: 96, r: 5 },
  { x: 60, y: 90, r: -4 },
  { x: 34, y: 74, r: 4 },
  { x: 54, y: 72, r: -5 },
];

// Perches along the lid. A waiting moment is balanced on top: it exists, and it
// is visibly not in yet.
const RIM = [
  { x: 22, y: -4, r: -10 },
  { x: 44, y: -8, r: 4 },
  { x: 66, y: -4, r: 9 },
];

export function JarStatus({
  inJar,
  waiting,
  arrived,
}: {
  inJar: number;
  waiting: number;
  /** Approved while the child was away — these fall in, once. */
  arrived: number;
}) {
  // Start with the arrivals still out of the jar, then drop them on mount, so
  // the child sees the moment happen rather than finding it already done.
  const [dropped, setDropped] = useState(false);

  useEffect(() => {
    if (arrived === 0) return;
    const t = setTimeout(() => setDropped(true), 80);
    // Once it has played, it isn't news any more. Recording this is what stops
    // the jar celebrating the same moment every single visit.
    void markJarSeen();
    return () => clearTimeout(t);
  }, [arrived]);

  const settled = inJar - arrived; // already in the jar before today
  const rim = Math.min(waiting, RIM.length);

  return (
    <svg
      width="72"
      height="90"
      viewBox="-6 -20 112 146"
      role="img"
      aria-label={`${inJar} in your jar${waiting > 0 ? `, ${waiting} waiting on top` : ""}`}
    >
      {/* jar */}
      <rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" />
      <path
        d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z"
        fill="#EAF4F1"
        stroke="#22304A"
        strokeWidth="5"
        strokeLinejoin="round"
      />

      {/* what's already in */}
      {INSIDE.slice(0, Math.min(settled, INSIDE.length)).map((p, i) => (
        <rect key={`in-${i}`} x={p.x} y={p.y} width="17" height="17" rx="4" fill={TILE_COLOURS[i % TILE_COLOURS.length]} transform={`rotate(${p.r} ${p.x + 8} ${p.y + 8})`} />
      ))}

      {/* what just went in, while they were away — M2 */}
      {INSIDE.slice(Math.min(settled, INSIDE.length), Math.min(inJar, INSIDE.length)).map((p, i) => {
        const idx = Math.min(settled, INSIDE.length) + i;
        return (
          <rect
            key={`new-${i}`}
            data-jar-arrival={dropped ? "in" : "above"}
            x={p.x}
            y={p.y}
            width="17"
            height="17"
            rx="4"
            fill={TILE_COLOURS[idx % TILE_COLOURS.length]}
            transform={`rotate(${p.r} ${p.x + 8} ${p.y + 8})`}
          />
        );
      })}

      {/* what's made but not in yet — balanced on the rim */}
      {RIM.slice(0, rim).map((p, i) => (
        <g key={`rim-${i}`} data-jar-rim="true">
          <rect x={p.x} y={p.y} width="16" height="16" rx="4" fill="#FFFDF7" stroke="#22304A" strokeWidth="3" transform={`rotate(${p.r} ${p.x + 8} ${p.y + 8})`} />
          {/* the little clock face — waiting is never colour alone */}
          <circle cx={p.x + 8} cy={p.y + 8} r="3.2" fill="none" stroke="#8A5F1E" strokeWidth="1.6" />
          <path d={`M${p.x + 8},${p.y + 6} L${p.x + 8},${p.y + 8} L${p.x + 9.6},${p.y + 9}`} fill="none" stroke="#8A5F1E" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

// The line under the jar. Says the same thing in words, for the children who
// can read it — and never says it *instead*.
export function JarSummary({ inJar, waiting }: { inJar: number; waiting: number }) {
  return (
    <span style={{ font: "600 18px var(--font-fredoka)", color: "#37796f" }}>
      {inJar} {inJar === 1 ? "moment" : "moments"}
      {waiting > 0 && (
        <span style={{ color: "#8A5F1E" }}>
          {" · "}
          {waiting} {c.waitingShort.toLowerCase()}
        </span>
      )}
    </span>
  );
}
