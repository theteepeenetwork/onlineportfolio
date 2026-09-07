"use client";

// One palette button's picture: the preset drawn at 26px, in its own fill and
// line, so what a teacher taps is what lands on the page.
//
// It lives out here rather than in DrawingCanvas because the ＋ fan's shape row
// and the Maths kit window both draw it, and a shared button that has to import
// a 7,000-line canvas to draw itself is a circular import waiting to happen.

import {
  isVectorKind,
  SHAPE_DEFAULTS,
  shapeFillRule,
  shapeParts,
  type ShapePreset,
} from "@/lib/canvasShapes";

export function ShapeThumb({
  preset,
  px = 26,
  fill,
  stroke,
}: {
  preset: ShapePreset;
  /** How big to draw it. 26 in a list, larger in the kit window or a fan. */
  px?: number;
  /** Override the preset's own colours — the ＋ fan draws a shape in the
      colour the pen is set to, so what a child sees is what lands. */
  fill?: string;
  stroke?: string;
}) {
  const PX = px;
  const pw = preset.w ?? SHAPE_DEFAULTS.w;
  const ph = preset.h ?? SHAPE_DEFAULTS.h;
  const scale = PX / Math.max(pw, ph);
  // A number line is 4 units tall against 700 wide; drawn to scale it would be
  // invisible, so very thin presets get a floor.
  const w = Math.max(pw * scale, isVectorKind(preset.kind) ? 0 : 3);
  const h = Math.max(ph * scale, isVectorKind(preset.kind) ? 2 : 3);
  const geom = {
    shape: preset.kind,
    w,
    h,
    cols: preset.cols,
    rows: preset.rows,
    parts: preset.parts,
    operator: preset.operator,
    sides: preset.sides,
    // A 26px button cannot show a readable number, and unreadable ones read as
    // dirt on the glyph. The ticks are what tell one line from another at this
    // size anyway — and the clock's thumb has always shown a blank face for the
    // same reason.
    numerals: false,
    // Ten ticks across 26px is a dotted line, not a number line. The button is
    // saying "this is a ruled line", so it shows few enough ticks to read as
    // one; the real count is a stepper away.
    ...(preset.kind === "numberline" ? { parts: 4 } : {}),
  };
  return (
    <svg
      viewBox={`${-(PX - w) / 2} ${-(PX - h) / 2} ${PX} ${PX}`}
      width={PX}
      height={PX}
      aria-hidden="true"
      className="overflow-visible"
    >
      {shapeParts(geom).map((part, i) => (
        <path
          key={i}
          d={part.d}
          fill={
            part.role === "detail" || (fill ?? preset.fill) === "none"
              ? "none"
              : fill ?? preset.fill ?? SHAPE_DEFAULTS.fill
          }
          fillRule={shapeFillRule(preset.kind)}
          stroke={stroke ?? preset.stroke ?? SHAPE_DEFAULTS.stroke}
          strokeWidth={(part.role === "detail" ? 0.4 : 1.2) * (PX / 26)}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {preset.text && (
        <text
          x={w / 2}
          y={h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={(preset.text.length > 2 ? 7 : 10) * (PX / 26)}
          fontWeight="700"
          fill="#1f2430"
          stroke="none"
        >
          {preset.text}
        </text>
      )}
    </svg>
  );
}
