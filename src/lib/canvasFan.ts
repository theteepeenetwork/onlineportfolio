// The geometry of the canvas's two thumb fans.
//
// Everything the full-screen canvas chrome draws in a corner — the pen's nibs,
// tools and colours, the ＋ menu's kits and their second row — sits on an arc
// about one of two disc centres. This module owns that arithmetic and nothing
// else: no React, no DOM, no `server-only`, so the layout can be asserted by a
// test without mounting a canvas (see `server-only-free modules`).
//
// The reference frame is 1194 × 834 (iPad landscape, CSS px). The canvas scales
// the whole frame to the viewport, exactly as it already scales the paper, so
// every number here is a constant rather than a measurement.

// The design frame. Every coordinate below is in these units.
export const FRAME_W = 1194;
export const FRAME_H = 834;

// Both discs sit 148px in from their corner, so an arc can climb the screen
// edge without leaving it, and share one centre line.
export const DISC = 96;
export const CY = 762;
export const NEAR_X = 148;
export const FAR_X = FRAME_W - NEAR_X; // 1046

export type Hand = "right" | "left";

/** Where the pen disc's centre sits for this hand. */
export function penCx(hand: Hand): number {
  return hand === "right" ? FAR_X : NEAR_X;
}

/** Where the ＋ disc's centre sits for this hand. */
export function plusCx(hand: Hand): number {
  return hand === "right" ? NEAR_X : FAR_X;
}

/**
 * Which way a fan sweeps. Each fan opens TOWARD the nearer vertical edge, so it
 * climbs the side of the screen instead of crossing the page tray. The pen is
 * on the right for a right-handed child, so +1; the ＋ mirrors it.
 *
 * The arcs are recomputed for the other hand rather than mirrored, which is
 * what keeps every icon and label the right way up.
 */
export function penDir(hand: Hand): 1 | -1 {
  return hand === "right" ? 1 : -1;
}

export function plusDir(hand: Hand): 1 | -1 {
  return hand === "right" ? -1 : 1;
}

// Ring radii. Nearest the thumb is the thing changed most often.
export const R_NIBS = 118;
export const R_TOOLS = 196;
export const R_COLOUR_IN = 280;
export const R_COLOUR_OUT = 352;
// The band that sits under both colour arcs, and the pill a held swatch names
// itself in.
export const R_COLOUR_BAND = 316;
export const R_COLOUR_NAME = 436;
export const A_COLOUR_NAME = -26;
// The ＋ fan's own rings.
export const R_PLUS_INNER = 150;
export const R_PLUS_OUTER = 226;

/** A point on a fan's arc, as the top-left of a `size`×`size` button. */
export function polar(
  cx: number,
  r: number,
  deg: number,
  dir: 1 | -1,
  size: number,
): { left: number; top: number } {
  const a = (deg * Math.PI) / 180;
  return {
    left: Math.round(cx + dir * r * Math.sin(a) - size / 2),
    top: Math.round(CY - r * Math.cos(a) - size / 2),
  };
}

/** The same point, as a centre rather than a box corner. */
export function polarPoint(cx: number, r: number, deg: number, dir: 1 | -1) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + dir * r * Math.sin(a), y: CY - r * Math.cos(a) };
}

/** An SVG arc from angle `a` to angle `b` at radius `r` about a disc. */
export function arcPath(cx: number, dir: 1 | -1, r: number, a: number, b: number): string {
  const p = (deg: number) => {
    const { x, y } = polarPoint(cx, r, deg, dir);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  return `M ${p(a)} A ${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${p(b)}`;
}

/** How long that arc is, in px — the dash length a band sweeps open over. */
export function arcLength(r: number, a: number, b: number): number {
  return Math.round((r * Math.abs(b - a) * Math.PI) / 180) + 4;
}

/**
 * `n` items spread evenly over [a, b] degrees. One item sits in the middle
 * rather than at the start, because a fan of one should not lean.
 */
export function spread(n: number, a: number, b: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(a + b) / 2];
  const step = (b - a) / (n - 1);
  return Array.from({ length: n }, (_, i) => a + i * step);
}

// --- The rings, as data ----------------------------------------------------

// Three nibs, and the dot each one draws in the fan. The dot's diameter is not
// the stroke width — it is what that stroke looks like at a glance.
export const NIBS: { size: number; dot: number; label: string }[] = [
  { size: 6, dot: 10, label: "Thin" },
  { size: 12, dot: 22, label: "Medium" },
  { size: 22, dot: 40, label: "Thick" },
];
export const NIB_ANGLES = [-50, -14, 22];
export const NIB_BAND: [number, number] = [-62, 34];

// The tool ring, in the order a hand meets it. The canvas's own tool keys, so
// nothing here has to be translated at the call site. Text is not on this ring:
// it is Words, on the ＋ fan, because it inserts something rather than changing
// what the pen does.
export const TOOL_RING = [
  { key: "cursor", icon: "select", label: "Move" },
  { key: "pencil", icon: "pen", label: "Pen" },
  { key: "pen", icon: "felt-tip", label: "Felt tip" },
  { key: "highlighter", icon: "highlighter", label: "Highlighter" },
  { key: "eraser", icon: "eraser", label: "Rubber" },
] as const;
export const TOOL_ANGLES = [-62, -42, -22, -2, 18];
export const TOOL_BAND: [number, number] = [-74, 30];

// Ten colours, five to an arc. Named, because a swatch held down says what it
// is out loud and a screen reader needs the same words.
export const FAN_COLOURS: { hex: string; label: string }[] = [
  { hex: "#22304a", label: "ink" },
  { hex: "#bd3f63", label: "red" },
  { hex: "#f97316", label: "orange" },
  { hex: "#f0b441", label: "yellow" },
  { hex: "#a6c979", label: "light green" },
  { hex: "#37796f", label: "green" },
  { hex: "#8ab9d6", label: "sky blue" },
  { hex: "#3b82f6", label: "blue" },
  { hex: "#8b5cf6", label: "purple" },
  { hex: "#e08a9b", label: "pink" },
];
export const COLOUR_ANGLES = [0, 1, 2, 3, 4].map((i) => -40 + 14 * i);
export const COLOUR_BAND: [number, number] = [-64, 26];

// Two more discs at the far end of each arc, at the angle the ten stop short
// of. Neither is one of the ten: white is a colour a child needs and the brand
// palette does not carry (it is how you draw on a photograph, and it is the
// reason the old rainbow bar was replaced — `pen-width.spec.ts` says so), and
// "pick any colour" is not a colour at all.
export const A_EXTRA = -54;
export const WHITE = { hex: "#ffffff", label: "white" };

// The ＋ fan's inner ring: what a child can insert. Angles first, so a fan of
// two or three keeps the same spacing as the design.
export const PLUS_INNER_ANGLES = [-36, -6, 24];
export const PLUS_OUTER_ANGLES = [-45, -15, 15];

/**
 * The second row: a kit's options, on one arc if there are four or fewer and
 * split across two if there are more. The outer arc is offset by a third of a
 * step so nothing lines up radially with the arc inside it.
 */
export function secondRow(
  count: number,
  radii: [number, number],
): { r: number; deg: number }[] {
  if (count <= 4) {
    return spread(count, -62, -4).map((deg) => ({ r: radii[0], deg }));
  }
  const inner = Math.ceil(count / 2);
  const outer = count - inner;
  return [
    ...spread(inner, -66, -2).map((deg) => ({ r: radii[0], deg })),
    ...spread(outer, -55.3, -12.7).map((deg) => ({ r: radii[1], deg })),
  ];
}

/** The second row's radii, which sit further out on a teacher's fuller fan. */
export function secondRowRadii(teacher: boolean): [number, number] {
  return teacher ? [310, 398] : [280, 368];
}

// Motion. One spring for anything that fans out or lands, one stagger per item.
export const SPRING = "cubic-bezier(.34,1.4,.64,1)";
export const SPRING_MS = 340;
export const FADE_MS = 220;
export const STAGGER_MS = 22;
export const BAND_MS = 420;
