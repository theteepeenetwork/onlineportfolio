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
  | "arrow"
  | "arrow-double"
  | "arrow-jump"
  | "brace"
  // Parameterised kinds. These are the reason the catalogue is a registry of
  // presets rather than one kind per button: a base-10 ten rod, a hundred flat,
  // a ten frame, a hundred square, a fraction bar, a Carroll diagram, a
  // multiplication array and a plain table are all ONE drawing — a rectangle
  // divided cols × rows. Writing each as its own kind would mean twenty entries
  // in SHAPE_KINDS, twenty cases in three switches, and a code change every
  // time a teacher wanted sixths.
  | "grid"
  | "pie"
  | "ring"
  | "cube"
  | "clock"
  // A ruled number line: an axis, equally spaced ticks, and the numbers under
  // them. Its start and its interval are settings, so 0–10 in ones and 0–100 in
  // tens are the same drawing with different numbers.
  // A regular polygon. One drawing for a pentagon, a hexagon and an octagon,
  // because they differ by a single number — and that number is a setting, so a
  // nonagon needs no new button and no release.
  | "polygon"
  | "numberline"
  // The four operators, as one drawing with a switch. They are a family a
  // teacher moves between — an addition worksheet becomes a subtraction one —
  // so the symbol is a setting on the placed shape rather than four kinds that
  // cannot be changed into one another.
  | "operator";

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
  "arrow-double",
  "arrow-jump",
  "brace",
  "grid",
  "pie",
  "ring",
  "cube",
  "clock",
  "polygon",
  "numberline",
  "operator",
];

// Kinds drawn as a stroke from one corner of their box to the other, rather
// than as an area filling it.
//
// They need two floors relaxed. A number line, an axis or a table rule is a box
// a couple of units tall, and both the resize floor (24) and the stored minimum
// width (8) would round that back into a square. Relaxing those for AREA shapes
// would let a child lose a rectangle by squashing it to nothing, so the relaxed
// floor is scoped to exactly these kinds.
export const VECTOR_KINDS: ShapeKind[] = ["line", "arrow", "arrow-double"];

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
  // grid: how many columns and rows it is divided into.
  cols?: number;
  rows?: number;
  // pie / ring / clock: how many equal parts the circle is divided into.
  parts?: number;
  // ring: the band, as a percentage of the radius.
  thickness?: number;
  // clock: whether the numerals 1–12 are drawn.
  // numberline: whether the numbers are printed under the ticks. Off is a blank
  // line for a child to label, which is a worksheet in its own right.
  numerals?: boolean;
  // numberline: the number under the first tick, and the interval between one
  // tick and the next. `parts` carries how many segments it is cut into, so the
  // last number is start + parts * step.
  start?: number;
  step?: number;
  // operator: which of the four it draws.
  operator?: OperatorKind;
  // polygon: how many sides. A triangle and a square already have their own
  // buttons, so this starts where the named ones stop being obvious.
  sides?: number;
  // Set by the palette preset when the shape only means what it means at a
  // fixed proportion. See shapeAspect.
  lockAspect?: boolean;
};

// The four operators a primary maths worksheet is built from.
export type OperatorKind = "add" | "subtract" | "multiply" | "divide";

export const OPERATOR_KINDS: OperatorKind[] = ["add", "subtract", "multiply", "divide"];

// What each one is called where a child or a screen reader meets it. Words, not
// glyphs: "×" read aloud is not reliably "times".
export const OPERATOR_LABEL: Record<OperatorKind, string> = {
  add: "Add",
  subtract: "Subtract",
  multiply: "Multiply",
  divide: "Divide",
};

export function clampOperator(v: unknown): OperatorKind {
  return OPERATOR_KINDS.includes(v as OperatorKind) ? (v as OperatorKind) : "add";
}

// Parameter bounds. Shared with normalizeObject so the validator and the
// geometry agree on what is drawable — a grid of 0 columns is a divide-by-zero
// and a grid of 500 is an unreadable smear.
export const MIN_PARTS = 2;
export const MAX_PARTS = 24;
export const MIN_DIVISIONS = 1;
export const MAX_DIVISIONS = 20;

export function clampParts(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : MIN_PARTS;
  return Math.min(MAX_PARTS, Math.max(MIN_PARTS, n));
}

export function clampDivisions(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : MIN_DIVISIONS;
  return Math.min(MAX_DIVISIONS, Math.max(MIN_DIVISIONS, n));
}

// A number line's first number and its interval. Whole numbers only: a line
// labelled in halves is a line in ones with a different interval, and decimals
// on a stepper are a lot of taps for a number nobody asked for. The start may
// be negative — a line either side of zero is the point of one.
export const MIN_LINE_START = -1000;
export const MAX_LINE_START = 1000;
export const MIN_LINE_STEP = 1;
export const MAX_LINE_STEP = 100;
export const DEFAULT_LINE_STEP = 1;

// A polygon's sides. Three is the floor because two is not a shape; twelve is
// the ceiling because past it a regular polygon is a circle a child has been
// made to count.
export const MIN_SIDES = 3;
export const MAX_SIDES = 12;

export function clampSides(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 5;
  return Math.min(MAX_SIDES, Math.max(MIN_SIDES, n));
}

export function clampLineStart(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
  return Math.min(MAX_LINE_START, Math.max(MIN_LINE_START, n));
}

export function clampLineStep(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : DEFAULT_LINE_STEP;
  return Math.min(MAX_LINE_STEP, Math.max(MIN_LINE_STEP, n));
}

// Path strings are stored in the DOM and re-serialised on every render, so keep
// the numbers short. Two decimal places is finer than a pixel at any size the
// canvas is ever drawn at.
function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

function roundRectPath(w: number, h: number, r: number) {
  return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
}

// A regular polygon inscribed in the box, point UP.
//
// Point up rather than flat-bottomed because that is how a pentagon and a
// hexagon are drawn in every primary book — and it means a shape stretched into
// a wide box still reads as itself, since every vertex scales with the box
// rather than only the ones on one edge.
function polygonPath(w: number, h: number, sides: number) {
  const count = clampSides(sides);
  const cx = w / 2;
  const cy = h / 2;
  let d = "";
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    d += `${i === 0 ? "M" : "L"} ${n(cx + Math.cos(a) * (w / 2))} ${n(cy + Math.sin(a) * (h / 2))} `;
  }
  return `${d}Z`;
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

// A straight rule, corner to corner of its box. Just the stroke — never an
// area, so its preset carries fill: "none" and the renderer is not asked to
// guess. Any angle other than the box's own diagonal comes from rotation.
function linePath(w: number, h: number) {
  return `M 0 0 L ${n(w)} ${n(h)}`;
}

// A straight rule with a head on the far end. The head is drawn as two strokes
// rather than a filled triangle so it inherits the line's colour and weight and
// stays legible when a child recolours it.
function arrowPath(w: number, h: number) {
  const x1 = 0;
  const y1 = 0;
  const x2 = w;
  const y2 = h;
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


// --- Parameterised apparatus ----------------------------------------------

// A rectangle divided into cols × rows. The outline is the box; every internal
// division is a DETAIL part, so a hundred flat draws as a firm square full of
// hairlines rather than a smear of equally-heavy lines.
function gridParts(w: number, h: number, cols: number, rows: number): ShapePart[] {
  const parts: ShapePart[] = [{ d: `M 0 0 H ${n(w)} V ${n(h)} H 0 Z`, role: "outline" }];
  const rules: string[] = [];
  for (let i = 1; i < cols; i++) {
    const x = (i * w) / cols;
    rules.push(`M ${n(x)} 0 V ${n(h)}`);
  }
  for (let j = 1; j < rows; j++) {
    const y = (j * h) / rows;
    rules.push(`M 0 ${n(y)} H ${n(w)}`);
  }
  if (rules.length) parts.push({ d: rules.join(" "), role: "detail" });
  return parts;
}

// An ellipse as two arcs, used by the circle, the pie and both rings.
function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  return `M ${n(cx - rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)} Z`;
}

// A circle cut into equal parts by radii — fraction circles, and the pie-chart
// frame. Radii are details, so the rim stays the strong line.
function piePartsPath(w: number, h: number, parts: number): ShapePart[] {
  const cx = w / 2;
  const cy = h / 2;
  const out: ShapePart[] = [{ d: ellipsePath(cx, cy, w / 2, h / 2), role: "outline" }];
  if (parts >= 2) {
    const cuts: string[] = [];
    for (let i = 0; i < parts; i++) {
      // From twelve o'clock, clockwise — the direction a child reads a circle.
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / parts;
      cuts.push(`M ${n(cx)} ${n(cy)} L ${n(cx + Math.cos(a) * (w / 2))} ${n(cy + Math.sin(a) * (h / 2))}`);
    }
    out.push({ d: cuts.join(" "), role: "detail" });
  }
  return out;
}

// A ring's band, as a percentage of its radius. A sorting hoop wants a thin
// band and a fraction ring a fat one, so it is per-object rather than a
// constant everyone lives with. 45% is the old fixed value, kept as the default
// so existing rings are unchanged.
export const MIN_RING_THICKNESS = 10;
export const MAX_RING_THICKNESS = 90;
export const DEFAULT_RING_THICKNESS = 45;

export function clampThickness(v: unknown): number {
  const t = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : DEFAULT_RING_THICKNESS;
  return Math.min(MAX_RING_THICKNESS, Math.max(MIN_RING_THICKNESS, t));
}

// Thickness is what the teacher sets, because it is what they can see. The
// geometry needs the hole, which is its complement.
function ringInner(thickness: number | undefined): number {
  return (100 - clampThickness(thickness ?? DEFAULT_RING_THICKNESS)) / 100;
}

// A true annulus: two concentric subpaths in ONE outline path, filled with the
// even-odd rule so the middle stays transparent rather than being painted over
// whatever is underneath. Both renderers must use shapeFillRule for this, or
// the hole survives on screen and fills in on hand-in.
function ringParts(w: number, h: number, parts: number, thickness?: number): ShapePart[] {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const inner = ringInner(thickness);
  const out: ShapePart[] = [
    {
      d: `${ellipsePath(cx, cy, rx, ry)} ${ellipsePath(cx, cy, rx * inner, ry * inner)}`,
      role: "outline",
    },
  ];
  if (parts >= 2) {
    const cuts: string[] = [];
    for (let i = 0; i < parts; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / parts;
      const c = Math.cos(a);
      const si = Math.sin(a);
      // Only across the band — a radius through the hole would draw a spoke
      // where there is deliberately nothing.
      cuts.push(
        `M ${n(cx + c * rx * inner)} ${n(cy + si * ry * inner)} L ${n(cx + c * rx)} ${n(cy + si * ry)}`,
      );
    }
    out.push({ d: cuts.join(" "), role: "detail" });
  }
  return out;
}

// The base-10 thousand: the one piece of apparatus that is genuinely a solid,
// so it is drawn as a cube in oblique projection rather than flat. Three faces,
// each a closed subpath, with a 10×10 grid on the front and matching rulings on
// the two visible sides so it still reads as a thousand ones.
function cubeParts(w: number, h: number): ShapePart[] {
  const d = Math.min(w, h) * 0.26; // how far the back of the cube is offset
  const fw = w - d; // front face width
  const fh = h - d; // front face height
  const top = d;    // y of the front face's top edge

  const front = `M 0 ${n(top)} H ${n(fw)} V ${n(h)} H 0 Z`;
  const lid = `M 0 ${n(top)} L ${n(d)} 0 H ${n(w)} L ${n(fw)} ${n(top)} Z`;
  const side = `M ${n(fw)} ${n(top)} L ${n(w)} 0 V ${n(fh)} L ${n(fw)} ${n(h)} Z`;

  const rules: string[] = [];
  const N = 10;
  for (let i = 1; i < N; i++) {
    // Front face.
    rules.push(`M ${n((i * fw) / N)} ${n(top)} V ${n(h)}`);
    rules.push(`M 0 ${n(top + (i * fh) / N)} H ${n(fw)}`);
    // The two receding faces share the same offset, so one ratio drives both.
    const t = i / N;
    rules.push(`M ${n(t * d)} ${n(top - t * top)} L ${n(fw + t * d)} ${n(top - t * top)}`);
    rules.push(`M ${n(fw + t * d)} ${n(top - t * top)} L ${n(fw + t * d)} ${n(h - t * top)}`);
  }

  return [
    { d: `${front} ${lid} ${side}`, role: "outline" },
    { d: rules.join(" "), role: "detail" },
  ];
}

// A blank analogue clock face: rim plus twelve hour ticks, drawn INSIDE the rim
// rather than as radii, because a circle cut by twelve full radii reads as a
// pie chart and not as a clock.
//
// Deliberately has no numerals. Drawing text inside a shape would mean
// extending the part contract past paths, and a blank face a child numbers and
// draws the hands onto is a standard worksheet in its own right — it is what
// makes this need no rotation.
// A clock face has twelve hours. Not a parameter — see shapeParts.
export const CLOCK_HOURS = 12;

// Text drawn INSIDE a shape as part of its geometry — currently only a clock's
// numerals. Deliberately a second function rather than a variant of ShapePart:
// a mark carries a size and a position and no stroke or fill rule, and folding
// it into ShapePart would make every kind carry fields one of them uses.
//
// Positions are in the same w×h box at the origin that shapeParts uses, and
// `size` is a font size in the same units, so both renderers can draw these the
// same way they draw everything else.
export type ShapeTextMark = { x: number; y: number; text: string; size: number };

export function shapeTextMarks(o: ShapeGeom): ShapeTextMark[] {
  if (o.shape === "numberline") {
    const { segs, size, x0, span, axisY, tick, showNumbers } = numberLineLayout(o);
    if (!showNumbers) return [];
    const start = clampLineStart(o.start);
    const step = clampLineStep(o.step);
    const marks: ShapeTextMark[] = [];
    for (let i = 0; i <= segs; i++) {
      marks.push({
        x: x0 + (i * span) / segs,
        y: axisY + tick + size * 0.62,
        text: String(start + i * step),
        size,
      });
    }
    return marks;
  }
  if (o.shape !== "clock" || !o.numerals) return [];
  const { w, h } = o;
  const cx = w / 2;
  const cy = h / 2;
  // Inside the hour ticks, which stop at 0.82 of the radius.
  const r = 0.66;
  const size = Math.min(w, h) * 0.13;
  const marks: ShapeTextMark[] = [];
  for (let i = 1; i <= CLOCK_HOURS; i++) {
    // 12 sits at the top, and the numbers run clockwise from there.
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / CLOCK_HOURS;
    marks.push({
      x: cx + Math.cos(a) * (w / 2) * r,
      y: cy + Math.sin(a) * (h / 2) * r,
      text: String(i),
      size,
    });
  }
  return marks;
}

// --- The number line -------------------------------------------------------
//
// One layout function, used by BOTH the ticks and the numbers under them,
// because a tick and its label that disagree about where the tick is are worse
// than either being slightly off. Everything is derived from the box, so a
// stretched line stays a number line rather than becoming a ruler with the
// numbers left behind.
// Roughly how wide one digit is, as a fraction of the font size, in the face
// this canvas draws with. Used to size the numbers so they cannot collide.
const DIGIT_RATIO = 0.62;
// The clear space wanted between one number and the next, as a fraction of the
// number's own width.
//
// 0.2 was enough to stop "90" and "100" touching, which is not the same as
// their reading as two numbers: at twenty segments the line still came out as
// one long run of digits. The numbers are smaller at 0.4 — that is the trade,
// and it is the right way round, because a number a child cannot separate from
// its neighbour is no more use for being large.
const LABEL_GAP = 0.4;

export function numberLineLayout(o: ShapeGeom) {
  const { w, h } = o;
  const segs = clampParts(o.parts);
  const showNumbers = o.numerals !== false;
  // The numbers have to fit BETWEEN two ticks, and how much room one needs
  // depends on how many DIGITS it has, not just on how many there are. Sized
  // off the segment count alone, a line counting to a hundred ran "90" into
  // "100" and read as ninety thousand one hundred.
  //
  // The widest label is at one end or the other, because the values run
  // monotonically and a longer string means a bigger magnitude. So: with a
  // label of `chars` digits at font size S, one is S·DIGIT_RATIO·chars wide,
  // the axis is inset by half a label at each end, and every label plus its gap
  // has to fit one segment:
  //
  //   L·(1 + LABEL_GAP)·segs ≤ w − L   ⇒   L ≤ w / ((1 + LABEL_GAP)·segs + 1)
  //
  // which is the S below. Capped by the box height as well, so a short wide
  // line does not grow numbers taller than itself.
  const start = clampLineStart(o.start);
  const step = clampLineStep(o.step);
  const chars = Math.max(
    String(start).length,
    String(start + segs * step).length,
  );
  const widthCap = w / (((1 + LABEL_GAP) * segs + 1) * DIGIT_RATIO * chars);
  const size = showNumbers ? Math.max(1, Math.min(h * 0.3, widthCap)) : 0;
  // The first and last labels are centred on the end ticks, so half of each
  // would hang outside the box. Inset the axis by that half instead: the shape
  // then draws entirely inside the box its corner controls are on.
  const pad = showNumbers ? Math.min(w * 0.2, (size * DIGIT_RATIO * chars) / 2) : 0;
  const x0 = pad;
  const span = Math.max(1, w - pad * 2);
  // Sits high when there are numbers under it, centred when there are not.
  const axisY = showNumbers ? h * 0.42 : h * 0.5;
  const tick = Math.min(h * 0.18, (span / segs) * 0.5);
  return { segs, size, x0, span, axisY, tick, showNumbers };
}

// The axis and its ticks, as ONE outline part. A number line's ticks are as
// much the apparatus as the rule they stand on — thinning them to "detail"
// weight the way a grid thins its division lines would leave the marks a child
// is counting fainter than the line they sit on.
function numberLineParts(o: ShapeGeom): ShapePart[] {
  const { segs, x0, span, axisY, tick } = numberLineLayout(o);
  const d = [`M ${n(x0)} ${n(axisY)} H ${n(x0 + span)}`];
  for (let i = 0; i <= segs; i++) {
    const x = x0 + (i * span) / segs;
    d.push(`M ${n(x)} ${n(axisY - tick)} V ${n(axisY + tick)}`);
  }
  return [{ d: d.join(" "), role: "outline" }];
}

// --- The operators ---------------------------------------------------------
//
// Drawn as filled outlines rather than as text, so they take the same fill and
// line a child sets on any other shape — which is the whole point of them being
// shapes and not a font, and is also what keeps them in the hand-in on a device
// with no such font installed. Every bar is sized from the SHORTER side of the
// box, so a symbol in a box that is not square stays a symbol instead of
// smearing.

// A polygon with its corners rounded off. Every operator except the divide's
// dots is a polygon — a cross, a turned cross, a bar — so one helper softens
// all of them rather than three hand-written paths with the arcs baked in, and
// the house radius stays one number instead of thirty coordinates.
function roundedPolygon(pts: [number, number][], r: number): string {
  const len = pts.length;
  let d = "";
  for (let i = 0; i < len; i++) {
    const prev = pts[(i - 1 + len) % len];
    const cur = pts[i];
    const next = pts[(i + 1) % len];
    const ax = cur[0] - prev[0];
    const ay = cur[1] - prev[1];
    const bx = next[0] - cur[0];
    const by = next[1] - cur[1];
    const la = Math.hypot(ax, ay) || 1;
    const lb = Math.hypot(bx, by) || 1;
    // Never past the midpoint of either edge, or a short edge's two corners
    // would round through each other and turn the arm into a pinch.
    const rr = Math.min(r, la / 2, lb / 2);
    const sx = cur[0] - (ax / la) * rr;
    const sy = cur[1] - (ay / la) * rr;
    const ex = cur[0] + (bx / lb) * rr;
    const ey = cur[1] + (by / lb) * rr;
    d += `${i === 0 ? "M" : "L"} ${n(sx)} ${n(sy)} Q ${n(cur[0])} ${n(cur[1])} ${n(ex)} ${n(ey)} `;
  }
  return `${d}Z`;
}

// The twelve corners of a cross, centred on the origin. A plus is this; a times
// is this turned an eighth of a turn, which is why both come from one list.
function crossPoints(arm: number, half: number): [number, number][] {
  return [
    [-half, -arm], [half, -arm], [half, -half], [arm, -half],
    [arm, half], [half, half], [half, arm], [-half, arm],
    [-half, half], [-arm, half], [-arm, -half], [-half, -half],
  ];
}

function operatorParts(o: ShapeGeom): ShapePart[] {
  const { w, h } = o;
  const cx = w / 2;
  const cy = h / 2;
  const kind = clampOperator(o.operator);
  const short = Math.min(w, h);
  // Half the thickness of a stroke of the symbol, and how far an arm reaches.
  const half = short * 0.12;
  const radius = short * 0.05;

  const bar = (halfW: number, halfH: number) =>
    roundedPolygon(
      [
        [cx - halfW, cy - halfH],
        [cx + halfW, cy - halfH],
        [cx + halfW, cy + halfH],
        [cx - halfW, cy + halfH],
      ],
      Math.min(radius, halfH * 0.8),
    );

  switch (kind) {
    case "subtract":
      // One bar, free to stretch: a long dash is a legitimate minus, so this is
      // the one operator that uses the box's own width rather than its short
      // side.
      return [{ d: bar(w * 0.42, Math.min(half, h * 0.42)), role: "outline" }];
    case "add": {
      // One path, not two overlapping bars: two bars would show a seam where
      // they cross, and fill each other's outline.
      const pts = crossPoints(short * 0.42, half).map(
        ([px, py]) => [cx + px, cy + py] as [number, number],
      );
      return [{ d: roundedPolygon(pts, radius), role: "outline" }];
    }
    case "multiply": {
      // The same cross at 45°, computed rather than transformed so it is one
      // path like the others and needs no transform in either renderer — the
      // export canvas and the SVG then draw identical geometry.
      const a = Math.PI / 4;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pts = crossPoints(short * 0.42, half).map(
        ([px, py]) => [cx + px * ca - py * sa, cy + px * sa + py * ca] as [number, number],
      );
      return [{ d: roundedPolygon(pts, radius), role: "outline" }];
    }
    case "divide": {
      // A bar between two dots. Three subpaths in ONE outline part, so they
      // fill and stroke together — the dots are the symbol, not decoration on
      // it.
      const dot = short * 0.1;
      const gap = short * 0.26;
      return [
        {
          d: [
            bar(short * 0.42, Math.min(half, h * 0.3)),
            ellipsePath(cx, cy - gap, dot, dot),
            ellipsePath(cx, cy + gap, dot, dot),
          ].join(" "),
          role: "outline",
        },
      ];
    }
  }
}

function clockParts(w: number, h: number, parts: number): ShapePart[] {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const ticks: string[] = [];
  for (let i = 0; i < parts; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / parts;
    const c = Math.cos(a);
    const si = Math.sin(a);
    ticks.push(
      `M ${n(cx + c * rx * 0.82)} ${n(cy + si * ry * 0.82)} L ${n(cx + c * rx * 0.95)} ${n(cy + si * ry * 0.95)}`,
    );
  }
  return [
    { d: ellipsePath(cx, cy, rx, ry), role: "outline" },
    { d: ticks.join(" "), role: "detail" },
  ];
}

// A number-line hop. An open curve, so it is stroke-only: its preset carries
// fill "none" rather than leaving the renderer to guess what filling an arc
// would even mean. The head sits on the tangent at the landing end, so it
// points the way the jump is going.
function jumpPath(w: number, h: number) {
  // Quadratic from one baseline end to the other; the control point is placed
  // so the apex touches the top of the box exactly. A hop the other way up is a
  // 180° rotation, not a second code path.
  const y0 = h;
  const ctrl = -h;
  const yEnd = y0;
  const arc = `M 0 ${n(y0)} Q ${n(w / 2)} ${n(ctrl)} ${n(w)} ${n(yEnd)}`;
  // Tangent at the end of a quadratic is P2 − P1.
  const tx = w / 2;
  const ty = yEnd - ctrl;
  const len = Math.hypot(tx, ty) || 1;
  const ang = Math.atan2(ty / len, tx / len);
  const head = Math.min(Math.hypot(w, h) * 0.16, 40);
  const spread = 0.45;
  const hx1 = w - head * Math.cos(ang - spread);
  const hy1 = yEnd - head * Math.sin(ang - spread);
  const hx2 = w - head * Math.cos(ang + spread);
  const hy2 = yEnd - head * Math.sin(ang + spread);
  return `${arc} M ${n(hx1)} ${n(hy1)} L ${n(w)} ${n(yEnd)} L ${n(hx2)} ${n(hy2)}`;
}

// A curly brace spanning the width — the bar-model bracket, and the part-whole
// grouping. Tip up by default; flip puts it under the thing it groups.
function bracePath(w: number, h: number) {
  const tip = 0;
  const arm = h;
  const mid = h / 2;
  return [
    `M 0 ${n(arm)}`,
    `C 0 ${n(mid)} ${n(w * 0.06)} ${n(mid)} ${n(w * 0.42)} ${n(mid)}`,
    `C ${n(w * 0.47)} ${n(mid)} ${n(w * 0.5)} ${n(mid)} ${n(w * 0.5)} ${n(tip)}`,
    `C ${n(w * 0.5)} ${n(mid)} ${n(w * 0.53)} ${n(mid)} ${n(w * 0.58)} ${n(mid)}`,
    `C ${n(w * 0.94)} ${n(mid)} ${n(w)} ${n(mid)} ${n(w)} ${n(arm)}`,
  ].join(" ");
}

// The same arrow pointing back the other way, so a double-headed arrow is two
// heads on one shaft rather than a second path helper.
function arrowPathReversed(w: number, h: number) {
  const len = Math.hypot(w, h) || 1;
  const head = Math.min(len * 0.28, 46);
  const ang = Math.atan2(-h, -w);
  const spread = 0.42;
  const hx1 = head * Math.cos(ang - spread);
  const hy1 = head * Math.sin(ang - spread);
  const hx2 = head * Math.cos(ang + spread);
  const hy2 = head * Math.sin(ang + spread);
  return `M ${n(hx1)} ${n(hy1)} L 0 0 L ${n(hx2)} ${n(hy2)}`;
}

// The parts a shape is drawn from, inside a w×h box at the origin.
//
// The switch is EXHAUSTIVE over ShapeKind with no `default`, on purpose: adding
// a kind without drawing it should be a compile error, not a shape that renders
// blank on a child's page. Keep it that way.
export function shapeParts(o: ShapeGeom): ShapePart[] {
  const { shape, w, h, cols, rows, parts, thickness } = o;
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
      return [{ d: linePath(w, h), role: "outline" }];
    case "arrow":
      return [{ d: arrowPath(w, h), role: "outline" }];
    case "arrow-double":
      // Both ends headed, so it reads as a span or a difference rather than as
      // a direction. Drawn as the arrow plus the arrow reversed.
      return [
        { d: `${arrowPath(w, h)} ${arrowPathReversed(w, h)}`, role: "outline" },
      ];
    case "arrow-jump":
      return [{ d: jumpPath(w, h), role: "outline" }];
    case "brace":
      return [{ d: bracePath(w, h), role: "outline" }];
    case "grid":
      return gridParts(w, h, clampDivisions(cols), clampDivisions(rows));
    case "pie":
      return piePartsPath(w, h, clampParts(parts));
    case "ring":
      // parts may legitimately be 1 — a plain ring with no divisions — so it is
      // not run through clampParts, whose floor is 2.
      return ringParts(w, h, parts && parts >= 2 ? clampParts(parts) : 1, thickness);
    case "cube":
      return cubeParts(w, h);
    case "clock":
      // Always twelve. A clock with seven hours is not a clock, so this is the
      // one circle whose divisions are not a setting.
      return clockParts(w, h, CLOCK_HOURS);
    case "polygon":
      return [{ d: polygonPath(w, h, o.sides ?? 5), role: "outline" }];
    case "numberline":
      return numberLineParts(o);
    case "operator":
      return operatorParts(o);
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
    case "arrow-double":
    case "arrow-jump":
    case "brace":
    case "grid":
    case "pie":
    case "cube":
    case "clock":
    case "polygon":
    case "numberline":
      return "nonzero";
    // A divide sign is a bar and two dots — three subpaths that must each read
    // as solid, which is what non-zero gives. Listed on its own so the next
    // operator added has to answer the question rather than inherit an answer.
    case "operator":
      return "nonzero";
    // The one shape built from concentric subpaths. Even-odd is what keeps the
    // middle transparent instead of painted.
    case "ring":
      return "evenodd";
  }
}

// The proportion this shape must keep when resized, or null to resize freely.
//
// This asks a question about the OBJECT, not the kind, because the same kind
// can mean different things: a plain circle should stretch into an oval, and a
// place-value counter must stay round, but both are "ellipse". Today nothing
// declares a lock, so every shape resizes exactly as it does now.
export function shapeAspect(o: ShapeGeom): number | null {
  if (!o.lockAspect) return null;
  // A grid's meaning IS its proportion: a hundred flat is ten unit squares by
  // ten, so the ratio it must hold is cols : rows. That also gives the ten rod
  // its 1 : 10 and the ten frame its 5 : 2, from the same one line.
  if (o.shape === "grid") {
    return clampDivisions(o.cols) / clampDivisions(o.rows);
  }
  // Everything else that locks is square — a counter, a fraction circle, a
  // ring, a thousand cube.
  return 1;
}

// The usable area for a label inside each shape, so text stays within the
// visible shape rather than its bounding box. Relative to the shape's origin.
// Exhaustive over ShapeKind for the same reason as shapeParts.
export function shapeInnerBox(kind: ShapeKind, w: number, h: number, thickness?: number) {
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
    case "arrow-double":
    case "arrow-jump":
    case "brace":
      return { x: 0.15 * w, y: 0.15 * h, w: 0.7 * w, h: 0.7 * h };
    // A grid's label sits across the whole box: on a fraction bar or a blank
    // array that is the caption for the whole thing, not for one cell.
    case "grid":
      return { x: 0.06 * w, y: 0.06 * h, w: 0.88 * w, h: 0.88 * h };
    // Inside the rim, like the circle.
    case "pie":
    case "clock":
      return { x: 0.16 * w, y: 0.18 * h, w: 0.68 * w, h: 0.64 * h };
    // A ring's usable area is the HOLE — a label written across the band would
    // sit on top of the very divisions it is describing.
    case "ring": {
      // Follows the band: a fat ring has a small hole to write in, a thin one a
      // large one. 0.86 keeps the text clear of the inner edge.
      const inner = ringInner(thickness) * 0.86;
      return {
        x: (0.5 - inner / 2) * w,
        y: (0.5 - inner / 2) * h,
        w: inner * w,
        h: inner * h,
      };
    }
    // The front face only, so a label doesn't run up over the receding top.
    case "cube":
      return { x: 0.08 * w, y: 0.34 * h, w: 0.56 * w, h: 0.56 * h };
    // A regular polygon's usable middle grows with its side count — a triangle
    // has far less room inside it than an octagon, which is nearly its own box.
    case "polygon":
      return { x: 0.26 * w, y: 0.3 * h, w: 0.48 * w, h: 0.44 * h };
    // Above the axis. The band under it belongs to the numbers, and a caption
    // written across them would be unreadable on top of the very thing it is
    // captioning.
    case "numberline":
      return { x: 0.06 * w, y: 0.01 * h, w: 0.88 * w, h: 0.26 * h };
    // An operator is a solid glyph with no inside worth writing in, so a label
    // on one sits across the whole box the way a vector's does.
    case "operator":
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
  cols?: number;
  rows?: number;
  parts?: number;
  thickness?: number;
  numerals?: boolean;
  start?: number;
  step?: number;
  operator?: OperatorKind;
  sides?: number;
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

// The shapes every child gets, at every age. The original five keep their order,
// labels, sizes and colours — `shapes.spec.ts` and `object-toolbar.spec.ts`
// drive them by accessible name and must keep passing without an edit.
//
// The line, the arrow and the ring live HERE rather than in the maths kit. None
// of them is apparatus: a line is a road, a table rule or an underline as often
// as it is a number line, an arrow points at things, and a ring is a hoop to
// sort into. The maths kit is a teacher's tool for BUILDING a worksheet, and
// what a child needs on the page arrives on the page — see `infinite`.
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
        // horizontal rule rather than a diagonal. Rotate for any other angle.
        { id: "line", kind: "line", label: "Line", w: 420, h: 4, fill: "none" },
        { id: "arrow", kind: "arrow", label: "Arrow", w: 360, h: 4, fill: "none" },
        // Three named polygons, and a Sides stepper on the placed shape for the
        // rest: a heptagon needs no fourth button.
        { id: "pentagon", kind: "polygon", label: "Pentagon", sides: 5, w: 280, h: 280 },
        { id: "hexagon", kind: "polygon", label: "Hexagon", sides: 6, w: 280, h: 280 },
        { id: "octagon", kind: "polygon", label: "Octagon", sides: 8, w: 280, h: 280 },
        { id: "ring", kind: "ring", label: "Ring", parts: 1, w: 280, h: 280, lockAspect: true },
      ],
    },
  ],
};


// --- The maths kit ---------------------------------------------------------
//
// Roughly thirty buttons over eight kinds. Every one is a preset: nothing here
// needed new geometry beyond the parameterised kinds above, which is the test
// the design was meant to pass.
//
// Colours. Place-value counters are colour-coded because that is how the
// apparatus works in a classroom — a child sorts by colour before they read the
// number. The two-colour pair is red/yellow, the common UK convention; some
// schemes use red/blue, and that is a one-line change here rather than anywhere
// else.
const COUNTER_ONE = "#8AB9D6";
const COUNTER_TEN = "#4E9C94";
const COUNTER_HUNDRED = "#F0B441";
const COUNTER_THOUSAND = "#C2476B";

// One base-10 unit, in model units. Everything in the place-value group is a
// multiple of it, so a ten rod really is ten ones long against a hundred flat.
const UNIT = 48;

// Apparatus for BUILDING a worksheet. Offered on the template builder and its
// preview only — not to children, and not on the canvas a teacher uses to add
// work on one child's behalf, because that canvas produces that child's own
// journal entry rather than a reusable template.
//
// Children need no place-value palette: a teacher marks a placed counter or
// base-10 block `infinite`, and a child drags as many as they need straight off
// the worksheet. That is how the physical apparatus works, and it is what makes
// taking this kit away from children cost them nothing.
const MATHS_KIT: Kit = {
  id: "maths",
  label: "Maths kit",
  groups: [
    {
      id: "number-line",
      label: "Number lines",
      presets: [
        // No plain line or arrow here: both are in Shapes, which a teacher also
        // has. Duplicating them would put two buttons with the same accessible
        // name in front of a screen reader, which the a11y gate refuses.
        { id: "m-arrow-double", kind: "arrow-double", label: "Double-headed arrow", w: 400, h: 4, fill: "none" },
        { id: "m-jump", kind: "arrow-jump", label: "Jump arrow", w: 300, h: 150, fill: "none" },
        { id: "m-brace", kind: "brace", label: "Brace", w: 400, h: 90, fill: "none" },
        // The ruled line the jumps and braces are drawn ONTO. ONE button, not a
        // row of them: its start, its segments and its interval are all set on
        // the placed shape, so 0–20, counting in tens and a blank line for a
        // child to label are the same button — a palette full of presets would
        // only be a slower way to reach the same three numbers. It arrives 0–10
        // in ones because that is the line a primary classroom draws most.
        // `fill: none` because an axis is a stroke; a filled number line means
        // nothing.
        { id: "m-line", kind: "numberline", label: "Number line", parts: 10, start: 0, step: 1, numerals: true, w: 700, h: 130, fill: "none" },
      ],
    },
    {
      id: "place-value",
      label: "Place value",
      presets: [
        { id: "m-b10-one", kind: "grid", label: "Base 10 one", cols: 1, rows: 1, w: UNIT, h: UNIT, lockAspect: true },
        { id: "m-b10-ten", kind: "grid", label: "Base 10 ten rod", cols: 1, rows: 10, w: UNIT, h: UNIT * 10, lockAspect: true },
        { id: "m-b10-hundred", kind: "grid", label: "Base 10 hundred flat", cols: 10, rows: 10, w: UNIT * 10, h: UNIT * 10, lockAspect: true },
        { id: "m-b10-thousand", kind: "cube", label: "Base 10 thousand cube", w: 420, h: 420, lockAspect: true },
        { id: "m-counter-1", kind: "ellipse", label: "Counter 1", text: "1", w: 120, h: 120, fill: COUNTER_ONE, lockAspect: true },
        { id: "m-counter-10", kind: "ellipse", label: "Counter 10", text: "10", w: 120, h: 120, fill: COUNTER_TEN, lockAspect: true },
        { id: "m-counter-100", kind: "ellipse", label: "Counter 100", text: "100", w: 120, h: 120, fill: COUNTER_HUNDRED, lockAspect: true },
        { id: "m-counter-1000", kind: "ellipse", label: "Counter 1000", text: "1000", w: 120, h: 120, fill: COUNTER_THOUSAND, lockAspect: true },
        { id: "m-counter-blank", kind: "ellipse", label: "Blank counter", w: 120, h: 120, fill: "#FFFDF7", lockAspect: true },
        { id: "m-counter-red", kind: "ellipse", label: "Red counter", w: 120, h: 120, fill: "#C2476B", lockAspect: true },
        { id: "m-counter-yellow", kind: "ellipse", label: "Yellow counter", w: 120, h: 120, fill: "#F0B441", lockAspect: true },
      ],
    },
    {
      id: "frames",
      label: "Frames & arrays",
      presets: [
        { id: "m-ten-frame", kind: "grid", label: "Ten frame", cols: 5, rows: 2, w: 500, h: 200, lockAspect: true },
        { id: "m-double-ten-frame", kind: "grid", label: "Double ten frame", cols: 5, rows: 4, w: 500, h: 400, lockAspect: true },
        { id: "m-hundred-square", kind: "grid", label: "Hundred square", cols: 10, rows: 10, w: 480, h: 480, lockAspect: true },
        // Deliberately NOT aspect-locked: an array is meant to be reshaped, and
        // its rows and columns are set from the object toolbar.
        { id: "m-array", kind: "grid", label: "Array", cols: 4, rows: 3, w: 400, h: 300 },
      ],
    },
    {
      id: "fractions",
      label: "Fractions",
      presets: [
        // Common denominators as buttons; anything else comes off the parts /
        // columns stepper on the selected shape, so a teacher who wants ninths
        // is not waiting on a release.
        { id: "m-bar-2", kind: "grid", label: "Fraction bar in halves", cols: 2, rows: 1, w: 600, h: 140 },
        { id: "m-bar-4", kind: "grid", label: "Fraction bar in quarters", cols: 4, rows: 1, w: 600, h: 140 },
        { id: "m-bar-8", kind: "grid", label: "Fraction bar in eighths", cols: 8, rows: 1, w: 600, h: 140 },
        { id: "m-pie-2", kind: "pie", label: "Fraction circle in halves", parts: 2, w: 300, h: 300, lockAspect: true },
        { id: "m-pie-4", kind: "pie", label: "Fraction circle in quarters", parts: 4, w: 300, h: 300, lockAspect: true },
        // The plain ring is in Shapes; this is the one that is actually about
        // fractions. Any other denominator comes off the parts stepper.
        { id: "m-ring-4", kind: "ring", label: "Fraction ring in quarters", parts: 4, w: 300, h: 300, lockAspect: true },
      ],
    },
    {
      id: "measure",
      label: "Shape & measure",
      presets: [
        { id: "m-clock", kind: "clock", label: "Clock face", numerals: true, w: 320, h: 320, fill: "#FFFDF7", lockAspect: true },
      ],
    },
    {
      id: "operators",
      label: "Signs",
      // Shapes, not letters, so a child sets their fill and line exactly as
      // they would on a circle — and so they land in the hand-in as geometry
      // rather than as a font that may not be installed. Square boxes: these
      // are glyphs, and a stretched one stops reading as its sign.
      presets: [
        { id: "m-op-add", kind: "operator", operator: "add", label: "Add sign", w: 180, h: 180, fill: "#FBEED3" },
        { id: "m-op-subtract", kind: "operator", operator: "subtract", label: "Subtract sign", w: 180, h: 180, fill: "#E2725B" },
        { id: "m-op-multiply", kind: "operator", operator: "multiply", label: "Multiply sign", w: 180, h: 180, fill: "#8FBDB2" },
        { id: "m-op-divide", kind: "operator", operator: "divide", label: "Divide sign", w: 180, h: 180, fill: "#F0B441" },
      ],
    },
  ],
};

export const KITS: Kit[] = [SHAPES_KIT, MATHS_KIT];

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
