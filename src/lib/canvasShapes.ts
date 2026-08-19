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

export type ShapeKind = "rect" | "ellipse" | "triangle" | "star" | "speech";

// The validation gate. `normalizeObject` coerces anything not in this array to
// "rect", so a kind is not real until it is listed here.
export const SHAPE_KINDS: ShapeKind[] = ["rect", "ellipse", "triangle", "star", "speech"];

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

// The parts a shape is drawn from, inside a w×h box at the origin.
//
// The switch is EXHAUSTIVE over ShapeKind with no `default`, on purpose: adding
// a kind without drawing it should be a compile error, not a shape that renders
// blank on a child's page. Keep it that way.
export function shapeParts({ shape, w, h }: ShapeGeom): ShapePart[] {
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
