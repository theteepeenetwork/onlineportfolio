"use client";

import { useState } from "react";

const TWINKLE = "M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z";

// The star burst: each star sits around the jar's mouth and flies outward along
// its own (--bx,--by) vector, then keeps gently growing/shrinking (tw = the
// twinkle's cycle length, varied per star so they don't pulse in lockstep).
const STARS: { x: number; y: number; s: number; rot: number; bx: string; by: string; fill: string; tw: string }[] = [
  { x: 190, y: 54, s: 1.2, rot: 0, bx: "0px", by: "-64px", fill: "#F0B441", tw: "1.7s" },
  { x: 124, y: 92, s: 0.85, rot: -12, bx: "-72px", by: "-42px", fill: "#E08A9B", tw: "2s" },
  { x: 258, y: 92, s: 0.85, rot: 12, bx: "72px", by: "-42px", fill: "#F0B441", tw: "1.85s" },
  { x: 90, y: 168, s: 0.7, rot: 8, bx: "-76px", by: "-8px", fill: "#F0B441", tw: "2.15s" },
  { x: 292, y: 170, s: 0.72, rot: -8, bx: "76px", by: "-8px", fill: "#E08A9B", tw: "1.95s" },
  { x: 156, y: 66, s: 0.55, rot: -6, bx: "-36px", by: "-66px", fill: "#E08A9B", tw: "2.25s" },
];

// The KS1 celebration jar. A client component for one reason: tapping the jar
// replays the whole animation. Bumping `run` remounts the animated subtree, so
// every data-anim element restarts from its first frame (the CSS does the rest).
// Everything is pure CSS keyframes, honoured by the single global
// reduced-motion guard (SAFEGUARDING rule 18) — with motion off, each step
// lands on its final frame and the continuous twinkle stops.
export function PoppedJar() {
  const [run, setRun] = useState(0);

  return (
    <button
      type="button"
      onClick={() => setRun((r) => r + 1)}
      aria-label="Play it again"
      style={{ background: "none", border: "none", padding: 0, borderRadius: 24, cursor: "pointer", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
    >
      <div key={run} data-anim="jar" style={{ position: "relative" }}>
        <svg width="300" height="380" viewBox="0 0 380 480" style={{ overflow: "visible", display: "block" }} aria-hidden="true">
          {/* jar body (glass) + shine */}
          <path d="M118,92 C114,104 112,112 114,120 C94,136 78,158 74,192 C69,228 72,262 71,300 C70,338 70,372 74,404 C78,436 100,452 138,455 C172,458 212,458 244,454 C282,450 302,434 306,402 C310,368 309,334 308,298 C307,260 310,226 304,192 C298,156 284,134 264,120 C266,111 264,102 260,93 C260,93 216,86 188,86 C158,86 118,92 118,92 Z" fill="#EAF4F1" stroke="#22304A" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" opacity="0.98" />
          <path d="M96,220 C93,186 102,158 122,140" fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" opacity="0.9" />

          {/* the open rim — revealed while the lid is lifted */}
          <path d="M110,80 L268,80 C276,80 280,85 280,92 C280,100 275,104 266,104 L112,104 C103,104 98,100 98,92 C98,85 102,80 110,80 Z" fill="#CFE6E0" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" />

          {/* the pile already in the jar */}
          <g transform="translate(104,352) rotate(-6)"><rect width="58" height="58" rx="5" fill="#F0B441" stroke="#22304A" strokeWidth="3" /></g>
          <g transform="translate(170,362) rotate(4)"><rect width="58" height="58" rx="5" fill="#37796f" stroke="#22304A" strokeWidth="3" /></g>
          <g transform="translate(232,350) rotate(-3)"><rect width="58" height="58" rx="5" fill="#E08A9B" stroke="#22304A" strokeWidth="3" /></g>

          {/* the coloured square dropping in, landing on the pile */}
          <g data-anim="square">
            <g transform="translate(160,300) rotate(-5)">
              <rect width="60" height="60" rx="6" fill="#8AB9D6" stroke="#22304A" strokeWidth="4" />
            </g>
          </g>

          {/* the lid — lifts off, then seats back down */}
          <g data-anim="lid">
            <g transform="rotate(-1.5 189 78)">
              <rect x="100" y="62" width="180" height="30" rx="12" fill="#C9A87C" stroke="#22304A" strokeWidth="6" />
              <rect x="112" y="68" width="156" height="8" rx="4" fill="#E0C79B" />
            </g>
          </g>

          {/* the star burst, then a continuous twinkle. Two nested groups so the
              transforms compose without fighting: the outer flies the star out
              (translate + scale, held), the inner grows/shrinks forever. */}
          {STARS.map((st, i) => (
            <g key={i} data-anim="star" style={{ "--bx": st.bx, "--by": st.by } as React.CSSProperties}>
              <g data-anim="twinkle" style={{ animationDuration: st.tw }}>
                <path transform={`translate(${st.x},${st.y}) scale(${st.s}) rotate(${st.rot})`} d={TWINKLE} fill={st.fill} />
              </g>
            </g>
          ))}
        </svg>
      </div>
    </button>
  );
}
