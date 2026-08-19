// The canvas shape catalogue: what shapes exist, how each one is drawn, and
// which toolbox kit offers it.
//
// This is the SINGLE source of truth for shape geometry. It used to be two:
// `ShapeKind` was declared in canvasObjects.ts (where it gates validation) and
// again in DrawingCanvas.tsx (where it drives the palette), with the path
// helpers living only in the component. Nothing kept the two unions in step,
// and a kind added to one but not the other is silently coerced to "rect" on
// save. So both now import from here.
//
// PURITY MATTERS. canvasObjects.ts imports this, and canvasObjects.ts is
// imported by server actions (src/app/actions/activities.ts). Nothing in this
// file may touch the DOM, the filesystem or the database. That is why
// `fitTextToBox` stayed behind in DrawingCanvas.tsx: it measures with an
// offscreen <canvas> and so needs `document`.
//
// Geometry is expressed as SVG path strings for a w×h box at the origin, which
// both renderers consume: the on-screen SVG (<path d=…>) and the export /
// flatten pass (new Path2D(d) on a 2D context). One source, so what a child
// sees and what lands in their handed-in PNG cannot drift apart.

export type ShapeKind =
  | "rect"
  | "ellipse"
  | "triangle"
  | "star"
  | "speech"
  // Vector kinds. Drawn corner-to-corner across their box, so a thin box gives
  // a horizontal or vertical rule and a square one gives a diagonal. See
  // VECTOR_KINDS below for why they are special-cased on resize.
  | "line"
  | "arrow";

// The validation gate. `normalizeObject` coerces anything not in this array to
// "rect", so a kind is not real until it is listed here.
export const SHAPE_KINDS: ShapeKind[] = [
  "rect",
  "ellipse",
  "triangle",
  "star",
  "speech",
  "line",
  "arrow",
];

// Kinds drawn as a stroke from one corner of their box to the other, rather
// than as an area filling it.
//
// They need two floors relaxed. A number line, an axis or a table rule is a box
// a couple of units tall, and both the resize floor (24) and the stored minimum
// width (8) would round that back into a square. Relaxing those for AREA shapes
// would let a child lose a rectangle by squashing it to nothing, so the relaxed
// floor is scoped to exactly these kinds.
export const VECTOR_KINDS: ShapeKind[] = ["line", "arrow"];

export function isVectorKind(shape: ShapeKind): boolean {
  return VECTOR_KINDS.includes(shape);
}

// The smallest a shape may get on either axis, in model units.
export function minShapeSize(shape: ShapeKind): number {
  return isVectorKind(shape) ? 2 : 24;
}

// ---------------------------------------------------------------------------
// The multi-part path contract
// ---------------------------------------------------------------------------
//
// A shape is a LIST of parts, not one path string, because one path string can
// only carry one stroke weight. Both renderers stroke the whole path at the
// object's `strokeWidth`, so apparatus with internal division lines — a base-10
// hundred flat, a ten frame — would draw its 9×9 grid at exactly the weight of
// its outline. Thinning the stroke to fix the grid thins the outline too, and
// the result is a faint square full of faint lines.
//
// So each part declares its role:
//   • "outline" — filled (with the kind's fill rule) and stroked at strokeWidth.
//   • "detail"  — never filled, stroked at strokeWidth * DETAIL_RATIO.
//
// Every shape that ships today returns exactly one "outline" part, so this
// changes nothing for them. It exists for the apparatus that comes next.
export type ShapePart = { d: string; role: "outline" | "detail" };

// How much thinner an internal division line is than the outline that contains
// it. Chosen so a hundred flat reads as a firm square full of hairlines, which
// is what the physical apparatus looks like.
export const DETAIL_RATIO = 0.4;

// The floor, in model units, under which a detail stroke stops being visible at
// all. A hairline that vanishes is worse than one that is slightly too thick.
export const DETAIL_MIN_WIDTH = 1;

// The stroke width a "detail" part is drawn at, given the object's own width.
export function detailStrokeWidth(strokeWidth: number): number {
  return Math.max(DETAIL_MIN_WIDTH, strokeWidth * DETAIL_RATIO);
}

// The geometry-relevant face of a placed shape. Deliberately narrower than
// ShapeObj: this module has no business seeing ids, colours or lock flags, and
// keeping the input small means the palette can render a preview by passing a
// bare {shape, w, h} without inventing an object.
export type ShapeGeom = {
  shape: ShapeKind;
  w: number;
  h: number;
  // Vector kinds: which diagonal of the box the stroke runs along. Absent /
  // false runs top-left → bottom-right, true runs bottom-left → top-right.
  // Together with a thin box that reaches all four quadrants without a rotation
  // handle and without any negative geometry.
  flip?: boolean;
};

function roundRectPath(w: number, h: number, r: number) {
  return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
}

function starPath(w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  const spikes = 5;
  let d = "";
  for (let i = 0; i < spikes * 2; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / spikes;
    const rx = (i % 2 === 0 ? 1 : 0.44) * (w / 2);
    const ry = (i % 2 === 0 ? 1 : 0.44) * (h / 2);
    d += `${i === 0 ? "M" : "L"} ${cx + Math.cos(ang) * rx} ${cy + Math.sin(ang) * ry} `;
  }
  return d + "Z";
}

function speechPath(w: number, h: number) {
  const bh = h * 0.78;
  const r = Math.min(w, bh) * 0.16;
  const rb = w * 0.4;
  const lb = w * 0.22;
  const tip = w * 0.14;
  return [
    `M ${r} 0`,
    `H ${w - r}`,
    `Q ${w} 0 ${w} ${r}`,
    `V ${bh - r}`,
    `Q ${w} ${bh} ${w - r} ${bh}`,
    `H ${rb}`,
    `L ${tip} ${h}`,
    `L ${lb} ${bh}`,
    `H ${r}`,
    `Q 0 ${bh} 0 ${bh - r}`,
    `V ${r}`,
    `Q 0 0 ${r} 0`,
    `Z`,
  ].join(" ");
}

// The two ends of a vector kind's stroke, given its box and which diagonal it
// runs along.
function vectorEnds(w: number, h: number, flip?: boolean) {
  return flip
    ? { x1: 0, y1: h, x2: w, y2: 0 }
    : { x1: 0, y1: 0, x2: w, y2: h };
}

// A straight rule. Just the stroke — never an area, so its preset carries
// fill: "none" and the renderer is not asked to guess.
function linePath(w: number, h: number, flip?: boolean) {
  const { x1, y1, x2, y2 } = vectorEnds(w, h, flip);
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

// A straight rule with a head on the far end. The head is drawn as two strokes
// rather than a filled triangle so it inherits the line's colour and weight and
// stays legible when a child recolours it.
function arrowPath(w: number, h: number, flip?: boolean) {
  const { x1, y1, x2, y2 } = vectorEnds(w, h, flip);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // The head scales with the shaft but is capped, so a very long number-line
  // arrow does not end in an enormous chevron.
  const head = Math.min(len * 0.28, 46);
  const ang = Math.atan2(dy, dx);
  const spread = 0.42; // radians off the shaft — a touch wider than a pen nib
  const hx1 = x2 - head * Math.cos(ang - spread);
  const hy1 = y2 - head * Math.sin(ang - spread);
  const hx2 = x2 - head * Math.cos(ang + spread);
  const hy2 = y2 - head * Math.sin(ang + spread);
  return `M ${x1} ${y1} L ${x2} ${y2} M ${hx1} ${hy1} L ${x2} ${y2} L ${hx2} ${hy2}`;
}

// The parts a shape is drawn from, inside a w×h box at the origin.
//
// The switch is EXHAUSTIVE over ShapeKind with no `default`, on purpose: adding
// a kind without drawing it should be a compile error, not a shape that renders
// blank on a child's page. Keep it that way.
export function shapeParts({ shape, w, h, flip }: ShapeGeom): ShapePart[] {
  switch (shape) {
    case "rect":
      return [{ d: roundRectPath(w, h, Math.min(w, h) * 0.06), role: "outline" }];
    case "ellipse":
      return [
        {
          d: `M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`,
          role: "outline",
        },
      ];
    case "triangle":
      return [{ d: `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`, role: "outline" }];
    case "star":
      return [{ d: starPath(w, h), role: "outline" }];
    case "speech":
      return [{ d: speechPath(w, h), role: "outline" }];
    case "line":
      return [{ d: linePath(w, h, flip), role: "outline" }];
    case "arrow":
      return [{ d: arrowPath(w, h, flip), role: "outline" }];
  }
}

// Which fill rule an outline is filled with. Only shapes built from concentric
// subpaths (a ring's hole) need "evenodd"; everything else keeps the Canvas /
// SVG default. Both renderers must consult this or a hole fills in on hand-in
// but not on screen.
export function shapeFillRule(shape: ShapeKind): "evenodd" | "nonzero" {
  switch (shape) {
    case "rect":
    case "ellipse":
    case "triangle":
    case "star":
    case "speech":
    case "line":
    case "arrow":
      return "nonzero";
  }
}

// The proportion this shape must keep when resized, or null to resize freely.
//
// This asks a question about the OBJECT, not the kind, because the same kind
// can mean different things: a plain circle should stretch into an oval, and a
// place-value counter must stay round, but both are "ellipse". Today nothing
// declares a lock, so every shape resizes exactly as it does now.
export function shapeAspect(_o: ShapeGeom): number | null {
  return null;
}

// The usable area for a label inside each shape, so text stays within the
// visible shape rather than its bounding box. Relative to the shape's origin.
// Exhaustive over ShapeKind for the same reason as shapeParts.
export function shapeInnerBox(kind: ShapeKind, w: number, h: number) {
  switch (kind) {
    case "rect":
      return { x: 0.07 * w, y: 0.08 * h, w: 0.86 * w, h: 0.84 * h };
    case "ellipse":
      return { x: 0.16 * w, y: 0.18 * h, w: 0.68 * w, h: 0.64 * h };
    case "triangle":
      return { x: 0.24 * w, y: 0.46 * h, w: 0.52 * w, h: 0.46 * h };
    case "star":
      return { x: 0.31 * w, y: 0.36 * h, w: 0.38 * w, h: 0.34 * h };
    case "speech":
      return { x: 0.12 * w, y: 0.12 * h, w: 0.76 * w, h: 0.5 * h };
    // A vector has no inside. A label on one sits in the middle of its box, so
    // a number-line arrow can still be captioned without the text landing off
    // the end of the stroke.
    case "line":
    case "arrow":
      return { x: 0.15 * w, y: 0.15 * h, w: 0.7 * w, h: 0.7 * h };
  }
}

// ---------------------------------------------------------------------------
// Kits — the toolbox registry
// ---------------------------------------------------------------------------
//
// The ＋ fan offers KITS, not a flat list of shapes. Today there is one, so the
// canvas looks exactly as it did; the structure exists so that a maths kit (and
// later a diagrams or writing kit) is a table entry rather than a refactor.
//
// A PRESET is a palette button. It names a kind and the defaults to place it
// with, which is how one parameterised kind can front many buttons — the same
// way a counter is an ellipse that arrives round and labelled.
export type ShapePreset = {
  // Stable id, used as a React key and as the palette button's test hook.
  id: string;
  kind: ShapeKind;
  // The button's visible tooltip AND its accessible name, so they cannot drift.
  label: string;
  w?: number;
  h?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  flip?: boolean;
  // This shape means something at a fixed proportion (a hundred flat is square
  // or it is not a hundred), so lock its aspect on resize.
  lockAspect?: boolean;
};

export type ShapeGroup = {
  id: string;
  // Shown as the group heading, and as the tab label once a kit is big enough
  // to need tabs.
  label: string;
  presets: ShapePreset[];
};

export type KitId = "shapes" | "maths" | "diagrams" | "writing";

export type Kit = {
  id: KitId;
  // The ＋ fan button's label.
  label: string;
  groups: ShapeGroup[];
};

// Today's five shapes, unchanged: same order, same labels, same sizes, same
// colours. `shapes.spec.ts` and `object-toolbar.spec.ts` drive these by
// accessible name and must keep passing without an edit.
const SHAPES_KIT: Kit = {
  id: "shapes",
  label: "Shapes",
  groups: [
    {
      id: "basic",
      label: "Shapes",
      presets: [
        { id: "rect", kind: "rect", label: "Rectangle" },
        { id: "ellipse", kind: "ellipse", label: "Circle", h: 280 },
        { id: "triangle", kind: "triangle", label: "Triangle" },
        { id: "star", kind: "star", label: "Star", h: 280 },
        { id: "speech", kind: "speech", label: "Speech bubble", h: 280 },
        // Vector kinds arrive as a wide, shallow box, which reads as a
        // horizontal rule — a number line or a table rule — rather than as a
        // diagonal. Drag the corner up for a diagonal, or use Flip.
        { id: "line", kind: "line", label: "Line", h: 4, fill: "none" },
        { id: "arrow", kind: "arrow", label: "Arrow", h: 4, fill: "none" },
      ],
    },
  ],
};

export const KITS: Kit[] = [SHAPES_KIT];

// Every kit that exists. Teacher-facing canvases pass this: an adult chooses
// what goes in front of a class, and a template is not bound to one age, so a
// Reception teacher gets the same toolbox as a Year 6 one.
export const ALL_KITS: KitId[] = ["shapes", "maths", "diagrams", "writing"];

// The smallest toolbox. The default for any canvas that does not say otherwise,
// so a call site that forgets to pass `kits` offers less rather than more
// (SAFEGUARDING rule 8, deny by default).
export const BASE_KITS: KitId[] = ["shapes"];

// The kits to show, in registry order, filtered to those the caller allows.
// Unknown ids in `allowed` are ignored rather than throwing: a canvas asking for
// a kit that does not exist yet should render the ones that do.
export function kitsToShow(allowed: KitId[]): Kit[] {
  return KITS.filter((k) => allowed.includes(k.id));
}

// The defaults a shape is placed with when its preset does not override them.
export const SHAPE_DEFAULTS = {
  w: 320,
  h: 220,
  fill: "#93c5fd",
  stroke: "#1f2430",
  strokeWidth: 6,
} as const;
