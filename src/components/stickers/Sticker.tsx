import type { CSSProperties } from "react";
import { STICKER_BY_KEY } from "@/lib/stickers";

// A puffy die-cut reward sticker (design handoff: "Sticker feedback", screens
// 1b/1d). Pure presentational server component — the look (accent colour /
// holographic foil / label) is derived from the fixed catalog by key, so
// callers only ever pass a key. Icons are the hand-inked set drawn on a 24×24
// keyline grid, reproduced exactly from the design file.

const FILL = "#FFFDF7";
const INK = "#22304A";

// Solid badge shapes: white fill + ink outline.
const S = { fill: FILL, stroke: INK, strokeWidth: 1.7, strokeLinejoin: "round", strokeLinecap: "round" } as const;
// Line-only details: no fill.
const L = { fill: "none", stroke: INK, strokeWidth: 1.7, strokeLinejoin: "round", strokeLinecap: "round" } as const;

const GLYPHS: Record<string, React.ReactNode> = {
  star: <path {...S} d="M12 3.2l2.5 5.1 5.6.8-4.1 4 .9 5.6-5-2.6-5 2.6.9-5.6-4.1-4 5.6-.8z" />,
  brill: (
    <>
      <path {...S} d="M12 3 C12.7 8.3 13.7 9.3 19 11 C13.7 12.7 12.7 13.7 12 19 C11.3 13.7 10.3 12.7 5 11 C10.3 9.3 11.3 8.3 12 3 Z" />
      <path {...S} strokeWidth={1.3} d="M18.4 4 C18.6 5.5 18.9 5.8 20.4 6 C18.9 6.2 18.6 6.5 18.4 8 C18.2 6.5 17.9 6.2 16.4 6 C17.9 5.8 18.2 5.5 18.4 4 Z" />
    </>
  ),
  effort: (
    <>
      <path {...S} d="M4 12h3v8H4z" />
      <path {...S} d="M7 12l3.3-7c.25-.55.8-.9 1.4-.8.9.15 1.4 1.05 1.15 1.9L11.9 10H18c1 0 1.75 1 1.5 2l-1.2 5c-.2.85-.95 1.4-1.8 1.4H7z" />
    </>
  ),
  love: <path {...S} d="M12 20C6.9 16.2 4 13 4 9.7 4 7.4 5.8 5.7 8 5.7c1.5 0 2.8.8 3.5 2 .7-1.2 2-2 3.5-2 2.2 0 4 1.7 4 4 0 3.3-2.9 6.5-8 10.3z" />,
  sci: (
    <>
      <path {...L} d="M12 21v-8" />
      <path {...S} d="M12 15c-1-3.6-4-4.6-6.6-4 0 3 2 5.6 6.6 4z" />
      <path {...S} d="M12 13.2c.5-3.6 3-5.6 6-5 .3 3-1.5 6-6 5z" />
    </>
  ),
  write: (
    <>
      <path {...S} d="M15.4 5.3l3.3 3.3-9.1 9.1-3.9.6.6-3.9z" />
      <path {...L} d="M13.6 7.1l3.3 3.3" />
    </>
  ),
  maths: (
    <>
      <circle {...S} cx={12} cy={12} r={8.4} />
      <path {...L} strokeWidth={2} d="M12 8v8M8 12h8" />
    </>
  ),
  kind: (
    <>
      <path {...S} d="M12 11c-2-1.4-3.3-2.7-3.3-4.2 0-1.05.85-1.8 1.8-1.8.75 0 1.25.4 1.5.9.25-.5.75-.9 1.5-.9.95 0 1.8.75 1.8 1.8 0 1.5-1.3 2.8-3.3 4.2z" />
      <path {...L} d="M5 13c0 3.7 3.1 6.2 7 6.2s7-2.5 7-6.2" />
    </>
  ),
  read: (
    <>
      <path {...S} d="M12 6.2C10 4.9 7.6 4.7 5 5.2v11c2.6-.5 5-.3 7 1 2-1.3 4.4-1.5 7-1v-11c-2.6-.5-5-.3-7 1z" />
      <path {...L} d="M12 6.2v11" />
    </>
  ),
  art: (
    <>
      <path {...S} d="M12 4c-4.4 0-8 3.1-8 7 0 2.3 1.9 3.6 3.9 3.6 1.1 0 1.6.7 1.6 1.5 0 1.3 1.1 2.4 2.5 2.4 4.4 0 8-3.1 8-7.5S16.4 4 12 4z" />
      <circle cx={8} cy={9} r={1} fill={INK} />
      <circle cx={12} cy={7.5} r={1} fill={INK} />
      <circle cx={15.6} cy={9} r={1} fill={INK} />
      <circle cx={16.4} cy={12.4} r={1} fill={INK} />
    </>
  ),
  smile: (
    <>
      <circle {...S} cx={12} cy={12} r={8.4} />
      <circle cx={9} cy={10} r={1.05} fill={INK} />
      <circle cx={15} cy={10} r={1.05} fill={INK} />
      <path {...L} d="M8.5 13.6c.8 1.6 2 2.3 3.5 2.3s2.7-.7 3.5-2.3" />
    </>
  ),
  wow: (
    <>
      <circle {...S} cx={12} cy={12} r={2.7} />
      <path {...L} strokeWidth={2} d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  proud: (
    <>
      <path {...S} d="M9 13l-1.6 7.4 4.6-2.6 4.6 2.6L15 13z" />
      <circle {...S} cx={12} cy={9} r={5.6} />
      <path fill={INK} d="M12 6.1l.85 1.8 2 .25-1.45 1.35.37 1.95L12 10.5l-1.77.95.37-1.95L9.15 8.15l2-.25z" />
    </>
  ),
  laugh: (
    <>
      <circle {...S} cx={12} cy={12} r={8.4} />
      <path {...L} d="M7.4 10.4c.5-.7 1.6-.7 2.1 0" />
      <path {...L} d="M14.5 10.4c.5-.7 1.6-.7 2.1 0" />
      <path fill={INK} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" d="M7.2 13.4h9.6c0 2.8-2.2 4.6-4.8 4.6s-4.8-1.8-4.8-4.6z" />
    </>
  ),
  curious: (
    <>
      <path {...S} d="M12 3.6c-3.2 0-5.4 2.3-5.4 5.2 0 2 1.1 3.3 2 4.2.6.7.9 1.2.9 2h5c0-.8.3-1.3.9-2 .9-.9 2-2.2 2-4.2 0-2.9-2.2-5.2-5.4-5.2z" />
      <path {...L} d="M9.6 17.4h4.8M10.2 19.4h3.6" />
      <path {...L} d="M12 15.2v-2.6" />
    </>
  ),
  brave: (
    <>
      <path {...S} d="M12 3.5l7 2.2v4.8c0 4.3-3 7.5-7 9.1-4-1.6-7-4.8-7-9.1V5.7z" />
      <path fill={INK} d="M12 7.8l.9 1.9 2.1.2-1.6 1.4.5 2-1.9-1.1-1.9 1.1.5-2-1.6-1.4 2.1-.2z" />
    </>
  ),
  first: (
    <>
      <path {...L} d="M7 3.2v18" />
      <path {...S} d="M7 4.2h9.2l-2.2 3 2.2 3H7z" />
    </>
  ),
  finish: (
    <>
      <path {...S} d="M12 3c3 2.3 4.5 5.6 4.5 9.2l-2 2h-5l-2-2C7.5 8.6 9 5.3 12 3z" />
      <circle cx={12} cy={9} r={1.7} fill={INK} />
      <path {...S} d="M9.6 14.2l-2.6 3 2.6-.3M14.4 14.2l2.6 3-2.6-.3" />
      <path {...L} d="M10.5 17.2c.4 1.5 1.5 3 1.5 3s1.1-1.5 1.5-3" />
    </>
  ),
  best: (
    <>
      <path {...L} strokeWidth={2} d="M4 18a8 8 0 0 1 16 0" />
      <path {...L} strokeWidth={2} d="M7 18a5 5 0 0 1 10 0" />
      <path {...L} strokeWidth={2} d="M9.6 18a2.4 2.4 0 0 1 4.8 0" />
      <path {...L} strokeWidth={2} d="M3.5 18h17" />
    </>
  ),
  trophy: (
    <>
      <path {...S} d="M7.5 4.5h9v3.4c0 2.6-2 4.6-4.5 4.6s-4.5-2-4.5-4.6z" />
      <path {...L} d="M7.5 5.6C5.6 5.6 4.6 6.6 4.6 8c0 1.4 1 2.3 2.8 2.5" />
      <path {...L} d="M16.5 5.6C18.4 5.6 19.4 6.6 19.4 8c0 1.4-1 2.3-2.8 2.5" />
      <path {...L} d="M12 12.5v3.3" />
      <path {...S} d="M9.4 19h5.2v-1.4c0-.6-.5-1.1-1.1-1.1h-3c-.6 0-1.1.5-1.1 1.1z" />
    </>
  ),
  crown: (
    <>
      <path {...S} d="M4.6 17.8l-1-8.4 4.3 3.8L12 6l4.1 7.2 4.3-3.8-1 8.4z" />
      <path {...L} d="M4.8 18.2h14.4" />
    </>
  ),
  target: (
    <>
      <circle {...S} cx={12} cy={12} r={8.4} />
      <circle {...L} cx={12} cy={12} r={5} />
      <circle cx={12} cy={12} r={1.9} fill={INK} />
    </>
  ),
  mountain: (
    <>
      <path {...S} d="M3.5 18.5L9 8l3.6 5.4 2-2.6 5.9 7.7z" />
      <circle cx={16.5} cy={6.5} r={1.7} fill={INK} />
      <path {...L} d="M6.4 13.4L9 8.6l1.8 2.8" />
    </>
  ),
  levelup: (
    <>
      <path {...L} strokeWidth={2} d="M6 12.5l6-6 6 6" />
      <path {...L} strokeWidth={2} d="M6 17.5l6-6 6 6" />
    </>
  ),
};

export function StickerIcon({ k, size }: { k: string; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      {GLYPHS[k] ?? GLYPHS.star}
    </svg>
  );
}

export function Sticker({
  k,
  size = 48,
  selected = false,
  style,
}: {
  k: string;
  size?: number;
  selected?: boolean;
  style?: CSSProperties;
}) {
  const def = STICKER_BY_KEY.get(k) ?? { k: "star", label: "Star work", bg: "#F0B441" };
  const disc = Math.round(size * 0.8);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: "#FFFDF7",
        boxShadow: "0 4px 9px rgba(34,48,74,.22)",
        boxSizing: "border-box",
        width: size,
        height: size,
        border: selected ? "3px solid var(--glass)" : "3px solid transparent",
        ...style,
      }}
    >
      <span
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 -3px 5px rgba(0,0,0,.16), inset 0 3px 4px rgba(255,255,255,.42)",
          width: disc,
          height: disc,
          background: def.holo ? "transparent" : def.bg,
        }}
      >
        {def.holo && (
          <>
            {/* rainbow foil — transform-only spin (GPU-composited) */}
            <span className="sj-holo-foil" aria-hidden="true" />
            {/* static prism grid */}
            <span
              aria-hidden="true"
              style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(62deg, rgba(255,255,255,.18) 0 2px, rgba(255,255,255,0) 2px 6px)" }}
            />
            {/* travelling sheen */}
            <span className="sj-holo-sheen" aria-hidden="true" />
          </>
        )}
        <span style={{ position: "relative", zIndex: 2, display: "flex" }}>
          <StickerIcon k={def.k} size={Math.round(size * 0.56)} />
        </span>
      </span>
    </span>
  );
}
